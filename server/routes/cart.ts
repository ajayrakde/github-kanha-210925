import { Router } from "express";

import { storage } from "../storage";
import type { SessionRequest } from "./types";

export function createCartRouter() {
  const router = Router();

  router.get("/", async (req: SessionRequest, res) => {
    try {
      const cartItems = await storage.getCartItems(req.session.sessionId!);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  router.post("/add", async (req: SessionRequest, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const cartItem = await storage.addToCart(
        req.session.sessionId!,
        productId,
        quantity,
      );
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  router.patch("/:productId", async (req: SessionRequest, res) => {
    try {
      const { quantity } = req.body;
      const cartItem = await storage.updateCartItem(
        req.session.sessionId!,
        req.params.productId,
        quantity,
      );
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  router.delete("/:productId", async (req: SessionRequest, res) => {
    try {
      await storage.removeFromCart(req.session.sessionId!, req.params.productId);
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  router.delete("/clear", async (req: SessionRequest, res) => {
    try {
      await storage.clearCart(req.session.sessionId!);
      res.json({ message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  return router;
}
