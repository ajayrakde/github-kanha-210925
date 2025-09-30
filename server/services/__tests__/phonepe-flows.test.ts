import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { payments, orders, paymentEvents } from "../../../shared/schema";
import {
  phonePeCreatePayment,
  phonePeImmediateCapture,
  phonePeWebhookCaptured,
  phonePeWebhookCancelled,
  phonePeWebhookExpired,
  phonePeWebhookTamperedAmount,
  phonePeWebhookReplayPayload,
} from "./__fixtures__/phonepe-upi";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const selectQueue: any[][] = [];
const transactionSelectQueues: any[][] = [];
const insertCalls: Array<{ table: any; values: any; inTransaction: boolean }> = [];
const updateCalls: Array<{ table: any; data: any; inTransaction: boolean; rowCount: number }> = [];
const updateRowCounts: number[] = [];

const createSelectBuilder = (queue: any[][]) =>
  vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => queue.shift() ?? []),
      })),
    })),
  }));

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => selectQueue.shift() ?? []),
    })),
  })),
}));

const insertMock = vi.fn((table: any) => ({
  values: vi.fn(async (values: any) => {
    insertCalls.push({ table, values, inTransaction: false });
    return { rowCount: 1 };
  }),
}));

const updateMock = vi.fn((table: any) => ({
  set: vi.fn((data: any) => ({
    where: vi.fn(async () => {
      const rowCount = updateRowCounts.length ? updateRowCounts.shift()! : 1;
      updateCalls.push({ table, data, inTransaction: false, rowCount });
      return { rowCount };
    }),
  })),
}));

const deleteMock = vi.fn(() => ({
  where: vi.fn(async () => ({ rowCount: 0 })),
}));

const transactionMock = vi.fn(async (callback: (trx: any) => Promise<any>) => {
  const queue = transactionSelectQueues.shift() ?? [];
  const trxSelect = createSelectBuilder(queue);
  const trxInsert = vi.fn((table: any) => ({
    values: vi.fn(async (values: any) => {
      insertCalls.push({ table, values, inTransaction: true });
      return { rowCount: 1 };
    }),
  }));
  const trxUpdate = vi.fn((table: any) => ({
    set: vi.fn((data: any) => ({
      where: vi.fn(async () => {
        const rowCount = updateRowCounts.length ? updateRowCounts.shift()! : 1;
        updateCalls.push({ table, data, inTransaction: true, rowCount });
        return { rowCount };
      }),
    })),
  }));

  return await callback({
    select: trxSelect,
    insert: trxInsert,
    update: trxUpdate,
  });
});

vi.mock("../../db", () => ({
  db: {
    transaction: transactionMock,
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  },
}));

const adapter = {
  provider: "phonepe" as const,
  createPayment: vi.fn(),
  verifyPayment: vi.fn(),
  capturePayment: vi.fn(),
  verifyWebhook: vi.fn(),
};

const getAdapterWithFallbackMock = vi.fn(async () => adapter);
const getPrimaryAdapterMock = vi.fn(async () => adapter);
const createAdapterMock = vi.fn(async () => adapter);

vi.mock("../adapter-factory", () => ({
  adapterFactory: {
    getAdapterWithFallback: getAdapterWithFallbackMock,
    getPrimaryAdapter: getPrimaryAdapterMock,
    createAdapter: createAdapterMock,
    createAdapterForTenant: vi.fn(),
    getHealthStatus: vi.fn(),
  },
}));

const idempotencyCache = new Map<string, any>();
const executeWithIdempotencyMock = vi.fn(async (key: string, scope: string, operation: () => Promise<any>) => {
  const cacheKey = `${scope}:${key}`;
  if (idempotencyCache.has(cacheKey)) {
    return idempotencyCache.get(cacheKey);
  }
  const result = await operation();
  idempotencyCache.set(cacheKey, result);
  return result;
});
const generateKeyMock = vi.fn(() => "generated-key");

vi.mock("../idempotency-service", () => ({
  idempotencyService: {
    executeWithIdempotency: executeWithIdempotencyMock,
    generateKey: generateKeyMock,
  },
}));

const getEnabledProvidersMock = vi.fn(async () => [{ provider: "phonepe" }]);

vi.mock("../config-resolver", () => ({
  configResolver: {
    getEnabledProviders: getEnabledProvidersMock,
  },
}));

let createPaymentsService: typeof import("../payments-service")["createPaymentsService"];
let PaymentsServiceClass: typeof import("../payments-service")["PaymentsService"];
let createWebhookRouter: typeof import("../webhook-router")["createWebhookRouter"];
let WebhookRouterClass: typeof import("../webhook-router")["WebhookRouter"];

beforeAll(async () => {
  const serviceModule = await import("../payments-service");
  createPaymentsService = serviceModule.createPaymentsService;
  PaymentsServiceClass = serviceModule.PaymentsService;

  const webhookModule = await import("../webhook-router");
  createWebhookRouter = webhookModule.createWebhookRouter;
  WebhookRouterClass = webhookModule.WebhookRouter;
});

const createMockResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonPayload?: any } = {};
  res.status = vi.fn(function (this: Response, code: number) {
    res.statusCode = code;
    return this;
  }) as Response["status"];
  res.json = vi.fn(function (this: Response, payload: any) {
    res.jsonPayload = payload;
    return this;
  }) as Response["json"];
  return res as Response & { statusCode?: number; jsonPayload?: any };
};

const buildRouter = () => {
  (WebhookRouterClass as unknown as { instance?: any }).instance = undefined;
  return createWebhookRouter("test");
};

const buildService = () => {
  (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  return createPaymentsService({ environment: "test", defaultProvider: "phonepe" });
};

const resetMocks = () => {
  selectQueue.length = 0;
  transactionSelectQueues.length = 0;
  insertCalls.length = 0;
  updateCalls.length = 0;
  updateRowCounts.length = 0;
  idempotencyCache.clear();
  adapter.createPayment.mockReset();
  adapter.verifyPayment.mockReset();
  adapter.capturePayment.mockReset();
  adapter.verifyWebhook.mockReset();
  getAdapterWithFallbackMock.mockClear();
  getPrimaryAdapterMock.mockClear();
  createAdapterMock.mockClear();
  selectMock.mockClear();
  insertMock.mockClear();
  updateMock.mockClear();
  deleteMock.mockClear();
  transactionMock.mockClear();
  executeWithIdempotencyMock.mockClear();
  generateKeyMock.mockClear();
  getEnabledProvidersMock.mockClear();
};

beforeEach(() => {
  resetMocks();
  getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
});

const createWebhookRequest = (body: Record<string, any>) => ({
  headers: {},
  body,
}) as unknown as Request;

describe("PhonePe UPI happy path", () => {
  it("processes a successful capture webhook after payment creation", async () => {
    const service = buildService();
    selectQueue.push([]); // No captured payments yet
    transactionSelectQueues.push([]); // insert payment transaction
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);

    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const paymentInsert = insertCalls.find((call) => call.table === payments);
    expect(paymentInsert?.values).toMatchObject({
      orderId: "order-1",
      provider: "phonepe",
      upiPayerHandle: "buyer@upi",
    });

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookCaptured);
    selectQueue.push([]); // No existing webhook replay
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: 0,
        },
      ],
    ]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_success", data: phonePeWebhookCaptured.event?.data }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload).toMatchObject({ status: "processed" });

    const paymentUpdate = updateCalls.find((call) => call.table === payments && call.data.status === "captured");
    expect(paymentUpdate?.data).toMatchObject({
      amountCapturedMinor: phonePeCreatePayment.amount,
      upiPayerHandle: "buyer@upi",
      upiUtr: "UTR1234567",
    });

    const orderUpdate = updateCalls.find((call) => call.table === orders && call.data.paymentStatus === "paid");
    expect(orderUpdate).toBeTruthy();

    const eventLog = insertCalls.filter((call) => call.table === paymentEvents);
    expect(eventLog.length).toBeGreaterThanOrEqual(2); // creation + webhook
  });
});

describe("PhonePe callback/webhook ordering", () => {
  it("promotes the order on callback first and skips duplicate webhook order updates", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);
    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    selectQueue.push([
      {
        id: "pay_test_123",
        provider: "phonepe",
        status: "processing",
        tenantId: "default",
        providerPaymentId: "pg_payment_123",
      },
    ]);
    transactionSelectQueues.push([
      [
        {
          orderId: "order-1",
          currentStatus: "processing",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          provider: "phonepe",
        },
      ],
    ]);
    updateRowCounts.push(1, 1, 1, 0, 1);
    adapter.verifyPayment.mockResolvedValue(phonePeImmediateCapture);

    await service.verifyPayment({ paymentId: "pay_test_123" }, "default");

    const orderUpdateFromCallback = updateCalls.find(
      (call) => call.table === orders && call.inTransaction && call.data.paymentStatus === "paid"
    );
    expect(orderUpdateFromCallback?.rowCount).toBe(1);

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookCaptured);
    selectQueue.push([]);
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: phonePeCreatePayment.amount,
        },
      ],
    ]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_after_callback", data: phonePeWebhookCaptured.event?.data }),
      res
    );

    const secondOrderUpdate = updateCalls
      .filter((call) => call.table === orders && call.data.paymentStatus === "paid")
      .at(-1);
    expect(secondOrderUpdate?.rowCount).toBe(0);
  });

  it("handles webhook-first capture before verify checks", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);
    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookCaptured);
    selectQueue.push([]);
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: 0,
        },
      ],
    ]);
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_webhook_first", data: phonePeWebhookCaptured.event?.data }),
      createMockResponse()
    );

    selectQueue.push([
      {
        id: "pay_test_123",
        provider: "phonepe",
        status: "captured",
        tenantId: "default",
        providerPaymentId: "pg_payment_123",
      },
    ]);
    transactionSelectQueues.push([
      [
        {
          orderId: "order-1",
          currentStatus: "captured",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          provider: "phonepe",
        },
      ],
    ]);
    updateRowCounts.push(1, 0);
    adapter.verifyPayment.mockResolvedValue(phonePeImmediateCapture);

    await service.verifyPayment({ paymentId: "pay_test_123" }, "default");

    const orderUpdates = updateCalls.filter((call) => call.table === orders);
    const latestOrderUpdate = orderUpdates.at(-1);
    expect(latestOrderUpdate?.rowCount).toBe(0);
  });
});

describe("PhonePe exceptional flows", () => {
  it("marks timeout events as cancelled without promoting the order", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);
    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookCancelled);
    selectQueue.push([]);
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: 0,
        },
      ],
    ]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_timeout", data: phonePeWebhookCancelled.event?.data }),
      res
    );

    expect(res.jsonPayload).toMatchObject({ status: "processed" });
    const paymentUpdate = updateCalls.find((call) => call.table === payments && call.data.status === "cancelled");
    expect(paymentUpdate).toBeTruthy();
    const orderUpdate = updateCalls.find((call) => call.table === orders && call.data.paymentStatus === "paid");
    expect(orderUpdate).toBeUndefined();
  });

  it("treats expired events as cancellations", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);
    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookExpired);
    selectQueue.push([]);
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: 0,
        },
      ],
    ]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_expired", data: phonePeWebhookExpired.event?.data }),
      res
    );

    const paymentUpdate = updateCalls.find((call) => call.table === payments && call.data.status === "cancelled");
    expect(paymentUpdate).toBeTruthy();
  });

  it("acknowledges replayed webhooks without adapter verification", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
    selectQueue.push([{ id: "webhook_1" }]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest(phonePeWebhookReplayPayload),
      res
    );

    expect(res.jsonPayload).toEqual({ status: "already_processed" });
    expect(adapter.verifyWebhook).not.toHaveBeenCalled();
  });

  it("caches idempotent create payment calls", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);

    const first = await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const second = await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    expect(first).toBe(second);
    expect(adapter.createPayment).toHaveBeenCalledTimes(1);
  });

  it("flags tampered webhook amounts and avoids order promotion", async () => {
    const service = buildService();
    selectQueue.push([]);
    transactionSelectQueues.push([]);
    adapter.createPayment.mockResolvedValue(phonePeCreatePayment);
    await service.createPayment(
      {
        orderId: "order-1",
        orderAmount: phonePeCreatePayment.amount,
        currency: "INR",
        customer: { id: "cust-1" },
        idempotencyKey: "idem-1",
      },
      "default"
    );

    const router = buildRouter();
    adapter.verifyWebhook.mockResolvedValue(phonePeWebhookTamperedAmount);
    selectQueue.push([]);
    transactionSelectQueues.push([
      [
        {
          id: "pay_test_123",
          orderId: "order-1",
          provider: "phonepe",
          amountAuthorizedMinor: phonePeCreatePayment.amount,
          amountCapturedMinor: 0,
        },
      ],
    ]);

    const res = createMockResponse();
    await router.processWebhook(
      "phonepe",
      createWebhookRequest({ eventId: "evt_tamper", data: phonePeWebhookTamperedAmount.event?.data }),
      res
    );

    const orderUpdate = updateCalls.find((call) => call.table === orders && call.data.paymentStatus === "paid");
    expect(orderUpdate).toBeUndefined();

    const auditLog = insertCalls
      .filter((call) => call.table === paymentEvents)
      .find((call) => call.values.type === "webhook.amount_mismatch");
    expect(auditLog?.values.data).toMatchObject({
      paymentId: "pay_test_123",
      expectedAmountMinor: phonePeCreatePayment.amount,
      receivedAmountMinor: phonePeWebhookTamperedAmount.event?.data?.amountMinor,
    });
  });
});
