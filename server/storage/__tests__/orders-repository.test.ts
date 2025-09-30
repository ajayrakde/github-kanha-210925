import { beforeEach, describe, expect, it, vi } from "vitest";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";

const findFirstMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: {
    query: {
      orders: {
        findFirst: findFirstMock,
        findMany: vi.fn(),
      },
    },
  },
}));

import { OrdersRepository } from "../orders";

const repository = new OrdersRepository();

describe("OrdersRepository.getOrderWithPayments", () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it("returns masked PhonePe identifiers from stored payments", async () => {
    findFirstMock.mockResolvedValue({
      id: "order-1",
      status: "processing",
      paymentStatus: "processing",
      paymentMethod: "upi",
      total: "100.00",
      shippingCharge: "0.00",
      createdAt: new Date("2024-01-01T00:00:00Z"),
      updatedAt: new Date("2024-01-01T00:00:00Z"),
      user: {},
      deliveryAddress: {},
      payments: [
        {
          id: "pay-1",
          status: "processing",
          provider: "phonepe",
          methodKind: "upi",
          amountAuthorizedMinor: 1000,
          amountCapturedMinor: 0,
          amountRefundedMinor: 0,
          providerPaymentId: "mtid",
          providerReferenceId: "ref",
          providerTransactionId: "txn",
          upiPayerHandle: phonePeIdentifierFixture.maskedVpa,
          upiUtr: phonePeIdentifierFixture.maskedUtr,
          upiInstrumentVariant: phonePeIdentifierFixture.variant,
          receiptUrl: "https://receipt",
          createdAt: new Date("2024-01-01T00:05:00Z"),
          updatedAt: new Date("2024-01-01T00:06:00Z"),
        },
      ],
    });

    const result = await repository.getOrderWithPayments("order-1");

    expect(findFirstMock).toHaveBeenCalled();
    expect(result?.payments).toHaveLength(1);
    const payment = result?.payments?.[0];
    expect(payment?.upiPayerHandle).toBe(phonePeIdentifierFixture.maskedVpa);
    expect(payment?.upiUtr).toBe(phonePeIdentifierFixture.maskedUtr);
    expect(payment?.upiInstrumentVariant).toBe(phonePeIdentifierFixture.variant);
  });
});
