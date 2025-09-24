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
  HealthCheckResult
} from "../../shared/payment-types";

import { adapterFactory } from "./adapter-factory";
import { configResolver } from "./config-resolver";
import { idempotencyService } from "./idempotency-service";
import { PaymentError, RefundError, ConfigurationError } from "../../shared/payment-types";
import { db } from "../db";
import { payments, refunds, paymentEvents } from "../../shared/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

/**
 * Main payments service orchestrating all payment operations
 */
export class PaymentsService {
  private static instance: PaymentsService;
  
  private constructor(
    private config: PaymentServiceConfig
  ) {}
  
  public static getInstance(config: PaymentServiceConfig): PaymentsService {
    if (!PaymentsService.instance) {
      PaymentsService.instance = new PaymentsService(config);
    }
    return PaymentsService.instance;
  }
  
  /**
   * Create a new payment with idempotency protection
   */
  public async createPayment(
    params: CreatePaymentParams,
    preferredProvider?: PaymentProvider
  ): Promise<PaymentResult> {
    // Generate idempotency key if not provided
    const idempotencyKey = params.idempotencyKey || idempotencyService.generateKey('payment');
    
    // Execute with idempotency protection
    return await idempotencyService.executeWithIdempotency(
      idempotencyKey,
      'create_payment',
      async () => {
        try {
          // Determine provider to use
          const provider = preferredProvider || this.config.defaultProvider;
          
          let adapter;
          if (provider) {
            adapter = await adapterFactory.getAdapterWithFallback(provider, this.config.environment);
          } else {
            adapter = await adapterFactory.getPrimaryAdapter(this.config.environment);
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
          
          // Store payment and log event in transaction
          await db.transaction(async (trx) => {
            // Store payment
            await trx.insert(payments).values({
              id: result.paymentId,
              orderId: result.providerOrderId || result.paymentId,
              provider: adapter.provider,
              environment: this.config.environment,
              providerPaymentId: result.providerPaymentId,
              providerOrderId: result.providerOrderId,
              amountAuthorizedMinor: result.amount,
              currency: result.currency,
              status: result.status,
              methodKind: result.method?.type,
              methodBrand: result.method?.brand,
              last4: result.method?.last4,
              createdAt: result.createdAt,
              updatedAt: result.updatedAt || result.createdAt,
            });
            
            // Log payment event
            await trx.insert(paymentEvents).values({
              id: crypto.randomUUID(),
              paymentId: result.paymentId,
              provider: adapter.provider,
              type: 'payment_created',
              data: {
                amount: result.amount,
                currency: result.currency,
                method: result.method,
              },
              occurredAt: result.createdAt,
            });
          });
          
          return result;
          
        } catch (error) {
          console.error('Payment creation failed:', error);
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
  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      // Get payment from database to determine provider
      const payment = await this.getStoredPayment(params.paymentId);
      if (!payment) {
        throw new PaymentError('Payment not found', 'PAYMENT_NOT_FOUND');
      }
      
      // Get adapter for the provider
      const adapter = await adapterFactory.createAdapter(
        payment.provider as PaymentProvider, 
        this.config.environment
      );
      
      // Verify payment through adapter
      const result = await adapter.verifyPayment(params);
      
      // Update payment in database
      await this.updateStoredPayment(result);
      
      // Log verification event
      await this.logPaymentEvent({
        id: crypto.randomUUID(),
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
  
  /**
   * Create a refund with idempotency protection
   */
  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    // Generate idempotency key if not provided
    const idempotencyKey = params.idempotencyKey || idempotencyService.generateKey('refund');
    
    // Execute with idempotency protection
    return await idempotencyService.executeWithIdempotency(
      idempotencyKey,
      'create_refund',
      async () => {
        try {
          // Get payment from database to determine provider
          const payment = await this.getStoredPayment(params.paymentId);
          if (!payment) {
            throw new RefundError('Payment not found', 'PAYMENT_NOT_FOUND');
          }
          
          // Get adapter for the provider
          const adapter = await adapterFactory.createAdapter(
            payment.provider as PaymentProvider,
            this.config.environment
          );
          
          // Create refund through adapter with idempotency
          const enrichedParams: CreateRefundParams = {
            ...params,
            idempotencyKey,
          };
          
          const result = await this.executeWithRetry(
            () => adapter.createRefund(enrichedParams),
            this.config.retryAttempts || 3
          );
          
          // Store refund and log event in transaction
          await db.transaction(async (trx) => {
            // Store refund
            await trx.insert(refunds).values({
              id: result.refundId,
              paymentId: result.paymentId,
              provider: adapter.provider,
              providerRefundId: result.providerRefundId,
              amountMinor: result.amount,
              status: result.status,
              reason: result.reason,
              createdAt: result.createdAt,
              updatedAt: result.updatedAt || result.createdAt,
            });
            
            // Log refund event
            await trx.insert(paymentEvents).values({
              id: crypto.randomUUID(),
              paymentId: params.paymentId,
              provider: adapter.provider,
              type: 'refund_created',
              data: {
                refundId: result.refundId,
                amount: result.amount,
                reason: result.reason,
              },
              occurredAt: result.createdAt,
            });
          });
          
          return result;
          
        } catch (error) {
          console.error('Refund creation failed:', error);
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
  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      // Get refund from database to determine provider
      const refund = await this.getStoredRefund(refundId);
      if (!refund) {
        throw new RefundError('Refund not found', 'REFUND_NOT_FOUND');
      }
      
      // Get adapter for the provider
      const adapter = await adapterFactory.createAdapter(
        refund.provider as PaymentProvider,
        this.config.environment
      );
      
      // Get status through adapter
      const result = await adapter.getRefundStatus(refundId);
      
      // Update refund in database if status changed
      if (result.status !== refund.status) {
        await this.updateStoredRefund(result);
        
        // Log status change event
        await this.logPaymentEvent({
          id: crypto.randomUUID(),
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
  public async performHealthCheck(): Promise<HealthCheckResult[]> {
    const healthStatus = await adapterFactory.getHealthStatus(this.config.environment);
    
    return healthStatus.map(status => ({
      provider: status.provider,
      environment: this.config.environment,
      healthy: status.healthy,
      tests: {
        connectivity: status.available,
        authentication: status.healthy,
        apiAccess: status.healthy,
      },
      error: status.error ? {
        code: 'HEALTH_CHECK_FAILED',
        message: status.error,
      } : undefined,
      timestamp: new Date(),
    }));
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
      status: result.status,
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
  private async updateStoredPayment(result: PaymentResult): Promise<void> {
    await db.transaction(async (trx) => {
      // Update payment
      await trx
        .update(payments)
        .set({
          status: result.status,
          methodKind: result.method?.type,
          methodBrand: result.method?.brand,
          last4: result.method?.last4,
          updatedAt: result.updatedAt || new Date(),
        })
        .where(eq(payments.id, result.paymentId));
      
      // Log verification event
      await trx.insert(paymentEvents).values({
        id: crypto.randomUUID(),
        paymentId: result.paymentId,
        provider: result.provider,
        type: 'payment_verified',
        data: {
          status: result.status,
          method: result.method,
        },
        occurredAt: new Date(),
      });
    });
  }
  
  /**
   * Get stored payment
   */
  private async getStoredPayment(paymentId: string) {
    const result = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1);
    
    return result[0] || null;
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
      amountMinor: result.amount,
      status: result.status,
      reason: result.reason,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt || result.createdAt,
    });
  }
  
  /**
   * Update stored refund
   */
  private async updateStoredRefund(result: RefundResult): Promise<void> {
    await db
      .update(refunds)
      .set({
        status: result.status,
        updatedAt: result.updatedAt || new Date(),
      })
      .where(eq(refunds.id, result.refundId));
  }
  
  /**
   * Get stored refund
   */
  private async getStoredRefund(refundId: string) {
    const result = await db
      .select()
      .from(refunds)
      .where(eq(refunds.id, refundId))
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