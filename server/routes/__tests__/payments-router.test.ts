import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Router } from "express";
import { orders, paymentEvents } from "../../../shared/schema";
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

const buildOrderRecord = (overrides: Record<string, any> = {}) => ({
  id: "order-123",
  tenantId: "tenant-a",
  userId: "user-1",
  amountMinor: 1000,
  currency: "INR",
  status: "pending",
  paymentStatus: "pending",
  paymentFailedAt: null,
  paymentMethod: "upi",
  subtotal: "10.00",
  discountAmount: "0.00",
  shippingCharge: "0.00",
  total: "10.00",
  createdAt: new Date(),
  updatedAt: new Date(),
  payments: [],
  user: {},
  deliveryAddress: {},
  ...overrides,
});

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

  const buildResponse = (overrides: Record<string, any> = {}) => {
    const res: Partial<Response> & { statusCode?: number; jsonPayload?: any } = {
      statusCode: undefined,
      jsonPayload: undefined,
      ...overrides,
    };

    res.status = vi.fn((code: number) => {
      res.statusCode = code;
      return res as Response;
    }) as any;
    res.json = vi.fn((payload: any) => {
      res.jsonPayload = payload;
      return res as Response;
    }) as any;

    return res as Response & { statusCode?: number; jsonPayload?: any };
  };

  const createMockResponse = () => buildResponse();

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
    const computeKey = (
      prefix: "phonepe-token" | "phonepe-payment",
      tenant: string,
      orderId: string,
      amountMinor: number,
      currency: string
    ) => {
      const hash = createHash("sha256");
      hash.update([tenant, orderId, amountMinor.toString(), currency].join(":"));
      return `${prefix}:${hash.digest("hex")}`;
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
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
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
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      const amountMinor = 1000;
      const expectedKey = computeKey("phonepe-token", "tenant-a", "order-123", amountMinor, "INR");
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
      expect(invalidateKeyMock).toHaveBeenNthCalledWith(1, expectedKey, "phonepe_token_url");
      expect(invalidateKeyMock).toHaveBeenNthCalledWith(2, computeKey("phonepe-payment", "tenant-a", "order-123", amountMinor, "INR"), "create_payment");
      expect(mockPaymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: "generated-key" }),
        "tenant-a",
        "phonepe",
        { idempotencyKeyOverride: "generated-key" }
      );
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledTimes(1);
      expect(res.jsonPayload.success).toBe(true);
      expect(res.jsonPayload.data.tokenUrl).toBe(paymentResult.redirectUrl);
    });

    it("refreshes the payment idempotency key when retrying an expired token URL", async () => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const firstResult = {
        ...buildPaymentResult(),
        redirectUrl: "https://phonepe.example/initial",
        paymentId: "pay_initial",
      };
      const refreshedResult = {
        ...buildPaymentResult(),
        redirectUrl: "https://phonepe.example/refreshed",
        paymentId: "pay_refreshed",
      };

      mockPaymentsService.createPayment
        .mockResolvedValueOnce(firstResult)
        .mockResolvedValueOnce(refreshedResult);

      const request = buildTokenRequest();
      const firstResponse = createMockResponse();
      await handler(request, firstResponse, () => {});

      expect(firstResponse.jsonPayload.data.tokenUrl).toBe("https://phonepe.example/initial");
      const amountMinor = 1000;
      const expectedTokenKey = computeKey("phonepe-token", "tenant-a", "order-123", amountMinor, "INR");
      const expectedPaymentKey = computeKey("phonepe-payment", "tenant-a", "order-123", amountMinor, "INR");

      const cachedPayload = idempotencyCache.get(`phonepe_token_url:${expectedTokenKey}`);
      cachedPayload.data.expiresAt = new Date(Date.now() - 1).toISOString();
      idempotencyCache.set(`phonepe_token_url:${expectedTokenKey}`, cachedPayload);
      idempotencyCache.set(`create_payment:${expectedPaymentKey}`, { success: true });

      const secondResponse = createMockResponse();
      await handler(buildTokenRequest(), secondResponse, () => {});

      expect(mockPaymentsService.createPayment).toHaveBeenCalledTimes(2);
      const secondCall = mockPaymentsService.createPayment.mock.calls[1];
      expect(secondCall[0].idempotencyKey).toBe("generated-key");
      expect(secondCall[3]).toEqual({ idempotencyKeyOverride: "generated-key" });
      expect(secondResponse.jsonPayload.data.paymentId).toBe("pay_refreshed");
      expect(secondResponse.jsonPayload.data.tokenUrl).toBe("https://phonepe.example/refreshed");
      expect(invalidateKeyMock).toHaveBeenCalledWith(expectedPaymentKey, "create_payment");
    });

    it("derives a deterministic idempotency key from the tenant, order, and amount", async () => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(
        buildOrderRecord({ amountMinor: 2599, currency: "USD" })
      );
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      const req = buildTokenRequest({ body: { amount: 25.99, currency: "USD" } });
      const res = createMockResponse();
      await handler(req, res, () => {});

      const expectedAmountMinor = 2599;
      const expectedTokenKey = computeKey("phonepe-token", "tenant-a", "order-123", expectedAmountMinor, "USD");
      const expectedPaymentKey = computeKey("phonepe-payment", "tenant-a", "order-123", expectedAmountMinor, "USD");

      expect(mockPaymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: expectedPaymentKey,
          orderAmount: expectedAmountMinor,
          currency: "USD",
        }),
        "tenant-a",
        "phonepe",
        undefined
      );
      expect(executeWithIdempotencyMock).toHaveBeenCalledWith(
        expectedTokenKey,
        "phonepe_token_url",
        expect.any(Function)
      );
      expect(res.jsonPayload.data.expiresAt).toBeTruthy();
    });

    it("rejects tampered amount payloads and logs an audit event", async () => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const req = buildTokenRequest({ body: { amount: 12 } });
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order amount or currency mismatch" });
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledWith(paymentEvents);
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "token_url.payload_mismatch",
          data: expect.objectContaining({
            orderId: "order-123",
            amountMismatch: true,
            currencyMismatch: false,
            expectedAmountMinor: 1000,
            expectedCurrency: "INR",
            receivedAmountMinor: 1200,
            receivedCurrency: "INR",
          }),
        })
      );
    });

    it("rejects tampered currency payloads and logs an audit event", async () => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const req = buildTokenRequest({ body: { currency: "USD" } });
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order amount or currency mismatch" });
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledWith(paymentEvents);
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "token_url.payload_mismatch",
          data: expect.objectContaining({
            orderId: "order-123",
            amountMismatch: false,
            currencyMismatch: true,
            expectedAmountMinor: 1000,
            expectedCurrency: "INR",
            receivedAmountMinor: 1000,
            receivedCurrency: "USD",
          }),
        })
      );
    });
  });

  describe("POST /api/payments/phonepe/retry", () => {
    it("validates payload shape", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = { body: {}, headers: { 'x-tenant-id': 'tenant-a' } } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request data" }));
    });

    it("returns 404 when order is missing", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = { body: { orderId: "missing" }, headers: { 'x-tenant-id': 'tenant-a' } } as unknown as Request;
      const res = createMockResponse();

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(null);

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not found" });
    });

    it("rejects when the latest job has not expired", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = { body: { orderId: "order-123" }, headers: { 'x-tenant-id': 'tenant-a' } } as unknown as Request;
      const res = createMockResponse();

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(buildOrderRecord());
      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValueOnce(buildPhonePeJob({ status: "pending" }));

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PHONEPE_RETRY_NOT_ALLOWED" }));
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
    });

    it("creates a new PhonePe payment when the previous job expired", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");

      const retryOrder = buildOrderRecord({
        paymentStatus: "failed",
        user: { name: "Retry User", email: "retry@example.com", phone: "9999999999" },
      });
      const expiredJob = buildPhonePeJob({ status: "expired", attempt: 5 });
      const scheduledJob = buildPhonePeJob({ status: "pending", attempt: 0, paymentId: "pay_new" });

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(retryOrder);
      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValueOnce(expiredJob);
      mockPaymentsService.createPayment.mockResolvedValueOnce({
        paymentId: "pay_new",
        providerPaymentId: "merchant_new",
        status: "created",
        amount: retryOrder.amountMinor,
        currency: retryOrder.currency,
        provider: "phonepe",
        providerData: {},
        createdAt: new Date(),
      });
      mockPhonePePollingWorker.registerJob.mockResolvedValueOnce(scheduledJob);

      const whereSpy = vi.fn(async () => ({ rowCount: 1 }));
      const setSpy = vi.fn(() => ({ where: whereSpy }));
      updateMock.mockReturnValueOnce({ set: setSpy });

      const res = buildResponse();
      const req = { body: { orderId: "order-123" }, headers: { 'x-tenant-id': 'tenant-a' } } as unknown as Request;

      await handler(req, res, () => {});

      expect(mockPaymentsService.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: "order-123",
          metadata: expect.objectContaining({
            createdVia: "phonepe-retry",
            previousPaymentId: expiredJob.paymentId,
            previousMerchantTransactionId: expiredJob.merchantTransactionId,
          }),
        }),
        "tenant-a",
        "phonepe"
      );
      expect(mockPhonePePollingWorker.registerJob).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: "pay_new",
          orderId: "order-123",
        })
      );
      expect(updateMock).toHaveBeenCalledWith(orders);
      expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: "processing" }));
      expect(whereSpy).toHaveBeenCalled();

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          paymentId: "pay_new",
          order: expect.objectContaining({ paymentStatus: "processing" }),
          reconciliation: expect.objectContaining({ status: "pending" }),
        }),
      }));
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
