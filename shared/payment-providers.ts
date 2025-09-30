import { z } from "zod";

// Payment provider enum - exactly 8 providers as specified
export const PaymentProviderEnum = z.enum([
  'razorpay',
  'payu', 
  'ccavenue',
  'cashfree',
  'paytm',
  'billdesk',
  'phonepe',
  'stripe'
]);

export type PaymentProvider = z.infer<typeof PaymentProviderEnum>;

// Environment enum
export const EnvironmentEnum = z.enum(['test', 'live']);
export type Environment = z.infer<typeof EnvironmentEnum>;

export interface PhonePeConfig {
  client_id: string;
  client_secret: string;
  client_version: string;
  merchantId: string;
  webhookAuth: {
    username: string;
    password: string;
  };
  redirectUrl: string;
  hosts: {
    uat: string;
    prod: string;
  };
}

// Capability matrix interface
export interface ProviderCapabilities {
  cards: boolean;
  upi: boolean;
  netbanking: boolean;
  wallets: boolean;
  refunds: boolean;
  payouts: boolean;
  tokenization: boolean;
  international: boolean;
  webhooks: boolean;
}

// Capability matrix for each provider - TASK 2 specification
export const capabilityMatrix: Record<PaymentProvider, ProviderCapabilities> = {
  razorpay: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: true,
    refunds: true,
    payouts: true,
    tokenization: true,
    international: true,
    webhooks: true,
  },
  payu: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: true,
    refunds: true,
    payouts: false,
    tokenization: true,
    international: false,
    webhooks: true,
  },
  ccavenue: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: true,
    refunds: true,
    payouts: false,
    tokenization: true,
    international: true,
    webhooks: true,
  },
  cashfree: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: true,
    refunds: true,
    payouts: true,
    tokenization: true,
    international: false,
    webhooks: true,
  },
  paytm: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: true,
    refunds: true,
    payouts: true,
    tokenization: false,
    international: false,
    webhooks: true,
  },
  billdesk: {
    cards: true,
    upi: true,
    netbanking: true,
    wallets: false,
    refunds: true,
    payouts: false,
    tokenization: false,
    international: false,
    webhooks: true,
  },
  phonepe: {
    cards: false,
    upi: true,
    netbanking: false,
    wallets: false,
    refunds: true,
    payouts: false,
    tokenization: false,
    international: false,
    webhooks: true,
  },
  stripe: {
    cards: true,
    upi: false,
    netbanking: false,
    wallets: true,
    refunds: true,
    payouts: true,
    tokenization: true,
    international: true,
    webhooks: true,
  },
};

// Provider display names
export const providerDisplayNames: Record<PaymentProvider, string> = {
  razorpay: 'Razorpay',
  payu: 'PayU',
  ccavenue: 'CCAvenue',
  cashfree: 'Cashfree',
  paytm: 'Paytm',
  billdesk: 'BillDesk',
  phonepe: 'PhonePe',
  stripe: 'Stripe',
};

// Required environment variable mapping for PAYAPP_* pattern
export const providerSecretKeys: Record<PaymentProvider, {
  test: string[];
  live: string[];
}> = {
  razorpay: {
    test: ['PAYAPP_TEST_RAZORPAY_KEY_SECRET', 'PAYAPP_TEST_RAZORPAY_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_RAZORPAY_KEY_SECRET', 'PAYAPP_LIVE_RAZORPAY_WEBHOOK_SECRET'],
  },
  payu: {
    test: ['PAYAPP_TEST_PAYU_SALT'],
    live: ['PAYAPP_LIVE_PAYU_SALT'],
  },
  ccavenue: {
    test: ['PAYAPP_TEST_CCAVENUE_WORKING_KEY'],
    live: ['PAYAPP_LIVE_CCAVENUE_WORKING_KEY'],
  },
  cashfree: {
    test: ['PAYAPP_TEST_CASHFREE_SECRET_KEY', 'PAYAPP_TEST_CASHFREE_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_CASHFREE_SECRET_KEY', 'PAYAPP_LIVE_CASHFREE_WEBHOOK_SECRET'],
  },
  paytm: {
    test: ['PAYAPP_TEST_PAYTM_MERCHANT_KEY'],
    live: ['PAYAPP_LIVE_PAYTM_MERCHANT_KEY'],
  },
  billdesk: {
    test: ['PAYAPP_TEST_BILLDESK_CHECKSUM_KEY'],
    live: ['PAYAPP_LIVE_BILLDESK_CHECKSUM_KEY'],
  },
  phonepe: {
    test: [
      'PAYAPP_TEST_PHONEPE_SALT',
      'PAYAPP_TEST_PHONEPE_WEBHOOK_SECRET',
      'PAYAPP_TEST_PHONEPE_CLIENT_ID',
      'PAYAPP_TEST_PHONEPE_CLIENT_SECRET',
      'PAYAPP_TEST_PHONEPE_CLIENT_VERSION',
      'PAYAPP_TEST_PHONEPE_WEBHOOK_USERNAME',
      'PAYAPP_TEST_PHONEPE_WEBHOOK_PASSWORD',
      'PAYAPP_TEST_PHONEPE_HOST_UAT',
      'PAYAPP_TEST_PHONEPE_HOST_PROD',
      'PAYAPP_TEST_PHONEPE_REDIRECT_URL',
    ],
    live: [
      'PAYAPP_LIVE_PHONEPE_SALT',
      'PAYAPP_LIVE_PHONEPE_WEBHOOK_SECRET',
      'PAYAPP_LIVE_PHONEPE_CLIENT_ID',
      'PAYAPP_LIVE_PHONEPE_CLIENT_SECRET',
      'PAYAPP_LIVE_PHONEPE_CLIENT_VERSION',
      'PAYAPP_LIVE_PHONEPE_WEBHOOK_USERNAME',
      'PAYAPP_LIVE_PHONEPE_WEBHOOK_PASSWORD',
      'PAYAPP_LIVE_PHONEPE_HOST_UAT',
      'PAYAPP_LIVE_PHONEPE_HOST_PROD',
      'PAYAPP_LIVE_PHONEPE_REDIRECT_URL',
    ],
  },
  stripe: {
    test: ['PAYAPP_TEST_STRIPE_SECRET_KEY', 'PAYAPP_TEST_STRIPE_WEBHOOK_SECRET'],
    live: ['PAYAPP_LIVE_STRIPE_SECRET_KEY', 'PAYAPP_LIVE_STRIPE_WEBHOOK_SECRET'],
  },
};

// Provider configuration schema for database (non-secrets only)
export const providerConfigSchema = z.object({
  provider: PaymentProviderEnum,
  environment: EnvironmentEnum,
  isEnabled: z.boolean().default(false),
  displayName: z.string().optional(),
  
  // Non-secret identifiers based on provider requirements
  keyId: z.string().optional(), // Razorpay key_id, public keys
  merchantId: z.string().optional(), // Merchant identifier
  accessCode: z.string().optional(), // CCAvenue access code
  appId: z.string().optional(), // Cashfree app_id
  publishableKey: z.string().optional(), // Stripe publishable key
  saltIndex: z.number().int().min(1).max(10).optional(), // PhonePe salt index
  accountId: z.string().optional(), // Provider account identifier
  
  // URLs
  successUrl: z.string().url().optional(),
  failureUrl: z.string().url().optional(), 
  webhookUrl: z.string().url().optional(),
  
  // Metadata
  capabilities: z.record(z.boolean()).default({}),
  metadata: z.record(z.any()).default({}),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;

// Helper function to get required secrets for a provider
export function getRequiredSecrets(provider: PaymentProvider, environment: Environment): string[] {
  return providerSecretKeys[provider][environment];
}

// Helper function to get capabilities for a provider
export function getProviderCapabilities(provider: PaymentProvider): ProviderCapabilities {
  return capabilityMatrix[provider];
}

// Helper function to get display name
export function getProviderDisplayName(provider: PaymentProvider): string {
  return providerDisplayNames[provider];
}