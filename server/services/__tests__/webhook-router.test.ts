import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const transactionMock = vi.fn();

vi.mock("../../db", () => ({
  db: {
    transaction: transactionMock,
  },
}));

const getEnabledProvidersMock = vi.fn();
vi.mock("../config-resolver", () => ({
  configResolver: {
    getEnabledProviders: getEnabledProvidersMock,
  },
}));

const verifyWebhookMock = vi.fn();
const adapter = {
  provider: "phonepe" as const,
  verifyWebhook: verifyWebhookMock,
};

const createAdapterMock = vi.fn(async () => adapter);
vi.mock("../adapter-factory", () => ({
  adapterFactory: {
    createAdapter: createAdapterMock,
  },
}));

let createWebhookRouter: typeof import("../webhook-router")["createWebhookRouter"];
let WebhookRouterClass: typeof import("../webhook-router")["WebhookRouter"];

beforeAll(async () => {
  const module = await import("../webhook-router");
  createWebhookRouter = module.createWebhookRouter;
  WebhookRouterClass = module.WebhookRouter;
});

describe("WebhookRouter.processWebhook", () => {
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

  const buildRouter = () => {
    (WebhookRouterClass as unknown as { instance?: any }).instance = undefined;
    return createWebhookRouter("test");
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (WebhookRouterClass as unknown as { instance?: any }).instance = undefined;
  });

  it("returns 401 and logs audit data when signature verification fails", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
    verifyWebhookMock.mockResolvedValue({ verified: false, event: null });

    const storeSpy = vi.spyOn(router as any, "storeWebhook").mockResolvedValue();
    const auditSpy = vi.spyOn(router as any, "logAuditEvent").mockResolvedValue();
    const securitySpy = vi.spyOn(router as any, "logSecurityEvent").mockResolvedValue();
    vi.spyOn(router as any, "getExistingWebhook").mockResolvedValue(null);

    const res = createMockResponse();
    const req = {
      headers: {},
      body: {
        event: {
          id: "evt_1",
          orderId: "ord_1",
          transactionId: "txn_1",
          payload: {
            state: "PENDING",
            utr: "utr_1",
          },
        },
      },
    } as unknown as Request;

    await router.processWebhook("phonepe", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(auditSpy).toHaveBeenCalledWith(
      "phonepe",
      "default",
      "webhook.signature_failed",
      expect.objectContaining({ eventId: "evt_1", orderId: "ord_1", transactionId: "txn_1", utr: "utr_1" })
    );
    expect(storeSpy).toHaveBeenCalled();
    expect(securitySpy).not.toHaveBeenCalled();
  });

  it("returns 403 and logs security data when authorization hash mismatches", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
    verifyWebhookMock.mockResolvedValue({
      verified: false,
      event: null,
      error: { code: "INVALID_AUTHORIZATION", message: "bad hash" },
    });

    const storeSpy = vi.spyOn(router as any, "storeWebhook").mockResolvedValue();
    const auditSpy = vi.spyOn(router as any, "logAuditEvent").mockResolvedValue();
    const securitySpy = vi.spyOn(router as any, "logSecurityEvent").mockResolvedValue();
    vi.spyOn(router as any, "getExistingWebhook").mockResolvedValue(null);

    const res = createMockResponse();
    const req = {
      headers: { authorization: "Bearer deadbeef" },
      body: {
        event: {
          id: "evt_auth",
          orderId: "ord_auth",
          transactionId: "txn_auth",
          payload: { state: "FAILED" },
        },
      },
    } as unknown as Request;

    await router.processWebhook("phonepe", req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.jsonPayload).toEqual({
      status: "authorization_invalid",
      message: "bad hash",
    });
    expect(securitySpy).toHaveBeenCalledWith(
      "phonepe",
      "default",
      "webhook.auth_failed",
      expect.objectContaining({ dedupeKey: expect.any(String), reason: "INVALID_AUTHORIZATION", orderId: "ord_auth", transactionId: "txn_auth" })
    );
    expect(auditSpy).not.toHaveBeenCalled();
    expect(storeSpy).toHaveBeenCalled();
  });

  it("processes webhook successfully when authorization and signature are valid", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
    verifyWebhookMock.mockResolvedValue({
      verified: true,
      event: {
        type: "payment_status_update",
        paymentId: "pay_123",
        status: "captured",
        data: { foo: "bar" },
      },
    });

    vi.spyOn(router as any, "getExistingWebhook").mockResolvedValue(null);
    const storeSpy = vi.spyOn(router as any, "storeWebhook").mockResolvedValue();
    const logEventSpy = vi.spyOn(router as any, "logWebhookEvent").mockResolvedValue();
    const markSpy = vi.spyOn(router as any, "markWebhookProcessed").mockResolvedValue();
    const updatePaymentSpy = vi.spyOn(router as any, "updatePaymentStatus").mockResolvedValue(true);
    const securitySpy = vi.spyOn(router as any, "logSecurityEvent").mockResolvedValue();

    const res = createMockResponse();
    const req = {
      headers: { authorization: "Bearer goodhash" },
      body: {
        event: {
          id: "evt_success",
          orderId: "ord_success",
          transactionId: "txn_success",
          payload: { state: "COMPLETED" },
        },
      },
    } as unknown as Request;

    const result = await router.processWebhook("phonepe", req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.jsonPayload?.status).toBe("processed");
    expect(result.processed).toBe(true);
    expect(storeSpy).toHaveBeenCalledWith(
      "phonepe",
      expect.any(String),
      true,
      "default",
      expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(logEventSpy).toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalled();
    expect(updatePaymentSpy).toHaveBeenCalledWith(
      "pay_123",
      "captured",
      expect.any(Object),
      "default",
      { verified: true }
    );
    expect(securitySpy).not.toHaveBeenCalled();
  });

  it("acknowledges replayed events without invoking the adapter", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([{ provider: "phonepe" }]);
    const existingSpy = vi.spyOn(router as any, "getExistingWebhook").mockResolvedValue({ id: "webhook_1" });
    const auditSpy = vi.spyOn(router as any, "logAuditEvent").mockResolvedValue();

    const res = createMockResponse();
    const req = {
      headers: {},
      body: {
        event: {
          id: "evt_2",
          orderId: "ord_2",
          transactionId: "txn_2",
          payload: { state: "PENDING" },
        },
      },
    } as unknown as Request;

    await router.processWebhook("phonepe", req, res);

    expect(res.statusCode).toBe(200);
    expect(res.jsonPayload).toEqual({ status: "already_processed" });
    expect(existingSpy).toHaveBeenCalled();
    expect(auditSpy).toHaveBeenCalledWith(
      "phonepe",
      "default",
      "webhook.replayed",
      expect.objectContaining({ eventId: "evt_2", orderId: "ord_2", transactionId: "txn_2" })
    );
    expect(verifyWebhookMock).not.toHaveBeenCalled();
  });

  it("isolates tenants when resolving provider secrets", async () => {
    const router = buildRouter();
    getEnabledProvidersMock.mockResolvedValue([]);

    const res = createMockResponse();
    const req = {
      headers: { "x-tenant-id": "tenant-b" },
      body: {},
    } as unknown as Request;

    await router.processWebhook("phonepe", req, res);

    expect(res.statusCode).toBe(404);
    expect(createAdapterMock).not.toHaveBeenCalled();
    expect(getEnabledProvidersMock).toHaveBeenCalledWith("test", "tenant-b");
  });
});

describe("WebhookRouter.updatePaymentStatus lifecycle", () => {
  const buildRouter = () => {
    (WebhookRouterClass as unknown as { instance?: any }).instance = undefined;
    return createWebhookRouter("test");
  };

  beforeEach(() => {
    transactionMock.mockReset();
  });

  it("prevents backward transitions after completion", async () => {
    const router = buildRouter();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "pay_1",
              orderId: "ord_1",
              provider: "phonepe",
              currentStatus: "COMPLETED",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 1000,
            },
          ]),
        })),
      })),
    }));
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));

    transactionMock.mockImplementation(async (callback) => {
      return await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(),
      });
    });

    const result = await (router as any).updatePaymentStatus(
      "pay_1",
      "processing",
      {},
      "default",
      { verified: true }
    );

    expect(result).toBe(false);
    expect(selectSpy).toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("only promotes the order when a verified completed status arrives", async () => {
    const router = buildRouter();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "pay_1",
              orderId: "ord_1",
              provider: "phonepe",
              currentStatus: "PENDING",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 0,
            },
          ]),
        })),
      })),
    }));
    const updateCalls: any[] = [];
    const updateSpy = vi.fn(() => ({
      set: vi.fn((data) => {
        updateCalls.push(data);
        return { where: vi.fn() };
      }),
    }));

    transactionMock.mockImplementation(async (callback) => {
      return await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(),
      });
    });

    const result = await (router as any).updatePaymentStatus(
      "pay_1",
      "captured",
      { amount: 1000 },
      "default",
      { verified: true }
    );

    expect(result).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateCalls[0].status).toBe("COMPLETED");
  });

  it("treats verified completion replays as no-ops", async () => {
    const router = buildRouter();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "pay_1",
              orderId: "ord_1",
              provider: "phonepe",
              currentStatus: "COMPLETED",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 1000,
            },
          ]),
        })),
      })),
    }));
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));

    transactionMock.mockImplementation(async (callback) => {
      return await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(),
      });
    });

    const result = await (router as any).updatePaymentStatus(
      "pay_1",
      "captured",
      { amount: 1000 },
      "default",
      { verified: true }
    );

    expect(result).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("short-circuits replays after a terminal status", async () => {
    const router = buildRouter();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "pay_1",
              orderId: "ord_1",
              provider: "phonepe",
              currentStatus: "FAILED",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 0,
            },
          ]),
        })),
      })),
    }));
    const updateSpy = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) }));

    transactionMock.mockImplementation(async (callback) => {
      return await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(),
      });
    });

    const result = await (router as any).updatePaymentStatus(
      "pay_1",
      "captured",
      {},
      "default",
      { verified: true }
    );

    expect(result).toBe(false);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("marks PhonePe orders as failed and logs audit metadata", async () => {
    const router = buildRouter();
    const selectSpy = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [
            {
              id: "pay_1",
              orderId: "ord_1",
              provider: "phonepe",
              currentStatus: "PROCESSING",
              amountAuthorizedMinor: 1000,
              amountCapturedMinor: 0,
            },
          ]),
        })),
      })),
    }));
    const updateCalls: any[] = [];
    const updateSpy = vi.fn(() => ({
      set: vi.fn((data) => {
        updateCalls.push(data);
        return { where: vi.fn() };
      }),
    }));

    transactionMock.mockImplementation(async (callback) => {
      return await callback({
        select: selectSpy,
        update: updateSpy,
        insert: vi.fn(),
      });
    });

    const auditSpy = vi.spyOn(router as any, "logAuditEvent").mockResolvedValue();

    const result = await (router as any).updatePaymentStatus(
      "pay_1",
      "failed",
      { code: "PAYMENT_FAILED", message: "Declined" },
      "default",
      { verified: true }
    );

    expect(result).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(2);
    const orderUpdate = updateCalls.find((call) => call.paymentStatus === "failed");
    expect(orderUpdate).toBeDefined();
    expect(orderUpdate.paymentFailedAt).toBeInstanceOf(Date);
    expect(auditSpy).toHaveBeenCalledWith(
      "phonepe",
      "default",
      "webhook.payment_failed",
      expect.objectContaining({
        paymentId: "pay_1",
        orderId: "ord_1",
        status: "failed",
        failureCode: "PAYMENT_FAILED",
      })
    );
  });
});
