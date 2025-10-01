ALTER TABLE "orders"
ADD COLUMN "payment_status" varchar(50) NOT NULL DEFAULT 'pending';

ALTER TABLE "orders"
ADD COLUMN "payment_method" varchar(50) NOT NULL DEFAULT 'unselected';
