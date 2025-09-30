import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentEvent, PaymentResult } from "../../../shared/payment-types";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const upiQueryResults: any[][] = [];
const paymentInserts: any[] = [];

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => upiQueryResults.shift() ?? []),
    })),
  })),
}));

const insertValuesMock = vi.fn(async (values: any) => {
  paymentInserts.push(values);
});

const defaultTransactionImplementation = async (callback: (trx: any) => Promise<void>) => {
  await callback({
    insert: vi.fn(() => ({ values: insertValuesMock })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  });
};

const transactionMock = vi.fn(defaultTransactionImplementation);

vi.mock("../../db", () => ({
  db: {
    transaction: transactionMock,
    select: selectMock,
  },
}));

const adapter = {
  provider: "phonepe" as const,
  createPayment: vi.fn<[], Promise<PaymentResult>>(),
};

const getAdapterWithFallbackMock = vi.fn(async () => adapter);
const getPrimaryAdapterMock = vi.fn(async () => adapter);

vi.mock("../adapter-factory", () => ({
  adapterFactory: {
    getAdapterWithFallback: getAdapterWithFallbackMock,
    getPrimaryAdapter: getPrimaryAdapterMock,
    createAdapter: vi.fn(),
    getHealthStatus: vi.fn(),
  },
}));

const executeWithIdempotencyMock = vi.fn();
const generateKeyMock = vi.fn(() => "generated-key");

vi.mock("../idempotency-service", () => ({
  idempotencyService: {
    executeWithIdempotency: executeWithIdempotencyMock,
    generateKey: generateKeyMock,
  },
}));

let createPaymentsService: typeof import("../payments-service")["createPaymentsService"];
let PaymentsServiceClass: typeof import("../payments-service")["PaymentsService"];

beforeAll(async () => {
  const module = await import("../payments-service");
  createPaymentsService = module.createPaymentsService;
  PaymentsServiceClass = module.PaymentsService;
});

describe("PaymentsService.createPayment", () => {
  beforeEach(() => {
    upiQueryResults.length = 0;
    paymentInserts.length = 0;
    insertValuesMock.mockClear();
    transactionMock.mockClear();
    transactionMock.mockImplementation(defaultTransactionImplementation);
    selectMock.mockClear();
    adapter.createPayment.mockReset();
    executeWithIdempotencyMock.mockReset();
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  const baseParams = {
    orderId: "order-1",
    orderAmount: 1000,
    currency: "INR" as const,
    customer: {},
  };

  it("throws when a captured UPI payment already exists", async () => {
    upiQueryResults.push([{ id: "existing" }]);
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    const service = createPaymentsService({ environment: "test" });

    await expect(service.createPayment(baseParams, "default")).rejects.toMatchObject({
      code: "UPI_PAYMENT_ALREADY_CAPTURED",
    });
    expect(adapter.createPayment).not.toHaveBeenCalled();
  });

  it("returns cached response for repeated idempotent requests", async () => {
    upiQueryResults.push([]);

    const cachedResponses = new Map<string, any>();
    executeWithIdempotencyMock.mockImplementation(async (key: string, _scope: string, operation: () => Promise<any>) => {
      if (cachedResponses.has(key)) {
        return cachedResponses.get(key);
      }
      const result = await operation();
      cachedResponses.set(key, result);
      return result;
    });

    const paymentResult: PaymentResult = {
      paymentId: "pay_1",
      status: "created",
      amount: 1000,
      currency: "INR",
      provider: "phonepe",
      environment: "test",
      createdAt: new Date(),
      providerData: {},
    };

    adapter.createPayment.mockResolvedValue(paymentResult);

    const service = createPaymentsService({ environment: "test" });

    const first = await service.createPayment({ ...baseParams, idempotencyKey: "key-1" }, "default");
    const second = await service.createPayment({ ...baseParams, idempotencyKey: "key-1" }, "default");

    expect(first).toBe(second);
    expect(adapter.createPayment).toHaveBeenCalledTimes(1);
  });

  it("rejects a second concurrent attempt after a capture is recorded", async () => {
    const cachedResponses = new Map<string, any>();
    executeWithIdempotencyMock.mockImplementation(async (key: string, _scope: string, operation: () => Promise<any>) => {
      if (cachedResponses.has(key)) {
        return cachedResponses.get(key);
      }
      const result = await operation();
      cachedResponses.set(key, result);
      return result;
    });

    const paymentResult: PaymentResult = {
      paymentId: "pay_1",
      status: "created",
      amount: 1000,
      currency: "INR",
      provider: "phonepe",
      environment: "test",
      createdAt: new Date(),
      providerData: {},
    };

    adapter.createPayment.mockResolvedValue(paymentResult);

    const service = createPaymentsService({ environment: "test" });

    upiQueryResults.push([]);
    await service.createPayment({ ...baseParams, idempotencyKey: "key-1" }, "default");

    upiQueryResults.push([{ id: "existing" }]);
    await expect(
      service.createPayment({ ...baseParams, idempotencyKey: "key-2" }, "default")
    ).rejects.toMatchObject({ code: "UPI_PAYMENT_ALREADY_CAPTURED" });

    expect(adapter.createPayment).toHaveBeenCalledTimes(1);
  });
});

describe("PaymentsService.updateStoredPayment lifecycle", () => {
  const baseResult: PaymentResult = {
    paymentId: "pay_1",
    status: "created",
    amount: 1000,
    currency: "INR",
    provider: "phonepe",
    environment: "test",
    providerData: {},
    createdAt: new Date(),
  };

  const baseEvent: PaymentEvent = {
    id: "evt_1",
    paymentId: "pay_1",
    tenantId: "default",
    provider: "phonepe",
    environment: "test" as const,
    type: "payment_verified",
    data: {},
    timestamp: new Date(),
    source: "api" as const,
  };

  beforeEach(() => {
    transactionMock.mockClear();
    transactionMock.mockImplementation(defaultTransactionImplementation);
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  afterEach(() => {
    transactionMock.mockImplementation(defaultTransactionImplementation);
  });

  it("skips updates when the lifecycle would move backwards", async () => {
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "captured" },
          ]),
        })),
      })),
    }));

    transactionMock.mockImplementation(async (callback) => {
      await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(() => ({ values: eventInsertSpy })),
      });
    });

    const service = createPaymentsService({ environment: "test" });

    await (service as any).updateStoredPayment(
      { ...baseResult, status: "processing" },
      "default",
      { ...baseEvent, status: "processing" }
    );

    expect(selectSpy).toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(eventInsertSpy).not.toHaveBeenCalled();
  });

  it("promotes the order only when a verified completed result is processed", async () => {
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "processing" },
          ]),
        })),
      })),
    }));

    transactionMock.mockImplementation(async (callback) => {
      await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(() => ({ values: eventInsertSpy })),
      });
    });

    const service = createPaymentsService({ environment: "test" });

    await (service as any).updateStoredPayment(
      { ...baseResult, status: "captured" },
      "default",
      { ...baseEvent, type: "payment_verified", status: "captured" }
    );

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(eventInsertSpy).toHaveBeenCalledTimes(1);
  });

  it("does not promote the order when the completed status is not verified", async () => {
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "processing" },
          ]),
        })),
      })),
    }));

    transactionMock.mockImplementation(async (callback) => {
      await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(() => ({ values: eventInsertSpy })),
      });
    });

    const service = createPaymentsService({ environment: "test" });

    await (service as any).updateStoredPayment(
      { ...baseResult, status: "captured" },
      "default",
      { ...baseEvent, type: "payment_captured", status: "captured" }
    );

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(eventInsertSpy).toHaveBeenCalledTimes(1);
  });
});
