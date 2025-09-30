import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PhonePePollingWorker,
  PHONEPE_POLL_INTERVALS_SECONDS,
  type PhonePePollingJob,
  type PhonePePollingPersistence,
  type EnsureJobParams,
} from "../phonepe-polling-worker";
import type { PaymentResult } from "../../../shared/payment-types";

class InMemoryPollingStore implements PhonePePollingPersistence {
  private jobs = new Map<string, PhonePePollingJob>();
  private idCounter = 1;

  async listPendingJobs(): Promise<PhonePePollingJob[]> {
    return Array.from(this.jobs.values()).filter((job) => job.status === "pending");
  }

  async ensureJob(params: EnsureJobParams): Promise<PhonePePollingJob> {
    const existing = Array.from(this.jobs.values()).find(
      (job) => job.paymentId === params.paymentId && job.tenantId === params.tenantId
    );
    if (existing) {
      return existing;
    }

    const createdAt = params.createdAt ?? params.now;
    const expireAt = new Date(createdAt.getTime() + params.expireAfterSeconds * 1000);
    const delayMs = Math.min(
      Math.max(0, Math.floor(params.initialIntervalSeconds)) * 1000,
      Math.max(0, expireAt.getTime() - createdAt.getTime())
    );
    const nextPollAt = new Date(createdAt.getTime() + delayMs);

    const job: PhonePePollingJob = {
      id: `job-${this.idCounter++}`,
      tenantId: params.tenantId,
      orderId: params.orderId,
      paymentId: params.paymentId,
      merchantTransactionId: params.merchantTransactionId,
      status: "pending",
      attempt: 0,
      nextPollAt,
      expireAt,
      lastPolledAt: undefined,
      lastStatus: "created",
      lastResponseCode: undefined,
      lastError: undefined,
      completedAt: undefined,
      createdAt,
      updatedAt: createdAt,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async getJobById(id: string): Promise<PhonePePollingJob | null> {
    return this.jobs.get(id) ?? null;
  }

  async recordPollingAttempt(
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
    const current = this.jobs.get(jobId);
    if (!current) {
      return null;
    }

    const next: PhonePePollingJob = {
      ...current,
      attempt: update.attempt,
      nextPollAt: update.nextPollAt,
      lastPolledAt: update.polledAt,
      lastStatus: update.lastStatus,
      lastResponseCode: update.lastResponseCode,
      lastError: update.lastError ?? null,
      updatedAt: new Date(update.polledAt),
    };

    this.jobs.set(jobId, next);
    return next;
  }

  async markCompleted(
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
    const current = this.jobs.get(jobId);
    if (!current) {
      return null;
    }

    const next: PhonePePollingJob = {
      ...current,
      status: finalStatus,
      lastPolledAt: update.polledAt,
      lastStatus: update.lastStatus,
      lastResponseCode: update.lastResponseCode,
      lastError: update.lastError ?? null,
      completedAt: update.polledAt,
      attempt: update.attempt,
      updatedAt: new Date(update.polledAt),
    };

    this.jobs.set(jobId, next);
    return next;
  }

  async markExpired(
    jobId: string,
    update: {
      polledAt: Date;
      lastStatus?: string;
      lastError?: string | null;
      attempt: number;
    }
  ): Promise<PhonePePollingJob | null> {
    const current = this.jobs.get(jobId);
    if (!current) {
      return null;
    }

    const next: PhonePePollingJob = {
      ...current,
      status: "expired",
      lastPolledAt: update.polledAt,
      lastStatus: update.lastStatus ?? current.lastStatus,
      lastError: update.lastError ?? null,
      completedAt: update.polledAt,
      attempt: update.attempt,
      updatedAt: new Date(update.polledAt),
    };

    this.jobs.set(jobId, next);
    return next;
  }

  getJobSnapshot(id: string): PhonePePollingJob | undefined {
    return this.jobs.get(id);
  }
}

describe("PhonePePollingWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const buildPaymentResult = (status: string): PaymentResult => ({
    paymentId: "pay-1",
    status: status as PaymentResult["status"],
    amount: 1000,
    currency: "INR",
    provider: "phonepe",
    environment: "test",
    providerData: { responseCode: status.toUpperCase() },
    createdAt: new Date(),
  });

  it("polls pending payments until completion using mandated intervals", async () => {
    const store = new InMemoryPollingStore();
    const statuses = ["created", "processing", "captured"];
    const verifyPayment = vi.fn().mockImplementation(async () => buildPaymentResult(statuses.shift()!));

    const worker = new PhonePePollingWorker({
      store,
      getVerificationService: () => ({ verifyPayment }),
      now: () => new Date(Date.now()),
    });

    await worker.start();
    const job = await worker.registerJob({
      tenantId: "default",
      orderId: "order-1",
      paymentId: "pay-1",
      merchantTransactionId: "mt-1",
      expireAfterSeconds: 900,
      createdAt: new Date(Date.now()),
    });

    expect(verifyPayment).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[0] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(1);
    const afterFirstPoll = store.getJobSnapshot(job.id)!;
    expect(afterFirstPoll.attempt).toBe(1);
    expect(afterFirstPoll.nextPollAt.getTime()).toBe(Date.now() + PHONEPE_POLL_INTERVALS_SECONDS[1] * 1000);

    await worker.registerJob({
      tenantId: "default",
      orderId: "order-1",
      paymentId: "pay-1",
      merchantTransactionId: "mt-1",
      expireAfterSeconds: 900,
      createdAt: new Date(Date.now()),
    });
    expect(store.getJobSnapshot(job.id)?.attempt).toBe(1);

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[1] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(2);
    const afterSecondPoll = store.getJobSnapshot(job.id)!;
    expect(afterSecondPoll.attempt).toBe(2);

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[2] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(3);
    const completedJob = store.getJobSnapshot(job.id)!;
    expect(completedJob.status).toBe("completed");

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[3] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(3);

    worker.stop();
  });

  it("marks jobs as failed when PhonePe reports failure", async () => {
    const store = new InMemoryPollingStore();
    const statuses = ["created", "failed"];
    const verifyPayment = vi.fn().mockImplementation(async () => buildPaymentResult(statuses.shift()!));

    const worker = new PhonePePollingWorker({
      store,
      getVerificationService: () => ({ verifyPayment }),
      now: () => new Date(Date.now()),
    });

    await worker.start();
    const job = await worker.registerJob({
      tenantId: "default",
      orderId: "order-2",
      paymentId: "pay-2",
      merchantTransactionId: "mt-2",
      expireAfterSeconds: 900,
      createdAt: new Date(Date.now()),
    });

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[0] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(1);

    await worker.registerJob({
      tenantId: "default",
      orderId: "order-2",
      paymentId: "pay-2",
      merchantTransactionId: "mt-2",
      expireAfterSeconds: 900,
      createdAt: new Date(Date.now()),
    });

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[1] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(2);
    const failedJob = store.getJobSnapshot(job.id)!;
    expect(failedJob.status).toBe("failed");
    expect(failedJob.attempt).toBe(2);

    await vi.advanceTimersByTimeAsync(PHONEPE_POLL_INTERVALS_SECONDS[2] * 1000);
    expect(verifyPayment).toHaveBeenCalledTimes(2);

    worker.stop();
  });
});
