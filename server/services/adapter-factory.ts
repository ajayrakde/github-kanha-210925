/**
 * TASK 5: AdapterFactory - Creates payment adapters for different providers
 * 
 * This factory creates and manages payment adapter instances for all 8 providers
 * ensuring proper configuration and validation before returning adapters.
 */

import type { PaymentProvider, Environment } from "../../shared/payment-providers";
import type {
  PaymentsAdapter,
  PaymentAdapterFactory,
  CreatePaymentParams,
  PaymentResult,
  VerifyPaymentParams,
  CapturePaymentParams,
  CreateRefundParams,
  RefundResult,
  WebhookVerifyParams,
  WebhookVerifyResult,
  HealthCheckResult,
  PaymentMethod,
  Currency
} from "../../shared/payment-types";
import { configResolver, ResolvedConfig } from "./config-resolver";
import { ConfigurationError } from "../../shared/payment-types";

// Import adapter implementations (will be created in TASK 6)
// For now, we'll use placeholder imports that will be implemented
interface AdapterConstructor {
  new (config: ResolvedConfig): PaymentsAdapter;
}

class UnsupportedAdapter implements PaymentsAdapter {
  public readonly provider: PaymentProvider;
  public readonly environment: Environment;

  constructor(private readonly config: ResolvedConfig, private readonly reason: string) {
    this.provider = config.provider;
    this.environment = config.environment;
  }

  private configurationError(): ConfigurationError {
    return new ConfigurationError(
      `${this.provider} adapter is not available: ${this.reason}`,
      this.provider
    );
  }

  public async createPayment(_params: CreatePaymentParams): Promise<never> {
    throw this.configurationError();
  }

  public async verifyPayment(_params: VerifyPaymentParams): Promise<never> {
    throw this.configurationError();
  }

  public async capturePayment(_params: CapturePaymentParams): Promise<never> {
    throw this.configurationError();
  }

  public async createRefund(_params: CreateRefundParams): Promise<never> {
    throw this.configurationError();
  }

  public async getRefundStatus(_refundId: string): Promise<never> {
    throw this.configurationError();
  }

  public async verifyWebhook(_params: WebhookVerifyParams): Promise<never> {
    throw this.configurationError();
  }

  public async healthCheck(): Promise<HealthCheckResult> {
    return {
      provider: this.provider,
      environment: this.environment,
      healthy: false,
      tests: {
        connectivity: false,
        authentication: false,
        apiAccess: false,
      },
      error: {
        code: 'ADAPTER_NOT_AVAILABLE',
        message: this.reason,
      },
      timestamp: new Date(),
    };
  }

  public getSupportedMethods(): PaymentMethod[] {
    return [];
  }

  public getSupportedCurrencies(): Currency[] {
    return [];
  }

  public async validateConfig(): Promise<{ valid: boolean; errors: string[] }> {
    return {
      valid: false,
      errors: [this.reason],
    };
  }
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
    // Initialize adapters asynchronously
    this.initializeAdapterRegistry().catch(error => {
      console.error('Failed to initialize adapter registry:', error);
    });
  }
  
  public static getInstance(): AdapterFactory {
    if (!AdapterFactory.instance) {
      AdapterFactory.instance = new AdapterFactory();
    }
    return AdapterFactory.instance;
  }
  
  /**
   * Initialize adapter registry with all payment provider implementations
   */
  private async initializeAdapterRegistry(): Promise<void> {
    await Promise.all([
      this.registerAdapterModule('razorpay', '../adapters/razorpay-adapter', 'RazorpayAdapter'),
      this.registerAdapterModule('stripe', '../adapters/stripe-adapter', 'StripeAdapter'),
      this.registerAdapterModule('phonepe', '../adapters/phonepe-adapter', 'PhonePeAdapter'),
      this.registerAdapterModule('payu', '../adapters/payu-adapter', 'PayUAdapter'),
      this.registerAdapterModule('ccavenue', '../adapters/ccavenue-adapter', 'CCAvenueAdapter'),
      this.registerAdapterModule('cashfree', '../adapters/cashfree-adapter', 'CashfreeAdapter'),
      this.registerAdapterModule('paytm', '../adapters/paytm-adapter', 'PaytmAdapter'),
      this.registerAdapterModule('billdesk', '../adapters/billdesk-adapter', 'BillDeskAdapter')
    ]);
  }

  /**
   * Create a payment adapter for the specified provider
   */
  public async createAdapter(
    provider: PaymentProvider,
    environment: Environment,
    tenantId: string
  ): Promise<PaymentsAdapter> {
    const cacheKey = this.buildCacheKey(provider, environment, tenantId);

    // Return cached adapter if available
    if (this.adapterCache.has(cacheKey)) {
      return this.adapterCache.get(cacheKey)!;
    }

    // Resolve configuration
    let config: ResolvedConfig;
    try {
      config = await configResolver.resolveConfig(provider, environment, tenantId);
    } catch (error) {
      if (error instanceof ConfigurationError) {
        throw error;
      }

      throw new ConfigurationError(
        `Failed to resolve configuration for ${provider} (${environment})`,
        provider
      );
    }

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
  public async getAvailableAdapters(environment: Environment, tenantId: string): Promise<PaymentsAdapter[]> {
    const enabledConfigs = await configResolver.getEnabledProviders(environment, tenantId);

    const adapters = await Promise.allSettled(
      enabledConfigs.map(config =>
        this.createAdapter(config.provider, config.environment, tenantId)
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
  public async getPrimaryAdapter(environment: Environment, tenantId: string): Promise<PaymentsAdapter | null> {
    const fallbackProviders = await configResolver.getFallbackProviders(environment, tenantId);

    for (const provider of fallbackProviders) {
      try {
        return await this.createAdapter(provider, environment, tenantId);
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
    environment: Environment,
    tenantId: string
  ): Promise<PaymentsAdapter> {
    // Try preferred provider first
    try {
      return await this.createAdapter(preferredProvider, environment, tenantId);
    } catch (error) {
      console.warn(`Preferred provider ${preferredProvider} failed:`, error);
    }

    // Try fallback providers
    const fallbackProviders = await configResolver.getFallbackProviders(environment, tenantId, [preferredProvider]);

    for (const provider of fallbackProviders) {
      try {
        return await this.createAdapter(provider, environment, tenantId);
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
      .filter(key => this.parseCacheKey(key)?.provider === provider);
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
  public async getHealthStatus(environment: Environment, tenantId: string): Promise<HealthCheckResult[]> {
    const allProviders: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree',
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];

    const healthChecks = await Promise.allSettled(
      allProviders.map(async (provider) => {
        try {
          const adapter = await this.createAdapter(provider, environment, tenantId);
          const health = await adapter.healthCheck();

          const result: HealthCheckResult = {
            provider,
            environment,
            healthy: health.healthy,
            tests: health.tests ?? {
              connectivity: health.healthy,
              authentication: health.healthy,
              apiAccess: health.healthy,
            },
            responseTime: health.responseTime,
            error: health.error,
            timestamp: health.timestamp ?? new Date(),
          };

          return result;
        } catch (error) {
          const failureResult: HealthCheckResult = {
            provider,
            environment,
            healthy: false,
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

          return failureResult;
        }
      })
    );

    return healthChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }

      return {
        provider: allProviders[index],
        environment,
        healthy: false,
        tests: {
          connectivity: false,
          authentication: false,
          apiAccess: false,
        },
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: result.reason?.message || 'Failed to check health',
        },
        timestamp: new Date(),
      } as HealthCheckResult;
    });
  }

  private async registerAdapterModule(
    provider: PaymentProvider,
    modulePath: string,
    exportName: string
  ): Promise<void> {
    try {
      const module = await import(modulePath);
      const Adapter = module[exportName] as AdapterConstructor | undefined;

      if (Adapter) {
        this.adapterRegistry.set(provider, Adapter);
      } else {
        console.warn(`Adapter module ${modulePath} missing export ${exportName}`);
        this.registerUnsupportedAdapter(provider, `Missing export ${exportName}`);
      }
    } catch (error: any) {
      if (error?.code === 'MODULE_NOT_FOUND' || error?.message?.includes('Cannot find module')) {
        console.warn(`Adapter module not found for ${provider}: ${modulePath}`);
        this.registerUnsupportedAdapter(provider, 'Adapter not implemented');
      } else {
        console.error(`Failed to load adapter for ${provider}:`, error);
        this.registerUnsupportedAdapter(provider, 'Failed to load adapter module');
      }
    }
  }

  private registerUnsupportedAdapter(provider: PaymentProvider, reason: string): void {
    if (this.adapterRegistry.has(provider)) {
      return;
    }

    this.adapterRegistry.set(provider, class extends UnsupportedAdapter {
      constructor(config: ResolvedConfig) {
        super(config, reason);
      }
    });
  }

  private buildCacheKey(provider: PaymentProvider, environment: Environment, tenantId: string): string {
    return `${tenantId}:${provider}:${environment}`;
  }

  private parseCacheKey(key: string): { tenantId: string; provider: PaymentProvider; environment: Environment } | null {
    const [tenantId, provider, environment] = key.split(':');
    if (!tenantId || !provider || !environment) {
      return null;
    }

    return {
      tenantId,
      provider: provider as PaymentProvider,
      environment: environment as Environment,
    };
  }
}

/**
 * Default export for convenience
 */
export const adapterFactory = AdapterFactory.getInstance();