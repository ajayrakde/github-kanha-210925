// Refunds table - tracks refund attempts
export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),

  tenantId: varchar("tenant_id").notNull().default('default'),

  paymentId: varchar("payment_id")
    .references(() => payments.id)
    .notNull(),

  // Optional: we sometimes infer provider from the payment;
  // keep nullable so pending rows can be created before adapter call.
  provider: varchar("provider", { length: 50 }),

  // Provider-side identifiers and merchant correlation keys
  providerRefundId: varchar("provider_refund_id"),
  merchantRefundId: varchar("merchant_refund_id", { length: 100 }).notNull(),
  originalMerchantOrderId: varchar("original_merchant_order_id", { length: 255 }),

  // Money & state
  amountMinor: integer("amount_minor").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'), // pending|processing|completed|failed|cancelled
  reason: text("reason"),

  // UPI metadata (masked + raw as provided; service reads/writes masked/txn id)
  upiUtr: varchar("upi_utr", { length: 100 }),
  utrMasked: varchar("utr_masked", { length: 100 }),
  providerTxnId: varchar("provider_txn_id", { length: 255 }),

  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueMerchantRefundPerPayment: uniqueIndex("refunds_payment_merchant_refund_unique")
    .on(table.paymentId, table.merchantRefundId),
}));
