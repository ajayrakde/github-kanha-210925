import type { Response, Router } from "express";
import { describe, expect, it, vi } from "vitest";

import { createObjectStorageRouter } from "../object-storage";
import type { RequireAdminMiddleware, SessionRequest } from "../types";

type RouteMethod = "post" | "get" | "delete" | "patch";

const getRouteLayer = (router: Router, method: RouteMethod, path: string) => {
  const layers: Array<any> = ((router as unknown as { stack: Array<any> }).stack) ?? [];
  const layer = layers.find(
    (entry) => entry.route?.path === path && entry.route?.methods?.[method],
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }
  return layer;
};

const buildResponse = () => {
  const res: Partial<Response> & { statusCode?: number; jsonPayload?: unknown } = {};

  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as any;

  res.json = vi.fn((payload: unknown) => {
    res.jsonPayload = payload;
    return res as Response;
  }) as any;

  return res as Response & { statusCode?: number; jsonPayload?: unknown };
};

describe("object storage router", () => {
  it("rejects anonymous upload attempts", async () => {
    const requireAdmin: RequireAdminMiddleware = vi.fn(
      (_req: SessionRequest, res: Response) => {
        res.status(401).json({ message: "Admin access required" });
      },
    );

    const getObjectEntityUploadURL = vi.fn();
    const router = createObjectStorageRouter(requireAdmin, {
      getObjectEntityUploadURL,
    } as any);

    const layer = getRouteLayer(router, "post", "/upload");
    const [middlewareLayer] = layer.route.stack;

    const req = { headers: {} } as SessionRequest;
    const res = buildResponse();
    const next = vi.fn();

    await middlewareLayer.handle(req as any, res as any, next);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin access required" });
    expect(next).not.toHaveBeenCalled();
    expect(getObjectEntityUploadURL).not.toHaveBeenCalled();
  });

  it("allows admins to obtain upload links", async () => {
    const requireAdmin: RequireAdminMiddleware = vi.fn(
      (_req: SessionRequest, _res: Response, next: () => void) => {
        next();
      },
    );

    const uploadURL = "https://example.com/upload";
    const getObjectEntityUploadURL = vi.fn(async () => uploadURL);

    const router = createObjectStorageRouter(requireAdmin, {
      getObjectEntityUploadURL,
    } as any);

    const layer = getRouteLayer(router, "post", "/upload");
    const [middlewareLayer, handlerLayer] = layer.route.stack;

    const req = { headers: { "content-length": "0" } } as SessionRequest;
    const res = buildResponse();
    const next = vi.fn();

    await middlewareLayer.handle(req as any, res as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    await handlerLayer.handle(req as any, res as any, vi.fn());

    expect(getObjectEntityUploadURL).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({ uploadURL });
  });
});
