ALTER TABLE "offers" ADD COLUMN "commission_type" varchar(20);
ALTER TABLE "offers" ADD COLUMN "commission_value" numeric(10, 2);
ALTER TABLE "offer_redemptions" ADD COLUMN "commission_amount" numeric(10, 2) DEFAULT '0' NOT NULL;
