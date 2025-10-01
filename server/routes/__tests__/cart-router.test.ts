import type { Request, Response, Router } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCartRouter } from "../cart";
import type { SessionRequest } from "../types";

const getCartItemsMock = vi.hoisted(() => vi.fn());
const addToCartMock = vi.hoisted(() => vi.fn());
const updateCartItemMock = vi.hoisted(() => vi.fn());
const removeFromCartMock = vi.hoisted(() => vi.fn());
const clearCartMock = vi.hoisted(() => vi.fn());

const MIN_CART_ITEM_QUANTITY = vi.hoisted(() => 1);
const MAX_CART_ITEM_QUANTITY = vi.hoisted(() => 10);

const CartQuantityErrorMock = vi.hoisted(
  () =>
    class CartQuantityError extends Error {
      constructor(message?: string) {
        super(message);
        this.name = "CartQuantityError";
      }
    },
);

const CartQuantityError = CartQuantityErrorMock;

vi.mock("../../storage", () => ({
  ordersRepository: {
    getCartItems: getCartItemsMock,
    addToCart: addToCartMock,
    updateCartItem: updateCartItemMock,
    removeFromCart: removeFromCartMock,
    clearCart: clearCartMock,
  },
}));

vi.mock("../../storage/orders", () => ({
  CartQuantityError: CartQuantityErrorMock,
  MIN_CART_ITEM_QUANTITY,
  MAX_CART_ITEM_QUANTITY,
}));

const buildRouter = () => createCartRouter();

const getRouteHandler = (
  router: Router,
  method: "get" | "post" | "patch" | "delete",
  path: string,
) => {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method],
  );

  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  const handles = layer.route.stack;
  const target = handles[handles.length - 1];
  return target.handle as (req: Request, res: Response, next: () => void) => Promise<void> | void;
};

const buildResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonPayload?: any } = {
    statusCode: 200,
  };

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;

  res.json = vi.fn((payload: any) => {
    res.jsonPayload = payload;
    return res as Response;
  }) as any;

  return res as Response & { statusCode: number; jsonPayload: any };
};

const buildRequest = (overrides: Partial<SessionRequest> = {}): SessionRequest => {
  return {
    body: {},
    params: {},
    session: { sessionId: "session-1" },
    ...overrides,
  } as SessionRequest;
};

beforeEach(() => {
  getCartItemsMock.mockReset();
  addToCartMock.mockReset();
  updateCartItemMock.mockReset();
  removeFromCartMock.mockReset();
  clearCartMock.mockReset();
});

describe("cart router quantity validation", () => {
  it("rejects negative quantities when adding to the cart", async () => {
    const router = buildRouter();
    const handler = getRouteHandler(router, "post", "/add");
    const req = buildRequest({ body: { productId: "product-1", quantity: -1 } });
    const res = buildResponse();

    await handler(req as unknown as Request, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.jsonPayload.message).toContain("Quantity");
    expect(addToCartMock).not.toHaveBeenCalled();
  });

  it("rejects quantities above the configured maximum", async () => {
    const router = buildRouter();
    const handler = getRouteHandler(router, "post", "/add");
    const req = buildRequest({
      body: { productId: "product-1", quantity: MAX_CART_ITEM_QUANTITY + 1 },
    });
    const res = buildResponse();

    await handler(req as unknown as Request, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.jsonPayload.message).toContain(`${MIN_CART_ITEM_QUANTITY} and ${MAX_CART_ITEM_QUANTITY}`);
    expect(addToCartMock).not.toHaveBeenCalled();
  });

  it("updates the cart when the requested quantity is valid", async () => {
    const router = buildRouter();
    const handler = getRouteHandler(router, "patch", "/:productId");
    const expectedItem = { id: "cart-1", productId: "product-1", quantity: 3 };
    updateCartItemMock.mockResolvedValue(expectedItem);

    const req = buildRequest({
      params: { productId: "product-1" },
      body: { quantity: 3 },
    });
    const res = buildResponse();

    await handler(req as unknown as Request, res, () => {});

    expect(updateCartItemMock).toHaveBeenCalledWith("session-1", "product-1", 3);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.jsonPayload).toEqual(expectedItem);
  });

  it("returns 400 when repository clamps due to stock issues", async () => {
    const router = buildRouter();
    const handler = getRouteHandler(router, "patch", "/:productId");
    updateCartItemMock.mockRejectedValue(new CartQuantityError("Product is out of stock"));

    const req = buildRequest({
      params: { productId: "product-1" },
      body: { quantity: 2 },
    });
    const res = buildResponse();

    await handler(req as unknown as Request, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.jsonPayload.message).toBe("Product is out of stock");
  });
});
