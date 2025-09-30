import type { VerifyPaymentParams, PaymentResult } from "../../shared/payment-types";

export type PhonePePollingFinalStatus = "pending" | "completed" | "failed" | "expired";

export interface PhonePePollingJob {
  id: string;
  tenantId: string;
  orderId: string;
  paymentId: string;
  merchantTransactionId: string;
  status: PhonePePollingFinalStatus;
  attempt: number;
  nextPollAt: Date;
  expireAt: Date;
  lastPolledAt?: Date | null;
  lastStatus?: string | null;
  lastResponseCode?: string | null;
  lastError?: string | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePhonePePollingJobInput {
  tenantId: string;
  orderId: string;
  paymentId: string;
  merchantTransactionId: string;
  expireAfterSeconds: number;
  createdAt?: Date;
}

export interface EnsureJobParams extends CreatePhonePePollingJobInput {
  initialIntervalSeconds: number;
  now: Date;
}

export interface PhonePePollingPersistence {
  listPendingJobs(): Promise<PhonePePollingJob[]>;
  ensureJob(params: EnsureJobParams): Promise<PhonePePollingJob>;
  getJobById(id: string): Promise<PhonePePollingJob | null>;
  recordPollingAttempt(
    jobId: string,
    update: {
      attempt: number;
      nextPollAt: Date;
      polledAt: Date;
      lastStatus: string;
      lastResponseCode?: string;
      lastError?: string | null;
    }
  ): Promise<PhonePePollingJob | null>;
  markCompleted(
    jobId: string,
    finalStatus: "completed" | "failed",
    update: {
      polledAt: Date;
      lastStatus: string;
      lastResponseCode?: string;
      lastError?: string | null;
      attempt: number;
    }
  ): Promise<PhonePePollingJob | null>;
  markExpired(
    jobId: string,
    update: {
      polledAt: Date;
      lastStatus?: string;
      lastError?: string | null;
      attempt: number;
    }
  ): Promise<PhonePePollingJob | null>;
}

export interface PhonePeVerificationService {
  verifyPayment(params: VerifyPaymentParams, tenantId: string): Promise<PaymentResult>;
}

type WorkerLogger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export interface PhonePePollingWorkerOptions {
  store: PhonePePollingPersistence;
  getVerificationService: () => PhonePeVerificationService;
  pollIntervalsSeconds?: readonly number[];
  now?: () => Date;
  logger?: Partial<WorkerLogger>;
}

export const PHONEPE_POLL_INTERVALS_SECONDS = Object.freeze([15, 30, 60, 120, 240]);

const TERMINAL_SUCCESS_STATUSES = new Set([
  "captured",
  "completed",
  "COMPLETED",
  "paid",
  "succeeded",
  "success",
]);

const TERMINAL_FAILURE_STATUSES = new Set([
  "failed",
  "FAILED",
  "cancelled",
  "canceled",
  "timedout",
  "expired",
]);

const DEFAULT_LOGGER: WorkerLogger = {
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
  warn: (..._args: unknown[]) => {},
  error: (..._args: unknown[]) => {},
};

export class PhonePePollingWorker {
  private readonly store: PhonePePollingPersistence;
  private readonly getVerificationService: () => PhonePeVerificationService;
  private readonly pollIntervals: readonly number[];
  private readonly now: () => Date;
  private readonly logger: WorkerLogger;

  private running = false;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(options: PhonePePollingWorkerOptions) {
    this.store = options.store;
    this.getVerificationService = options.getVerificationService;
    this.pollIntervals = options.pollIntervalsSeconds ?? PHONEPE_POLL_INTERVALS_SECONDS;
    this.now = options.now ?? (() => new Date());
    this.logger = { ...DEFAULT_LOGGER, ...(options.logger ?? {}) };
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.logger.debug("phonepe-polling-worker:start");

    const jobs = await this.store.listPendingJobs();
    for (const job of jobs) {
      if (job.status === "pending") {
        this.schedule(job);
      }
    }
  }

  public stop(): void {
    this.logger.debug("phonepe-polling-worker:stop");
    this.running = false;
    this.timers.forEach((timeout) => {
      clearTimeout(timeout);
    });
    this.timers.clear();
  }

  public async registerJob(params: CreatePhonePePollingJobInput): Promise<PhonePePollingJob> {
    const now = this.now();
    const job = await this.store.ensureJob({
      ...params,
      initialIntervalSeconds: this.resolveIntervalForAttempt(0),
      now,
    });

    if (this.running && job.status === "pending") {
      this.schedule(job);
    }

    return job;
  }

  private schedule(job: PhonePePollingJob): void {
    if (!this.running) {
      return;
    }

    this.clearTimer(job.id);
    const now = this.now();
    const delay = Math.max(0, job.nextPollAt.getTime() - now.getTime());

    const timeout = setTimeout(() => {
      this.processJob(job.id).catch((error) => {
        this.logger.error("phonepe-polling-worker:process-error", error);
      });
    }, delay);

    this.timers.set(job.id, timeout);
  }

  private clearTimer(jobId: string): void {
    const existing = this.timers.get(jobId);
    if (existing) {
      clearTimeout(existing);
      this.timers.delete(jobId);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    this.clearTimer(jobId);

    const job = await this.store.getJobById(jobId);
    if (!job || job.status !== "pending") {
      return;
    }

    const now = this.now();
    if (job.expireAt.getTime() <= now.getTime()) {
      await this.store.markExpired(job.id, {
        polledAt: now,
        lastStatus: job.lastStatus ?? "expired",
        lastError: job.lastError,
        attempt: job.attempt,
      });
      return;
    }

    try {
      const verificationService = this.getVerificationService();
      const result = await verificationService.verifyPayment(
        {
          paymentId: job.paymentId,
          providerData: { merchantTransactionId: job.merchantTransactionId },
        },
        job.tenantId
      );

      const normalizedStatus = (result.status || "").toLowerCase();
      const responseCode = typeof result.providerData?.responseCode === "string"
        ? result.providerData.responseCode
        : undefined;

      if (TERMINAL_SUCCESS_STATUSES.has(normalizedStatus)) {
        await this.store.markCompleted(job.id, "completed", {
          polledAt: now,
          lastStatus: normalizedStatus,
          lastResponseCode: responseCode,
          lastError: null,
          attempt: job.attempt + 1,
        });
        return;
      }

      if (TERMINAL_FAILURE_STATUSES.has(normalizedStatus)) {
        await this.store.markCompleted(job.id, "failed", {
          polledAt: now,
          lastStatus: normalizedStatus,
          lastResponseCode: responseCode,
          lastError: result.error?.message ?? null,
          attempt: job.attempt + 1,
        });
        return;
      }

      await this.scheduleNextAttempt(job, now, {
        lastStatus: normalizedStatus || job.lastStatus || "processing",
        lastResponseCode: responseCode,
        lastError: null,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.scheduleNextAttempt(job, now, {
        lastStatus: job.lastStatus ?? "processing",
        lastResponseCode: job.lastResponseCode ?? undefined,
        lastError: errorMessage,
      });
    }
  }

  private async scheduleNextAttempt(
    job: PhonePePollingJob,
    now: Date,
    context: {
      lastStatus: string;
      lastResponseCode?: string;
      lastError?: string | null;
    }
  ): Promise<void> {
    const nextAttempt = job.attempt + 1;
    const intervalSeconds = this.resolveIntervalForAttempt(nextAttempt);
    const timeUntilExpiryMs = job.expireAt.getTime() - now.getTime();

    if (timeUntilExpiryMs <= 0) {
      await this.store.markExpired(job.id, {
        polledAt: now,
        lastStatus: context.lastStatus,
        lastError: context.lastError,
        attempt: job.attempt + 1,
      });
      return;
    }

    const delayMs = Math.min(intervalSeconds * 1000, timeUntilExpiryMs);
    if (delayMs <= 0) {
      await this.store.markExpired(job.id, {
        polledAt: now,
        lastStatus: context.lastStatus,
        lastError: context.lastError,
        attempt: job.attempt + 1,
      });
      return;
    }

    const nextPollAt = new Date(now.getTime() + delayMs);
    const updated = await this.store.recordPollingAttempt(job.id, {
      attempt: nextAttempt,
      nextPollAt,
      polledAt: now,
      lastStatus: context.lastStatus,
      lastResponseCode: context.lastResponseCode,
      lastError: context.lastError ?? null,
    });

    if (updated && updated.status === "pending" && this.running) {
      this.schedule(updated);
    }
  }

  private resolveIntervalForAttempt(attempt: number): number {
    if (attempt < 0) {
      return this.pollIntervals[0] ?? 15;
    }

    if (attempt >= this.pollIntervals.length) {
      return this.pollIntervals[this.pollIntervals.length - 1] ?? 15;
    }

    const interval = this.pollIntervals[attempt];
    return Number.isFinite(interval) && interval > 0 ? interval : this.pollIntervals[0] ?? 15;
  }
}
