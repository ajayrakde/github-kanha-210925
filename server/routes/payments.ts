/**
 * TASK 10: Provider-agnostic Payment API Routes
 * 
 * Complete payment system routes using our new PaymentsService,
 * provider adapters, and unified interfaces for all 8 providers.
 */

import { createHash, randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { Router } from 'express';
import type { RequestHandler } from 'express';
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
import { paymentEvents, orders, payments as paymentsTable } from '../../shared/schema';
import {
  formatUpiInstrumentVariantLabel,
  maskPhonePeIdentifier,
  normalizeUpiInstrumentVariant,
} from '../../shared/upi';
import type { PhonePePollingJob } from '../storage/phonepe-polling';
import { and, eq } from 'drizzle-orm';

export function createPaymentsRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  const resolveTenantId = (req: SessionRequest): string => {
    const header = req.headers['x-tenant-id'];
    if (typeof header === 'string' && header.trim().length > 0) {
      return header.trim();
    }
    return 'default';
  };

  const resolveSessionContext = (req: SessionRequest) => {
    const role = req.session?.userRole;
    const isAdmin = role === 'admin' && Boolean(req.session?.adminId);
    const buyerId = role === 'buyer' && typeof req.session?.userId === 'string'
      ? req.session.userId
      : null;
    const influencerId = role === 'influencer' && typeof req.session?.influencerId === 'string'
      ? req.session.influencerId
      : null;

    return {
      isAdmin,
      buyerId,
      adminId: isAdmin ? req.session?.adminId ?? null : null,
      isInfluencer: influencerId !== null,
      influencerId,
    };
  };

  const requireAuthenticatedSession: RequestHandler = (req, res, next) => {
    const sessionReq = req as SessionRequest;
    const { isAdmin, buyerId, isInfluencer } = resolveSessionContext(sessionReq);

    if (isAdmin || buyerId || isInfluencer) {
      return next();
    }

    return res.status(401).json({ message: 'Authentication required' });
  };

  const buildLimiterKey = (req: SessionRequest): string => {
    const tenantKey = resolveTenantId(req);
    const { isAdmin, buyerId, adminId } = resolveSessionContext(req);

    if (isAdmin) {
      return `${tenantKey}:admin:${adminId ?? 'unknown'}`;
    }

    if (buyerId) {
      return `${tenantKey}:buyer:${buyerId}`;
    }

    const sessionId = req.session?.sessionId;
    return `${tenantKey}:anon:${sessionId ?? req.ip ?? 'unknown'}`;
  };

  const sensitiveActionLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => buildLimiterKey(req as SessionRequest),
    handler: (_req, res) => {
      res.status(429).json({
        error: 'Too many payment management attempts. Please try again later.',
      });
    },
  });

  const phonePeRetryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => buildLimiterKey(req as SessionRequest),
    handler: (_req, res) => {
      res.status(429).json({
        error: 'Too many PhonePe retry attempts. Please try again later.',
      });
    },
  });

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
    provider: PaymentProvider | 'unknown',
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

  const phonePeInstrumentPreferenceSchema = z.enum([
    'UPI_INTENT',
    'UPI_COLLECT',
    'UPI_QR',
    'PAY_PAGE',
  ]);

  const phonePePayPageTypeSchema = z.enum(['IFRAME', 'REDIRECT', 'POPUP']).default('IFRAME');

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
    instrumentPreference: phonePeInstrumentPreferenceSchema.default('UPI_COLLECT'),
    payPageType: phonePePayPageTypeSchema,
  });

  const TOKEN_URL_SCOPE = 'phonepe_token_url';

  type PhonePeEffectiveInstrument = 'UPI_INTENT' | 'UPI_COLLECT' | 'UPI_QR' | 'PAY_PAGE';

  const normalizePhonePeInstrumentToken = (value: unknown): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
    return normalized.length > 0 ? normalized : undefined;
  };

  const resolveEffectivePhonePeInstrument = (value: unknown): PhonePeEffectiveInstrument => {
    const candidates: string[] = [];

    if (typeof value === 'string') {
      candidates.push(value);
    } else if (value && typeof value === 'object') {
      for (const potentialKey of [
        'instrumentPreference',
        'instrumentType',
        'instrument',
        'upiInstrument',
        'upiVariant',
        'upiFlow',
        'flow',
        'mode',
        'preferredInstrument',
        'preferredFlow',
        'checkoutFlow',
      ]) {
        const candidate = (value as Record<string, unknown>)[potentialKey];
        if (typeof candidate === 'string') {
          candidates.push(candidate);
        }
      }
    }

    for (const candidate of candidates) {
      const normalized = candidate.trim().toUpperCase().replace(/[\s-]+/g, '_');

      if (normalized === 'PAY_PAGE' || normalized === 'PAYPAGE') {
        return 'PAY_PAGE';
      }

      if (normalized === 'UPI_INTENT' || normalized === 'INTENT') {
        return 'UPI_INTENT';
      }

      if (normalized === 'UPI_QR' || normalized === 'QR' || normalized === 'QR_CODE') {
        return 'UPI_QR';
      }

      if (normalized === 'UPI_COLLECT' || normalized === 'COLLECT') {
        return 'UPI_COLLECT';
      }
    }

    return 'UPI_COLLECT';
  };

  const derivePhonePeIdempotencyKey = (
    prefix: 'phonepe-token' | 'phonepe-payment',
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string,
    instrument: PhonePeEffectiveInstrument,
    payPageType: string,
    rawInstrument?: string,
  ): string => {
    const hash = createHash('sha256');
    const normalizedRawInstrument = normalizePhonePeInstrumentToken(rawInstrument);
    const normalizedPayPageType = payPageType.toUpperCase();
    const hashComponents = [
      tenant,
      orderId,
      amountMinor.toString(),
      currency,
      instrument,
      normalizedPayPageType,
    ];

    if (normalizedRawInstrument && normalizedRawInstrument !== instrument) {
      hashComponents.push(normalizedRawInstrument);
    }

    hash.update(hashComponents.join(':'));
    return `${prefix}:${hash.digest('hex')}`;
  };

  const deriveTokenUrlIdempotencyKey = (
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string,
    instrument: PhonePeEffectiveInstrument,
    payPageType: string,
    rawInstrument?: string,
  ): string => derivePhonePeIdempotencyKey(
    'phonepe-token',
    tenant,
    orderId,
    amountMinor,
    currency,
    instrument,
    payPageType,
    rawInstrument,
  );

  const derivePaymentCreationIdempotencyKey = (
    tenant: string,
    orderId: string,
    amountMinor: number,
    currency: string,
    instrument: PhonePeEffectiveInstrument,
    payPageType: string,
    rawInstrument?: string,
  ): string => derivePhonePeIdempotencyKey(
    'phonepe-payment',
    tenant,
    orderId,
    amountMinor,
    currency,
    instrument,
    payPageType,
    rawInstrument,
  );

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
    amount: z.number().positive(),
    merchantRefundId: z.string().min(1, 'merchantRefundId is required'),
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
  const sanitizePaymentResult = (result: PaymentResult) => {
    const sanitized: Record<string, unknown> = {
      paymentId: result.paymentId,
      providerPaymentId: result.providerPaymentId,
      providerOrderId: result.providerOrderId,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      provider: result.provider,
      redirectUrl: result.redirectUrl,
      qrCodeData: result.qrCodeData,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };

    if (result.method) {
      sanitized.method = {
        type: result.method.type,
        brand: result.method.brand,
        last4: result.method.last4,
      };
    }

    return Object.fromEntries(
      Object.entries(sanitized).filter(([, value]) => value !== undefined && value !== null)
    );
  };

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
        const auditProvider: PaymentProvider | 'unknown' = validatedData.provider || 'unknown';

        try {
          await logAuditEvent(auditProvider, tenantId, 'payment.create.payload_mismatch', {
            orderId: validatedData.orderId,
            tenantId,
            amountMismatch,
            currencyMismatch,
            expectedAmountMinor,
            expectedCurrency,
            receivedAmountMinor: requestAmountMinor,
            receivedCurrency: requestCurrency,
            idempotencyKey: idempotencyKeyHeader.trim(),
          });
        } catch (auditError) {
          console.error('Failed to log payment creation audit event:', auditError);
        }

        return res.status(403).json({ error: 'Order amount or currency mismatch' });
      }

      // Convert to our payment params format
      const paymentParams: CreatePaymentParams = {
        orderId: validatedData.orderId,
        orderAmount: expectedAmountMinor, // Stored in minor units (paise/cents)
        currency: expectedCurrency,
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

      try {
        await logAuditEvent(result.provider, tenantId, 'payment.create.succeeded', {
          orderId: paymentParams.orderId,
          paymentId: result.paymentId,
          providerPaymentId: result.providerPaymentId,
          providerOrderId: result.providerOrderId,
          amountMinor: result.amount,
          currency: result.currency,
          environment: result.environment,
          redirectUrl: result.redirectUrl,
          hasQrCodeData: Boolean(result.qrCodeData),
          providerData: result.providerData,
        });
      } catch (auditError) {
        console.error('Failed to log payment creation success event:', auditError);
      }

      res.json({
        success: true,
        data: sanitizePaymentResult(result)
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
   * Create a pending payment record for Cashfree order
   * POST /api/payments/create-pending-cashfree
   */
  router.post('/create-pending-cashfree', async (req, res) => {
    try {
      const schema = z.object({
        orderId: z.string(),
        paymentSessionId: z.string(),
      });

      const validatedData = schema.parse(req.body);
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as Environment;

      // Get order details
      const order = await ordersRepository.getOrderWithPayments(validatedData.orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const expectedAmountMinor = Number(order.amountMinor);
      if (!Number.isFinite(expectedAmountMinor) || expectedAmountMinor <= 0) {
        return res.status(400).json({ error: 'Order amount unavailable' });
      }

      const currency = typeof order.currency === 'string' ? order.currency.trim().toUpperCase() : 'INR';

      // Check if there's already a pending payment for this order
      const existingPayment = await db.query.payments.findFirst({
        where: and(
          eq(paymentsTable.orderId, validatedData.orderId),
          eq(paymentsTable.tenantId, tenantId),
          eq(paymentsTable.status, 'PENDING')
        ),
      });

      if (existingPayment) {
        // Return existing payment ID
        return res.json({
          success: true,
          data: {
            paymentId: existingPayment.id,
          },
        });
      }

      // Create payment record
      const paymentId = randomUUID();
      const now = new Date();
      
      await db.insert(paymentsTable).values({
        id: paymentId,
        tenantId,
        orderId: validatedData.orderId,
        provider: 'cashfree',
        environment,
        providerOrderId: order.cashfreeOrderId || null,
        amountAuthorizedMinor: expectedAmountMinor,
        currency,
        status: 'PENDING',
        methodKind: 'upi',
        createdAt: now,
        updatedAt: now,
      });

      // Log payment creation event
      await db.insert(paymentEvents).values({
        id: randomUUID(),
        tenantId,
        paymentId,
        provider: 'cashfree',
        type: 'payment_created',
        data: {
          orderId: validatedData.orderId,
          amount: expectedAmountMinor,
          currency,
          method: { type: 'upi' },
        },
        occurredAt: now,
      });

      res.json({
        success: true,
        data: {
          paymentId,
        },
      });
    } catch (error) {
      console.error('Pending payment creation error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(500).json({
        error: 'Failed to create pending payment',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * Initiate Cashfree UPI payment with VPA
   * POST /api/payments/initiate-upi
   */
  router.post('/initiate-upi', async (req, res) => {
    try {
      const schema = z.object({
        orderId: z.string(),
        paymentSessionId: z.string(),
        upiId: z.string(),
      });

      const validatedData = schema.parse(req.body);
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as Environment;

      // Get order details
      const order = await ordersRepository.getOrderWithPayments(validatedData.orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const expectedAmountMinor = Number(order.amountMinor);
      if (!Number.isFinite(expectedAmountMinor) || expectedAmountMinor <= 0) {
        return res.status(400).json({ error: 'Order amount unavailable' });
      }

      const currency = typeof order.currency === 'string' ? order.currency.trim().toUpperCase() : 'INR';

      // Create payment record locally FIRST
      const paymentId = randomUUID();
      const now = new Date();
      
      await db.insert(paymentsTable).values({
        id: paymentId,
        tenantId,
        orderId: validatedData.orderId,
        provider: 'cashfree',
        environment,
        providerOrderId: order.cashfreeOrderId || null,
        amountAuthorizedMinor: expectedAmountMinor,
        currency,
        status: 'PENDING',
        methodKind: 'upi',
        createdAt: now,
        updatedAt: now,
      });

      // Log payment creation event
      await db.insert(paymentEvents).values({
        id: randomUUID(),
        tenantId,
        paymentId,
        provider: 'cashfree',
        type: 'payment_created',
        data: {
          orderId: validatedData.orderId,
          amount: expectedAmountMinor,
          currency,
          method: { type: 'upi' },
          upiId: validatedData.upiId,
        },
        occurredAt: now,
      });

      // NOW call Cashfree
      const adapter = await adapterFactory.getAdapterWithFallback('cashfree', environment, tenantId);
      if (!adapter) {
        return res.status(500).json({ error: 'Cashfree adapter not available' });
      }

      if (adapter.provider !== 'cashfree') {
        return res.status(500).json({ error: 'Invalid provider adapter' });
      }

      const cashfreeAdapter = adapter as any;
      const result = await cashfreeAdapter.initiateUPIPayment({
        paymentSessionId: validatedData.paymentSessionId,
        upiId: validatedData.upiId,
        orderId: validatedData.orderId,
      });

      // Update payment record with Cashfree's payment ID
      await db.update(paymentsTable)
        .set({
          providerPaymentId: result.cfPaymentId,
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, paymentId));

      res.json({
        success: true,
        data: {
          ...result,
          paymentId, // Return our local payment ID
        },
      });
    } catch (error) {
      console.error('UPI payment initiation error:', error);

      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid request data',
          details: error.errors
        });
      }

      res.status(500).json({
        error: 'UPI payment initiation failed',
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
      const rawInstrumentPreference = validatedData.instrumentPreference;
      const normalizedRequestedInstrument = normalizePhonePeInstrumentToken(rawInstrumentPreference);
      const effectiveInstrument = resolveEffectivePhonePeInstrument(rawInstrumentPreference);
      const requestedInstrumentToken = normalizedRequestedInstrument ?? effectiveInstrument;
      const payPageType = validatedData.payPageType;
      const tokenUrlIdempotencyKey = deriveTokenUrlIdempotencyKey(
        tenantId,
        validatedData.orderId,
        orderAmountMinor,
        orderCurrency,
        effectiveInstrument,
        payPageType,
        rawInstrumentPreference,
      );
      const originalPaymentCreationIdempotencyKey = derivePaymentCreationIdempotencyKey(
        tenantId,
        validatedData.orderId,
        orderAmountMinor,
        orderCurrency,
        effectiveInstrument,
        payPageType,
        rawInstrumentPreference,
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
        const responsePayload = cachedResult.response;
        const expiresAtValue = responsePayload?.data?.expiresAt;
        const expiresAt = typeof expiresAtValue === 'string' ? new Date(expiresAtValue) : undefined;
        const metadata = (responsePayload && typeof responsePayload === 'object'
          ? (responsePayload as Record<string, unknown>).metadata
          : undefined) as Record<string, unknown> | undefined;
        const cachedInstrument = typeof metadata?.effectiveInstrument === 'string'
          ? metadata?.effectiveInstrument.toUpperCase()
          : undefined;
        const cachedRequestedInstrument = typeof metadata?.requestedInstrument === 'string'
          ? metadata?.requestedInstrument.toUpperCase()
          : undefined;
        const cachedPayPageTypeValue = typeof metadata?.payPage === 'string'
          ? metadata?.payPage
          : typeof metadata?.payPageType === 'string'
            ? metadata?.payPageType
            : undefined;
        const cachedPayPageType = cachedPayPageTypeValue
          ? cachedPayPageTypeValue.toUpperCase()
          : undefined;
        const cacheExpiresAtValue = typeof metadata?.cacheExpiresAt === 'string'
          ? metadata?.cacheExpiresAt
          : undefined;
        const cacheExpiresAt = cacheExpiresAtValue ? new Date(cacheExpiresAtValue) : undefined;

        const instrumentMatches = !cachedInstrument || cachedInstrument === effectiveInstrument;
        const requestedInstrumentMatches = !cachedRequestedInstrument
          || cachedRequestedInstrument === requestedInstrumentToken;
        const payPageMatches = !cachedPayPageType || cachedPayPageType === payPageType;
        const tokenExpired = !!(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime());
        const ttlExpired = !!(cacheExpiresAt && !Number.isNaN(cacheExpiresAt.getTime()) && cacheExpiresAt.getTime() <= now.getTime());

        if (instrumentMatches && payPageMatches && requestedInstrumentMatches && !tokenExpired && !ttlExpired) {
          return res.json(responsePayload);
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
              payPage: payPageType,
            },
            providerOptions: {
              phonepe: {
                instrumentPreference: effectiveInstrument,
                payPageType,
                payPage: payPageType,
              },
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
            metadata: {
              effectiveInstrument,
              requestedInstrument: requestedInstrumentToken,
              payPageType,
              payPage: payPageType,
              cacheExpiresAt: new Date(expiresAt.getTime() + 60_000).toISOString(),
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

  router.post('/cancel', requireAuthenticatedSession, sensitiveActionLimiter, async (req: SessionRequest, res) => {
    const sessionReq = req as SessionRequest;
    const { isAdmin, buyerId } = resolveSessionContext(sessionReq);

    if (!isAdmin && !buyerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const validatedData = cancelPaymentSchema.parse(req.body);
      const tenantId = resolveTenantId(sessionReq);

      const order = await ordersRepository.getOrderWithPayments(validatedData.orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const orderTenantId = typeof order.tenantId === 'string' && order.tenantId.trim().length > 0
        ? order.tenantId.trim()
        : 'default';

      if (orderTenantId !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      if (!isAdmin && buyerId && order.userId !== buyerId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      const payment = order.payments.find((item) => item.id === validatedData.paymentId);

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found for order' });
      }

      if (typeof payment.tenantId === 'string' && payment.tenantId.trim().length > 0 && payment.tenantId.trim() !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

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

  router.post('/phonepe/retry', requireAuthenticatedSession, phonePeRetryLimiter, async (req: SessionRequest, res) => {
    const sessionReq = req as SessionRequest;
    const { isAdmin, buyerId } = resolveSessionContext(sessionReq);

    if (!isAdmin && !buyerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const parsed = phonePeRetrySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: parsed.error.flatten(),
      });
    }

    const tenantId = resolveTenantId(sessionReq);
    const { orderId } = parsed.data;

    try {
      const [order, latestJob] = await Promise.all([
        ordersRepository.getOrderWithPayments(orderId),
        phonePePollingStore.getLatestJobForOrder(orderId, tenantId),
      ]);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const orderTenantId = typeof order.tenantId === 'string' && order.tenantId.trim().length > 0
        ? order.tenantId.trim()
        : 'default';

      if (orderTenantId !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      if (!isAdmin && buyerId && order.userId !== buyerId) {
        return res.status(403).json({ error: 'Order not accessible' });
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
  router.get('/status/:paymentId', requireAuthenticatedSession, async (req: SessionRequest, res) => {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        return res.status(400).json({
          error: 'Payment ID is required'
        });
      }

      const tenantId = resolveTenantId(req);
      const { isAdmin, buyerId } = resolveSessionContext(req);

      const paymentRecord = await db.query.payments.findFirst({
        where: and(
          eq(paymentsTable.id, paymentId),
          eq(paymentsTable.tenantId, tenantId),
        ),
        with: {
          order: {
            columns: {
              id: true,
              userId: true,
              tenantId: true,
              offerId: true,
            },
            with: {
              offer: {
                columns: {
                  influencerId: true,
                },
              },
            },
          },
        },
      });

      if (!paymentRecord) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      if (!paymentRecord.order) {
        return res.status(404).json({ error: 'Order not found for payment' });
      }

      const orderTenantId = typeof paymentRecord.order.tenantId === 'string' && paymentRecord.order.tenantId.trim().length > 0
        ? paymentRecord.order.tenantId.trim()
        : 'default';

      if (orderTenantId !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      const hasBuyerAccess = buyerId && paymentRecord.order.userId === buyerId;

      if (!isAdmin && !hasBuyerAccess) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

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
  router.get('/order-info/:orderId', requireAuthenticatedSession, async (req: SessionRequest, res) => {
    const { orderId } = req.params;
    const tenantId = resolveTenantId(req);
    const { isAdmin, buyerId, isInfluencer, influencerId } = resolveSessionContext(req);

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    try {
      const order = await ordersRepository.getOrderWithPayments(orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const orderTenantId = typeof order.tenantId === 'string' && order.tenantId.trim().length > 0
        ? order.tenantId.trim()
        : 'default';

      if (orderTenantId !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      const hasBuyerAccess = buyerId && order.userId === buyerId;
      const hasInfluencerAccess = isInfluencer && influencerId
        ? order.offer?.influencerId === influencerId
        : false;

      if (!isAdmin && !hasBuyerAccess && !hasInfluencerAccess) {
        return res.status(403).json({ error: 'Order not accessible' });
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

        const mapRefunds = () => {
          type PaymentRefund = {
            id?: string;
            paymentId?: string;
            status?: string | null;
            amountMinor?: number | null;
            reason?: string | null;
            providerRefundId?: string | null;
            merchantRefundId?: string | null;
            originalMerchantOrderId?: string | null;
            upiUtr?: string | null;
            createdAt?: string | Date | null;
            updatedAt?: string | Date | null;
          };

          const candidateRefunds = (payment as typeof payment & { refunds?: unknown }).refunds;
          if (!Array.isArray(candidateRefunds) || candidateRefunds.length === 0) {
            return [] as Array<{
              id: string;
              paymentId?: string;
              status?: string | null;
              amount: string;
              amountMinor: number;
              reason?: string | null;
              providerRefundId?: string | null;
              merchantRefundId?: string | null;
              originalMerchantOrderId?: string | null;
              upiUtr?: string | null;
              createdAt?: string | Date | null;
              updatedAt?: string | Date | null;
            }>;
          }

          const normalizeDate = (value: unknown) => {
            if (!value) return undefined;
            if (value instanceof Date) {
              return value.toISOString();
            }
            if (typeof value === 'string') {
              const parsed = new Date(value);
              return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
            }
            return undefined;
          };

          return (candidateRefunds as PaymentRefund[]).map((refund) => {
            const refundAmountMinor = typeof refund?.amountMinor === 'number' && Number.isFinite(refund.amountMinor)
              ? refund.amountMinor
              : 0;
            const maskedRefundUtr = maskPhonePeIdentifier(provider, refund?.upiUtr, {
              type: 'utr',
            });

            return {
              id: refund?.id ?? randomUUID(),
              paymentId: refund?.paymentId ?? payment.id,
              status: refund?.status ?? undefined,
              amount: toCurrency(refundAmountMinor),
              amountMinor: refundAmountMinor,
              reason: refund?.reason ?? undefined,
              providerRefundId: refund?.providerRefundId ?? undefined,
              merchantRefundId: refund?.merchantRefundId ?? undefined,
              originalMerchantOrderId: refund?.originalMerchantOrderId ?? undefined,
              upiUtr: maskedRefundUtr ?? undefined,
              createdAt: normalizeDate(refund?.createdAt),
              updatedAt: normalizeDate(refund?.updatedAt),
            };
          });
        };

        const refunds = mapRefunds();

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
          refunds,
        };
      };

      const transactions = sortedPayments.map(mapPayment);
      const refunds = transactions.flatMap((txn) => txn.refunds ?? []);
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
              refunds: latestTransaction.refunds,
            }
          : null,
        transactions,
        latestTransaction,
        latestTransactionFailed,
        latestTransactionFailureAt,
        refunds,
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
  router.post('/refunds', requireAuthenticatedSession, sensitiveActionLimiter, async (req: SessionRequest, res) => {
    const sessionReq = req as SessionRequest;
    const { isAdmin, buyerId } = resolveSessionContext(sessionReq);

    if (!isAdmin && !buyerId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      const idempotencyKeyHeader = req.headers['idempotency-key'];
      if (typeof idempotencyKeyHeader !== 'string' || idempotencyKeyHeader.trim().length === 0) {
        return res.status(400).json({
          error: 'Idempotency-Key header is required',
        });
      }

      const validatedData = createRefundSchema.parse(req.body);

      const tenantId = resolveTenantId(sessionReq);

      const paymentRecord = await db.query.payments.findFirst({
        where: and(
          eq(paymentsTable.id, validatedData.paymentId),
          eq(paymentsTable.tenantId, tenantId),
        ),
        with: { order: true },
      });

      if (!paymentRecord) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      if (!paymentRecord.order) {
        return res.status(404).json({ error: 'Order not found for payment' });
      }

      const orderTenantId = typeof paymentRecord.order.tenantId === 'string' && paymentRecord.order.tenantId.trim().length > 0
        ? paymentRecord.order.tenantId.trim()
        : 'default';

      if (orderTenantId !== tenantId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      if (!isAdmin && buyerId && paymentRecord.order.userId !== buyerId) {
        return res.status(403).json({ error: 'Order not accessible' });
      }

      const refundParams: CreateRefundParams = {
        paymentId: validatedData.paymentId,
        amount: Math.round(validatedData.amount * 100), // Convert to minor units
        merchantRefundId: validatedData.merchantRefundId,
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

  router.get('/admin/phonepe/orders/:orderId', requireAdmin, async (req: SessionRequest, res) => {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const fallbackTenantId = (req.headers['x-tenant-id'] as string) || 'default';

    const toIsoString = (value: unknown): string | undefined => {
      if (!value) {
        return undefined;
      }

      if (value instanceof Date) {
        return value.toISOString();
      }

      if (typeof value === 'string') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }

      return undefined;
    };

    const coerceString = (value: unknown): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const parseTimestamp = (value: unknown): number => {
      if (!value) {
        return 0;
      }
      if (value instanceof Date) {
        return value.getTime();
      }
      if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.getTime();
        }
      }
      return 0;
    };

    try {
      const order = await ordersRepository.getOrderWithPayments(orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const tenantIdCandidate = coerceString(order.tenantId);
      const tenantId = tenantIdCandidate ?? fallbackTenantId;

      const phonePePayments = (order.payments ?? []).filter((payment) =>
        typeof payment?.provider === 'string' && payment.provider.toLowerCase() === 'phonepe'
      );

      if (phonePePayments.length === 0) {
        return res.status(404).json({ error: 'PhonePe payment not found for order' });
      }

      const latestPayment = phonePePayments.reduce((latest, current) => {
        if (!latest) {
          return current;
        }

        const latestTimestamp = parseTimestamp(latest.updatedAt ?? latest.createdAt);
        const currentTimestamp = parseTimestamp(current.updatedAt ?? current.createdAt);

        return currentTimestamp > latestTimestamp ? current : latest;
      }, phonePePayments[0]);

      const merchantTransactionIdCandidate = [
        coerceString(latestPayment.providerPaymentId),
        coerceString(latestPayment.providerReferenceId),
        coerceString(latestPayment.providerTransactionId),
        coerceString(latestPayment.id),
      ].find((candidate) => candidate !== null) ?? latestPayment.id;

      const providerPaymentId = coerceString(latestPayment.providerPaymentId) ?? undefined;

      const [verification, reconciliationJob] = await Promise.all([
        paymentsService.verifyPayment({
          paymentId: latestPayment.id,
          providerPaymentId,
          providerData: {
            merchantTransactionId: merchantTransactionIdCandidate ?? latestPayment.id,
            providerReferenceId: coerceString(latestPayment.providerReferenceId) ?? undefined,
          },
        }, tenantId),
        phonePePollingStore.getLatestJobForOrder(orderId, tenantId),
      ]);

      const providerData = (verification.providerData ?? {}) as Record<string, unknown>;
      const rawInstrumentCandidate = providerData['paymentInstrument'];
      const instrumentData = (typeof rawInstrumentCandidate === 'object' && rawInstrumentCandidate !== null)
        ? rawInstrumentCandidate as Record<string, unknown>
        : null;

      const resolveInstrumentString = (...values: unknown[]): string | null => {
        for (const value of values) {
          const resolved = coerceString(value);
          if (resolved) {
            return resolved;
          }
        }
        return null;
      };

      const instrumentType = resolveInstrumentString(
        instrumentData?.['type'],
        providerData['instrumentType'],
        providerData['paymentInstrumentType'],
      );

      const instrumentVariant = normalizeUpiInstrumentVariant(
        instrumentType ?? resolveInstrumentString(instrumentData?.['variant'])
      );
      const instrumentVariantLabel = formatUpiInstrumentVariantLabel(instrumentVariant);

      const utr = resolveInstrumentString(
        instrumentData?.['utr'],
        providerData['utr'],
        providerData['upiUtr'],
      );
      const utrMasked = maskPhonePeIdentifier('phonepe', utr, { type: 'utr' }) ?? undefined;

      const payerHandle = resolveInstrumentString(
        instrumentData?.['payerVpa'],
        instrumentData?.['payerHandle'],
        providerData['upiPayerHandle'],
      );
      const payerHandleMasked = maskPhonePeIdentifier('phonepe', payerHandle, { type: 'vpa' }) ?? undefined;

      const payerVpa = resolveInstrumentString(instrumentData?.['payerVpa'], providerData['upiPayerHandle']);
      const payerAddress = resolveInstrumentString(instrumentData?.['payerAddress']);

      const recordedPaymentHandle = maskPhonePeIdentifier('phonepe', latestPayment.upiPayerHandle, { type: 'vpa' }) ?? undefined;
      const recordedPaymentUtr = maskPhonePeIdentifier('phonepe', latestPayment.upiUtr, { type: 'utr' }) ?? undefined;

      const reconciliation = reconciliationJob
        ? {
            status: reconciliationJob.status,
            attempt: reconciliationJob.attempt ?? 0,
            nextPollAt: toIsoString(reconciliationJob.nextPollAt),
            expiresAt: toIsoString(reconciliationJob.expireAt),
            lastStatus: reconciliationJob.lastStatus ?? undefined,
            lastResponseCode: reconciliationJob.lastResponseCode ?? undefined,
            lastError: reconciliationJob.lastError ?? undefined,
            completedAt: toIsoString(reconciliationJob.completedAt),
            lastPolledAt: toIsoString(reconciliationJob.lastPolledAt),
          }
        : null;

      const responsePayload = {
        success: true,
        data: {
          orderId: order.id,
          tenantId,
          paymentId: verification.paymentId,
          merchantTransactionId: merchantTransactionIdCandidate ?? verification.providerPaymentId ?? latestPayment.id,
          providerStatus: verification.status,
          phonePeState: coerceString(providerData['state']),
          responseCode: coerceString(providerData['responseCode']),
          amountMinor: verification.amount,
          amount: verification.amount / 100,
          currency: verification.currency,
          verifiedAt: toIsoString(verification.updatedAt ?? verification.createdAt ?? new Date()),
          instrument: {
            type: instrumentType,
            utr,
            utrMasked: utrMasked ?? recordedPaymentUtr ?? null,
            payerHandle,
            payerHandleMasked: payerHandleMasked ?? recordedPaymentHandle ?? null,
            payerVpa,
            payerAddress,
            variant: instrumentVariant ?? null,
            variantLabel: instrumentVariantLabel ?? null,
          },
          rawInstrument: instrumentData,
          recordedPayment: {
            status: latestPayment.status,
            providerPaymentId: providerPaymentId ?? undefined,
            providerReferenceId: coerceString(latestPayment.providerReferenceId) ?? undefined,
            upiPayerHandle: recordedPaymentHandle,
            upiUtr: recordedPaymentUtr,
            updatedAt: toIsoString(latestPayment.updatedAt ?? latestPayment.createdAt) ?? null,
          },
          reconciliation,
        },
      } as const;

      return res.json(responsePayload);
    } catch (error) {
      console.error('Failed to verify PhonePe order for admin lookup:', error);
      return res.status(500).json({ error: 'Failed to retrieve PhonePe status for order' });
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