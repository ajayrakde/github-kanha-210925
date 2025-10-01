import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../config-resolver";
import type { PaymentProvider } from "../../../shared/payment-providers";
import { ConfigurationError } from "../../../shared/payment-types";
import { secretsResolver } from "../../utils/secrets-resolver";
import type { ProviderSecrets } from "../../utils/secrets-resolver";

type ConfigResolverModule = typeof import("../config-resolver");

const environment = "test";
const tenantId = "default";

const baseConfig = (provider: PaymentProvider, overrides: Partial<ResolvedConfig> = {}): ResolvedConfig => ({
  provider,
  environment,
  enabled: false,
  tenantId,
  merchantId: undefined,
  keyId: undefined,
  accessCode: undefined,
  appId: undefined,
  publishableKey: undefined,
  saltIndex: undefined,
  accountId: undefined,
  successUrl: undefined,
  failureUrl: undefined,
  webhookUrl: undefined,
  secrets: {
    provider,
    environment,
    environmentPrefix: "",
  },
  capabilities: {},
  metadata: {},
  isValid: false,
  missingSecrets: [],
  phonepeConfig: undefined,
  ...overrides,
});

describe("ConfigResolver.getEnabledProviders", () => {
  let ConfigResolverClass: ConfigResolverModule["ConfigResolver"];
  let configResolver: InstanceType<ConfigResolverModule["ConfigResolver"]>;
  let resolveConfigSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
    ({ ConfigResolver: ConfigResolverClass } = await import("../config-resolver"));
    configResolver = ConfigResolverClass.getInstance();
  });

  beforeEach(() => {
    (configResolver as any).configCache?.clear?.();
    resolveConfigSpy = vi.spyOn(ConfigResolverClass.prototype, "resolveConfig");
  });

  afterEach(() => {
    resolveConfigSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("skips providers that fail secret resolution while returning valid ones", async () => {
    resolveConfigSpy.mockImplementation(async (provider) => {
      if (provider === "razorpay") {
        return baseConfig(provider, { enabled: true, isValid: true });
      }

      if (provider === "payu") {
        throw new ConfigurationError("Missing secrets", provider);
      }

      return baseConfig(provider, { enabled: false, isValid: false });
    });

    const enabledProviders = await configResolver.getEnabledProviders(environment, tenantId);

    expect(enabledProviders).toEqual([
      expect.objectContaining({ provider: "razorpay", enabled: true, isValid: true }),
    ]);
    expect(resolveConfigSpy).toHaveBeenCalledTimes(8);
  });

  it("rethrows unexpected errors so they surface to callers", async () => {
    resolveConfigSpy.mockImplementation(async (provider) => {
      if (provider === "razorpay") {
        throw new Error("boom");
      }

      return baseConfig(provider);
    });

    await expect(configResolver.getEnabledProviders(environment, tenantId)).rejects.toThrow(
      "boom"
    );
  });
});

describe("ConfigResolver.getProviderStatus", () => {
  let ConfigResolverClass: ConfigResolverModule["ConfigResolver"];
  let configResolver: InstanceType<ConfigResolverModule["ConfigResolver"]>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
    ({ ConfigResolver: ConfigResolverClass } = await import("../config-resolver"));
    configResolver = ConfigResolverClass.getInstance();
  });

  beforeEach(() => {
    (configResolver as any).configCache?.clear?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports missing secrets while continuing to other providers", async () => {
    const resolveConfigSpy = vi.spyOn(ConfigResolverClass.prototype, "resolveConfig");
    const getDbConfigSpy = vi
      .spyOn(ConfigResolverClass.prototype as any, "getDbConfig")
      .mockResolvedValue({ isEnabled: true });

    resolveConfigSpy.mockImplementation(async (provider, env) => {
      if (provider === "payu" && env === "test") {
        throw new ConfigurationError("Missing secrets", provider, [
          "PAYAPP_TEST_PAYU_SALT",
        ]);
      }

      if (provider === "razorpay") {
        return baseConfig(provider, { enabled: true, isValid: true });
      }

      return baseConfig(provider);
    });

    const status = await configResolver.getProviderStatus(tenantId);

    const razorpayStatus = status.find((entry) => entry.provider === "razorpay");
    const payuStatus = status.find((entry) => entry.provider === "payu");

    expect(razorpayStatus?.test).toEqual({
      enabled: true,
      configured: true,
      missingSecrets: [],
    });

    expect(payuStatus?.test).toEqual({
      enabled: true,
      configured: false,
      missingSecrets: ["PAYAPP_TEST_PAYU_SALT"],
    });

    expect(payuStatus?.live).toEqual({
      enabled: false,
      configured: false,
      missingSecrets: [],
    });

    expect(getDbConfigSpy).toHaveBeenCalledWith("payu", "test", tenantId);
  });

  it("rethrows unexpected errors", async () => {
    const resolveConfigSpy = vi.spyOn(ConfigResolverClass.prototype, "resolveConfig");

    resolveConfigSpy.mockImplementation(async (provider, env) => {
      if (provider === "razorpay" && env === "test") {
        throw new Error("boom");
      }

      return baseConfig(provider);
    });

    await expect(configResolver.getProviderStatus(tenantId)).rejects.toThrow("boom");
  });
});

describe("ConfigResolver.resolveConfig for PhonePe", () => {
  let ConfigResolverClass: ConfigResolverModule["ConfigResolver"];
  let configResolver: InstanceType<ConfigResolverModule["ConfigResolver"]>;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";
    ({ ConfigResolver: ConfigResolverClass } = await import("../config-resolver"));
    configResolver = ConfigResolverClass.getInstance();
  });

  beforeEach(() => {
    (configResolver as any).configCache?.clear?.();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildSecrets = (overrides: Partial<ProviderSecrets> = {}): ProviderSecrets => {
    const { phonepe: phonepeOverrides, ...rest } = overrides as {
      phonepe?: ProviderSecrets["phonepe"];
    } & Partial<ProviderSecrets>;

    return {
      provider: 'phonepe',
      environment: 'test',
      environmentPrefix: 'PAYAPP_TEST_PHONEPE_',
      salt: 'salt',
      webhookSecret: 'webhook',
      saltIndex: 1,
      phonepe: {
        client_id: 'client-id',
        client_secret: 'client-secret',
        client_version: '2024-01-01',
        webhookAuth: { username: 'hook-user', password: 'hook-pass' },
        hosts: { uat: 'https://uat.phonepe.local', prod: 'https://prod.phonepe.local' },
        redirectUrl: 'https://env.example/pay',
        activeHost: undefined,
        ...phonepeOverrides,
      },
      ...rest,
    };
  };

  it("merges PhonePe config from secrets and database", async () => {
    vi.spyOn(ConfigResolverClass.prototype as any, 'getDbConfig').mockResolvedValue({
      isEnabled: true,
      merchantId: 'merchant-from-db',
      successUrl: undefined,
    });

    vi.spyOn(secretsResolver, 'resolveSecrets').mockReturnValue(buildSecrets());
    vi.spyOn(secretsResolver, 'validateSecrets').mockReturnValue({
      isValid: true,
      missingSecrets: [],
      availableSecrets: [],
    });

    const config = await configResolver.resolveConfig('phonepe', 'test', 'tenant-1');

    expect(config.phonepeConfig).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      client_version: '2024-01-01',
      merchantId: 'merchant-from-db',
      webhookAuth: { username: 'hook-user', password: 'hook-pass' },
      redirectUrl: 'https://env.example/pay',
      hosts: { uat: 'https://uat.phonepe.local', prod: 'https://prod.phonepe.local' },
      activeHost: undefined,
    });
  });

  it('prefers metadata host override when provided', async () => {
    vi.spyOn(ConfigResolverClass.prototype as any, 'getDbConfig').mockResolvedValue({
      isEnabled: true,
      merchantId: 'merchant-from-db',
      successUrl: undefined,
      metadata: { phonepeHost: 'prod' },
    });

    vi.spyOn(secretsResolver, 'resolveSecrets').mockReturnValue(buildSecrets());
    vi.spyOn(secretsResolver, 'validateSecrets').mockReturnValue({
      isValid: true,
      missingSecrets: [],
      availableSecrets: [],
    });

    const config = await configResolver.resolveConfig('phonepe', 'test', 'tenant-1');

    expect(config.phonepeConfig?.activeHost).toBe('prod');
  });

  it("throws when merchantId is provided by multiple sources", async () => {
    vi.spyOn(ConfigResolverClass.prototype as any, 'getDbConfig').mockResolvedValue({
      isEnabled: true,
      merchantId: 'merchant-from-db',
      successUrl: 'https://db.example/success',
    });

    vi.spyOn(secretsResolver, 'resolveSecrets').mockReturnValue(
      buildSecrets({ phonepe: { merchantId: 'merchant-from-env' } })
    );
    vi.spyOn(secretsResolver, 'validateSecrets').mockReturnValue({
      isValid: true,
      missingSecrets: [],
      availableSecrets: [],
    });

    await expect(
      configResolver.resolveConfig('phonepe', 'test', 'tenant-1')
    ).rejects.toThrowError(/multiple sources/);
  });

  it("throws when redirectUrl is missing across sources", async () => {
    vi.spyOn(ConfigResolverClass.prototype as any, 'getDbConfig').mockResolvedValue({
      isEnabled: true,
      merchantId: 'merchant-from-db',
      successUrl: undefined,
    });

    vi.spyOn(secretsResolver, 'resolveSecrets').mockReturnValue(
      buildSecrets({ phonepe: { redirectUrl: undefined } })
    );
    vi.spyOn(secretsResolver, 'validateSecrets').mockReturnValue({
      isValid: true,
      missingSecrets: [],
      availableSecrets: [],
    });

    await expect(
      configResolver.resolveConfig('phonepe', 'test', 'tenant-1')
    ).rejects.toThrowError(/Missing PhonePe redirectUrl/);
  });
});
