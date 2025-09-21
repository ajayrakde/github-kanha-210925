import type { Express, NextFunction, Response } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import session from "express-session";
import { storage } from "./storage";
import { otpService } from "./otp-service";
import { createProductsRouter } from "./routes/products";
import { createCartRouter } from "./routes/cart";
import { createOffersRouter } from "./routes/offers";
import { createOtpRouter } from "./routes/otp";
import { createAuthRouter } from "./routes/auth";
import { createOrdersRouter } from "./routes/orders";
import { createAnalyticsRouter } from "./routes/analytics";
import { createShippingRouter } from "./routes/shipping";
import { createAdminRouter } from "./routes/admin";
import { createInfluencerRouter } from "./routes/influencers";
import { createObjectsApiRouter, createObjectsPublicRouter } from "./routes/objects";
import { createSeedRouter } from "./routes/seed";
import type { RouteDependencies, SessionRequest } from "./routes/types";

const sessionConfig = session({
  secret: process.env.SESSION_SECRET || "your-secret-key",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "Too many requests from this IP, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: "Too many authentication attempts, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { message: "Too many file uploads, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many OTP requests, please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.set("trust proxy", 1);

  app.use("/api", generalLimiter);
  app.use("/api/auth", authLimiter);
  app.use("/api/objects/upload", uploadLimiter);
  app.use("/api/otp", otpLimiter);
  app.use("/api/auth/send-otp", otpLimiter);
  app.use("/api/auth/verify-otp", otpLimiter);

  app.use(sessionConfig);

  const requireAdmin = (req: SessionRequest, res: Response, next: NextFunction) => {
    if (req.session.adminId && req.session.userRole === "admin") {
      next();
    } else {
      res.status(401).json({ message: "Admin access required" });
    }
  };

  const dependencies: RouteDependencies = {
    storage,
    otpService,
    requireAdmin,
  };

  app.use((req: SessionRequest, res, next) => {
    if (!req.session.sessionId) {
      req.session.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    next();
  });

  app.use("/api", createProductsRouter(dependencies));
  app.use("/api", createCartRouter(dependencies));
  app.use("/api", createOffersRouter(dependencies));
  app.use("/api", createOtpRouter(dependencies));
  app.use("/api", createAuthRouter(dependencies));
  app.use("/api", createOrdersRouter(dependencies));
  app.use("/api", createAnalyticsRouter(dependencies));
  app.use("/api", createShippingRouter(dependencies));
  app.use("/api", createAdminRouter(dependencies));
  app.use("/api", createInfluencerRouter(dependencies));
  app.use("/api", createSeedRouter(dependencies));
  app.use("/api", createObjectsApiRouter());
  app.use(createObjectsPublicRouter());

  async function initializeDefaultSettings() {
    try {
      const defaultShippingSetting = await storage.getAppSetting("default_shipping_charge");
      if (!defaultShippingSetting) {
        await storage.createAppSetting({
          key: "default_shipping_charge",
          value: "50",
          description: "Default shipping charge when no rules apply",
          category: "shipping",
        });
        console.log("Default shipping charge setting initialized to ₹50");
      }

      const otpLengthSetting = await storage.getAppSetting("otp_length");
      if (!otpLengthSetting) {
        await storage.createAppSetting({
          key: "otp_length",
          value: "6",
          description: "Number of digits in OTP (4-8 digits)",
          category: "authentication",
        });
        console.log("OTP length setting initialized to 6 digits");
      }

      const smsProviderSetting = await storage.getAppSetting("sms_service_provider");
      if (!smsProviderSetting) {
        await storage.createAppSetting({
          key: "sms_service_provider",
          value: "2Factor",
          description: "SMS service provider (Test for mock OTP, 2Factor for real API)",
          category: "authentication",
        });
        console.log("SMS service provider setting initialized to 2Factor");
      }
    } catch (error) {
      console.error("Error initializing default settings:", error);
    }
  }

  await initializeDefaultSettings();

  const httpServer = createServer(app);
  return httpServer;
}
