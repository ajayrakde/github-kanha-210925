/**
 * TASK 5: ConfigResolver - Resolves provider configurations from database and secrets
 * 
 * This service combines database configuration (non-secret) with environment secrets
 * to provide complete provider configuration for payment adapters.
 */

import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { GatewayConfig } from "../../shared/payment-types";
import { ConfigurationError } from "../../shared/payment-types";
import { secretsResolver, ProviderSecrets } from "../utils/secrets-resolver";
import { db } from "../db";
import { paymentProviderConfig } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

/**
 * Complete configuration combining database config and secrets
 */
export interface ResolvedConfig {
  provider: PaymentProvider;
  environment: Environment;
  enabled: boolean;
  tenantId: string;
  
  // Database configuration (non-secret)
  merchantId?: string;
  keyId?: string;
  accessCode?: string;
  appId?: string;
  publishableKey?: string;
  saltIndex?: number;
  accountId?: string;
  
  // URLs
  successUrl?: string;
  failureUrl?: string;
  webhookUrl?: string;
  
  // Resolved secrets
  secrets: ProviderSecrets;
  
  // Capabilities and metadata
  capabilities: Record<string, boolean>;
  metadata: Record<string, any>;
  
  // Validation status
  isValid: boolean;
  missingSecrets: string[];
}

/**
 * Service for resolving complete provider configurations
 */
export class ConfigResolver {
  private static instance: ConfigResolver;
  private configCache = new Map<string, ResolvedConfig>();
  
  private constructor() {}
  
  public static getInstance(): ConfigResolver {
    if (!ConfigResolver.instance) {
      ConfigResolver.instance = new ConfigResolver();
    }
    return ConfigResolver.instance;
  }
  
  /**
   * Resolve complete configuration for a provider
   */
  public async resolveConfig(
    provider: PaymentProvider,
    environment: Environment,
    tenantId: string = "default"
  ): Promise<ResolvedConfig> {
    const cacheKey = this.getCacheKey(provider, environment, tenantId);
    
    // Return cached config if available
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey)!;
    }
    
    // Get database configuration
    const dbConfig = await this.getDbConfig(provider, environment, tenantId);
    
    const isEnabled = dbConfig?.isEnabled ?? false;

    // Resolve secrets only when the provider is enabled
    let secrets: ProviderSecrets;
    if (isEnabled) {
      try {
        secrets = secretsResolver.resolveSecrets(provider, environment);
      } catch (error) {
        if (error instanceof ConfigurationError) {
          throw error;
        }

        throw new ConfigurationError(
          `Failed to resolve secrets for ${provider} (${environment})`,
          provider
        );
      }
    } else {
      secrets = {
        provider,
        environment,
        environmentPrefix: `PAYAPP_${environment.toUpperCase()}_${provider.toUpperCase()}_`,
      };
    }

    const validation = secretsResolver.validateSecrets(provider, environment);

    // Combine configuration
    const resolvedConfig: ResolvedConfig = {
      provider,
      environment,
      enabled: isEnabled,
      tenantId,

      // Database fields
      merchantId: dbConfig?.merchantId ?? undefined,
      keyId: dbConfig?.keyId ?? undefined,
      accessCode: dbConfig?.accessCode ?? undefined,
      appId: dbConfig?.appId ?? undefined,
      publishableKey: dbConfig?.publishableKey ?? undefined,
      saltIndex: dbConfig?.saltIndex ?? undefined,
      accountId: dbConfig?.accountId ?? undefined,

      // URLs
      successUrl: dbConfig?.successUrl ?? undefined,
      failureUrl: dbConfig?.failureUrl ?? undefined,
      webhookUrl: dbConfig?.webhookUrl ?? undefined,

      // Secrets
      secrets,

      // Capabilities and metadata
      capabilities: (dbConfig?.capabilities as Record<string, boolean> | null) ?? {},
      metadata: (dbConfig?.metadata as Record<string, any> | null) ?? {},
      
      // Validation
      isValid: validation.isValid && (dbConfig?.isEnabled ?? false),
      missingSecrets: validation.missingSecrets,
    };
    
    // Cache the resolved config
    this.configCache.set(cacheKey, resolvedConfig);
    
    return resolvedConfig;
  }
  
  /**
   * Get database configuration for provider
   */
  private async getDbConfig(provider: PaymentProvider, environment: Environment, tenantId: string) {
    try {
      const config = await db
        .select()
        .from(paymentProviderConfig)
        .where(
          and(
            eq(paymentProviderConfig.provider, provider),
            eq(paymentProviderConfig.environment, environment),
            eq(paymentProviderConfig.tenantId, tenantId)
          )
        )
        .limit(1);
      
      return config[0] || null;
    } catch (error) {
      console.error(`Failed to get database config for ${provider}:${environment}:`, error);
      return null;
    }
  }
  
  /**
   * Get all enabled providers for an environment
   */
  public async getEnabledProviders(environment: Environment, tenantId: string = "default"): Promise<ResolvedConfig[]> {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    type ResolutionResult =
      | { provider: PaymentProvider; config: ResolvedConfig }
      | { provider: PaymentProvider; error: unknown };

    const results: ResolutionResult[] = await Promise.all(
      allProviders.map(async (provider) => {
        try {
          const config = await this.resolveConfig(provider, environment, tenantId);
          return { provider, config } as const;
        } catch (error) {
          return { provider, error } as const;
        }
      })
    );

    const enabledProviders: ResolvedConfig[] = [];

    for (const result of results) {
      if ("config" in result) {
        const { config } = result;

        if (config.enabled && config.isValid) {
          enabledProviders.push(config);
        }
        continue;
      }

      const error = result.error;

      if (error instanceof ConfigurationError) {
        console.warn(
          `Skipping misconfigured provider ${result.provider} (${environment}): ${error.message}`
        );
        continue;
      }

      throw error;
    }

    return enabledProviders;
  }
  
  /**
   * Check if a specific provider is available
   */
  public async isProviderAvailable(
    provider: PaymentProvider,
    environment: Environment,
    tenantId: string = "default"
  ): Promise<boolean> {
    const config = await this.resolveConfig(provider, environment, tenantId);
    return config.enabled && config.isValid;
  }
  
  /**
   * Get provider configuration for admin dashboard
   */
  public async getProviderStatus(tenantId: string = "default"): Promise<Array<{
    provider: PaymentProvider;
    test: { enabled: boolean; configured: boolean; missingSecrets: string[] };
    live: { enabled: boolean; configured: boolean; missingSecrets: string[] };
  }>> {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    const status = await Promise.all(
      allProviders.map(async (provider) => {
        const testConfig = await this.resolveConfig(provider, 'test', tenantId);
        const liveConfig = await this.resolveConfig(provider, 'live', tenantId);
        
        return {
          provider,
          test: {
            enabled: testConfig.enabled,
            configured: testConfig.isValid,
            missingSecrets: testConfig.missingSecrets,
          },
          live: {
            enabled: liveConfig.enabled,
            configured: liveConfig.isValid,
            missingSecrets: liveConfig.missingSecrets,
          },
        };
      })
    );
    
    return status;
  }
  
  /**
   * Update provider configuration in database
   */
  public async updateConfig(config: Partial<GatewayConfig>): Promise<void> {
    if (!config.provider || !config.environment) {
      throw new Error('Provider and environment are required');
    }

    const tenantId = config.tenantId ?? 'default';
    
    try {
      const existingConfig = await this.getDbConfig(config.provider, config.environment, tenantId);
      
      if (existingConfig) {
        // Update existing configuration
        await db
          .update(paymentProviderConfig)
          .set({
            isEnabled: config.enabled ?? existingConfig.isEnabled,
            merchantId: config.merchantId ?? existingConfig.merchantId,
            keyId: config.keyId ?? existingConfig.keyId,
            accessCode: config.accessCode ?? existingConfig.accessCode,
            appId: config.appId ?? existingConfig.appId,
            publishableKey: config.publishableKey ?? existingConfig.publishableKey,
            saltIndex: config.saltIndex ?? existingConfig.saltIndex,
            accountId: config.accountId ?? existingConfig.accountId,
            successUrl: config.successUrl ?? existingConfig.successUrl,
            failureUrl: config.failureUrl ?? existingConfig.failureUrl,
            webhookUrl: config.webhookUrl ?? existingConfig.webhookUrl,
            capabilities: config.capabilities ?? existingConfig.capabilities,
            metadata: config.metadata ?? existingConfig.metadata,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentProviderConfig.provider, config.provider),
              eq(paymentProviderConfig.environment, config.environment),
              eq(paymentProviderConfig.tenantId, tenantId)
            )
          );
      } else {
        // Create new configuration
        await db
          .insert(paymentProviderConfig)
          .values({
            provider: config.provider,
            environment: config.environment,
            tenantId,
            isEnabled: config.enabled ?? false,
            merchantId: config.merchantId,
            keyId: config.keyId,
            accessCode: config.accessCode,
            appId: config.appId,
            publishableKey: config.publishableKey,
            saltIndex: config.saltIndex,
            accountId: config.accountId,
            successUrl: config.successUrl,
            failureUrl: config.failureUrl,
            webhookUrl: config.webhookUrl,
            capabilities: config.capabilities ?? {},
            metadata: config.metadata ?? {},
          });
      }
      
      // Clear cache for this provider
      const cacheKey = this.getCacheKey(config.provider, config.environment, tenantId);
      this.configCache.delete(cacheKey);
      
    } catch (error) {
      console.error(`Failed to update config for ${config.provider}:${config.environment}:`, error);
      throw new Error('Failed to update provider configuration');
    }
  }
  
  /**
   * Clear configuration cache
   */
  public clearCache(): void {
    this.configCache.clear();
  }
  
  /**
   * Get fallback provider order for an environment
   */
  public async getFallbackProviders(
    environment: Environment,
    tenantId: string = 'default',
    exclude?: PaymentProvider[]
  ): Promise<PaymentProvider[]> {
    const enabledConfigs = await this.getEnabledProviders(environment, tenantId);
    
    // Filter out excluded providers
    const filteredConfigs = enabledConfigs.filter(config => 
      !exclude || !exclude.includes(config.provider)
    );
    
    // Sort by reliability/preference (can be customized)
    const providerOrder: PaymentProvider[] = [
      'razorpay', 'stripe', 'cashfree', 'payu', 
      'ccavenue', 'paytm', 'phonepe', 'billdesk'
    ];
    
    return filteredConfigs
      .sort((a, b) => {
        const indexA = providerOrder.indexOf(a.provider);
        const indexB = providerOrder.indexOf(b.provider);
        return indexA - indexB;
      })
      .map(config => config.provider);
  }

  private getCacheKey(provider: PaymentProvider, environment: Environment, tenantId: string): string {
    return `${tenantId}_${provider}_${environment}`;
  }
}

/**
 * Default export for convenience
 */
export const configResolver = ConfigResolver.getInstance();