import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import type { Router } from "express";

import type { RequireAdminMiddleware } from "../types";

const mockUsersRepository = {
  getInfluencers: vi.fn(),
  createInfluencer: vi.fn(),
  deactivateInfluencer: vi.fn(),
};

vi.mock("../../storage", () => ({
  usersRepository: mockUsersRepository,
}));

const defaultRequireAdmin: RequireAdminMiddleware = (_req, _res, next) => {
  next();
};

const buildRouter = async (requireAdmin: RequireAdminMiddleware = defaultRequireAdmin) => {
  const module = await import("../influencers");
  return module.createInfluencersRouter(requireAdmin);
};

const getRouteLayer = (router: Router, method: "get" | "post" | "patch", path: string) => {
  const layer = router.stack.find(
    (entry: any) => entry.route?.path === path && entry.route?.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer;
};

const getRouteHandler = (router: Router, method: "get" | "post" | "patch", path: string) => {
  const layer = getRouteLayer(router, method, path);
  const handles = layer.route.stack;
  return handles[handles.length - 1].handle as (req: Request, res: Response) => Promise<void> | void;
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

describe("influencers router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /", () => {
    it("returns 401 when admin authentication fails", async () => {
      const requireAdmin = vi.fn<Parameters<RequireAdminMiddleware>, void>((_req, res) => {
        res.status(401).json({ message: "Admin access required" });
      });

      const router = await buildRouter(requireAdmin);
      const layer = getRouteLayer(router, "get", "/");

      const [adminMiddleware] = layer.route.stack;
      expect(adminMiddleware.handle).toBe(requireAdmin);

      const res = createMockResponse();
      const req = {} as Request;
      const next = vi.fn();

      await Promise.resolve(requireAdmin(req, res, next));

      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
      expect(mockUsersRepository.getInfluencers).not.toHaveBeenCalled();
    });

    it("returns influencers when admin authentication succeeds", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "get", "/");
      const res = createMockResponse();
      const influencers = [{ id: "1", name: "Alice" }];
      mockUsersRepository.getInfluencers.mockResolvedValueOnce(influencers);

      await handler({} as Request, res);

      expect(mockUsersRepository.getInfluencers).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(influencers);
    });
  });

  describe("POST /", () => {
    it("returns 401 when admin authentication fails", async () => {
      const requireAdmin = vi.fn<Parameters<RequireAdminMiddleware>, void>((_req, res) => {
        res.status(401).json({ message: "Admin access required" });
      });

      const router = await buildRouter(requireAdmin);
      const layer = getRouteLayer(router, "post", "/");
      const [adminMiddleware] = layer.route.stack;

      expect(adminMiddleware.handle).toBe(requireAdmin);

      const res = createMockResponse();
      const req = { body: { name: "Bob" } } as Request;
      const next = vi.fn();

      await Promise.resolve(requireAdmin(req, res, next));

      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
      expect(mockUsersRepository.createInfluencer).not.toHaveBeenCalled();
    });

    it("creates a new influencer when admin authentication succeeds", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "post", "/");
      const res = createMockResponse();
      const req = { body: { name: "Bob" } } as Request;
      const influencer = { id: "2", name: "Bob" };
      mockUsersRepository.createInfluencer.mockResolvedValueOnce(influencer);

      await handler(req, res);

      expect(mockUsersRepository.createInfluencer).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(influencer);
    });
  });

  describe("PATCH /:id/deactivate", () => {
    it("returns 401 when admin authentication fails", async () => {
      const requireAdmin = vi.fn<Parameters<RequireAdminMiddleware>, void>((_req, res) => {
        res.status(401).json({ message: "Admin access required" });
      });

      const router = await buildRouter(requireAdmin);
      const layer = getRouteLayer(router, "patch", "/:id/deactivate");
      const [adminMiddleware] = layer.route.stack;

      expect(adminMiddleware.handle).toBe(requireAdmin);

      const res = createMockResponse();
      const req = { params: { id: "3" } } as unknown as Request;
      const next = vi.fn();

      await Promise.resolve(requireAdmin(req, res, next));

      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
      expect(mockUsersRepository.deactivateInfluencer).not.toHaveBeenCalled();
    });

    it("deactivates the influencer when admin authentication succeeds", async () => {
      const router = await buildRouter();
      const handler = getRouteHandler(router, "patch", "/:id/deactivate");
      const res = createMockResponse();
      const req = { params: { id: "3" } } as unknown as Request;

      mockUsersRepository.deactivateInfluencer.mockResolvedValueOnce(undefined);

      await handler(req, res);

      expect(mockUsersRepository.deactivateInfluencer).toHaveBeenCalledWith("3");
      expect(res.json).toHaveBeenCalledWith({ message: "Influencer deactivated successfully" });
    });
  });
});
