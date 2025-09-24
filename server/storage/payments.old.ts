import { db } from "../db";
import { paymentProviders, paymentProviderSettings, paymentTransactions, paymentRefunds, orders } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { 
  PaymentProvider, 
  PaymentProviderSettings, 
  PaymentTransaction, 
  PaymentRefund,
  InsertPaymentProvider,
  InsertPaymentProviderSettings,
  InsertPaymentTransaction,
  InsertPaymentRefund
} from "@shared/schema";

export class PaymentsRepository {
  // Payment Providers
  async getPaymentProviders(): Promise<PaymentProvider[]> {
    return await db.select().from(paymentProviders).orderBy(paymentProviders.priority);
  }

  async getPaymentProviderById(id: string): Promise<PaymentProvider | null> {
    const result = await db.select().from(paymentProviders).where(eq(paymentProviders.id, id));
    return result[0] || null;
  }

  async getPaymentProviderByName(name: string): Promise<PaymentProvider | null> {
    const result = await db.select().from(paymentProviders).where(eq(paymentProviders.name, name));
    return result[0] || null;
  }

  async updatePaymentProvider(id: string, updateData: Partial<InsertPaymentProvider>): Promise<PaymentProvider> {
    const result = await db
      .update(paymentProviders)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(paymentProviders.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('Payment provider not found');
    }
    
    return result[0];
  }

  // Payment Provider Settings
  async getPaymentProviderSettings(providerId: string): Promise<PaymentProviderSettings[]> {
    return await db
      .select()
      .from(paymentProviderSettings)
      .where(eq(paymentProviderSettings.providerId, providerId))
      .orderBy(desc(paymentProviderSettings.createdAt));
  }

  async getActivePaymentProviderSettings(providerId: string): Promise<PaymentProviderSettings | null> {
    const result = await db
      .select()
      .from(paymentProviderSettings)
      .where(
        and(
          eq(paymentProviderSettings.providerId, providerId),
          eq(paymentProviderSettings.isActive, true)
        )
      )
      .limit(1);
    
    return result[0] || null;
  }

  async createOrUpdatePaymentProviderSettings(
    providerId: string, 
    settingsData: Omit<InsertPaymentProviderSettings, 'providerId'>
  ): Promise<PaymentProviderSettings> {
    // If this is being set as active, deactivate all other settings for this provider
    if (settingsData.isActive) {
      await db
        .update(paymentProviderSettings)
        .set({ isActive: false })
        .where(eq(paymentProviderSettings.providerId, providerId));
    }

    // Check if settings already exist for this provider and mode
    const existingSettings = await db
      .select()
      .from(paymentProviderSettings)
      .where(
        and(
          eq(paymentProviderSettings.providerId, providerId),
          eq(paymentProviderSettings.mode, settingsData.mode)
        )
      )
      .limit(1);

    if (existingSettings[0]) {
      // Update existing settings
      const result = await db
        .update(paymentProviderSettings)
        .set({
          ...settingsData,
          updatedAt: new Date()
        })
        .where(eq(paymentProviderSettings.id, existingSettings[0].id))
        .returning();
      
      return result[0];
    } else {
      // Create new settings
      const result = await db
        .insert(paymentProviderSettings)
        .values({
          ...settingsData,
          providerId,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return result[0];
    }
  }

  // Payment Transactions
  async createPaymentTransaction(transactionData: Omit<InsertPaymentTransaction, 'id'>): Promise<PaymentTransaction> {
    const result = await db
      .insert(paymentTransactions)
      .values({
        ...transactionData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    return result[0];
  }

  async getPaymentTransactionById(id: string): Promise<PaymentTransaction | null> {
    const result = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, id));
    
    return result[0] || null;
  }

  async getPaymentTransactionByMerchantId(merchantTransactionId: string): Promise<PaymentTransaction | null> {
    const result = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.merchantTransactionId, merchantTransactionId));
    
    return result[0] || null;
  }

  async getPaymentTransactionsByOrderId(orderId: string): Promise<PaymentTransaction[]> {
    return await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, orderId))
      .orderBy(desc(paymentTransactions.createdAt));
  }

  async updatePaymentTransaction(
    id: string, 
    updateData: Partial<Omit<InsertPaymentTransaction, 'id'>>
  ): Promise<PaymentTransaction> {
    const result = await db
      .update(paymentTransactions)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(paymentTransactions.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('Payment transaction not found');
    }
    
    return result[0];
  }

  async getPaymentTransactions(options: {
    page?: number;
    limit?: number;
    status?: string;
    orderId?: string;
  } = {}): Promise<{
    transactions: PaymentTransaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, status, orderId } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions = [];
    if (status) {
      whereConditions.push(eq(paymentTransactions.status, status));
    }
    if (orderId) {
      whereConditions.push(eq(paymentTransactions.orderId, orderId));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get transactions
    const transactions = await db
      .select()
      .from(paymentTransactions)
      .where(whereClause)
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(paymentTransactions)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    return {
      transactions,
      total,
      page,
      limit
    };
  }

  // Payment Refunds
  async createPaymentRefund(refundData: Omit<InsertPaymentRefund, 'id'>): Promise<PaymentRefund> {
    const result = await db
      .insert(paymentRefunds)
      .values({
        ...refundData,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();
    
    return result[0];
  }

  async getPaymentRefundById(id: string): Promise<PaymentRefund | null> {
    const result = await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.id, id));
    
    return result[0] || null;
  }

  async getPaymentRefundsByTransactionId(transactionId: string): Promise<PaymentRefund[]> {
    return await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.transactionId, transactionId))
      .orderBy(desc(paymentRefunds.createdAt));
  }

  async updatePaymentRefund(
    id: string, 
    updateData: Partial<Omit<InsertPaymentRefund, 'id'>>
  ): Promise<PaymentRefund> {
    const result = await db
      .update(paymentRefunds)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(paymentRefunds.id, id))
      .returning();
    
    if (!result[0]) {
      throw new Error('Payment refund not found');
    }
    
    return result[0];
  }

  // Analytics and reporting
  async getPaymentStats(options: {
    startDate?: Date;
    endDate?: Date;
    providerId?: string;
  } = {}): Promise<{
    totalTransactions: number;
    totalAmount: number;
    successfulTransactions: number;
    successfulAmount: number;
    failedTransactions: number;
    pendingTransactions: number;
  }> {
    const { startDate, endDate, providerId } = options;
    
    const whereConditions = [];
    if (startDate) {
      whereConditions.push(sql`${paymentTransactions.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      whereConditions.push(sql`${paymentTransactions.createdAt} <= ${endDate}`);
    }
    if (providerId) {
      whereConditions.push(eq(paymentTransactions.providerId, providerId));
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const stats = await db
      .select({
        totalTransactions: sql<number>`COUNT(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${paymentTransactions.amount}), 0)`,
        successfulTransactions: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'completed')`,
        successfulAmount: sql<number>`COALESCE(SUM(${paymentTransactions.amount}) FILTER (WHERE ${paymentTransactions.status} = 'completed'), 0)`,
        failedTransactions: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'failed')`,
        pendingTransactions: sql<number>`COUNT(*) FILTER (WHERE ${paymentTransactions.status} = 'pending')`,
      })
      .from(paymentTransactions)
      .where(whereClause);

    return stats[0] || {
      totalTransactions: 0,
      totalAmount: 0,
      successfulTransactions: 0,
      successfulAmount: 0,
      failedTransactions: 0,
      pendingTransactions: 0,
    };
  }

  // Order Payment Status Management
  
  /**
   * Update order payment status based on payment transaction status
   */
  async updateOrderPaymentStatus(orderId: string, paymentStatus: string): Promise<void> {
    await db
      .update(orders)
      .set({
        paymentStatus,
        updatedAt: new Date()
      })
      .where(eq(orders.id, orderId));
  }

  /**
   * Synchronize order status with payment transaction status
   * This is called when a payment transaction is updated
   */
  async syncOrderWithPaymentStatus(
    orderId: string, 
    transactionStatus: 'initiated' | 'pending' | 'completed' | 'failed' | 'cancelled'
  ): Promise<void> {
    let orderPaymentStatus: string;
    let orderStatus: string | undefined;

    // Map payment transaction status to order payment status
    switch (transactionStatus) {
      case 'initiated':
      case 'pending':
        orderPaymentStatus = 'pending';
        // Don't change order status for pending payments
        break;
      case 'completed':
        orderPaymentStatus = 'paid';
        orderStatus = 'confirmed'; // Order is confirmed when payment is successful
        break;
      case 'failed':
      case 'cancelled':
        orderPaymentStatus = 'failed';
        // Keep order status as 'pending' for failed payments to allow retry
        // Only explicitly cancel orders via admin action or expiration
        break;
      default:
        orderPaymentStatus = 'pending';
    }

    // Update order payment status and potentially order status
    const updateData: any = {
      paymentStatus: orderPaymentStatus,
      updatedAt: new Date()
    };

    if (orderStatus) {
      updateData.status = orderStatus;
    }

    await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, orderId));
  }

  /**
   * Update payment transaction status and sync with order
   */
  async updatePaymentTransactionAndSyncOrder(
    transactionId: string,
    status: 'initiated' | 'pending' | 'completed' | 'failed' | 'cancelled',
    additionalData: Partial<Omit<InsertPaymentTransaction, 'id' | 'status'>> = {}
  ): Promise<PaymentTransaction> {
    // Update the transaction
    const updatedTransaction = await this.updatePaymentTransaction(transactionId, {
      status,
      ...additionalData
    });

    // Sync the order with the new payment status
    await this.syncOrderWithPaymentStatus(updatedTransaction.orderId, status);

    return updatedTransaction;
  }

  /**
   * Get order with payment information
   */
  async getOrderWithPaymentInfo(orderId: string): Promise<{
    order: any;
    transactions: PaymentTransaction[];
    latestTransaction?: PaymentTransaction;
    totalPaid: number;
    totalRefunded: number;
  } | null> {
    // Get order
    const orderResult = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderResult[0]) {
      return null;
    }

    const order = orderResult[0];

    // Get all payment transactions for this order
    const transactions = await this.getPaymentTransactionsByOrderId(orderId);
    const latestTransaction = transactions[0]; // Already ordered by createdAt desc

    // Calculate total paid amount from successful transactions
    const successfulTransactions = transactions.filter(t => t.status === 'completed');
    const totalPaid = successfulTransactions.reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

    // Get refunds and calculate total refunded
    const refunds = await Promise.all(
      successfulTransactions.map(t => this.getPaymentRefundsByTransactionId(t.id))
    );
    const allRefunds = refunds.flat();
    const totalRefunded = allRefunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + parseFloat(r.amount.toString()), 0);

    return {
      order,
      transactions,
      latestTransaction,
      totalPaid,
      totalRefunded
    };
  }

  /**
   * Get orders with payment status for admin dashboard
   */
  async getOrdersWithPaymentStatus(options: {
    page?: number;
    limit?: number;
    paymentStatus?: string;
    orderStatus?: string;
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    orders: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const { page = 1, limit = 20, paymentStatus, orderStatus, startDate, endDate } = options;
    const offset = (page - 1) * limit;

    // Build where conditions
    const whereConditions = [];
    if (paymentStatus) {
      whereConditions.push(eq(orders.paymentStatus, paymentStatus));
    }
    if (orderStatus) {
      whereConditions.push(eq(orders.status, orderStatus));
    }
    if (startDate) {
      whereConditions.push(sql`${orders.createdAt} >= ${startDate}`);
    }
    if (endDate) {
      whereConditions.push(sql`${orders.createdAt} <= ${endDate}`);
    }

    const whereClause = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Get orders with payment information
    const ordersResult = await db
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
        paymentMethod: orders.paymentMethod,
        total: orders.total,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        shippingCharge: orders.shippingCharge,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt
      })
      .from(orders)
      .where(whereClause)
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(whereClause);

    const total = totalResult[0]?.count || 0;

    return {
      orders: ordersResult,
      total,
      page,
      limit
    };
  }

  /**
   * Mark payment transaction as completed and update order
   */
  async completePaymentTransaction(
    merchantTransactionId: string,
    providerData?: Record<string, any>
  ): Promise<PaymentTransaction> {
    const transaction = await this.getPaymentTransactionByMerchantId(merchantTransactionId);
    if (!transaction) {
      throw new Error('Payment transaction not found');
    }

    return await this.updatePaymentTransactionAndSyncOrder(
      transaction.id,
      'completed',
      {
        providerResponseData: providerData,
        completedAt: new Date()
      }
    );
  }

  /**
   * Mark payment transaction as failed and update order
   */
  async failPaymentTransaction(
    merchantTransactionId: string,
    reason?: string,
    providerData?: Record<string, any>
  ): Promise<PaymentTransaction> {
    const transaction = await this.getPaymentTransactionByMerchantId(merchantTransactionId);
    if (!transaction) {
      throw new Error('Payment transaction not found');
    }

    return await this.updatePaymentTransactionAndSyncOrder(
      transaction.id,
      'failed',
      {
        failureReason: reason,
        providerResponseData: providerData,
        failedAt: new Date()
      }
    );
  }
}