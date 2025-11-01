import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import useUpiPaymentState, { UPI_QR_PLACEHOLDER_DATA_URL } from "../use-upi-payment-state";
import type { UseMutationResult } from "@tanstack/react-query";

const toDataURLMock = vi.fn();

vi.mock("qrcode", () => ({
  toDataURL: (...args: unknown[]) => toDataURLMock(...args),
}));

const createMutationStub = <T,>(data?: T): UseMutationResult<T | undefined, unknown, void, unknown> =>
  ({
    data,
  } as UseMutationResult<T | undefined, unknown, void, unknown>);

describe("useUpiPaymentState", () => {
  beforeEach(() => {
    toDataURLMock.mockReset();
    toDataURLMock.mockResolvedValue("data:image/png;base64,qr");
  });

  it("builds a canonical UPI url with merchant metadata and merchant transaction id", async () => {
    const phonePeMutation = createMutationStub({ merchantTransactionId: "txn-123", tokenUrl: "https://phonepe.example/pay" });

    const { result } = renderHook(() =>
      useUpiPaymentState({
        amount: "499.00",
        currency: "INR",
        merchant: {
          name: "Kanha Retail",
          vpa: "kanharetail@upi",
          code: "0000",
          transactionNote: "Order order-1",
        },
        phonePeMutation,
      })
    );

    await waitFor(() => {
      expect(result.current.upiQrDataUrl).toBe("data:image/png;base64,qr");
    });

    expect(result.current.upiUrl).toContain("pa=kanharetail%40upi");
    expect(result.current.upiUrl).toContain("am=499.00");
    expect(result.current.upiUrl).toContain("tr=txn-123");
    expect(result.current.shareableCheckoutUrl).toBe("https://phonepe.example/pay");
    expect(result.current.widgetStatus).toBe("awaiting");
  });

  it("maps backend statuses to widget states", () => {
    const phonePeMutation = createMutationStub(undefined);

    const { result } = renderHook(() =>
      useUpiPaymentState({
        amount: 100,
        currency: "INR",
        merchant: { vpa: "kanharetail@upi" },
        phonePeMutation,
      })
    );

    act(() => {
      expect(result.current.applyGatewayStatus("PENDING")).toBe("awaiting");
    });

    act(() => {
      expect(result.current.applyGatewayStatus("FAILED", "TOKEN_EXPIRED")).toBe("expired");
    });

    act(() => {
      expect(result.current.applyGatewayStatus("FAILED", "UNKNOWN")).toBe("failed");
    });

    act(() => {
      expect(result.current.applyGatewayStatus("COMPLETED")).toBe("success");
    });
  });

  it("falls back to the placeholder QR when generation fails", async () => {
    toDataURLMock.mockRejectedValueOnce(new Error("boom"));
    const phonePeMutation = createMutationStub(undefined);

    const { result } = renderHook(() =>
      useUpiPaymentState({
        amount: 120,
        currency: "INR",
        merchant: { vpa: "kanharetail@upi" },
        phonePeMutation,
      })
    );

    await waitFor(() => {
      expect(result.current.upiQrDataUrl).toBe(UPI_QR_PLACEHOLDER_DATA_URL);
    });

    expect(result.current.isQrPlaceholder).toBe(true);
  });
});
