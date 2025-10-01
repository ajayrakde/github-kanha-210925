import { Router } from "express";

import { usersRepository } from "../storage";
import type { RequireAdminMiddleware, SessionRequest } from "./types";

type SeedRouterOptions = {
  allowedEnvironments?: string[];
};

export function createSeedRouter(
  requireAdmin: RequireAdminMiddleware,
  options: SeedRouterOptions = {},
) {
  const router = Router();

  const allowedEnvironments = options.allowedEnvironments ?? ["development", "test"];

  router.use((_, res, next) => {
    const currentEnv = process.env.NODE_ENV ?? "development";
    if (!allowedEnvironments.includes(currentEnv)) {
      return res.status(403).json({ message: "Account seeding is not allowed in this environment" });
    }
    next();
  });

  router.post("/", requireAdmin, async (_req: SessionRequest, res) => {
    try {
      await usersRepository.createAdmin({
        username: "admin",
        password: "password123",
        name: "Admin User",
        email: "admin@example.com",
        phone: "+919999999999",
      });

      res.json({ message: "Test accounts created successfully!" });
    } catch (error) {
      console.error("Error creating accounts:", error);
      res.status(500).json({ message: "Failed to create accounts" });
    }
  });

  return router;
}
