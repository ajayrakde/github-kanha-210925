/**
 * TASK 6: PhonePeAdapter - Payment adapter for PhonePe gateway
 * 
 * Implements PaymentsAdapter interface for PhonePe with UPI focus:
 * UPI, Refunds, Webhooks (No Cards, Netbanking, Wallets, International)
 * Note: PhonePe is primarily UPI-focused for Indian market
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

import type { PaymentProvider, Environment, PhonePeConfig } from "../../shared/payment-providers";
import type { ResolvedConfig } from "../services/config-resolver";
import { PhonePeTokenManager } from "../services/phonepe-token-manager";
import { PaymentError, RefundError, WebhookError } from "../../shared/payment-types";
import { resolvePhonePeHost } from "../services/phonepe-host";

/**
 * PhonePe API Response Types
 */
type PhonePeUpiInstrumentType = 'UPI_COLLECT' | 'UPI_QR' | 'UPI_INTENT';
type PhonePePaymentInstrumentType = PhonePeUpiInstrumentType | 'PAY_PAGE';

interface PhonePePaymentRequest {
  merchantTransactionId: string;
  merchantId: string;
  amount: number;
  redirectUrl: string;
  redirectMode: string;
  callbackUrl?: string;
  paymentFlow: {
    type: 'PG_CHECKOUT';
  };
  expireAfter: number;
  paymentModeConfig: {
    paymentModes: Array<{
      paymentMode: 'UPI';
      enabled: boolean;
      paymentInstruments: Array<{
        type: PhonePeUpiInstrumentType;
        enabled: boolean;
      }>;
    }>;
  };
  paymentInstrument: {
    type: PhonePePaymentInstrumentType;
    targetApp?: string;
  };
  deviceContext?: {
    deviceOS: string;
  };
}

interface PhonePePaymentResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantTransactionId: string;
    transactionId: string;
    instrumentResponse: {
      type: string;
      redirectInfo?: {
        url: string;
        method: string;
      };
      upiCollectRequestResponse?: {
        psps: Array<{
          name: string;
          code: string;
        }>;
      };
    };
  };
}

interface PhonePeStatusResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantTransactionId: string;
    transactionId: string;
    amount: number;
    state: 'PENDING' | 'COMPLETED' | 'FAILED';
    responseCode: string;
    paymentInstrument: {
      type: string;
      utr?: string;
      vpa?: string;
      payerVpa?: string;
      payerAddress?: string;
    };
  };
}

interface PhonePeRefundResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantTransactionId: string;
    merchantRefundId?: string;
    merchantOrderId?: string;
    transactionId?: string;
    amount: number;
    state: 'PENDING' | 'COMPLETED' | 'FAILED';
    responseCode?: string;
    message?: string;
    paymentInstrument?: {
      type?: string;
      utr?: string;
    };
  };
}

type PhonePeRefundResponseData = NonNullable<PhonePeRefundResponse["data"]>;

/**
 * PhonePe adapter implementation
 */
export class PhonePeAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider = 'phonepe';
  public readonly environment: Environment;

  private static readonly MIN_EXPIRY_SECONDS = 300;
  private static readonly MAX_EXPIRY_SECONDS = 3600;
  private static readonly DEFAULT_EXPIRY_SECONDS = 900;
  private static readonly UPI_INSTRUMENT_TYPES: readonly PhonePeUpiInstrumentType[] = [
    'UPI_INTENT',
    'UPI_COLLECT',
    'UPI_QR',
  ];

  private readonly merchantId: string;
  private readonly salt: string;
  private readonly saltIndex: number;
  private readonly webhookSecret?: string;
  private readonly webhookAuth: PhonePeConfig["webhookAuth"];
  private readonly baseUrl: string;
  private readonly phonepeConfig: PhonePeConfig;
  private readonly defaultRedirectUrl: string;
  private readonly clientId: string;
  private readonly clientVersion: string;
  private readonly tokenManager: PhonePeTokenManager;

  constructor(config: ResolvedConfig, dependencies?: { tokenManager?: PhonePeTokenManager }) {
    this.environment = config.environment;

    // Extract configuration
    if (!config.phonepeConfig) {
      throw new PaymentError(
        'Missing PhonePe configuration bundle',
        'PHONEPE_CONFIG_MISSING',
        'phonepe'
      );
    }

    this.phonepeConfig = config.phonepeConfig;
    this.merchantId = this.phonepeConfig.merchantId || '';
    this.salt = config.secrets.salt || '';
    this.saltIndex = config.saltIndex || 1;
    this.webhookSecret = config.secrets.webhookSecret;
    this.webhookAuth = this.phonepeConfig.webhookAuth;

    this.clientId = this.phonepeConfig.client_id;
    this.clientVersion = this.phonepeConfig.client_version;
    this.defaultRedirectUrl = this.phonepeConfig.redirectUrl;

    if (!dependencies?.tokenManager) {
      throw new PaymentError(
        'Missing PhonePe token manager',
        'PHONEPE_TOKEN_MANAGER_MISSING',
        'phonepe'
      );
    }
    this.tokenManager = dependencies.tokenManager;

    // Set API base URL based on environment
    this.baseUrl = resolvePhonePeHost(this.phonepeConfig, this.environment);

    if (!this.merchantId || !this.salt) {
      throw new PaymentError(
        'Missing PhonePe credentials',
        'MISSING_CREDENTIALS',
        'phonepe'
      );
    }
  }
  
  /**
   * Create payment request with PhonePe
   */
  public async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    try {
      const merchantTransactionId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const requestedExpiry = params.providerOptions?.phonepe?.expireAfter
        ?? params.providerOptions?.phonepe?.expireAfterSeconds;
      const expireAfter = this.clampExpireAfter(requestedExpiry);

      const amountInPaise = Math.round(params.orderAmount);

      const phonepeOptions = params.providerOptions?.phonepe;
      const instrumentType = this.resolvePaymentInstrumentType(phonepeOptions);
      const paymentModeConfig = this.buildPaymentModeConfig(instrumentType);

      const paymentRequest: PhonePePaymentRequest = {
        merchantTransactionId,
        merchantId: this.merchantId,
        amount: amountInPaise, // Amount in paise
        redirectUrl: params.successUrl || this.defaultRedirectUrl,
        redirectMode: 'POST',
        callbackUrl: params.successUrl || this.defaultRedirectUrl,
        paymentFlow: {
          type: 'PG_CHECKOUT',
        },
        expireAfter,
        paymentModeConfig,
        paymentInstrument: this.buildPaymentInstrument(instrumentType),
      };
      
      // Encode payment request
      const base64Payload = Buffer.from(JSON.stringify(paymentRequest)).toString('base64');
      
      // Generate checksum
      const checksum = this.generateChecksum('/pg/v1/pay', base64Payload);
      
      const apiPayload = {
        request: base64Payload,
      };
      
      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
      };
      
      const response = await this.makeApiCall<PhonePePaymentResponse>(
        '/pg/v1/pay', 
        'POST', 
        apiPayload, 
        headers
      );
      
      if (!response.success) {
        throw new Error(`PhonePe API error: ${response.code} - ${response.message}`);
      }
      
      const result: PaymentResult = {
        paymentId: crypto.randomUUID(),
        providerPaymentId: merchantTransactionId,
        providerOrderId: response.data?.transactionId || merchantTransactionId,
        status: 'created',
        amount: params.orderAmount,
        currency: 'INR', // PhonePe only supports INR
        provider: 'phonepe',
        environment: this.environment,
        
        // PhonePe redirect or UPI collect information
        redirectUrl: response.data?.instrumentResponse?.redirectInfo?.url,
        
        providerData: {
          merchantTransactionId,
          transactionId: response.data?.transactionId,
          providerTransactionId: response.data?.transactionId,
          providerReferenceId: merchantTransactionId,
          instrumentResponse: response.data?.instrumentResponse,
          expireAfterSeconds: expireAfter,
        },

        createdAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('PhonePe payment creation failed:', error);
      throw new PaymentError(
        `PhonePe payment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_CREATION_FAILED',
        'phonepe',
        error
      );
    }
  }
  
  /**
   * Verify payment with PhonePe
   */
  public async verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult> {
    try {
      const { merchantTransactionId } = params.providerData || {};
      
      if (!merchantTransactionId) {
        throw new PaymentError('Missing PhonePe merchant transaction ID', 'MISSING_VERIFICATION_DATA', 'phonepe');
      }
      
      // Generate checksum for status check
      const checksumPayload = `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`;
      const checksum = this.generateChecksum(checksumPayload);
      
      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
      };
      
      const response = await this.makeApiCall<PhonePeStatusResponse>(
        `/pg/v1/status/${this.merchantId}/${merchantTransactionId}`,
        'GET',
        undefined,
        headers
      );
      
      if (!response.success) {
        throw new Error(`PhonePe status check error: ${response.code} - ${response.message}`);
      }
      
      const result: PaymentResult = {
        paymentId: params.paymentId,
        providerPaymentId: merchantTransactionId,
        providerOrderId: response.data?.transactionId || merchantTransactionId,
        status: this.mapPaymentStatus(response.data?.state || 'FAILED'),
        amount: response.data?.amount || 0,
        currency: 'INR',
        provider: 'phonepe',
        environment: this.environment,
        
        method: {
          type: 'upi',
          brand: 'PhonePe',
        },
        
        providerData: {
          merchantTransactionId,
          transactionId: response.data?.transactionId,
          state: response.data?.state,
          responseCode: response.data?.responseCode,
          utr: response.data?.paymentInstrument?.utr,
          upiPayerHandle:
            params.providerData?.payerVpa ||
            params.providerData?.upiPayerHandle ||
            response.data?.paymentInstrument?.vpa ||
            response.data?.paymentInstrument?.payerVpa ||
            response.data?.paymentInstrument?.payerAddress,
          providerTransactionId: response.data?.transactionId,
          providerReferenceId: merchantTransactionId,
        },
        
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('PhonePe payment verification failed:', error);
      throw new PaymentError(
        `Payment verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_VERIFICATION_FAILED',
        'phonepe',
        error
      );
    }
  }

  /**
   * Capture payment (PhonePe auto captures UPI payments)
   */
  public async capturePayment(_params: CapturePaymentParams): Promise<PaymentResult> {
    throw new PaymentError('Manual capture is not supported for PhonePe', 'CAPTURE_NOT_SUPPORTED', 'phonepe');
  }

  /**
   * Create refund with PhonePe
   */
  public async createRefund(params: CreateRefundParams): Promise<RefundResult> {
    try {
      const originalTransactionId = params.providerPaymentId || params.paymentId;
      if (!originalTransactionId) {
        throw new RefundError('Missing PhonePe transaction identifier', 'MISSING_PROVIDER_PAYMENT_ID', 'phonepe');
      }

      const normalizedMerchantRefundId = params.merchantRefundId?.trim();

      const merchantRefundId = normalizedMerchantRefundId
        || params.idempotencyKey
        || `REF_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      const originalMerchantOrderId = params.originalMerchantOrderId || params.providerPaymentId || params.paymentId;

      const refundRequest = {
        merchantId: this.merchantId,
        merchantTransactionId: merchantRefundId,
        merchantRefundId,
        originalTransactionId,
        originalMerchantOrderId,
        amount: params.amount,
        reason: params.reason,
        message: params.notes,
      };

      const response = await this.makeApiCall<PhonePeRefundResponse>(
        '/pg/v1/payments/v2/refund',
        'POST',
        refundRequest
      );

      if (!response.success) {
        throw new Error(`PhonePe refund error: ${response.code} - ${response.message}`);
      }

      const responseData: Partial<PhonePeRefundResponseData> = response.data ?? {};
      const responseAmount = typeof responseData.amount === 'number'
        ? responseData.amount
        : params.amount ?? 0;

      const result: RefundResult = {
        refundId: crypto.randomUUID(),
        paymentId: params.paymentId,
        providerRefundId: responseData.transactionId ?? responseData.merchantTransactionId ?? merchantRefundId,
        merchantRefundId,
        originalMerchantOrderId,
        amount: responseAmount,
        status: this.mapRefundStatus(responseData.state || 'PENDING'),
        provider: 'phonepe',
        environment: this.environment,

        reason: params.reason,
        notes: params.notes,

        upiUtr: responseData.paymentInstrument?.utr,

        providerData: {
          merchantTransactionId: responseData.merchantTransactionId ?? merchantRefundId,
          merchantRefundId: responseData.merchantRefundId ?? merchantRefundId,
          originalTransactionId,
          originalMerchantOrderId,
          transactionId: responseData.transactionId,
          responseCode: responseData.responseCode,
          message: responseData.message,
          paymentInstrument: responseData.paymentInstrument,
        },

        createdAt: new Date(),
      };

      return result;
      
    } catch (error) {
      console.error('PhonePe refund creation failed:', error);
      throw new RefundError(
        `Refund creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_CREATION_FAILED',
        'phonepe',
        error
      );
    }
  }
  
  /**
   * Get refund status
   */
  public async getRefundStatus(refundId: string): Promise<RefundResult> {
    try {
      // Generate checksum for refund status check
      const checksumPayload = `/pg/v1/status/${this.merchantId}/${refundId}`;
      const checksum = this.generateChecksum(checksumPayload);
      
      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
      };
      
      const response = await this.makeApiCall<PhonePeRefundResponse>(
        `/pg/v1/status/${this.merchantId}/${refundId}`,
        'GET',
        undefined,
        headers
      );
      
      if (!response.success) {
        throw new Error(`PhonePe refund status error: ${response.code} - ${response.message}`);
      }
      
      const result: RefundResult = {
        refundId: crypto.randomUUID(),
        paymentId: response.data?.transactionId || response.data?.merchantTransactionId || refundId,
        providerRefundId: refundId,
        amount: response.data?.amount || 0,
        status: this.mapRefundStatus(response.data?.state || 'PENDING'),
        provider: 'phonepe',
        environment: this.environment,
        
        providerData: {
          merchantTransactionId: refundId,
          transactionId: response.data?.transactionId,
        },
        
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      return result;
      
    } catch (error) {
      console.error('PhonePe refund status check failed:', error);
      throw new RefundError(
        `Refund status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REFUND_STATUS_CHECK_FAILED',
        'phonepe',
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
        throw new WebhookError('Webhook secret not configured', 'WEBHOOK_SECRET_MISSING', 'phonepe');
      }
      
      const signature = params.headers['x-verify'];
      if (!signature) {
        return { verified: false, error: { code: 'MISSING_SIGNATURE', message: 'Missing PhonePe signature header' } };
      }

      const authorizationHeader = params.headers['authorization'];
      const providedAuthHash = this.extractAuthorizationHash(authorizationHeader);
      if (!providedAuthHash) {
        return {
          verified: false,
          error: { code: 'MISSING_AUTHORIZATION', message: 'Missing webhook authorization header' },
        };
      }

      const expectedAuthHash = this.computeWebhookAuthHash();
      const providedBuffer = this.safeBufferFromHex(providedAuthHash);
      const expectedBuffer = this.safeBufferFromHex(expectedAuthHash);

      if (!providedBuffer || !expectedBuffer || providedBuffer.length !== expectedBuffer.length) {
        return {
          verified: false,
          error: { code: 'INVALID_AUTHORIZATION', message: 'Invalid webhook authorization hash' },
        };
      }

      let authorizationMatches = false;
      try {
        authorizationMatches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
      } catch {
        authorizationMatches = false;
      }

      if (!authorizationMatches) {
        return {
          verified: false,
          error: { code: 'INVALID_AUTHORIZATION', message: 'Invalid webhook authorization hash' },
        };
      }

      // PhonePe webhook verification
      const payload = params.body.toString();
      const isValid = this.verifyWebhookSignature(payload, signature);

      if (!isValid) {
        return { verified: false, error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } };
      }

      // Parse webhook payload
      const webhookData = JSON.parse(payload);

      const eventEnvelope = typeof webhookData.event === 'object' && webhookData.event
        ? webhookData.event
        : undefined;
      const eventPayload =
        (eventEnvelope && typeof eventEnvelope.payload === 'object' && eventEnvelope.payload)
          ? eventEnvelope.payload
          : typeof webhookData.payload === 'object' && webhookData.payload
            ? webhookData.payload
            : typeof webhookData.data === 'object' && webhookData.data
              ? webhookData.data
              : webhookData;

      const pickString = (...values: Array<unknown>): string | undefined => {
        for (const value of values) {
          if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
          }
        }
        return undefined;
      };

      const eventId = pickString(eventEnvelope?.id, webhookData.eventId, webhookData.id);
      const orderId = pickString(eventEnvelope?.orderId, (eventPayload as any)?.orderId, webhookData.orderId);
      const transactionId = pickString(
        eventEnvelope?.transactionId,
        (eventPayload as any)?.transactionId,
        (eventPayload as any)?.providerTransactionId,
        (eventPayload as any)?.merchantTransactionId,
        webhookData.transactionId,
        webhookData.merchantTransactionId
      );
      const paymentId = pickString(
        (eventPayload as any)?.merchantTransactionId,
        (eventPayload as any)?.paymentId,
        (eventPayload as any)?.providerPaymentId,
        orderId,
        transactionId
      );
      const state = pickString((eventPayload as any)?.state, eventEnvelope?.state, webhookData.state);

      const normalizedStatus = state ? this.mapPaymentStatus(state.toUpperCase()) : undefined;
      const dataPayload = typeof eventPayload === 'object' && eventPayload !== null ? eventPayload : {};

      return {
        verified: true,
        event: {
          type: pickString(eventEnvelope?.type) ?? 'payment_status_update',
          paymentId,
          status: normalizedStatus,
          data: {
            ...dataPayload,
            eventId,
            orderId,
            transactionId,
          },
        },
        providerData: webhookData,
      };
      
    } catch (error) {
      console.error('PhonePe webhook verification failed:', error);
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
      // Test API connectivity with a basic status check
      const testTransactionId = 'HEALTH_CHECK_' + Date.now();
      const checksumPayload = `/pg/v1/status/${this.merchantId}/${testTransactionId}`;
      const checksum = this.generateChecksum(checksumPayload);
      
      const headers = {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': this.merchantId,
      };
      
      // This will return a "transaction not found" error, but it proves connectivity and auth
      await this.makeApiCall(
        `/pg/v1/status/${this.merchantId}/${testTransactionId}`,
        'GET',
        undefined,
        headers
      );
      
      const responseTime = Date.now() - startTime;
      
      return {
        provider: 'phonepe',
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
      // If error code indicates authentication issues, mark as unhealthy
      const isAuthError = error instanceof Error && (
        error.message.includes('401') || 
        error.message.includes('403') ||
        error.message.includes('UNAUTHORIZED')
      );
      
      return {
        provider: 'phonepe',
        environment: this.environment,
        healthy: !isAuthError, // Connectivity errors are ok for health check
        responseTime: Date.now() - startTime,
        tests: {
          connectivity: true, // We made a connection
          authentication: !isAuthError,
          apiAccess: !isAuthError,
        },
        error: isAuthError ? {
          code: 'AUTHENTICATION_FAILED',
          message: error.message,
        } : undefined,
        timestamp: new Date(),
      };
    }
  }
  
  /**
   * Get supported payment methods
   */
  public getSupportedMethods(): PaymentMethod[] {
    return ['upi']; // PhonePe primarily supports UPI
  }
  
  /**
   * Get supported currencies
   */
  public getSupportedCurrencies(): Currency[] {
    return ['INR']; // PhonePe only supports Indian Rupee
  }
  
  /**
   * Validate configuration
   */
  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    if (!this.merchantId) {
      errors.push('Missing PhonePe Merchant ID');
    }
    
    if (!this.salt) {
      errors.push('Missing PhonePe Salt');
    }
    
    if (this.saltIndex < 1 || this.saltIndex > 10) {
      errors.push('PhonePe Salt Index must be between 1-10');
    }
    
    if (!this.webhookSecret) {
      errors.push('Missing PhonePe Webhook Secret (recommended)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  }
  
  // Helper methods
  
  /**
   * Make API call to PhonePe
   */
  private async makeApiCall<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any,
    customHeaders?: Record<string, string>,
    attempt: number = 0
  ): Promise<T> {
    const accessToken = await this.tokenManager.getAccessToken(attempt > 0);
    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': `PhonePeAdapter/${this.clientVersion}`,
      'X-CLIENT-ID': this.clientId,
      'X-CLIENT-VERSION': this.clientVersion,
      'accept': 'application/json',
      'Authorization': `O-Bearer ${accessToken}`,
      ...customHeaders,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    const rawBody = await response.text();
    let parsedBody: any = undefined;
    try {
      parsedBody = rawBody ? JSON.parse(rawBody) : undefined;
    } catch {
      parsedBody = rawBody;
    }

    const tokenExpired =
      response.status === 401 ||
      response.status === 403 ||
      (parsedBody && typeof parsedBody === 'object' && typeof parsedBody.code === 'string' && /TOKEN.*EXPIRED/i.test(parsedBody.code));

    if (tokenExpired) {
      this.tokenManager.invalidateToken();
      if (attempt === 0) {
        return this.makeApiCall<T>(endpoint, method, data, customHeaders, attempt + 1);
      }
    }

    if (!response.ok) {
      const error = typeof parsedBody === 'string' || parsedBody === undefined
        ? rawBody
        : JSON.stringify(parsedBody);
      throw new Error(`PhonePe API error: ${response.status} ${error}`);
    }

    return parsedBody as T;
  }

  private resolvePaymentInstrumentType(options: unknown): PhonePePaymentInstrumentType {
    const candidateStrings: string[] = [];

    if (typeof options === 'string') {
      candidateStrings.push(options);
    } else if (options && typeof options === 'object') {
      const optionRecord = options as Record<string, unknown>;
      const potentialKeys = [
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
      ];

      for (const key of potentialKeys) {
        const value = optionRecord[key];
        if (typeof value === 'string') {
          candidateStrings.push(value);
        }
      }
    }

    for (const candidate of candidateStrings) {
      const normalized = candidate.trim().toUpperCase().replace(/[\s-]+/g, '_');

      if (normalized === 'PAY_PAGE' || normalized === 'PAYPAGE') {
        return 'PAY_PAGE';
      }

      if (normalized === 'UPI_INTENT' || normalized === 'INTENT') {
        return 'UPI_INTENT';
      }

      if (normalized === 'UPI_COLLECT' || normalized === 'COLLECT') {
        return 'UPI_COLLECT';
      }

      if (normalized === 'UPI_QR' || normalized === 'QR' || normalized === 'QR_CODE') {
        return 'UPI_QR';
      }
    }

    return 'UPI_COLLECT';
  }

  private buildPaymentModeConfig(
    instrumentType: PhonePePaymentInstrumentType
  ): PhonePePaymentRequest['paymentModeConfig'] {
    const paymentInstruments = PhonePeAdapter.UPI_INSTRUMENT_TYPES.map((type) => ({
      type,
      enabled: instrumentType === 'PAY_PAGE' ? true : instrumentType === type,
    }));

    return {
      paymentModes: [
        {
          paymentMode: 'UPI',
          enabled: true,
          paymentInstruments,
        },
      ],
    };
  }

  private buildPaymentInstrument(
    instrumentType: PhonePePaymentInstrumentType
  ): PhonePePaymentRequest['paymentInstrument'] {
    if (instrumentType === 'PAY_PAGE') {
      return { type: 'PAY_PAGE' };
    }

    return { type: instrumentType };
  }

  private clampExpireAfter(value: unknown): number {
    const numeric = typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : undefined;

    if (numeric === undefined || !Number.isFinite(numeric)) {
      return PhonePeAdapter.DEFAULT_EXPIRY_SECONDS;
    }

    const rounded = Math.floor(numeric);
    if (rounded < PhonePeAdapter.MIN_EXPIRY_SECONDS) {
      return PhonePeAdapter.MIN_EXPIRY_SECONDS;
    }
    if (rounded > PhonePeAdapter.MAX_EXPIRY_SECONDS) {
      return PhonePeAdapter.MAX_EXPIRY_SECONDS;
    }
    return rounded;
  }

  /**
   * Generate PhonePe checksum
   */
  private generateChecksum(endpoint: string, payload: string = ''): string {
    const stringToHash = `${payload}${endpoint}${this.salt}`;
    const hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return `${hash}###${this.saltIndex}`;
  }

  private verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) {
      return false;
    }

    const [signatureHash] = signature.split('###');
    if (!signatureHash) {
      return false;
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload, 'utf8')
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(signatureHash, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  private computeWebhookAuthHash(): string {
    const { username, password } = this.webhookAuth;
    return crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
  }

  private extractAuthorizationHash(header?: string): string | null {
    if (!header) {
      return null;
    }

    const trimmed = header.trim();
    if (!trimmed) {
      return null;
    }

    const bearerMatch = trimmed.match(/^(?:Bearer|Basic)\s+(.+)$/i);
    if (bearerMatch) {
      return bearerMatch[1].trim();
    }

    return trimmed;
  }

  private safeBufferFromHex(value: string): Buffer | null {
    if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
      return null;
    }

    try {
      return Buffer.from(value, 'hex');
    } catch {
      return null;
    }
  }
  
  /**
   * Map PhonePe payment status to our status
   */
  private mapPaymentStatus(state: string): PaymentStatus {
    const normalized = state.trim().toUpperCase();

    switch (normalized) {
      case 'PENDING':
      case 'INITIATED':
      case 'IN_PROGRESS':
      case 'AWAITING_PAYMENT':
        return 'processing';
      case 'AUTHORIZED':
      case 'AUTHORISED':
        return 'authorized';
      case 'COMPLETED':
      case 'CAPTURED':
      case 'SUCCESS':
      case 'SUCCEEDED':
        return 'captured';
      case 'FAILED':
      case 'DECLINED':
      case 'REJECTED':
      case 'ERROR':
        return 'failed';
      case 'CANCELLED':
      case 'CANCELED':
      case 'TIMEDOUT':
      case 'TIMED_OUT':
      case 'TIMEOUT':
      case 'EXPIRED':
      case 'ABORTED':
      case 'USER_CANCELLED':
        return 'cancelled';
      case 'REFUNDED':
        return 'refunded';
      case 'PARTIALLY_REFUNDED':
        return 'partially_refunded';
      case 'CREATED':
        return 'created';
      default:
        return 'processing';
    }
  }
  
  /**
   * Map PhonePe refund status to our status
   */
  private mapRefundStatus(state: string): RefundStatus {
    switch (state) {
      case 'PENDING': return 'pending';
      case 'COMPLETED': return 'completed';
      case 'FAILED': return 'failed';
      default: return 'pending';
    }
  }
}