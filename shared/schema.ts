import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
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
  stock: integer("stock").default(0).notNull(),
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
  createdAt: timestamp("created_at").defaultNow(),
});

// Orders table
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: varchar("status", { length: 50 }).default('pending'), // pending, confirmed, delivered, cancelled
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default(sql`'0'`),
  shippingCharge: decimal("shipping_charge", { precision: 10, scale: 2 }).default(sql`'50'`),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  offerId: varchar("offer_id").references(() => offers.id),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentStatus: varchar("payment_status", { length: 50 }).default('pending'),
  deliveryAddressId: varchar("delivery_address_id").references(() => userAddresses.id).notNull(),
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

// Payment providers table - defines available payment gateways
export const paymentProviders = pgTable("payment_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(), // 'phonepe', 'razorpay', 'stripe', etc
  displayName: varchar("display_name", { length: 255 }).notNull(), // 'PhonePe', 'Razorpay', 'Stripe'
  description: text("description"),
  isEnabled: boolean("is_enabled").default(true),
  isDefault: boolean("is_default").default(false), // Only one provider can be default
  priority: integer("priority").default(0), // Order in which to try providers
  supportedModes: text("supported_modes").array().notNull().default(['test', 'live']), // supported modes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment provider settings - stores encrypted credentials and configuration
export const paymentProviderSettings = pgTable("payment_provider_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").references(() => paymentProviders.id).notNull(),
  mode: varchar("mode", { length: 20 }).notNull(), // 'test' or 'live'
  settings: jsonb("settings").notNull(), // Encrypted credentials and config
  isActive: boolean("is_active").default(false),
  updatedBy: varchar("updated_by").references(() => admins.id), // admin who updated
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment transactions table - tracks all payment attempts
export const paymentTransactions = pgTable("payment_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  providerId: varchar("provider_id").references(() => paymentProviders.id).notNull(),
  providerOrderId: varchar("provider_order_id"), // PhonePe orderId, Razorpay order_id, etc
  merchantTransactionId: varchar("merchant_transaction_id"), // Our transaction reference
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 5 }).default('INR'),
  status: varchar("status", { length: 50 }).notNull().default('initiated'), // initiated, pending, completed, failed, cancelled
  paymentMode: varchar("payment_mode", { length: 50 }), // UPI_QR, UPI_INTENT, CARD, NET_BANKING, etc
  gatewayResponse: jsonb("gateway_response"), // Full response from payment gateway
  errorCode: varchar("error_code", { length: 100 }),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Additional info like UDF fields, etc
  webhookData: jsonb("webhook_data"), // Data received from webhooks
  redirectUrl: text("redirect_url"), // URL to redirect user for payment
  expiresAt: timestamp("expires_at"), // Payment link expiry
  completedAt: timestamp("completed_at"), // When payment was completed
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payment refunds table - tracks refund requests and status
export const paymentRefunds = pgTable("payment_refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  transactionId: varchar("transaction_id").references(() => paymentTransactions.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  providerRefundId: varchar("provider_refund_id"), // PhonePe refundId, etc
  merchantRefundId: varchar("merchant_refund_id").notNull(), // Our refund reference
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 50 }).notNull().default('initiated'), // initiated, pending, completed, failed
  gatewayResponse: jsonb("gateway_response"), // Full response from payment gateway
  errorCode: varchar("error_code", { length: 100 }),
  errorMessage: text("error_message"),
  completedAt: timestamp("completed_at"),
  initiatedBy: varchar("initiated_by").references(() => admins.id), // Admin who initiated refund
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Offer redemptions table - tracks per-user usage
export const offerRedemptions = pgTable("offer_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  offerId: varchar("offer_id").references(() => offers.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
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

export const paymentProvidersRelations = relations(paymentProviders, ({ many }) => ({
  settings: many(paymentProviderSettings),
  transactions: many(paymentTransactions),
}));

export const paymentProviderSettingsRelations = relations(paymentProviderSettings, ({ one }) => ({
  provider: one(paymentProviders, {
    fields: [paymentProviderSettings.providerId],
    references: [paymentProviders.id],
  }),
  updatedByAdmin: one(admins, {
    fields: [paymentProviderSettings.updatedBy],
    references: [admins.id],
  }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one, many }) => ({
  order: one(orders, {
    fields: [paymentTransactions.orderId],
    references: [orders.id],
  }),
  provider: one(paymentProviders, {
    fields: [paymentTransactions.providerId],
    references: [paymentProviders.id],
  }),
  refunds: many(paymentRefunds),
}));

export const paymentRefundsRelations = relations(paymentRefunds, ({ one }) => ({
  transaction: one(paymentTransactions, {
    fields: [paymentRefunds.transactionId],
    references: [paymentTransactions.id],
  }),
  order: one(orders, {
    fields: [paymentRefunds.orderId],
    references: [orders.id],
  }),
  initiatedByAdmin: one(admins, {
    fields: [paymentRefunds.initiatedBy],
    references: [admins.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInfluencerSchema = createInsertSchema(influencers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAdminSchema = createInsertSchema(admins).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOfferSchema = createInsertSchema(offers).omit({ id: true, createdAt: true, currentUsage: true }).extend({
  startDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
  endDate: z.string().optional().transform(val => val ? new Date(val) : undefined),
});
export const insertOrderSchema = createInsertSchema(orders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItems).omit({ id: true });
export const insertCartItemSchema = createInsertSchema(cartItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOtpSchema = createInsertSchema(otps).omit({ id: true, createdAt: true });
export const insertUserAddressSchema = createInsertSchema(userAddresses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAppSettingsSchema = createInsertSchema(appSettings).omit({ id: true, createdAt: true, updatedAt: true });

// Payment provider schemas
export const insertPaymentProviderSchema = createInsertSchema(paymentProviders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentProviderSettingsSchema = createInsertSchema(paymentProviderSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactions).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentRefundSchema = createInsertSchema(paymentRefunds).omit({ id: true, createdAt: true, updatedAt: true });
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

// Payment provider types
export type PaymentProvider = typeof paymentProviders.$inferSelect;
export type InsertPaymentProvider = z.infer<typeof insertPaymentProviderSchema>;
export type PaymentProviderSettings = typeof paymentProviderSettings.$inferSelect;
export type InsertPaymentProviderSettings = z.infer<typeof insertPaymentProviderSettingsSchema>;
export type PaymentTransaction = typeof paymentTransactions.$inferSelect;
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentRefund = typeof paymentRefunds.$inferSelect;
export type InsertPaymentRefund = z.infer<typeof insertPaymentRefundSchema>;

// Query-based types
export type QueryOperator = z.infer<typeof queryOperatorSchema>;
export type ProductQueryField = z.infer<typeof productQueryFieldSchema>;
export type LocationQueryField = z.infer<typeof locationQueryFieldSchema>;
export type ProductQueryRule = z.infer<typeof productQueryRuleSchema>;
export type LocationQueryRule = z.infer<typeof locationQueryRuleSchema>;
export type ProductQueryConditions = z.infer<typeof productQueryConditionsSchema>;
export type LocationQueryConditions = z.infer<typeof locationQueryConditionsSchema>;
