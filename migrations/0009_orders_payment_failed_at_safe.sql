ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "payment_failed_at" timestamp;
