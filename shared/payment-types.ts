/**
 * TASK 4: Unified TypeScript interfaces for provider-agnostic payment system
 * 
 * These interfaces ensure consistency across all 8 payment providers
 * and provide a standardized API for the payment system.
 */

import type { PaymentProvider, Environment } from "./payment-providers";

export type PaymentLifecycleStatus =
  | 'CREATED'
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED';

const pendingLifecycleAliases = new Set([
  'PENDING',
  'PROCESSING',
  'INITIATED',
  'REQUIRES_ACTION',
  'AUTHORIZED',
  'AUTH_SUCCESS',
  'IN_PROGRESS',
]);

const completedLifecycleAliases = new Set([
  'COMPLETED',
  'CAPTURED',
  'SUCCESS',
  'SUCCEEDED',
  'PAID',
  'SETTLED',
]);

const failedLifecycleAliases = new Set([
  'FAILED',
  'FAILURE',
  'CANCELLED',
  'CANCELED',
  'TIMEOUT',
  'TIMED_OUT',
  'TIMEDOUT',
  'EXPIRED',
  'DECLINED',
  'DENIED',
  'ERROR',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'ABORTED',
  'USER_CANCELLED',
]);

export function normalizePaymentLifecycleStatus(
  status: string | null | undefined
): PaymentLifecycleStatus {
  if (!status) {
    return 'CREATED';
  }

  const normalized = status.toString().trim().toUpperCase();

  if (!normalized) {
    return 'CREATED';
  }

  if (completedLifecycleAliases.has(normalized)) {
    return 'COMPLETED';
  }

  if (failedLifecycleAliases.has(normalized)) {
    return 'FAILED';
  }

  if (pendingLifecycleAliases.has(normalized)) {
    return 'PENDING';
  }

  if (normalized === 'CREATED') {
    return 'CREATED';
  }

  return 'PENDING';
}

export function canTransitionPaymentLifecycle(
  current: PaymentLifecycleStatus,
  next: PaymentLifecycleStatus
): boolean {
  if (current === next) {
    return false;
  }

  if (current === 'COMPLETED' || current === 'FAILED') {
    return false;
  }

  if (current === 'CREATED') {
    return next === 'PENDING' || next === 'COMPLETED' || next === 'FAILED';
  }

  if (current === 'PENDING') {
    return next === 'COMPLETED' || next === 'FAILED';
  }

  return false;
}

// Base types for common payment fields
export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP';
export type PaymentStatus = 'created' | 'initiated' | 'processing' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded' | 'partially_refunded';
export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type PaymentMethod = 'card' | 'upi' | 'netbanking' | 'wallet' | 'emi' | 'paylater' | 'qr';

/**
 * Parameters for creating a payment
 */
export interface CreatePaymentParams {
  // Order identification
  orderId: string;
  orderAmount: number; // Amount in minor units (paise for INR)
  currency: Currency;
  tenantId?: string;
  
  // Customer information
  customer: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  
  // Billing details
  billing?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  
  // Shipping details (if different from billing)
  shipping?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  
  // Payment preferences
  allowedMethods?: PaymentMethod[];
  preferredMethod?: PaymentMethod;
  
  // URLs for redirects
  successUrl?: string;
  failureUrl?: string;
  cancelUrl?: string;
  
  // Additional metadata
  description?: string;
  metadata?: Record<string, any>;
  
  // Provider-specific options
  providerOptions?: Record<string, any>;
  
  // Idempotency
  idempotencyKey?: string;
}

/**
 * Result of payment creation/initiation
 */
export interface PaymentResult {
  // Payment identification
  paymentId: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  
  // Status and details
  status: PaymentStatus;
  amount: number; // Amount in minor units
  currency: Currency;
  
  // Provider details
  provider: PaymentProvider;
  environment: Environment;
  
  // Payment method information
  method?: {
    type: PaymentMethod;
    brand?: string; // Visa, MasterCard, etc.
    last4?: string; // Last 4 digits for cards
  };
  
  // Redirect/action information
  redirectUrl?: string;
  qrCodeData?: string;
  
  // Provider-specific response data
  providerData?: Record<string, any>;
  
  // Error information (if failed)
  error?: {
    code: string;
    message: string;
    description?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Parameters for payment verification
 */
export interface VerifyPaymentParams {
  paymentId: string;
  providerPaymentId?: string;
  providerData?: Record<string, any>; // Callback/webhook data
}

/**
 * Parameters for refund creation
 */
export interface CreateRefundParams {
  paymentId: string;
  providerPaymentId?: string;
  amount?: number; // Amount in minor units (if partial refund)
  reason?: string;
  notes?: string;
  idempotencyKey?: string;
}

/**
 * Parameters for capturing an authorized payment
 */
export interface CapturePaymentParams {
  paymentId: string; // Internal payment identifier
  providerPaymentId?: string; // Gateway-specific payment identifier
  amount?: number; // Amount in minor units (for partial capture)
}

/**
 * Result of refund operation
 */
export interface RefundResult {
  // Refund identification
  refundId: string;
  paymentId: string;
  providerRefundId?: string;
  
  // Amount and status
  amount: number; // Amount in minor units
  status: RefundStatus;
  
  // Provider details
  provider: PaymentProvider;
  environment: Environment;
  
  // Additional information
  reason?: string;
  notes?: string;
  
  // Provider-specific response data
  providerData?: Record<string, any>;
  
  // Error information (if failed)
  error?: {
    code: string;
    message: string;
    description?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt?: Date;
  processedAt?: Date;
}

/**
 * Parameters for webhook verification
 */
export interface WebhookVerifyParams {
  provider: PaymentProvider;
  environment: Environment;
  headers: Record<string, string>;
  body: string | Buffer;
  signature?: string;
}

/**
 * Result of webhook verification
 */
export interface WebhookVerifyResult {
  // Verification status
  verified: boolean;
  
  // Event information
  event?: {
    type: string;
    paymentId?: string;
    refundId?: string;
    status?: PaymentStatus | RefundStatus;
    data: Record<string, any>;
  };
  
  // Error information
  error?: {
    code: string;
    message: string;
  };
  
  // Provider-specific data
  providerData?: Record<string, any>;
}

/**
 * Health check parameters
 */
export interface HealthCheckParams {
  provider: PaymentProvider;
  environment: Environment;
  timeout?: number; // Timeout in milliseconds
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  provider: PaymentProvider;
  environment: Environment;
  healthy: boolean;
  responseTime?: number; // Response time in milliseconds
  
  // Test results
  tests: {
    connectivity: boolean;
    authentication: boolean;
    apiAccess: boolean;
  };
  
  // Error information
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  
  timestamp: Date;
}

/**
 * Main adapter interface that all payment providers must implement
 */
export interface PaymentsAdapter {
  // Provider identification
  readonly provider: PaymentProvider;
  readonly environment: Environment;

  // Core payment operations
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<PaymentResult>;
  capturePayment(params: CapturePaymentParams): Promise<PaymentResult>;

  // Refund operations
  createRefund(params: CreateRefundParams): Promise<RefundResult>;
  getRefundStatus(refundId: string): Promise<RefundResult>;
  
  // Webhook operations
  verifyWebhook(params: WebhookVerifyParams): Promise<WebhookVerifyResult>;
  
  // Health check
  healthCheck(params?: HealthCheckParams): Promise<HealthCheckResult>;
  
  // Provider capabilities
  getSupportedMethods(): PaymentMethod[];
  getSupportedCurrencies(): Currency[];
  
  // Configuration validation
  validateConfig(): Promise<{ valid: boolean; errors: string[] }>;
}

/**
 * Payment service configuration
 */
export interface PaymentServiceConfig {
  defaultProvider?: PaymentProvider;
  fallbackProviders?: PaymentProvider[];
  environment: Environment;
  retryAttempts?: number;
  timeout?: number; // Request timeout in milliseconds
}

/**
 * Payment event for audit trail
 */
export interface PaymentEvent {
  id: string;
  paymentId?: string;
  refundId?: string;
  tenantId: string;
  provider: PaymentProvider;
  environment: Environment;
  type: string;
  status?: PaymentStatus | RefundStatus;
  data: Record<string, any>;
  timestamp: Date;
  source: 'api' | 'webhook' | 'system';
}

/**
 * Webhook processing result
 */
export interface WebhookProcessResult {
  processed: boolean;
  eventId?: string;
  paymentUpdated?: boolean;
  refundUpdated?: boolean;
  error?: string;
}

/**
 * Payment gateway configuration (non-secret data only)
 */
export interface GatewayConfig {
  provider: PaymentProvider;
  environment: Environment;
  enabled: boolean;
  tenantId?: string;

  // Non-secret configuration
  merchantId?: string;
  keyId?: string; // Public key identifiers
  accessCode?: string;
  appId?: string;
  publishableKey?: string;
  saltIndex?: number;
  accountId?: string;
  
  // URLs
  successUrl?: string;
  failureUrl?: string;
  webhookUrl?: string;
  
  // Capabilities override
  capabilities?: Record<string, boolean>;
  
  // Additional metadata
  metadata?: Record<string, any>;
}

/**
 * Provider factory interface
 */
export interface PaymentAdapterFactory {
  createAdapter(provider: PaymentProvider, environment: Environment, tenantId: string): Promise<PaymentsAdapter>;
  getSupportedProviders(): PaymentProvider[];
  isProviderSupported(provider: PaymentProvider): boolean;
}

/**
 * Idempotency key service interface
 */
export interface IdempotencyService {
  generateKey(scope: string): string;
  checkKey(key: string, scope: string): Promise<{ exists: boolean; response?: any }>;
  storeResponse(key: string, scope: string, response: any): Promise<void>;
  executeWithIdempotency<T>(key: string, scope: string, operation: () => Promise<T>): Promise<T>;
  invalidateKey(key: string, scope: string): Promise<void>;
  cleanupExpired(): Promise<number>; // Returns number of cleaned up keys
}

/**
 * Error types for payment system
 */
export class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: PaymentProvider,
    public providerError?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export class RefundError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: PaymentProvider,
    public providerError?: any
  ) {
    super(message);
    this.name = 'RefundError';
  }
}

export class WebhookError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider?: PaymentProvider,
    public providerError?: any
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public provider?: PaymentProvider,
    public missingKeys?: string[]
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}