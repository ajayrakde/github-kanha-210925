import { Router } from "express";
import { z } from "zod";

import { storage } from "../storage";
import { insertProductSchema } from "@shared/schema";
import type { SessionRequest, RequireAdminMiddleware } from "./types";

export function createProductsRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  router.get("/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  router.post("/", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const existingProducts = await storage.getProducts();
      if (existingProducts.length >= 10) {
        return res.status(400).json({
          message:
            "Maximum 10 products allowed. Please delete existing products to add new ones.",
        });
      }

      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  router.patch("/:id", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id, productData);
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  router.delete("/:id", requireAdmin, async (req: SessionRequest, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  return router;
}
