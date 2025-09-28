/**
 * TASK 10: Provider-agnostic Payment API Routes
 * 
 * Complete payment system routes using our new PaymentsService,
 * provider adapters, and unified interfaces for all 8 providers.
 */

import { Router } from 'express';
import { z } from 'zod';
import type { SessionRequest, RequireAdminMiddleware } from './types';
import { createPaymentsService } from '../services/payments-service';
import { createWebhookRouter } from '../services/webhook-router';
import { configResolver } from '../services/config-resolver';
import { adapterFactory } from '../services/adapter-factory';
import { idempotencyService } from '../services/idempotency-service';
import type { 
  CreatePaymentParams,
  CreateRefundParams
} from '../../shared/payment-types';
import type { PaymentProvider, Environment } from '../../shared/payment-providers';
import { ConfigurationError, PaymentError } from '../../shared/payment-types';

export function createPaymentsRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();
  
  // Initialize services
  const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as Environment;
  const paymentsService = createPaymentsService({ environment });
  const webhookRouter = createWebhookRouter(environment);

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
        idempotencyKey: req.headers['idempotency-key'] as string,
        tenantId,
      };

      // Create payment with optional provider preference
      const result = await paymentsService.createPayment(
        paymentParams,
        tenantId,
        validatedData.provider as PaymentProvider
      );
      
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

      if (error instanceof ConfigurationError) {
        return res.status(409).json({
          error: 'Provider configuration invalid',
          message: error.message,
          provider: error.provider,
          missingKeys: error.missingKeys ?? [],
        });
      }

      res.status(500).json({
        error: 'Payment creation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
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

      if (error instanceof ConfigurationError) {
        return res.status(409).json({
          error: 'Provider configuration invalid',
          message: error.message,
          provider: error.provider,
          missingKeys: error.missingKeys ?? [],
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

      if (error instanceof ConfigurationError) {
        return res.status(409).json({
          error: 'Provider configuration invalid',
          message: error.message,
          provider: error.provider,
          missingKeys: error.missingKeys ?? [],
        });
      }

      res.status(500).json({
        error: 'Payment status check failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  router.get('/order-info/:orderId', async (req: SessionRequest, res) => {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        error: 'Order ID is required',
      });
    }

    const isAdmin = req.session.userRole === 'admin' || Boolean(req.session.adminId);

    if (!req.session.userId && !isAdmin) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    try {
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';
      const summary = await paymentsService.getOrderPaymentSummary(orderId, tenantId, {
        userId: req.session.userId,
        role: isAdmin ? 'admin' : req.session.userRole,
      });

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error('Order payment summary error:', error);

      if (error instanceof PaymentError) {
        if (error.code === 'ORDER_NOT_FOUND') {
          return res.status(404).json({
            error: 'Order not found',
          });
        }

        if (error.code === 'ORDER_ACCESS_DENIED') {
          return res.status(403).json({
            error: 'Access denied',
          });
        }
      }

      res.status(500).json({
        error: 'Failed to load order payment summary',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // ===== REFUND OPERATIONS =====

  /**
   * Create a refund
   * POST /api/payments/refunds
   */
  router.post('/refunds', async (req, res) => {
    try {
      const validatedData = createRefundSchema.parse(req.body);
      
      const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

      const refundParams: CreateRefundParams = {
        paymentId: validatedData.paymentId,
        amount: validatedData.amount ? Math.round(validatedData.amount * 100) : undefined, // Convert to minor units
        reason: validatedData.reason,
        notes: validatedData.notes,
        idempotencyKey: req.headers['idempotency-key'] as string,
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

      if (error instanceof ConfigurationError) {
        return res.status(409).json({
          error: 'Provider configuration invalid',
          message: error.message,
          provider: error.provider,
          missingKeys: error.missingKeys ?? [],
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

      if (error instanceof ConfigurationError) {
        return res.status(409).json({
          error: 'Provider configuration invalid',
          message: error.message,
          provider: error.provider,
          missingKeys: error.missingKeys ?? [],
        });
      }

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
      const [configs, status] = await Promise.all([
        configResolver.listConfigs(tenantId),
        configResolver.getProviderStatus(tenantId)
      ]);

      res.json({
        success: true,
        data: {
          configs,
          status,
        }
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

      const { provider, environment, isEnabled, ...rest } = validatedData;

      await configResolver.updateConfig({
        provider,
        environment,
        enabled: isEnabled,
        tenantId,
        ...rest,
      });

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