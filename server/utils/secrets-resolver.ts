/**
 * TASK 3: SecretsResolver for PAYAPP_* environment variable pattern
 * 
 * This utility resolves payment provider secrets from environment variables
 * using the PAYAPP_TEST_/PAYAPP_LIVE_ naming convention.
 * 
 * Security: No secrets are stored in database - only retrieved from environment.
 */

// Import types from our shared schema
import type {
  PaymentProvider,
  Environment,
  PhonePeConfig,
  PhonePeHosts,
  PhonePeHostSelection,
} from "../../shared/payment-providers";
import { PHONEPE_DEFAULT_HOSTS } from "../../shared/payment-providers";
import { ConfigurationError } from "../../shared/payment-types";

interface PhonePeSecretConfig {
  client_id: PhonePeConfig["client_id"];
  client_secret: PhonePeConfig["client_secret"];
  client_version: PhonePeConfig["client_version"];
  webhookAuth: PhonePeConfig["webhookAuth"];
  hosts: PhonePeHosts;
  activeHost?: PhonePeHostSelection;
  redirectUrl?: PhonePeConfig["redirectUrl"];
  merchantId?: PhonePeConfig["merchantId"];
}

/**
 * Interface for provider secrets resolved from environment variables
 */
export interface ProviderSecrets {
  // Core authentication secrets (provider-specific)
  keySecret?: string;          // Razorpay key_secret, Stripe secret_key, etc.
  webhookSecret?: string;      // Webhook signature verification secret
  salt?: string;               // PayU, PhonePe, Paytm salt/key
  workingKey?: string;         // CCAvenue working key
  checksumKey?: string;        // BillDesk checksum key
  merchantKey?: string;        // Paytm merchant key
  
  // Additional configuration
  saltIndex?: number;          // PhonePe salt index

  // Structured provider configs
  phonepe?: PhonePeSecretConfig;
  
  // Computed from environment variables
  environmentPrefix: string;   // 'PAYAPP_TEST_' or 'PAYAPP_LIVE_'
  provider: PaymentProvider;
  environment: Environment;
}

/**
 * SecretsResolver class for managing PAYAPP_* environment variables
 */
export class SecretsResolver {
  private static instance: SecretsResolver;
  
  // Cache resolved secrets to avoid re-reading env vars repeatedly
  private secretsCache = new Map<string, ProviderSecrets>();
  
  private constructor() {}
  
  /**
   * Get singleton instance of SecretsResolver
   */
  public static getInstance(): SecretsResolver {
    if (!SecretsResolver.instance) {
      SecretsResolver.instance = new SecretsResolver();
    }
    return SecretsResolver.instance;
  }
  
  /**
   * Get environment variable prefix for provider and environment
   */
  private getEnvPrefix(provider: PaymentProvider, environment: Environment): string {
    return `PAYAPP_${environment.toUpperCase()}_${provider.toUpperCase()}_`;
  }
  
  /**
   * Resolve secrets for a specific provider and environment
   */
  public resolveSecrets(provider: PaymentProvider, environment: Environment): ProviderSecrets {
    const cacheKey = `${provider}_${environment}`;

    // Return cached secrets if available
    if (this.secretsCache.has(cacheKey)) {
      return this.secretsCache.get(cacheKey)!;
    }

    const environmentPrefix = this.getEnvPrefix(provider, environment);
    const requiredEnvVars = this.getRequiredEnvVars(provider, environment);

    const resolvedEnvValues: Record<string, string> = {};
    const missingSecrets: string[] = [];

    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      if (typeof value === "string" && value.trim() !== "") {
        resolvedEnvValues[envVar] = value.trim();
      } else {
        missingSecrets.push(envVar);
      }
    }

    if (missingSecrets.length > 0) {
      throw new ConfigurationError(
        `Missing required environment variables for ${provider} (${environment}): ${missingSecrets.join(', ')}`,
        provider,
        missingSecrets
      );
    }

    const getOptionalEnvValue = (envVar: string): string | undefined => {
      const value = process.env[envVar];
      return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
    };

    // Base secrets object
    const secrets: ProviderSecrets = {
      environmentPrefix,
      provider,
      environment,
    };

    // Resolve provider-specific secrets based on PAYAPP_* pattern
    switch (provider) {
      case 'razorpay':
        secrets.keySecret = resolvedEnvValues[`${environmentPrefix}KEY_SECRET`];
        secrets.webhookSecret = resolvedEnvValues[`${environmentPrefix}WEBHOOK_SECRET`];
        break;

      case 'payu':
        secrets.salt = resolvedEnvValues[`${environmentPrefix}SALT`];
        break;

      case 'ccavenue':
        secrets.workingKey = resolvedEnvValues[`${environmentPrefix}WORKING_KEY`];
        break;

      case 'cashfree': {
        // Cashfree uses CASHFREE_TEST_* naming instead of PAYAPP_TEST_CASHFREE_*
        const cashfreePrefix = `CASHFREE_${environment.toUpperCase()}_`;
        const clientId = process.env[`${cashfreePrefix}CLIENT_ID`];
        const secretKey = process.env[`${cashfreePrefix}SECRET_KEY`];
        
        if (!clientId || !secretKey) {
          const missing = [];
          if (!clientId) missing.push(`${cashfreePrefix}CLIENT_ID`);
          if (!secretKey) missing.push(`${cashfreePrefix}SECRET_KEY`);
          throw new ConfigurationError(
            `Missing required Cashfree environment variables: ${missing.join(', ')}`,
            provider,
            missing
          );
        }
        
        // Store both client ID and secret key
        secrets.keySecret = secretKey.trim();
        // Cashfree uses the same secret key for webhook verification
        secrets.webhookSecret = secretKey.trim();
        // Store client ID for later use
        (secrets as any).clientId = clientId.trim();
        break;
      }

      case 'paytm':
        secrets.merchantKey = resolvedEnvValues[`${environmentPrefix}MERCHANT_KEY`];
        break;

      case 'billdesk':
        secrets.checksumKey = resolvedEnvValues[`${environmentPrefix}CHECKSUM_KEY`];
        break;

      case 'phonepe':
        secrets.salt = resolvedEnvValues[`${environmentPrefix}SALT`];
        secrets.webhookSecret = resolvedEnvValues[`${environmentPrefix}WEBHOOK_SECRET`];
        // Parse salt index from environment (defaults to 1)
        {
          const saltIndexStr = getOptionalEnvValue(`${environmentPrefix}SALT_INDEX`);
          if (saltIndexStr) {
            const parsedSaltIndex = parseInt(saltIndexStr, 10);
            if (!Number.isNaN(parsedSaltIndex)) {
              secrets.saltIndex = parsedSaltIndex;
            }
          }
        }

        const hostUat = getOptionalEnvValue(`${environmentPrefix}HOST_UAT`) ?? PHONEPE_DEFAULT_HOSTS.uat;
        const hostProd = getOptionalEnvValue(`${environmentPrefix}HOST_PROD`) ?? PHONEPE_DEFAULT_HOSTS.prod;
        const activeHost = getOptionalEnvValue(`${environmentPrefix}HOST_ACTIVE`);

        secrets.phonepe = {
          client_id: resolvedEnvValues[`${environmentPrefix}CLIENT_ID`],
          client_secret: resolvedEnvValues[`${environmentPrefix}CLIENT_SECRET`],
          client_version: resolvedEnvValues[`${environmentPrefix}CLIENT_VERSION`],
          webhookAuth: {
            username: resolvedEnvValues[`${environmentPrefix}WEBHOOK_USERNAME`],
            password: resolvedEnvValues[`${environmentPrefix}WEBHOOK_PASSWORD`],
          },
          hosts: {
            uat: hostUat,
            prod: hostProd,
          },
          activeHost: activeHost,
        };

        {
          const redirectUrl = getOptionalEnvValue(`${environmentPrefix}REDIRECT_URL`);
          if (redirectUrl) {
            secrets.phonepe.redirectUrl = redirectUrl;
          }

          const merchantIdOverride = getOptionalEnvValue(`${environmentPrefix}MERCHANT_ID`);
          if (merchantIdOverride) {
            secrets.phonepe.merchantId = merchantIdOverride;
          }
        }
        break;

      case 'stripe':
        secrets.keySecret = resolvedEnvValues[`${environmentPrefix}SECRET_KEY`];
        secrets.webhookSecret = resolvedEnvValues[`${environmentPrefix}WEBHOOK_SECRET`];
        break;

      default:
        throw new Error(`Unsupported payment provider: ${provider}`);
    }

    if (provider === 'phonepe' && !secrets.saltIndex) {
      // Default salt index to 1 when not provided
      secrets.saltIndex = 1;
    }
    
    // Cache the resolved secrets
    this.secretsCache.set(cacheKey, secrets);
    
    return secrets;
  }
  
  /**
   * Validate that all required secrets are present for a provider
   */
  public validateSecrets(provider: PaymentProvider, environment: Environment): {
    isValid: boolean;
    missingSecrets: string[];
    availableSecrets: string[];
  } {
    // Get required environment variable names for this provider
    const requiredEnvVars = this.getRequiredEnvVars(provider, environment);

    const missingSecrets: string[] = [];
    const availableSecrets: string[] = [];

    // Check each required environment variable
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar];
      if (!value || value.trim() === '') {
        missingSecrets.push(envVar);
      } else {
        availableSecrets.push(envVar);
      }
    }
    
    return {
      isValid: missingSecrets.length === 0,
      missingSecrets,
      availableSecrets,
    };
  }
  
  /**
   * Get list of required environment variable names for a provider
   */
  private getRequiredEnvVars(provider: PaymentProvider, environment: Environment): string[] {
    const prefix = `PAYAPP_${environment.toUpperCase()}_${provider.toUpperCase()}_`;
    
    switch (provider) {
      case 'razorpay':
        return [`${prefix}KEY_SECRET`, `${prefix}WEBHOOK_SECRET`];
      case 'payu':
        return [`${prefix}SALT`];
      case 'ccavenue':
        return [`${prefix}WORKING_KEY`];
      case 'cashfree':
        // Cashfree uses CASHFREE_TEST_* naming instead of PAYAPP_TEST_CASHFREE_*
        return [
          `CASHFREE_${environment.toUpperCase()}_CLIENT_ID`,
          `CASHFREE_${environment.toUpperCase()}_SECRET_KEY`
        ];
      case 'paytm':
        return [`${prefix}MERCHANT_KEY`];
      case 'billdesk':
        return [`${prefix}CHECKSUM_KEY`];
      case 'phonepe':
        return [
          `${prefix}SALT`,
          `${prefix}WEBHOOK_SECRET`,
          `${prefix}CLIENT_ID`,
          `${prefix}CLIENT_SECRET`,
          `${prefix}CLIENT_VERSION`,
          `${prefix}WEBHOOK_USERNAME`,
          `${prefix}WEBHOOK_PASSWORD`,
          `${prefix}HOST_UAT`,
          `${prefix}HOST_PROD`,
          `${prefix}REDIRECT_URL`,
        ];
      case 'stripe':
        return [`${prefix}SECRET_KEY`, `${prefix}WEBHOOK_SECRET`];
      default:
        return [];
    }
  }
  
  /**
   * Check if a provider is properly configured for an environment
   */
  public isProviderConfigured(provider: PaymentProvider, environment: Environment): boolean {
    const validation = this.validateSecrets(provider, environment);
    return validation.isValid;
  }
  
  /**
   * Get all configured providers for an environment
   */
  public getConfiguredProviders(environment: Environment): PaymentProvider[] {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    return allProviders.filter(provider => 
      this.isProviderConfigured(provider, environment)
    );
  }
  
  /**
   * Clear secrets cache (useful for testing or when env vars change)
   */
  public clearCache(): void {
    this.secretsCache.clear();
  }
  
  /**
   * Get health check status for all providers
   */
  public getHealthCheckStatus(): Record<string, {
    configured: boolean;
    missingSecrets: string[];
  }> {
    const status: Record<string, { configured: boolean; missingSecrets: string[] }> = {};
    
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    for (const provider of allProviders) {
      for (const environment of ['test', 'live'] as Environment[]) {
        const key = `${provider}_${environment}`;
        const validation = this.validateSecrets(provider, environment);
        status[key] = {
          configured: validation.isValid,
          missingSecrets: validation.missingSecrets,
        };
      }
    }
    
    return status;
  }
  
  /**
   * Get human-readable status for admin dashboard
   */
  public getStatusSummary(): {
    totalProviders: number;
    configuredInTest: number;
    configuredInLive: number;
    details: Array<{
      provider: PaymentProvider;
      testConfigured: boolean;
      liveConfigured: boolean;
      missingTestSecrets: string[];
      missingLiveSecrets: string[];
    }>;
  } {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    let configuredInTest = 0;
    let configuredInLive = 0;
    
    const details = allProviders.map(provider => {
      const testValidation = this.validateSecrets(provider, 'test');
      const liveValidation = this.validateSecrets(provider, 'live');
      
      if (testValidation.isValid) configuredInTest++;
      if (liveValidation.isValid) configuredInLive++;
      
      return {
        provider,
        testConfigured: testValidation.isValid,
        liveConfigured: liveValidation.isValid,
        missingTestSecrets: testValidation.missingSecrets,
        missingLiveSecrets: liveValidation.missingSecrets,
      };
    });
    
    return {
      totalProviders: allProviders.length,
      configuredInTest,
      configuredInLive,
      details,
    };
  }
}

/**
 * Default export for convenience
 */
export const secretsResolver = SecretsResolver.getInstance();