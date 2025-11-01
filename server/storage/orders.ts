import {
  orders,
  orderItems,
  cartItems,
  products,
  offers,
  checkoutIntents,
  users,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type CartItem,
  type Product,
  type Offer,
  type User,
  type UserAddress,
  type Payment,
} from "@shared/schema";
import type { AbandonedCart } from "@/lib/types";
import { db } from "../db";
import { eq, and, desc, sql, gte, lt, inArray, gt, or } from "drizzle-orm";

export const MIN_CART_ITEM_QUANTITY = 1;
export const MAX_CART_ITEM_QUANTITY = 10;

const CONFIRMED_ORDER_STATUSES = ["confirmed", "processing", "shipped", "delivered"];

export class CartQuantityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartQuantityError";
  }
}

export class OrdersRepository {
  async getOrders(filters?: {
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<(Order & {
    user: User;
    items: (OrderItem & { product: Product })[];
    offer?: Offer;
    deliveryAddress: UserAddress;
  })[]> {
    const whereConditions = [] as any[];

    if (filters?.status) {
      whereConditions.push(eq(orders.status, filters.status));
    }

    if (filters?.startDate) {
      whereConditions.push(gte(orders.createdAt, new Date(filters.startDate)));
    }

    if (filters?.endDate) {
      const endDate = new Date(filters.endDate);
      endDate.setDate(endDate.getDate() + 1);
      whereConditions.push(lt(orders.createdAt, endDate));
    }

    const ordersData = await db.query.orders.findMany({
      where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
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
      offer: order.offer || undefined,
    }));
  }

  async getOrder(id: string): Promise<(Order & {
    user: User;
    items: (OrderItem & { product: Product })[];
    offer?: Offer;
    deliveryAddress: UserAddress;
    payments: Payment[];
  }) | undefined> {
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
        payments: true,
      },
    });

    return orderData
      ? {
          ...orderData,
          offer: orderData.offer || undefined,
          payments: orderData.payments ?? [],
        }
      : undefined;
  }

  async getOrdersByInfluencer(
    influencerId: string,
  ): Promise<(Order & {
    user: User;
    items: (OrderItem & { product: Product })[];
    offer?: Offer;
    deliveryAddress: UserAddress;
    payments: Payment[];
  })[]> {
    const influencerOffers = await db
      .select({ id: offers.id })
      .from(offers)
      .where(eq(offers.influencerId, influencerId));

    if (influencerOffers.length === 0) {
      return [];
    }

    const offerIds = influencerOffers.map(offer => offer.id);

    const ordersData = await db.query.orders.findMany({
      where: inArray(orders.offerId, offerIds),
      with: {
        user: true,
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
        deliveryAddress: true,
        payments: true,
      },
      orderBy: desc(orders.createdAt),
    });

    return ordersData.map(order => ({
      ...order,
      offer: order.offer || undefined,
      payments: order.payments ?? [],
    }));
  }

  async getOrderWithPayments(id: string): Promise<(Order & {
    user: User;
    deliveryAddress: UserAddress;
    payments: Payment[];
    items: (OrderItem & { product: Product })[];
    offer?: Offer | null;
  }) | null> {
    const orderData = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        user: true,
        deliveryAddress: true,
        items: {
          with: {
            product: true,
          },
        },
        offer: true,
        payments: {
          with: {
            refunds: true,
          },
        },
      },
    });

    if (!orderData) {
      return null;
    }

    return {
      ...orderData,
      offer: orderData.offer ?? null,
      items: orderData.items?.map((item) => ({
        ...item,
        product: item.product ?? ({} as Product),
      })) ?? [],
      payments: orderData.payments?.map((payment) => ({
        ...payment,
        refunds: payment.refunds ?? [],
      })) ?? [],
    };
  }

  async getPendingByIntent(checkoutIntentId: string): Promise<Order | undefined> {
    const existingOrder = await db.query.orders.findFirst({
      where: and(
        eq(orders.checkoutIntentId, checkoutIntentId),
        eq(orders.paymentStatus, 'pending')
      ),
    });
    return existingOrder;
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [createdOrder] = await db.insert(orders).values(order).returning();
    return createdOrder;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    return await db.insert(orderItems).values(items).returning();
  }

  async deleteOrder(orderId: string): Promise<void> {
    // Delete order items first (foreign key constraint)
    await db.delete(orderItems).where(eq(orderItems.orderId, orderId));
    // Then delete the order
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  async saveCheckoutIntent(intent: {
    checkoutIntentId: string;
    sessionId: string;
    userInfo?: any;
    paymentMethod: string;
    offerCode?: string | null;
    selectedAddressId?: string | null;
    cartItems: any[];
    subtotal: number;
    discount: number;
    shippingCharge: number;
    total: number;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    const { checkoutIntentId, subtotal, discount, shippingCharge, total, ...restIntent } = intent;
    const [savedIntent] = await db.insert(checkoutIntents).values({
      id: checkoutIntentId,
      subtotal: subtotal.toString(),
      discount: discount.toString(),
      shippingCharge: shippingCharge.toString(),
      total: total.toString(),
      ...restIntent,
    }).returning();
    return savedIntent;
  }

  async getCheckoutIntent(intentId: string, sessionId: string): Promise<any | null> {
    const intent = await db.query.checkoutIntents.findFirst({
      where: and(
        eq(checkoutIntents.id, intentId),
        eq(checkoutIntents.sessionId, sessionId), // Verify ownership by session
        eq(checkoutIntents.isConsumed, false),
        gt(checkoutIntents.expiresAt, new Date())
      ),
    });
    return intent;
  }

  async markIntentAsConsumed(intentId: string): Promise<void> {
    await db.update(checkoutIntents).set({ isConsumed: true }).where(eq(checkoutIntents.id, intentId));
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updatedOrder;
  }

  async updateCashfreeOrderDetails(
    orderId: string,
    details: {
      cashfreeOrderId?: string;
      cashfreePaymentSessionId?: string;
      cashfreeOrderStatus?: string;
      cashfreeCreated?: boolean;
      cashfreeAttempts?: number;
      cashfreeLastError?: string;
    }
  ): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({
        ...details,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updatedOrder;
  }

  async getOrdersByUser(userId: string): Promise<(Order & {
    items: (OrderItem & { product: Product })[];
    offer?: Offer;
    deliveryAddress: UserAddress;
    payments: Payment[];
  })[]> {
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
        payments: true,
      },
      orderBy: desc(orders.createdAt),
    });

    return ordersData.map(order => ({
      ...order,
      offer: order.offer || undefined,
      payments: order.payments ?? [],
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
      .where(and(eq(cartItems.sessionId, sessionId), eq(products.isActive, true)));
  }

  async addToCart(sessionId: string, productId: string, quantity: number): Promise<CartItem> {
    const product = await this.requireActiveProduct(productId);
    const existingItem = await this.findCartItem(sessionId, productId);

    const desiredQuantity = (existingItem?.quantity ?? 0) + quantity;
    const clampedQuantity = this.clampQuantity(desiredQuantity);

    if (existingItem) {
      if (existingItem.quantity === clampedQuantity) {
        return existingItem;
      }

      const [updatedItem] = await db
        .update(cartItems)
        .set({
          quantity: clampedQuantity,
          updatedAt: new Date(),
        })
        .where(eq(cartItems.id, existingItem.id))
        .returning();
      return updatedItem;
    }

    const [newItem] = await db
      .insert(cartItems)
      .values({ sessionId, productId, quantity: clampedQuantity })
      .returning();
    return newItem;
  }

  async updateCartItem(sessionId: string, productId: string, quantity: number): Promise<CartItem> {
    const product = await this.requireActiveProduct(productId);
    const existingItem = await this.findCartItem(sessionId, productId);

    if (!existingItem) {
      throw new CartQuantityError("Cart item not found");
    }

    const clampedQuantity = this.clampQuantity(quantity);

    if (existingItem.quantity === clampedQuantity) {
      return existingItem;
    }

    const [updatedItem] = await db
      .update(cartItems)
      .set({ quantity: clampedQuantity, updatedAt: new Date() })
      .where(eq(cartItems.id, existingItem.id))
      .returning();
    return updatedItem;
  }

  async removeFromCart(sessionId: string, productId: string): Promise<void> {
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.productId, productId)));
  }

  async clearCart(sessionId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.sessionId, sessionId));
  }

  async getAbandonedCarts(): Promise<AbandonedCart[]> {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);

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
    await db
      .update(cartItems)
      .set({ updatedAt: new Date() })
      .where(eq(cartItems.sessionId, sessionId));
  }

  async markCartAsAbandoned(sessionId: string): Promise<void> {
    console.log(`Cart ${sessionId} marked as abandoned for potential recovery`);
  }

  async getPopularProducts(): Promise<Array<{ product: Product; orderCount: number; totalRevenue: number }>> {
    return await db
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
  }

  async getSalesTrends(days: number): Promise<Array<{ date: string; orders: number; revenue: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await db
      .select({
        date: sql<string>`date(${orders.createdAt})`,
        orders: sql<number>`count(${orders.id})`,
        revenue: sql<number>`sum(cast(${orders.total} as decimal))`,
      })
      .from(orders)
      .where(gte(orders.createdAt, startDate))
      .groupBy(sql`date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`);
  }

  async getConversionMetrics(): Promise<{
    registeredUsers: number;
    monthlyActiveUsers: number;
    ordersCompleted: number;
    conversionRate: number;
    averageOrderValue: number;
  }> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const lastMonthOrdersWhere = and(
      gte(orders.createdAt, lastMonthStart),
      lt(orders.createdAt, currentMonthStart),
      or(inArray(orders.status, CONFIRMED_ORDER_STATUSES), eq(orders.paymentStatus, "paid")),
    );

    const [{ registeredUsers } = { registeredUsers: 0 }] = await db
      .select({
        registeredUsers: sql<number>`count(${users.id})`,
      })
      .from(users);

    const [{ monthlyActiveUsers } = { monthlyActiveUsers: 0 }] = await db
      .select({
        monthlyActiveUsers: sql<number>`count(distinct ${orders.userId})`,
      })
      .from(orders)
      .where(lastMonthOrdersWhere);

    const [{ ordersCompleted, totalRevenue } = { ordersCompleted: 0, totalRevenue: 0 }] = await db
      .select({
        ordersCompleted: sql<number>`count(${orders.id})`,
        totalRevenue: sql<number>`coalesce(sum(cast(${orders.total} as decimal)), 0)`,
      })
      .from(orders)
      .where(lastMonthOrdersWhere);

    const [{ totalSessions } = { totalSessions: 0 }] = await db
      .select({
        totalSessions: sql<number>`count(distinct ${cartItems.sessionId})`,
      })
      .from(cartItems)
      .where(
        and(
          gte(cartItems.updatedAt, lastMonthStart),
          lt(cartItems.updatedAt, currentMonthStart),
        ),
      );

    const averageOrderValue = ordersCompleted > 0 ? totalRevenue / ordersCompleted : 0;
    const conversionRate = totalSessions > 0 ? (ordersCompleted / totalSessions) * 100 : 0;

    return {
      registeredUsers,
      monthlyActiveUsers,
      ordersCompleted,
      conversionRate,
      averageOrderValue,
    };
  }

  private async requireActiveProduct(productId: string): Promise<Product> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.isActive, true)));

    if (!product) {
      throw new CartQuantityError("Product not available");
    }

    return product;
  }

  private async findCartItem(sessionId: string, productId: string): Promise<CartItem | undefined> {
    const [cartItem] = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.sessionId, sessionId), eq(cartItems.productId, productId)));

    return cartItem;
  }

  private clampQuantity(requestedQuantity: number): number {
    // Clamp between MIN (1) and MAX (10) quantity
    const clamped = Math.min(Math.max(requestedQuantity, MIN_CART_ITEM_QUANTITY), MAX_CART_ITEM_QUANTITY);

    if (clamped < MIN_CART_ITEM_QUANTITY) {
      throw new CartQuantityError("Quantity must be at least 1");
    }

    return clamped;
  }
}
