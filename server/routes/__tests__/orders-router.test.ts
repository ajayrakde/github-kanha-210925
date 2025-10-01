import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response, Router } from "express";
import type { RequireAdminMiddleware } from "../types";

const mockOrdersRepository = {
  getOrders: vi.fn(),
  getOrder: vi.fn(),
  getCartItems: vi.fn(),
  createOrder: vi.fn(),
  createOrderItems: vi.fn(),
  clearCart: vi.fn(),
};

const mockUsersRepository = {
  getUserAddresses: vi.fn(),
  createUserAddress: vi.fn(),
  setPreferredAddress: vi.fn(),
  updateUser: vi.fn(),
};

const mockOffersRepository = {
  getOfferByCode: vi.fn(),
  createOfferRedemption: vi.fn(),
  incrementOfferUsage: vi.fn(),
};

const mockShippingRepository = {
  calculateShippingCharge: vi.fn(),
};

vi.mock("../../storage", () => ({
  ordersRepository: mockOrdersRepository,
  usersRepository: mockUsersRepository,
  offersRepository: mockOffersRepository,
  shippingRepository: mockShippingRepository,
}));

const buildRouter = async (requireAdmin?: RequireAdminMiddleware) => {
  const module = await import("../orders");
  const defaultRequireAdmin: RequireAdminMiddleware = (_req, _res, next) => {
    next();
  };
  return module.createOrdersRouter(requireAdmin ?? defaultRequireAdmin);
};

const getRouteLayer = (router: Router, method: "get", path: string) => {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method],
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer;
};

const createMockResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonPayload?: any } = {};

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;

  res.json = vi.fn((payload: any) => {
    res.jsonPayload = payload;
    return res as Response;
  }) as any;

  return res as Response & { statusCode?: number; jsonPayload?: any };
};

describe("orders router admin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const invokeRouteStack = async (
    router: Router,
    path: string,
    req: Partial<Request>,
    res: Response,
  ) => {
    const layer = getRouteLayer(router, "get", path);
    const [adminMiddleware, handler] = layer.route.stack;

    await new Promise<void>((resolve, reject) => {
      try {
        adminMiddleware.handle(req, res, async () => {
          try {
            await handler.handle(req, res, () => {});
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  it("returns 401 when non-admins request the order list", async () => {
    const requireAdminMock = vi.fn((_req: Request, res: Response) => {
      res.status(401).json({ message: "Admin access required" });
    });

    const router = await buildRouter(requireAdminMock);
    const layer = getRouteLayer(router, "get", "/");
    const res = createMockResponse();
    const req = { query: {} } as Request;

    await layer.route.stack[0].handle(req, res, () => {});

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
    expect(mockOrdersRepository.getOrders).not.toHaveBeenCalled();
  });

  it("allows admins to retrieve the order list", async () => {
    const requireAdminMock = vi.fn((_req: Request, _res: Response, next: () => void) => {
      next();
    });
    const router = await buildRouter(requireAdminMock);
    const res = createMockResponse();
    const req = { query: {} } as Request;

    const orders = [{ id: "order-1" }];
    mockOrdersRepository.getOrders.mockResolvedValueOnce(orders);

    await invokeRouteStack(router, "/", req, res);

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(mockOrdersRepository.getOrders).toHaveBeenCalledWith(undefined);
    expect(res.json).toHaveBeenCalledWith(orders);
  });

  it("returns 401 when non-admins request an order by id", async () => {
    const requireAdminMock = vi.fn((_req: Request, res: Response) => {
      res.status(401).json({ message: "Admin access required" });
    });

    const router = await buildRouter(requireAdminMock);
    const layer = getRouteLayer(router, "get", "/:id");
    const res = createMockResponse();
    const req = { params: { id: "order-1" } } as unknown as Request;

    await layer.route.stack[0].handle(req, res, () => {});

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
    expect(mockOrdersRepository.getOrder).not.toHaveBeenCalled();
  });

  it("allows admins to fetch a single order", async () => {
    const requireAdminMock = vi.fn((_req: Request, _res: Response, next: () => void) => {
      next();
    });

    const router = await buildRouter(requireAdminMock);
    const res = createMockResponse();
    const req = { params: { id: "order-1" } } as unknown as Request;

    const order = { id: "order-1" };
    mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

    await invokeRouteStack(router, "/:id", req, res);

    expect(requireAdminMock).toHaveBeenCalledTimes(1);
    expect(mockOrdersRepository.getOrder).toHaveBeenCalledWith("order-1");
    expect(res.json).toHaveBeenCalledWith(order);
  });
});
