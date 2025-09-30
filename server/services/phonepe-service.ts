import crypto from 'crypto';
import type { Environment, PhonePeConfig } from '../../shared/payment-providers';
import { PhonePeTokenManager } from './phonepe-token-manager';

export interface PhonePeCredentials {
  saltKey: string;
  saltIndex: number;
}

export interface PhonePeServiceOptions {
  config: PhonePeConfig;
  credentials: PhonePeCredentials;
  environment: Environment;
  tokenManager: PhonePeTokenManager;
}

export interface PaymentRequest {
  merchantTransactionId: string;
  amount: number; // in paise (₹1 = 100 paise)
  merchantUserId: string;
  redirectUrl: string;
  redirectMode: 'GET' | 'POST';
  callbackUrl: string;
  mobileNumber?: string;
  paymentInstrument?: {
    type: 'PAY_PAGE';
  };
}

export interface PaymentResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantId: string;
    merchantTransactionId: string;
    transactionId: string;
    amount: number;
    state: 'PENDING' | 'COMPLETED' | 'FAILED';
    responseCode: string;
    paymentInstrument?: {
      type: string;
      utr?: string;
    };
  };
}

export interface PaymentStatusResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantId: string;
    merchantTransactionId: string;
    transactionId: string;
    amount: number;
    state: 'PENDING' | 'COMPLETED' | 'FAILED';
    responseCode: string;
    paymentInstrument?: {
      type: string;
      utr?: string;
    };
  };
}

export class PhonePeService {
  private readonly config: PhonePeConfig;
  private readonly credentials: PhonePeCredentials;
  private readonly environment: Environment;
  private readonly apiHost: string;
  private readonly tokenManager: PhonePeTokenManager;

  constructor(options: PhonePeServiceOptions) {
    this.config = options.config;
    this.credentials = options.credentials;
    this.environment = options.environment;
    this.tokenManager = options.tokenManager;
    this.apiHost = this.environment === 'live'
      ? this.config.hosts.prod
      : this.config.hosts.uat;
  }

  /**
   * Generate X-VERIFY header for PhonePe API authentication
   * @param payload - Base64 encoded request payload
   * @param endpoint - API endpoint path
   * @returns X-VERIFY header value
   */
  private generateXVerifyHeader(payload: string, endpoint: string): string {
    const stringToHash = payload + endpoint + this.credentials.saltKey;
    const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256Hash}###${this.credentials.saltIndex}`;
  }

  /**
   * Create a payment request with PhonePe
   * @param paymentData - Payment request data
   * @returns Payment response from PhonePe
   */
  async createPayment(paymentData: PaymentRequest): Promise<PaymentResponse> {
    try {
      const requestPayload = {
        merchantId: this.config.merchantId,
        merchantTransactionId: paymentData.merchantTransactionId,
        merchantUserId: paymentData.merchantUserId,
        amount: paymentData.amount,
        redirectUrl: paymentData.redirectUrl || this.config.redirectUrl,
        redirectMode: paymentData.redirectMode,
        callbackUrl: paymentData.callbackUrl,
        mobileNumber: paymentData.mobileNumber,
        paymentInstrument: paymentData.paymentInstrument || {
          type: 'PAY_PAGE'
        }
      };

      // Base64 encode the request payload
      const base64Payload = Buffer.from(JSON.stringify(requestPayload)).toString('base64');
      
      // Generate X-VERIFY header
      const endpoint = '/pg/v1/pay';
      const xVerifyHeader = this.generateXVerifyHeader(base64Payload, endpoint);

      return await this.makeAuthorizedRequest<PaymentResponse>(endpoint, {
        method: 'POST',
        headers: {
          'X-VERIFY': xVerifyHeader,
          'accept': 'application/json'
        },
        body: JSON.stringify({
          request: base64Payload
        })
      });
    } catch (error) {
      console.error('PhonePe payment creation failed:', error);
      throw new Error(`Payment creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check payment status with PhonePe
   * @param merchantTransactionId - Merchant transaction ID
   * @returns Payment status response from PhonePe
   */
  async checkPaymentStatus(merchantTransactionId: string): Promise<PaymentStatusResponse> {
    try {
      const endpoint = `/pg/v1/status/${this.config.merchantId}/${merchantTransactionId}`;
      
      // For status check, we need to hash the endpoint + salt key (no payload)
      const stringToHash = endpoint + this.credentials.saltKey;
      const sha256Hash = crypto.createHash('sha256').update(stringToHash).digest('hex');
      const xVerifyHeader = `${sha256Hash}###${this.credentials.saltIndex}`;

      return await this.makeAuthorizedRequest<PaymentStatusResponse>(endpoint, {
        method: 'GET',
        headers: {
          'X-VERIFY': xVerifyHeader,
          'accept': 'application/json'
        }
      });
    } catch (error) {
      console.error('PhonePe status check failed:', error);
      throw new Error(`Payment status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify webhook callback from PhonePe
   * @param xVerifyHeader - X-VERIFY header from webhook
   * @param responseBody - Base64 encoded response body
   * @returns Whether the webhook is valid
   */
  verifyCallback(xVerifyHeader: string, responseBody: string): boolean {
    try {
      const [receivedHash, receivedSaltIndex] = xVerifyHeader.split('###');
      
      if (parseInt(receivedSaltIndex) !== this.credentials.saltIndex) {
        return false;
      }

      const stringToHash = responseBody + this.credentials.saltKey;
      const expectedHash = crypto.createHash('sha256').update(stringToHash).digest('hex');
      
      return receivedHash === expectedHash;
    } catch (error) {
      console.error('PhonePe callback verification failed:', error);
      return false;
    }
  }

  /**
   * Decode base64 response from PhonePe
   * @param base64Response - Base64 encoded response
   * @returns Decoded response object
   */
  decodeResponse(base64Response: string): any {
    try {
      const decodedString = Buffer.from(base64Response, 'base64').toString('utf-8');
      return JSON.parse(decodedString);
    } catch (error) {
      console.error('Failed to decode PhonePe response:', error);
      throw new Error('Invalid response format');
    }
  }

  /**
   * Generate a unique merchant transaction ID
   * @param prefix - Optional prefix for the transaction ID
   * @returns Unique merchant transaction ID
   */
  static generateTransactionId(prefix: string = 'TXN'): string {
    const timestamp = Date.now();
    const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}_${timestamp}_${randomSuffix}`;
  }

  /**
   * Validate payment amount (must be in paise, minimum ₹1)
   * @param amount - Amount in paise
   * @returns Whether the amount is valid
   */
  static isValidAmount(amount: number): boolean {
    return amount >= 100 && Number.isInteger(amount); // Minimum ₹1 = 100 paise
  }

  /**
   * Convert rupees to paise
   * @param rupees - Amount in rupees
   * @returns Amount in paise
   */
  static rupeesToPaise(rupees: number): number {
    return Math.round(rupees * 100);
  }

  /**
   * Convert paise to rupees
   * @param paise - Amount in paise
   * @returns Amount in rupees
   */
  static paiseToRupees(paise: number): number {
    return paise / 100;
  }

  private async makeAuthorizedRequest<T>(
    endpoint: string,
    init: RequestInit,
    attempt: number = 0
  ): Promise<T> {
    const accessToken = await this.tokenManager.getAccessToken(attempt > 0);
    const normalizedHeaders = new Headers({
      'Content-Type': 'application/json',
      'accept': 'application/json',
    });
    if (init.headers) {
      const provided = new Headers(init.headers);
      provided.forEach((value, key) => normalizedHeaders.set(key, value));
    }
    normalizedHeaders.set('Authorization', `O-Bearer ${accessToken}`);

    const response = await fetch(`${this.apiHost}${endpoint}`, {
      ...init,
      headers: normalizedHeaders,
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
        return this.makeAuthorizedRequest<T>(endpoint, init, attempt + 1);
      }
    }

    if (!response.ok) {
      const errorMessage = typeof parsedBody === 'string' || parsedBody === undefined
        ? rawBody
        : JSON.stringify(parsedBody);
      throw new Error(`PhonePe API Error: ${response.status} - ${errorMessage || 'Unknown error'}`);
    }

    return parsedBody as T;
  }
}