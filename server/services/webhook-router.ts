/**
 * TASK 5: WebhookRouter - Routes and processes webhooks from payment providers
 * 
 * This service handles incoming webhooks, verifies signatures, deduplicates events,
 * and updates payment/refund statuses accordingly.
 */

import type { Request, Response } from "express";
import type { 
  PaymentProvider, 
  Environment 
} from "../../shared/payment-providers";

import type {
  WebhookVerifyParams,
  WebhookVerifyResult,
  WebhookProcessResult,
  PaymentEvent
} from "../../shared/payment-types";

import { adapterFactory } from "./adapter-factory";
import { WebhookError } from "../../shared/payment-types";
import { db } from "../db";
import { webhookInbox, payments, refunds, paymentEvents } from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

/**
 * Webhook processing service
 */
export class WebhookRouter {
  private static instance: WebhookRouter;
  
  private constructor(
    private environment: Environment
  ) {}
  
  public static getInstance(environment: Environment): WebhookRouter {
    if (!WebhookRouter.instance) {
      WebhookRouter.instance = new WebhookRouter(environment);
    }
    return WebhookRouter.instance;
  }
  
  /**
   * Process webhook from a payment provider
   */
  public async processWebhook(
    provider: PaymentProvider,
    req: Request,
    res: Response
  ): Promise<WebhookProcessResult> {
    try {
      // Extract headers and body
      const headers = this.extractHeaders(req);
      const body = this.extractBody(req);
      
      // Create dedupe key from content
      const dedupeKey = this.createDedupeKey(provider, body);
      
      // Check if webhook already processed
      const existingWebhook = await this.getExistingWebhook(provider, dedupeKey);
      if (existingWebhook) {
        console.log(`Webhook already processed: ${provider}:${dedupeKey}`);
        res.status(200).json({ status: 'already_processed' });
        return { processed: true };
      }
      
      // Get adapter for verification
      const adapter = await adapterFactory.createAdapter(provider, this.environment);
      
      // Verify webhook signature
      const verifyParams: WebhookVerifyParams = {
        provider,
        environment: this.environment,
        headers,
        body,
        signature: headers['x-signature'] || headers['signature'],
      };
      
      const verifyResult = await adapter.verifyWebhook(verifyParams);
      
      // Store webhook in inbox
      await this.storeWebhook(provider, dedupeKey, verifyResult.verified, {
        headers,
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      
      if (!verifyResult.verified) {
        console.error(`Webhook signature verification failed: ${provider}`);
        res.status(400).json({ status: 'verification_failed' });
        return { processed: false, error: 'Signature verification failed' };
      }
      
      // Process verified webhook
      const processResult = await this.processVerifiedWebhook(verifyResult, adapter.provider);
      
      // Mark webhook as processed
      await this.markWebhookProcessed(provider, dedupeKey);
      
      // Send appropriate response
      res.status(200).json({ status: 'processed', ...processResult });
      
      return {
        processed: true,
        eventId: processResult.eventId,
        paymentUpdated: processResult.paymentUpdated,
        refundUpdated: processResult.refundUpdated,
      };
      
    } catch (error) {
      console.error(`Webhook processing failed for ${provider}:`, error);
      
      // Store failed webhook for debugging
      try {
        const body = this.extractBody(req);
        const dedupeKey = this.createDedupeKey(provider, body);
        await this.storeWebhook(provider, dedupeKey, false, {
          headers: this.extractHeaders(req),
          body: typeof body === 'string' ? body : JSON.stringify(body),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      } catch (storeError) {
        console.error('Failed to store failed webhook:', storeError);
      }
      
      res.status(500).json({ status: 'error', message: 'Webhook processing failed' });
      
      return {
        processed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
  
  /**
   * Process verified webhook event
   */
  private async processVerifiedWebhook(
    verifyResult: WebhookVerifyResult,
    provider: PaymentProvider
  ): Promise<{
    eventId: string;
    paymentUpdated: boolean;
    refundUpdated: boolean;
  }> {
    const event = verifyResult.event;
    if (!event) {
      throw new WebhookError('No event data in verified webhook', 'MISSING_EVENT_DATA', provider);
    }
    
    const eventId = crypto.randomUUID();
    let paymentUpdated = false;
    let refundUpdated = false;
    
    // Log the webhook event
    await this.logWebhookEvent({
      id: eventId,
      paymentId: event.paymentId,
      refundId: event.refundId,
      provider,
      environment: this.environment,
      type: event.type,
      status: event.status,
      data: event.data,
      timestamp: new Date(),
      source: 'webhook',
    });
    
    // Update payment status if applicable
    if (event.paymentId && event.status && this.isPaymentStatus(event.status)) {
      paymentUpdated = await this.updatePaymentStatus(
        event.paymentId,
        event.status,
        event.data
      );
    }
    
    // Update refund status if applicable
    if (event.refundId && event.status && this.isRefundStatus(event.status)) {
      refundUpdated = await this.updateRefundStatus(
        event.refundId,
        event.status,
        event.data
      );
    }
    
    return { eventId, paymentUpdated, refundUpdated };
  }
  
  /**
   * Update payment status from webhook
   */
  private async updatePaymentStatus(
    paymentId: string,
    status: any,
    data: Record<string, any>
  ): Promise<boolean> {
    try {
      const result = await db
        .update(payments)
        .set({
          status: status,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, paymentId));
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Failed to update payment ${paymentId} status:`, error);
      return false;
    }
  }
  
  /**
   * Update refund status from webhook
   */
  private async updateRefundStatus(
    refundId: string,
    status: any,
    data: Record<string, any>
  ): Promise<boolean> {
    try {
      const result = await db
        .update(refunds)
        .set({
          status: status,
          updatedAt: new Date(),
        })
        .where(eq(refunds.id, refundId));
      
      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Failed to update refund ${refundId} status:`, error);
      return false;
    }
  }
  
  /**
   * Check if status is a payment status
   */
  private isPaymentStatus(status: any): boolean {
    const paymentStatuses = [
      'created', 'initiated', 'processing', 'authorized', 
      'captured', 'failed', 'cancelled', 'refunded', 'partially_refunded'
    ];
    return paymentStatuses.includes(status);
  }
  
  /**
   * Check if status is a refund status
   */
  private isRefundStatus(status: any): boolean {
    const refundStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    return refundStatuses.includes(status);
  }
  
  /**
   * Extract headers from request
   */
  private extractHeaders(req: Request): Record<string, string> {
    const headers: Record<string, string> = {};
    
    // Copy relevant headers
    Object.entries(req.headers).forEach(([key, value]) => {
      if (typeof value === 'string') {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(', ');
      }
    });
    
    return headers;
  }
  
  /**
   * Extract body from request
   */
  private extractBody(req: Request): string | Buffer {
    if (req.body instanceof Buffer) {
      return req.body;
    } else if (typeof req.body === 'string') {
      return req.body;
    } else {
      return JSON.stringify(req.body);
    }
  }
  
  /**
   * Create dedupe key from webhook content
   */
  private createDedupeKey(provider: PaymentProvider, body: string | Buffer): string {
    const content = typeof body === 'string' ? body : body.toString();
    return crypto.createHash('sha256').update(`${provider}:${content}`).digest('hex');
  }
  
  /**
   * Get existing webhook from inbox
   */
  private async getExistingWebhook(provider: PaymentProvider, dedupeKey: string) {
    const result = await db
      .select()
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.provider, provider),
          eq(webhookInbox.dedupeKey, dedupeKey)
        )
      )
      .limit(1);
    
    return result[0] || null;
  }
  
  /**
   * Store webhook in inbox
   */
  private async storeWebhook(
    provider: PaymentProvider,
    dedupeKey: string,
    verified: boolean,
    payload: Record<string, any>
  ): Promise<void> {
    await db.insert(webhookInbox).values({
      id: crypto.randomUUID(),
      provider,
      dedupeKey,
      signatureVerified: verified,
      payload,
      receivedAt: new Date(),
    });
  }
  
  /**
   * Mark webhook as processed
   */
  private async markWebhookProcessed(provider: PaymentProvider, dedupeKey: string): Promise<void> {
    await db
      .update(webhookInbox)
      .set({
        processedAt: new Date(),
      })
      .where(
        and(
          eq(webhookInbox.provider, provider),
          eq(webhookInbox.dedupeKey, dedupeKey)
        )
      );
  }
  
  /**
   * Log webhook event
   */
  private async logWebhookEvent(event: PaymentEvent): Promise<void> {
    await db.insert(paymentEvents).values({
      id: event.id,
      paymentId: event.paymentId,
      provider: event.provider,
      type: event.type,
      data: event.data,
      occurredAt: event.timestamp,
    });
  }
  
  /**
   * Get webhook statistics
   */
  public async getWebhookStats(timeframe: 'day' | 'week' | 'month' = 'day'): Promise<{
    total: number;
    verified: number;
    processed: number;
    failed: number;
    byProvider: Record<PaymentProvider, number>;
  }> {
    // This would involve complex queries - simplified for now
    const totalCount = await db.select().from(webhookInbox);
    
    return {
      total: totalCount.length,
      verified: totalCount.filter(w => w.signatureVerified).length,
      processed: totalCount.filter(w => w.processedAt).length,
      failed: totalCount.filter(w => !w.signatureVerified).length,
      byProvider: {} as Record<PaymentProvider, number>, // Simplified
    };
  }
  
  /**
   * Clean up old webhook records
   */
  public async cleanupOldWebhooks(olderThanDays: number = 30): Promise<number> {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const result = await db
      .delete(webhookInbox)
      .where(
        // Delete old processed webhooks older than cutoff
        sql`processed_at < ${cutoffDate}`
      );
    
    return result.rowCount || 0;
  }
}

/**
 * Create webhook router with environment
 */
export const createWebhookRouter = (environment: Environment) => {
  return WebhookRouter.getInstance(environment);
};