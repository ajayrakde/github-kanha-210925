import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Request, Response as ExpressResponse } from "express";
import type { Router } from "express";
import PhonePeReconciliationAdminPage from "../admin/phonepe-reconciliation";

const setLocationMock = vi.fn();

vi.mock("wouter", async () => {
  const actual = await vi.importActual<typeof import("wouter")>("wouter");
  return {
    ...actual,
    useLocation: () => ["/admin/phonepe-reconciliation?orderId=order-123", setLocationMock] as const,
  };
});

const mockPaymentsService = {
  verifyPayment: vi.fn(),
  performHealthCheck: vi.fn(),
  createPayment: vi.fn(),
  createRefund: vi.fn(),
  getRefundStatus: vi.fn(),
};

vi.mock("../../../../server/services/payments-service", () => ({
  createPaymentsService: () => mockPaymentsService,
}));

const mockOrdersRepository = {
  getOrderWithPayments: vi.fn(),
};

const mockPhonePePollingStore = {
  getLatestJobForOrder: vi.fn(),
};

vi.mock("../../../../server/storage", () => ({
  ordersRepository: mockOrdersRepository,
  phonePePollingStore: mockPhonePePollingStore,
}));

vi.mock("../../../../server/services/phonepe-polling-registry", () => ({
  phonePePollingWorker: { registerJob: vi.fn() },
}));

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/test";

const buildResponse = () => {
  const res: Partial<ExpressResponse> & { statusCode?: number; jsonPayload?: any } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as ExpressResponse;
  }) as any;
  res.json = vi.fn((payload: any) => {
    res.jsonPayload = payload;
    return res as ExpressResponse;
  }) as any;
  return res as ExpressResponse & { statusCode?: number; jsonPayload?: any };
};

const buildRouter = async () => {
  const module = await import("../../../../server/routes/payments");
  return module.createPaymentsRouter((_req, _res, next) => next());
};

const getRouteHandler = (router: Router, method: "get", path: string) => {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  const stack = layer.route.stack;
  const routeLayer = stack[stack.length - 1];
  return routeLayer.handle as (req: Request, res: ExpressResponse, next: () => void) => Promise<void> | void;
};

describe("Admin PhonePe reconciliation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders gateway status and UPI references from the admin endpoint", async () => {
    const order = {
      id: "order-123",
      tenantId: "tenant-a",
      payments: [
        {
          id: "pay_1",
          provider: "phonepe",
          status: "processing",
          providerPaymentId: "merchant-1",
          providerReferenceId: "merchant-1",
          providerTransactionId: "pg-1",
          upiPayerHandle: "payer@upi",
          upiUtr: "UTR-MASKED",
          amountAuthorizedMinor: 1000,
          amountCapturedMinor: 0,
          createdAt: new Date("2024-01-01T00:00:00Z"),
          updatedAt: new Date("2024-01-01T00:01:00Z"),
        },
      ],
      user: {},
      deliveryAddress: {},
    };

    mockOrdersRepository.getOrderWithPayments.mockResolvedValue(order);
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
        utr: "UTR123456",
        upiPayerHandle: "payer@upi",
        paymentInstrument: {
          type: "UPI_COLLECT",
          utr: "UTR123456",
          payerVpa: "payer@upi",
          payerAddress: "payer@upi",
        },
      },
      createdAt: new Date("2024-01-01T00:02:00Z"),
      updatedAt: new Date("2024-01-01T00:02:30Z"),
    });

    mockPhonePePollingStore.getLatestJobForOrder.mockResolvedValue({
      status: "pending",
      attempt: 2,
      nextPollAt: new Date("2024-01-01T00:05:00Z"),
      expireAt: new Date("2024-01-01T00:10:00Z"),
      lastStatus: "PENDING",
      lastResponseCode: "PAYMENT_PENDING",
      lastError: null,
      completedAt: null,
      lastPolledAt: new Date("2024-01-01T00:04:00Z"),
    });

    window.history.replaceState({}, "", "/admin/phonepe-reconciliation?orderId=order-123");

    const router = await buildRouter();
    const handler = getRouteHandler(router, "get", "/admin/phonepe/orders/:orderId");

    const debugReq = {
      params: { orderId: "order-123" },
      headers: {},
      session: { adminId: "admin-1", userRole: "admin" },
    } as unknown as Request;
    const debugRes = buildResponse();
    try {
      await handler(debugReq, debugRes, () => {});
    } catch (error) {
      throw new Error(`handler error: ${error instanceof Error ? error.message : String(error)}`);
    }
    expect(mockOrdersRepository.getOrderWithPayments).toHaveBeenCalledWith("order-123");
    expect(mockPaymentsService.verifyPayment).toHaveBeenCalled();
    expect(debugRes.jsonPayload?.success).toBe(true);
    mockOrdersRepository.getOrderWithPayments.mockClear();
    mockPaymentsService.verifyPayment.mockClear();
    mockPhonePePollingStore.getLatestJobForOrder.mockClear();

    global.fetch = vi.fn(async (input: RequestInfo) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "/api/admin/me") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, role: "admin", id: "admin-1" }),
        } as any;
      }
      if (url.startsWith("/api/payments/admin/phonepe/orders/")) {
        const orderId = decodeURIComponent(url.split("/" ).pop() ?? "");
        const req = {
          params: { orderId },
          headers: {},
          session: { adminId: "admin-1", userRole: "admin" },
        } as unknown as Request;
        const res = buildResponse();
        await handler(req, res, () => {});
        if (!res.jsonPayload) {
          throw new Error("handler returned no payload");
        }
        return {
          ok: !res.statusCode || res.statusCode < 400,
          status: res.statusCode ?? 200,
          json: async () => res.jsonPayload,
        } as any;
      }
      throw new Error(`Unhandled fetch ${url}`);
    }) as any;

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(["/api/admin/me"], { authenticated: true, role: "admin", id: "admin-1" });

    render(
      <QueryClientProvider client={queryClient}>
        <PhonePeReconciliationAdminPage />
      </QueryClientProvider>
    );

    const orderInput = await screen.findByTestId("input-order-id");
    fireEvent.change(orderInput, { target: { value: "order-123" } });
    const form = orderInput.closest("form");
    if (!form) {
      throw new Error("Form not found for order lookup");
    }
    fireEvent.submit(form);

    await waitFor(() => expect(mockPaymentsService.verifyPayment).toHaveBeenCalled());

    expect(await screen.findByTestId("badge-provider-status")).toHaveTextContent("COMPLETED");
    expect(screen.getByTestId("text-upi-utr")).toHaveTextContent("UTR123456");
    expect(screen.getByTestId("text-upi-handle")).toHaveTextContent("payer@upi");
    expect(screen.getByTestId("badge-reconciliation-status")).toHaveTextContent("PENDING");
  });
});
