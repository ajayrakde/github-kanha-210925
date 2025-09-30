-- Create PhonePe polling jobs table to track reconciliation worker state
CREATE TABLE IF NOT EXISTS phonepe_polling_jobs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id varchar NOT NULL DEFAULT 'default',
  order_id varchar NOT NULL REFERENCES orders(id),
  payment_id varchar NOT NULL REFERENCES payments(id),
  merchant_transaction_id varchar(255) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 0,
  next_poll_at timestamp NOT NULL,
  expire_at timestamp NOT NULL,
  last_polled_at timestamp,
  last_status varchar(50),
  last_response_code varchar(50),
  last_error text,
  completed_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS phonepe_polling_payment_unique
  ON phonepe_polling_jobs (tenant_id, payment_id);
