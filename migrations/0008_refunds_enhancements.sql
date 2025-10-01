ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "merchant_refund_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "original_merchant_order_id" varchar(255),
  ADD COLUMN IF NOT EXISTS "upi_utr" varchar(100);
