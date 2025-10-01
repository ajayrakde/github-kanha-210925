import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { phonepePollingJobs } from "../../shared/schema";
import type {
  EnsureJobParams,
  PhonePePollingJob,
  PhonePePollingPersistence,
} from "../services/phonepe-polling-worker";

const STORE_LOGGER_PREFIX = "phonepe-polling-store";

function toJob(record: typeof phonepePollingJobs.$inferSelect | undefined | null): PhonePePollingJob | null {
  if (!record) {
    return null;
  }

  return {
    ...record,
    status: record.status as PhonePePollingJob["status"],
    lastPolledAt: record.lastPolledAt ?? undefined,
    lastStatus: record.lastStatus ?? undefined,
    lastResponseCode: record.lastResponseCode ?? undefined,
    lastError: record.lastError ?? undefined,
    completedAt: record.completedAt ?? undefined,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  };
}

export class PhonePePollingStore implements PhonePePollingPersistence {
  public async listPendingJobs(): Promise<PhonePePollingJob[]> {
    const rows = await db
      .select()
      .from(phonepePollingJobs)
      .where(eq(phonepePollingJobs.status, "pending"));

    return rows.map((row) => toJob(row)!) as PhonePePollingJob[];
  }

  public async ensureJob(params: EnsureJobParams): Promise<PhonePePollingJob> {
    const createdAt = params.createdAt ?? params.now;
    const expireSeconds = Number.isFinite(params.expireAfterSeconds)
      ? Math.max(0, Math.floor(params.expireAfterSeconds))
      : 0;
    const expireAt = new Date(createdAt.getTime() + expireSeconds * 1000);
    const firstIntervalMs = Math.max(0, Math.floor(params.initialIntervalSeconds)) * 1000;
    const timeUntilExpiry = Math.max(0, expireAt.getTime() - createdAt.getTime());
    const initialDelay = Math.min(firstIntervalMs, timeUntilExpiry);

    if (timeUntilExpiry <= 0) {
      console.info(`${STORE_LOGGER_PREFIX}:job-expired-before-scheduling`, {
        tenantId: params.tenantId,
        paymentId: params.paymentId,
        orderId: params.orderId,
      });
    } else if (initialDelay < firstIntervalMs) {
      console.debug(`${STORE_LOGGER_PREFIX}:initial-delay-truncated`, {
        tenantId: params.tenantId,
        paymentId: params.paymentId,
        orderId: params.orderId,
        requestedSeconds: Math.floor(params.initialIntervalSeconds),
        scheduledSeconds: Math.floor(initialDelay / 1000),
      });
    }
    const nextPollAt = new Date(createdAt.getTime() + initialDelay);

    const job = await db.transaction(async (trx) => {
      const existing = await trx.query.phonepePollingJobs.findFirst({
        where: and(
          eq(phonepePollingJobs.tenantId, params.tenantId),
          eq(phonepePollingJobs.paymentId, params.paymentId)
        ),
      });

      if (existing) {
        return existing;
      }

      const [inserted] = await trx
        .insert(phonepePollingJobs)
        .values({
          tenantId: params.tenantId,
          orderId: params.orderId,
          paymentId: params.paymentId,
          merchantTransactionId: params.merchantTransactionId,
          status: "pending",
          attempt: 0,
          nextPollAt,
          expireAt,
          lastStatus: "created",
          createdAt,
          updatedAt: createdAt,
        })
        .returning();

      return inserted;
    });

    return toJob(job)!;
  }

  public async getJobById(id: string): Promise<PhonePePollingJob | null> {
    const record = await db.query.phonepePollingJobs.findFirst({
      where: eq(phonepePollingJobs.id, id),
    });

    return toJob(record);
  }

  public async recordPollingAttempt(
    jobId: string,
    update: {
      attempt: number;
      nextPollAt: Date;
      polledAt: Date;
      lastStatus: string;
      lastResponseCode?: string;
      lastError?: string | null;
    }
  ): Promise<PhonePePollingJob | null> {
    const [record] = await db
      .update(phonepePollingJobs)
      .set({
        attempt: update.attempt,
        nextPollAt: update.nextPollAt,
        lastPolledAt: update.polledAt,
        lastStatus: update.lastStatus,
        lastResponseCode: update.lastResponseCode ?? null,
        lastError: update.lastError ?? null,
        updatedAt: new Date(),
      })
      .where(eq(phonepePollingJobs.id, jobId))
      .returning();

    return toJob(record);
  }

  public async markCompleted(
    jobId: string,
    finalStatus: "completed" | "failed",
    update: {
      polledAt: Date;
      lastStatus: string;
      lastResponseCode?: string;
      lastError?: string | null;
      attempt: number;
    }
  ): Promise<PhonePePollingJob | null> {
    const [record] = await db
      .update(phonepePollingJobs)
      .set({
        status: finalStatus,
        lastPolledAt: update.polledAt,
        lastStatus: update.lastStatus,
        lastResponseCode: update.lastResponseCode ?? null,
        lastError: update.lastError ?? null,
        completedAt: update.polledAt,
        attempt: update.attempt,
        updatedAt: new Date(),
      })
      .where(eq(phonepePollingJobs.id, jobId))
      .returning();

    return toJob(record);
  }

  public async markExpired(
    jobId: string,
    update: {
      polledAt: Date;
      lastStatus?: string;
      lastError?: string | null;
      attempt: number;
    }
  ): Promise<PhonePePollingJob | null> {
    const [record] = await db
      .update(phonepePollingJobs)
      .set({
        status: "expired",
        lastPolledAt: update.polledAt,
        lastStatus: update.lastStatus ?? "expired",
        lastError: update.lastError ?? null,
        completedAt: update.polledAt,
        attempt: update.attempt,
        updatedAt: new Date(),
      })
      .where(eq(phonepePollingJobs.id, jobId))
      .returning();

    if (record) {
      console.info(`${STORE_LOGGER_PREFIX}:job-expired`, {
        jobId: record.id,
        attempt: update.attempt,
        paymentId: record.paymentId,
        tenantId: record.tenantId,
      });
    }

    return toJob(record);
  }

  public async getLatestJobForOrder(orderId: string, tenantId: string): Promise<PhonePePollingJob | null> {
    const [record] = await db
      .select()
      .from(phonepePollingJobs)
      .where(
        and(
          eq(phonepePollingJobs.orderId, orderId),
          eq(phonepePollingJobs.tenantId, tenantId)
        )
      )
      .orderBy(desc(phonepePollingJobs.createdAt))
      .limit(1);

    return toJob(record ?? null);
  }
}

export const phonePePollingStore = new PhonePePollingStore();

export type { PhonePePollingJob };
