import { Router } from "express";

import { ordersRepository } from "../storage";
import {
  CartQuantityError,
  MAX_CART_ITEM_QUANTITY,
  MIN_CART_ITEM_QUANTITY,
} from "../storage/orders";
import type { SessionRequest } from "./types";

export function createCartRouter() {
  const router = Router();

  const parseQuantity = (value: unknown): number | null => {
    if (value === undefined || value === null) {
      return null;
    }

    const quantity = typeof value === "string" && value.trim() !== "" ? Number(value) : Number(value);

    if (!Number.isInteger(quantity)) {
      return null;
    }

    if (quantity < MIN_CART_ITEM_QUANTITY || quantity > MAX_CART_ITEM_QUANTITY) {
      return null;
    }

    return quantity;
  };

  router.get("/", async (req: SessionRequest, res) => {
    try {
      const cartItems = await ordersRepository.getCartItems(req.session.sessionId!);
      res.json(cartItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });

  router.post("/add", async (req: SessionRequest, res) => {
    try {
      const { productId } = req.body;
      const requestedQuantity = req.body.quantity ?? 1;
      const quantity = parseQuantity(requestedQuantity);

      if (typeof productId !== "string" || !productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }

      if (quantity === null) {
        return res.status(400).json({
          message: `Quantity must be an integer between ${MIN_CART_ITEM_QUANTITY} and ${MAX_CART_ITEM_QUANTITY}`,
        });
      }

      const cartItem = await ordersRepository.addToCart(
        req.session.sessionId!,
        productId,
        quantity,
      );
      res.json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      if (error instanceof CartQuantityError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  router.patch("/:productId", async (req: SessionRequest, res) => {
    try {
      const quantity = parseQuantity(req.body.quantity);

      if (quantity === null) {
        return res.status(400).json({
          message: `Quantity must be an integer between ${MIN_CART_ITEM_QUANTITY} and ${MAX_CART_ITEM_QUANTITY}`,
        });
      }

      const cartItem = await ordersRepository.updateCartItem(
        req.session.sessionId!,
        req.params.productId,
        quantity,
      );
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      if (error instanceof CartQuantityError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  router.delete("/:productId", async (req: SessionRequest, res) => {
    try {
      await ordersRepository.removeFromCart(req.session.sessionId!, req.params.productId);
      res.json({ message: "Item removed from cart" });
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });

  router.delete("/clear", async (req: SessionRequest, res) => {
    try {
      await ordersRepository.clearCart(req.session.sessionId!);
      res.json({ message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  return router;
}
