import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

vi.mock("../../db", () => ({
  db: {},
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
    vi.spyOn(router as any, "getExistingWebhook").mockResolvedValue(null);

    const res = createMockResponse();
    const req = {
      headers: {},
      body: {
        eventId: "evt_1",
        data: {
          transactionId: "txn_1",
          utr: "utr_1",
        },
      },
    } as unknown as Request;

    await router.processWebhook("phonepe", req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(auditSpy).toHaveBeenCalledWith(
      "phonepe",
      "default",
      "webhook.signature_failed",
      expect.objectContaining({ eventId: "evt_1", transactionId: "txn_1", utr: "utr_1" })
    );
    expect(storeSpy).toHaveBeenCalled();
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
        eventId: "evt_2",
        data: { transactionId: "txn_2" },
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
      expect.objectContaining({ eventId: "evt_2", transactionId: "txn_2" })
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
