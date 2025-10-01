import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentEvent, PaymentResult, RefundResult } from "../../../shared/payment-types";
import { payments, orders, paymentEvents, refunds } from "../../../shared/schema";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const selectResults: any[][] = [];
const paymentInserts: any[] = [];
const transactionQueue: Array<(callback: (trx: any) => Promise<any>) => Promise<any>> = [];

const selectMock = vi.fn(() => ({
  from: vi.fn(() => ({
    where: vi.fn(() => ({
      limit: vi.fn(async () => selectResults.shift() ?? []),
    })),
  })),
}));

const insertValuesMock = vi.fn((values: any) => {
  paymentInserts.push(values);
  return {
    returning: vi.fn(async () => []),
  };
});

describe("PaymentsService.createRefund", () => {
  beforeEach(() => {
    selectResults.length = 0;
    transactionQueue.length = 0;
    paymentInserts.length = 0;
    insertValuesMock.mockClear();
    transactionMock.mockClear();
    transactionMock.mockImplementation(transactionImplementationWithQueue);
    selectMock.mockClear();
    adapter.createPayment.mockReset();
    adapter.createRefund.mockReset();
    executeWithIdempotencyMock.mockReset();
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    createAdapterMock.mockReset();
    createAdapterMock.mockResolvedValue(adapter);
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  it("rejects refunds exceeding captured amount", async () => {
    const paymentRecord = {
      id: "pay_over",
      tenantId: "default",
      provider: "phonepe",
      providerPaymentId: "txn_over",
      providerOrderId: "ord_over",
      amountCapturedMinor: 500,
      amountRefundedMinor: 300,
    };

    selectResults.push([{ ...paymentRecord }], []);

    const service = createPaymentsService({ environment: "test" });

    await expect(
      service.createRefund(
        {
          paymentId: paymentRecord.id,
          amount: 250,
          merchantRefundId: "ref-over",
          idempotencyKey: "idem-over",
        },
        "default"
      )
    ).rejects.toMatchObject({ code: "REFUND_AMOUNT_EXCEEDS_CAPTURED" });

    expect(adapter.createRefund).not.toHaveBeenCalled();
  });

  it("returns stored refund when merchantRefundId already exists", async () => {
    const paymentRecord = {
      id: "pay_dup",
      tenantId: "default",
      provider: "phonepe",
      providerPaymentId: "txn_dup",
      providerOrderId: "ord_dup",
      amountCapturedMinor: 400,
      amountRefundedMinor: 0,
    };

    const existingRefund = {
      id: "refund_dup",
      tenantId: "default",
      paymentId: paymentRecord.id,
      merchantRefundId: "ref-dup",
      amountMinor: 150,
      status: "completed",
      providerTxnId: "txn_ref_dup",
      utrMasked: "utr***1234",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    selectResults.push([{ ...paymentRecord }], [existingRefund]);

    const service = createPaymentsService({ environment: "test" });

    const result = await service.createRefund(
      {
        paymentId: paymentRecord.id,
        amount: 150,
        merchantRefundId: "ref-dup",
        idempotencyKey: "idem-dup",
      },
      "default"
    );

    expect(createAdapterMock).not.toHaveBeenCalled();
    expect(adapter.createRefund).not.toHaveBeenCalled();
    expect(result.refundId).toBe(existingRefund.id);
    expect(result.status).toBe("completed");
    expect(result.utrMasked).toBe(existingRefund.utrMasked);
  });

  it("persists successful PhonePe refunds and aggregates totals", async () => {
    const service = createPaymentsService({ environment: "test" });

    const storedPayment = {
      id: "pay_success",
      tenantId: "default",
      provider: "phonepe",
      providerPaymentId: "txn_success",
      providerOrderId: "ord_success",
      amountCapturedMinor: 600,
      amountRefundedMinor: 0,
    };

    const capturedPaymentUpdates: any[] = [];

    const runSuccessfulRefund = async (
      amount: number,
      merchantRefundId: string,
      providerTxnId: string,
      utrMasked: string
    ) => {
      const paymentSnapshot = { ...storedPayment };
      selectResults.push([paymentSnapshot], []);

      const now = new Date();
      const pendingRow = {
        id: `${merchantRefundId}-row`,
        tenantId: "default",
        paymentId: storedPayment.id,
        merchantRefundId,
        amountMinor: amount,
        status: "pending",
        providerTxnId: null as string | null,
        utrMasked: null as string | null,
        createdAt: now,
        updatedAt: now,
      };

      const completedRow = {
        ...pendingRow,
        status: "completed" as const,
        providerTxnId,
        utrMasked,
      };

      insertValuesMock.mockImplementationOnce((values: any) => {
        paymentInserts.push(values);
        return {
          returning: vi.fn(async () => [pendingRow]),
        };
      });

      transactionQueue.push(defaultTransactionImplementation);
      transactionQueue.push(async (callback) => {
        const refundUpdates: any[] = [];
        const paymentUpdates: any[] = [];
        const eventInserts: any[] = [];

        const result = await callback({
          update: vi.fn((table: any) => {
            if (table === refunds) {
              return {
                set: vi.fn((values) => {
                  refundUpdates.push(values);
                  completedRow.status = values.status;
                  completedRow.providerTxnId = values.providerTxnId ?? completedRow.providerTxnId;
                  completedRow.utrMasked = values.utrMasked ?? completedRow.utrMasked;
                  completedRow.updatedAt = values.updatedAt;
                  return { where: vi.fn(async () => ({ rowCount: 1 })) };
                }),
              };
            }

            if (table === payments) {
              return {
                set: vi.fn((values) => {
                  paymentUpdates.push(values);
                  capturedPaymentUpdates.push(values);
                  return { where: vi.fn(async () => ({ rowCount: 1 })) };
                }),
              };
            }

            throw new Error(`Unexpected update call for table: ${String(table)}`);
          }),
          insert: vi.fn((table: any) => {
            if (table === paymentEvents) {
              return {
                values: vi.fn((values) => {
                  eventInserts.push(values);
                }),
              };
            }
            throw new Error(`Unexpected insert call for table: ${String(table)}`);
          }),
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [completedRow]),
              })),
            })),
          })),
        });

        expect(refundUpdates).toHaveLength(1);
        expect(refundUpdates[0]).toMatchObject({ status: "completed" });
        expect(paymentUpdates).toHaveLength(1);
        expect(eventInserts).toHaveLength(1);
        expect(result).toEqual(completedRow);
        return result;
      });

      adapter.createRefund.mockResolvedValueOnce({
        refundId: `${merchantRefundId}-result`,
        paymentId: storedPayment.id,
        merchantRefundId,
        amount,
        status: "completed",
        provider: "phonepe",
        environment: "test",
        providerTransactionId: providerTxnId,
        utrMasked,
        createdAt: now,
      });

      const result = await service.createRefund(
        {
          paymentId: storedPayment.id,
          amount,
          merchantRefundId,
          idempotencyKey: `${merchantRefundId}-key`,
        },
        "default"
      );

      expect(result.status).toBe("completed");
      expect(result.utrMasked).toBe(utrMasked);
      expect(result.providerTransactionId).toBe(providerTxnId);
      expect(selectResults).toHaveLength(0);
    };

    await runSuccessfulRefund(200, "ref-success-1", "txn-ref-1", "utr***1111");
    await runSuccessfulRefund(150, "ref-success-2", "txn-ref-2", "utr***2222");

    expect(capturedPaymentUpdates).toHaveLength(2);
    expect(
      capturedPaymentUpdates.map((update) => {
        const chunks = (update.amountRefundedMinor as any)?.queryChunks;
        if (Array.isArray(chunks)) {
          const numericChunk = chunks.find((chunk: unknown) => typeof chunk === "number");
          if (typeof numericChunk === "number") {
            return numericChunk;
          }
        }
        return update.amountRefundedMinor;
      })
    ).toEqual([200, 150]);
    expect(adapter.createRefund).toHaveBeenCalledTimes(2);
  });

  it("records failed refunds without altering totals", async () => {
    const service = createPaymentsService({ environment: "test" });

    const storedPayment = {
      id: "pay_failed",
      tenantId: "default",
      provider: "phonepe",
      providerPaymentId: "txn_failed",
      providerOrderId: "ord_failed",
      amountCapturedMinor: 400,
      amountRefundedMinor: 0,
    };

    selectResults.push([{ ...storedPayment }], []);

    const now = new Date();
    const pendingRow = {
      id: "refund_failed_row",
      tenantId: "default",
      paymentId: storedPayment.id,
      merchantRefundId: "ref-failed",
      amountMinor: 200,
      status: "pending",
      providerTxnId: null as string | null,
      utrMasked: null as string | null,
      createdAt: now,
      updatedAt: now,
    };

    const failedRow = { ...pendingRow, status: "failed" as const };

    insertValuesMock.mockImplementationOnce((values: any) => {
      paymentInserts.push(values);
      return {
        returning: vi.fn(async () => [pendingRow]),
      };
    });

    transactionQueue.push(defaultTransactionImplementation);
    transactionQueue.push(async (callback) => {
      const paymentUpdates: any[] = [];

      const result = await callback({
        update: vi.fn((table: any) => {
          if (table === refunds) {
            return {
              set: vi.fn((values) => {
                failedRow.status = values.status;
                failedRow.providerTxnId = values.providerTxnId ?? failedRow.providerTxnId;
                failedRow.utrMasked = values.utrMasked ?? failedRow.utrMasked;
                failedRow.updatedAt = values.updatedAt;
                return { where: vi.fn(async () => ({ rowCount: 1 })) };
              }),
            };
          }

          if (table === payments) {
            return {
              set: vi.fn((values) => {
                paymentUpdates.push(values);
                return { where: vi.fn(async () => ({ rowCount: 1 })) };
              }),
            };
          }

          throw new Error(`Unexpected update call for table: ${String(table)}`);
        }),
        insert: vi.fn((table: any) => {
          if (table === paymentEvents) {
            return {
              values: vi.fn(() => undefined),
            };
          }
          throw new Error(`Unexpected insert call for table: ${String(table)}`);
        }),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [failedRow]),
            })),
          })),
        })),
      });

      expect(paymentUpdates).toHaveLength(0);
      expect(result).toEqual(failedRow);
      return result;
    });

    adapter.createRefund.mockResolvedValueOnce({
      refundId: "refund-failed-result",
      paymentId: storedPayment.id,
      merchantRefundId: "ref-failed",
      amount: 200,
      status: "failed",
      provider: "phonepe",
      environment: "test",
      createdAt: now,
    });

    const result = await service.createRefund(
      {
        paymentId: storedPayment.id,
        amount: 200,
        merchantRefundId: "ref-failed",
        idempotencyKey: "idem-failed",
      },
      "default"
    );

    expect(result.status).toBe("failed");
    expect(storedPayment.amountRefundedMinor).toBe(0);
    expect(adapter.createRefund).toHaveBeenCalledTimes(1);
  });
});

const defaultTransactionImplementation = async (callback: (trx: any) => Promise<any>) => {
  const insertSpy = vi.fn(() => ({ values: insertValuesMock }));
  const updateSpy = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(async () => ({ rowCount: 1 })),
    })),
  }));

  return await callback({
    insert: insertSpy,
    update: updateSpy,
    select: selectMock,
  });
};

const transactionImplementationWithQueue = async (
  callback: (trx: any) => Promise<any>
) => {
  const impl = transactionQueue.shift();
  if (impl) {
    return await impl(callback);
  }
  return await defaultTransactionImplementation(callback);
};

const transactionMock = vi.fn(transactionImplementationWithQueue);

vi.mock("../../db", () => ({
  db: {
    transaction: transactionMock,
    select: selectMock,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
}));

const adapter = {
  provider: "phonepe" as const,
  createPayment: vi.fn<[], Promise<PaymentResult>>(),
  createRefund: vi.fn<[], Promise<RefundResult>>(),
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
    selectResults.length = 0;
    transactionQueue.length = 0;
    paymentInserts.length = 0;
    insertValuesMock.mockClear();
    transactionMock.mockClear();
    transactionMock.mockImplementation(transactionImplementationWithQueue);
    selectMock.mockClear();
    adapter.createPayment.mockReset();
    adapter.createRefund.mockReset();
    executeWithIdempotencyMock.mockReset();
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    createAdapterMock.mockReset();
    createAdapterMock.mockResolvedValue(adapter);
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  const baseParams = {
    orderId: "order-1",
    orderAmount: 1000,
    currency: "INR" as const,
    customer: {},
  };

  it("throws when a captured UPI payment already exists", async () => {
    selectResults.push([{ id: "existing" }]);
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
    selectResults.push([]);

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

    selectResults.push([]);
    await service.createPayment({ ...baseParams, idempotencyKey: "key-1" }, "default");

    selectResults.push([{ id: "existing" }]);
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

    selectResults.push([]);
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

    selectResults.push([]);

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

    selectResults.push([]);
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
    transactionMock.mockImplementation(transactionImplementationWithQueue);
    (PaymentsServiceClass as unknown as { instances: Map<string, any> }).instances = new Map();
  });

  afterEach(() => {
    transactionMock.mockImplementation(transactionImplementationWithQueue);
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

describe("PaymentsService.cancelPayment", () => {
  beforeEach(() => {
    selectResults.length = 0;
    transactionQueue.length = 0;
    paymentInserts.length = 0;
    insertValuesMock.mockClear();
    transactionMock.mockClear();
    transactionMock.mockImplementation(transactionImplementationWithQueue);
    selectMock.mockClear();
    executeWithIdempotencyMock.mockReset();
    generateKeyMock.mockReset();
    generateKeyMock.mockReturnValue("generated-key");
    adapter.createPayment.mockReset();
    adapter.createRefund.mockReset();
    createAdapterMock.mockReset();
    createAdapterMock.mockResolvedValue(adapter);
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

    selectResults.push([paymentRecord]);

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

    transactionMock.mockImplementation(transactionImplementationWithQueue);

    const createdAt = new Date();
    executeWithIdempotencyMock.mockImplementation(async (_key, _scope, operation) => {
      return await operation();
    });

    selectResults.push([]);

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
