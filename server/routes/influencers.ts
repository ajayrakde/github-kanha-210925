import { Router } from "express";

import { usersRepository } from "../storage";
import type { RequireAdminMiddleware, SessionRequest } from "./types";

export function createInfluencersRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  router.get("/", requireAdmin, async (_req, res) => {
    try {
      const influencers = await usersRepository.getInfluencers();
      res.json(influencers);
    } catch (error) {
      console.error("Error fetching influencers:", error);
      res.status(500).json({ message: "Failed to fetch influencers" });
    }
  });

  router.post("/", requireAdmin, async (req, res) => {
    try {
      const newInfluencer = await usersRepository.createInfluencer(req.body);
      res.status(201).json(newInfluencer);
    } catch (error) {
      console.error("Error creating influencer:", error);
      res.status(500).json({ message: "Failed to create influencer" });
    }
  });

  router.patch("/:id/deactivate", requireAdmin, async (req, res) => {
    try {
      await usersRepository.deactivateInfluencer(req.params.id);
      res.json({ message: "Influencer deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating influencer:", error);
      res.status(500).json({ message: "Failed to deactivate influencer" });
    }
  });

  return router;
}

export function createInfluencerAuthRouter() {
  const router = Router();

  router.post("/login", async (req: SessionRequest, res) => {
    try {
      const { phone, password } = req.body;
      const influencer = await usersRepository.authenticateInfluencer(phone, password);
      if (influencer) {
        req.session.influencerId = influencer.id;
        req.session.userRole = "influencer";
        res.json({
          success: true,
          influencer: { id: influencer.id, phone: influencer.phone, name: influencer.name },
        });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Influencer login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  router.post("/logout", (req: SessionRequest, res) => {
    req.session.influencerId = undefined;
    req.session.userRole = undefined;
    res.json({ message: "Logged out successfully" });
  });

  router.get("/me", async (req: SessionRequest, res) => {
    if (req.session.influencerId && req.session.userRole === "influencer") {
      try {
        const influencer = await usersRepository.getInfluencer(req.session.influencerId);
        if (influencer) {
          res.json({ authenticated: true, role: "influencer", influencer });
        } else {
          res.status(401).json({ authenticated: false });
        }
      } catch (error) {
        console.error("Error fetching influencer:", error);
        res.status(500).json({ authenticated: false });
      }
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  return router;
}
