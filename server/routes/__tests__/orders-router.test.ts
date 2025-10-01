import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Response, Router } from "express";
import type { RequireAdminMiddleware, SessionRequest } from "../types";

const mockOrdersRepository = {
  getOrders: vi.fn(),
  getOrdersByInfluencer: vi.fn(),
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

describe("orders router access control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const runRoute = async (
    router: Router,
    path: string,
    req: Partial<SessionRequest>,
    res: Response,
  ) => {
    const layer = getRouteLayer(router, "get", path);
    await layer.route.stack[0].handle(req, res, () => {});
  };

  describe("GET /", () => {
    it("returns 401 when no session is present", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = { query: {}, session: {} } as Partial<SessionRequest>;

      await runRoute(router, "/", req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(mockOrdersRepository.getOrders).not.toHaveBeenCalled();
      expect(mockOrdersRepository.getOrdersByInfluencer).not.toHaveBeenCalled();
    });

    it("returns 403 when a buyer tries to list all orders", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        query: {},
        session: { userRole: "buyer", userId: "buyer-1" },
      } as Partial<SessionRequest>;

      await runRoute(router, "/", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" });
      expect(mockOrdersRepository.getOrders).not.toHaveBeenCalled();
      expect(mockOrdersRepository.getOrdersByInfluencer).not.toHaveBeenCalled();
    });

    it("allows admins to retrieve the order list with filters", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        query: { status: "pending", startDate: "2024-01-01", endDate: "2024-01-31" },
        session: { userRole: "admin", adminId: "admin-1" },
      } as Partial<SessionRequest>;

      const orders = [{ id: "order-1" }];
      mockOrdersRepository.getOrders.mockResolvedValueOnce(orders);

      await runRoute(router, "/", req, res);

      expect(mockOrdersRepository.getOrders).toHaveBeenCalledWith({
        status: "pending",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });
      expect(res.json).toHaveBeenCalledWith(orders);
    });

    it("allows influencers to retrieve orders tied to their offers", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        query: {},
        session: { userRole: "influencer", influencerId: "inf-1" },
      } as Partial<SessionRequest>;

      const orders = [{ id: "order-2" }];
      mockOrdersRepository.getOrdersByInfluencer.mockResolvedValueOnce(orders);

      await runRoute(router, "/", req, res);

      expect(mockOrdersRepository.getOrdersByInfluencer).toHaveBeenCalledWith("inf-1");
      expect(res.json).toHaveBeenCalledWith(orders);
    });
  });

  describe("GET /:id", () => {
    it("returns 401 when no session is present", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: {},
      } as Partial<SessionRequest>;

      await runRoute(router, "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Authentication required" });
      expect(mockOrdersRepository.getOrder).not.toHaveBeenCalled();
    });

    it("allows admins to fetch a single order", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: { userRole: "admin", adminId: "admin-1" },
      } as Partial<SessionRequest>;

      const order = { id: "order-1" };
      mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

      await runRoute(router, "/:id", req, res);

      expect(mockOrdersRepository.getOrder).toHaveBeenCalledWith("order-1");
      expect(res.json).toHaveBeenCalledWith(order);
    });

    it("allows buyers to fetch their own order", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: { userRole: "buyer", userId: "buyer-1" },
      } as Partial<SessionRequest>;

      const order = { id: "order-1", userId: "buyer-1" };
      mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

      await runRoute(router, "/:id", req, res);

      expect(res.json).toHaveBeenCalledWith(order);
    });

    it("prevents buyers from accessing other users' orders", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: { userRole: "buyer", userId: "buyer-1" },
      } as Partial<SessionRequest>;

      const order = { id: "order-1", userId: "buyer-2" };
      mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

      await runRoute(router, "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" });
    });

    it("allows influencers to fetch orders containing their offers", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: { userRole: "influencer", influencerId: "inf-1" },
      } as Partial<SessionRequest>;

      const order = { id: "order-1", offer: { influencerId: "inf-1" } };
      mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

      await runRoute(router, "/:id", req, res);

      expect(res.json).toHaveBeenCalledWith(order);
    });

    it("prevents influencers from accessing unrelated orders", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "order-1" },
        session: { userRole: "influencer", influencerId: "inf-1" },
      } as Partial<SessionRequest>;

      const order = { id: "order-1", offer: { influencerId: "inf-2" } };
      mockOrdersRepository.getOrder.mockResolvedValueOnce(order);

      await runRoute(router, "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Access denied" });
    });

    it("returns 404 when the order is not found", async () => {
      const router = await buildRouter();
      const res = createMockResponse();
      const req = {
        params: { id: "missing-order" },
        session: { userRole: "admin", adminId: "admin-1" },
      } as Partial<SessionRequest>;

      mockOrdersRepository.getOrder.mockResolvedValueOnce(undefined);

      await runRoute(router, "/:id", req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Order not found" });
    });
  });
});
