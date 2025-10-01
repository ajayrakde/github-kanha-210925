import type { Express } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import session from "express-session";

import { settingsRepository } from "../storage";
import type { RequireAdminMiddleware, SessionRequest } from "./types";
import { createProductsRouter } from "./products";
import { createCartRouter } from "./cart";
import { createOffersRouter } from "./offers";
import { createOrdersRouter } from "./orders";
import { createAuthRouter } from "./auth";
import { createLegacyOtpRouter } from "./legacy-otp";
import { ObjectStorageService } from "../objectStorage";
import { createObjectStorageRouter, createPublicObjectRouter } from "./object-storage";
import { createInfluencersRouter, createInfluencerAuthRouter } from "./influencers";
import { createAdminRouter } from "./admin";
import { createAnalyticsRouter, createCartAnalyticsRouter } from "./analytics";
import { createAdminShippingRouter, createShippingRouter } from "./shipping";
import { createSeedRouter } from "./seed";
import { createPaymentsRouter } from "./payments";
import {
  EnvironmentSessionSecretsManager,
  SessionSecretRotator,
} from "../security/session-secret-manager";

export async function registerRoutes(app: Express): Promise<Server> {
  const isProduction = process.env.NODE_ENV === "production";

  const rotationIntervalEnv = process.env.SESSION_SECRET_ROTATION_INTERVAL_MS;
  const parsedRotationInterval = rotationIntervalEnv
    ? Number.parseInt(rotationIntervalEnv, 10)
    : undefined;

  const sessionSecretRotator = new SessionSecretRotator(
    new EnvironmentSessionSecretsManager(),
    {
      requireSecret: isProduction,
      rotationIntervalMs:
        parsedRotationInterval && !Number.isNaN(parsedRotationInterval) && parsedRotationInterval > 0
          ? parsedRotationInterval
          : undefined,
      developmentFallbackSecret: "dev-insecure-session-secret",
      logger: console,
    }
  );

  const sessionSecrets = await sessionSecretRotator.initialize();

  const sessionMaxAgeEnv = process.env.SESSION_COOKIE_MAX_AGE;
  const parsedMaxAge = sessionMaxAgeEnv ? Number.parseInt(sessionMaxAgeEnv, 10) : NaN;
  const sessionMaxAge = !Number.isNaN(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 1000 * 60 * 60 * 24 * 3;

  const sessionConfig = session({
    secret: sessionSecrets,
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: isProduction,
      sameSite: "lax",
      maxAge: sessionMaxAge,
    },
  });

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

  const objectStorageService = new ObjectStorageService();
  try {
    const backendType = await objectStorageService.getBackendType();
    console.log(`Object storage backend initialized: ${backendType}`);
  } catch (error) {
    console.error("Failed to initialize object storage backend:", error);
    throw error;
  }

  const requireAdmin: RequireAdminMiddleware = (req, res, next) => {
    if (req.session.adminId && req.session.userRole === "admin") {
      next();
    } else {
      res.status(401).json({ message: "Admin access required" });
    }
  };

  app.use((req, _res, next) => {
    const sessionReq = req as SessionRequest;
    if (!sessionReq.session.sessionId) {
      sessionReq.session.sessionId = `sess_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;
    }
    next();
  });

  app.use("/api/products", createProductsRouter(requireAdmin));
  app.use("/api/cart", createCartRouter());
  app.use("/api/offers", createOffersRouter(requireAdmin));
  app.use("/api/orders", createOrdersRouter(requireAdmin));
  app.use("/api/auth", createAuthRouter());
  app.use("/api/otp", createLegacyOtpRouter());
  app.use("/api/objects", createObjectStorageRouter(requireAdmin, objectStorageService));
  app.use("/objects", createPublicObjectRouter(objectStorageService));
  app.use("/api/influencers", createInfluencersRouter(requireAdmin));
  app.use("/api/influencer", createInfluencerAuthRouter());
  app.use("/api/admin", createAdminRouter(requireAdmin));
  app.use("/api/analytics", createAnalyticsRouter());
  app.use("/api", createCartAnalyticsRouter());
  app.use("/api/admin/shipping-rules", createAdminShippingRouter(requireAdmin));
  app.use("/api/shipping", createShippingRouter());
  app.use("/api/payments", createPaymentsRouter(requireAdmin));
  app.use("/api/seed-accounts", createSeedRouter(requireAdmin));

  async function initializeDefaultSettings() {
    try {
      const defaultShippingSetting = await settingsRepository.getAppSetting("default_shipping_charge");
      if (!defaultShippingSetting) {
        await settingsRepository.createAppSetting({
          key: "default_shipping_charge",
          value: "50",
          description: "Default shipping charge when no rules apply",
          category: "shipping",
        });
        console.log("Default shipping charge setting initialized to ₹50");
      }

      const otpLengthSetting = await settingsRepository.getAppSetting("otp_length");
      if (!otpLengthSetting) {
        await settingsRepository.createAppSetting({
          key: "otp_length",
          value: "6",
          description: "Number of digits in OTP (4-8 digits)",
          category: "authentication",
        });
        console.log("OTP length setting initialized to 6 digits");
      }

      const smsProviderSetting = await settingsRepository.getAppSetting("sms_service_provider");
      if (!smsProviderSetting) {
        await settingsRepository.createAppSetting({
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
