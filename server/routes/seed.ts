import { Router } from "express";
import type { RouteDependencies } from "./types";

export function createSeedRouter({ storage }: Pick<RouteDependencies, "storage">) {
  const router = Router();

  router.post("/seed-accounts", async (req, res) => {
    try {
      await storage.createAdmin({
        username: "admin",
        password: "password123",
        name: "Admin User",
        email: "admin@example.com",
        phone: "+919999999999",
      });

      res.json({
        message: "Test accounts created successfully!",
        admin: { username: "admin", password: "password123" },
      });
    } catch (error) {
      console.error("Error creating accounts:", error);
      res.status(500).json({ message: "Failed to create accounts" });
    }
  });

  return router;
}
