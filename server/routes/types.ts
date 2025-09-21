import type { Request, RequestHandler } from "express";
import type session from "express-session";
import type { storage } from "../storage";
import type { otpService } from "../otp-service";

export interface SessionRequest extends Request {
  session: session.Session & {
    sessionId?: string;
    adminId?: string;
    influencerId?: string;
    userId?: string;
    userRole?: "admin" | "influencer" | "buyer";
  };
}

export interface RouteDependencies {
  storage: typeof storage;
  otpService: typeof otpService;
  requireAdmin: RequestHandler;
}
