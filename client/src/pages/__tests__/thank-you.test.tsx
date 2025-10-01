import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ThankYou, { applyAuthorizationFailure } from "../thank-you";
import { phonePeIdentifierFixture } from "@shared/__fixtures__/upi";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["", setLocationMock],
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

const cleanupQueryClient = async (client: QueryClient) => {
  await client.cancelQueries();
  client.clear();
};

describe("applyAuthorizationFailure", () => {
  const buildHandlers = () => ({
    setAuthorizationError: vi.fn(),
    setReconciliationStatus: vi.fn(),
    setReconciliationMessage: vi.fn(),
    setRetryError: vi.fn(),
    setShouldStartPolling: vi.fn(),
  });

  it("applies the 401 message and stops polling", () => {
    const handlers = buildHandlers();

    const handled = applyAuthorizationFailure(401, handlers);

    expect(handled).toBe(true);
    expect(handlers.setAuthorizationError).toHaveBeenCalledWith(
      "Please sign in to view the latest payment status.",
    );
    expect(handlers.setReconciliationStatus).toHaveBeenCalledWith("complete");
    expect(handlers.setReconciliationMessage).toHaveBeenCalledWith(null);
    expect(handlers.setRetryError).toHaveBeenCalledWith(null);
    expect(handlers.setShouldStartPolling).toHaveBeenCalledWith(false);
  });

  it("applies the 403 message and stops polling", () => {
    const handlers = buildHandlers();

    const handled = applyAuthorizationFailure(403, handlers);

    expect(handled).toBe(true);
    expect(handlers.setAuthorizationError).toHaveBeenCalledWith(
      "You do not have permission to view this order's payment details.",
    );
    expect(handlers.setReconciliationStatus).toHaveBeenCalledWith("complete");
    expect(handlers.setReconciliationMessage).toHaveBeenCalledWith(null);
    expect(handlers.setRetryError).toHaveBeenCalledWith(null);
    expect(handlers.setShouldStartPolling).toHaveBeenCalledWith(false);
  });

  it("returns false for other status codes", () => {
    const handlers = buildHandlers();

    const handled = applyAuthorizationFailure(500, handlers);

    expect(handled).toBe(false);
    expect(handlers.setAuthorizationError).not.toHaveBeenCalled();
    expect(handlers.setShouldStartPolling).not.toHaveBeenCalled();
  });
});

describe("Thank-you page", () => {
  beforeEach(() => {
    setLocationMock.mockReset();
    sessionStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "processing", message: "Processing" }),
    }) as unknown as typeof fetch;
    window.history.replaceState({}, "", "/thank-you?orderId=order-1");
  });

  it("updates from processing to confirmed and shows UPI metadata", async () => {
    const queryClient = createTestQueryClient();
    let view: ReturnType<typeof render> | undefined;

    try {
      const processingData = {
      order: {
        id: "order-1",
        status: "processing",
        paymentStatus: "processing",
        paymentMethod: "upi",
        total: "499.00",
        shippingCharge: "50.00",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      transactions: [],
      latestTransaction: {
        id: "txn-processing",
        status: "processing",
        merchantTransactionId: "MERCHANT_TXN_123",
      },
      totalPaid: 0,
      totalRefunded: 0,
    };

      queryClient.setQueryData(["/api/payments/order-info", "order-1"], processingData);

      view = render(
        <QueryClientProvider client={queryClient}>
          <ThankYou />
        </QueryClientProvider>
      );

      const statusBadge = await screen.findByTestId("badge-payment-status");
      expect(statusBadge).toHaveTextContent(/Processing/i);

      const confirmedData = {
        ...processingData,
        order: {
          ...processingData.order,
          status: "confirmed",
          paymentStatus: "paid",
        },
      latestTransaction: {
        id: "txn-captured",
        status: "COMPLETED",
        merchantTransactionId: "MERCHANT_TXN_123",
        providerTransactionId: "PG_TXN_123",
        upiUtr: phonePeIdentifierFixture.maskedUtr,
        upiPayerHandle: phonePeIdentifierFixture.maskedVpa,
        upiInstrumentVariant: phonePeIdentifierFixture.variant,
        upiInstrumentLabel: phonePeIdentifierFixture.label,
        receiptUrl: "https://phonepe.example/receipt/pay_test_123",
        refunds: [
          {
            id: "refund_1",
            paymentId: "pay_1",
            status: "completed",
            amount: "3.00",
            amountMinor: 300,
            merchantRefundId: "merchant_refund",
            upiUtr: phonePeIdentifierFixture.maskedUtr,
            createdAt: new Date().toISOString(),
          },
        ],
      },
      transactions: [
        {
          id: "txn-captured",
          status: "COMPLETED",
          amount: "499.00",
          amountMinor: 49900,
          merchantTransactionId: "MERCHANT_TXN_123",
          refunds: [
            {
              id: "refund_1",
              paymentId: "pay_1",
              status: "completed",
              amount: "3.00",
              amountMinor: 300,
              merchantRefundId: "merchant_refund",
              upiUtr: phonePeIdentifierFixture.maskedUtr,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      totalPaid: 499,
    };

      await act(async () => {
        queryClient.setQueryData(["/api/payments/order-info", "order-1"], confirmedData);
      });

      await waitFor(() => {
        expect(screen.getByText("Order Confirmed!")).toBeInTheDocument();
      });

      expect(screen.getByTestId("badge-payment-status")).toHaveTextContent(/Paid/i);
      expect(screen.getByTestId("text-transaction-id")).toHaveTextContent("MERCHANT_TXN_123");
      expect(screen.getByTestId("text-amount-paid")).toHaveTextContent("₹499.00");
      expect(screen.getAllByText(phonePeIdentifierFixture.maskedUtr).length).toBeGreaterThan(0);
      expect(screen.getAllByText(phonePeIdentifierFixture.maskedVpa).length).toBeGreaterThan(0);
      expect(screen.getByText(phonePeIdentifierFixture.label)).toBeInTheDocument();
      expect(screen.getByText("Refunds")).toBeInTheDocument();
      expect(screen.getAllByText("₹3.00").length).toBeGreaterThan(0);
      expect(screen.getByText(/merchant_refund/i)).toBeInTheDocument();
    } finally {
      view?.unmount();
      await cleanupQueryClient(queryClient);
    }
  });

  it("renders failure state with retry action when the latest attempt failed", async () => {
    const queryClient = createTestQueryClient();
    let view: ReturnType<typeof render> | undefined;

    try {
      const failedData = {
      order: {
        id: "order-1",
        status: "pending",
        paymentStatus: "failed",
        paymentFailedAt: new Date("2024-01-01T10:00:00Z").toISOString(),
        paymentMethod: "upi",
        total: "499.00",
        shippingCharge: "50.00",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      payment: null,
      transactions: [],
      latestTransaction: {
        id: "txn-failed",
        status: "failed",
        merchantTransactionId: "MERCHANT_FAIL_123",
      },
      latestTransactionFailed: true,
      latestTransactionFailureAt: new Date("2024-01-01T10:00:00Z").toISOString(),
      totalPaid: 0,
      totalRefunded: 0,
    };

      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === "/api/payments/order-info/order-1") {
          return {
            ok: true,
            status: 200,
            json: async () => failedData,
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "processing" }),
        } as Response;
      }) as unknown as typeof fetch;

      queryClient.setQueryData(["/api/payments/order-info", "order-1"], failedData);

      view = render(
        <QueryClientProvider client={queryClient}>
          <ThankYou />
        </QueryClientProvider>
      );

      const statusBadges = await screen.findAllByTestId("badge-payment-status");
      expect(statusBadges.some((badge) => /Failed/i.test(badge.textContent ?? ""))).toBe(true);
      expect(screen.getByText(/Your payment could not be processed/i)).toBeInTheDocument();
      expect(screen.getByText(/Last failed attempt recorded/i)).toBeInTheDocument();

      const retryButton = screen.getByTestId("button-retry-payment");
      expect(retryButton).toBeInTheDocument();

      await act(async () => {
        retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(setLocationMock).toHaveBeenCalledWith("/payment?orderId=order-1");
    } finally {
      view?.unmount();
      await cleanupQueryClient(queryClient);
    }
  });

  it("shows a PhonePe start-again CTA for expired reconciliation and triggers a retry", async () => {
    const queryClient = createTestQueryClient();
    let view: ReturnType<typeof render> | undefined;

    try {
      const now = new Date();
      const expiredData = {
      order: {
        id: "order-1",
        status: "pending",
        paymentStatus: "failed",
        paymentFailedAt: now.toISOString(),
        paymentMethod: "phonepe",
        total: "499.00",
        shippingCharge: "50.00",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      payment: null,
      transactions: [],
      latestTransaction: {
        id: "txn-expired",
        status: "expired",
        merchantTransactionId: "MERCHANT_EXPIRED_123",
      },
      latestTransactionFailed: true,
      latestTransactionFailureAt: now.toISOString(),
      totalPaid: 0,
      totalRefunded: 0,
      reconciliation: {
        status: "expired" as const,
        attempt: 8,
        nextPollAt: now.toISOString(),
        expiresAt: now.toISOString(),
      },
    };

      const retryResponse = {
      success: true,
      data: {
        paymentId: "pay_new",
        order: { id: "order-1", paymentStatus: "processing" },
        reconciliation: {
          status: "pending" as const,
          attempt: 0,
          nextPollAt: new Date(now.getTime() + 5000).toISOString(),
          expiresAt: new Date(now.getTime() + 900000).toISOString(),
        },
      },
    };

      const refreshedData = {
        ...expiredData,
        order: { ...expiredData.order, paymentStatus: "processing" },
        reconciliation: retryResponse.data.reconciliation,
        latestTransactionFailed: false,
        latestTransaction: {
          id: "txn-new",
          status: "processing",
          merchantTransactionId: "MERCHANT_NEW_456",
        },
      };

      queryClient.setQueryData(["/api/payments/order-info", "order-1"], expiredData);

      let orderInfoCalls = 0;
      const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/payments/phonepe/return")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "processing", message: "Processing" }),
          } as Response;
        }
        if (url === "/api/payments/phonepe/retry") {
          expect(init?.method).toBe("POST");
          return {
            ok: true,
            status: 200,
            json: async () => retryResponse,
          } as Response;
        }
        if (url === "/api/payments/order-info/order-1") {
          orderInfoCalls += 1;
          const payload = orderInfoCalls === 1 ? expiredData : refreshedData;
          return {
            ok: true,
            status: 200,
            json: async () => payload,
          } as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }) as unknown as typeof fetch;

      global.fetch = fetchMock;

      view = render(
        <QueryClientProvider client={queryClient}>
          <ThankYou />
        </QueryClientProvider>
      );

      const retryButton = await screen.findByTestId("button-phonepe-retry");
      expect(retryButton).toBeInTheDocument();

      await act(async () => {
        retryButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await waitFor(() => {
        const retryCall = fetchMock.mock.calls.find(([input]) => {
          const url = typeof input === "string" ? input : input.toString();
          return url === "/api/payments/phonepe/retry";
        });
        expect(retryCall?.[1]).toMatchObject({ method: "POST" });
      });

      await waitFor(() => {
        const badges = screen.getAllByTestId("badge-payment-status");
        expect(badges.some((badge) => /Processing/i.test(badge.textContent ?? ""))).toBe(true);
      });

      expect(screen.queryByText(/Failed to start a new PhonePe payment attempt/i)).not.toBeInTheDocument();
    } finally {
      view?.unmount();
      await cleanupQueryClient(queryClient);
    }
  });

  it("prompts the user to sign in again when order info returns 401", async () => {
    const queryClient = createTestQueryClient();
    let view: ReturnType<typeof render> | undefined;

    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/payments/phonepe/return")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "processing", message: "Processing" }),
          } as Response;
        }

        if (url === "/api/payments/order-info/order-1") {
          return {
            ok: false,
            status: 401,
            json: async () => ({ message: "Unauthorized" }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }) as unknown as typeof fetch;

      global.fetch = fetchMock;

      sessionStorage.setItem(
        "lastOrder",
        JSON.stringify({
          orderId: "order-1",
          total: "499.00",
          subtotal: "499.00",
          discountAmount: "0",
          paymentMethod: "cod",
          deliveryAddress: "123 Test Street",
          userInfo: { name: "Test User", email: "test@example.com" },
        }),
      );

      view = render(
        <QueryClientProvider client={queryClient}>
          <ThankYou />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/payments/order-info/order-1",
          expect.objectContaining({ credentials: "include" })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId("authorization-error")).toHaveTextContent(
          /Please sign in to view the latest payment status/i,
        );
      });
    } finally {
      view?.unmount();
      await cleanupQueryClient(queryClient);
    }
  });

  it("shows a permission message when order info returns 403", async () => {
    const queryClient = createTestQueryClient();
    let view: ReturnType<typeof render> | undefined;

    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.startsWith("/api/payments/phonepe/return")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ status: "processing", message: "Processing" }),
          } as Response;
        }

        if (url === "/api/payments/order-info/order-1") {
          return {
            ok: false,
            status: 403,
            json: async () => ({ message: "Forbidden" }),
          } as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        } as Response;
      }) as unknown as typeof fetch;

      global.fetch = fetchMock;

      sessionStorage.setItem(
        "lastOrder",
        JSON.stringify({
          orderId: "order-1",
          total: "499.00",
          subtotal: "499.00",
          discountAmount: "0",
          paymentMethod: "cod",
          deliveryAddress: "123 Test Street",
          userInfo: { name: "Test User", email: "test@example.com" },
        }),
      );

      view = render(
        <QueryClientProvider client={queryClient}>
          <ThankYou />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/payments/order-info/order-1",
          expect.objectContaining({ credentials: "include" })
        );
      });

      await waitFor(() => {
        expect(screen.getByTestId("authorization-error")).toHaveTextContent(
          /do not have permission to view this order/i,
        );
      });
    } finally {
      view?.unmount();
      await cleanupQueryClient(queryClient);
    }
  });
});
