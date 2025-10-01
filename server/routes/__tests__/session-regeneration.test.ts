import express from "express";
import session from "express-session";
import request from "supertest";
import type { SuperAgentTest } from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAuthRouter } from "../auth";
import { createAdminRouter } from "../admin";
import { createInfluencerAuthRouter } from "../influencers";
import type { RequireAdminMiddleware, SessionRequest } from "../types";

const verifyOtpMock = vi.hoisted(() => vi.fn());
const authenticateAdminMock = vi.hoisted(() => vi.fn());
const authenticateInfluencerMock = vi.hoisted(() => vi.fn());
const authenticateUserMock = vi.hoisted(() => vi.fn());
const validateAdminLoginMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../otp-service", () => ({
  otpService: {
    verifyOtp: verifyOtpMock,
    sendOtp: vi.fn(),
  },
}));

vi.mock("../../storage", () => ({
  ordersRepository: {
    getOrders: vi.fn(),
    getOrdersByUser: vi.fn(),
  },
  settingsRepository: {
    getAppSettings: vi.fn(),
    updateAppSetting: vi.fn(),
  },
  usersRepository: {
    authenticateAdmin: authenticateAdminMock,
    authenticateInfluencer: authenticateInfluencerMock,
    authenticateUser: authenticateUserMock,
    createAdmin: vi.fn(),
    createInfluencer: vi.fn(),
    deactivateInfluencer: vi.fn(),
    getAdmin: vi.fn(),
    getAdmins: vi.fn(),
    getInfluencer: vi.fn(),
    getInfluencers: vi.fn(),
    getUser: getUserMock,
    getUserAddresses: vi.fn().mockResolvedValue([]),
    createUserAddress: vi.fn(),
    setPreferredAddress: vi.fn(),
    deleteUserAddress: vi.fn(),
    validateAdminLogin: validateAdminLoginMock,
  },
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }),
  );

  app.use((req, _res, next) => {
    const sessionReq = req as SessionRequest;
    if (!sessionReq.session.sessionId) {
      sessionReq.session.sessionId = `sess_${Math.random().toString(36).slice(2)}`;
    }
    next();
  });

  app.get("/session-info", (req, res) => {
    const sessionReq = req as SessionRequest;
    res.json({
      sessionId: req.sessionID,
      cartSessionId: sessionReq.session.sessionId ?? null,
      adminId: sessionReq.session.adminId ?? null,
      influencerId: sessionReq.session.influencerId ?? null,
      userId: sessionReq.session.userId ?? null,
      role: sessionReq.session.userRole ?? null,
    });
  });

  const requireAdmin: RequireAdminMiddleware = (_req, _res, next) => next();

  app.use("/api/auth", createAuthRouter());
  app.use("/api/admin", createAdminRouter(requireAdmin));
  app.use("/api/influencer", createInfluencerAuthRouter());

  return app;
};

const getSessionSnapshot = async (agent: SuperAgentTest) => {
  const response = await agent.get("/session-info");
  expect(response.status).toBe(200);
  return response.body as {
    sessionId: string;
    cartSessionId: string | null;
    adminId: string | null;
    influencerId: string | null;
    userId: string | null;
    role: string | null;
  };
};

describe("session regeneration on login", () => {
  beforeEach(() => {
    verifyOtpMock.mockReset();
    authenticateAdminMock.mockReset();
    authenticateInfluencerMock.mockReset();
    authenticateUserMock.mockReset();
    validateAdminLoginMock.mockReset();
    getUserMock.mockReset();
  });

  it("rotates the session id when a buyer logs in with OTP", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      success: true,
      user: { id: "buyer-1", password: "secret" },
      isNewUser: false,
      message: "OK",
    });

    const app = buildApp();
    const agent = request.agent(app);

    const anonymousSession = await getSessionSnapshot(agent);
    const response = await agent.post("/api/auth/login").send({ phone: "9876543210", otp: "123456" });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: "buyer-1" });
    expect(response.body.user?.password).toBeUndefined();

    const authenticatedSession = await getSessionSnapshot(agent);
    expect(authenticatedSession.sessionId).not.toBe(anonymousSession.sessionId);
    expect(authenticatedSession.cartSessionId).toBe(anonymousSession.cartSessionId);
    expect(authenticatedSession.userId).toBe("buyer-1");
    expect(authenticatedSession.role).toBe("buyer");
  });

  it("omits passwords in the /api/auth/me response", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      success: true,
      user: {
        id: "buyer-2",
        name: "Test Buyer",
        password: "sensitive",
      },
      isNewUser: false,
      message: "OK",
    });

    const app = buildApp();
    const agent = request.agent(app);

    const loginResponse = await agent
      .post("/api/auth/login")
      .send({ phone: "9876543211", otp: "123456" });

    expect(loginResponse.status).toBe(200);

    getUserMock.mockResolvedValueOnce({
      id: "buyer-2",
      name: "Test Buyer",
      password: "sensitive",
    });

    const meResponse = await agent.get("/api/auth/me");

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.authenticated).toBe(true);
    expect(meResponse.body.user).toMatchObject({ id: "buyer-2", name: "Test Buyer" });
    expect(meResponse.body.user?.password).toBeUndefined();
  });

  it("rotates the session id when verifying an admin OTP", async () => {
    verifyOtpMock.mockResolvedValueOnce({
      success: true,
      user: { id: "admin-42", password: "hunter2" },
      isNewUser: false,
      message: "OK",
    });

    const app = buildApp();
    const agent = request.agent(app);

    const anonymousSession = await getSessionSnapshot(agent);
    const response = await agent
      .post("/api/auth/verify-otp")
      .send({ phone: "9876543210", otp: "654321", userType: "admin" });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: "admin-42" });
    expect(response.body.user?.password).toBeUndefined();

    const authenticatedSession = await getSessionSnapshot(agent);
    expect(authenticatedSession.sessionId).not.toBe(anonymousSession.sessionId);
    expect(authenticatedSession.cartSessionId).toBe(anonymousSession.cartSessionId);
    expect(authenticatedSession.adminId).toBe("admin-42");
    expect(authenticatedSession.role).toBe("admin");
  });

  it("rotates the session id for password logins", async () => {
    authenticateUserMock.mockResolvedValueOnce({ id: "buyer-55", password: "hashed" });

    const app = buildApp();
    const agent = request.agent(app);

    const anonymousSession = await getSessionSnapshot(agent);
    const response = await agent
      .post("/api/auth/login-password")
      .send({ phone: "9998887776", password: "secret", userType: "buyer" });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ id: "buyer-55" });
    expect(response.body.user?.password).toBeUndefined();

    const authenticatedSession = await getSessionSnapshot(agent);
    expect(authenticatedSession.sessionId).not.toBe(anonymousSession.sessionId);
    expect(authenticatedSession.cartSessionId).toBe(anonymousSession.cartSessionId);
    expect(authenticatedSession.userId).toBe("buyer-55");
    expect(authenticatedSession.role).toBe("buyer");
  });

  it("rotates the session id on admin login", async () => {
    validateAdminLoginMock.mockResolvedValueOnce({
      id: "admin-1",
      username: "admin",
      name: "Site Admin",
    });

    const app = buildApp();
    const agent = request.agent(app);

    const anonymousSession = await getSessionSnapshot(agent);
    const response = await agent
      .post("/api/admin/login")
      .send({ username: "admin", password: "password" });

    expect(response.status).toBe(200);

    const authenticatedSession = await getSessionSnapshot(agent);
    expect(authenticatedSession.sessionId).not.toBe(anonymousSession.sessionId);
    expect(authenticatedSession.cartSessionId).toBe(anonymousSession.cartSessionId);
    expect(authenticatedSession.adminId).toBe("admin-1");
    expect(authenticatedSession.role).toBe("admin");
  });

  it("rotates the session id on influencer login", async () => {
    authenticateInfluencerMock.mockResolvedValueOnce({
      id: "influencer-9",
      phone: "8887776665",
      name: "Creator",
    });

    const app = buildApp();
    const agent = request.agent(app);

    const anonymousSession = await getSessionSnapshot(agent);
    const response = await agent
      .post("/api/influencer/login")
      .send({ phone: "8887776665", password: "hunter2" });

    expect(response.status).toBe(200);

    const authenticatedSession = await getSessionSnapshot(agent);
    expect(authenticatedSession.sessionId).not.toBe(anonymousSession.sessionId);
    expect(authenticatedSession.cartSessionId).toBe(anonymousSession.cartSessionId);
    expect(authenticatedSession.influencerId).toBe("influencer-9");
    expect(authenticatedSession.role).toBe("influencer");
  });
});
