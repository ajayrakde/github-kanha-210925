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
} from "@shared/schema";
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

  // Order operations
  getOrders(): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer })[]>;
  getOrder(id: string): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer }) | undefined>;
  createOrder(order: InsertOrder): Promise<Order>;
  createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  getOrdersByUser(userId: string): Promise<Order[]>;

  // Offer redemption operations
  createOfferRedemption(redemption: Omit<OfferRedemption, 'id' | 'createdAt'>): Promise<OfferRedemption>;
  getOfferRedemptionsByUser(userId: string, offerId: string): Promise<OfferRedemption[]>;
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
  async getOffers(): Promise<Offer[]> {
    return await db.select().from(offers).orderBy(desc(offers.createdAt));
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


  // Order operations
  async getOrders(): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer })[]> {
    const ordersData = await db.query.orders.findMany({
      with: {
        user: true,
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
      },
      orderBy: desc(orders.createdAt),
    });
    return ordersData.map(order => ({
      ...order,
      offer: order.offer || undefined
    }));
  }

  async getOrder(id: string): Promise<(Order & { user: User; items: (OrderItem & { product: Product })[]; offer?: Offer }) | undefined> {
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

  async getOrdersByUser(userId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.userId, userId));
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

}

export const storage = new DatabaseStorage();
