-- Ensure unique indexes managed by Drizzle for payment infrastructure
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_unique
  ON payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_provider_refund_unique
  ON refunds (provider, provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_inbox_provider_dedupe_unique
  ON webhook_inbox (provider, dedupe_key);

CREATE UNIQUE INDEX IF NOT EXISTS payment_provider_config_tenant_provider_env_unique
  ON payment_provider_config (tenant_id, provider, environment);
