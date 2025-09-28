import { describe, expect, it } from "vitest";
import { buildOrderPaymentSummary } from "../order-summary";
import type { PaymentStatus, RefundStatus } from "../../../shared/payment-types";

const baseOrder = {
  id: "order-1",
  status: "pending",
  total: "499.00",
  amountMinor: 49900,
  currency: "INR" as const,
  createdAt: new Date("2024-01-01T10:00:00Z"),
  updatedAt: new Date("2024-01-01T10:00:00Z"),
  paymentMethod: "upi",
};

const paymentRecord = (
  overrides: Partial<{
    id: string;
    status: PaymentStatus;
    amountAuthorizedMinor: number | null;
    amountCapturedMinor: number | null;
    createdAt: Date;
    updatedAt: Date | null;
    methodKind: string | null;
  }> = {}
) => ({
  id: overrides.id ?? "payment-1",
  provider: "razorpay",
  providerPaymentId: "order_DB123",
  providerOrderId: "order_DB123",
  status: overrides.status ?? "captured",
  amountAuthorizedMinor: overrides.amountAuthorizedMinor ?? 49900,
  amountCapturedMinor: overrides.amountCapturedMinor ?? 49900,
  currency: "INR" as const,
  methodKind: overrides.methodKind ?? "upi",
  createdAt: overrides.createdAt ?? new Date("2024-01-01T10:05:00Z"),
  updatedAt: overrides.updatedAt ?? new Date("2024-01-01T10:06:00Z"),
});

const refundRecord = (
  overrides: Partial<{
    amountMinor: number;
    status: RefundStatus;
    createdAt: Date;
    updatedAt: Date | null;
  }> = {}
) => ({
  amountMinor: overrides.amountMinor ?? 19900,
  status: overrides.status ?? "completed",
  createdAt: overrides.createdAt ?? new Date("2024-01-02T08:00:00Z"),
  updatedAt: overrides.updatedAt ?? new Date("2024-01-02T08:05:00Z"),
});

describe("buildOrderPaymentSummary", () => {
  it("returns pending status when no payments exist", () => {
    const summary = buildOrderPaymentSummary(baseOrder, [], []);

    expect(summary.order.paymentStatus).toBe("pending");
    expect(summary.transactions).toHaveLength(0);
    expect(summary.totalPaid).toBe(0);
    expect(summary.totalRefunded).toBe(0);
  });

  it("calculates totals and marks order as paid when payment captured", () => {
    const summary = buildOrderPaymentSummary(baseOrder, [paymentRecord()], []);

    expect(summary.order.paymentStatus).toBe("paid");
    expect(summary.transactions).toHaveLength(1);
    expect(summary.totalPaid).toBeCloseTo(499);
    expect(summary.totalRefunded).toBe(0);
    expect(summary.latestTransaction?.id).toBe("payment-1");
  });

  it("prioritises refund status and aggregates refund totals", () => {
    const summary = buildOrderPaymentSummary(
      baseOrder,
      [paymentRecord({ status: "refunded" })],
      [refundRecord({ amountMinor: 49900 })]
    );

    expect(summary.order.paymentStatus).toBe("refunded");
    expect(summary.totalPaid).toBeCloseTo(499);
    expect(summary.totalRefunded).toBeCloseTo(499);
  });

  it("uses most recent payment information for method and ordering", () => {
    const summary = buildOrderPaymentSummary(
      baseOrder,
      [
        paymentRecord({
          id: "payment-older",
          status: "created",
          amountCapturedMinor: 0,
          updatedAt: new Date("2024-01-01T09:00:00Z"),
        }),
        paymentRecord({
          id: "payment-newer",
          methodKind: "card",
          createdAt: new Date("2024-01-01T11:00:00Z"),
          updatedAt: new Date("2024-01-01T11:01:00Z"),
        }),
      ],
      []
    );

    expect(summary.order.paymentMethod).toBe("card");
    expect(summary.transactions[0].id).toBe("payment-newer");
  });
});
