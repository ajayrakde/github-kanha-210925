import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ThankYou from "../thank-you";
import { phonePeIdentifierFixture } from "@shared/__fixtures__/upi";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["", setLocationMock],
}));

describe("Thank-you page", () => {
  beforeEach(() => {
    setLocationMock.mockReset();
    sessionStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "processing", message: "Processing" }),
    }) as unknown as typeof fetch;
    window.history.replaceState({}, "", "/thank-you?orderId=order-1");
  });

  it("updates from processing to confirmed and shows UPI metadata", async () => {
    const queryClient = new QueryClient();
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

    render(
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
      },
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
    expect(screen.getByText(phonePeIdentifierFixture.maskedUtr)).toBeInTheDocument();
    expect(screen.getByText(phonePeIdentifierFixture.maskedVpa)).toBeInTheDocument();
    expect(screen.getByText(phonePeIdentifierFixture.label)).toBeInTheDocument();
  });

  it("renders failure state with retry action when the latest attempt failed", async () => {
    const queryClient = new QueryClient();
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

    queryClient.setQueryData(["/api/payments/order-info", "order-1"], failedData);

    render(
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
  });

  it("shows a PhonePe start-again CTA for expired reconciliation and triggers a retry", async () => {
    const queryClient = new QueryClient();
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

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/payments/phonepe/return")) {
        return {
          ok: true,
          json: async () => ({ status: "processing", message: "Processing" }),
        } as Response;
      }
      if (url === "/api/payments/phonepe/retry") {
        expect(init?.method).toBe("POST");
        return {
          ok: true,
          json: async () => retryResponse,
        } as Response;
      }
      if (url === "/api/payments/order-info/order-1") {
        return {
          ok: true,
          json: async () => refreshedData,
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }) as unknown as typeof fetch;

    global.fetch = fetchMock;

    render(
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
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/payments/phonepe/retry",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      const badges = screen.getAllByTestId("badge-payment-status");
      expect(badges.some((badge) => /Processing/i.test(badge.textContent ?? ""))).toBe(true);
    });

    expect(screen.queryByText(/Failed to start a new PhonePe payment attempt/i)).not.toBeInTheDocument();
  });
});
