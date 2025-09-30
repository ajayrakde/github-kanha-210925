import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getPaymentProviderEnvVars, mergeProviderCredentials } from "../payment-env";

describe("payment-env helpers", () => {
  const originalEnv = { ...process.env };
  const envKeys = [
    "PAYAPP_TEST_PHONEPE_CLIENT_ID",
    "PAYAPP_TEST_PHONEPE_CLIENT_SECRET",
    "PAYAPP_TEST_PHONEPE_CLIENT_VERSION",
    "PAYAPP_TEST_PHONEPE_WEBHOOK_USERNAME",
    "PAYAPP_TEST_PHONEPE_WEBHOOK_PASSWORD",
    "PAYAPP_TEST_PHONEPE_REDIRECT_URL",
    "PAYAPP_TEST_PHONEPE_HOST_UAT",
    "PAYAPP_TEST_PHONEPE_HOST_PROD",
    "PAYAPP_TEST_PHONEPE_SALT",
    "PAYAPP_TEST_PHONEPE_WEBHOOK_SECRET",
    "PAYAPP_TEST_PHONEPE_SALT_INDEX",
    "PAYAPP_LIVE_PHONEPE_CLIENT_ID",
    "PAYAPP_LIVE_PHONEPE_CLIENT_SECRET",
    "PAYAPP_LIVE_PHONEPE_CLIENT_VERSION",
    "PAYAPP_LIVE_PHONEPE_WEBHOOK_USERNAME",
    "PAYAPP_LIVE_PHONEPE_WEBHOOK_PASSWORD",
    "PAYAPP_LIVE_PHONEPE_REDIRECT_URL",
    "PAYAPP_LIVE_PHONEPE_HOST_UAT",
    "PAYAPP_LIVE_PHONEPE_HOST_PROD",
    "PAYAPP_LIVE_PHONEPE_SALT",
    "PAYAPP_LIVE_PHONEPE_WEBHOOK_SECRET",
    "PAYAPP_LIVE_PHONEPE_SALT_INDEX",
  ] as const;

  const envValues: Record<typeof envKeys[number], string> = {
    PAYAPP_TEST_PHONEPE_CLIENT_ID: "test-client",
    PAYAPP_TEST_PHONEPE_CLIENT_SECRET: "test-secret",
    PAYAPP_TEST_PHONEPE_CLIENT_VERSION: "2024-01-01",
    PAYAPP_TEST_PHONEPE_WEBHOOK_USERNAME: "test-hook",
    PAYAPP_TEST_PHONEPE_WEBHOOK_PASSWORD: "test-pass",
    PAYAPP_TEST_PHONEPE_REDIRECT_URL: "https://test.example/pay",
    PAYAPP_TEST_PHONEPE_HOST_UAT: "https://uat.example",
    PAYAPP_TEST_PHONEPE_HOST_PROD: "https://prod.example",
    PAYAPP_TEST_PHONEPE_SALT: "test-salt",
    PAYAPP_TEST_PHONEPE_WEBHOOK_SECRET: "test-webhook",
    PAYAPP_TEST_PHONEPE_SALT_INDEX: "2",
    PAYAPP_LIVE_PHONEPE_CLIENT_ID: "live-client",
    PAYAPP_LIVE_PHONEPE_CLIENT_SECRET: "live-secret",
    PAYAPP_LIVE_PHONEPE_CLIENT_VERSION: "2024-02-01",
    PAYAPP_LIVE_PHONEPE_WEBHOOK_USERNAME: "live-hook",
    PAYAPP_LIVE_PHONEPE_WEBHOOK_PASSWORD: "live-pass",
    PAYAPP_LIVE_PHONEPE_REDIRECT_URL: "https://live.example/pay",
    PAYAPP_LIVE_PHONEPE_HOST_UAT: "https://uat-live.example",
    PAYAPP_LIVE_PHONEPE_HOST_PROD: "https://prod-live.example",
    PAYAPP_LIVE_PHONEPE_SALT: "live-salt",
    PAYAPP_LIVE_PHONEPE_WEBHOOK_SECRET: "live-webhook",
    PAYAPP_LIVE_PHONEPE_SALT_INDEX: "3",
  };

  beforeEach(() => {
    envKeys.forEach((key) => {
      process.env[key] = envValues[key];
    });
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key]!;
      }
    });
  });

  it("exposes full PhonePe configuration per environment", () => {
    const envVars = getPaymentProviderEnvVars("phonepe");

    expect(envVars.phonepe?.test).toMatchObject({
      clientId: "test-client",
      clientSecret: "test-secret",
      clientVersion: "2024-01-01",
      webhookUsername: "test-hook",
      webhookPassword: "test-pass",
      redirectUrl: "https://test.example/pay",
      hostUat: "https://uat.example",
      hostProd: "https://prod.example",
      salt: "test-salt",
      webhookSecret: "test-webhook",
      saltIndex: "2",
    });

    expect(envVars.phonepe?.live).toMatchObject({
      clientId: "live-client",
      clientSecret: "live-secret",
      clientVersion: "2024-02-01",
      webhookUsername: "live-hook",
      webhookPassword: "live-pass",
      redirectUrl: "https://live.example/pay",
      hostUat: "https://uat-live.example",
      hostProd: "https://prod-live.example",
      salt: "live-salt",
      webhookSecret: "live-webhook",
      saltIndex: "3",
    });
  });

  it("merges phonepe env vars with database settings", () => {
    const merged = mergeProviderCredentials("phonepe", {
      phonepe: {
        test: { merchantId: "db-merchant" },
        live: { merchantId: "db-merchant-live" },
      },
    });

    expect(merged.phonepe?.test).toMatchObject({
      merchantId: "db-merchant",
      clientId: "test-client",
      redirectUrl: "https://test.example/pay",
    });

    expect(merged.phonepe?.live).toMatchObject({
      merchantId: "db-merchant-live",
      clientId: "live-client",
      redirectUrl: "https://live.example/pay",
    });
  });
});
