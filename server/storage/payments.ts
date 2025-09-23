import { db } from "../db";
import { paymentProviders, paymentProviderSettings, paymentTransactions, paymentRefunds } from "@shared/schema";
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
}