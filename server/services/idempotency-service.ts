/**
 * TASK 5: IdempotencyService - Implements idempotency enforcement for payment operations
 * 
 * This service prevents duplicate operations by storing request hashes and responses,
 * ensuring that retries don't cause duplicate charges or refunds.
 */

import crypto from "crypto";
import { db } from "../db";
import { idempotencyKeys } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import type { IdempotencyService } from "../../shared/payment-types";

/**
 * Idempotency service implementation
 */
export class IdempotencyServiceImpl implements IdempotencyService {
  private static instance: IdempotencyServiceImpl;
  
  private constructor() {}
  
  public static getInstance(): IdempotencyServiceImpl {
    if (!IdempotencyServiceImpl.instance) {
      IdempotencyServiceImpl.instance = new IdempotencyServiceImpl();
    }
    return IdempotencyServiceImpl.instance;
  }
  
  /**
   * Generate idempotency key
   */
  public generateKey(scope: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${scope}_${timestamp}_${random}`;
  }
  
  /**
   * Check if key exists and return cached response
   */
  public async checkKey(key: string, scope: string): Promise<{ exists: boolean; response?: any }> {
    try {
      const existing = await db
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, key),
            eq(idempotencyKeys.scope, scope)
          )
        )
        .limit(1);
      
      if (existing.length > 0) {
        return {
          exists: true,
          response: existing[0].response,
        };
      }
      
      return { exists: false };
      
    } catch (error) {
      console.error('Error checking idempotency key:', error);
      return { exists: false };
    }
  }
  
  /**
   * Store response for idempotency key
   */
  public async storeResponse(key: string, scope: string, response: any): Promise<void> {
    try {
      // Create request hash for duplicate detection
      const requestHash = crypto.createHash('sha256')
        .update(JSON.stringify({ key, scope, response }))
        .digest('hex');
      
      await db.insert(idempotencyKeys).values({
        key,
        scope,
        requestHash,
        response,
        createdAt: new Date(),
      });
      
    } catch (error) {
      // If key already exists (race condition), ignore the error
      if (error instanceof Error && error.message.includes('duplicate key')) {
        console.log(`Idempotency key ${key} already exists, ignoring duplicate`);
        return;
      }
      
      console.error('Error storing idempotency key:', error);
      throw error;
    }
  }
  
  /**
   * Execute operation with idempotency protection
   */
  public async executeWithIdempotency<T>(
    key: string,
    scope: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if operation already completed
    const existing = await this.checkKey(key, scope);
    if (existing.exists) {
      console.log(`Returning cached response for idempotency key: ${key}`);
      return existing.response as T;
    }
    
    // Execute operation
    const result = await operation();
    
    // Store result for future requests
    await this.storeResponse(key, scope, result);
    
    return result;
  }
  
  /**
   * Clean up expired keys
   */
  public async cleanupExpired(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
      
      const result = await db
        .delete(idempotencyKeys)
        .where(
          // Delete keys older than cutoff date
          sql`created_at < ${cutoffDate}`
        );
      
      return result.rowCount || 0;
      
    } catch (error) {
      console.error('Error cleaning up expired idempotency keys:', error);
      return 0;
    }
  }
  
  /**
   * Get statistics about idempotency usage
   */
  public async getStats(): Promise<{
    totalKeys: number;
    keysByScope: Record<string, number>;
    oldestKey?: Date;
    newestKey?: Date;
  }> {
    try {
      const allKeys = await db.select().from(idempotencyKeys);
      
      const keysByScope: Record<string, number> = {};
      let oldestKey: Date | undefined;
      let newestKey: Date | undefined;
      
      for (const key of allKeys) {
        // Count by scope
        keysByScope[key.scope] = (keysByScope[key.scope] || 0) + 1;
        
        // Track date range
        if (!oldestKey || key.createdAt < oldestKey) {
          oldestKey = key.createdAt;
        }
        if (!newestKey || key.createdAt > newestKey) {
          newestKey = key.createdAt;
        }
      }
      
      return {
        totalKeys: allKeys.length,
        keysByScope,
        oldestKey,
        newestKey,
      };
      
    } catch (error) {
      console.error('Error getting idempotency stats:', error);
      return {
        totalKeys: 0,
        keysByScope: {},
      };
    }
  }
}

// Import sql helper
import { sql } from "drizzle-orm";

/**
 * Default export for convenience
 */
export const idempotencyService = IdempotencyServiceImpl.getInstance();