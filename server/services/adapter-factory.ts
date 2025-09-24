/**
 * TASK 5: AdapterFactory - Creates payment adapters for different providers
 * 
 * This factory creates and manages payment adapter instances for all 8 providers
 * ensuring proper configuration and validation before returning adapters.
 */

import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type { PaymentsAdapter, PaymentAdapterFactory } from "../../shared/payment-types";
import { configResolver, ResolvedConfig } from "./config-resolver";
import { ConfigurationError } from "../../shared/payment-types";

// Import adapter implementations (will be created in TASK 6)
// For now, we'll use placeholder imports that will be implemented
interface AdapterConstructor {
  new (config: ResolvedConfig): PaymentsAdapter;
}

/**
 * Factory for creating payment adapters
 */
export class AdapterFactory implements PaymentAdapterFactory {
  private static instance: AdapterFactory;
  private adapterCache = new Map<string, PaymentsAdapter>();
  
  // Registry of adapter constructors (will be populated in TASK 6)
  private adapterRegistry = new Map<PaymentProvider, AdapterConstructor>();
  
  private constructor() {
    this.initializeAdapterRegistry();
  }
  
  public static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }
  
  /**
   * Initialize adapter registry (will be completed in TASK 6)
   */
  private initializeAdapterRegistry(): void {
    // TODO: TASK 6 - Register actual adapter implementations
    // this.adapterRegistry.set('razorpay', RazorpayAdapter);
    // this.adapterRegistry.set('payu', PayUAdapter);
    // this.adapterRegistry.set('ccavenue', CCAvenuveAdapter);
    // this.adapterRegistry.set('cashfree', CashfreeAdapter);
    // this.adapterRegistry.set('paytm', PaytmAdapter);
    // this.adapterRegistry.set('billdesk', BillDeskAdapter);
    // this.adapterRegistry.set('phonepe', PhonePeAdapter);
    // this.adapterRegistry.set('stripe', StripeAdapter);
  }
  
  /**
   * Create a payment adapter for the specified provider
   */
  public async createAdapter(provider: PaymentProvider, environment: Environment): Promise<PaymentsAdapter> {
    const cacheKey = `${provider}_${environment}`;
    
    // Return cached adapter if available
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!;
    }
    
    // Resolve configuration
    const config = await configResolver.resolveConfig(provider, environment);
    
    // Validate configuration
    if (!config.enabled) {
      throw new ConfigurationError(
        `Provider ${provider} is not enabled for ${environment} environment`,
        provider
      );
    }
    
    if (!config.isValid) {
      throw new ConfigurationError(
        `Provider ${provider} configuration is invalid: missing secrets: ${config.missingSecrets.join(', ')}`,
        provider,
        config.missingSecrets
      );
    }
    
    // Get adapter constructor
    const AdapterConstructor = this.adapterRegistry.get(provider);
    if (!AdapterConstructor) {
      throw new ConfigurationError(
        `No adapter implementation found for provider: ${provider}`,
        provider
      );
    }
    
    // Create adapter instance
    const adapter = new AdapterConstructor(config);
    
    // Validate adapter configuration
    const validation = await adapter.validateConfig();
    if (!validation.valid) {
      throw new ConfigurationError(
        `Adapter validation failed for ${provider}: ${validation.errors.join(', ')}`,
        provider
      );
    }
    
    // Cache the adapter
    this.adapterCache.set(cacheKey, adapter);
    
    return adapter;
  }
  
  /**
   * Get all supported providers
   */
  public getSupportedProviders(): PaymentProvider[] {
    return Array.from(this.adapterRegistry.keys());
  }
  
  /**
   * Check if a provider is supported
   */
  public isProviderSupported(provider: PaymentProvider): boolean {
    return this.adapterRegistry.has(provider);
  }
  
  /**
   * Get all available adapters for an environment
   */
  public async getAvailableAdapters(environment: Environment): Promise<PaymentsAdapter[]> {
    const enabledConfigs = await configResolver.getEnabledProviders(environment);
    
    const adapters = await Promise.allSettled(
      enabledConfigs.map(config => 
        this.createAdapter(config.provider, config.environment)
      )
    );
    
    return adapters
      .filter((result): result is PromiseFulfilledResult<PaymentsAdapter> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }
  
  /**
   * Get primary adapter for an environment (first available enabled provider)
   */
  public async getPrimaryAdapter(environment: Environment): Promise<PaymentsAdapter | null> {
    const fallbackProviders = await configResolver.getFallbackProviders(environment);
    
    for (const provider of fallbackProviders) {
      try {
        return await this.createAdapter(provider, environment);
      } catch (error) {
        console.warn(`Failed to create adapter for ${provider}:`, error);
        continue;
      }
    }
    
    return null;
  }
  
  /**
   * Get adapter with fallback support
   */
  public async getAdapterWithFallback(
    preferredProvider: PaymentProvider, 
    environment: Environment
  ): Promise<PaymentsAdapter> {
    // Try preferred provider first
    try {
      return await this.createAdapter(preferredProvider, environment);
    } catch (error) {
      console.warn(`Preferred provider ${preferredProvider} failed:`, error);
    }
    
    // Try fallback providers
    const fallbackProviders = await configResolver.getFallbackProviders(environment, [preferredProvider]);
    
    for (const provider of fallbackProviders) {
      try {
        return await this.createAdapter(provider, environment);
      } catch (error) {
        console.warn(`Fallback provider ${provider} failed:`, error);
        continue;
      }
    }
    
    throw new ConfigurationError(
      `No working payment provider available for ${environment} environment`,
      preferredProvider
    );
  }
  
  /**
   * Register a new adapter (for TASK 6)
   */
  public registerAdapter(provider: PaymentProvider, adapterConstructor: AdapterConstructor): void {
    this.adapterRegistry.set(provider, adapterConstructor);
    
    // Clear any cached adapters for this provider
    const keysToDelete = Array.from(this.adapterCache.keys())
      .filter(key => key.startsWith(`${provider}_`));
    keysToDelete.forEach(key => this.adapterCache.delete(key));
  }
  
  /**
   * Clear adapter cache
   */
  public clearCache(): void {
    this.adapterCache.clear();
  }
  
  /**
   * Get adapter health status for all providers
   */
  public async getHealthStatus(environment: Environment): Promise<Array<{
    provider: PaymentProvider;
    available: boolean;
    healthy: boolean;
    error?: string;
  }>> {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree', 
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];
    
    const healthChecks = await Promise.allSettled(
      allProviders.map(async (provider) => {
        try {
          const adapter = await this.createAdapter(provider, environment);
          const health = await adapter.healthCheck();
          
          return {
            provider,
            available: true,
            healthy: health.healthy,
            error: health.error?.message,
          };
        } catch (error) {
          return {
            provider,
            available: false,
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );
    
    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          provider: allProviders[index],
          available: false,
          healthy: false,
          error: result.reason?.message || 'Failed to check health',
        };
      }
    });
  }
}

/**
 * Default export for convenience
 */
export const adapterFactory = AdapterFactory.getInstance();