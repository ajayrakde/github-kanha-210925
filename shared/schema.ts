import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  decimal,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - created via OTP verification during checkout
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 15 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }), // Optional for password login
  address: text("address"),
  city: varchar("city", { length: 100 }),
  pincode: varchar("pincode", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products table - max 10 products with enhanced fields
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  classification: varchar("classification", { length: 255 }),
  category: varchar("category", { length: 255 }),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  imageUrl: text("image_url"), // Primary image for backward compatibility
  images: text("images").array().default([]), // Array of image URLs (max 5)
  displayImageUrl: text("display_image_url"), // Selected display image from the images array
  stock: integer("stock").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});


// Influencers table - supporting both OTP and password authentication
export const influencers = pgTable("influencers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 15 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }), // Optional for password login
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin table - supporting both OTP and password authentication
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }), // Optional for legacy support
  phone: varchar("phone", { length: 15 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }), // Optional for password login
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// OTP table for authentication
export const otps = pgTable("otps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: varchar("phone", { length: 15 }).notNull(),
  otp: varchar("otp", { length: 64 }).notNull(), // Hashed OTP or session ID for 2Factor
  userType: varchar("user_type", { length: 20 }).notNull(), // 'buyer', 'influencer', 'admin'
  expiresAt: timestamp("expires_at").notNull(),
  isUsed: boolean("is_used").default(false),
  attempts: integer("attempts").default(0), // Track failed verification attempts
  createdAt: timestamp("created_at").defaultNow(),
});

// Checkout Intents table - temporary storage for checkout data before order creation
export const checkoutIntents = pgTable("checkout_intents", {
  id: varchar("id").primaryKey(), // intentId from frontend
  sessionId: varchar("session_id").notNull(),
  userInfo: jsonb("user_info"), // Stores user information from checkout
  paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
  offerCode: varchar("offer_code", { length: 50 }),
  selectedAddressId: varchar("selected_address_id"),
  cartItems: jsonb("cart_items").notNull(), // Store cart items snapshot
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discount: decimal("discount", { precision: 10, scale: 2 }).default(sql`'0'`),
  shippingCharge: decimal("shipping_charge", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  isConsumed: boolean("is_consumed").default(false), // Mark as consumed after order creation
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at").notNull(), // Expire after 1 hour
});

// App Settings table for admin configuration
export const appSettings = pgTable("app_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  category: varchar("category", { length: 50 }).default("general"),
  updatedBy: varchar("updated_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Offers/Coupons table with advanced features
export const offers = pgTable("offers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  discountType: varchar("discount_type", { length: 20 }).notNull(), // 'percentage' or 'flat'
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }), // for percentage discounts
  minCartValue: decimal("min_cart_value", { precision: 10, scale: 2 }).default(sql`'0'`),
  globalUsageLimit: integer("global_usage_limit"),
  perUserUsageLimit: integer("per_user_usage_limit").default(1),
  currentUsage: integer("current_usage").default(0),
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  influencerId: varchar("influencer_id").references(() => influencers.id),
  commissionType: varchar("commission_type", { length: 20 }),
  commissionValue: decimal("commission_value", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders table - Updated for provider-agnostic payments
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'), // Single tenant app
  userId: varchar("user_id").references(() => users.id).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default('INR'),
  amountMinor: integer("amount_minor").notNull(), // Amount in smallest currency unit (paise for INR)
  status: varchar("status", { length: 50 }).notNull().default('pending'), // pending|paid|partially_refunded|refunded|cancelled
  paymentStatus: varchar("payment_status", { length: 50 })
    .notNull()
    .default('pending'), // pending|processing|paid|failed
  paymentFailedAt: timestamp("payment_failed_at"),
  paymentMethod: varchar("payment_method", { length: 50 })
    .notNull()
    .default('unselected'), // cod|upi|card|netbanking|wallet|unselected
  // Cashfree order tracking fields
  cashfreeOrderId: varchar("cashfree_order_id", { length: 100 }), // cf_order_id from Cashfree
  cashfreePaymentSessionId: text("cashfree_payment_session_id"), // payment_session_id for checkout
  cashfreeOrderStatus: varchar("cashfree_order_status", { length: 50 }), // ACTIVE|PAID|EXPIRED etc
  cashfreeCreated: boolean("cashfree_created").default(false), // Whether Cashfree order was successfully created
  cashfreeAttempts: integer("cashfree_attempts").default(0), // Number of Cashfree creation attempts
  cashfreeLastError: text("cashfree_last_error"), // Last error from Cashfree API
  // Legacy fields for backward compatibility
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default(sql`'0'`),
  shippingCharge: decimal("shipping_charge", { precision: 10, scale: 2 }).default(sql`'50'`),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  offerId: varchar("offer_id").references(() => offers.id),
  deliveryAddressId: varchar("delivery_address_id").references(() => userAddresses.id).notNull(),
  checkoutIntentId: varchar("checkout_intent_id", { length: 255 }).unique(), // Unique ID to prevent duplicate orders
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Order items table
export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

// Cart items table (session-based)
export const cartItems = pgTable("cart_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  quantity: integer("quantity").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User addresses table - supports multiple addresses per user
export const userAddresses = pgTable("user_addresses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 255 }).notNull(), // Address name (e.g., "Home", "Office")
  address: text("address").notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  pincode: varchar("pincode", { length: 10 }).notNull(),
  isPreferred: boolean("is_preferred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Shipping rules table - for managing shipping charges based on products, locations, and order values
export const shippingRules = pgTable("shipping_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  type: varchar("type", { length: 50 }).notNull(), // 'product_based' or 'location_value_based'
  shippingCharge: decimal("shipping_charge", { precision: 10, scale: 2 }).notNull(),
  isEnabled: boolean("is_enabled").default(true),
  priority: integer("priority").default(0), // Higher priority rules are evaluated first
  conditions: jsonb("conditions").notNull(), // JSON object storing rule conditions
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Provider-agnostic payment system tables following TASK 1 specification

// Payments table - tracks individual payment attempts
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(), // razorpay|payu|ccavenue|cashfree|paytm|billdesk|phonepe|stripe
  environment: varchar("environment", { length: 10 }).notNull(), // test|live
  providerPaymentId: varchar("provider_payment_id"),
  providerOrderId: varchar("provider_order_id"),
  providerTransactionId: varchar("provider_transaction_id", { length: 255 }),
  providerReferenceId: varchar("provider_reference_id", { length: 255 }),
  amountAuthorizedMinor: integer("amount_authorized_minor"),
  amountCapturedMinor: integer("amount_captured_minor").default(0),
  amountRefundedMinor: integer("amount_refunded_minor").default(0),
  currency: varchar("currency", { length: 3 }).notNull().default('INR'),
  status: varchar("status", { length: 50 }).notNull().default('created'), // created|requires_action|authorized|captured|failed|cancelled
  failureCode: varchar("failure_code", { length: 100 }),
  failureMessage: text("failure_message"),
  methodKind: varchar("method_kind", { length: 50 }), // card|upi|netbanking|wallet
  methodBrand: varchar("method_brand", { length: 50 }), // visa|mastercard|amex|etc
  last4: varchar("last4", { length: 4 }), // Last 4 digits of card
  upiPayerHandle: varchar("upi_payer_handle", { length: 255 }),
  upiUtr: varchar("upi_utr", { length: 100 }),
  upiInstrumentVariant: varchar("upi_instrument_variant", { length: 50 }),
  receiptUrl: text("receipt_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueProviderPayment: uniqueIndex("payments_provider_payment_unique")
    .on(table.provider, table.providerPaymentId)
    .where(sql`${table.providerPaymentId} IS NOT NULL`),
  uniqueUpiCapturePerOrder: uniqueIndex("payments_upi_captured_order_unique")
    .on(table.orderId)
    .where(
      sql`${table.methodKind} = 'upi' AND ${table.status} IN ('captured','completed','COMPLETED','succeeded','success','paid')`
    ),
}));

// Refunds table - tracks refund attempts
export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  paymentId: varchar("payment_id").references(() => payments.id).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  providerRefundId: varchar("provider_refund_id"),
  merchantRefundId: varchar("merchant_refund_id", { length: 255 }),
  originalMerchantOrderId: varchar("original_merchant_order_id", { length: 255 }),
  amountMinor: integer("amount_minor").notNull(),
  status: varchar("status", { length: 50 }).notNull().default('pending'), // pending|succeeded|failed
  reason: text("reason"),
  upiUtr: varchar("upi_utr", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueProviderRefund: uniqueIndex("refunds_provider_refund_unique")
    .on(table.provider, table.providerRefundId)
    .where(sql`${table.providerRefundId} IS NOT NULL`),
}));

// Payment events table - audit trail for all payment-related events
export const paymentEvents = pgTable("payment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  paymentId: varchar("payment_id").references(() => payments.id),
  provider: varchar("provider", { length: 50 }).notNull(),
  type: varchar("type", { length: 100 }).notNull(), // payment.captured, refund.succeeded, webhook.received, etc
  data: jsonb("data").notNull(),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

// PhonePe polling jobs - tracks background status polling cadence
export const phonepePollingJobs = pgTable("phonepe_polling_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  paymentId: varchar("payment_id").references(() => payments.id).notNull(),
  merchantTransactionId: varchar("merchant_transaction_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  attempt: integer("attempt").notNull().default(0),
  nextPollAt: timestamp("next_poll_at").notNull(),
  expireAt: timestamp("expire_at").notNull(),
  lastPolledAt: timestamp("last_polled_at"),
  lastStatus: varchar("last_status", { length: 50 }),
  lastResponseCode: varchar("last_response_code", { length: 50 }),
  lastError: text("last_error"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniquePayment: uniqueIndex("phonepe_polling_payment_unique")
    .on(table.tenantId, table.paymentId),
}));

// Webhook inbox table - stores and deduplicates incoming webhooks
export const webhookInbox = pgTable("webhook_inbox", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  provider: varchar("provider", { length: 50 }).notNull(),
  dedupeKey: varchar("dedupe_key").notNull(),
  signatureVerified: boolean("signature_verified").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
  processedAt: timestamp("processed_at"),
}, (table) => ({
  uniqueDedupeKey: uniqueIndex("webhook_inbox_provider_dedupe_unique")
    .on(table.provider, table.dedupeKey),
}));

// Idempotency keys table - ensures idempotent operations
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key").primaryKey(),
  tenantId: varchar("tenant_id").notNull().default('default'),
  scope: varchar("scope", { length: 100 }).notNull(), // payment|refund|etc
  requestHash: text("request_hash").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Payment provider config table - stores non-secret configuration only
export const paymentProviderConfig = pgTable("payment_provider_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull().default('default'),
  provider: varchar("provider", { length: 50 }).notNull(), // razorpay|payu|ccavenue|cashfree|paytm|billdesk|phonepe|stripe
  environment: varchar("environment", { length: 10 }).notNull(), // test|live
  isEnabled: boolean("is_enabled").notNull().default(false),
  displayName: varchar("display_name", { length: 255 }),
  keyId: varchar("key_id", { length: 255 }), // Razorpay key_id, public keys
  merchantId: varchar("merchant_id", { length: 255 }), // Merchant identifier
  accessCode: varchar("access_code", { length: 255 }), // CCAvenue access code
  appId: varchar("app_id", { length: 255 }), // Cashfree app_id
  publishableKey: varchar("publishable_key", { length: 255 }), // Stripe publishable key
  saltIndex: integer("salt_index"), // PhonePe salt index
  accountId: varchar("account_id", { length: 255 }), // Provider account identifier
  successUrl: text("success_url"), // Payment success redirect
  failureUrl: text("failure_url"), // Payment failure redirect
  webhookUrl: text("webhook_url"), // Webhook endpoint
  capabilities: jsonb("capabilities").notNull().default('{}'), // Supported features
  metadata: jsonb("metadata").notNull().default('{}'), // Additional config
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniqueProviderEnv: uniqueIndex("payment_provider_config_tenant_provider_env_unique")
    .on(table.tenantId, table.provider, table.environment),
}));

// Offer redemptions table - tracks per-user usage
export const offerRedemptions = pgTable("offer_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").references(() => offers.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).default(sql`'0'`).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  offerRedemptions: many(offerRedemptions),
  addresses: many(userAddresses),
}));

export const productsRelations = relations(products, ({ many }) => ({
  orderItems: many(orderItems),
  cartItems: many(cartItems),
}));


export const influencersRelations = relations(influencers, ({ many }) => ({
  offers: many(offers),
}));

export const offersRelations = relations(offers, ({ one, many }) => ({
  influencer: one(influencers, {
    fields: [offers.influencerId],
    references: [influencers.id],
  }),
  orders: many(orders),
  redemptions: many(offerRedemptions),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  offer: one(offers, {
    fields: [orders.offerId],
    references: [offers.id],
  }),
  items: many(orderItems),
  redemption: many(offerRedemptions),
  deliveryAddress: one(userAddresses, {
    fields: [orders.deliveryAddressId],
    references: [userAddresses.id],
  }),
  payments: many(payments), // New relation to payments
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));

export const offerRedemptionsRelations = relations(offerRedemptions, ({ one }) => ({
  offer: one(offers, {
    fields: [offerRedemptions.offerId],
    references: [offers.id],
  }),
  user: one(users, {
    fields: [offerRedemptions.userId],
    references: [users.id],
  }),
  order: one(orders, {
    fields: [offerRedemptions.orderId],
    references: [orders.id],
  }),
}));

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, {
    fields: [userAddresses.userId],
    references: [users.id],
  }),
}));

// New payment system relations
export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, {
    fields: [payments.orderId],
    references: [orders.id],
  }),
  refunds: many(refunds),
  events: many(paymentEvents),
}));

export const refundsRelations = relations(refunds, ({ one }) => ({
  payment: one(payments, {
    fields: [refunds.paymentId],
    references: [payments.id],
  }),
}));

export const paymentEventsRelations = relations(paymentEvents, ({ one }) => ({
  payment: one(payments, {
    fields: [paymentEvents.paymentId],
    references: [payments.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  stock: z.number().int().default(0).optional(),
});
export const insertInfluencerSchema = createInsertSchema(influencers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdminSchema = createInsertSchema(admins).omit({ id: true, createdAt: true, updatedAt: true });
const baseInsertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, currentUsage: true }).extend({
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  commissionType: z.preprocess(
    value => value === '' ? null : value,
    z.enum(["percentage", "flat"]).nullable().optional()
  ),
  commissionValue: z.preprocess(
    value => {
      if (value === '' || value === undefined) return null;
      return value;
    },
    z
      .string()
      .nullable()
      .optional()
      .refine(val => val === null || (!isNaN(Number(val)) && Number(val) > 0), "Commission value must be a positive number")
  ),
});

const validateCommissionRequirements = (data: any, ctx: z.RefinementCtx) => {
  const hasInfluencer = typeof data.influencerId === 'string' && data.influencerId.trim() !== '';
  if (hasInfluencer) {
    if (!data.commissionType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Commission type is required when an influencer is assigned",
        path: ["commissionType"],
      });
    }
    if (!data.commissionValue) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Commission value is required when an influencer is assigned",
        path: ["commissionValue"],
      });
    }
  }
};

export const insertOfferSchema = baseInsertOfferSchema.superRefine(validateCommissionRequirements);
export const updateOfferSchema = baseInsertOfferSchema.partial().superRefine(validateCommissionRequirements);
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOtpSchema = createInsertSchema(otps).omit({ id: true, createdAt: true });
export const insertUserAddressSchema = createInsertSchema(userAddresses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ id: true, createdAt: true, updatedAt: true });

// New payment system schemas
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentEventSchema = createInsertSchema(paymentEvents).omit({ id: true });
export const insertWebhookInboxSchema = createInsertSchema(webhookInbox).omit({ id: true });
export const insertIdempotencyKeySchema = createInsertSchema(idempotencyKeys);
export const insertPaymentProviderConfigSchema = createInsertSchema(paymentProviderConfig).omit({ id: true, createdAt: true, updatedAt: true });
// SQL-like query operators
const queryOperatorSchema = z.enum([
  "IN",
  "NOT_IN", 
  "BETWEEN",
  "NOT_BETWEEN",
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "STARTS_WITH",
  "ENDS_WITH",
  "CONTAINS"
]);

// Query fields for different rule types
const productQueryFieldSchema = z.enum([
  "productName",
  "category", 
  "classification"
]);

const locationQueryFieldSchema = z.enum([
  "pincode",
  "orderValue"
]);

// Query rule structure
const baseQueryRuleSchema = z.object({
  field: z.string(),
  operator: queryOperatorSchema,
  values: z.array(z.string()).min(1, "At least one value is required"),
});

// Product-based query rule
const productQueryRuleSchema = baseQueryRuleSchema.extend({
  field: productQueryFieldSchema,
}).refine((data) => {
  // BETWEEN and NOT_BETWEEN require exactly 2 values
  if (["BETWEEN", "NOT_BETWEEN"].includes(data.operator)) {
    return data.values.length === 2;
  }
  // Single value operators
  if (["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "STARTS_WITH", "ENDS_WITH", "CONTAINS"].includes(data.operator)) {
    return data.values.length === 1;
  }
  // IN and NOT_IN can have multiple values
  return data.values.length >= 1;
}, { message: "Invalid number of values for the selected operator" });

// Location-based query rule  
const locationQueryRuleSchema = baseQueryRuleSchema.extend({
  field: locationQueryFieldSchema,
}).refine((data) => {
  // Validate PIN codes if field is pincode
  if (data.field === "pincode") {
    // For string operators, PIN codes can be partial for STARTS_WITH, ENDS_WITH, CONTAINS
    if (["STARTS_WITH", "ENDS_WITH", "CONTAINS"].includes(data.operator)) {
      return data.values.every(val => /^\d+$/.test(val) && val.length <= 6);
    }
    return data.values.every(val => /^\d{6}$/.test(val));
  }
  // Validate numeric values if field is orderValue
  if (data.field === "orderValue") {
    return data.values.every(val => !isNaN(parseFloat(val)) && parseFloat(val) >= 0);
  }
  return true;
}, { message: "Invalid values for the selected field" }).refine((data) => {
  // BETWEEN and NOT_BETWEEN require exactly 2 values
  if (["BETWEEN", "NOT_BETWEEN"].includes(data.operator)) {
    return data.values.length === 2;
  }
  // Single value operators
  if (["EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "STARTS_WITH", "ENDS_WITH", "CONTAINS"].includes(data.operator)) {
    return data.values.length === 1;
  }
  // IN and NOT_IN can have multiple values
  return data.values.length >= 1;
}, { message: "Invalid number of values for the selected operator" });

// Query conditions with logical operators
export const productQueryConditionsSchema = z.object({
  rules: z.array(productQueryRuleSchema).min(1, "At least one rule is required"),
  logicalOperator: z.enum(["AND", "OR"]).default("AND"),
});

export const locationQueryConditionsSchema = z.object({
  rules: z.array(locationQueryRuleSchema).min(1, "At least one rule is required"),
  logicalOperator: z.enum(["AND", "OR"]).default("AND"),
});

// Modern shipping rule schema - query-based only
export const insertShippingRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("product_query_based"),
    conditions: productQueryConditionsSchema,
  }),
  z.object({
    type: z.literal("location_query_based"),
    conditions: locationQueryConditionsSchema,
  }),
]).and(z.object({
  name: z.string().min(1, "Name is required").max(255, "Name too long"),
  description: z.string().max(2000, "Description too long").optional(),
  shippingCharge: z.coerce.string(),
  isEnabled: z.boolean().optional().default(true),
  priority: z.number().int().min(0).max(1000000).optional().default(0),
}));

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Influencer = typeof influencers.$inferSelect;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;
export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Offer = typeof offers.$inferSelect;
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type OrderItem = typeof orderItems.$inferSelect;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type OfferRedemption = typeof offerRedemptions.$inferSelect;
export type UserAddress = typeof userAddresses.$inferSelect;
export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;
export type Otp = typeof otps.$inferSelect;
export type InsertOtp = z.infer<typeof insertOtpSchema>;
export type AppSettings = typeof appSettings.$inferSelect;
export type InsertAppSettings = z.infer<typeof insertAppSettingsSchema>;
export type ShippingRule = typeof shippingRules.$inferSelect;
export type InsertShippingRule = z.infer<typeof insertShippingRuleSchema>;

// New payment system types
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type InsertPaymentEvent = z.infer<typeof insertPaymentEventSchema>;
export type WebhookInbox = typeof webhookInbox.$inferSelect;
export type InsertWebhookInbox = z.infer<typeof insertWebhookInboxSchema>;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type InsertIdempotencyKey = z.infer<typeof insertIdempotencyKeySchema>;
export type PaymentProviderConfig = typeof paymentProviderConfig.$inferSelect;
export type InsertPaymentProviderConfig = z.infer<typeof insertPaymentProviderConfigSchema>;

// Query-based types
export type QueryOperator = z.infer<typeof queryOperatorSchema>;
export type ProductQueryField = z.infer<typeof productQueryFieldSchema>;
export type LocationQueryField = z.infer<typeof locationQueryFieldSchema>;
export type ProductQueryRule = z.infer<typeof productQueryRuleSchema>;
export type LocationQueryRule = z.infer<typeof locationQueryRuleSchema>;
export type ProductQueryConditions = z.infer<typeof productQueryConditionsSchema>;
export type LocationQueryConditions = z.infer<typeof locationQueryConditionsSchema>;
