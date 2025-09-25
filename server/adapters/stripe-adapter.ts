/**
 * TASK 6: StripeAdapter - Payment adapter for Stripe gateway
 * 
 * Implements PaymentsAdapter interface for Stripe with international focus:
 * Cards, Wallets, Refunds, Payouts, Tokenization, International, Webhooks
 * Note: No UPI/Netbanking support (primarily international)
 */

import crypto from "crypto";
import type {
  PaymentsAdapter,
  CreatePaymentParams,
  PaymentResult,
  VerifyPaymentParams,
  CapturePaymentParams,
  CreateRefundParams,
  RefundResult,
  WebhookVerifyParams,
  WebhookVerifyResult,
  HealthCheckParams,
  HealthCheckResult,
  PaymentMethod,
  Currency,
  PaymentStatus,
  RefundStatus
} from "../../shared/payment-types";

import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { ResolvedConfig } from "../services/config-resolver";
import { PaymentError, RefundError, WebhookError } from "../../shared/payment-types";

/**
 * Stripe API Response Types
 */
interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  client_secret: string;
  payment_method?: {
    id: string;
    type: string;
    card?: {
      last4: string;
      brand: string;
      exp_month: number;
      exp_year: number;
    };
  };
  created: number;
  metadata?: Record<string, string>;
}

interface StripeRefund {
  id: string;
  payment_intent: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason?: string;
  metadata?: Record<string, string>;
  created: number;
}

/**
 * Stripe adapter implementation
 */
export class StripeAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = 'stripe';
  public readonly environment: Environment;
  
  private readonly secretKey: string;
  private readonly publishableKey?: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  
  constructor(private config: ResolvedConfig) {
    this.environment = config.environment;
    
    // Extract configuration
    this.secretKey = config.secrets.keySecret || '';
    this.publishableKey = config.publishableKey;
    this.webhookSecret = config.secrets.webhookSecret;
    
    // Set API base URL
    this.baseUrl = 'https://api.stripe.com/v1';
    
    if (!this.secretKey) {
      throw new PaymentError(
        'Missing Stripe secret key',
        'MISSING_CREDENTIALS',
        'stripe'
      );
    }
  }
  
  /**
   * Create payment intent with Stripe
   */
  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const paymentIntentData: any = {
        amount: params.orderAmount, // Amount in smallest currency unit (cents)
        currency: params.currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          orderId: params.orderId,
          ...params.metadata,
        },
        description: params.description || `Payment for order ${params.orderId}`,
      };
      
      // Add customer information if provided
      if (params.customer.email) {
        paymentIntentData.receipt_email = params.customer.email;
      }
      
      const paymentIntent = await this.makeApiCall<StripePaymentIntent>('/payment_intents', 'POST', paymentIntentData);
      
      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: paymentIntent.id,
        providerOrderId: paymentIntent.id,
        status: this.mapPaymentIntentStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as Currency,
        provider: 'stripe',
        environment: this.environment,
        
        // Stripe uses client-side integration
        providerData: {
          stripePaymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          publishableKey: this.publishableKey,
        },
        
        createdAt: new Date(paymentIntent.created * 1000),
      };
      
      return result;
      
    } catch (error) {
      console.error('Stripe payment creation failed:', error);
      throw new PaymentError(
        `Stripe payment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_CREATION_FAILED',
        'stripe',
        error
      );
    }
  }
  
  /**
   * Verify payment with Stripe
   */
  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const { stripePaymentIntentId } = params.providerData || {};
      
      if (!stripePaymentIntentId) {
        throw new PaymentError('Missing Stripe Payment Intent ID', 'MISSING_VERIFICATION_DATA', 'stripe');
      }
      
      // Retrieve payment intent
      const paymentIntent = await this.makeApiCall<StripePaymentIntent>(`/payment_intents/${stripePaymentIntentId}`, 'GET');
      
      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: paymentIntent.id,
        providerOrderId: paymentIntent.id,
        status: this.mapPaymentIntentStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as Currency,
        provider: 'stripe',
        environment: this.environment,
        
        method: paymentIntent.payment_method ? {
          type: this.mapPaymentMethodType(paymentIntent.payment_method.type),
          brand: paymentIntent.payment_method.card?.brand,
          last4: paymentIntent.payment_method.card?.last4,
        } : undefined,
        
        providerData: {
          stripePaymentIntentId: paymentIntent.id,
          paymentMethodId: paymentIntent.payment_method?.id,
        },
        
        createdAt: new Date(paymentIntent.created * 1000),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('Stripe payment verification failed:', error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_VERIFICATION_FAILED',
        'stripe',
        error
      );
    }
  }

  /**
   * Capture a Stripe payment intent
   */
  public async capturePayment(params: CapturePaymentParams): Promise<PaymentResult> {
    try {
      const paymentIntentId = params.providerPaymentId || params.paymentId;
      if (!paymentIntentId) {
        throw new PaymentError('Missing Stripe Payment Intent ID', 'MISSING_PROVIDER_PAYMENT_ID', 'stripe');
      }

      const capturePayload: Record<string, any> = {};
      if (params.amount) {
        capturePayload.amount_to_capture = params.amount;
      }

      const paymentIntent = await this.makeApiCall<StripePaymentIntent>(
        `/payment_intents/${paymentIntentId}/capture`,
        'POST',
        Object.keys(capturePayload).length ? capturePayload : undefined
      );

      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: paymentIntent.id,
        providerOrderId: paymentIntent.id,
        status: this.mapPaymentIntentStatus(paymentIntent.status),
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase() as Currency,
        provider: 'stripe',
        environment: this.environment,

        method: paymentIntent.payment_method ? {
          type: this.mapPaymentMethodType(paymentIntent.payment_method.type),
          brand: paymentIntent.payment_method.card?.brand,
          last4: paymentIntent.payment_method.card?.last4,
        } : undefined,

        providerData: {
          stripePaymentIntentId: paymentIntent.id,
        },

        createdAt: new Date(paymentIntent.created * 1000),
        updatedAt: new Date(),
      };

      return result;
    } catch (error) {
      console.error('Stripe capture failed:', error);
      throw new PaymentError(
        `Payment capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_CAPTURE_FAILED',
        'stripe',
        error
      );
    }
  }

  /**
   * Create refund with Stripe
   */
  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const paymentIntentId = params.providerPaymentId || params.paymentId;
      if (!paymentIntentId) {
        throw new RefundError('Missing Stripe payment intent identifier', 'MISSING_PROVIDER_PAYMENT_ID', 'stripe');
      }

      const refundData: any = {
        payment_intent: paymentIntentId,
        metadata: {
          reason: params.reason,
          notes: params.notes,
        },
      };
      
      // Add amount for partial refund
      if (params.amount) {
        refundData.amount = params.amount;
      }
      
      if (params.reason) {
        refundData.reason = this.mapRefundReason(params.reason);
      }
      
      const refund = await this.makeApiCall<StripeRefund>('/refunds', 'POST', refundData);

      const result: RefundResult = {
        refundId: crypto.randomUUID(),
        paymentId: params.paymentId,
        providerRefundId: refund.id,
        amount: refund.amount,
        status: this.mapRefundStatus(refund.status),
        provider: 'stripe',
        environment: this.environment,
        
        reason: params.reason,
        notes: params.notes,
        
        providerData: {
          stripeRefundId: refund.id,
          stripePaymentIntentId: refund.payment_intent,
        },
        
        createdAt: new Date(refund.created * 1000),
      };
      
      return result;
      
    } catch (error) {
      console.error('Stripe refund creation failed:', error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_CREATION_FAILED',
        'stripe',
        error
      );
    }
  }
  
  /**
   * Get refund status
   */
  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const refund = await this.makeApiCall<StripeRefund>(`/refunds/${refundId}`, 'GET');
      
      const result: RefundResult = {
        refundId: crypto.randomUUID(),
        paymentId: refund.payment_intent,
        providerRefundId: refund.id,
        amount: refund.amount,
        status: this.mapRefundStatus(refund.status),
        provider: 'stripe',
        environment: this.environment,
        
        providerData: {
          stripeRefundId: refund.id,
        },
        
        createdAt: new Date(refund.created * 1000),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('Stripe refund status check failed:', error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_STATUS_CHECK_FAILED',
        'stripe',
        error
      );
    }
  }
  
  /**
   * Verify webhook signature
   */
  public async verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult> {
    try {
      if (!this.webhookSecret) {
        throw new WebhookError('Webhook secret not configured', 'WEBHOOK_SECRET_MISSING', 'stripe');
      }
      
      const signature = params.headers['stripe-signature'];
      if (!signature) {
        return { verified: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing Stripe signature header' } };
      }
      
      // Parse signature header
      const elements = signature.split(',');
      const signatureElements: Record<string, string> = {};
      
      for (const element of elements) {
        const [key, value] = element.split('=');
        signatureElements[key] = value;
      }
      
      const timestamp = signatureElements.t;
      const v1Signature = signatureElements.v1;
      
      if (!timestamp || !v1Signature) {
        return { verified: false, error: { code: 'INVALID_SIGNATURE_FORMAT', message: 'Invalid signature format' } };
      }
      
      // Create expected signature
      const payload = `${timestamp}.${params.body}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload, 'utf8')
        .digest('hex');
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(v1Signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
      
      if (!isValid) {
        return { verified: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } };
      }
      
      // Parse webhook event
      const event = JSON.parse(params.body.toString());
      const eventType = event.type;
      const eventData = event.data.object;
      
      return {
        verified: true,
        event: {
          type: eventType,
          paymentId: eventData.id,
          status: eventData.status,
          data: eventData,
        },
        providerData: event,
      };
      
    } catch (error) {
      console.error('Stripe webhook verification failed:', error);
      return {
        verified: false,
        error: {
          code: 'WEBHOOK_VERIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
  
  /**
   * Health check
   */
  public async healthCheck(params?: HealthCheckParams): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      // Test API connectivity by retrieving account info
      await this.makeApiCall('/account', 'GET');
      
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'stripe',
        environment: this.environment,
        healthy: true,
        responseTime,
        tests: {
          connectivity: true,
          authentication: true,
          apiAccess: true,
        },
        timestamp: new Date(),
      };
      
    } catch (error) {
      return {
        provider: 'stripe',
        environment: this.environment,
        healthy: false,
        responseTime: Date.now() - startTime,
        tests: {
          connectivity: false,
          authentication: false,
          apiAccess: false,
        },
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date(),
      };
    }
  }
  
  /**
   * Get supported payment methods
   */
  public getSupportedMethods(): PaymentMethod[] {
    return ['card', 'wallet']; // Stripe focuses on cards and digital wallets
  }
  
  /**
   * Get supported currencies
   */
  public getSupportedCurrencies(): Currency[] {
    return ['USD', 'EUR', 'GBP', 'INR']; // Major international currencies
  }
  
  /**
   * Validate configuration
   */
  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.secretKey) {
      errors.push('Missing Stripe Secret Key');
    }
    
    if (!this.publishableKey) {
      errors.push('Missing Stripe Publishable Key (recommended for frontend)');
    }
    
    if (!this.webhookSecret) {
      errors.push('Missing Stripe Webhook Secret (recommended)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  // Helper methods
  
  /**
   * Make API call to Stripe
   */
  private async makeApiCall<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'PaymentApp/1.0',
      'Stripe-Version': '2023-10-16',
    };
    
    let body: string | undefined;
    if (data) {
      // Convert data to URL-encoded format for Stripe API
      const params = new URLSearchParams();
      this.addParamsRecursively(params, data);
      body = params.toString();
    }
    
    const response = await fetch(url, {
      method,
      headers,
      body,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Stripe API error: ${response.status} ${error}`);
    }
    
    return response.json();
  }
  
  /**
   * Recursively add parameters for URL encoding
   */
  private addParamsRecursively(params: URLSearchParams, obj: any, prefix = ''): void {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const paramKey = prefix ? `${prefix}[${key}]` : key;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          this.addParamsRecursively(params, value, paramKey);
        } else {
          params.append(paramKey, value);
        }
      }
    }
  }
  
  /**
   * Map Stripe payment intent status to our status
   */
  private mapPaymentIntentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'requires_payment_method':
      case 'requires_confirmation': return 'created';
      case 'requires_action': return 'initiated';
      case 'processing': return 'processing';
      case 'requires_capture': return 'authorized';
      case 'succeeded': return 'captured';
      case 'canceled': return 'cancelled';
      default: return 'failed';
    }
  }
  
  /**
   * Map Stripe refund status to our status
   */
  private mapRefundStatus(status: string): RefundStatus {
    switch (status) {
      case 'pending': return 'pending';
      case 'succeeded': return 'completed';
      case 'failed': return 'failed';
      case 'canceled': return 'cancelled';
      default: return 'pending';
    }
  }
  
  /**
   * Map Stripe payment method type to our method
   */
  private mapPaymentMethodType(type: string): PaymentMethod {
    switch (type) {
      case 'card': return 'card';
      case 'klarna':
      case 'afterpay_clearpay': return 'paylater';
      case 'us_bank_account':
      case 'sepa_debit': return 'netbanking';
      default: return 'card';
    }
  }
  
  /**
   * Map refund reason to Stripe reason
   */
  private mapRefundReason(reason: string): string {
    // Stripe has specific refund reasons
    if (reason.toLowerCase().includes('fraud')) return 'fraudulent';
    if (reason.toLowerCase().includes('request')) return 'requested_by_customer';
    return 'requested_by_customer'; // Default
  }
}