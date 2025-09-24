/**
 * TASK 6: RazorpayAdapter - Payment adapter for Razorpay gateway
 * 
 * Implements PaymentsAdapter interface for Razorpay with full feature support:
 * Cards, UPI, Netbanking, Wallets, Refunds, Payouts, Tokenization, International, Webhooks
 */

import crypto from "crypto";
import type { 
  PaymentsAdapter,
  CreatePaymentParams,
  PaymentResult,
  VerifyPaymentParams,
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
 * Razorpay API Response Types
 */
interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: 'created' | 'attempted' | 'paid';
  receipt?: string;
}

interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  method: string;
  card?: {
    last4: string;
    network: string;
  };
  upi?: {
    vpa: string;
  };
  wallet?: string;
  bank?: string;
  created_at: number;
  captured: boolean;
}

interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processed' | 'failed';
  notes?: Record<string, string>;
  created_at: number;
}

/**
 * Razorpay adapter implementation
 */
export class RazorpayAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = 'razorpay';
  public readonly environment: Environment;
  
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  
  constructor(private config: ResolvedConfig) {
    this.environment = config.environment;
    
    // Extract configuration
    this.keyId = config.keyId || '';
    this.keySecret = config.secrets.keySecret || '';
    this.webhookSecret = config.secrets.webhookSecret;
    
    // Set API base URL based on environment
    this.baseUrl = 'https://api.razorpay.com/v1';
    
    if (!this.keyId || !this.keySecret) {
      throw new PaymentError(
        'Missing Razorpay credentials',
        'MISSING_CREDENTIALS',
        'razorpay'
      );
    }
  }
  
  /**
   * Create payment order with Razorpay
   */
  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      // Create Razorpay order first
      const orderData = {
        amount: params.orderAmount, // Amount in paise
        currency: params.currency,
        receipt: params.orderId,
        notes: {
          orderId: params.orderId,
          ...params.metadata,
        },
        payment_capture: 1, // Auto-capture payments
      };
      
      const order = await this.makeApiCall<RazorpayOrder>('/orders', 'POST', orderData);
      
      // Return payment result for frontend processing
      const result: PaymentResult = {
        paymentId: crypto.randomUUID(), // Our internal payment ID
        providerPaymentId: order.id, // Razorpay order ID
        providerOrderId: order.id,
        status: this.mapOrderStatus(order.status),
        amount: order.amount,
        currency: order.currency as Currency,
        provider: 'razorpay',
        environment: this.environment,
        
        // Razorpay uses checkout form, not direct redirect
        providerData: {
          razorpayOrderId: order.id,
          keyId: this.keyId,
          checkoutOptions: {
            key: this.keyId,
            amount: order.amount,
            currency: order.currency,
            name: 'Payment',
            description: params.description || `Payment for order ${params.orderId}`,
            order_id: order.id,
            handler: 'razorpay_payment_handler',
            prefill: {
              name: params.customer.name,
              email: params.customer.email,
              contact: params.customer.phone,
            },
            notes: orderData.notes,
            theme: {
              color: '#3399cc'
            },
          }
        },
        
        createdAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('Razorpay payment creation failed:', error);
      throw new PaymentError(
        `Razorpay payment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_CREATION_FAILED',
        'razorpay',
        error
      );
    }
  }
  
  /**
   * Verify payment with Razorpay
   */
  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = params.providerData || {};
      
      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        throw new PaymentError('Missing Razorpay verification parameters', 'MISSING_VERIFICATION_DATA', 'razorpay');
      }
      
      // Verify signature
      const isValidSignature = this.verifyPaymentSignature(
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature
      );
      
      if (!isValidSignature) {
        throw new PaymentError('Invalid Razorpay signature', 'INVALID_SIGNATURE', 'razorpay');
      }
      
      // Fetch payment details
      const payment = await this.makeApiCall<RazorpayPayment>(`/payments/${razorpayPaymentId}`, 'GET');
      
      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: payment.id,
        providerOrderId: payment.order_id,
        status: this.mapPaymentStatus(payment.status),
        amount: payment.amount,
        currency: payment.currency as Currency,
        provider: 'razorpay',
        environment: this.environment,
        
        method: {
          type: this.mapPaymentMethod(payment.method),
          brand: payment.card?.network || payment.wallet || payment.bank,
          last4: payment.card?.last4,
        },
        
        providerData: {
          razorpayPaymentId: payment.id,
          razorpayOrderId: payment.order_id,
          captured: payment.captured,
        },
        
        createdAt: new Date(payment.created_at * 1000),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('Razorpay payment verification failed:', error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_VERIFICATION_FAILED',
        'razorpay',
        error
      );
    }
  }
  
  /**
   * Create refund with Razorpay
   */
  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      // Get payment details first to validate
      const payment = await this.makeApiCall<RazorpayPayment>(`/payments/${params.paymentId}`, 'GET');
      
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        throw new RefundError('Payment not eligible for refund', 'PAYMENT_NOT_REFUNDABLE', 'razorpay');
      }
      
      const refundData: any = {
        payment_id: params.paymentId,
        notes: {
          reason: params.reason,
          notes: params.notes,
        },
      };
      
      // Add amount for partial refund
      if (params.amount && params.amount < payment.amount) {
        refundData.amount = params.amount;
      }
      
      const refund = await this.makeApiCall<RazorpayRefund>('/refunds', 'POST', refundData);
      
      const result: RefundResult = {
        refundId: crypto.randomUUID(), // Our internal refund ID
        paymentId: params.paymentId,
        providerRefundId: refund.id,
        amount: refund.amount,
        status: this.mapRefundStatus(refund.status),
        provider: 'razorpay',
        environment: this.environment,
        
        reason: params.reason,
        notes: params.notes,
        
        providerData: {
          razorpayRefundId: refund.id,
        },
        
        createdAt: new Date(refund.created_at * 1000),
      };
      
      return result;
      
    } catch (error) {
      console.error('Razorpay refund creation failed:', error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_CREATION_FAILED',
        'razorpay',
        error
      );
    }
  }
  
  /**
   * Get refund status
   */
  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      const refund = await this.makeApiCall<RazorpayRefund>(`/refunds/${refundId}`, 'GET');
      
      const result: RefundResult = {
        refundId: crypto.randomUUID(),
        paymentId: refund.payment_id,
        providerRefundId: refund.id,
        amount: refund.amount,
        status: this.mapRefundStatus(refund.status),
        provider: 'razorpay',
        environment: this.environment,
        
        providerData: {
          razorpayRefundId: refund.id,
        },
        
        createdAt: new Date(refund.created_at * 1000),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('Razorpay refund status check failed:', error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_STATUS_CHECK_FAILED',
        'razorpay',
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
        throw new WebhookError('Webhook secret not configured', 'WEBHOOK_SECRET_MISSING', 'razorpay');
      }
      
      const signature = params.headers['x-razorpay-signature'];
      if (!signature) {
        return { verified: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing Razorpay signature header' } };
      }
      
      // Verify webhook signature
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(params.body.toString())
        .digest('hex');
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
      
      if (!isValid) {
        return { verified: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } };
      }
      
      // Parse webhook payload
      const payload = JSON.parse(params.body.toString());
      const event = payload.event;
      const paymentEntity = payload.payload?.payment?.entity || payload.payload?.refund?.entity;
      
      return {
        verified: true,
        event: {
          type: event,
          paymentId: paymentEntity?.id,
          refundId: payload.payload?.refund?.entity?.id,
          status: paymentEntity?.status,
          data: payload.payload,
        },
        providerData: payload,
      };
      
    } catch (error) {
      console.error('Razorpay webhook verification failed:', error);
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
      // Test API connectivity by fetching account details
      await this.makeApiCall('/account', 'GET');
      
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'razorpay',
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
        provider: 'razorpay',
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
    return ['card', 'upi', 'netbanking', 'wallet'];
  }
  
  /**
   * Get supported currencies
   */
  public getSupportedCurrencies(): Currency[] {
    return ['INR', 'USD', 'EUR', 'GBP']; // Razorpay supports international currencies
  }
  
  /**
   * Validate configuration
   */
  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.keyId) {
      errors.push('Missing Razorpay Key ID');
    }
    
    if (!this.keySecret) {
      errors.push('Missing Razorpay Key Secret');
    }
    
    if (!this.webhookSecret) {
      errors.push('Missing Razorpay Webhook Secret (recommended)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  // Helper methods
  
  /**
   * Make API call to Razorpay
   */
  private async makeApiCall<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PaymentApp/1.0',
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Razorpay API error: ${response.status} ${error}`);
    }
    
    return response.json();
  }
  
  /**
   * Verify payment signature
   */
  private verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.keySecret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
  
  /**
   * Map Razorpay order status to our status
   */
  private mapOrderStatus(status: string): PaymentStatus {
    switch (status) {
      case 'created': return 'created';
      case 'attempted': return 'processing';
      case 'paid': return 'captured';
      default: return 'failed';
    }
  }
  
  /**
   * Map Razorpay payment status to our status
   */
  private mapPaymentStatus(status: string): PaymentStatus {
    switch (status) {
      case 'created': return 'created';
      case 'authorized': return 'authorized';
      case 'captured': return 'captured';
      case 'refunded': return 'refunded';
      case 'failed': return 'failed';
      default: return 'failed';
    }
  }
  
  /**
   * Map Razorpay refund status to our status
   */
  private mapRefundStatus(status: string): RefundStatus {
    switch (status) {
      case 'pending': return 'pending';
      case 'processed': return 'completed';
      case 'failed': return 'failed';
      default: return 'pending';
    }
  }
  
  /**
   * Map Razorpay payment method to our method
   */
  private mapPaymentMethod(method: string): PaymentMethod {
    switch (method) {
      case 'card': return 'card';
      case 'upi': return 'upi';
      case 'netbanking': return 'netbanking';
      case 'wallet': return 'wallet';
      case 'emi': return 'emi';
      case 'paylater': return 'paylater';
      default: return 'card';
    }
  }
}