ALTER TABLE "payments"
ADD COLUMN "provider_transaction_id" varchar(255),
ADD COLUMN "provider_reference_id" varchar(255),
ADD COLUMN "upi_payer_handle" varchar(255),
ADD COLUMN "upi_utr" varchar(100),
ADD COLUMN "receipt_url" text;
