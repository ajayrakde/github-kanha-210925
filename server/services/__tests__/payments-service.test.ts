import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentEvent, PaymentResult } from "../../../shared/payment-types";
import { payments, orders, paymentEvents } from "../../../shared/schema";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const upiQueryResults: any[][] = [];
const paymentInserts: any[] = [];

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => {
      const values = upiQueryResults.shift() ?? [];
      const promise: any = Promise.resolve(values);
      promise.limit = vi.fn(async () => values);
      return promise;
    }),
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
  createRefund: vi.fn(),
};

const getAdapterWithFallbackMock = vi.fn(async () => adapter);
const getPrimaryAdapterMock = vi.fn(async () => adapter);
const createAdapterMock = vi.fn(async () => adapter);

vi.mock("../adapter-factory", () => ({
  adapterFactory: {
    getAdapterWithFallback: getAdapterWithFallbackMock,
    getPrimaryAdapter: getPrimaryAdapterMock,
    createAdapter: createAdapterMock,
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
    adapter.createRefund.mockReset();
    executeWithIdempotencyMock.mockReset();
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    createAdapterMock.mockReset();
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

  it("stores normalized lifecycle statuses for captured PhonePe payments", async () => {
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    const paymentResult: PaymentResult = {
      paymentId: "pay_1",
      status: "captured",
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
    await service.createPayment(baseParams, "default");

    expect(paymentInserts[0]?.status).toBe("COMPLETED");
  });

  it("uses a refreshed idempotency key override when provided", async () => {
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    const paymentResult: PaymentResult = {
      paymentId: "pay_2",
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

    await service.createPayment(baseParams, "default", undefined, { idempotencyKeyOverride: "override-key" });

    expect(executeWithIdempotencyMock).toHaveBeenCalledWith(
      "override-key",
      "create_payment",
      expect.any(Function)
    );
    expect(adapter.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "override-key" })
    );
  });

  it("masks PhonePe identifiers and persists the instrument variant", async () => {
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    const paymentResult: PaymentResult = {
      paymentId: "pay_2",
      status: "created",
      amount: 1500,
      currency: "INR",
      provider: "phonepe",
      environment: "test",
      createdAt: new Date(),
      providerData: {
        payerVpa: phonePeIdentifierFixture.vpa,
        utr: phonePeIdentifierFixture.utr,
        instrumentResponse: {
          type: phonePeIdentifierFixture.variant,
          vpa: phonePeIdentifierFixture.vpa,
          utr: phonePeIdentifierFixture.utr,
        },
      },
    };

    adapter.createPayment.mockResolvedValue(paymentResult);

    const service = createPaymentsService({ environment: "test" });

    upiQueryResults.push([]);
    await service.createPayment(baseParams, "default");

    expect(paymentInserts[0]).toMatchObject({
      upiPayerHandle: phonePeIdentifierFixture.maskedVpa,
      upiUtr: phonePeIdentifierFixture.maskedUtr,
      upiInstrumentVariant: phonePeIdentifierFixture.variant,
    });
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
            { orderId: "ord_1", currentStatus: "COMPLETED" },
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
    const updateCalls: any[] = [];
    const updateSpy = vi.fn(() => ({
      set: vi.fn((data) => {
        updateCalls.push(data);
        return { where: vi.fn() };
      }),
    }));
    const eventInsertSpy = vi.fn();
    let selectCall = 0;
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            selectCall += 1;
            if (selectCall === 1) {
              return [{ orderId: "ord_1", currentStatus: "PENDING" }];
            }
            return [{ paymentStatus: "pending" }];
          }),
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
    expect(updateCalls[0].status).toBe("COMPLETED");
  });

  it("treats repeated completion notifications as idempotent no-ops", async () => {
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "COMPLETED" },
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

    expect(updateSpy).not.toHaveBeenCalled();
    expect(eventInsertSpy).not.toHaveBeenCalled();
  });

  it("ignores replays once a payment is marked failed", async () => {
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "FAILED" },
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
      { ...baseResult, status: "failed" },
      "default",
      { ...baseEvent, type: "payment_failed", status: "failed" }
    );

    expect(updateSpy).not.toHaveBeenCalled();
    expect(eventInsertSpy).not.toHaveBeenCalled();
  });

  it("does not promote the order when the completed status is not verified", async () => {
    const updateCalls: any[] = [];
    const updateSpy = vi.fn(() => ({
      set: vi.fn((data) => {
        updateCalls.push(data);
        return { where: vi.fn() };
      }),
    }));
    const eventInsertSpy = vi.fn();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            { orderId: "ord_1", currentStatus: "PENDING" },
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
    expect(updateCalls[0].status).toBe("COMPLETED");
  });
});

describe("PaymentsService.createRefund", () => {
  const basePayment = {
    id: "pay_1",
    provider: "phonepe",
    providerPaymentId: "prov_pay_1",
    providerOrderId: "merchant_order_1",
    orderId: "order_1",
    amountCapturedMinor: 1000,
    amountAuthorizedMinor: 1000,
    amountRefundedMinor: 0,
  };

  beforeEach(() => {
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });
    createAdapterMock.mockResolvedValue(adapter);
  });

  it("rejects refunds that would exceed the captured amount", async () => {
    const service = createPaymentsService({ environment: "test" });

    upiQueryResults.push([basePayment]);
    upiQueryResults.push([{ totalNonFailed: 800, totalSucceeded: 600 }]);

    await expect(
      service.createRefund({ paymentId: "pay_1", amount: 300, idempotencyKey: "idempo" }, "default")
    ).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CAPTURED_AMOUNT" });

    expect(adapter.createRefund).not.toHaveBeenCalled();
  });

  it("stores successful refunds, masks identifiers, and updates totals", async () => {
    const service = createPaymentsService({ environment: "test" });
    const refundCreatedAt = new Date("2024-02-01T00:00:00Z");

    upiQueryResults.push([{ ...basePayment, amountRefundedMinor: 200 }]);
    upiQueryResults.push([{ totalNonFailed: 200, totalSucceeded: 200 }]);

    const updateSetSpy = vi.fn(() => ({ where: vi.fn() }));
    transactionMock.mockImplementation(async (callback) => {
      await callback({
        insert: vi.fn(() => ({ values: insertValuesMock })),
        update: vi.fn(() => ({ set: updateSetSpy })),
      });
    });

    adapter.createRefund.mockResolvedValue({
      refundId: "refund_1",
      paymentId: "pay_1",
      providerRefundId: "provider_refund",
      merchantRefundId: "merchant_refund_1",
      originalMerchantOrderId: "merchant_order_1",
      amount: 300,
      status: "completed",
      provider: "phonepe",
      environment: "test",
      upiUtr: phonePeIdentifierFixture.utr,
      providerData: {
        paymentInstrument: {
          utr: phonePeIdentifierFixture.utr,
        },
      },
      createdAt: refundCreatedAt,
    });

    const result = await service.createRefund(
      { paymentId: "pay_1", amount: 300, idempotencyKey: "idempo" },
      "default"
    );

    expect(adapter.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 300,
        providerPaymentId: "prov_pay_1",
        originalMerchantOrderId: "merchant_order_1",
      })
    );

    expect(result.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
    expect(result.merchantRefundId).toBe("merchant_refund_1");

    const refundInsert = paymentInserts.find((entry) => entry.id === "refund_1");
    expect(refundInsert).toMatchObject({
      merchantRefundId: "merchant_refund_1",
      originalMerchantOrderId: "merchant_order_1",
      upiUtr: phonePeIdentifierFixture.maskedUtr,
      amountMinor: 300,
    });

    expect(updateSetSpy).toHaveBeenCalledWith(
      expect.objectContaining({ amountRefundedMinor: 500 })
    );
  });
});

describe("PaymentsService.cancelPayment", () => {
  beforeEach(() => {
    upiQueryResults.length = 0;
    paymentInserts.length = 0;
    insertValuesMock.mockClear();
    transactionMock.mockClear();
    transactionMock.mockImplementation(defaultTransactionImplementation);
    selectMock.mockClear();
    executeWithIdempotencyMock.mockReset();
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    adapter.createPayment.mockReset();
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  it("marks PhonePe payments as cancelled, logs an audit event, and keeps the order payable", async () => {
    const paymentRecord = {
      id: "pay_1",
      tenantId: "default",
      orderId: "ord_1",
      provider: "phonepe",
      status: "CREATED",
    };

    upiQueryResults.push([paymentRecord]);

    const paymentUpdates: any[] = [];
    const orderUpdates: any[] = [];
    const eventInserts: any[] = [];

    transactionMock.mockImplementation(async (callback) => {
      const createWhereable = () => ({ where: vi.fn() });

      const updateSpy = vi.fn((table: any) => {
        if (table === payments) {
          return {
            set: vi.fn((values) => {
              paymentUpdates.push(values);
              return createWhereable();
            }),
          };
        }

        if (table === orders) {
          return {
            set: vi.fn((values) => {
              orderUpdates.push(values);
              return createWhereable();
            }),
          };
        }

        throw new Error(`Unexpected update call for table: ${String(table)}`);
      });

      const insertSpy = vi.fn((table: any) => {
        if (table === paymentEvents) {
          return {
            values: vi.fn((values) => {
              eventInserts.push(values);
            }),
          };
        }

        throw new Error(`Unexpected insert call for table: ${String(table)}`);
      });

      await callback({
        update: updateSpy,
        insert: insertSpy,
      });
    });

    const service = createPaymentsService({ environment: "test" });

    await service.cancelPayment({ paymentId: "pay_1", orderId: "ord_1", reason: "USER_CANCEL" }, "default");

    expect(paymentUpdates).toHaveLength(1);
    expect(paymentUpdates[0]).toMatchObject({ status: "CANCELLED" });

    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0]).toMatchObject({ paymentStatus: "failed" });
    expect(orderUpdates[0]).not.toHaveProperty("status");

    expect(eventInserts).toHaveLength(1);
    expect(eventInserts[0]).toMatchObject({
      type: "checkout.user_cancelled",
      paymentId: "pay_1",
    });

    transactionMock.mockImplementation(defaultTransactionImplementation);

    const createdAt = new Date();
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    upiQueryResults.push([]);

    adapter.createPayment.mockResolvedValue({
      paymentId: "pay_retry",
      providerPaymentId: "prov_retry",
      provider: "phonepe",
      environment: "test",
      status: "created",
      amount: 1000,
      currency: "INR",
      method: { type: "upi" },
      providerData: {},
      createdAt,
    });

    await service.createPayment(
      {
        orderId: "ord_1",
        orderAmount: 1000,
        currency: "INR",
        customer: {},
      },
      "default"
    );

    expect(adapter.createPayment).toHaveBeenCalledTimes(1);
  });
});
