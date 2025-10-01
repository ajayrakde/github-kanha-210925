import { beforeEach, describe, expect, it, vi } from "vitest";
import { phonePeIdentifierFixture } from "../../../shared/__fixtures__/upi";
import { cartItems, products } from "../../../shared/schema";

const findFirstMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    delete: vi.fn(),
    query: {
      orders: {
        findFirst: findFirstMock,
        findMany: vi.fn(),
      },
    },
  },
}));

import { CartQuantityError, OrdersRepository } from "../orders";

const repository = new OrdersRepository();

let selectResponses: Map<any, any[]>;
let insertValuesArg: any;
let insertReturnValue: any[];
let updateSetArg: any;
let updateReturnValue: any[];

beforeEach(() => {
  findFirstMock.mockReset();
  selectMock.mockReset();
  insertMock.mockReset();
  updateMock.mockReset();

  selectResponses = new Map();
  insertValuesArg = undefined;
  insertReturnValue = [];
  updateSetArg = undefined;
  updateReturnValue = [];

  const createSelectChain = (table: any) => {
    const chain: any = {};
    chain.where = vi.fn(async () => selectResponses.get(table) ?? []);
    chain.innerJoin = vi.fn(() => chain);
    return chain;
  };

  selectMock.mockImplementation(() => ({
    from: (table: any) => createSelectChain(table),
  }));

  insertMock.mockImplementation(() => ({
    values: (valuesArg: any) => {
      insertValuesArg = valuesArg;
      return {
        returning: vi.fn(async () => insertReturnValue),
      };
    },
  }));

  updateMock.mockImplementation(() => ({
    set: (setArg: any) => {
      updateSetArg = setArg;
      return {
        where: () => ({
          returning: vi.fn(async () => updateReturnValue),
        }),
      };
    },
  }));
});

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

describe("OrdersRepository.addToCart", () => {
  it("clamps additions to available stock", async () => {
    const existingItem = {
      id: "cart-1",
      sessionId: "session-1",
      productId: "product-1",
      quantity: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 5,
      },
    ]);
    selectResponses.set(cartItems, [existingItem]);

    updateReturnValue = [
      {
        ...existingItem,
        quantity: 5,
        updatedAt: new Date(),
      },
    ];

    const result = await repository.addToCart("session-1", "product-1", 3);

    expect(updateSetArg.quantity).toBe(5);
    expect(result.quantity).toBe(5);
  });

  it("caps combined quantity at the per-order maximum", async () => {
    const existingItem = {
      id: "cart-1",
      sessionId: "session-1",
      productId: "product-1",
      quantity: 9,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 50,
      },
    ]);
    selectResponses.set(cartItems, [existingItem]);

    updateReturnValue = [
      {
        ...existingItem,
        quantity: 10,
        updatedAt: new Date(),
      },
    ];

    const result = await repository.addToCart("session-1", "product-1", 5);

    expect(updateSetArg.quantity).toBe(10);
    expect(result.quantity).toBe(10);
  });

  it("inserts a new cart item when none exists", async () => {
    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 2,
      },
    ]);
    selectResponses.set(cartItems, []);

    insertReturnValue = [
      {
        id: "cart-1",
        sessionId: "session-1",
        productId: "product-1",
        quantity: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const result = await repository.addToCart("session-1", "product-1", 5);

    expect(insertValuesArg).toMatchObject({
      sessionId: "session-1",
      productId: "product-1",
      quantity: 2,
    });
    expect(result.quantity).toBe(2);
  });

  it("throws when product is out of stock", async () => {
    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 0,
      },
    ]);
    selectResponses.set(cartItems, []);

    await expect(repository.addToCart("session-1", "product-1", 1)).rejects.toBeInstanceOf(CartQuantityError);
  });
});

describe("OrdersRepository.updateCartItem", () => {
  it("clamps updates to available stock", async () => {
    const existingItem = {
      id: "cart-1",
      sessionId: "session-1",
      productId: "product-1",
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 3,
      },
    ]);
    selectResponses.set(cartItems, [existingItem]);

    updateReturnValue = [
      {
        ...existingItem,
        quantity: 3,
        updatedAt: new Date(),
      },
    ];

    const result = await repository.updateCartItem("session-1", "product-1", 5);

    expect(updateSetArg.quantity).toBe(3);
    expect(result.quantity).toBe(3);
  });

  it("returns the updated cart item when the quantity is valid", async () => {
    const existingItem = {
      id: "cart-1",
      sessionId: "session-1",
      productId: "product-1",
      quantity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 5,
      },
    ]);
    selectResponses.set(cartItems, [existingItem]);

    updateReturnValue = [
      {
        ...existingItem,
        quantity: 2,
        updatedAt: new Date(),
      },
    ];

    const result = await repository.updateCartItem("session-1", "product-1", 2);

    expect(updateSetArg.quantity).toBe(2);
    expect(result.quantity).toBe(2);
  });

  it("throws when the cart item does not exist", async () => {
    selectResponses.set(products, [
      {
        id: "product-1",
        isActive: true,
        stock: 5,
      },
    ]);
    selectResponses.set(cartItems, []);

    await expect(repository.updateCartItem("session-1", "product-1", 2)).rejects.toBeInstanceOf(CartQuantityError);
  });
});
