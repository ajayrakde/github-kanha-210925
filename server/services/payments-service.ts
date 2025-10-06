/**
 * TASK 5: PaymentsService - Main orchestrator for payment operations
 * 
 * This service provides a unified interface for all payment operations,
 * handling provider selection, fallbacks, idempotency, and state management.
 */

import type { 
  PaymentProvider, 
  Environment 
} from "../../shared/payment-providers";

import type {
  CreatePaymentParams,
  PaymentResult,
  VerifyPaymentParams,
  CreateRefundParams,
  RefundResult,
  PaymentServiceConfig,
  PaymentEvent,
  HealthCheckResult,
  PaymentLifecycleStatus,
  PaymentStatus,
  Currency,
  PaymentMethod,
} from "../../shared/payment-types";

import { adapterFactory } from "./adapter-factory";
import { idempotencyService } from "./idempotency-service";
import {
  PaymentError,
  RefundError,
  ConfigurationError,
  normalizePaymentLifecycleStatus,
  canTransitionPaymentLifecycle,
} from "../../shared/payment-types";
import { db } from "../db";
import { payments, refunds, paymentEvents, orders } from "../../shared/schema";
import {
  maskPhonePeVirtualPaymentAddress,
  maskPhonePeUtr,
  normalizeUpiInstrumentVariant,
} from "../../shared/upi";
import { eq, and, sql, or, inArray, gt } from "drizzle-orm";
import crypto from "crypto";

/**
 * Main payments service orchestrating all payment operations
 */
export class PaymentsService {
  private static instances = new Map<string, PaymentsService>();
  private static readonly upiCaptureStatuses = [
    "captured",
    "completed",
    "COMPLETED",
    "succeeded",
    "success",
    "paid",
  ];
  
  private constructor(
    private config: PaymentServiceConfig
  ) {}
  
  public static getInstance(config: PaymentServiceConfig): PaymentsService {
    const key = JSON.stringify({
      environment: config.environment,
      defaultProvider: config.defaultProvider,
      fallbackProviders: config.fallbackProviders,
    });

    if (!PaymentsService.instances.has(key)) {
      PaymentsService.instances.set(key, new PaymentsService(config));
    }

    return PaymentsService.instances.get(key)!;
  }
  
  /**
   * Create a new payment with idempotency protection
   */
  public async createPayment(
    params: CreatePaymentParams,
    tenantId: string,
    preferredProvider?: PaymentProvider,
    options?: { idempotencyKeyOverride?: string }
  ): Promise<PaymentResult> {
    // Generate idempotency key if not provided
    const idempotencyKey = options?.idempotencyKeyOverride
      || params.idempotencyKey
      || idempotencyService.generateKey('payment');

    const resolvedTenantId = tenantId || params.tenantId || 'default';
    
    // Execute with idempotency protection
    return await idempotencyService.executeWithIdempotency(
      idempotencyKey,
      'create_payment',
      async () => {
        try {
          const existingUpiCapture = await this.findCapturedUpiPayment(
            params.orderId,
            resolvedTenantId
          );

          if (existingUpiCapture) {
            throw new PaymentError(
              "A UPI payment has already been captured for this order",
              "UPI_PAYMENT_ALREADY_CAPTURED"
            );
          }

          // Determine provider to use
          const provider = preferredProvider || this.config.defaultProvider;
          
          let adapter;
          if (provider) {
            adapter = await adapterFactory.getAdapterWithFallback(provider, this.config.environment, resolvedTenantId);
          } else {
            adapter = await adapterFactory.getPrimaryAdapter(this.config.environment, resolvedTenantId);
          }
          
          if (!adapter) {
            throw new ConfigurationError(
              `No payment providers available for ${this.config.environment} environment`
            );
          }
          
          // Add service-level configurations
          const enrichedParams: CreatePaymentParams = {
            ...params,
            idempotencyKey,
            successUrl: params.successUrl || this.getDefaultSuccessUrl(),
            failureUrl: params.failureUrl || this.getDefaultFailureUrl(),
            metadata: {
              ...params.metadata,
              serviceVersion: '1.0.0',
              environment: this.config.environment,
            },
          };
          
          // Create payment through adapter with transaction safety
          const result = await this.executeWithRetry(
            () => adapter.createPayment(enrichedParams),
            this.config.retryAttempts || 3
          );
          
          const providerMetadata = this.extractProviderMetadata(
            result.providerData,
            adapter.provider
          );

          // Store payment and log event in transaction
          await db.transaction(async (trx) => {
            // Store payment
            await trx.insert(payments).values({
              id: result.paymentId,
              tenantId: resolvedTenantId,
              orderId: params.orderId,
              provider: adapter.provider,
              environment: this.config.environment,
              providerPaymentId: result.providerPaymentId,
              providerOrderId: result.providerOrderId,
              providerTransactionId: providerMetadata.providerTransactionId,
              providerReferenceId: providerMetadata.providerReferenceId,
              amountAuthorizedMinor: result.amount,
              currency: result.currency,
              status: PaymentsService.toStorageStatus(result.status),
              methodKind: result.method?.type,
              methodBrand: result.method?.brand,
              last4: result.method?.last4,
              upiPayerHandle: providerMetadata.upiPayerHandle,
              upiUtr: providerMetadata.upiUtr,
              upiInstrumentVariant: providerMetadata.upiInstrumentVariant,
              receiptUrl: providerMetadata.receiptUrl,
              createdAt: result.createdAt,
              updatedAt: result.updatedAt || result.createdAt,
            });
            
            // Log payment event
            await trx.insert(paymentEvents).values({
              id: crypto.randomUUID(),
              tenantId: resolvedTenantId,
              paymentId: result.paymentId,
              provider: adapter.provider,
              type: 'payment_created',
              data: {
                amount: result.amount,
                currency: result.currency,
                method: result.method,
                orderId: params.orderId,
              },
              occurredAt: result.createdAt,
            });
          });
          
          return result;

        } catch (error) {
          console.error('Payment creation failed:', error);

          if (error instanceof PaymentError && error.code === 'UPI_PAYMENT_ALREADY_CAPTURED') {
            throw error;
          }

          throw new PaymentError(
            'Failed to create payment',
            'PAYMENT_CREATION_FAILED',
            preferredProvider,
            error
          );
        }
      }
    );
  }
  
  /**
   * Verify a payment
   */
  public async verifyPayment(params: VerifyPaymentParams, tenantId: string): Promise<PaymentResult> {
    try {
      // Get payment from database to determine provider
      const resolvedTenantId = tenantId || 'default';
      const payment = await this.getStoredPayment(params.paymentId, resolvedTenantId);
      if (!payment) {
        throw new PaymentError('Payment not found', 'PAYMENT_NOT_FOUND');
      }

      // If payment hasn't been initiated with provider yet (no providerPaymentId or providerOrderId),
      // just return the local payment status without calling the provider
      if (!payment.providerPaymentId && !payment.providerOrderId) {
        // Return local payment status for pending payments
        return {
          paymentId: payment.id,
          providerPaymentId: payment.providerPaymentId || undefined,
          providerOrderId: payment.providerOrderId || undefined,
          status: payment.status as PaymentStatus,
          amount: Number(payment.amountAuthorizedMinor || 0),
          currency: (payment.currency as Currency) || 'INR',
          provider: payment.provider as PaymentProvider,
          environment: this.config.environment,
          method: payment.methodKind ? { type: payment.methodKind as PaymentMethod } : undefined,
          createdAt: payment.createdAt || new Date(),
          updatedAt: payment.updatedAt || new Date(),
        };
      }

      // Get adapter for the provider
      const adapter = await adapterFactory.createAdapter(
        payment.provider as PaymentProvider,
        this.config.environment,
        resolvedTenantId
      );

      // Verify payment through adapter using providerOrderId (for Cashfree) or providerPaymentId
      const verifyParams: VerifyPaymentParams = {
        paymentId: params.paymentId,
        providerPaymentId: payment.providerPaymentId || payment.providerOrderId || undefined,
      };

      const result = await adapter.verifyPayment(verifyParams);

      // Update payment in database
      await this.updateStoredPayment(result, resolvedTenantId, {
        id: crypto.randomUUID(),
        tenantId: resolvedTenantId,
        paymentId: result.paymentId,
        provider: adapter.provider,
        environment: this.config.environment,
        type: 'payment_verified',
        status: result.status,
        data: {
          previousStatus: payment.status,
          newStatus: result.status,
          method: result.method,
        },
        timestamp: new Date(),
        source: 'api',
      });

      return result;
      
    } catch (error) {
      console.error('Payment verification failed:', error);
      throw new PaymentError(
        'Failed to verify payment',
        'PAYMENT_VERIFICATION_FAILED',
        undefined,
        error
      );
    }
  }

  public async cancelPayment(
    params: { paymentId: string; orderId?: string; reason?: string },
    tenantId: string
  ): Promise<void> {
    const resolvedTenantId = tenantId || 'default';
    const payment = await this.getStoredPayment(params.paymentId, resolvedTenantId);

    if (!payment) {
      throw new PaymentError('Payment not found', 'PAYMENT_NOT_FOUND');
    }

    if (payment.provider !== 'phonepe') {
      throw new PaymentError(
        'Only PhonePe payments can be cancelled through this endpoint',
        'UNSUPPORTED_PROVIDER'
      );
    }

    if (params.orderId && payment.orderId !== params.orderId) {
      throw new PaymentError('Payment does not belong to the provided order', 'ORDER_MISMATCH');
    }

    const normalizedStatus = PaymentsService.normalizeLifecycleStatus(payment.status);
    const storedStatus =
      typeof payment.status === 'string' ? payment.status.toString().trim().toUpperCase() : '';

    if (normalizedStatus === 'COMPLETED') {
      throw new PaymentError('Completed payments cannot be cancelled', 'PAYMENT_ALREADY_COMPLETED');
    }

    if (normalizedStatus === 'FAILED') {
      if (storedStatus === 'CANCELLED') {
        return;
      }

      throw new PaymentError('Payment is already in a failed state', 'PAYMENT_ALREADY_FAILED');
    }

    const cancelledAt = new Date();

    await db.transaction(async (trx) => {
      await trx
        .update(payments)
        .set({
          status: 'CANCELLED',
          updatedAt: cancelledAt,
        })
        .where(
          and(eq(payments.id, payment.id), eq(payments.tenantId, resolvedTenantId))
        );

      await trx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        tenantId: resolvedTenantId,
        paymentId: payment.id,
        provider: payment.provider as PaymentProvider,
        type: 'checkout.user_cancelled',
        data: {
          previousStatus: payment.status ?? 'UNKNOWN',
          newStatus: 'CANCELLED',
          orderId: payment.orderId,
          reason: params.reason ?? 'user_cancelled_checkout',
        },
        occurredAt: cancelledAt,
      });

      await trx
        .update(orders)
        .set({
          paymentStatus: 'failed',
          paymentFailedAt: cancelledAt,
          updatedAt: cancelledAt,
        })
        .where(
          and(
            eq(orders.id, payment.orderId),
            eq(orders.tenantId, resolvedTenantId),
            sql`${orders.paymentStatus} <> 'paid'`
          )
        );
    });
  }

  /**
   * Create a refund with idempotency protection
   */
  public async createRefund(params: CreateRefundParams, tenantId: string): Promise<RefundResult> {
    // Generate idempotency key if not provided
    const idempotencyKey = params.idempotencyKey || idempotencyService.generateKey('refund');

    const resolvedTenantId = tenantId || 'default';
    
    // Execute with idempotency protection
    return await idempotencyService.executeWithIdempotency(
      idempotencyKey,
      'create_refund',
      async () => {
        try {
          // Get payment from database to determine provider
          const payment = await this.getStoredPayment(params.paymentId, resolvedTenantId);
          if (!payment) {
            throw new RefundError('Payment not found', 'PAYMENT_NOT_FOUND');
          }

          if (!payment.providerPaymentId) {
            throw new RefundError(
              'Payment is missing provider payment identifier',
              'MISSING_PROVIDER_PAYMENT_ID',
              payment.provider as PaymentProvider
            );
          }

          const capturedAmountMinor = payment.amountCapturedMinor ?? payment.amountAuthorizedMinor ?? 0;
          if (!capturedAmountMinor || capturedAmountMinor <= 0) {
            throw new RefundError(
              'No captured amount available for refund',
              'NO_CAPTURED_AMOUNT',
              payment.provider as PaymentProvider
            );
          }

          const normalizedMerchantRefundId = params.merchantRefundId?.trim() || undefined;

          if (normalizedMerchantRefundId) {
            const existingRefunds = await db
              .select()
              .from(refunds)
              .where(
                and(
                  eq(refunds.paymentId, params.paymentId),
                  eq(refunds.tenantId, resolvedTenantId),
                  eq(refunds.merchantRefundId, normalizedMerchantRefundId)
                )
              )
              .limit(1);

            const existingRefund = existingRefunds[0];
            if (existingRefund) {
              return this.mapStoredRefundToResult(
                existingRefund,
                payment.provider as PaymentProvider | undefined
              );
            }
          }

          const [existingTotals] = await db
            .select({
              totalNonFailed: sql<number>`COALESCE(SUM(CASE WHEN ${refunds.status} <> 'failed' THEN ${refunds.amountMinor} ELSE 0 END), 0)`,
              totalSucceeded: sql<number>`COALESCE(SUM(CASE WHEN ${refunds.status} IN ('succeeded','success','completed','captured','refunded') THEN ${refunds.amountMinor} ELSE 0 END), 0)`
            })
            .from(refunds)
            .where(
              and(
                eq(refunds.paymentId, params.paymentId),
                eq(refunds.tenantId, resolvedTenantId)
              )
            );

          const currentRefundedMinor = existingTotals?.totalNonFailed ?? 0;
          const currentSucceededMinor = existingTotals?.totalSucceeded
            ?? (typeof payment.amountRefundedMinor === 'number' ? payment.amountRefundedMinor : 0);

          const requestedAmountMinor = typeof params.amount === 'number'
            ? params.amount
            : Math.max(capturedAmountMinor - currentRefundedMinor, 0);

          if (!requestedAmountMinor || requestedAmountMinor <= 0) {
            throw new RefundError('Refund amount must be greater than zero', 'INVALID_REFUND_AMOUNT');
          }

          const projectedRefundedMinor = currentRefundedMinor + requestedAmountMinor;
          if (projectedRefundedMinor > capturedAmountMinor) {
            await db.insert(paymentEvents).values({
              id: crypto.randomUUID(),
              tenantId: resolvedTenantId,
              paymentId: payment.id,
              provider: payment.provider as PaymentProvider,
              type: 'refund_attempt_failed',
              data: {
                reason: 'REFUND_EXCEEDS_CAPTURED_AMOUNT',
                requestedAmountMinor,
                capturedAmountMinor,
                currentRefundedMinor,
                projectedRefundedMinor,
                merchantRefundId: normalizedMerchantRefundId ?? null,
              },
              occurredAt: new Date(),
            });

            throw new RefundError(
              'Refund amount exceeds captured amount',
              'REFUND_EXCEEDS_CAPTURED_AMOUNT',
              payment.provider as PaymentProvider
            );
          }

          // Get adapter for the provider
          const adapter = await adapterFactory.createAdapter(
            payment.provider as PaymentProvider,
            this.config.environment,
            resolvedTenantId
          );

          // Create refund through adapter with idempotency
          const enrichedParams: CreateRefundParams = {
            ...params,
            idempotencyKey,
            providerPaymentId: payment.providerPaymentId,
            amount: requestedAmountMinor,
            merchantRefundId: normalizedMerchantRefundId,
            originalMerchantOrderId:
              params.originalMerchantOrderId
              || payment.providerOrderId
              || payment.orderId,
          };

          const result = await this.executeWithRetry(
            () => adapter.createRefund(enrichedParams),
            this.config.retryAttempts || 3
          );

          const resolvedMerchantRefundId = result.merchantRefundId || enrichedParams.merchantRefundId;
          const resolvedOriginalMerchantOrderId = result.originalMerchantOrderId || enrichedParams.originalMerchantOrderId;
          const resolvedAmountMinor = typeof result.amount === 'number' && !Number.isNaN(result.amount)
            ? result.amount
            : requestedAmountMinor;
          const maskedRefundUtr = adapter.provider === 'phonepe'
            ? maskPhonePeUtr(result.upiUtr || result.providerData?.paymentInstrument?.utr) ?? undefined
            : result.upiUtr;

          const normalizedResult: RefundResult = {
            ...result,
            amount: resolvedAmountMinor,
            merchantRefundId: resolvedMerchantRefundId,
            originalMerchantOrderId: resolvedOriginalMerchantOrderId,
            upiUtr: maskedRefundUtr,
          };

          const normalizedStatus = String(normalizedResult.status ?? '').toLowerCase();
          const refundSucceeded = ['completed', 'succeeded', 'success', 'captured', 'refunded'].includes(normalizedStatus);

          // Store refund and log event in transaction
          await db.transaction(async (trx) => {
            // Store refund
            await trx.insert(refunds).values({
              id: normalizedResult.refundId,
              tenantId: resolvedTenantId,
              paymentId: normalizedResult.paymentId,
              provider: adapter.provider,
              providerRefundId: normalizedResult.providerRefundId,
              merchantRefundId: normalizedResult.merchantRefundId,
              originalMerchantOrderId: normalizedResult.originalMerchantOrderId,
              amountMinor: normalizedResult.amount,
              status: normalizedResult.status,
              reason: normalizedResult.reason,
              upiUtr: maskedRefundUtr,
              createdAt: normalizedResult.createdAt,
              updatedAt: normalizedResult.updatedAt || normalizedResult.createdAt,
            });

            // Log refund event
            await trx.insert(paymentEvents).values({
              id: crypto.randomUUID(),
              tenantId: resolvedTenantId,
              paymentId: normalizedResult.paymentId,
              provider: adapter.provider,
              type: 'refund_created',
              data: {
                refundId: normalizedResult.refundId,
                amount: normalizedResult.amount,
                reason: normalizedResult.reason,
                merchantRefundId: normalizedResult.merchantRefundId,
                originalMerchantOrderId: normalizedResult.originalMerchantOrderId,
                upiUtr: maskedRefundUtr,
              },
              occurredAt: normalizedResult.createdAt,
            });

            if (refundSucceeded) {
              const nextRefundedMinor = currentSucceededMinor + normalizedResult.amount;
              await trx
                .update(payments)
                .set({
                  amountRefundedMinor: nextRefundedMinor,
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(payments.id, normalizedResult.paymentId),
                    eq(payments.tenantId, resolvedTenantId)
                  )
                );
            }
          });

          return normalizedResult;

        } catch (error) {
          console.error('Refund creation failed:', error);
          if (error instanceof RefundError) {
            throw error;
          }
          throw new RefundError(
            'Failed to create refund',
            'REFUND_CREATION_FAILED',
            undefined,
            error
          );
        }
      }
    );
  }
  
  /**
   * Get refund status
   */
  public async getRefundStatus(refundId: string, tenantId: string): Promise<RefundResult> {
    try {
      // Get refund from database to determine provider
      const resolvedTenantId = tenantId || 'default';
      const refund = await this.getStoredRefund(refundId, resolvedTenantId);
      if (!refund) {
        throw new RefundError('Refund not found', 'REFUND_NOT_FOUND');
      }

      // Get adapter for the provider
      const adapter = await adapterFactory.createAdapter(
        refund.provider as PaymentProvider,
        this.config.environment,
        resolvedTenantId
      );
      
      // Get status through adapter
      const result = await adapter.getRefundStatus(refundId);
      
      // Update refund in database if status changed
      if (result.status !== refund.status) {
        await this.updateStoredRefund(result, refund, resolvedTenantId);

        // Log status change event
        await this.logPaymentEvent({
          id: crypto.randomUUID(),
          tenantId: resolvedTenantId,
          refundId: result.refundId,
          provider: adapter.provider,
          environment: this.config.environment,
          type: 'refund_status_changed',
          status: result.status,
          data: {
            previousStatus: refund.status,
            newStatus: result.status,
          },
          timestamp: new Date(),
          source: 'api',
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('Refund status check failed:', error);
      throw new RefundError(
        'Failed to get refund status',
        'REFUND_STATUS_CHECK_FAILED',
        undefined,
        error
      );
    }
  }
  
  /**
   * Perform health check on all providers
   */
  public async performHealthCheck(tenantId: string): Promise<HealthCheckResult[]> {
    const resolvedTenantId = tenantId || 'default';
    const healthStatus = await adapterFactory.getHealthStatus(this.config.environment, resolvedTenantId);

    return healthStatus.map(status => ({
      provider: status.provider,
      environment: status.environment,
      healthy: status.healthy,
      tests: status.tests,
      responseTime: status.responseTime,
      error: status.error,
      timestamp: status.timestamp,
    }));
  }

  /**
   * Capture an authorized payment
   */
  public async capturePayment(
    paymentId: string,
    tenantId: string,
    amountMinor?: number
  ): Promise<PaymentResult> {
    const resolvedTenantId = tenantId || 'default';
    let paymentRecord: (typeof payments.$inferSelect) | null = null;

    try {
      paymentRecord = await this.getStoredPayment(paymentId, resolvedTenantId);
      if (!paymentRecord) {
        throw new PaymentError('Payment not found', 'PAYMENT_NOT_FOUND');
      }

      if (!paymentRecord.providerPaymentId) {
        throw new PaymentError(
          'Payment is missing provider payment identifier',
          'MISSING_PROVIDER_PAYMENT_ID',
          paymentRecord.provider as PaymentProvider
        );
      }

      const adapter = await adapterFactory.createAdapter(
        paymentRecord.provider as PaymentProvider,
        this.config.environment,
        resolvedTenantId
      );

      const captureResult = await this.executeWithRetry(
        () => adapter.capturePayment({
          paymentId,
          providerPaymentId: paymentRecord!.providerPaymentId!,
          amount: amountMinor,
        }),
        this.config.retryAttempts || 3
      );

      await this.updateStoredPayment(captureResult, resolvedTenantId, {
        id: crypto.randomUUID(),
        tenantId: resolvedTenantId,
        paymentId: captureResult.paymentId,
        provider: adapter.provider,
        environment: this.config.environment,
        type: 'payment_captured',
        status: captureResult.status,
        data: {
          previousStatus: paymentRecord.status,
          amountCaptured: captureResult.amount,
          requestedAmount: amountMinor ?? captureResult.amount,
        },
        timestamp: new Date(),
        source: 'api',
      });

      return captureResult;
    } catch (error) {
      console.error('Payment capture failed:', error);
      throw new PaymentError(
        'Failed to capture payment',
        'PAYMENT_CAPTURE_FAILED',
        paymentRecord?.provider as PaymentProvider,
        error
      );
    }
  }
  
  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await Promise.race([
          operation(),
          this.createTimeoutPromise<T>()
        ]);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Wait before retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Create timeout promise
   */
  private createTimeoutPromise<T>(): Promise<T> {
    const timeout = this.config.timeout || 30000;
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    });
  }
  
  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private extractProviderMetadata(
    providerData?: Record<string, any>,
    provider?: PaymentProvider
  ): {
    providerTransactionId?: string;
    providerReferenceId?: string;
    upiPayerHandle?: string;
    upiUtr?: string;
    receiptUrl?: string;
    upiInstrumentVariant?: string;
  } {
    const metadata: {
      providerTransactionId?: string;
      providerReferenceId?: string;
      upiPayerHandle?: string;
      upiUtr?: string;
      receiptUrl?: string;
      upiInstrumentVariant?: string;
    } = {};

    if (!providerData) {
      return metadata;
    }

    const nestedSources = [
      providerData,
      typeof providerData.data === 'object' ? providerData.data : undefined,
      typeof providerData.paymentInstrument === 'object' ? providerData.paymentInstrument : undefined,
      typeof providerData.instrumentResponse === 'object' ? providerData.instrumentResponse : undefined,
    ].filter(Boolean) as Record<string, any>[];

    const pickString = (...values: Array<unknown>): string | undefined => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
          return value.trim();
        }
      }
      return undefined;
    };

    const instrumentResponse =
      typeof providerData.instrumentResponse === 'object' &&
      providerData.instrumentResponse !== null
        ? (providerData.instrumentResponse as Record<string, any>)
        : undefined;

    const paymentInstrument =
      typeof providerData.paymentInstrument === 'object' &&
      providerData.paymentInstrument !== null
        ? (providerData.paymentInstrument as Record<string, any>)
        : undefined;

    const nestedPaymentInstrument =
      instrumentResponse &&
      typeof instrumentResponse.paymentInstrument === 'object' &&
      instrumentResponse.paymentInstrument !== null
        ? (instrumentResponse.paymentInstrument as Record<string, any>)
        : undefined;

    const providerTransactionId = pickString(
      ...nestedSources.map(source => source.providerTransactionId),
      ...nestedSources.map(source => source.transactionId),
      ...nestedSources.map(source => source.pgTransactionId),
      ...nestedSources.map(source => source.gatewayTransactionId)
    );

    const providerReferenceId = pickString(
      ...nestedSources.map(source => source.providerReferenceId),
      ...nestedSources.map(source => source.merchantTransactionId),
      ...nestedSources.map(source => source.orderId),
      ...nestedSources.map(source => source.referenceId)
    );

    const upiPayerHandle = pickString(
      ...nestedSources.map(source => source.upiPayerHandle),
      ...nestedSources.map(source => source.payerVpa),
      ...nestedSources.map(source => source.payerHandle),
      ...nestedSources.map(source => source.virtualPaymentAddress),
      ...nestedSources.map(source => source.vpa),
      ...nestedSources.map(source => source.payerAddress)
    );

    const upiUtr = pickString(
      ...nestedSources.map(source => source.upiUtr),
      ...nestedSources.map(source => source.utr),
      ...nestedSources.map(source => source.upiTransactionId)
    );

    const receiptUrl = pickString(
      ...nestedSources.map(source => source.receiptUrl),
      ...nestedSources.map(source => source.receipt),
      ...nestedSources.map(source => source.receiptLink),
      ...nestedSources.map(source => source.receiptPath),
      ...nestedSources.map(source => source.receipt_path)
    );

    const instrumentVariantCandidates: Array<string | undefined> = [
      instrumentResponse?.type,
      instrumentResponse?.instrumentType,
      nestedPaymentInstrument?.type,
      nestedPaymentInstrument?.instrumentType,
      paymentInstrument?.type,
      paymentInstrument?.instrumentType,
    ];

    let upiInstrumentVariant: string | undefined;
    for (const candidate of instrumentVariantCandidates) {
      const normalizedVariant = normalizeUpiInstrumentVariant(candidate);
      if (normalizedVariant) {
        upiInstrumentVariant = normalizedVariant;
        break;
      }
    }

    const shouldMaskUpi = provider === 'phonepe';
    const maskedUpiHandle = shouldMaskUpi
      ? maskPhonePeVirtualPaymentAddress(upiPayerHandle)
      : upiPayerHandle ?? undefined;
    const maskedUpiUtr = shouldMaskUpi
      ? maskPhonePeUtr(upiUtr)
      : upiUtr ?? undefined;

    return {
      providerTransactionId,
      providerReferenceId,
      upiPayerHandle: maskedUpiHandle,
      upiUtr: maskedUpiUtr,
      receiptUrl,
      upiInstrumentVariant,
    };
  }

  /**
   * Store payment in database
   */
  private async storePayment(result: PaymentResult, provider: PaymentProvider): Promise<void> {
    await db.insert(payments).values({
      id: result.paymentId,
      orderId: result.providerOrderId || result.paymentId,
      provider: provider,
      environment: this.config.environment,
      providerPaymentId: result.providerPaymentId,
      providerOrderId: result.providerOrderId,
      amountAuthorizedMinor: result.amount,
      currency: result.currency,
      status: PaymentsService.toStorageStatus(result.status),
      methodKind: result.method?.type,
      methodBrand: result.method?.brand,
      last4: result.method?.last4,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt || result.createdAt,
    });
  }
  
  /**
   * Update stored payment with transaction safety
   */
  private async updateStoredPayment(result: PaymentResult, tenantId: string, event: PaymentEvent): Promise<void> {
    await db.transaction(async (trx) => {
      const [existingPayment] = await trx
        .select({
          orderId: payments.orderId,
          currentStatus: payments.status,
          provider: payments.provider,
        })
        .from(payments)
        .where(
          and(
            eq(payments.id, result.paymentId),
            eq(payments.tenantId, tenantId)
          )
        )
        .limit(1);

      if (!existingPayment) {
        return;
      }

      const currentLifecycle = PaymentsService.normalizeLifecycleStatus(existingPayment.currentStatus);
      const nextLifecycle = PaymentsService.normalizeLifecycleStatus(result.status);
      const transitionAllowed = PaymentsService.canTransitionLifecycleStatus(
        currentLifecycle,
        nextLifecycle
      );

      if (!transitionAllowed) {
        return;
      }

      const updateData: Record<string, any> = {
        status: PaymentsService.toStorageStatus(result.status),
        methodKind: result.method?.type,
        methodBrand: result.method?.brand,
        last4: result.method?.last4,
        updatedAt: result.updatedAt || new Date(),
      };

      const providerForMasking = (result.provider ?? event.provider ?? existingPayment?.provider) as PaymentProvider | undefined;

      const providerMetadata = this.extractProviderMetadata(
        result.providerData,
        providerForMasking
      );

      if (result.providerPaymentId) {
        updateData.providerPaymentId = result.providerPaymentId;
      }

      if (result.providerOrderId) {
        updateData.providerOrderId = result.providerOrderId;
      }

      if (nextLifecycle === 'COMPLETED' && typeof result.amount === 'number') {
        updateData.amountCapturedMinor = result.amount;
      }

      if (providerMetadata.providerTransactionId) {
        updateData.providerTransactionId = providerMetadata.providerTransactionId;
      }

      if (providerMetadata.providerReferenceId) {
        updateData.providerReferenceId = providerMetadata.providerReferenceId;
      }

      if (providerMetadata.upiPayerHandle) {
        updateData.upiPayerHandle =
          providerForMasking === 'phonepe'
            ? maskPhonePeVirtualPaymentAddress(providerMetadata.upiPayerHandle) ?? providerMetadata.upiPayerHandle
            : providerMetadata.upiPayerHandle;
      }

      if (providerMetadata.upiUtr) {
        updateData.upiUtr =
          providerForMasking === 'phonepe'
            ? maskPhonePeUtr(providerMetadata.upiUtr) ?? providerMetadata.upiUtr
            : providerMetadata.upiUtr;
      }

      if (providerMetadata.upiInstrumentVariant) {
        updateData.upiInstrumentVariant = providerMetadata.upiInstrumentVariant;
      }

      if (providerMetadata.receiptUrl) {
        updateData.receiptUrl = providerMetadata.receiptUrl;
      }

      await trx
        .update(payments)
        .set(updateData)
        .where(
          and(
            eq(payments.id, result.paymentId),
            eq(payments.tenantId, tenantId)
          )
        );

      await trx.insert(paymentEvents).values({
        id: event.id,
        tenantId,
        paymentId: event.paymentId ?? result.paymentId,
        provider: event.provider,
        type: event.type,
        data: event.data,
        occurredAt: event.timestamp,
      });

      const paymentOrderId = existingPayment?.orderId;
      let shouldPromoteOrder =
        paymentOrderId &&
        nextLifecycle === 'COMPLETED' &&
        event.type === 'payment_verified' &&
        transitionAllowed;

      if (shouldPromoteOrder) {
        const [orderRecord] = await trx
          .select({ paymentStatus: orders.paymentStatus })
          .from(orders)
          .where(eq(orders.id, paymentOrderId))
          .limit(1);

        if (orderRecord?.paymentStatus === 'paid') {
          shouldPromoteOrder = false;
        }
      }

      if (shouldPromoteOrder) {
        await trx
          .update(orders)
          .set({
            paymentStatus: 'paid',
            status: sql`CASE WHEN ${orders.status} = 'pending' THEN 'confirmed' ELSE ${orders.status} END`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(orders.id, paymentOrderId),
              sql`${orders.paymentStatus} <> 'paid'`
            )
          );
      }
    });
  }

  private static normalizeLifecycleStatus(status: string | null | undefined): PaymentLifecycleStatus {
    return normalizePaymentLifecycleStatus(status);
  }

  private static canTransitionLifecycleStatus(
    current: PaymentLifecycleStatus,
    next: PaymentLifecycleStatus
  ): boolean {
    return canTransitionPaymentLifecycle(current, next);
  }

  private static toStorageStatus(status: string | null | undefined): string {
    if (!status) {
      return 'CREATED';
    }

    const normalized = status.toString().trim();

    if (!normalized) {
      return 'CREATED';
    }

    const upper = normalized.toUpperCase();
    const lifecycle = normalizePaymentLifecycleStatus(upper);

    if (lifecycle === 'COMPLETED') {
      return 'COMPLETED';
    }

    if (lifecycle === 'PENDING') {
      return 'PENDING';
    }

    if (lifecycle === 'FAILED') {
      if (upper === 'FAILED' || upper === 'FAILURE') {
        return 'FAILED';
      }
      return upper;
    }

    if (lifecycle === 'CREATED' || upper === 'CREATED') {
      return 'CREATED';
    }

    return upper;
  }
  
  /**
   * Get stored payment
   */
  private async getStoredPayment(paymentId: string, tenantId: string) {
    const result = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, paymentId),
          eq(payments.tenantId, tenantId)
        )
      )
      .limit(1);

    return result[0] || null;
  }

  private mapStoredRefundToResult(
    storedRefund: typeof refunds.$inferSelect,
    fallbackProvider?: PaymentProvider
  ): RefundResult {
    const provider = (storedRefund.provider as PaymentProvider | undefined) ?? fallbackProvider;

    if (!provider) {
      throw new RefundError(
        'Stored refund is missing provider metadata',
        'REFUND_PROVIDER_UNKNOWN'
      );
    }

    const maskedUtr = provider === 'phonepe'
      ? maskPhonePeUtr(storedRefund.upiUtr ?? undefined) ?? undefined
      : storedRefund.upiUtr ?? undefined;

    return {
      refundId: storedRefund.id,
      paymentId: storedRefund.paymentId,
      providerRefundId: storedRefund.providerRefundId ?? undefined,
      merchantRefundId: storedRefund.merchantRefundId ?? undefined,
      originalMerchantOrderId: storedRefund.originalMerchantOrderId ?? undefined,
      amount: storedRefund.amountMinor ?? 0,
      status: storedRefund.status as RefundResult['status'],
      provider,
      environment: this.config.environment,
      reason: storedRefund.reason ?? undefined,
      upiUtr: maskedUtr,
      createdAt: storedRefund.createdAt ?? new Date(),
      updatedAt: storedRefund.updatedAt ?? storedRefund.createdAt ?? new Date(),
    };
  }

  /**
   * Store refund in database
   */
  private async storeRefund(result: RefundResult, provider: PaymentProvider): Promise<void> {
    await db.insert(refunds).values({
      id: result.refundId,
      paymentId: result.paymentId,
      provider: provider,
      providerRefundId: result.providerRefundId,
      merchantRefundId: result.merchantRefundId,
      originalMerchantOrderId: result.originalMerchantOrderId,
      amountMinor: result.amount,
      status: result.status,
      reason: result.reason,
      upiUtr: result.upiUtr,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt || result.createdAt,
    });
  }
  
  /**
   * Update stored refund
   */
  private async updateStoredRefund(
    result: RefundResult,
    existingRefund: typeof refunds.$inferSelect,
    tenantId: string
  ): Promise<void> {
    const updateData: Record<string, any> = {
      status: result.status,
      updatedAt: result.updatedAt || new Date(),
    };

    if (result.providerRefundId) {
      updateData.providerRefundId = result.providerRefundId;
    }

    if (result.merchantRefundId) {
      updateData.merchantRefundId = result.merchantRefundId;
    }

    if (result.originalMerchantOrderId) {
      updateData.originalMerchantOrderId = result.originalMerchantOrderId;
    }

    if (typeof result.amount === 'number' && !Number.isNaN(result.amount)) {
      updateData.amountMinor = result.amount;
    }

    const provider = existingRefund.provider as PaymentProvider | undefined;
    const maskedUtr = provider === 'phonepe'
      ? maskPhonePeUtr(result.upiUtr || result.providerData?.paymentInstrument?.utr) ?? existingRefund.upiUtr
      : result.upiUtr;

    if (maskedUtr) {
      updateData.upiUtr = maskedUtr;
    }

    await db
      .update(refunds)
      .set(updateData)
      .where(
        and(
          eq(refunds.id, result.refundId),
          eq(refunds.tenantId, tenantId)
        )
      );

    const paymentId = result.paymentId || existingRefund.paymentId;
    const normalizedStatus = String(result.status ?? '').toLowerCase();
    const shouldRecalculate = ['completed', 'succeeded', 'success', 'captured', 'refunded', 'failed', 'cancelled'].includes(normalizedStatus);

    if (paymentId && shouldRecalculate) {
      const [totals] = await db
        .select({
          totalSucceeded: sql<number>`COALESCE(SUM(CASE WHEN ${refunds.status} IN ('succeeded','success','completed','captured','refunded') THEN ${refunds.amountMinor} ELSE 0 END), 0)`
        })
        .from(refunds)
        .where(
          and(
            eq(refunds.paymentId, paymentId),
            eq(refunds.tenantId, tenantId)
          )
        );

      const succeededMinor = totals?.totalSucceeded ?? 0;

      await db
        .update(payments)
        .set({
          amountRefundedMinor: succeededMinor,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(payments.id, paymentId),
            eq(payments.tenantId, tenantId)
          )
        );
    }
  }

  /**
   * Get stored refund
   */
  private async getStoredRefund(refundId: string, tenantId: string) {
    const result = await db
      .select()
      .from(refunds)
      .where(
        and(
          eq(refunds.id, refundId),
          eq(refunds.tenantId, tenantId)
        )
      )
      .limit(1);

    return result[0] || null;
  }
  
  /**
   * Log payment event
   */
  private async logPaymentEvent(event: PaymentEvent): Promise<void> {
    await db.insert(paymentEvents).values({
      id: event.id,
      paymentId: event.paymentId,
      tenantId: event.tenantId,
      provider: event.provider,
      type: event.type,
      data: event.data,
      occurredAt: event.timestamp,
    });
  }
  
  /**
   * Get default success URL
   */
  private getDefaultSuccessUrl(): string {
    return `${process.env.BASE_URL || 'http://localhost:3000'}/payment-success`;
  }
  
  /**
   * Get default failure URL
   */
  private getDefaultFailureUrl(): string {
    return `${process.env.BASE_URL || 'http://localhost:3000'}/payment-failed`;
  }

  private async findCapturedUpiPayment(orderId: string, tenantId: string) {
    const existing = await db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(
          eq(payments.orderId, orderId),
          eq(payments.tenantId, tenantId),
          eq(payments.methodKind, 'upi'),
          or(
            inArray(payments.status, PaymentsService.upiCaptureStatuses),
            gt(payments.amountCapturedMinor, 0)
          )
        )
      )
      .limit(1);

    return existing[0] ?? null;
  }
}

/**
 * Create service instance with default configuration
 */
export const createPaymentsService = (overrides?: Partial<PaymentServiceConfig>) => {
  const defaultConfig: PaymentServiceConfig = {
    environment: (process.env.NODE_ENV === 'production' ? 'live' : 'test') as Environment,
    retryAttempts: 3,
    timeout: 30000,
    ...overrides,
  };
  
  return PaymentsService.getInstance(defaultConfig);
};