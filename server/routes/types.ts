import type { Request, Response, NextFunction } from "express";
import type session from "express-session";

export interface SessionRequest extends Request {
  session: session.Session & {
    sessionId?: string;
    adminId?: string;
    influencerId?: string;
    userId?: string;
    userRole?: "admin" | "influencer" | "buyer";
  };
}

export type RequireAdminMiddleware = (
  req: SessionRequest,
  res: Response,
  next: NextFunction,
) => void;
