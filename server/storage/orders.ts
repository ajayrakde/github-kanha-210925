import {
  orders,
  orderItems,
  cartItems,
  products,
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
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";

export const MIN_CART_ITEM_QUANTITY = 1;
export const MAX_CART_ITEM_QUANTITY = 10;

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

  async getOrderWithPayments(id: string): Promise<(Order & {
    user: User;
    deliveryAddress: UserAddress;
    payments: Payment[];
  }) | null> {
    const orderData = await db.query.orders.findFirst({
      where: eq(orders.id, id),
      with: {
        user: true,
        deliveryAddress: true,
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
      payments: orderData.payments?.map((payment) => ({
        ...payment,
        refunds: payment.refunds ?? [],
      })) ?? [],
    };
  }

  async createOrder(order: InsertOrder): Promise<Order> {
    const [createdOrder] = await db.insert(orders).values(order).returning();
    return createdOrder;
  }

  async createOrderItems(items: InsertOrderItem[]): Promise<OrderItem[]> {
    return await db.insert(orderItems).values(items).returning();
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [updatedOrder] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
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
    const clampedQuantity = this.clampQuantity(desiredQuantity, product.stock);

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

    const clampedQuantity = this.clampQuantity(quantity, product.stock);

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
    totalSessions: number;
    ordersCompleted: number;
    conversionRate: number;
  }> {
    const [{ totalSessions } = { totalSessions: 0 }] = await db
      .select({
        totalSessions: sql<number>`count(distinct ${cartItems.sessionId})`,
      })
      .from(cartItems);

    const [{ ordersCompleted } = { ordersCompleted: 0 }] = await db
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

  private clampQuantity(requestedQuantity: number, productStock: number): number {
    const maxAvailable = Math.min(productStock, MAX_CART_ITEM_QUANTITY);

    if (maxAvailable < MIN_CART_ITEM_QUANTITY) {
      throw new CartQuantityError("Product is out of stock");
    }

    const clamped = Math.min(Math.max(requestedQuantity, MIN_CART_ITEM_QUANTITY), maxAvailable);

    if (clamped < MIN_CART_ITEM_QUANTITY) {
      throw new CartQuantityError("Quantity must be at least 1");
    }

    return clamped;
  }
}
