ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS amount_refunded_minor INTEGER DEFAULT 0;

UPDATE payments
   SET amount_refunded_minor = COALESCE(amount_refunded_minor, 0);

ALTER TABLE payments
  ALTER COLUMN amount_refunded_minor SET DEFAULT 0;

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS merchant_refund_id VARCHAR(100);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS utr_masked VARCHAR(100);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS provider_txn_id VARCHAR(255);

UPDATE refunds
   SET merchant_refund_id = COALESCE(merchant_refund_id, provider_refund_id, id)
 WHERE merchant_refund_id IS NULL;

UPDATE refunds
   SET provider_txn_id = COALESCE(provider_txn_id, provider_refund_id)
 WHERE provider_txn_id IS NULL;

ALTER TABLE refunds
  ALTER COLUMN merchant_refund_id SET NOT NULL;

ALTER TABLE refunds
  ALTER COLUMN status TYPE VARCHAR(20);

ALTER TABLE refunds
  ALTER COLUMN status SET DEFAULT 'pending';

ALTER TABLE refunds
  DROP COLUMN IF EXISTS provider;

ALTER TABLE refunds
  DROP COLUMN IF EXISTS provider_refund_id;

ALTER TABLE refunds
  DROP COLUMN IF EXISTS reason;

DROP INDEX IF EXISTS refunds_provider_refund_unique;

CREATE UNIQUE INDEX IF NOT EXISTS refunds_payment_merchant_refund_unique
    ON refunds (payment_id, merchant_refund_id);
