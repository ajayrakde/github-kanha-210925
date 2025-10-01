/**
 * TASK 10: Provider-agnostic Payment API Routes
 * 
 * Complete payment system routes using our new PaymentsService,
 * provider adapters, and unified interfaces for all 8 providers.
 */

import { createHash, randomUUID } from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { SessionRequest, RequireAdminMiddleware } from './types';
import { createPaymentsService } from '../services/payments-service';
import { createWebhookRouter } from '../services/webhook-router';
import { configResolver } from '../services/config-resolver';
import { adapterFactory } from '../services/adapter-factory';
import { idempotencyService } from '../services/idempotency-service';
import { ordersRepository, phonePePollingStore } from '../storage';
import { phonePePollingWorker } from '../services/phonepe-polling-registry';
import { PaymentError, normalizePaymentLifecycleStatus } from '../../shared/payment-types';
import type {
  CreatePaymentParams,
  CreateRefundParams
} from '../../shared/payment-types';
import type { PaymentResult } from '../../shared/payment-types';
import type { PaymentProvider, Environment } from '../../shared/payment-providers';
import { db } from '../db';
import { paymentEvents, orders } from '../../shared/schema';
import {
  formatUpiInstrumentVariantLabel,
  maskPhonePeIdentifier,
  normalizeUpiInstrumentVariant,
} from '../../shared/upi';
import type { PhonePePollingJob } from '../storage/phonepe-polling';
import { and, eq } from 'drizzle-orm';

export function createPaymentsRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();
  
  // Initialize services
  const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as Environment;
  const paymentsService = createPaymentsService({ environment });
  const webhookRouter = createWebhookRouter(environment);

  const clampExpireAfterSeconds = (value: unknown): number => {
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : undefined;

    if (numeric === undefined || !Number.isFinite(numeric)) {
      return 900;
    }

    const rounded = Math.floor(numeric);
    if (rounded < 300) {
      return 300;
    }
    if (rounded > 3600) {
      return 3600;
    }
    return rounded;
  };

  const resolveDate = (value: unknown): Date => {
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  };

  const resolveMerchantTransactionId = (result: PaymentResult): string | undefined => {
    const providerData = result.providerData ?? {};
    const nestedData = typeof providerData.data === 'object' && providerData.data !== null
      ? providerData.data as Record<string, unknown>
      : {};
    const instrumentResponse = typeof providerData.instrumentResponse === 'object' && providerData.instrumentResponse !== null
      ? providerData.instrumentResponse as Record<string, unknown>
      : {};

    const candidates = [
      providerData.merchantTransactionId,
      providerData.providerReferenceId,
      providerData.transactionId,
      nestedData.merchantTransactionId,
      nestedData.providerReferenceId,
      instrumentResponse.merchantTransactionId,
      instrumentResponse.providerReferenceId,
      result.providerPaymentId,
      result.providerOrderId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return undefined;
  };

  const resolveExpireAfterSeconds = (result: PaymentResult): number => {
    const providerData = result.providerData ?? {};
    const instrumentResponse = typeof providerData.instrumentResponse === 'object' && providerData.instrumentResponse !== null
      ? providerData.instrumentResponse as Record<string, unknown>
      : {};

    const candidates = [
      providerData.expireAfterSeconds,
      providerData.expireAfter,
      instrumentResponse.expireAfterSeconds,
      instrumentResponse.expireAfter,
    ];

    for (const candidate of candidates) {
      if (candidate !== undefined && candidate !== null) {
        return clampExpireAfterSeconds(candidate);
      }
    }

    return 900;
  };

  const enqueuePhonePePollingJob = async (
    result: PaymentResult,
    orderId: string,
    tenantId: string,
  ): Promise<PhonePePollingJob | undefined> => {
    if (result.provider !== 'phonepe') {
      return undefined;
    }

    const merchantTransactionId = resolveMerchantTransactionId(result);
    if (!merchantTransactionId) {
      return undefined;
    }

    try {
      return await phonePePollingWorker.registerJob({
        tenantId,
        orderId,
        paymentId: result.paymentId,
        merchantTransactionId,
        expireAfterSeconds: resolveExpireAfterSeconds(result),
        createdAt: resolveDate(result.createdAt),
      });
    } catch (error) {
      console.error('Failed to enqueue PhonePe polling job:', error);
      return undefined;
    }
  };

  const logAuditEvent = async (
    provider: PaymentProvider,
    tenantId: string,
    type: string,
    details: Record<string, unknown>,
  ): Promise<void> => {
    const data = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined && value !== null)
    );

    await db.insert(paymentEvents).values({
      id: randomUUID(),
      tenantId,
      provider,
      type,
      data,
      occurredAt: new Date(),
    });
  };

  // Input validation schemas
  const createPaymentSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    amount: z.number().min(1, 'Amount must be greater than 0'),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
    provider: z.enum(['razorpay', 'stripe', 'phonepe', 'payu', 'ccavenue', 'cashfree', 'paytm', 'billdesk']).optional(),
    customer: z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }).default({}),
    billing: z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      country: z.string().default('IN'),
    }).optional(),
    successUrl: z.string().url().optional(),
    failureUrl: z.string().url().optional(),
    description: z.string().optional(),
    metadata: z.record(z.any()).default({}),
  });

  const tokenUrlSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    amount: z.number().min(1, 'Amount must be greater than 0'),
    currency: z.enum(['INR', 'USD', 'EUR', 'GBP']).default('INR'),
    customer: z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
    }).default({}),
    mobileNumber: z.string().optional(),
    redirectUrl: z.string().url().optional(),
    callbackUrl: z.string().url().optional(),
    metadata: z.record(z.any()).optional(),
  });

  const TOKEN_URL_SCOPE = 'phonepe_token_url';

  const derivePhonePeIdempotencyKey = (
    prefix: 'phonepe-token' | 'phonepe-payment',
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string
  ): string => {
    const hash = createHash('sha256');
    hash.update([tenant, orderId, amountMinor.toString(), currency].join(':'));
    return `${prefix}:${hash.digest('hex')}`;
  };

  const deriveTokenUrlIdempotencyKey = (
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string
  ): string => derivePhonePeIdempotencyKey('phonepe-token', tenant, orderId, amountMinor, currency);

  const derivePaymentCreationIdempotencyKey = (
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string
  ): string => derivePhonePeIdempotencyKey('phonepe-payment', tenant, orderId, amountMinor, currency);

  const cancelPaymentSchema = z.object({
    paymentId: z.string().min(1, 'Payment ID is required'),
    orderId: z.string().min(1, 'Order ID is required'),
    reason: z.string().optional(),
  });

  const verifyPaymentSchema = z.object({
    paymentId: z.string().min(1),
    providerData: z.record(z.any()).optional(),
  });

  const createRefundSchema = z.object({
    paymentId: z.string().min(1),
    amount: z.number().positive().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  });

  const phonePeReturnSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    merchantTransactionId: z.string().min(1).optional(),
    providerReferenceId: z.string().min(1).optional(),
    amount: z.coerce.number().nonnegative().optional(),
    state: z.string().optional(),
    code: z.string().optional(),
    checksum: z.string().optional(),
  });

  const phonePeRetrySchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
  });

  const providerConfigSchema = z.object({
    provider: z.enum(['razorpay', 'stripe', 'phonepe', 'payu', 'ccavenue', 'cashfree', 'paytm', 'billdesk']),
    environment: z.enum(['test', 'live']),
    isEnabled: z.boolean().default(false),
    keyId: z.string().optional(),
    merchantId: z.string().optional(),
    accessCode: z.string().optional(),
    appId: z.string().optional(),
    publishableKey: z.string().optional(),
    saltIndex: z.number().int().min(1).max(10).optional(),
    accountId: z.string().optional(),
    successUrl: z.string().url().optional(),
    failureUrl: z.string().url().optional(),
    webhookUrl: z.string().url().optional(),
    capabilities: z.record(z.boolean()).default({}),
    metadata: z.record(z.any()).default({}),
  });

  // ===== PAYMENT OPERATIONS =====

  /**
   * Create a new payment
   * POST /api/payments/create
   */
  router.post('/create', async (req, res) => {
    try {
      const idempotencyKeyHeader = req.headers['idempotency-key'];
      if (typeof idempotencyKeyHeader !== 'string' || idempotencyKeyHeader.trim().length === 0) {
        return res.status(400).json({
          error: 'Idempotency-Key header is required',
        });
      }

      const validatedData = createPaymentSchema.parse(req.body);

      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      // Convert to our payment params format
      const paymentParams: CreatePaymentParams = {
        orderId: validatedData.orderId,
        orderAmount: Math.round(validatedData.amount * 100), // Convert to minor units (paise/cents)
        currency: validatedData.currency,
        customer: validatedData.customer,
        billing: validatedData.billing,
        successUrl: validatedData.successUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/payment-success`,
        failureUrl: validatedData.failureUrl || `${process.env.BASE_URL || 'http://localhost:3000'}/payment-failed`,
        description: validatedData.description,
        metadata: {
          ...validatedData.metadata,
          createdVia: 'api',
          userAgent: req.headers['user-agent'],
        },
        idempotencyKey: idempotencyKeyHeader.trim(),
        tenantId,
      };

      // Create payment with optional provider preference
      const result = await paymentsService.createPayment(
        paymentParams,
        tenantId,
        validatedData.provider as PaymentProvider
      );

      await enqueuePhonePePollingJob(result, paymentParams.orderId, tenantId);
      
      res.json({
        success: true,
        data: {
          paymentId: result.paymentId,
          providerPaymentId: result.providerPaymentId,
          status: result.status,
          amount: result.amount,
          currency: result.currency,
          provider: result.provider,
          redirectUrl: result.redirectUrl,
          qrCodeData: result.qrCodeData,
          providerData: result.providerData,
          createdAt: result.createdAt,
        }
      });
      
    } catch (error) {
      console.error('Payment creation error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
      }

      if (error instanceof PaymentError) {
        const statusCode = error.code === 'UPI_PAYMENT_ALREADY_CAPTURED' ? 409 : 400;
        return res.status(statusCode).json({
          error: error.message,
          code: error.code,
        });
      }

      res.status(500).json({
        error: 'Payment creation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Create a PhonePe checkout token URL for iframe-based flows
   * POST /api/payments/token-url
   */
  router.post('/token-url', async (req, res) => {
    try {
      const validatedData = tokenUrlSchema.parse(req.body);

      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      const order = await ordersRepository.getOrderWithPayments(validatedData.orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const expectedAmountMinor = Number(order.amountMinor);
      if (!Number.isFinite(expectedAmountMinor) || expectedAmountMinor <= 0) {
        return res.status(400).json({ error: 'Order amount unavailable' });
      }

      const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP'] as const;
      type SupportedCurrency = typeof supportedCurrencies[number];
      const storedCurrency = typeof order.currency === 'string'
        ? order.currency.trim().toUpperCase()
        : undefined;

      if (!storedCurrency || !supportedCurrencies.includes(storedCurrency as SupportedCurrency)) {
        return res.status(400).json({ error: 'Order currency unsupported' });
      }

      const expectedCurrency = storedCurrency as SupportedCurrency;
      const requestAmountMinor = Math.round(validatedData.amount * 100);
      const amountMismatch = requestAmountMinor !== expectedAmountMinor;
      const requestCurrency = validatedData.currency;
      const currencyMismatch = requestCurrency !== expectedCurrency;

      if (amountMismatch || currencyMismatch) {
        try {
          await logAuditEvent('phonepe', tenantId, 'token_url.payload_mismatch', {
            orderId: validatedData.orderId,
            tenantId,
            amountMismatch,
            currencyMismatch,
            expectedAmountMinor,
            expectedCurrency,
            receivedAmountMinor: requestAmountMinor,
            receivedCurrency: requestCurrency,
          });
        } catch (auditError) {
          console.error('Failed to log PhonePe token URL audit event:', auditError);
        }

        return res.status(403).json({ error: 'Order amount or currency mismatch' });
      }

      const orderAmountMinor = expectedAmountMinor;
      const orderCurrency = expectedCurrency;
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const successUrl = validatedData.redirectUrl || `${baseUrl}/payment/success`;
      const failureUrl = validatedData.redirectUrl || `${baseUrl}/payment/failed`;
      const cancelUrl = validatedData.redirectUrl || `${baseUrl}/payment/failed`;
      const tokenUrlIdempotencyKey = deriveTokenUrlIdempotencyKey(
        tenantId,
        validatedData.orderId,
        orderAmountMinor,
        orderCurrency
      );
      const originalPaymentCreationIdempotencyKey = derivePaymentCreationIdempotencyKey(
        tenantId,
        validatedData.orderId,
        orderAmountMinor,
        orderCurrency
      );
      let paymentCreationIdempotencyKey = originalPaymentCreationIdempotencyKey;
      let refreshedPaymentIdempotencyKey: string | undefined;
      const now = new Date();

      const [existingJob, cachedResult] = await Promise.all([
        phonePePollingStore.getLatestJobForOrder(validatedData.orderId, tenantId),
        idempotencyService.checkKey(tokenUrlIdempotencyKey, TOKEN_URL_SCOPE),
      ]);

      let shouldInvalidateKey = false;

      if (cachedResult.exists) {
        const expiresAtValue = cachedResult.response?.data?.expiresAt;
        const expiresAt = typeof expiresAtValue === 'string' ? new Date(expiresAtValue) : undefined;

        if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()) {
          return res.json(cachedResult.response);
        }
        shouldInvalidateKey = true;
      }

      if (existingJob && existingJob.status === 'pending') {
        const expireAt = existingJob.expireAt instanceof Date
          ? existingJob.expireAt
          : new Date(existingJob.expireAt);
        if (!Number.isNaN(expireAt.getTime()) && expireAt.getTime() <= now.getTime()) {
          await phonePePollingStore.markExpired(existingJob.id, {
            polledAt: now,
            attempt: existingJob.attempt ?? 0,
            lastStatus: 'expired',
            lastError: 'Token URL expired before reuse',
          });
          shouldInvalidateKey = true;
        }
      }

      if (shouldInvalidateKey) {
        const nextPaymentKey = idempotencyService.generateKey('phonepe_payment_refresh');
        refreshedPaymentIdempotencyKey = nextPaymentKey;
        paymentCreationIdempotencyKey = nextPaymentKey;

        await Promise.all([
          idempotencyService.invalidateKey(tokenUrlIdempotencyKey, TOKEN_URL_SCOPE),
          idempotencyService.invalidateKey(originalPaymentCreationIdempotencyKey, 'create_payment'),
        ]);
      }

      const payload = await idempotencyService.executeWithIdempotency(
        tokenUrlIdempotencyKey,
        TOKEN_URL_SCOPE,
        async () => {
          const paymentParams: CreatePaymentParams = {
            orderId: validatedData.orderId,
            orderAmount: orderAmountMinor,
            currency: orderCurrency,
            customer: {
              ...validatedData.customer,
              phone: validatedData.mobileNumber || validatedData.customer.phone,
            },
            successUrl,
            failureUrl,
            cancelUrl,
            metadata: {
              ...validatedData.metadata,
              phonepeCallbackUrl: validatedData.callbackUrl,
              createdVia: 'token-url',
            },
            idempotencyKey: paymentCreationIdempotencyKey,
          };

          const result = await paymentsService.createPayment(
            paymentParams,
            tenantId,
            'phonepe',
            refreshedPaymentIdempotencyKey
              ? { idempotencyKeyOverride: refreshedPaymentIdempotencyKey }
              : undefined
          );

          if (!result.redirectUrl) {
            throw new PaymentError('PhonePe token URL not available from provider response', 'TOKEN_URL_UNAVAILABLE', 'phonepe');
          }

          await enqueuePhonePePollingJob(result, paymentParams.orderId, tenantId);

          const expireAfterSeconds = resolveExpireAfterSeconds(result);
          const createdAt = resolveDate(result.createdAt);
          const expiresAt = new Date(createdAt.getTime() + expireAfterSeconds * 1000);
          const merchantTransactionId = resolveMerchantTransactionId(result) || '';

          return {
            success: true,
            data: {
              tokenUrl: result.redirectUrl,
              paymentId: result.paymentId,
              merchantTransactionId,
              expiresAt: expiresAt.toISOString(),
            },
          };
        }
      );

      res.json(payload);
    } catch (error) {
      console.error('PhonePe token URL error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors,
        });
      }

      if (error instanceof PaymentError) {
        const statusCode = error.code === 'TOKEN_URL_UNAVAILABLE' ? 502 : 400;
        return res.status(statusCode).json({
          error: error.message,
          code: error.code,
        });
      }

      res.status(500).json({
        error: 'Failed to create PhonePe token URL',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/cancel', async (req, res) => {
    try {
      const validatedData = cancelPaymentSchema.parse(req.body);
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      await paymentsService.cancelPayment(
        {
          paymentId: validatedData.paymentId,
          orderId: validatedData.orderId,
          reason: validatedData.reason,
        },
        tenantId
      );

      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors,
        });
      }

      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          code: error.code,
        });
      }

      console.error('Payment cancellation error:', error);
      res.status(500).json({
        error: 'Failed to cancel payment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  router.post('/phonepe/retry', async (req, res) => {
    const parsed = phonePeRetrySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: parsed.error.flatten(),
      });
    }

    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const { orderId } = parsed.data;

    try {
      const [order, latestJob] = await Promise.all([
        ordersRepository.getOrderWithPayments(orderId),
        phonePePollingStore.getLatestJobForOrder(orderId, tenantId),
      ]);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (!latestJob || latestJob.status !== 'expired') {
        return res.status(409).json({
          error: 'Latest PhonePe attempt is not expired yet',
          code: 'PHONEPE_RETRY_NOT_ALLOWED',
        });
      }

      const orderAmountMinor = Number(order.amountMinor);
      if (!Number.isFinite(orderAmountMinor) || orderAmountMinor <= 0) {
        return res.status(400).json({ error: 'Order amount unavailable' });
      }

      const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP'] as const;
      type SupportedCurrency = typeof supportedCurrencies[number];
      const currencyCandidate = typeof order.currency === 'string' ? order.currency.trim().toUpperCase() : undefined;

      if (!currencyCandidate || !supportedCurrencies.includes(currencyCandidate as SupportedCurrency)) {
        return res.status(400).json({ error: 'Order currency unsupported' });
      }

      const orderCurrency = currencyCandidate as SupportedCurrency;

      const normalizedPaymentMethod = typeof order.paymentMethod === 'string'
        ? order.paymentMethod.trim().toLowerCase()
        : '';
      if (!['upi', 'phonepe'].includes(normalizedPaymentMethod)) {
        return res.status(409).json({
          error: 'Order is not configured for PhonePe payments',
          code: 'PHONEPE_METHOD_MISMATCH',
        });
      }

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const successUrl = `${baseUrl}/payment/success`;
      const failureUrl = `${baseUrl}/payment/failed`;
      const cancelUrl = failureUrl;

      const customer = {
        name: order.user?.name ?? undefined,
        email: order.user?.email ?? undefined,
        phone: order.user?.phone ?? undefined,
      };

      const metadata = {
        createdVia: 'phonepe-retry',
        previousPaymentId: latestJob.paymentId,
        previousMerchantTransactionId: latestJob.merchantTransactionId,
      } as Record<string, unknown>;

      const paymentParams: CreatePaymentParams = {
        orderId,
        orderAmount: orderAmountMinor,
        currency: orderCurrency,
        customer,
        successUrl,
        failureUrl,
        cancelUrl,
        metadata,
      };

      const result = await paymentsService.createPayment(paymentParams, tenantId, 'phonepe');

      const job = await enqueuePhonePePollingJob(result, orderId, tenantId);

      try {
        await logAuditEvent('phonepe', tenantId, 'phonepe.retry.initiated', {
          orderId,
          tenantId,
          newPaymentId: result.paymentId,
          previousPaymentId: latestJob.paymentId,
          previousJobId: latestJob.id,
        });
      } catch (auditError) {
        console.error('Failed to log PhonePe retry audit event:', auditError);
      }

      const now = new Date();
      const normalizedStatus = typeof order.paymentStatus === 'string' ? order.paymentStatus.toLowerCase() : '';
      if (normalizedStatus !== 'paid') {
        await db
          .update(orders)
          .set({
            paymentStatus: 'processing',
            paymentFailedAt: null,
            updatedAt: now,
          })
          .where(
            and(eq(orders.id, orderId), eq(orders.tenantId, tenantId))
          );
      }

      const expireAfterSeconds = resolveExpireAfterSeconds(result);
      const createdAt = resolveDate(result.createdAt);
      const expiresAt = new Date(createdAt.getTime() + expireAfterSeconds * 1000);
      const reconciliationJob = job ?? null;

      res.json({
        success: true,
        data: {
          paymentId: result.paymentId,
          providerPaymentId: result.providerPaymentId,
          merchantTransactionId: resolveMerchantTransactionId(result) ?? null,
          status: result.status,
          order: {
            id: order.id,
            paymentStatus: normalizedStatus === 'paid' ? order.paymentStatus : 'processing',
          },
          reconciliation: reconciliationJob
            ? {
                status: reconciliationJob.status,
                attempt: reconciliationJob.attempt,
                nextPollAt: reconciliationJob.nextPollAt.toISOString(),
                expiresAt: reconciliationJob.expireAt.toISOString(),
                lastStatus: reconciliationJob.lastStatus ?? undefined,
                lastResponseCode: reconciliationJob.lastResponseCode ?? undefined,
                lastError: reconciliationJob.lastError ?? undefined,
                completedAt: reconciliationJob.completedAt?.toISOString(),
              }
            : {
                status: 'pending' as const,
                attempt: 0,
                nextPollAt: new Date(createdAt.getTime() + 5000).toISOString(),
                expiresAt: expiresAt.toISOString(),
              },
        },
      });
    } catch (error) {
      console.error('PhonePe retry initiation error:', error);

      if (error instanceof PaymentError) {
        return res.status(400).json({
          error: error.message,
          code: error.code,
        });
      }

      res.status(500).json({
        error: 'Failed to start a new PhonePe payment attempt',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * PhonePe redirect return handler
   * GET /api/payments/phonepe/return
   */
  router.get('/phonepe/return', async (req, res) => {
    const parsed = phonePeReturnSchema.safeParse(req.query);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid PhonePe return payload',
        details: parsed.error.flatten(),
      });
    }

    const {
      orderId,
      merchantTransactionId,
      providerReferenceId,
      amount,
      state,
      code,
      checksum,
    } = parsed.data;

    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
    const eventId = randomUUID();
    const occurredAt = new Date();

    try {
      const normalizedState = typeof state === 'string' ? state.toUpperCase() : undefined;
      const eventDataEntries = Object.entries({
        orderId,
        merchantTransactionId,
        providerReferenceId,
        amount,
        state: normalizedState,
        code,
        checksum,
        status: 'processing',
        reason: 'awaiting_webhook',
      }).filter(([, value]) => value !== undefined && value !== null);

      await db.insert(paymentEvents).values({
        id: eventId,
        tenantId,
        paymentId: null,
        provider: 'phonepe',
        type: 'phonepe.return.processing',
        data: Object.fromEntries(eventDataEntries),
        occurredAt,
      });

      res.json({
        status: 'processing',
        orderId,
        reconciliation: {
          shouldPoll: true,
          reason: 'PENDING_WEBHOOK',
          eventId,
        },
        message: 'PhonePe is processing the payment. We will confirm once their webhook arrives.',
      });
    } catch (error) {
      console.error('PhonePe return handling error:', error);
      res.status(500).json({ error: 'Failed to record PhonePe return' });
    }
  });

  /**
   * Verify a payment
   * POST /api/payments/verify
   */
  router.post('/verify', async (req, res) => {
      try {
        const validatedData = verifyPaymentSchema.parse(req.body);

        const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

        const result = await paymentsService.verifyPayment({
          paymentId: validatedData.paymentId,
          providerData: validatedData.providerData,
        }, tenantId);
      
      res.json({
        success: true,
        data: {
          paymentId: result.paymentId,
          status: result.status,
          amount: result.amount,
          currency: result.currency,
          provider: result.provider,
          method: result.method,
          error: result.error,
          updatedAt: result.updatedAt,
        }
      });
      
    } catch (error) {
      console.error('Payment verification error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: 'Payment verification failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get payment status
   * GET /api/payments/status/:paymentId
   */
  router.get('/status/:paymentId', async (req, res) => {
    try {
      const { paymentId } = req.params;
      
      if (!paymentId) {
        return res.status(400).json({
          error: 'Payment ID is required'
        });
      }
      
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      // We'll verify the payment which also fetches the latest status
      const result = await paymentsService.verifyPayment({
        paymentId,
      }, tenantId);
      
      res.json({
        success: true,
        data: {
          paymentId: result.paymentId,
          status: result.status,
          amount: result.amount,
          currency: result.currency,
          provider: result.provider,
          method: result.method,
          error: result.error,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        }
      });
      
    } catch (error) {
      console.error('Payment status check error:', error);
      
      res.status(500).json({
        error: 'Payment status check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get order payment summary
   * GET /api/payments/order-info/:orderId
   */
  router.get('/order-info/:orderId', async (req, res) => {
    const { orderId } = req.params;
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    try {
      const order = await ordersRepository.getOrderWithPayments(orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const reconciliationJob = await phonePePollingStore.getLatestJobForOrder(orderId, tenantId);

      const parseTimestamp = (value: unknown) => {
        if (!value) return 0;
        if (value instanceof Date) return value.getTime();
        const parsed = new Date(value as string | number).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
      };

      const sortedPayments = [...order.payments].sort((a, b) =>
        parseTimestamp(b.updatedAt ?? b.createdAt) - parseTimestamp(a.updatedAt ?? a.createdAt)
      );

      const toCurrency = (amountMinor?: number | null) => {
        if (typeof amountMinor !== 'number' || Number.isNaN(amountMinor)) {
          return '0.00';
        }
        return (amountMinor / 100).toFixed(2);
      };

      const mapPayment = (payment: typeof sortedPayments[number]) => {
        const amountMinor = payment.amountCapturedMinor ?? payment.amountAuthorizedMinor ?? 0;
        const provider = payment.provider as PaymentProvider | undefined;
        const normalizedVariant = normalizeUpiInstrumentVariant(payment.upiInstrumentVariant);
        const upiInstrumentLabel = formatUpiInstrumentVariantLabel(normalizedVariant);
        const maskedUpiHandle = maskPhonePeIdentifier(provider, payment.upiPayerHandle, {
          type: 'vpa',
        });
        const maskedUpiUtr = maskPhonePeIdentifier(provider, payment.upiUtr, {
          type: 'utr',
        });

        return {
          id: payment.id,
          status: payment.status,
          provider: payment.provider,
          methodKind: payment.methodKind,
          amount: toCurrency(amountMinor),
          amountMinor,
          merchantTransactionId: payment.providerPaymentId ?? payment.providerReferenceId ?? '',
          providerPaymentId: payment.providerPaymentId ?? undefined,
          providerTransactionId: payment.providerTransactionId ?? undefined,
          providerReferenceId: payment.providerReferenceId ?? undefined,
          upiPayerHandle: maskedUpiHandle ?? undefined,
          upiUtr: maskedUpiUtr ?? undefined,
          upiInstrumentVariant: normalizedVariant ?? undefined,
          upiInstrumentLabel: upiInstrumentLabel ?? undefined,
          receiptUrl: payment.receiptUrl ?? undefined,
          createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
          updatedAt: payment.updatedAt instanceof Date ? payment.updatedAt.toISOString() : payment.updatedAt,
        };
      };

      const transactions = sortedPayments.map(mapPayment);
      const upiTransactions = transactions.filter((txn) => txn.methodKind === 'upi');
      const latestTransaction = upiTransactions[0] ?? transactions[0] ?? undefined;
      const latestTransactionPayment = latestTransaction
        ? sortedPayments.find((payment) => payment.id === latestTransaction.id)
        : undefined;

      const latestTransactionFailed = latestTransaction
        ? normalizePaymentLifecycleStatus(latestTransaction.status ?? null) === 'FAILED'
        : false;

      const latestTransactionFailureAt = latestTransactionFailed
        ? (() => {
            const candidate =
              order.paymentFailedAt ??
              latestTransactionPayment?.updatedAt ??
              latestTransactionPayment?.createdAt ??
              null;
            if (!candidate) {
              return null;
            }
            if (candidate instanceof Date) {
              return candidate.toISOString();
            }
            if (typeof candidate === 'string') {
              const parsed = new Date(candidate);
              return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
            }
            return null;
          })()
        : null;

      const totalPaidMinor = sortedPayments.reduce((sum, payment) => sum + (payment.amountCapturedMinor ?? 0), 0);
      const totalRefundedMinor = sortedPayments.reduce((sum, payment) => sum + (payment.amountRefundedMinor ?? 0), 0);

      const parseDecimal = (value: unknown) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
      };

      const subtotal = parseDecimal(order.subtotal);
      const discount = parseDecimal(order.discountAmount);
      const shipping = parseDecimal(order.shippingCharge);
      const total = parseDecimal(order.total);
      const taxableBase = subtotal - discount;
      const tax = Math.max(total - shipping - taxableBase, 0);

      res.json({
        order: {
          id: order.id,
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentFailedAt:
            order.paymentFailedAt instanceof Date
              ? order.paymentFailedAt.toISOString()
              : order.paymentFailedAt ?? null,
          paymentMethod: order.paymentMethod,
          total: order.total,
          shippingCharge: order.shippingCharge,
          createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
          updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
        },
        payment: latestTransaction
          ? {
              status: latestTransaction.status,
              provider: latestTransaction.provider,
              providerTransactionId: latestTransaction.providerTransactionId,
              providerPaymentId: latestTransaction.providerPaymentId,
              providerReferenceId: latestTransaction.providerReferenceId,
              upiPayerHandle: latestTransaction.upiPayerHandle,
              upiUtr: latestTransaction.upiUtr,
              upiInstrumentVariant: latestTransaction.upiInstrumentVariant,
              upiInstrumentLabel: latestTransaction.upiInstrumentLabel,
              receiptUrl: latestTransaction.receiptUrl,
            }
          : null,
        transactions,
        latestTransaction,
        latestTransactionFailed,
        latestTransactionFailureAt,
        totals: {
          paidMinor: totalPaidMinor,
          refundedMinor: totalRefundedMinor,
        },
        totalPaid: totalPaidMinor / 100,
        totalRefunded: totalRefundedMinor / 100,
        breakdown: {
          subtotal,
          discount,
          tax,
          shipping,
          total,
        },
        reconciliation: reconciliationJob
          ? {
              status: reconciliationJob.status,
              attempt: reconciliationJob.attempt,
              nextPollAt: reconciliationJob.nextPollAt.toISOString(),
              expiresAt: reconciliationJob.expireAt.toISOString(),
              lastPolledAt: reconciliationJob.lastPolledAt
                ? reconciliationJob.lastPolledAt.toISOString()
                : undefined,
              lastStatus: reconciliationJob.lastStatus ?? undefined,
              lastResponseCode: reconciliationJob.lastResponseCode ?? undefined,
              lastError: reconciliationJob.lastError ?? undefined,
              completedAt: reconciliationJob.completedAt
                ? reconciliationJob.completedAt.toISOString()
                : undefined,
            }
          : null,
      });
    } catch (error) {
      console.error('Error fetching order payment info:', error);
      res.status(500).json({ error: 'Failed to fetch order payment details' });
    }
  });

  // ===== REFUND OPERATIONS =====

  /**
   * Create a refund
   * POST /api/payments/refunds
   */
  router.post('/refunds', async (req, res) => {
    try {
      const idempotencyKeyHeader = req.headers['idempotency-key'];
      if (typeof idempotencyKeyHeader !== 'string' || idempotencyKeyHeader.trim().length === 0) {
        return res.status(400).json({
          error: 'Idempotency-Key header is required',
        });
      }

      const validatedData = createRefundSchema.parse(req.body);

      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      const refundParams: CreateRefundParams = {
        paymentId: validatedData.paymentId,
        amount: validatedData.amount ? Math.round(validatedData.amount * 100) : undefined, // Convert to minor units
        reason: validatedData.reason,
        notes: validatedData.notes,
        idempotencyKey: idempotencyKeyHeader.trim(),
      };

      const result = await paymentsService.createRefund(refundParams, tenantId);
      
      res.json({
        success: true,
        data: {
          refundId: result.refundId,
          paymentId: result.paymentId,
          amount: result.amount,
          status: result.status,
          reason: result.reason,
          provider: result.provider,
          createdAt: result.createdAt,
        }
      });
      
    } catch (error) {
      console.error('Refund creation error:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: 'Refund creation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Get refund status
   * GET /api/payments/refunds/:refundId
   */
  router.get('/refunds/:refundId', async (req, res) => {
    try {
      const { refundId } = req.params;
      
      if (!refundId) {
        return res.status(400).json({
          error: 'Refund ID is required'
        });
      }
      
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      const result = await paymentsService.getRefundStatus(refundId, tenantId);
      
      res.json({
        success: true,
        data: {
          refundId: result.refundId,
          paymentId: result.paymentId,
          amount: result.amount,
          status: result.status,
          reason: result.reason,
          provider: result.provider,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        }
      });
      
    } catch (error) {
      console.error('Refund status check error:', error);
      
      res.status(500).json({
        error: 'Refund status check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== WEBHOOK ENDPOINTS =====

  /**
   * Webhook handler for all providers
   * POST /api/payments/webhook/:provider
   */
  router.post('/webhook/:provider', async (req, res) => {
    try {
      const provider = req.params.provider as PaymentProvider;
      
      if (!provider) {
        return res.status(400).json({
          error: 'Provider is required'
        });
      }
      
      // Process webhook through our unified webhook router
      const result = await webhookRouter.processWebhook(provider, req, res);
      
      // Response is already sent by webhookRouter
      return;
      
    } catch (error) {
      console.error(`Webhook processing error for ${req.params.provider}:`, error);
      
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== PROVIDER MANAGEMENT (Admin only) =====

  /**
   * Get all provider configurations
   * GET /api/payments/admin/providers
   */
  router.get('/admin/provider-configs', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const configs = await configResolver.getProviderStatus(tenantId);
      
      res.json({
        success: true,
        data: configs
      });
      
    } catch (error) {
      console.error('Error fetching provider configurations:', error);
      res.status(500).json({
        error: 'Failed to fetch provider configurations',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Create or update provider configuration
   * POST /api/payments/admin/provider-configs
   */
  router.post('/admin/provider-configs', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const validatedData = providerConfigSchema.parse(req.body);
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      await configResolver.updateConfig({ ...validatedData, tenantId });
      
      res.json({
        success: true,
        message: 'Provider configuration saved successfully'
      });
      
    } catch (error) {
      console.error('Error saving provider configuration:', error);
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid configuration data',
          details: error.errors
        });
      }
      
      res.status(500).json({
        error: 'Failed to save provider configuration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Health check for specific provider
   * POST /api/payments/admin/providers/:provider/health-check
   */
  router.post('/admin/providers/:provider/health-check', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const provider = req.params.provider as PaymentProvider;
      const environment = (req.query.environment as Environment) || 'test';
      
      if (!provider) {
        return res.status(400).json({
          error: 'Provider is required'
        });
      }
      
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      // Create adapter for health check
      const adapter = await adapterFactory.createAdapter(provider, environment, tenantId);
      const result = await adapter.healthCheck();
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      console.error(`Health check error for ${req.params.provider}:`, error);
      
      res.status(500).json({
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        provider: req.params.provider,
        healthy: false
      });
    }
  });

  /**
   * Get overall system health
   * GET /api/payments/admin/health
   */
  router.get('/admin/health', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const environment = (req.query.environment as Environment) || 'test';
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const healthResults = await paymentsService.performHealthCheck(tenantId);
      
      res.json({
        success: true,
        data: {
          environment,
          overall: healthResults.every(r => r.healthy),
          providers: healthResults,
          timestamp: new Date(),
        }
      });
      
    } catch (error) {
      console.error('System health check error:', error);
      
      res.status(500).json({
        error: 'System health check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // ===== UTILITY ENDPOINTS =====

  /**
   * Get supported providers and their capabilities
   * GET /api/payments/providers
   */
  router.get('/providers', async (req, res) => {
    try {
      const environment = (req.query.environment as Environment) || 'test';
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const enabledConfigs = await configResolver.getEnabledProviders(environment, tenantId);
      
      const providers = enabledConfigs.map(config => ({
        provider: config.provider,
        environment: config.environment,
        displayName: config.capabilities.displayName || config.provider,
        capabilities: config.capabilities,
        supportedMethods: [], // Would be populated by adapter
        supportedCurrencies: [], // Would be populated by adapter
      }));
      
      res.json({
        success: true,
        data: providers
      });
      
    } catch (error) {
      console.error('Error fetching available providers:', error);
      
      res.status(500).json({
        error: 'Failed to fetch available providers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Generate idempotency key
   * GET /api/payments/idempotency-key
   */
  router.get('/idempotency-key', (req, res) => {
    try {
      const scope = (req.query.scope as string) || 'payment';
      const key = idempotencyService.generateKey(scope);
      
      res.json({
        success: true,
        data: {
          idempotencyKey: key,
          scope,
        }
      });
      
    } catch (error) {
      console.error('Error generating idempotency key:', error);
      
      res.status(500).json({
        error: 'Failed to generate idempotency key',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}