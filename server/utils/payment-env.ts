/**
 * Utility functions for dynamically reading payment provider environment variables
 */

export interface PhonePeEnvironmentConfig {
  merchantId?: string;
  salt?: string;
  saltIndex?: string;
  clientId?: string;
  clientSecret?: string;
  clientVersion?: string;
  webhookSecret?: string;
  webhookUsername?: string;
  webhookPassword?: string;
  redirectUrl?: string;
  hostUat?: string;
  hostProd?: string;
}

export interface PaymentProviderEnvVars {
  publicKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  phonepe?: {
    test: PhonePeEnvironmentConfig;
    live: PhonePeEnvironmentConfig;
  };
  [key: string]: any;
}

const stripUndefined = <T extends Record<string, any>>(source: T): Partial<T> => {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== null)
  );
};

/**
 * Get environment variables for a payment provider using dynamic naming
 * Pattern: VITE_<PAYMENTPROVIDERNAME>_PUBLIC_KEY, <PAYMENTPROVIDERNAME>_SECRET_KEY
 */
export function getPaymentProviderEnvVars(providerName: string): PaymentProviderEnvVars {
  const upperProviderName = providerName.toUpperCase();

  const base: PaymentProviderEnvVars = {
    publicKey: process.env[`VITE_${upperProviderName}_PUBLIC_KEY`],
    secretKey: process.env[`${upperProviderName}_SECRET_KEY`],
    // Add other common patterns as needed
    webhookSecret: process.env[`${upperProviderName}_WEBHOOK_SECRET`],
  };

  if (providerName.toLowerCase() === 'phonepe') {
    const buildEnv = (env: 'TEST' | 'LIVE'): PhonePeEnvironmentConfig => {
      const prefix = `PAYAPP_${env}_${upperProviderName}_`;
      return {
        merchantId: process.env[`${prefix}MERCHANT_ID`],
        salt: process.env[`${prefix}SALT`],
        saltIndex: process.env[`${prefix}SALT_INDEX`],
        clientId: process.env[`${prefix}CLIENT_ID`],
        clientSecret: process.env[`${prefix}CLIENT_SECRET`],
        clientVersion: process.env[`${prefix}CLIENT_VERSION`],
        webhookSecret: process.env[`${prefix}WEBHOOK_SECRET`],
        webhookUsername: process.env[`${prefix}WEBHOOK_USERNAME`],
        webhookPassword: process.env[`${prefix}WEBHOOK_PASSWORD`],
        redirectUrl: process.env[`${prefix}REDIRECT_URL`],
        hostUat: process.env[`${prefix}HOST_UAT`],
        hostProd: process.env[`${prefix}HOST_PROD`],
      };
    };

    base.phonepe = {
      test: buildEnv('TEST'),
      live: buildEnv('LIVE'),
    };
  }

  return base;
}

/**
 * Merge database settings with environment variables
 * Environment variables take precedence over database settings
 */
export function mergeProviderCredentials(
  providerName: string,
  dbSettings: Record<string, any> = {}
): Record<string, any> {
  const envVars = getPaymentProviderEnvVars(providerName);
  
  // Merge with database settings, env vars take precedence
  const merged = { ...dbSettings };
  
  if (envVars.publicKey) {
    merged.publicKey = envVars.publicKey;
  }
  
  if (envVars.secretKey) {
    merged.secretKey = envVars.secretKey;
  }
  
  if (envVars.webhookSecret) {
    merged.webhookSecret = envVars.webhookSecret;
  }

  if (envVars.phonepe) {
    const dbPhonePe = dbSettings.phonepe || {};
    merged.phonepe = {
      test: {
        ...(dbPhonePe.test || {}),
        ...stripUndefined(envVars.phonepe.test || {}),
      },
      live: {
        ...(dbPhonePe.live || {}),
        ...stripUndefined(envVars.phonepe.live || {}),
      },
    };
  }

  return merged;
}

/**
 * Validate that required credentials are present for a provider
 */
export function validateProviderCredentials(
  providerName: string,
  credentials: Record<string, any>,
  requiredFields: string[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    if (!credentials[field]) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Get specific provider credential mappings
 */
export function getProviderCredentialMapping(providerName: string): Record<string, string> {
  switch (providerName.toLowerCase()) {
    case 'stripe':
      return {
        publicKey: 'VITE_STRIPE_PUBLIC_KEY',
        secretKey: 'STRIPE_SECRET_KEY'
      };
    case 'phonepe':
      return {
        merchantId: 'VITE_PHONEPE_PUBLIC_KEY', // Merchant ID acts as public key for PhonePe
        saltKey: 'PHONEPE_SECRET_KEY' // Salt key acts as secret key for PhonePe
      };
    default:
      return {};
  }
}