import "express-session";

declare module "express-session" {
  interface SessionData {
    adminId?: string;
    influencerId?: string;
    userId?: string;
    userRole?: 'admin' | 'influencer' | 'buyer';
    sessionId?: string;
  }
}

export interface SessionRequest extends Express.Request {
  session: Express.Session & Partial<Express.SessionData>;
}