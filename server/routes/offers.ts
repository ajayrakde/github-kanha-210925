import { Router } from "express";
import { z } from "zod";
import { insertOfferSchema } from "@shared/schema";
import type { RouteDependencies, SessionRequest } from "./types";

export function createOffersRouter({ storage, requireAdmin }: Pick<RouteDependencies, "storage" | "requireAdmin">) {
  const router = Router();

  router.post("/offers/validate", async (req: SessionRequest, res) => {
    try {
      const { code, userId: requestUserId, cartValue } = req.body;
      const sessionUserId = req.session.userId ?? null;

      if (
        sessionUserId &&
        typeof requestUserId === "string" &&
        requestUserId.trim() &&
        requestUserId !== sessionUserId
      ) {
        console.warn("Offer validation user mismatch", {
          sessionUserId,
          requestUserId,
        });
      }

      const validation = await storage.validateOffer(
        code,
        sessionUserId ?? null,
        cartValue,
      );
      res.json(validation);
    } catch (error) {
      console.error("Error validating offer:", error);
      res.status(500).json({ message: "Failed to validate offer" });
    }
  });

  router.get("/offers", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const influencerId = req.query.influencerId as string;
      const isActiveParam = req.query.isActive as string;

      let allOffers = await storage.getOffers();

      if (influencerId && influencerId !== "all") {
        allOffers = allOffers.filter(offer => offer.influencerId === influencerId);
      }

      if (isActiveParam && isActiveParam !== "all") {
        const isActive = isActiveParam === "true";
        allOffers = allOffers.filter(offer => offer.isActive === isActive);
      }

      const total = allOffers.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedOffers = allOffers.slice(offset, offset + limit);

      if (req.query.page || req.query.limit) {
        res.json({
          data: paginatedOffers,
          total,
          page,
          limit,
          totalPages,
        });
      } else {
        res.json(allOffers);
      }
    } catch (error) {
      console.error("Error fetching offers:", error);
      res.status(500).json({ message: "Failed to fetch offers" });
    }
  });

  router.post("/offers", requireAdmin, async (req, res) => {
    try {
      const offerData = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(offerData);
      res.json(offer);
    } catch (error) {
      console.error("Error creating offer:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid offer data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create offer" });
    }
  });

  router.patch("/offers/:id", requireAdmin, async (req, res) => {
    try {
      const offerData = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(req.params.id, offerData);
      res.json(offer);
    } catch (error) {
      console.error("Error updating offer:", error);
      res.status(500).json({ message: "Failed to update offer" });
    }
  });

  router.delete("/offers/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteOffer(req.params.id);
      res.json({ message: "Offer deleted successfully" });
    } catch (error) {
      console.error("Error deleting offer:", error);
      res.status(500).json({ message: "Failed to delete offer" });
    }
  });

  return router;
}
