import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Router, Response } from "express";
import type { SessionRequest } from "../types";

const mockOtpService = {
  verifyOtp: vi.fn(),
};

const mockUsersRepository = {
  getUser: vi.fn(),
  authenticateAdmin: vi.fn(),
  authenticateInfluencer: vi.fn(),
  authenticateUser: vi.fn(),
};

const mockOrdersRepository = {
  getOrdersByUser: vi.fn(),
  getLastOrderAddress: vi.fn(),
};

const mockSettingsRepository = {
  getAppSetting: vi.fn(),
};

vi.mock("../../otp-service", () => ({
  otpService: mockOtpService,
}));

vi.mock("../../storage", () => ({
  settingsRepository: mockSettingsRepository,
  usersRepository: mockUsersRepository,
  ordersRepository: mockOrdersRepository,
}));

const buildRouter = async () => {
  const module = await import("../auth");
  return module.createAuthRouter();
};

const getRouteLayer = (router: Router, method: "get" | "post", path: string) => {
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

describe("auth router sanitization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const runRoute = async (
    router: Router,
    method: "get" | "post",
    path: string,
    req: Partial<SessionRequest>,
    res: Response,
  ) => {
    const layer = getRouteLayer(router, method, path);
    await layer.route.stack[0].handle(req, res, () => {});
  };

  it("omits password hashes from OTP buyer login responses", async () => {
    const router = await buildRouter();
    const res = createMockResponse();
    const req = {
      body: { phone: "9876543210", otp: "123456" },
      session: {},
    } as Partial<SessionRequest>;

    mockOtpService.verifyOtp.mockResolvedValueOnce({
      success: true,
      user: {
        id: "buyer-1",
        phone: "9876543210",
        name: "Test Buyer",
        password: "hashed-password",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isNewUser: false,
    });

    await runRoute(router, "post", "/login", req, res);

    expect(res.json).toHaveBeenCalled();
    expect(res.jsonPayload?.user).toMatchObject({
      id: "buyer-1",
      phone: "9876543210",
      name: "Test Buyer",
    });
    expect(res.jsonPayload?.user).not.toHaveProperty("password");
  });

  it("omits password hashes when verifying admin OTP", async () => {
    const router = await buildRouter();
    const res = createMockResponse();
    const req = {
      body: { phone: "9876543210", otp: "654321", userType: "admin" },
      session: {},
    } as Partial<SessionRequest>;

    mockOtpService.verifyOtp.mockResolvedValueOnce({
      success: true,
      message: "OTP verified successfully",
      user: {
        id: "admin-1",
        phone: "9876543210",
        name: "Admin User",
        password: "hashed-admin-password",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      isNewUser: false,
    });

    await runRoute(router, "post", "/verify-otp", req, res);

    expect(res.json).toHaveBeenCalled();
    expect(res.jsonPayload?.user).toMatchObject({
      id: "admin-1",
      phone: "9876543210",
      name: "Admin User",
      isActive: true,
    });
    expect(res.jsonPayload?.user).not.toHaveProperty("password");
  });

  it("omits password hashes from /me responses", async () => {
    const router = await buildRouter();
    const res = createMockResponse();
    const req = {
      session: { userId: "buyer-1", userRole: "buyer" },
    } as Partial<SessionRequest>;

    mockUsersRepository.getUser.mockResolvedValueOnce({
      id: "buyer-1",
      phone: "9876543210",
      name: "Buyer Name",
      password: "stored-password",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await runRoute(router, "get", "/me", req, res);

    expect(res.json).toHaveBeenCalledWith({
      authenticated: true,
      user: expect.objectContaining({ id: "buyer-1", name: "Buyer Name" }),
    });
    expect(res.jsonPayload?.user).not.toHaveProperty("password");
  });

  it("omits password hashes from password login responses", async () => {
    const router = await buildRouter();
    const res = createMockResponse();
    const req = {
      body: { phone: "9876543210", password: "secret", userType: "influencer" },
      session: {},
    } as Partial<SessionRequest>;

    mockUsersRepository.authenticateInfluencer.mockResolvedValueOnce({
      id: "influencer-1",
      phone: "9876543210",
      name: "Influencer User",
      email: "influencer@example.com",
      password: "hashed-influencer-password",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await runRoute(router, "post", "/login-password", req, res);

    expect(res.json).toHaveBeenCalledWith({
      message: "Login successful",
      user: expect.objectContaining({
        id: "influencer-1",
        name: "Influencer User",
        email: "influencer@example.com",
      }),
    });
    expect(res.jsonPayload?.user).not.toHaveProperty("password");
  });
});
