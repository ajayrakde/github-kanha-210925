import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Router } from "express";
import { paymentEvents } from "../../../shared/schema";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

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

const executeWithIdempotencyMock = vi.fn(async (_key: string, _scope: string, operation: () => Promise<any>) => {
  return await operation();
});

vi.mock("../../services/idempotency-service", () => ({
  idempotencyService: {
    executeWithIdempotency: executeWithIdempotencyMock,
    generateKey: vi.fn(() => "generated-key"),
    checkKey: vi.fn(async () => ({ exists: false })),
    storeResponse: vi.fn(),
  },
}));

const mockOrdersRepository = {
  getOrderWithPayments: vi.fn(),
};

vi.mock("../../storage", () => ({
  ordersRepository: mockOrdersRepository,
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
    });
  });

  describe("GET /api/payments/order-info/:orderId", () => {
    const baseOrder = {
      id: "order-1",
      status: "pending",
      paymentStatus: "pending",
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
      expect(res.jsonPayload.breakdown).toEqual({
        subtotal: 100,
        discount: 10,
        tax: 8,
        shipping: 20,
        total: 118,
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
        upiPayerHandle: "user@upi",
        upiUtr: null,
        receiptUrl: null,
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
    });

    it("prioritizes captured UPI payment details", async () => {
      const captured = {
        id: "pay_captured",
        status: "captured",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 1000,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: "user@upi",
        upiUtr: "123456",
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
      expect(res.jsonPayload.payment.upiUtr).toBe("123456");
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
        upiPayerHandle: "user@upi",
        upiUtr: null,
        receiptUrl: null,
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:07:00Z"),
      };
      const res = await invoke({
        paymentStatus: "failed",
        payments: [failed],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("failed");
      expect(res.jsonPayload.payment.status).toBe("failed");
      expect(res.jsonPayload.totals.paidMinor).toBe(0);
    });

    it("handles webhook-first captures before order promotion", async () => {
      const captured = {
        id: "pay_captured",
        status: "captured",
        provider: "phonepe",
        methodKind: "upi",
        amountAuthorizedMinor: 1000,
        amountCapturedMinor: 1000,
        amountRefundedMinor: 0,
        providerPaymentId: "mtid",
        providerTransactionId: "txn",
        providerReferenceId: "ref",
        upiPayerHandle: "user@upi",
        upiUtr: "123456",
        receiptUrl: "https://receipt",
        createdAt: new Date("2024-01-01T00:05:00Z"),
        updatedAt: new Date("2024-01-01T00:05:30Z"),
      };
      const res = await invoke({
        paymentStatus: "pending",
        payments: [captured],
      });

      expect(res.jsonPayload.order.paymentStatus).toBe("pending");
      expect(res.jsonPayload.payment.status).toBe("captured");
      expect(res.jsonPayload.totals.paidMinor).toBe(1000);
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
