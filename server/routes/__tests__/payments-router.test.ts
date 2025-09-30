import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Router } from "express";
import { paymentEvents } from "../../../shared/schema";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const idempotencyCache = new Map<string, any>();

const mockPaymentsService = {
  createPayment: vi.fn(),
  verifyPayment: vi.fn(),
  createRefund: vi.fn(),
  getRefundStatus: vi.fn(),
  performHealthCheck: vi.fn(),
};

const createPaymentsServiceMock = vi.fn(() => mockPaymentsService);

vi.mock("../../services/payments-service", () => ({
  createPaymentsService: createPaymentsServiceMock,
}));

const executeWithIdempotencyMock = vi.fn(async (key: string, scope: string, operation: () => Promise<any>) => {
  const cacheKey = `${scope}:${key}`;
  if (idempotencyCache.has(cacheKey)) {
    return idempotencyCache.get(cacheKey);
  }
  const result = await operation();
  idempotencyCache.set(cacheKey, result);
  return result;
});

const checkKeyMock = vi.fn(async (key: string, scope: string) => {
  const cacheKey = `${scope}:${key}`;
  if (idempotencyCache.has(cacheKey)) {
    return { exists: true, response: idempotencyCache.get(cacheKey) };
  }
  return { exists: false };
});

const invalidateKeyMock = vi.fn(async (key: string, scope: string) => {
  const cacheKey = `${scope}:${key}`;
  idempotencyCache.delete(cacheKey);
});

vi.mock("../../services/idempotency-service", () => ({
  idempotencyService: {
    executeWithIdempotency: executeWithIdempotencyMock,
    generateKey: vi.fn(() => "generated-key"),
    checkKey: checkKeyMock,
    storeResponse: vi.fn(),
    invalidateKey: invalidateKeyMock,
  },
}));

const mockOrdersRepository = {
  getOrderWithPayments: vi.fn(),
};

const mockPhonePePollingStore = {
  getLatestJobForOrder: vi.fn(),
  markExpired: vi.fn(),
};

const mockPhonePePollingWorker = {
  registerJob: vi.fn(),
};

vi.mock("../../storage", () => ({
  ordersRepository: mockOrdersRepository,
  phonePePollingStore: mockPhonePePollingStore,
}));

vi.mock("../../services/phonepe-polling-registry", () => ({
  phonePePollingWorker: mockPhonePePollingWorker,
}));

const insertValuesMock = vi.fn(async (_values: any) => ({ rowCount: 1 }));
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
const updateMock = vi.fn(() => ({
  set: vi.fn(() => ({
    where: vi.fn(async () => ({ rowCount: 0 })),
  })),
}));

vi.mock("../../db", () => ({
  db: {
    insert: insertMock,
    update: updateMock,
  },
}));

describe("payments router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyCache.clear();
    mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValue(null);
    mockPhonePePollingStore.markExpired.mockResolvedValue(null);
    mockPhonePePollingWorker.registerJob.mockResolvedValue({});
  });

  const buildRouter = async () => {
    const module = await import("../payments");
    return module.createPaymentsRouter(() => {});
  };

  const getRouteHandler = (router: Router, method: "get" | "post", path: string) => {
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
    );
    if (!layer) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    }
    return layer.route.stack[0].handle as (req: Request, res: Response, next: () => void) => Promise<void> | void;
  };

  const createMockResponse = () => {
    const res: Partial<Response> & { statusCode?: number; jsonPayload?: any } = {};
    res.status = vi.fn(function (this: any, code: number) {
      res.statusCode = code;
      return this;
    }) as any;
    res.json = vi.fn(function (this: any, payload: any) {
      res.jsonPayload = payload;
      return this;
    }) as any;
    return res as Response & { statusCode?: number; jsonPayload?: any };
  };

  describe("POST /api/payments/create", () => {
    it("rejects requests without an Idempotency-Key header", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/create");
      const req = {
        headers: {},
        body: { orderId: "order-1", amount: 10, currency: "INR" },
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Idempotency-Key header is required" });
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
    });

    it("passes sanitized idempotency key to the payments service", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/create");
      mockPaymentsService.createPayment.mockResolvedValue({
        paymentId: "pay_1",
        status: "created",
        amount: 1000,
        currency: "INR",
        provider: "phonepe",
        providerPaymentId: "mtid",
        redirectUrl: "https://example.com",
        providerData: {},
        createdAt: new Date(),
      });

      const req = {
        headers: { "idempotency-key": "   key-123   " },
        body: {
          orderId: "order-1",
          amount: 10,
          currency: "INR",
        },
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(mockPaymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "key-123" }),
        "default",
        undefined
      );
      expect(res.status).not.toHaveBeenCalled();
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: "pay_1",
          orderId: "order-1",
          tenantId: "default",
          merchantTransactionId: "mtid",
        })
      );
    });
  });

  describe("POST /api/payments/token-url", () => {
    const computeKey = (tenant: string, orderId: string, amountMinor: number, currency: string) => {
      const hash = createHash("sha256");
      hash.update([tenant, orderId, amountMinor.toString(), currency].join(":"));
      return `phonepe-token:${hash.digest("hex")}`;
    };

    const buildTokenRequest = (overrides: { body?: any; headers?: Record<string, string> } = {}) => {
      const baseBody = {
        orderId: "order-123",
        amount: 10,
        currency: "INR",
        customer: {},
      };

      return {
        headers: { "x-tenant-id": "tenant-a", ...(overrides.headers ?? {}) },
        body: { ...baseBody, ...(overrides.body ?? {}) },
      } as unknown as Request;
    };

    const buildPhonePeJob = (overrides: Record<string, any> = {}) => {
      const now = new Date();
      return {
        id: "job-1",
        tenantId: "tenant-a",
        orderId: "order-123",
        paymentId: "pay_1",
        merchantTransactionId: "merchant-1",
        status: "pending",
        attempt: 0,
        nextPollAt: new Date(now.getTime() + 1000),
        expireAt: new Date(now.getTime() + 600000),
        lastPolledAt: null,
        lastStatus: "created",
        lastResponseCode: null,
        lastError: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    };

    const buildPaymentResult = () => ({
      paymentId: "pay_1",
      status: "created",
      amount: 1000,
      currency: "INR",
      provider: "phonepe" as const,
      environment: "test" as const,
      providerPaymentId: "merchant-1",
      redirectUrl: "https://phonepe.example/token",
      providerData: { expireAfterSeconds: 900 },
      createdAt: new Date(),
    });

    it("reuses the pending token URL for rapid double submissions", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      mockPhonePePollingStore.getLatestJobForOrder
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(buildPhonePeJob({ createdAt: paymentResult.createdAt, expireAt: new Date(Date.now() + 600000) }));

      const firstReq = buildTokenRequest();
      const firstRes = createMockResponse();
      await handler(firstReq, firstRes, () => {});

      expect(firstRes.jsonPayload.success).toBe(true);
      expect(mockPaymentsService.createPayment).toHaveBeenCalledTimes(1);
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledTimes(1);

      const secondReq = buildTokenRequest();
      const secondRes = createMockResponse();
      await handler(secondReq, secondRes, () => {});

      expect(secondRes.jsonPayload).toEqual(firstRes.jsonPayload);
      expect(mockPaymentsService.createPayment).toHaveBeenCalledTimes(1);
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledTimes(1);
      expect(executeWithIdempotencyMock).toHaveBeenCalledTimes(1);
    });

    it("invalidates and recreates the token URL when the cached attempt expired", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      const amountMinor = 1000;
      const expectedKey = computeKey("tenant-a", "order-123", amountMinor, "INR");
      const expiredPayload = {
        success: true,
        data: {
          tokenUrl: "https://old.example/token",
          paymentId: "pay_0",
          merchantTransactionId: "merchant-0",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      };
      idempotencyCache.set(`phonepe_token_url:${expectedKey}`, expiredPayload);

      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValueOnce(
        buildPhonePeJob({
          paymentId: "pay_0",
          merchantTransactionId: "merchant-0",
          expireAt: new Date(Date.now() - 1000),
          attempt: 3,
        })
      );

      const req = buildTokenRequest();
      const res = createMockResponse();
      await handler(req, res, () => {});

      expect(mockPhonePePollingStore.markExpired).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          lastStatus: "expired",
          attempt: 3,
        })
      );
      expect(invalidateKeyMock).toHaveBeenCalledWith(expectedKey, "phonepe_token_url");
      expect(mockPaymentsService.createPayment).toHaveBeenCalledTimes(1);
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledTimes(1);
      expect(res.jsonPayload.success).toBe(true);
      expect(res.jsonPayload.data.tokenUrl).toBe(paymentResult.redirectUrl);
    });

    it("derives a deterministic idempotency key from the tenant, order, and amount", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      const req = buildTokenRequest({ body: { amount: 25.5 } });
      const res = createMockResponse();
      await handler(req, res, () => {});

      const expectedAmountMinor = Math.round(25.5 * 100);
      const expectedKey = computeKey("tenant-a", "order-123", expectedAmountMinor, "INR");

      expect(mockPaymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: expectedKey, orderAmount: expectedAmountMinor }),
        "tenant-a",
        "phonepe"
      );
      expect(res.jsonPayload.data.expiresAt).toBeTruthy();
    });
  });

  describe("GET /api/payments/order-info/:orderId", () => {
    const baseOrder = {
      id: "order-1",
      status: "pending",
      paymentStatus: "pending",
      paymentFailedAt: null,
      paymentMethod: "upi",
      subtotal: "100.00",
      discountAmount: "10.00",
      shippingCharge: "20.00",
      total: "118.00",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      payments: [] as any[],
      user: {},
      deliveryAddress: {},
    };

    const invoke = async (orderOverrides: Partial<typeof baseOrder>) => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue({
        ...baseOrder,
        ...orderOverrides,
      });
      const router = await buildRouter();
      const handler = getRouteHandler(router, "get", "/order-info/:orderId");
      const res = createMockResponse();
      const req = { params: { orderId: "order-1" }, headers: {} } as unknown as Request;

      await handler(req, res, () => {});

      return res;
    };

    it("returns pending status when no payments exist", async () => {
      const res = await invoke({ payments: [] });

      expect(res.jsonPayload.order.paymentStatus).toBe("pending");
      expect(res.jsonPayload.payment).toBeNull();
      expect(res.jsonPayload.latestTransaction).toBeUndefined();
      expect(res.jsonPayload.latestTransactionFailed).toBe(false);
      expect(res.jsonPayload.latestTransactionFailureAt).toBeNull();
      expect(res.jsonPayload.reconciliation).toBeNull();
      expect(res.jsonPayload.breakdown).toEqual({
        subtotal: 100,
        discount: 10,
        tax: 8,
        shipping: 20,
        total: 118,
      });
    });

    it("includes PhonePe polling progress when available", async () => {
      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValue({
        id: "job-1",
        tenantId: "default",
        orderId: "order-1",
        paymentId: "pay-1",
        merchantTransactionId: "mt-1",
        status: "pending",
        attempt: 2,
        nextPollAt: new Date("2024-01-01T00:05:00Z"),
        expireAt: new Date("2024-01-01T00:10:00Z"),
        lastPolledAt: new Date("2024-01-01T00:04:00Z"),
        lastStatus: "processing",
        lastResponseCode: "PAYMENT_PENDING",
        lastError: null,
        completedAt: null,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:04:00Z"),
      });

      const res = await invoke({ payments: [] });

      expect(res.jsonPayload.reconciliation).toMatchObject({
        status: "pending",
        attempt: 2,
        nextPollAt: "2024-01-01T00:05:00.000Z",
        expiresAt: "2024-01-01T00:10:00.000Z",
        lastStatus: "processing",
        lastResponseCode: "PAYMENT_PENDING",
      });
    });

    it("surfaces processing payment metadata", async () => {
      const payment = {
        id: "pay_processing",
        status: "processing",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: null,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: null,
        receiptUrl: null,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:06:00Z"),
      };
      const res = await invoke({
        paymentStatus: "processing",
        payments: [payment],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("processing");
      expect(res.jsonPayload.latestTransaction.status).toBe("processing");
      expect(res.jsonPayload.payment.status).toBe("processing");
      expect(res.jsonPayload.payment.providerTransactionId).toBe("txn");
      expect(res.jsonPayload.payment.upiPayerHandle).toBe(phonePeIdentifierFixture.maskedVpa);
      expect(res.jsonPayload.payment.upiInstrumentVariant).toBe(phonePeIdentifierFixture.variant);
      expect(res.jsonPayload.payment.upiInstrumentLabel).toBe(phonePeIdentifierFixture.label);
    });

    it("prioritizes completed UPI payment details", async () => {
      const captured = {
        id: "pay_captured",
        status: "COMPLETED",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 1000,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: phonePeIdentifierFixture.utr,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        receiptUrl: "https://receipt",
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:07:00Z"),
      };
      const res = await invoke({
        paymentStatus: "paid",
        status: "confirmed",
        payments: [captured],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("paid");
      expect(res.jsonPayload.payment.status).toBe("COMPLETED");
      expect(res.jsonPayload.payment.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
      expect(res.jsonPayload.payment.upiInstrumentLabel).toBe(phonePeIdentifierFixture.label);
      expect(res.jsonPayload.payment.receiptUrl).toBe("https://receipt");
      expect(res.jsonPayload.totals.paidMinor).toBe(1000);
    });

    it("reports failed attempts without overriding order state", async () => {
      const failed = {
        id: "pay_failed",
        status: "failed",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 0,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: null,
        providerReferenceId: "ref",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: null,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        receiptUrl: null,
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:07:00Z"),
      };
      const res = await invoke({
        paymentStatus: "failed",
        paymentFailedAt: new Date("2024-01-01T00:08:00Z"),
        payments: [failed],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("failed");
      expect(res.jsonPayload.order.paymentFailedAt).toBe("2024-01-01T00:08:00.000Z");
      expect(res.jsonPayload.payment.status).toBe("failed");
      expect(res.jsonPayload.totals.paidMinor).toBe(0);
      expect(res.jsonPayload.payment.upiPayerHandle).toBe(phonePeIdentifierFixture.maskedVpa);
      expect(res.jsonPayload.latestTransactionFailed).toBe(true);
      expect(res.jsonPayload.latestTransactionFailureAt).toBe("2024-01-01T00:08:00.000Z");
    });

    it("handles webhook-first captures before order promotion", async () => {
      const captured = {
        id: "pay_captured",
        status: "COMPLETED",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 1000,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: phonePeIdentifierFixture.utr,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        receiptUrl: "https://receipt",
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:05:30Z"),
      };
      const res = await invoke({
        paymentStatus: "pending",
        payments: [captured],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("pending");
      expect(res.jsonPayload.payment.status).toBe("COMPLETED");
      expect(res.jsonPayload.totals.paidMinor).toBe(1000);
      expect(res.jsonPayload.payment.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
    });
  });

  describe("GET /api/payments/phonepe/return", () => {
    it("records a processing marker without mutating order state", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "get", "/phonepe/return");
      const res = createMockResponse();
      const req = {
        query: {
          orderId: "order-1",
          merchantTransactionId: "merchant-123",
          state: "PENDING",
          code: "PAYMENT_PENDING",
        },
        headers: {},
      } as unknown as Request;

      await handler(req, res, () => {});

      expect(insertMock).toHaveBeenCalledWith(paymentEvents);
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "phonepe",
          type: "phonepe.return.processing",
          data: expect.objectContaining({
            orderId: "order-1",
            merchantTransactionId: "merchant-123",
            status: "processing",
          }),
        })
      );
      expect(updateMock).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.jsonPayload).toMatchObject({
        status: "processing",
        reconciliation: expect.objectContaining({
          shouldPoll: true,
        }),
      });
    });
  });
});
