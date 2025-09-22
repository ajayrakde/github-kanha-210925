import { Router } from "express";

import { usersRepository } from "../storage";

export function createSeedRouter() {
  const router = Router();

  router.post("/", async (_req, res) => {
    try {
      await usersRepository.createAdmin({
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
