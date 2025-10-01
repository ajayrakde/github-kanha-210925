-- Prevent duplicate captured UPI payments per order
CREATE UNIQUE INDEX IF NOT EXISTS payments_upi_captured_order_unique
  ON payments (order_id)
  WHERE method_kind = 'upi'
    AND status IN ('captured','completed','COMPLETED','succeeded','success','paid');
