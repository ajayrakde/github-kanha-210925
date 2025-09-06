import {
  users,
  products,
  admins,
  influencers,
  offers,
  orders,
  orderItems,
  cartItems,
  offerRedemptions,
  appSettings,
  shippingRules,
  type User,
  type InsertUser,
  type Product,
  type InsertProduct,
  type Admin,
  type InsertAdmin,
  type Influencer,
  type InsertInfluencer,
  type Offer,
  type InsertOffer,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type CartItem,
  type InsertCartItem,
  type OfferRedemption,
  type UserAddress,
  type InsertUserAddress,
  type AppSettings,
  type InsertAppSettings,
  type ShippingRule,
  type InsertShippingRule,
  userAddresses,
} from "@shared/schema";
import type { AbandonedCart } from "@/lib/types";
import { db } from "./db";
import { eq, and, desc, sql, gte, lte, lt } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User>;
  authenticateUser(phone: string, password: string): Promise<User | null>;

  // Product operations
  getProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;


  // Admin operations
  getAdmins(): Promise<Admin[]>;
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByUsername(username: string): Promise<Admin | undefined>;
  getAdminByPhone(phone: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdmin(id: string, admin: Partial<InsertAdmin>): Promise<Admin>;
  deleteAdmin(id: string): Promise<void>;
  deactivateAdmin(id: string): Promise<void>;
  validateAdminLogin(username: string, password: string): Promise<Admin | null>;
  authenticateAdmin(phone: string, password: string): Promise<Admin | null>;

  // Influencer operations
  getInfluencers(): Promise<Influencer[]>;
  getInfluencer(id: string): Promise<Influencer | undefined>;
  getInfluencerByPhone(phone: string): Promise<Influencer | undefined>;
  createInfluencer(influencer: InsertInfluencer): Promise<Influencer>;
  updateInfluencer(id: string, influencer: Partial<InsertInfluencer>): Promise<Influencer>;
  deleteInfluencer(id: string): Promise<void>;
  deactivateInfluencer(id: string): Promise<void>;
  authenticateInfluencer(phone: string, password: string): Promise<Influencer | null>;

  // Offer operations
  getOffers(): Promise<Offer[]>;
  getOfferByCode(code: string): Promise<Offer | undefined>;
  createOffer(offer: InsertOffer): Promise<Offer>;
  updateOffer(id: string, offer: Partial<InsertOffer>): Promise<Offer>;
  deleteOffer(id: string): Promise<void>;
  validateOffer(code: string, userId: string, cartValue: number): Promise<{ valid: boolean; offer?: Offer; message?: string }>;
  incrementOfferUsage(offerId: string): Promise<void>;

  // Cart operations
  getCartItems(sessionId: string): Promise<(CartItem & { product: Product })[]>;
  addToCart(sessionId: string, productId: string, quantity: number): Promise<CartItem>;
  updateCartItem(sessionId: string, productId: string, quantity: number): Promise<CartItem>;
  removeFromCart(sessionId: string, productId: string): Promise<void>;
  clearCart(sessionId: string): Promise<void>;

  // Abandoned cart operations
  getAbandonedCarts(): Promise<AbandonedCart[]>;
  trackCartActivity(sessionId: string): Promise<void>;
  markCartAsAbandoned(sessionId: string): Promise<void>;

  // Analytics operations
  getPopularProducts(): Promise<Array<{ product: Product; orderCount: number; totalRevenue: number }>>;
  getSalesTrends(days: number): Promise<Array<{ date: string; orders: number; revenue: number }>>;
  getConversionMetrics(): Promise<{ totalSessions: number; ordersCompleted: number; conversionRate: number }>;

  // Order operations
  getOrders(): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer; deliveryAddress: UserAddress })[]>;
  getOrder(id: string): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer; deliveryAddress: UserAddress }) | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  getOrdersByUser(userId: string): Promise<Order[]>;

  // Offer redemption operations
  createOfferRedemption(redemption: Omit<OfferRedemption, 'id' | 'createdAt'>): Promise<OfferRedemption>;
  getOfferRedemptionsByUser(userId: string, offerId: string): Promise<OfferRedemption[]>;

  // User address operations
  getUserAddresses(userId: string): Promise<UserAddress[]>;
  createUserAddress(address: InsertUserAddress): Promise<UserAddress>;
  updateUserAddress(id: string, address: Partial<InsertUserAddress>): Promise<UserAddress>;
  deleteUserAddress(id: string, userId: string): Promise<void>;
  setPreferredAddress(userId: string, addressId: string): Promise<void>;
  getPreferredAddress(userId: string): Promise<UserAddress | undefined>;
  getLastOrderAddress(userId: string): Promise<UserAddress | null>;

  // App settings operations
  getAppSettings(): Promise<AppSettings[]>;
  getAppSetting(key: string): Promise<AppSettings | undefined>;
  updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSettings>;
  createAppSetting(setting: InsertAppSettings): Promise<AppSettings>;

  // Shipping rules operations
  getShippingRules(): Promise<ShippingRule[]>;
  getShippingRule(id: string): Promise<ShippingRule | undefined>;
  createShippingRule(rule: InsertShippingRule): Promise<ShippingRule>;
  updateShippingRule(id: string, rule: Partial<InsertShippingRule>): Promise<ShippingRule>;
  deleteShippingRule(id: string): Promise<void>;
  getEnabledShippingRules(): Promise<ShippingRule[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async authenticateUser(phone: string, password: string): Promise<User | null> {
    if (!password) return null;
    try {
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (user && user.password === password) {
        return user;
      }
      return null;
    } catch (error) {
      console.error('Error authenticating user:', error);
      return null;
    }
  }

  // Product operations
  async getProducts(): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.isActive, true)).orderBy(products.createdAt);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [createdProduct] = await db.insert(products).values(product).returning();
    return createdProduct;
  }

  async updateProduct(id: string, product: Partial<InsertProduct>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set({ ...product, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.update(products).set({ isActive: false }).where(eq(products.id, id));
  }


  // Admin operations
  async getAdmins(): Promise<Admin[]> {
    return await db.select().from(admins).where(eq(admins.isActive, true));
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.username, username));
    return admin;
  }

  async getAdminByPhone(phone: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.phone, phone));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [createdAdmin] = await db.insert(admins).values(admin).returning();
    return createdAdmin;
  }

  async authenticateAdmin(phone: string, password: string): Promise<Admin | null> {
    if (!password) return null;
    try {
      const [admin] = await db.select().from(admins).where(eq(admins.phone, phone));
      if (admin && admin.password === password && admin.isActive) {
        return admin;
      }
      return null;
    } catch (error) {
      console.error('Error authenticating admin:', error);
      return null;
    }
  }

  async updateAdmin(id: string, admin: Partial<InsertAdmin>): Promise<Admin> {
    const [updatedAdmin] = await db
      .update(admins)
      .set({ ...admin, updatedAt: new Date() })
      .where(eq(admins.id, id))
      .returning();
    return updatedAdmin;
  }

  async deleteAdmin(id: string): Promise<void> {
    await db.update(admins).set({ isActive: false }).where(eq(admins.id, id));
  }

  async deactivateAdmin(id: string): Promise<void> {
    await db.update(admins).set({ isActive: false }).where(eq(admins.id, id));
  }

  async validateAdminLogin(username: string, password: string): Promise<Admin | null> {
    const admin = await this.getAdminByUsername(username);
    if (admin && admin.password === password && admin.isActive) {
      return admin;
    }
    return null;
  }

  // Influencer operations
  async getInfluencers(): Promise<Influencer[]> {
    return await db.select().from(influencers).orderBy(desc(influencers.createdAt));
  }

  async getInfluencer(id: string): Promise<Influencer | undefined> {
    const [influencer] = await db.select().from(influencers).where(eq(influencers.id, id));
    return influencer;
  }

  async getInfluencerByPhone(phone: string): Promise<Influencer | undefined> {
    const [influencer] = await db.select().from(influencers).where(eq(influencers.phone, phone));
    return influencer;
  }

  async createInfluencer(influencer: InsertInfluencer): Promise<Influencer> {
    const [createdInfluencer] = await db.insert(influencers).values(influencer).returning();
    return createdInfluencer;
  }

  async updateInfluencer(id: string, influencer: Partial<InsertInfluencer>): Promise<Influencer> {
    const [updatedInfluencer] = await db
      .update(influencers)
      .set({ ...influencer, updatedAt: new Date() })
      .where(eq(influencers.id, id))
      .returning();
    return updatedInfluencer;
  }

  async deleteInfluencer(id: string): Promise<void> {
    await db.update(influencers).set({ isActive: false }).where(eq(influencers.id, id));
  }

  async deactivateInfluencer(id: string): Promise<void> {
    await db.update(influencers).set({ isActive: false }).where(eq(influencers.id, id));
  }

  async authenticateInfluencer(phone: string, password: string): Promise<Influencer | null> {
    if (!password) return null;
    try {
      const [influencer] = await db.select().from(influencers).where(eq(influencers.phone, phone));
      if (influencer && influencer.password === password && influencer.isActive) {
        return influencer;
      }
      return null;
    } catch (error) {
      console.error('Error authenticating influencer:', error);
      return null;
    }
  }

  // Offer operations
  async getOffers(): Promise<(Offer & { influencer: Influencer | null })[]> {
    const offersData = await db.query.offers.findMany({
      with: {
        influencer: true,
      },
      orderBy: desc(offers.createdAt),
    });
    return offersData;
  }

  async getOfferByCode(code: string): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.code, code.toUpperCase()));
    return offer;
  }


  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [createdOffer] = await db.insert(offers).values({
      ...offer,
      code: offer.code.toUpperCase(),
    }).returning();
    return createdOffer;
  }

  async updateOffer(id: string, offer: Partial<InsertOffer>): Promise<Offer> {
    const updateData = { ...offer };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    const [updatedOffer] = await db
      .update(offers)
      .set(updateData)
      .where(eq(offers.id, id))
      .returning();
    return updatedOffer;
  }

  async deleteOffer(id: string): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  async validateOffer(code: string, userId: string, cartValue: number): Promise<{ valid: boolean; offer?: Offer; message?: string }> {
    const offer = await this.getOfferByCode(code);
    
    if (!offer) {
      return { valid: false, message: "Invalid coupon code" };
    }

    if (!offer.isActive) {
      return { valid: false, message: "This coupon is no longer active" };
    }

    const now = new Date();
    if (offer.startDate && offer.startDate > now) {
      return { valid: false, message: "Coupon is not yet active" };
    }

    if (offer.endDate && offer.endDate < now) {
      return { valid: false, message: "Coupon has expired" };
    }

    if (offer.minCartValue && cartValue < parseFloat(offer.minCartValue)) {
      return { valid: false, message: `Minimum cart value of ₹${offer.minCartValue} required` };
    }

    if (offer.globalUsageLimit && (offer.currentUsage || 0) >= offer.globalUsageLimit) {
      return { valid: false, message: "Coupon usage limit reached" };
    }

    if (offer.perUserUsageLimit) {
      const userRedemptions = await this.getOfferRedemptionsByUser(userId, offer.id);
      if (userRedemptions.length >= offer.perUserUsageLimit) {
        return { valid: false, message: "You have already used this coupon maximum times" };
      }
    }

    return { valid: true, offer };
  }

  async incrementOfferUsage(offerId: string): Promise<void> {
    await db
      .update(offers)
      .set({ currentUsage: sql`${offers.currentUsage} + 1` })
      .where(eq(offers.id, offerId));
  }

  // Cart operations
  async getCartItems(sessionId: string): Promise<(CartItem & { product: Product })[]> {
    return await db
      .select({
        id: cartItems.id,
        sessionId: cartItems.sessionId,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        createdAt: cartItems.createdAt,
        updatedAt: cartItems.updatedAt,
        product: products,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(and(
        eq(cartItems.sessionId, sessionId),
        eq(products.isActive, true)
      ));
  }

  async addToCart(sessionId: string, productId: string, quantity: number): Promise<CartItem> {
    const existingItem = await db
      .select()
      .from(cartItems)
      .where(and(
        eq(cartItems.sessionId, sessionId),
        eq(cartItems.productId, productId)
      ));

    if (existingItem.length > 0) {
      const [updatedItem] = await db
        .update(cartItems)
        .set({ 
          quantity: existingItem[0].quantity + quantity,
          updatedAt: new Date()
        })
        .where(eq(cartItems.id, existingItem[0].id))
        .returning();
      return updatedItem;
    } else {
      const [newItem] = await db
        .insert(cartItems)
        .values({ sessionId, productId, quantity })
        .returning();
      return newItem;
    }
  }

  async updateCartItem(sessionId: string, productId: string, quantity: number): Promise<CartItem> {
    const [updatedItem] = await db
      .update(cartItems)
      .set({ quantity, updatedAt: new Date() })
      .where(and(
        eq(cartItems.sessionId, sessionId),
        eq(cartItems.productId, productId)
      ))
      .returning();
    return updatedItem;
  }

  async removeFromCart(sessionId: string, productId: string): Promise<void> {
    await db
      .delete(cartItems)
      .where(and(
        eq(cartItems.sessionId, sessionId),
        eq(cartItems.productId, productId)
      ));
  }

  async clearCart(sessionId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.sessionId, sessionId));
  }

  // Abandoned cart tracking
  async getAbandonedCarts(): Promise<AbandonedCart[]> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    const abandonedCarts = await db
      .select({
        sessionId: cartItems.sessionId,
        items: sql<number>`count(${cartItems.id})`,
        totalValue: sql<number>`sum(cast(${products.price} as decimal) * ${cartItems.quantity})`,
        lastActivity: sql<Date>`max(${cartItems.updatedAt})`,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(lt(cartItems.updatedAt, cutoffTime))
      .groupBy(cartItems.sessionId)
      .having(sql`count(${cartItems.id}) > 0`);

    return abandonedCarts.map(cart => ({
      sessionId: cart.sessionId,
      items: cart.items,
      totalValue: cart.totalValue,
      lastActivity: cart.lastActivity,
    }));
  }

  async trackCartActivity(sessionId: string): Promise<void> {
    // Update timestamp on any cart activity
    await db
      .update(cartItems)
      .set({ updatedAt: new Date() })
      .where(eq(cartItems.sessionId, sessionId));
  }

  async markCartAsAbandoned(sessionId: string): Promise<void> {
    // This could trigger email campaigns or other retention efforts
    console.log(`Cart ${sessionId} marked as abandoned for potential recovery`);
  }

  // Analytics methods
  async getPopularProducts(): Promise<Array<{ product: Product; orderCount: number; totalRevenue: number }>> {
    const popularProducts = await db
      .select({
        product: products,
        orderCount: sql<number>`count(${orderItems.id})`,
        totalRevenue: sql<number>`sum(cast(${orderItems.price} as decimal) * ${orderItems.quantity})`,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .groupBy(products.id)
      .orderBy(sql`count(${orderItems.id}) desc`)
      .limit(10);

    return popularProducts;
  }

  async getSalesTrends(days: number): Promise<Array<{ date: string; orders: number; revenue: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const trends = await db
      .select({
        date: sql<string>`date(${orders.createdAt})`,
        orders: sql<number>`count(${orders.id})`,
        revenue: sql<number>`sum(cast(${orders.total} as decimal))`,
      })
      .from(orders)
      .where(gte(orders.createdAt, startDate))
      .groupBy(sql`date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);

    return trends;
  }

  async getConversionMetrics(): Promise<{ totalSessions: number; ordersCompleted: number; conversionRate: number }> {
    // Get unique sessions that had cart activity
    const [{ totalSessions }] = await db
      .select({
        totalSessions: sql<number>`count(distinct ${cartItems.sessionId})`,
      })
      .from(cartItems);

    // Get orders completed
    const [{ ordersCompleted }] = await db
      .select({
        ordersCompleted: sql<number>`count(${orders.id})`,
      })
      .from(orders);

    const conversionRate = totalSessions > 0 ? (ordersCompleted / totalSessions) * 100 : 0;

    return {
      totalSessions: totalSessions || 0,
      ordersCompleted: ordersCompleted || 0,
      conversionRate,
    };
  }


  // Order operations
  async getOrders(): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer; deliveryAddress: UserAddress })[]> {
    const ordersData = await db.query.orders.findMany({
      with: {
        user: true,
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
        deliveryAddress: true,
      },
      orderBy: desc(orders.createdAt),
    });
    return ordersData.map(order => ({
      ...order,
      offer: order.offer || undefined
    }));
  }

  async getOrder(id: string): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer; deliveryAddress: UserAddress }) | undefined> {
    const orderData = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        user: true,
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
        deliveryAddress: true,
      },
    });
    return orderData ? {
      ...orderData,
      offer: orderData.offer || undefined
    } : undefined;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [createdOrder] = await db.insert(orders).values(order).returning();
    return createdOrder;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    const createdItems = await db.insert(orderItems).values(items).returning();
    return createdItems;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async getOrdersByUser(userId: string): Promise<(Order & { items: (OrderItem & { product: Product })[]; offer?: Offer; deliveryAddress: UserAddress })[]> {
    const ordersData = await db.query.orders.findMany({
      where: eq(orders.userId, userId),
      with: {
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
        deliveryAddress: true,
      },
      orderBy: desc(orders.createdAt),
    });
    
    return ordersData.map(order => ({
      ...order,
      offer: order.offer || undefined
    }));
  }

  async getLastOrderAddress(userId: string): Promise<UserAddress | null> {
    const lastOrder = await db.query.orders.findFirst({
      where: eq(orders.userId, userId),
      with: {
        deliveryAddress: true,
      },
      orderBy: desc(orders.createdAt),
    });
    
    return lastOrder?.deliveryAddress || null;
  }

  // Offer redemption operations
  async createOfferRedemption(redemption: Omit<OfferRedemption, 'id' | 'createdAt'>): Promise<OfferRedemption> {
    const [createdRedemption] = await db.insert(offerRedemptions).values(redemption).returning();
    return createdRedemption;
  }

  async getOfferRedemptionsByUser(userId: string, offerId: string): Promise<OfferRedemption[]> {
    return await db
      .select()
      .from(offerRedemptions)
      .where(and(
        eq(offerRedemptions.userId, userId),
        eq(offerRedemptions.offerId, offerId)
      ));
  }

  // User address operations
  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return await db.select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(desc(userAddresses.isPreferred), userAddresses.createdAt);
  }

  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    const [createdAddress] = await db.insert(userAddresses).values(address).returning();
    return createdAddress;
  }

  async updateUserAddress(id: string, address: Partial<InsertUserAddress>): Promise<UserAddress> {
    const [updatedAddress] = await db
      .update(userAddresses)
      .set({ ...address, updatedAt: new Date() })
      .where(eq(userAddresses.id, id))
      .returning();
    return updatedAddress;
  }

  async deleteUserAddress(id: string, userId: string): Promise<void> {
    await db.delete(userAddresses).where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
  }

  async setPreferredAddress(userId: string, addressId: string): Promise<void> {
    // First, unset all preferred addresses for this user
    await db
      .update(userAddresses)
      .set({ isPreferred: false })
      .where(eq(userAddresses.userId, userId));
    
    // Then set the specified address as preferred
    await db
      .update(userAddresses)
      .set({ isPreferred: true })
      .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)));
  }

  async getPreferredAddress(userId: string): Promise<UserAddress | undefined> {
    const [address] = await db.select()
      .from(userAddresses)
      .where(and(eq(userAddresses.userId, userId), eq(userAddresses.isPreferred, true)))
      .limit(1);
    return address;
  }


  // App settings operations
  async getAppSettings(): Promise<AppSettings[]> {
    return await db.select().from(appSettings).orderBy(appSettings.category, appSettings.key);
  }

  async getAppSetting(key: string): Promise<AppSettings | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting;
  }

  async updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSettings> {
    const [updated] = await db
      .update(appSettings)
      .set({ 
        value, 
        updatedBy, 
        updatedAt: new Date() 
      })
      .where(eq(appSettings.key, key))
      .returning();
    
    if (!updated) {
      throw new Error(`Setting with key "${key}" not found`);
    }
    
    return updated;
  }

  async createAppSetting(setting: InsertAppSettings): Promise<AppSettings> {
    const [created] = await db.insert(appSettings).values(setting).returning();
    return created;
  }

  // Shipping rules operations
  async getShippingRules(): Promise<ShippingRule[]> {
    return await db.select().from(shippingRules).orderBy(desc(shippingRules.priority), shippingRules.createdAt);
  }

  async getShippingRule(id: string): Promise<ShippingRule | undefined> {
    const [rule] = await db.select().from(shippingRules).where(eq(shippingRules.id, id));
    return rule;
  }

  async createShippingRule(rule: InsertShippingRule): Promise<ShippingRule> {
    const [created] = await db.insert(shippingRules).values(rule).returning();
    return created;
  }

  async updateShippingRule(id: string, rule: Partial<InsertShippingRule>): Promise<ShippingRule> {
    const [updated] = await db
      .update(shippingRules)
      .set({ ...rule, updatedAt: new Date() })
      .where(eq(shippingRules.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Shipping rule with id "${id}" not found`);
    }
    
    return updated;
  }

  async deleteShippingRule(id: string): Promise<void> {
    await db.delete(shippingRules).where(eq(shippingRules.id, id));
  }

  async getEnabledShippingRules(): Promise<ShippingRule[]> {
    return await db.select()
      .from(shippingRules)
      .where(eq(shippingRules.isEnabled, true))
      .orderBy(desc(shippingRules.priority), shippingRules.createdAt);
  }

  // Query evaluation functions for SQL-like conditions
  evaluateQueryRule(rule: any, context: any): boolean {
    const { field, operator, values } = rule;
    const fieldValue = context[field];

    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    switch (operator) {
      case "EQUALS":
        return String(fieldValue).toLowerCase() === String(values[0]).toLowerCase();
      
      case "NOT_EQUALS":
        return String(fieldValue).toLowerCase() !== String(values[0]).toLowerCase();
      
      case "IN":
        return values.some((val: string) => 
          String(fieldValue).toLowerCase() === String(val).toLowerCase()
        );
      
      case "NOT_IN":
        return !values.some((val: string) => 
          String(fieldValue).toLowerCase() === String(val).toLowerCase()
        );
      
      case "BETWEEN":
        if (values.length !== 2) return false;
        const numValue = parseFloat(String(fieldValue));
        const min = parseFloat(values[0]);
        const max = parseFloat(values[1]);
        return !isNaN(numValue) && !isNaN(min) && !isNaN(max) && 
               numValue >= min && numValue <= max;
      
      case "NOT_BETWEEN":
        if (values.length !== 2) return false;
        const numVal = parseFloat(String(fieldValue));
        const minVal = parseFloat(values[0]);
        const maxVal = parseFloat(values[1]);
        return isNaN(numVal) || isNaN(minVal) || isNaN(maxVal) || 
               numVal < minVal || numVal > maxVal;
      
      default:
        return false;
    }
  }

  evaluateQueryConditions(conditions: any, context: any): boolean {
    const { rules, logicalOperator } = conditions;
    
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return false;
    }

    const results = rules.map((rule: any) => this.evaluateQueryRule(rule, context));

    if (logicalOperator === "OR") {
      return results.some(result => result);
    } else {
      return results.every(result => result);
    }
  }

  // Check if shipping rule matches given context (product + order details)
  evaluateShippingRule(rule: ShippingRule, context: {
    productName?: string;
    category?: string;
    classification?: string;
    pincode?: string;
    orderValue?: number;
  }): boolean {
    const { type, conditions } = rule;

    switch (type) {
      case "product_based":
        // Legacy product-based conditions
        const productConditions = conditions as any;
        if (productConditions.productNames?.length && context.productName) {
          if (!productConditions.productNames.includes(context.productName)) {
            return false;
          }
        }
        if (productConditions.categories?.length && context.category) {
          if (!productConditions.categories.includes(context.category)) {
            return false;
          }
        }
        if (productConditions.classifications?.length && context.classification) {
          if (!productConditions.classifications.includes(context.classification)) {
            return false;
          }
        }
        return true;

      case "location_value_based":
        // Legacy location/value-based conditions
        const locationConditions = conditions as any;
        if (locationConditions.pincodes?.length && context.pincode) {
          if (!locationConditions.pincodes.includes(context.pincode)) {
            return false;
          }
        }
        if (locationConditions.pincodeRanges?.length && context.pincode) {
          const pinMatches = locationConditions.pincodeRanges.some((range: any) =>
            context.pincode && context.pincode >= range.start && context.pincode <= range.end
          );
          if (!pinMatches) {
            return false;
          }
        }
        if (locationConditions.minOrderValue !== undefined && context.orderValue !== undefined) {
          if (context.orderValue < locationConditions.minOrderValue) {
            return false;
          }
        }
        if (locationConditions.maxOrderValue !== undefined && context.orderValue !== undefined) {
          if (context.orderValue > locationConditions.maxOrderValue) {
            return false;
          }
        }
        return true;

      case "product_query_based":
        return this.evaluateQueryConditions(conditions, context);

      case "location_query_based":
        return this.evaluateQueryConditions(conditions, context);

      default:
        return false;
    }
  }

  // Find matching shipping rules for given context
  async findMatchingShippingRules(context: {
    productName?: string;
    category?: string;
    classification?: string;
    pincode?: string;
    orderValue?: number;
  }): Promise<ShippingRule[]> {
    const enabledRules = await this.getEnabledShippingRules();
    
    return enabledRules.filter(rule => this.evaluateShippingRule(rule, context));
  }

  // Get the best matching shipping rule (highest priority)
  async getBestShippingRule(context: {
    productName?: string;
    category?: string;
    classification?: string;
    pincode?: string;
    orderValue?: number;
  }): Promise<ShippingRule | undefined> {
    const matchingRules = await this.findMatchingShippingRules(context);
    return matchingRules.length > 0 ? matchingRules[0] : undefined;
  }

}

export const storage = new DatabaseStorage();
