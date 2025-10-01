import type { Request, Response } from "express";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import type { RequireAdminMiddleware } from "../types";

const mockOrdersRepository = {
  getOrders: vi.fn(),
};

const mockUsersRepository = {
  validateAdminLogin: vi.fn(),
  getAdmin: vi.fn(),
  getAdmins: vi.fn(),
  createAdmin: vi.fn(),
  updateAdmin: vi.fn(),
  deleteAdmin: vi.fn(),
};

const mockSettingsRepository = {
  getAppSettings: vi.fn(),
  updateAppSetting: vi.fn(),
};

vi.mock("../../storage", () => ({
  ordersRepository: mockOrdersRepository,
  usersRepository: mockUsersRepository,
  settingsRepository: mockSettingsRepository,
}));

const buildResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonPayload?: any; headers?: Record<string, string> } = {
    headers: {},
  };

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;

  res.json = vi.fn((payload: any) => {
    res.jsonPayload = payload;
    return res as Response;
  }) as any;

  res.send = vi.fn(() => res as Response) as any;

  res.setHeader = vi.fn((key: string, value: string) => {
    res.headers![key] = value;
  }) as any;

  return res as Response & { statusCode?: number; jsonPayload?: any; headers: Record<string, string> };
};

const buildRequireAdmin = (): RequireAdminMiddleware => {
  return ((req, res, next) => {
    const session = (req as any).session;
    if (session?.adminId && session?.userRole === "admin") {
      next();
    } else {
      res.status(401).json({ message: "Admin access required" });
    }
  }) as RequireAdminMiddleware;
};

describe("admin routes", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalEnv;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const getOrdersExportLayers = async () => {
    const { createAdminRouter } = await import("../admin");
    const requireAdmin = buildRequireAdmin();
    const router = createAdminRouter(requireAdmin);
    const layer = router.stack.find(
      (entry: any) => entry.route?.path === "/orders/export" && entry.route?.methods?.get,
    );
    if (!layer) {
      throw new Error("Orders export route not found");
    }
    const handlers = layer.route.stack.map((stackEntry: any) => stackEntry.handle);
    return { router, handlers };
  };

  it("rejects unauthenticated order export requests", async () => {
    const { handlers } = await getOrdersExportLayers();
    const [authHandler] = handlers;
    const res = buildResponse();
    const next = vi.fn();
    const req = { session: {} } as unknown as Request;

    await authHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
    expect(next).not.toHaveBeenCalled();
    expect(mockOrdersRepository.getOrders).not.toHaveBeenCalled();
  });

  it("allows authenticated admins to export orders", async () => {
    const { handlers } = await getOrdersExportLayers();
    const [authHandler, exportHandler] = handlers;
    const res = buildResponse();
    const req = {
      session: { adminId: "admin-1", userRole: "admin" },
      query: {},
    } as unknown as Request;
    const next = vi.fn(async () => {
      await exportHandler(req, res, () => {});
    });

    mockOrdersRepository.getOrders.mockResolvedValueOnce([
      {
        id: "order-1",
        total: 1500,
        status: "delivered",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        user: { name: "Admin", phone: "1234567890", email: "admin@example.com" },
        deliveryAddress: { address: "123 Street", city: "City", pincode: "123456" },
      },
    ]);

    await authHandler(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockOrdersRepository.getOrders).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv");
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", expect.any(String));
    expect(res.send).toHaveBeenCalled();
  });
});

describe("seed accounts route", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalEnv ?? "test";
    mockUsersRepository.createAdmin.mockResolvedValue({ id: "admin-id" });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const getSeedRouteLayers = async () => {
    const { createSeedRouter } = await import("../seed");
    const requireAdmin = buildRequireAdmin();
    const router = createSeedRouter(requireAdmin);
    const envLayer = router.stack.find((entry: any) => !entry.route);
    const routeLayer = router.stack.find(
      (entry: any) => entry.route?.path === "/" && entry.route?.methods?.post,
    );
    if (!envLayer || !routeLayer) {
      throw new Error("Seed route layers not found");
    }
    const handlers = routeLayer.route.stack.map((stackEntry: any) => stackEntry.handle);
    return { envHandler: envLayer.handle, handlers };
  };

  it("rejects seeding outside approved environments", async () => {
    process.env.NODE_ENV = "production";
    const { envHandler, handlers } = await getSeedRouteLayers();
    const res = buildResponse();
    const req = { session: { adminId: "admin-1", userRole: "admin" } } as unknown as Request;
    const next = vi.fn(async () => {
      const [authHandler, seedHandler] = handlers;
      await authHandler(req, res, async () => {
        await seedHandler(req, res, () => {});
      });
    });

    await envHandler(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Account seeding is not allowed in this environment" });
    expect(mockUsersRepository.createAdmin).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated seeding requests", async () => {
    process.env.NODE_ENV = "development";
    const { envHandler, handlers } = await getSeedRouteLayers();
    const res = buildResponse();
    const req = { session: {} } as unknown as Request;

    await envHandler(req, res, async () => {
      const [authHandler, seedHandler] = handlers;
      await authHandler(req, res, async () => {
        await seedHandler(req, res, () => {});
      });
    });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
    expect(mockUsersRepository.createAdmin).not.toHaveBeenCalled();
  });

  it("allows authenticated admins to seed accounts in approved environments", async () => {
    process.env.NODE_ENV = "test";
    const { envHandler, handlers } = await getSeedRouteLayers();
    const res = buildResponse();
    const req = { session: { adminId: "admin-1", userRole: "admin" } } as unknown as Request;

    await envHandler(req, res, async () => {
      const [authHandler, seedHandler] = handlers;
      await authHandler(req, res, async () => {
        await seedHandler(req, res, () => {});
      });
    });

    expect(mockUsersRepository.createAdmin).toHaveBeenCalledWith({
      username: "admin",
      password: "password123",
      name: "Admin User",
      email: "admin@example.com",
      phone: "+919999999999",
    });
    expect(res.json).toHaveBeenCalledWith({ message: "Test accounts created successfully!" });
  });
});
