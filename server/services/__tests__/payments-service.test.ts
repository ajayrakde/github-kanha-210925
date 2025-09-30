import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentResult } from "../../../shared/payment-types";

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

const transactionMock = vi.fn(async (callback: (trx: any) => Promise<void>) => {
  await callback({
    insert: vi.fn(() => ({ values: insertValuesMock })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  });
});

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
