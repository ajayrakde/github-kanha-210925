/**
 * TASK 5: ConfigResolver - Resolves provider configurations from database and secrets
 * 
 * This service combines database configuration (non-secret) with environment secrets
 * to provide complete provider configuration for payment adapters.
 */

import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { GatewayConfig } from "../../shared/payment-types";
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
  public async resolveConfig(provider: PaymentProvider, environment: Environment): Promise<ResolvedConfig> {
    const cacheKey = `${provider}_${environment}`;
    
    // Return cached config if available
    if (this.configCache.has(cacheKey)) {
      return this.configCache.get(cacheKey)!;
    }
    
    // Get database configuration
    const dbConfig = await this.getDbConfig(provider, environment);
    
    // Resolve secrets
    const secrets = secretsResolver.resolveSecrets(provider, environment);
    const validation = secretsResolver.validateSecrets(provider, environment);
    
    // Combine configuration
    const resolvedConfig: ResolvedConfig = {
      provider,
      environment,
      enabled: dbConfig?.isEnabled ?? false,

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
  private async getDbConfig(provider: PaymentProvider, environment: Environment) {
    try {
      const config = await db
        .select()
        .from(paymentProviderConfig)
        .where(
          and(
            eq(paymentProviderConfig.provider, provider),
            eq(paymentProviderConfig.environment, environment)
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
  public async getEnabledProviders(environment: Environment): Promise<ResolvedConfig[]> {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    const configs = await Promise.all(
      allProviders.map(provider => this.resolveConfig(provider, environment))
    );
    
    return configs.filter(config => config.enabled && config.isValid);
  }
  
  /**
   * Check if a specific provider is available
   */
  public async isProviderAvailable(provider: PaymentProvider, environment: Environment): Promise<boolean> {
    const config = await this.resolveConfig(provider, environment);
    return config.enabled && config.isValid;
  }
  
  /**
   * Get provider configuration for admin dashboard
   */
  public async getProviderStatus(): Promise<Array<{
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
        const testConfig = await this.resolveConfig(provider, 'test');
        const liveConfig = await this.resolveConfig(provider, 'live');
        
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
    
    try {
      const existingConfig = await this.getDbConfig(config.provider, config.environment);
      
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
              eq(paymentProviderConfig.environment, config.environment)
            )
          );
      } else {
        // Create new configuration
        await db
          .insert(paymentProviderConfig)
          .values({
            provider: config.provider,
            environment: config.environment,
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
      const cacheKey = `${config.provider}_${config.environment}`;
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
  public async getFallbackProviders(environment: Environment, exclude?: PaymentProvider[]): Promise<PaymentProvider[]> {
    const enabledConfigs = await this.getEnabledProviders(environment);
    
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
}

/**
 * Default export for convenience
 */
export const configResolver = ConfigResolver.getInstance();