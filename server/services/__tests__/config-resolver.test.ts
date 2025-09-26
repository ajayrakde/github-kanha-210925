import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../config-resolver";
import type { PaymentProvider } from "../../../shared/payment-providers";
import { ConfigurationError } from "../../../shared/payment-types";

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
