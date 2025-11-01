import { createHash } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Router } from "express";
import { orders, paymentEvents } from "../../../shared/schema";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";
import type { RequireAdminMiddleware } from "../types";

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
const findPaymentMock = vi.fn();

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
  items: [
    {
      id: "item-1",
      productId: "product-1",
      quantity: 1,
      price: "10.00",
      product: {
        id: "product-1",
        name: "Sample Product",
        displayImageUrl: null,
        imageUrl: null,
      },
    },
  ],
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
    query: {
      payments: {
        findFirst: findPaymentMock,
      },
    },
  },
}));

describe("payments router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyCache.clear();
    mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValue(null);
    mockPhonePePollingStore.markExpired.mockResolvedValue(null);
    mockPhonePePollingWorker.registerJob.mockResolvedValue({});
    findPaymentMock.mockReset();
    findPaymentMock.mockResolvedValue(null);
  });

  const defaultRequireAdmin: RequireAdminMiddleware = (_req, _res, next) => {
    next();
  };

  const buildRouter = async (requireAdminOverride?: RequireAdminMiddleware) => {
    const module = await import("../payments");
    return module.createPaymentsRouter(requireAdminOverride ?? defaultRequireAdmin);
  };

  const getRouteHandler = (router: Router, method: "get" | "post", path: string) => {
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
    );
    if (!layer) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    }
    const handles = layer.route.stack;
    const target = handles[handles.length - 1];
    return target.handle as (req: Request, res: Response, next: () => void) => Promise<void> | void;
  };

  const getRouteLayer = (router: Router, method: "get" | "post", path: string) => {
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
    );
    if (!layer) {
      throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
    }
    return layer;
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
      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(buildOrderRecord());
      mockPaymentsService.createPayment.mockResolvedValue({
        paymentId: "pay_1",
        status: "created",
        amount: 1000,
        currency: "INR",
        provider: "phonepe",
        providerPaymentId: "mtid",
        redirectUrl: "https://example.com",
        providerOrderId: "order-merchant",
        environment: "test",
        providerData: { token: "sensitive" },
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
        expect.objectContaining({
          idempotencyKey: "key-123",
          orderAmount: 1000,
          currency: "INR",
        }),
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
      expect(insertMock).toHaveBeenCalledWith(paymentEvents);
      expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.any(String),
        provider: "phonepe",
        type: "payment.create.succeeded",
        data: expect.objectContaining({ providerData: { token: "sensitive" } }),
      }));
      expect(res.jsonPayload).toEqual({
        success: true,
        data: expect.objectContaining({
          paymentId: "pay_1",
          providerPaymentId: "mtid",
          providerOrderId: "order-merchant",
          status: "created",
          amount: 1000,
          currency: "INR",
          provider: "phonepe",
          redirectUrl: "https://example.com",
        }),
      });
      expect(res.jsonPayload.data).not.toHaveProperty("providerData");
    });

    it("rejects payloads that do not match the stored order totals", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/create");
      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(buildOrderRecord({ amountMinor: 1000, currency: "INR" }));

      const req = {
        headers: { "idempotency-key": "key-123" },
        body: {
          orderId: "order-123",
          amount: 12, // does not match stored amount of 1000 minor units (10 major)
          currency: "USD",
        },
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order amount or currency mismatch" });
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
      expect(insertMock).toHaveBeenCalledWith(paymentEvents);
      expect(insertValuesMock).toHaveBeenCalledWith(expect.objectContaining({
        provider: "unknown",
        type: "payment.create.payload_mismatch",
        data: expect.objectContaining({
          expectedAmountMinor: 1000,
          expectedCurrency: "INR",
          receivedCurrency: "USD",
        }),
      }));
    });
  });

  describe("POST /api/payments/token-url", () => {
    const computeKey = (
      prefix: "phonepe-token" | "phonepe-payment",
      tenant: string,
      orderId: string,
      amountMinor: number,
      currency: string,
      instrument: string,
      payPageType: string,
      rawInstrument?: string,
    ) => {
      const hash = createHash("sha256");
      const normalizedRawInstrument = typeof rawInstrument === "string"
        ? rawInstrument.trim().toUpperCase().replace(/[\s-]+/g, "_")
        : undefined;
      const normalizedPayPageType = payPageType.toUpperCase();
      const components = [
        tenant,
        orderId,
        amountMinor.toString(),
        currency,
        instrument,
        normalizedPayPageType,
      ];

      if (normalizedRawInstrument && normalizedRawInstrument !== instrument) {
        components.push(normalizedRawInstrument);
      }

      hash.update(components.join(":"));
      return `${prefix}:${hash.digest("hex")}`;
    };

    const buildTokenRequest = (overrides: { body?: any; headers?: Record<string, string> } = {}) => {
      const baseBody = {
        orderId: "order-123",
        amount: 10,
        currency: "INR",
        customer: {},
        instrumentPreference: "UPI_INTENT",
        payPageType: "IFRAME",
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
      const expectedKey = computeKey(
        "phonepe-token",
        "tenant-a",
        "order-123",
        1000,
        "INR",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );
      expect(executeWithIdempotencyMock).toHaveBeenCalledWith(
        expectedKey,
        "phonepe_token_url",
        expect.any(Function)
      );

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
      const expectedKey = computeKey(
        "phonepe-token",
        "tenant-a",
        "order-123",
        amountMinor,
        "INR",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );
      const expiredPayload = {
        success: true,
        data: {
          tokenUrl: "https://old.example/token",
          paymentId: "pay_0",
          merchantTransactionId: "merchant-0",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
        metadata: {
          effectiveInstrument: "UPI_INTENT",
          requestedInstrument: "UPI_INTENT",
          payPageType: "IFRAME",
          payPage: "IFRAME",
          cacheExpiresAt: new Date(Date.now() - 1000).toISOString(),
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
      expect(invalidateKeyMock).toHaveBeenNthCalledWith(
        2,
        computeKey(
          "phonepe-payment",
          "tenant-a",
          "order-123",
          amountMinor,
          "INR",
          "UPI_INTENT",
          "IFRAME",
          "UPI_INTENT",
        ),
        "create_payment"
      );
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
      const expectedTokenKey = computeKey(
        "phonepe-token",
        "tenant-a",
        "order-123",
        amountMinor,
        "INR",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );
      const expectedPaymentKey = computeKey(
        "phonepe-payment",
        "tenant-a",
        "order-123",
        amountMinor,
        "INR",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );

      const cachedPayload = idempotencyCache.get(`phonepe_token_url:${expectedTokenKey}`);
      cachedPayload.data.expiresAt = new Date(Date.now() - 1).toISOString();
      cachedPayload.metadata = {
        effectiveInstrument: "UPI_INTENT",
        requestedInstrument: "UPI_INTENT",
        payPageType: "IFRAME",
        payPage: "IFRAME",
        cacheExpiresAt: new Date(Date.now() - 1).toISOString(),
      };
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

    it("generates a new idempotency key when the instrument preference changes", async () => {
      mockOrdersRepository.getOrderWithPayments
        .mockResolvedValueOnce(buildOrderRecord())
        .mockResolvedValueOnce(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const firstResult = { ...buildPaymentResult(), paymentId: "pay_intent" };
      const secondResult = { ...buildPaymentResult(), paymentId: "pay_qr", redirectUrl: "https://phonepe.example/qr" };

      mockPaymentsService.createPayment
        .mockResolvedValueOnce(firstResult)
        .mockResolvedValueOnce(secondResult);

      const intentResponse = createMockResponse();
      await handler(buildTokenRequest({ body: { instrumentPreference: "UPI_INTENT" } }), intentResponse, () => {});

      const qrResponse = createMockResponse();
      await handler(buildTokenRequest({ body: { instrumentPreference: "UPI_QR" } }), qrResponse, () => {});

      expect(mockPaymentsService.createPayment).toHaveBeenCalledTimes(2);
      expect(intentResponse.jsonPayload.data.paymentId).toBe("pay_intent");
      expect(qrResponse.jsonPayload.data.paymentId).toBe("pay_qr");

      const firstKey = executeWithIdempotencyMock.mock.calls[0]?.[0];
      const secondKey = executeWithIdempotencyMock.mock.calls[1]?.[0];

      expect(firstKey).toBeDefined();
      expect(secondKey).toBeDefined();
      expect(secondKey).not.toEqual(firstKey);
    });

    it("produces a different idempotency key when the amount changes", async () => {
      mockOrdersRepository.getOrderWithPayments
        .mockResolvedValueOnce(buildOrderRecord())
        .mockResolvedValueOnce(buildOrderRecord({ amountMinor: 1500, total: "15.00" }));
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const firstResult = { ...buildPaymentResult(), paymentId: "pay_1000" };
      const secondResult = { ...buildPaymentResult(), paymentId: "pay_1500", redirectUrl: "https://phonepe.example/15" };

      mockPaymentsService.createPayment
        .mockResolvedValueOnce(firstResult)
        .mockResolvedValueOnce(secondResult);

      const firstRes = createMockResponse();
      await handler(buildTokenRequest(), firstRes, () => {});

      const secondRes = createMockResponse();
      await handler(buildTokenRequest({ body: { amount: 15 } }), secondRes, () => {});

      const firstKey = executeWithIdempotencyMock.mock.calls[0]?.[0];
      const secondKey = executeWithIdempotencyMock.mock.calls[1]?.[0];

      expect(firstKey).toBeDefined();
      expect(secondKey).toBeDefined();
      expect(secondKey).not.toEqual(firstKey);
      expect(secondRes.jsonPayload.data.paymentId).toBe("pay_1500");
      expect(secondRes.jsonPayload.data.tokenUrl).toBe("https://phonepe.example/15");
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
      const expectedTokenKey = computeKey(
        "phonepe-token",
        "tenant-a",
        "order-123",
        expectedAmountMinor,
        "USD",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );
      const expectedPaymentKey = computeKey(
        "phonepe-payment",
        "tenant-a",
        "order-123",
        expectedAmountMinor,
        "USD",
        "UPI_INTENT",
        "IFRAME",
        "UPI_INTENT",
      );

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

    it("threads the requested PhonePe instrument into the provider options", async () => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(buildOrderRecord());
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/token-url");

      const paymentResult = buildPaymentResult();
      mockPaymentsService.createPayment.mockResolvedValue(paymentResult);

      const req = buildTokenRequest({ body: { instrumentPreference: "UPI_QR" } });
      const res = createMockResponse();
      await handler(req, res, () => {});

      const [params] = mockPaymentsService.createPayment.mock.calls.at(-1) ?? [];
      expect(params?.providerOptions?.phonepe?.instrumentPreference).toBe("UPI_QR");
      expect(params?.providerOptions?.phonepe?.payPageType).toBe("IFRAME");
      expect(params?.providerOptions?.phonepe?.payPage).toBe("IFRAME");
      expect(params?.metadata?.payPage).toBe("IFRAME");
      expect(res.jsonPayload.success).toBe(true);
    });
  });

  describe("POST /api/payments/cancel", () => {
    it("requires authentication", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/cancel");
      const req = {
        body: { paymentId: "pay_1", orderId: "order-123" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: {} as any,
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(mockOrdersRepository.getOrderWithPayments).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/payments/phonepe/retry", () => {
    it("requires an authenticated session", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = {
        body: { orderId: "order-123" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: {} as any,
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
      expect(mockOrdersRepository.getOrderWithPayments).not.toHaveBeenCalled();
    });

    it("validates payload shape", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = {
        body: {},
        headers: { 'x-tenant-id': 'tenant-a' },
        session: { userId: "user-1", userRole: "buyer" },
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: "Invalid request data" }));
    });

    it("returns 404 when order is missing", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = {
        body: { orderId: "missing" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: { userId: "user-1", userRole: "buyer" },
      } as unknown as Request;
      const res = createMockResponse();

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(null);

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not found" });
    });

    it("rejects when the latest job has not expired", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = {
        body: { orderId: "order-123" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: { userId: "user-1", userRole: "buyer" },
      } as unknown as Request;
      const res = createMockResponse();

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(buildOrderRecord());
      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValueOnce(buildPhonePeJob({ status: "pending" }));

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "PHONEPE_RETRY_NOT_ALLOWED" }));
      expect(mockPaymentsService.createPayment).not.toHaveBeenCalled();
    });

    it("returns 403 when the order belongs to a different buyer", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/phonepe/retry");
      const req = {
        body: { orderId: "order-123" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: { userId: "user-2", userRole: "buyer" },
      } as unknown as Request;
      const res = createMockResponse();

      mockOrdersRepository.getOrderWithPayments.mockResolvedValueOnce(buildOrderRecord({ userId: "user-1" }));

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not accessible" });
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
      const req = {
        body: { orderId: "order-123" },
        headers: { 'x-tenant-id': 'tenant-a' },
        session: { userId: "user-1", userRole: "buyer" },
      } as unknown as Request;

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

  describe("POST /api/payments/refunds", () => {
    it("requires authentication", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/refunds");
      const req = {
        body: {
          paymentId: "pay_1",
          amount: 10,
          merchantRefundId: "refund-123",
        },
        headers: {
          'x-tenant-id': 'tenant-a',
          'idempotency-key': 'key-123',
        },
        session: {} as any,
      } as unknown as Request;
      const res = createMockResponse();

      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(findPaymentMock).not.toHaveBeenCalled();
      expect(mockPaymentsService.createRefund).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/payments/status/:paymentId", () => {
    const resolveHandlers = async () => {
      const router = await buildRouter();
      const layer = getRouteLayer(router, "get", "/status/:paymentId");
      const handlers = layer.route.stack.map((stack: any) => stack.handle);
      return {
        authMiddleware: handlers[0],
        handler: handlers[handlers.length - 1],
      };
    };

    const buildReqRes = (sessionOverrides: Record<string, any> = {}, headerOverrides: Record<string, string> = {}) => {
      const req = {
        params: { paymentId: "pay-1" },
        headers: headerOverrides,
        session: {
          userRole: "buyer",
          userId: "user-1",
          ...sessionOverrides,
        },
      } as unknown as Request;
      const res = createMockResponse();
      return { req, res };
    };

    beforeEach(() => {
      mockPaymentsService.verifyPayment.mockReset();
      mockPaymentsService.verifyPayment.mockResolvedValue({
        paymentId: "pay-1",
        status: "COMPLETED",
        amount: 1000,
        currency: "INR",
        provider: "phonepe",
        method: "upi",
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    it("returns 401 when no authenticated session exists", async () => {
      const { authMiddleware, handler } = await resolveHandlers();
      const { req, res } = buildReqRes({ userRole: undefined, userId: undefined });

      let handlerCalled = false;
      authMiddleware(req, res as Response, () => {
        handlerCalled = true;
        return handler(req, res as Response, () => {});
      });

      expect(handlerCalled).toBe(false);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(findPaymentMock).not.toHaveBeenCalled();
      expect(mockPaymentsService.verifyPayment).not.toHaveBeenCalled();
    });

    it("rejects requests for orders owned by another buyer", async () => {
      findPaymentMock.mockResolvedValue({
        id: "pay-1",
        tenantId: "default",
        order: {
          id: "order-1",
          tenantId: "default",
          userId: "user-2",
        },
      });

      const { authMiddleware, handler } = await resolveHandlers();
      const { req, res } = buildReqRes();

      await new Promise<void>((resolve, reject) => {
        let nextCalled = false;
        const next = (err?: any) => {
          if (err) {
            reject(err);
            return;
          }
          nextCalled = true;
          Promise.resolve(handler(req, res as Response, () => {}))
            .then(resolve)
            .catch(reject);
        };

        Promise.resolve(authMiddleware(req, res as Response, next))
          .then(() => {
            if (!nextCalled) {
              resolve();
            }
          })
          .catch(reject);
      });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not accessible" });
      expect(mockPaymentsService.verifyPayment).not.toHaveBeenCalled();
    });

    it("allows admins to verify status without buyer ownership", async () => {
      findPaymentMock.mockResolvedValue({
        id: "pay-1",
        tenantId: "default",
        order: {
          id: "order-1",
          tenantId: "default",
          userId: "user-2",
        },
      });

      const { authMiddleware, handler } = await resolveHandlers();
      const { req, res } = buildReqRes({ userRole: "admin", adminId: "admin-1", userId: undefined });

      await new Promise<void>((resolve, reject) => {
        authMiddleware(req, res as Response, (err?: any) => {
          if (err) {
            reject(err);
            return;
          }
          Promise.resolve(handler(req, res as Response, () => {}))
            .then(resolve)
            .catch(reject);
        });
      });

      expect(mockPaymentsService.verifyPayment).toHaveBeenCalledWith({ paymentId: "pay-1" }, "default");
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe("GET /api/payments/order-info/:orderId", () => {
    const baseOrder = {
      id: "order-1",
      tenantId: "default",
      userId: "user-1",
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
      items: [
        {
          id: "item-1",
          productId: "product-1",
          quantity: 2,
          price: "50.00",
          product: {
            id: "product-1",
            name: "Sample Product",
            displayImageUrl: null,
            imageUrl: null,
          },
        },
      ],
      user: {},
      deliveryAddress: {},
      offer: { influencerId: "inf-1" },
    };

    const invoke = async (
      orderOverrides: Partial<typeof baseOrder>,
      sessionOverrides: Record<string, any> = {},
      headerOverrides: Record<string, string> = {},
    ) => {
      mockOrdersRepository.getOrderWithPayments.mockResolvedValue({
        ...baseOrder,
        ...orderOverrides,
      });
      const router = await buildRouter();
      const layer = getRouteLayer(router, "get", "/order-info/:orderId");
      const handlers = layer.route.stack.map((stack: any) => stack.handle);
      const authMiddleware = handlers[0];
      const handler = handlers[handlers.length - 1];
      const res = createMockResponse();
      const req = {
        params: { orderId: "order-1" },
        headers: headerOverrides,
        session: {
          userRole: "buyer",
          userId: "user-1",
          ...sessionOverrides,
        },
      } as unknown as Request;

      await new Promise<void>((resolve, reject) => {
        let nextCalled = false;
        const next = (err?: any) => {
          if (err) {
            reject(err);
            return;
          }
          nextCalled = true;
          Promise.resolve(handler(req, res as Response, () => {}))
            .then(() => resolve())
            .catch(reject);
        };

        Promise.resolve(authMiddleware(req, res as Response, next))
          .then(() => {
            if (!nextCalled) {
              resolve();
            }
          })
          .catch(reject);
      });

      return res;
    };

    it("requires authentication", async () => {
      const res = await invoke({}, { userRole: undefined, userId: undefined });

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(mockOrdersRepository.getOrderWithPayments).not.toHaveBeenCalled();
    });

    it("rejects access to orders from another tenant", async () => {
      const res = await invoke({ tenantId: "tenant-b" });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not accessible" });
    });

    it("rejects buyers accessing another user's order", async () => {
      const res = await invoke({ userId: "user-2" });

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not accessible" });
    });

    it("allows admins to view any order", async () => {
      const res = await invoke(
        { userId: "user-2" },
        { userRole: "admin", adminId: "admin-1", userId: undefined },
      );

      expect(res.jsonPayload.order.id).toBe("order-1");
    });

    it("allows influencers to view orders tied to their offers", async () => {
      const res = await invoke(
        { offer: { influencerId: "inf-9" } },
        { userRole: "influencer", influencerId: "inf-9", userId: undefined },
      );

      expect(res.jsonPayload.order.id).toBe("order-1");
    });

    it("blocks influencers from unrelated orders", async () => {
      const res = await invoke(
        { offer: { influencerId: "inf-2" } },
        { userRole: "influencer", influencerId: "inf-9", userId: undefined },
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Order not accessible" });
    });

    it("returns pending status when no payments exist", async () => {
      const res = await invoke({ payments: [] });

      expect(res.jsonPayload.order.paymentStatus).toBe("pending");
      expect(res.jsonPayload.order.items).toEqual([
        expect.objectContaining({
          id: "item-1",
          productId: "product-1",
          quantity: 2,
          price: "50.00",
          name: "Sample Product",
          imageUrl: null,
        }),
      ]);
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
        refunds: [],
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

    it("exposes masked refund records for completed payments", async () => {
      const now = new Date("2024-01-01T00:05:00Z");
      const payment = {
        id: "pay_with_refund",
        status: "COMPLETED",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 1000,
        amountRefundedMinor: 300,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: phonePeIdentifierFixture.utr,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        receiptUrl: "https://receipt",
        createdAt: now,
        updatedAt: now,
        refunds: [
          {
            id: "refund_1",
            paymentId: "pay_with_refund",
            provider: "phonepe",
            providerRefundId: "provider_refund",
            merchantRefundId: "merchant_refund",
            originalMerchantOrderId: "merchant_order",
            amountMinor: 300,
            status: "completed",
            reason: "duplicate",
            upiUtr: phonePeIdentifierFixture.utr,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      const res = await invoke({
        paymentStatus: "paid",
        status: "confirmed",
        payments: [payment],
      });

      expect(res.jsonPayload.payment.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
      expect(res.jsonPayload.transactions[0].refunds[0]).toMatchObject({
        amountMinor: 300,
        merchantRefundId: "merchant_refund",
        originalMerchantOrderId: "merchant_order",
        upiUtr: phonePeIdentifierFixture.maskedUtr,
      });
      expect(res.jsonPayload.latestTransaction.refunds[0]).toMatchObject({
        id: "refund_1",
        amountMinor: 300,
      });
      expect(res.jsonPayload.payment.refunds[0]).toMatchObject({
        providerRefundId: "provider_refund",
        amount: "3.00",
      });
      expect(res.jsonPayload.refunds[0]).toMatchObject({
        paymentId: "pay_with_refund",
        amountMinor: 300,
        upiUtr: phonePeIdentifierFixture.maskedUtr,
      });
      expect(res.jsonPayload.refunds).toHaveLength(1);
      expect(res.jsonPayload.totals.refundedMinor).toBe(300);
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

  describe("GET /api/payments/admin/phonepe/orders/:orderId", () => {
    it("returns PhonePe state, instrument details, and reconciliation markers", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "get", "/admin/phonepe/orders/:orderId");

      const phonePePayment = {
        id: "pay_1",
        provider: "phonepe",
        status: "processing",
        providerPaymentId: "merchant-1",
        providerReferenceId: "merchant-1",
        providerTransactionId: "pg-1",
        upiPayerHandle: phonePeIdentifierFixture.vpa,
        upiUtr: phonePeIdentifierFixture.utr,
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 0,
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-01-01T00:01:00Z"),
      };

      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(
        buildOrderRecord({ payments: [phonePePayment] })
      );

      mockPaymentsService.verifyPayment.mockResolvedValue({
        paymentId: "pay_1",
        providerPaymentId: "merchant-1",
        providerOrderId: "pg-1",
        status: "completed",
        amount: 1000,
        currency: "INR",
        provider: "phonepe",
        environment: "test",
        providerData: {
          state: "COMPLETED",
          responseCode: "SUCCESS",
          utr: phonePeIdentifierFixture.utr,
          upiPayerHandle: phonePeIdentifierFixture.vpa,
          paymentInstrument: {
            type: phonePeIdentifierFixture.variant,
            utr: phonePeIdentifierFixture.utr,
            payerVpa: phonePeIdentifierFixture.vpa,
            payerAddress: phonePeIdentifierFixture.vpa,
          },
        },
        createdAt: new Date("2024-01-01T00:02:00Z"),
        updatedAt: new Date("2024-01-01T00:02:30Z"),
      });

      const reconciliationJob = buildPhonePeJob({
        status: "pending",
        attempt: 2,
        lastStatus: "PENDING",
        lastResponseCode: "PAYMENT_PENDING",
      });

      mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValue(reconciliationJob);

      const req = {
        params: { orderId: "order-123" },
        headers: {},
        session: { adminId: "admin-1", userRole: "admin" },
      } as unknown as Request;

      const res = createMockResponse();
      await handler(req, res, () => {});

      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();

      const payload = res.jsonPayload;
      expect(payload.success).toBe(true);
      expect(payload.data.merchantTransactionId).toBe("merchant-1");
      expect(payload.data.paymentId).toBe("pay_1");
      expect(payload.data.tenantId).toBe("tenant-a");
      expect(payload.data.instrument.utr).toBe(phonePeIdentifierFixture.utr);
      expect(payload.data.instrument.utrMasked).toBe(phonePeIdentifierFixture.maskedUtr);
      expect(payload.data.instrument.payerHandle).toBe(phonePeIdentifierFixture.vpa);
      expect(payload.data.instrument.payerHandleMasked).toBe(phonePeIdentifierFixture.maskedVpa);
      expect(payload.data.instrument.variant).toBe(phonePeIdentifierFixture.variant);
      expect(payload.data.instrument.variantLabel).toBe(phonePeIdentifierFixture.label);
      expect(payload.data.recordedPayment.upiPayerHandle).toBe(phonePeIdentifierFixture.maskedVpa);
      expect(payload.data.recordedPayment.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
      expect(payload.data.reconciliation?.status).toBe("pending");
      expect(payload.data.reconciliation?.attempt).toBe(2);
      expect(payload.data.reconciliation?.lastStatus).toBe("PENDING");
      expect(payload.data.reconciliation?.lastResponseCode).toBe("PAYMENT_PENDING");
      expect(payload.data.reconciliation?.nextPollAt).toBe(reconciliationJob.nextPollAt.toISOString());
      expect(payload.data.reconciliation?.expiresAt).toBe(reconciliationJob.expireAt.toISOString());
      expect(payload.data.reconciliation?.completedAt).toBeUndefined();
      expect(payload.data.reconciliation?.lastPolledAt).toBeUndefined();
      expect(payload.data.verifiedAt).toBe("2024-01-01T00:02:30.000Z");
      expect(mockPaymentsService.verifyPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: "pay_1",
          providerPaymentId: "merchant-1",
          providerData: expect.objectContaining({ merchantTransactionId: "merchant-1" }),
        }),
        "tenant-a",
      );
      expect(mockPhonePePollingStore.getLatestJobForOrder).toHaveBeenCalledWith("order-123", "tenant-a");
    });

    it("responds with 404 when no PhonePe attempts exist for the order", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "get", "/admin/phonepe/orders/:orderId");

      mockOrdersRepository.getOrderWithPayments.mockResolvedValue(
        buildOrderRecord({
          payments: [
            {
              id: "pay_other",
              provider: "stripe",
              status: "succeeded",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 1000,
              createdAt: new Date("2024-01-01T00:00:00Z"),
              updatedAt: new Date("2024-01-01T00:01:00Z"),
            },
          ],
        })
      );

      const req = {
        params: { orderId: "order-456" },
        headers: {},
        session: { adminId: "admin-1", userRole: "admin" },
      } as unknown as Request;

      const res = createMockResponse();
      await handler(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: "PhonePe payment not found for order" });
      expect(mockPaymentsService.verifyPayment).not.toHaveBeenCalled();
    });

    it("enforces admin authentication before processing the lookup", async () => {
      const requireAdminMock = vi.fn<Parameters<RequireAdminMiddleware>, void>((_req, res) => {
        res.status(403).json({ error: "Forbidden" });
      });

      const router = await buildRouter(requireAdminMock);
      const layer = getRouteLayer(router, "get", "/admin/phonepe/orders/:orderId");

      const [adminMiddleware] = layer.route.stack;
      expect(adminMiddleware.handle).toBe(requireAdminMock);

      const req = {
        params: { orderId: "order-unauthorized" },
        headers: {},
        session: {},
      } as unknown as Request;

      const res = createMockResponse();
      const next = vi.fn();

      await Promise.resolve(adminMiddleware.handle(req, res, next));

      expect(requireAdminMock).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden" });
      expect(mockOrdersRepository.getOrderWithPayments).not.toHaveBeenCalled();
      expect(mockPaymentsService.verifyPayment).not.toHaveBeenCalled();
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
