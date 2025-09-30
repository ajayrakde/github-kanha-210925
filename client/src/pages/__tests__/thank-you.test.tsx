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
});
