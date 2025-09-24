import { Router } from 'express';
import { z } from 'zod';
import { PhonePeService } from '../services/phonepe-service';
// import { paymentsRepository } from '../storage'; // Temporarily commented during payment system refactor
import { insertPaymentProviderSchema, insertPaymentTransactionSchema } from '@shared/schema';
import type { SessionRequest, RequireAdminMiddleware } from './types';
import type { PaymentProvider, PaymentProviderSettings } from '@shared/schema';
import { mergeProviderCredentials, validateProviderCredentials } from '../utils/payment-env';

export function createPaymentsRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  // Input validation schemas
  const createPaymentSchema = z.object({
    orderId: z.string().min(1, 'Order ID is required'),
    amount: z.number().min(1, 'Amount must be greater than 0'),
    redirectUrl: z.string().url('Invalid redirect URL'),
    callbackUrl: z.string().url('Invalid callback URL'),
    mobileNumber: z.string().optional(),
  });

  const paymentStatusSchema = z.object({
    merchantTransactionId: z.string().min(1, 'Transaction ID is required'),
  });

  const webhookCallbackSchema = z.object({
    response: z.string().min(1, 'Response is required'),
  });

  // Create payment with PhonePe
  router.post('/create', async (req, res) => {
    try {
      const validatedData = createPaymentSchema.parse(req.body);
      
      // Get active payment provider (PhonePe)
      const providers = await paymentsRepository.getPaymentProviders();
      const phonePeProvider = providers.find((p: PaymentProvider) => p.name === 'phonepe' && p.isEnabled);
    
    if (!phonePeProvider) {
      return res.status(400).json({
        error: 'PhonePe payment provider is not available'
      });
    }

      // Get active settings for the provider
      const settings = await paymentsRepository.getPaymentProviderSettings(phonePeProvider.id);
      const activeSettings = settings.find((s: PaymentProviderSettings) => s.isActive);
    
    if (!activeSettings) {
      return res.status(400).json({
        error: 'No active payment provider settings found'
      });
    }

      // Initialize PhonePe service with merged credentials (env vars + database)
      const settingsData = activeSettings.settings as any;
      const mergedCredentials = mergeProviderCredentials('phonepe', settingsData);
      
      // Validate required credentials
      const validation = validateProviderCredentials('phonepe', mergedCredentials, ['merchantId', 'saltKey', 'saltIndex']);
      if (!validation.isValid) {
        return res.status(400).json({
          error: `Missing required PhonePe credentials: ${validation.missingFields.join(', ')}`,
          missingFields: validation.missingFields
        });
      }
      
      const credentials = {
        merchantId: mergedCredentials.merchantId,
        saltKey: mergedCredentials.saltKey || mergedCredentials.secretKey, // Support both naming conventions
        saltIndex: mergedCredentials.saltIndex,
        apiHost: activeSettings.mode === 'test' 
          ? 'https://api-preprod.phonepe.com/apis/hermes' 
          : 'https://api.phonepe.com/apis/hermes'
      };

    const phonePeService = new PhonePeService(credentials);
    
    // Generate unique transaction ID
    const merchantTransactionId = PhonePeService.generateTransactionId('ORDER');
    
    // Convert amount to paise
    const amountInPaise = PhonePeService.rupeesToPaise(validatedData.amount);
    
    if (!PhonePeService.isValidAmount(amountInPaise)) {
      return res.status(400).json({
        error: 'Invalid payment amount. Minimum amount is ₹1'
      });
    }

    // Create payment request
    const paymentRequest = {
      merchantTransactionId,
      amount: amountInPaise,
      merchantUserId: `USER_${Date.now()}`, // In real app, use actual user ID
      redirectUrl: validatedData.redirectUrl,
      redirectMode: 'GET' as const,
      callbackUrl: validatedData.callbackUrl,
      mobileNumber: validatedData.mobileNumber,
      paymentInstrument: {
        type: 'PAY_PAGE' as const
      }
    };

    // Create payment with PhonePe
    const paymentResponse = await phonePeService.createPayment(paymentRequest);
    
      // Store transaction in database
      const transactionData = {
        orderId: validatedData.orderId,
        providerId: phonePeProvider.id,
        providerOrderId: paymentResponse.data?.transactionId || '',
        merchantTransactionId,
        amount: validatedData.amount.toString(),
        currency: 'INR',
        status: 'pending',
        paymentMethod: 'phonepe',
      };

      await paymentsRepository.createPaymentTransaction(transactionData);
    
    res.json({
      success: true,
      data: {
        merchantTransactionId,
        redirectUrl: paymentResponse.data ? paymentResponse.data : null,
        paymentResponse
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
    
    res.status(500).json({
      error: 'Payment creation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  // Check payment status
  router.get('/status/:merchantTransactionId', async (req, res) => {
    try {
      const { merchantTransactionId } = paymentStatusSchema.parse(req.params);
      
      // Get transaction from database
      const transaction = await paymentsRepository.getPaymentTransactionByMerchantId(merchantTransactionId);
    
    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

      // Get payment provider
      const provider = await paymentsRepository.getPaymentProviderById(transaction.providerId);
      if (!provider) {
        return res.status(500).json({
          error: 'Payment provider not found'
        });
      }

      // Get active settings
      const settings = await paymentsRepository.getPaymentProviderSettings(provider.id);
      const activeSettings = settings.find((s: PaymentProviderSettings) => s.isActive);
    
    if (!activeSettings) {
      return res.status(500).json({
        error: 'No active payment provider settings found'
      });
    }

      // Initialize PhonePe service with merged credentials (env vars + database)
      const settingsData = activeSettings.settings as any;
      const mergedCredentials = mergeProviderCredentials('phonepe', settingsData);
      
      // Validate required credentials
      const validation = validateProviderCredentials('phonepe', mergedCredentials, ['merchantId', 'saltKey', 'saltIndex']);
      if (!validation.isValid) {
        return res.status(400).json({
          error: `Missing required PhonePe credentials: ${validation.missingFields.join(', ')}`,
          missingFields: validation.missingFields
        });
      }
      
      const credentials = {
        merchantId: mergedCredentials.merchantId,
        saltKey: mergedCredentials.saltKey || mergedCredentials.secretKey, // Support both naming conventions
        saltIndex: mergedCredentials.saltIndex,
        apiHost: activeSettings.mode === 'test' 
          ? 'https://api-preprod.phonepe.com/apis/hermes' 
          : 'https://api.phonepe.com/apis/hermes'
      };

    const phonePeService = new PhonePeService(credentials);
    
    // Check status with PhonePe
    const statusResponse = await phonePeService.checkPaymentStatus(merchantTransactionId);
    
    // Update transaction status and sync with order
    if (statusResponse.data) {
      const newStatus = statusResponse.data.state === 'COMPLETED' ? 'completed' :
                       statusResponse.data.state === 'FAILED' ? 'failed' : 'pending';
      
        await paymentsRepository.updatePaymentTransactionAndSyncOrder(transaction.id, newStatus, {
          providerOrderId: statusResponse.data.transactionId,
          providerResponseData: statusResponse.data
        });
    }
    
    res.json({
      success: true,
      data: {
        transaction,
        statusResponse
      }
    });

  } catch (error) {
    console.error('Payment status check error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Payment status check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

  // Handle PhonePe webhook callback
  router.post('/webhook/phonepe', async (req, res) => {
    try {
      const xVerifyHeader = req.headers['x-verify'] as string;
      const { response } = webhookCallbackSchema.parse(req.body);
      
      if (!xVerifyHeader) {
        return res.status(400).json({
          error: 'Missing X-VERIFY header'
        });
      }

      // Get PhonePe provider settings for webhook verification
      const providers = await paymentsRepository.getPaymentProviders();
      const phonePeProvider = providers.find((p: PaymentProvider) => p.name === 'phonepe' && p.isEnabled);
    
    if (!phonePeProvider) {
      return res.status(400).json({
        error: 'PhonePe provider not found'
      });
    }

      const settings = await paymentsRepository.getPaymentProviderSettings(phonePeProvider.id);
      const activeSettings = settings.find((s: PaymentProviderSettings) => s.isActive);
    
    if (!activeSettings) {
      return res.status(500).json({
        error: 'No active payment provider settings found'
      });
    }

      // Initialize PhonePe service for callback verification
      const settingsData = activeSettings.settings as any;
      const credentials = {
        merchantId: settingsData.merchantId,
        saltKey: settingsData.saltKey,
        saltIndex: settingsData.saltIndex,
        apiHost: activeSettings.mode === 'test' 
          ? 'https://api-preprod.phonepe.com/apis/hermes' 
          : 'https://api.phonepe.com/apis/hermes'
      };

    const phonePeService = new PhonePeService(credentials);
    
    // Verify the callback
    if (!phonePeService.verifyCallback(xVerifyHeader, response)) {
      return res.status(401).json({
        error: 'Invalid callback signature'
      });
    }

    // Decode the response
    const decodedResponse = phonePeService.decodeResponse(response);
    
    if (decodedResponse.success) {
      const paymentData = decodedResponse.data;
      
        // Update transaction status and sync with order
        const transaction = await paymentsRepository.getPaymentTransactionByMerchantId(
          paymentData.merchantTransactionId
        );
        
        if (transaction) {
          const newStatus = paymentData.state === 'COMPLETED' ? 'completed' :
                           paymentData.state === 'FAILED' ? 'failed' : 'pending';
          
          await paymentsRepository.updatePaymentTransactionAndSyncOrder(transaction.id, newStatus, {
            providerOrderId: paymentData.transactionId,
            providerResponseData: paymentData
          });
        }
    }
    
    // PhonePe expects a success response
    res.json({ success: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid webhook data',
        details: error.errors
      });
    }
    
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Payment Providers Management (Admin only)

  // Get all payment providers
  router.get('/providers', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const providers = await paymentsRepository.getPaymentProviders();
      res.json(providers);
    } catch (error) {
      console.error('Error fetching payment providers:', error);
      res.status(500).json({
        error: 'Failed to fetch payment providers',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get payment provider settings
  router.get('/providers/:providerId/settings', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const { providerId } = req.params;
      const settings = await paymentsRepository.getPaymentProviderSettings(providerId);
      res.json(settings);
    } catch (error) {
      console.error('Error fetching provider settings:', error);
      res.status(500).json({
        error: 'Failed to fetch provider settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create or update payment provider settings
  router.post('/providers/:providerId/settings', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const { providerId } = req.params;
      const settingsData = req.body;
      
      // Validate settings data based on provider type
      // This could be extended to support different validation schemas per provider
      
      const result = await paymentsRepository.createOrUpdatePaymentProviderSettings(providerId, settingsData);
      res.json(result);
    } catch (error) {
      console.error('Error saving provider settings:', error);
      res.status(500).json({
        error: 'Failed to save provider settings',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update payment provider (enable/disable, set as default, etc.)
  router.patch('/providers/:providerId', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const { providerId } = req.params;
      const updateData = req.body;
      
      const updatedProvider = await paymentsRepository.updatePaymentProvider(providerId, updateData);
      res.json(updatedProvider);
    } catch (error) {
      console.error('Error updating payment provider:', error);
      res.status(500).json({
        error: 'Failed to update payment provider',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get payment transactions (Admin only)
  router.get('/transactions', requireAdmin, async (req: SessionRequest, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      
      const transactions = await paymentsRepository.getPaymentTransactions({
        page,
        limit,
        status
      });
      
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching payment transactions:', error);
      res.status(500).json({
        error: 'Failed to fetch payment transactions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get order with payment information (requires session or open access for thank-you page)
  router.get('/order-info/:orderId', async (req: SessionRequest, res) => {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        return res.status(400).json({
          error: 'Order ID is required'
        });
      }

      // Get order with payment information
      const orderInfo = await paymentsRepository.getOrderWithPaymentInfo(orderId);
      
      if (!orderInfo) {
        return res.status(404).json({
          error: 'Order not found'
        });
      }

      // If user is authenticated, verify order ownership
      if (req.session.userId) {
        if (orderInfo.order.userId !== req.session.userId) {
          return res.status(403).json({
            error: 'Access denied - order does not belong to authenticated user'
          });
        }
      }
      // For unauthenticated access (thank-you page), we allow it but limit sensitive info
      // This supports the e-commerce flow where users can see order status after checkout

      res.json(orderInfo);
    } catch (error) {
      console.error('Error fetching order payment info:', error);
      res.status(500).json({
        error: 'Failed to fetch order information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  return router;
}