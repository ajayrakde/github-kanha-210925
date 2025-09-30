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
  PaymentEvent,
  PaymentLifecycleStatus,
} from "../../shared/payment-types";

import { adapterFactory } from "./adapter-factory";
import { configResolver } from "./config-resolver";
import {
  WebhookError,
  normalizePaymentLifecycleStatus,
  canTransitionPaymentLifecycle,
} from "../../shared/payment-types";
import { db } from "../db";
import { webhookInbox, payments, refunds, paymentEvents, orders } from "../../shared/schema";
import { eq, and, sql, or } from "drizzle-orm";
import crypto from "crypto";
import {
  maskPhonePeVirtualPaymentAddress,
  maskPhonePeUtr,
  normalizeUpiInstrumentVariant,
} from "../../shared/upi";

type FailureAuditRecord = {
  provider: PaymentProvider;
  paymentId: string;
  orderId: string | null;
  status: string;
  failureCode?: string;
  failureMessage?: string;
  failedAt: Date;
};

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
    providerParam: PaymentProvider,
    req: Request,
    res: Response
  ): Promise<WebhookProcessResult> {
    const tenantId = (req.headers['x-tenant-id'] as string) || 'default';

    // Extract headers and body once for all attempts
    const headers = this.extractHeaders(req);
    const body = this.extractBody(req);
    const identifiers = this.extractIdentifiers(body);

    try {
      const candidates = await this.resolveCandidateProviders(providerParam, tenantId);

      if (candidates.length === 0) {
        res.status(404).json({ status: 'provider_not_available' });
        return { processed: false, error: 'No enabled provider matched webhook' };
      }

      const failureReasons: string[] = [];
      let signatureRejected = false;
      let authorizationRejected = false;
      let authorizationError: string | undefined;

      for (const provider of candidates) {
        const dedupeKey = this.createDedupeKey(provider, tenantId, body, identifiers);

        // Check for duplicate webhooks for this tenant and provider
        const existingWebhook = await this.getExistingWebhook(provider, dedupeKey, tenantId);
        if (existingWebhook) {
          console.log(`Webhook already processed: ${tenantId}:${provider}:${dedupeKey}`);
          await this.logAuditEvent(provider, tenantId, 'webhook.replayed', {
            dedupeKey,
            ...identifiers,
          });
          res.status(200).json({ status: 'already_processed' });
          return { processed: true };
        }

        try {
          const adapter = await adapterFactory.createAdapter(provider, this.environment, tenantId);

          const verifyParams: WebhookVerifyParams = {
            provider,
            environment: this.environment,
            headers,
            body,
            signature: headers['x-signature'] || headers['signature'],
          };

          const verifyResult = await adapter.verifyWebhook(verifyParams);

          await this.storeWebhook(provider, dedupeKey, verifyResult.verified, tenantId, {
            headers,
            body: typeof body === 'string' ? body : JSON.stringify(body),
            identifiers,
          });

          if (!verifyResult.verified) {
            if (this.isAuthorizationError(verifyResult.error?.code)) {
              authorizationRejected = true;
              authorizationError = verifyResult.error?.message ?? 'Invalid webhook authorization';
              await this.logSecurityEvent(provider, tenantId, 'webhook.auth_failed', {
                dedupeKey,
                reason: verifyResult.error?.code,
                ...identifiers,
              });
              break;
            }

            signatureRejected = true;
            await this.logAuditEvent(provider, tenantId, 'webhook.signature_failed', {
              dedupeKey,
              ...identifiers,
            });
            failureReasons.push(`${provider}: signature verification failed`);
            continue;
          }

          const processResult = await this.processVerifiedWebhook(verifyResult, adapter.provider, tenantId);

          await this.markWebhookProcessed(provider, dedupeKey, tenantId);

          res.status(200).json({ status: 'processed', ...processResult });

          return {
            processed: true,
            eventId: processResult.eventId,
            paymentUpdated: processResult.paymentUpdated,
            refundUpdated: processResult.refundUpdated,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          failureReasons.push(`${provider}: ${message}`);

          try {
            await this.storeWebhook(provider, dedupeKey, false, tenantId, {
              headers,
              body: typeof body === 'string' ? body : JSON.stringify(body),
              error: message,
              identifiers,
            });
          } catch (storeError) {
            console.error('Failed to store failed webhook:', storeError);
          }
        }
      }

      if (authorizationRejected) {
        res.status(403).json({
          status: 'authorization_invalid',
          message: authorizationError ?? 'Invalid webhook authorization',
        });
        return { processed: false, error: authorizationError ?? 'Invalid webhook authorization' };
      }

      if (signatureRejected) {
        res.status(401).json({
          status: 'signature_invalid',
          message: failureReasons.join('; ') || 'Signature verification failed',
        });
      } else {
        res.status(400).json({ status: 'unprocessed', message: 'Webhook did not match any enabled provider' });
      }
      return { processed: false, error: failureReasons.join('; ') || 'No provider accepted webhook' };

    } catch (error) {
      console.error(`Webhook processing failed for ${providerParam}:`, error);

      try {
        const dedupeKey = this.createDedupeKey(providerParam, tenantId, body, identifiers);
        await this.storeWebhook(providerParam, dedupeKey, false, tenantId, {
          headers,
          body: typeof body === 'string' ? body : JSON.stringify(body),
          error: error instanceof Error ? error.message : 'Unknown error',
          identifiers,
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
    provider: PaymentProvider,
    tenantId: string
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
      tenantId,
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
        event.data,
        tenantId,
        { verified: verifyResult.verified === true }
      );
    }
    
    // Update refund status if applicable
    if (event.refundId && event.status && this.isRefundStatus(event.status)) {
      refundUpdated = await this.updateRefundStatus(
        event.refundId,
        event.status,
        event.data,
        tenantId
      );
    }
    
    return { eventId, paymentUpdated, refundUpdated };
  }

  private async resolveCandidateProviders(
    providerParam: PaymentProvider,
    tenantId: string
  ): Promise<PaymentProvider[]> {
    const enabledConfigs = await configResolver.getEnabledProviders(this.environment, tenantId);
    const enabledProviders = enabledConfigs.map((config) => config.provider);

    const normalized = this.normalizeProvider(providerParam);
    if (normalized) {
      return enabledProviders.includes(normalized) ? [normalized] : [];
    }

    return enabledProviders;
  }

  private normalizeProvider(provider: string | undefined): PaymentProvider | null {
    const allowed: PaymentProvider[] = [
      'razorpay', 'payu', 'ccavenue', 'cashfree',
      'paytm', 'billdesk', 'phonepe', 'stripe'
    ];

    if (provider && allowed.includes(provider as PaymentProvider)) {
      return provider as PaymentProvider;
    }

    return null;
  }

  /**
   * Update payment status from webhook
   */
  private async updatePaymentStatus(
    paymentId: string,
    status: any,
    data: Record<string, any>,
    tenantId: string,
    options?: { verified?: boolean }
  ): Promise<boolean> {
    try {
      const normalizedStatus = this.normalizeWebhookStatus(status);
      const capturedAmount = this.extractCapturedAmount(data);
      type TamperedAudit = {
        provider?: PaymentProvider;
        expectedAmountMinor: number;
        receivedAmountMinor: number;
        paymentId: string;
        orderId?: string | null;
      };
      let tamperedAudit: TamperedAudit | null = null;
      let failureAudit: FailureAuditRecord | null = null;

      const updated = await db.transaction(async (trx) => {
        const [paymentRecord] = await trx
          .select({
            id: payments.id,
            orderId: payments.orderId,
            provider: payments.provider,
            currentStatus: payments.status,
            amountAuthorizedMinor: payments.amountAuthorizedMinor,
            amountCapturedMinor: payments.amountCapturedMinor,
          })
          .from(payments)
          .where(
            and(
              eq(payments.tenantId, tenantId),
              or(eq(payments.id, paymentId), eq(payments.providerPaymentId, paymentId))
            )
          )
          .limit(1);

        if (!paymentRecord) {
          return false;
        }

        const currentLifecycle = this.toLifecycleStatus(paymentRecord.currentStatus);
        const nextLifecycle = this.toLifecycleStatus(normalizedStatus);
        const transitionAllowed = this.canTransitionLifecycleStatus(
          currentLifecycle,
          nextLifecycle
        );

        if (!transitionAllowed) {
          return false;
        }

        const providerMetadata = this.extractPaymentMetadata(
          data,
          paymentRecord.provider as PaymentProvider | undefined
        );

        const updateData: Record<string, any> = {
          status: this.toStorageStatus(normalizedStatus),
          updatedAt: new Date(),
        };
        let skipOrderPromotion = false;

        const failureDetails = this.extractFailureDetails(data);
        if (nextLifecycle === 'FAILED') {
          if (failureDetails.code) {
            updateData.failureCode = failureDetails.code;
          }
          if (failureDetails.message) {
            updateData.failureMessage = failureDetails.message;
          }
        }

        if (providerMetadata.providerPaymentId) {
          updateData.providerPaymentId = providerMetadata.providerPaymentId;
        }

        if (providerMetadata.providerTransactionId) {
          updateData.providerTransactionId = providerMetadata.providerTransactionId;
        }

        if (providerMetadata.providerReferenceId) {
          updateData.providerReferenceId = providerMetadata.providerReferenceId;
        }

        if (providerMetadata.upiPayerHandle) {
          updateData.upiPayerHandle =
            paymentRecord.provider === 'phonepe'
              ? maskPhonePeVirtualPaymentAddress(providerMetadata.upiPayerHandle) ?? providerMetadata.upiPayerHandle
              : providerMetadata.upiPayerHandle;
        }

        if (providerMetadata.upiUtr) {
          updateData.upiUtr =
            paymentRecord.provider === 'phonepe'
              ? maskPhonePeUtr(providerMetadata.upiUtr) ?? providerMetadata.upiUtr
              : providerMetadata.upiUtr;
        }

        if (providerMetadata.upiInstrumentVariant) {
          updateData.upiInstrumentVariant = providerMetadata.upiInstrumentVariant;
        }

        if (providerMetadata.receiptUrl) {
          updateData.receiptUrl = providerMetadata.receiptUrl;
        }

        if (nextLifecycle === 'COMPLETED' && typeof capturedAmount === 'number') {
          const expected =
            typeof paymentRecord.amountAuthorizedMinor === 'number'
              ? paymentRecord.amountAuthorizedMinor
              : capturedAmount;

          if (
            typeof paymentRecord.amountAuthorizedMinor === 'number' &&
            capturedAmount !== paymentRecord.amountAuthorizedMinor
          ) {
            tamperedAudit = {
              provider: paymentRecord.provider as PaymentProvider,
              expectedAmountMinor: paymentRecord.amountAuthorizedMinor,
              receivedAmountMinor: capturedAmount,
              paymentId: paymentRecord.id,
              orderId: paymentRecord.orderId,
            };
            updateData.amountCapturedMinor = expected;
            skipOrderPromotion = true;
          } else {
            updateData.amountCapturedMinor = capturedAmount;
          }
        }

        await trx
          .update(payments)
          .set(updateData)
          .where(eq(payments.id, paymentRecord.id));

        const shouldMarkOrderFailed =
          paymentRecord.provider === 'phonepe' &&
          nextLifecycle === 'FAILED' &&
          transitionAllowed;

        if (shouldMarkOrderFailed) {
          const failedAt = new Date();
          await trx
            .update(orders)
            .set({
              paymentStatus: 'failed',
              paymentFailedAt: failedAt,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(orders.id, paymentRecord.orderId),
                sql`${orders.paymentStatus} <> 'paid'`
              )
            );

          failureAudit = {
            provider: paymentRecord.provider as PaymentProvider,
            paymentId: paymentRecord.id,
            orderId: paymentRecord.orderId,
            status: normalizedStatus,
            failureCode: failureDetails.code,
            failureMessage: failureDetails.message,
            failedAt,
          };
        }

        const shouldPromoteOrder =
          options?.verified === true &&
          nextLifecycle === 'COMPLETED' &&
          !skipOrderPromotion &&
          transitionAllowed;

        if (shouldPromoteOrder) {
          await trx
            .update(orders)
            .set({
              paymentStatus: 'paid',
              status: sql`CASE WHEN ${orders.status} = 'pending' THEN 'confirmed' ELSE ${orders.status} END`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(orders.id, paymentRecord.orderId),
                sql`${orders.paymentStatus} <> 'paid'`
              )
            );
        }

        return true;
      });

      if (tamperedAudit) {
        const { provider: providerCandidate, paymentId, orderId, expectedAmountMinor, receivedAmountMinor } = tamperedAudit;
        const auditProvider = (providerCandidate ?? 'phonepe') as PaymentProvider;
        await this.logAuditEvent(auditProvider, tenantId, 'webhook.amount_mismatch', {
          paymentId,
          orderId,
          expectedAmountMinor,
          receivedAmountMinor,
        });
      }

      if (failureAudit) {
        const auditToLog = failureAudit as FailureAuditRecord;
        await this.logAuditEvent(auditToLog.provider, tenantId, 'webhook.payment_failed', {
          paymentId: auditToLog.paymentId,
          orderId: auditToLog.orderId,
          status: auditToLog.status,
          failureCode: auditToLog.failureCode,
          failureMessage: auditToLog.failureMessage,
          failedAt: auditToLog.failedAt.toISOString(),
        });
      }

      return updated;
    } catch (error) {
      console.error(`Failed to update payment ${paymentId} status:`, error);
      return false;
    }
  }

  private extractFailureDetails(payload: Record<string, any> | undefined): {
    code?: string;
    message?: string;
  } {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    const values = [payload, payload.data].filter(
      (candidate): candidate is Record<string, any> => typeof candidate === 'object' && candidate !== null
    );

    const pickString = (...candidates: Array<unknown>): string | undefined => {
      for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          return candidate.trim();
        }
      }
      return undefined;
    };

    const code = pickString(
      ...values.map((candidate) => candidate.code),
      ...values.map((candidate) => candidate.state),
      ...values.map((candidate) => candidate.subCode)
    );

    const message = pickString(
      ...values.map((candidate) => candidate.message),
      ...values.map((candidate) => candidate.failureMessage),
      ...values.map((candidate) => candidate.reason),
      ...values.map((candidate) => candidate.description)
    );

    return { code, message };
  }
  
  /**
   * Update refund status from webhook
   */
  private async updateRefundStatus(
    refundId: string,
    status: any,
    data: Record<string, any>,
    tenantId: string
  ): Promise<boolean> {
    try {
      const result = await db
        .update(refunds)
        .set({
          status: status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(refunds.id, refundId),
            eq(refunds.tenantId, tenantId)
          )
        );

      return (result.rowCount || 0) > 0;
    } catch (error) {
      console.error(`Failed to update refund ${refundId} status:`, error);
      return false;
    }
  }

  private normalizeWebhookStatus(status: any): string {
    if (typeof status !== 'string') {
      return 'processing';
    }

    const value = status.toLowerCase();

    switch (value) {
      case 'completed':
      case 'captured':
      case 'success':
      case 'succeeded':
        return 'captured';
      case 'authorized':
        return 'authorized';
      case 'pending':
      case 'initiated':
      case 'processing':
        return 'processing';
      case 'failed':
      case 'failure':
        return 'failed';
      case 'timeout':
      case 'timed_out':
      case 'timedout':
      case 'expired':
        return 'cancelled';
      case 'cancelled':
      case 'canceled':
        return 'cancelled';
      case 'refunded':
        return 'refunded';
      case 'partially_refunded':
        return 'partially_refunded';
      case 'created':
        return 'created';
      default:
        return value;
    }
  }

  private toLifecycleStatus(status: any): PaymentLifecycleStatus {
    return normalizePaymentLifecycleStatus(status);
  }

  private canTransitionLifecycleStatus(
    current: PaymentLifecycleStatus,
    next: PaymentLifecycleStatus
  ): boolean {
    return canTransitionPaymentLifecycle(current, next);
  }

  private toStorageStatus(status: any): string {
    if (typeof status !== 'string') {
      return 'PENDING';
    }

    const normalized = status.trim();
    if (!normalized) {
      return 'PENDING';
    }

    const upper = normalized.toUpperCase();
    const lifecycle = normalizePaymentLifecycleStatus(upper);

    if (lifecycle === 'COMPLETED') {
      return 'COMPLETED';
    }

    if (lifecycle === 'PENDING') {
      return 'PENDING';
    }

    if (lifecycle === 'FAILED') {
      if (upper === 'FAILED' || upper === 'FAILURE') {
        return 'FAILED';
      }
      return upper;
    }

    if (lifecycle === 'CREATED' || upper === 'CREATED') {
      return 'CREATED';
    }

    return upper;
  }

  private extractPaymentMetadata(payload: Record<string, any> | undefined, provider?: PaymentProvider): {
    providerPaymentId?: string;
    providerTransactionId?: string;
    providerReferenceId?: string;
    upiPayerHandle?: string;
    upiUtr?: string;
    receiptUrl?: string;
    upiInstrumentVariant?: string;
  } {
    const metadata: {
      providerPaymentId?: string;
      providerTransactionId?: string;
      providerReferenceId?: string;
      upiPayerHandle?: string;
      upiUtr?: string;
      receiptUrl?: string;
      upiInstrumentVariant?: string;
    } = {};

    if (!payload) {
      return metadata;
    }

    const nestedSources = [
      payload,
      typeof payload.data === 'object' ? payload.data : undefined,
      typeof payload.paymentInstrument === 'object' ? payload.paymentInstrument : undefined,
      typeof payload.instrumentResponse === 'object' ? payload.instrumentResponse : undefined,
    ].filter(Boolean) as Record<string, any>[];

    const instrumentResponse =
      typeof payload.instrumentResponse === 'object' && payload.instrumentResponse !== null
        ? (payload.instrumentResponse as Record<string, any>)
        : undefined;

    const paymentInstrument =
      typeof payload.paymentInstrument === 'object' && payload.paymentInstrument !== null
        ? (payload.paymentInstrument as Record<string, any>)
        : undefined;

    const nestedPaymentInstrument =
      instrumentResponse &&
      typeof instrumentResponse.paymentInstrument === 'object' &&
      instrumentResponse.paymentInstrument !== null
        ? (instrumentResponse.paymentInstrument as Record<string, any>)
        : undefined;

    const pickString = (...values: Array<unknown>): string | undefined => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
          return value.trim();
        }
      }
      return undefined;
    };

    metadata.providerPaymentId = pickString(
      ...nestedSources.map(source => source.providerPaymentId),
      ...nestedSources.map(source => source.paymentId),
      ...nestedSources.map(source => source.merchantTransactionId)
    );

    metadata.providerTransactionId = pickString(
      ...nestedSources.map(source => source.providerTransactionId),
      ...nestedSources.map(source => source.transactionId),
      ...nestedSources.map(source => source.pgTransactionId),
      ...nestedSources.map(source => source.gatewayTransactionId)
    );

    metadata.providerReferenceId = pickString(
      ...nestedSources.map(source => source.providerReferenceId),
      ...nestedSources.map(source => source.orderId),
      ...nestedSources.map(source => source.referenceId),
      ...nestedSources.map(source => source.merchantOrderId)
    );

    metadata.upiPayerHandle = pickString(
      ...nestedSources.map(source => source.upiPayerHandle),
      ...nestedSources.map(source => source.payerVpa),
      ...nestedSources.map(source => source.payerHandle),
      ...nestedSources.map(source => source.virtualPaymentAddress),
      ...nestedSources.map(source => source.vpa),
      ...nestedSources.map(source => source.payerAddress)
    );

    metadata.upiUtr = pickString(
      ...nestedSources.map(source => source.upiUtr),
      ...nestedSources.map(source => source.utr),
      ...nestedSources.map(source => source.upiTransactionId)
    );

    metadata.receiptUrl = pickString(
      ...nestedSources.map(source => source.receiptUrl),
      ...nestedSources.map(source => source.receipt),
      ...nestedSources.map(source => source.receiptLink),
      ...nestedSources.map(source => source.receiptPath),
      ...nestedSources.map(source => source.receipt_path)
    );

    const instrumentVariantCandidates: Array<string | undefined> = [
      instrumentResponse?.type,
      instrumentResponse?.instrumentType,
      nestedPaymentInstrument?.type,
      nestedPaymentInstrument?.instrumentType,
      paymentInstrument?.type,
      paymentInstrument?.instrumentType,
    ];

    for (const candidate of instrumentVariantCandidates) {
      const normalizedVariant = normalizeUpiInstrumentVariant(candidate);
      if (normalizedVariant) {
        metadata.upiInstrumentVariant = normalizedVariant;
        break;
      }
    }

    if (provider === 'phonepe') {
      metadata.upiPayerHandle = maskPhonePeVirtualPaymentAddress(metadata.upiPayerHandle) ?? metadata.upiPayerHandle;
      metadata.upiUtr = maskPhonePeUtr(metadata.upiUtr) ?? metadata.upiUtr;
    }

    return metadata;
  }

  private extractCapturedAmount(payload?: Record<string, any>): number | undefined {
    if (!payload) {
      return undefined;
    }

    const nestedSources = [
      payload,
      typeof payload.data === 'object' ? payload.data : undefined,
    ].filter(Boolean) as Record<string, any>[];

    for (const source of nestedSources) {
      const candidates = [
        source.amount,
        source.amountMinor,
        source.transactionAmount,
        source.capturedAmount,
        source.captureAmount,
      ];

      for (const candidate of candidates) {
        if (typeof candidate === 'number' && !Number.isNaN(candidate)) {
          return candidate;
        }

        if (typeof candidate === 'string' && candidate.trim().length > 0) {
          const parsed = Number(candidate);
          if (!Number.isNaN(parsed)) {
            return candidate.includes('.') ? Math.round(parsed * 100) : Math.round(parsed);
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Check if status is a payment status
   */
  private isPaymentStatus(status: any): boolean {
    if (!status) {
      return false;
    }

    const normalized = this.normalizeWebhookStatus(status);
    const paymentStatuses = new Set([
      'created',
      'initiated',
      'processing',
      'authorized',
      'captured',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded',
    ]);

    return paymentStatuses.has(normalized);
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

  private extractIdentifiers(body: string | Buffer): {
    eventId?: string;
    orderId?: string;
    transactionId?: string;
    utr?: string;
    referenceId?: string;
  } {
    const identifiers: {
      eventId?: string;
      orderId?: string;
      transactionId?: string;
      utr?: string;
      referenceId?: string;
    } = {};

    const content = typeof body === 'string' ? body : body.toString();

    try {
      const parsed = JSON.parse(content);
      const sources = [
        parsed,
        parsed?.event,
        parsed?.event && typeof parsed.event === 'object' ? (parsed.event as Record<string, any>).payload : undefined,
        parsed?.data,
        parsed?.payload,
        parsed?.payment,
        parsed?.transaction,
        parsed?.message,
        parsed?.response,
      ].filter(Boolean) as Record<string, any>[];

      const pick = (...values: Array<unknown>): string | undefined => {
        for (const value of values) {
          if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
          }
        }
        return undefined;
      };

      identifiers.eventId = pick(
        ...sources.map((source) => source.eventId),
        ...sources.map((source) => source.event_id),
        ...sources.map((source) => source.id)
      );

      identifiers.orderId = pick(
        ...sources.map((source) => source.orderId),
        ...sources.map((source) => source.order_id),
        ...sources.map((source) => source.merchantOrderId),
        ...sources.map((source) => source.providerOrderId)
      );

      identifiers.transactionId = pick(
        ...sources.map((source) => source.transactionId),
        ...sources.map((source) => source.providerTransactionId),
        ...sources.map((source) => source.pgTransactionId),
        ...sources.map((source) => source.merchantTransactionId),
        ...sources.map((source) => source.paymentId)
      );

      identifiers.utr = pick(
        ...sources.map((source) => source.utr),
        ...sources.map((source) => source.upiUtr),
        ...sources.map((source) => source.upiTransactionId)
      );

      identifiers.referenceId = pick(
        ...sources.map((source) => source.referenceId),
        ...sources.map((source) => source.providerReferenceId),
        ...sources.map((source) => source.merchantOrderId)
      );
    } catch {
      // ignore parse errors; identifiers remain undefined
    }

    return identifiers;
  }

  /**
   * Create dedupe key from webhook content
   */
  private createDedupeKey(
    provider: string,
    tenantId: string,
    body: string | Buffer,
    identifiers: { eventId?: string; orderId?: string; transactionId?: string; utr?: string; referenceId?: string }
  ): string {
    const content = typeof body === 'string' ? body : body.toString();
    const baseTokens = [tenantId, provider];

    if (identifiers.orderId && identifiers.transactionId) {
      baseTokens.push(`order:${identifiers.orderId}`);
      baseTokens.push(`txn:${identifiers.transactionId}`);
    } else {
      if (identifiers.eventId) {
        baseTokens.push(`event:${identifiers.eventId}`);
      }
      if (identifiers.transactionId) {
        baseTokens.push(`txn:${identifiers.transactionId}`);
      }
    }
    if (identifiers.utr) {
      baseTokens.push(`utr:${identifiers.utr}`);
    }
    if (identifiers.referenceId) {
      baseTokens.push(`ref:${identifiers.referenceId}`);
    }

    const keyMaterial = baseTokens.join('|');
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    return crypto.createHash('sha256').update(`${keyMaterial}|${contentHash}`).digest('hex');
  }
  
  /**
   * Get existing webhook from inbox
   */
  private async getExistingWebhook(provider: PaymentProvider, dedupeKey: string, tenantId: string) {
    const result = await db
      .select()
      .from(webhookInbox)
      .where(
        and(
          eq(webhookInbox.provider, provider),
          eq(webhookInbox.dedupeKey, dedupeKey),
          eq(webhookInbox.tenantId, tenantId)
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
    tenantId: string,
    payload: Record<string, any>
  ): Promise<void> {
    await db.insert(webhookInbox).values({
      id: crypto.randomUUID(),
      provider,
      dedupeKey,
      signatureVerified: verified,
      payload,
      receivedAt: new Date(),
      tenantId,
    });
  }
  
  /**
   * Mark webhook as processed
   */
  private async markWebhookProcessed(provider: PaymentProvider, dedupeKey: string, tenantId: string): Promise<void> {
    await db
      .update(webhookInbox)
      .set({
        processedAt: new Date(),
      })
      .where(
        and(
          eq(webhookInbox.provider, provider),
          eq(webhookInbox.dedupeKey, dedupeKey),
          eq(webhookInbox.tenantId, tenantId)
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
      tenantId: event.tenantId,
      provider: event.provider,
      type: event.type,
      data: event.data,
      occurredAt: event.timestamp,
    });
  }

  private async logSecurityEvent(
    provider: PaymentProvider,
    tenantId: string,
    type: string,
    details: Record<string, any>
  ): Promise<void> {
    const data = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined && value !== null)
    );

    await db.insert(paymentEvents).values({
      id: crypto.randomUUID(),
      tenantId,
      provider,
      type: `security.${type}`,
      data,
      occurredAt: new Date(),
    });
  }

  private async logAuditEvent(
    provider: PaymentProvider,
    tenantId: string,
    type: string,
    details: Record<string, any>
  ): Promise<void> {
    const data = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined && value !== null)
    );

    await db.insert(paymentEvents).values({
      id: crypto.randomUUID(),
      tenantId,
      provider,
      type,
      data,
      occurredAt: new Date(),
    });
  }

  private isAuthorizationError(code?: string): boolean {
    if (!code) {
      return false;
    }

    const normalized = code.toUpperCase();
    return normalized === 'INVALID_AUTHORIZATION' || normalized === 'MISSING_AUTHORIZATION' || normalized === 'UNAUTHORIZED';
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