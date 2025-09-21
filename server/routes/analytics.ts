import { Router } from "express";
import type { RouteDependencies, SessionRequest } from "./types";

export function createAnalyticsRouter({ storage }: Pick<RouteDependencies, "storage">) {
  const router = Router();

  router.get("/analytics/popular-products", async (req, res) => {
    try {
      const popularProducts = await storage.getPopularProducts();
      res.json(popularProducts);
    } catch (error) {
      console.error("Error fetching popular products:", error);
      res.status(500).json({ message: "Failed to fetch popular products" });
    }
  });

  router.get("/analytics/sales-trends", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const salesTrends = await storage.getSalesTrends(days);
      res.json(salesTrends);
    } catch (error) {
      console.error("Error fetching sales trends:", error);
      res.status(500).json({ message: "Failed to fetch sales trends" });
    }
  });

  router.get("/analytics/conversion-metrics", async (req, res) => {
    try {
      const conversionMetrics = await storage.getConversionMetrics();
      res.json(conversionMetrics);
    } catch (error) {
      console.error("Error fetching conversion metrics:", error);
      res.status(500).json({ message: "Failed to fetch conversion metrics" });
    }
  });

  router.get("/abandoned-carts", async (req, res) => {
    try {
      const abandonedCarts = await storage.getAbandonedCarts();
      res.json(abandonedCarts);
    } catch (error) {
      console.error("Error fetching abandoned carts:", error);
      res.status(500).json({ message: "Failed to fetch abandoned carts" });
    }
  });

  router.post("/track-cart-activity", async (req: SessionRequest, res) => {
    try {
      const sessionId = req.session.sessionId;
      if (sessionId) {
        await storage.trackCartActivity(sessionId);
      }
      res.json({ message: "Cart activity tracked" });
    } catch (error) {
      console.error("Error tracking cart activity:", error);
      res.status(500).json({ message: "Failed to track cart activity" });
    }
  });

  return router;
}
