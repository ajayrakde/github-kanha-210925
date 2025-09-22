import { Router } from "express";
import { z } from "zod";

import { shippingRepository } from "../storage";
import {
  insertShippingRuleSchema,
  locationQueryConditionsSchema,
  productQueryConditionsSchema,
  type InsertShippingRule,
} from "@shared/schema";
import type { RequireAdminMiddleware } from "./types";

export function createAdminShippingRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  router.get("/", requireAdmin, async (_req, res) => {
    try {
      const rules = await shippingRepository.getShippingRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching shipping rules:", error);
      res.status(500).json({ error: "Failed to fetch shipping rules" });
    }
  });

  router.get("/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      const rule = await shippingRepository.getShippingRule(id);
      if (!rule) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }
      res.json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({
          error: "Invalid ID parameter",
          details: error.errors,
        });
      }
      console.error("Error fetching shipping rule:", error);
      res.status(500).json({ error: "Failed to fetch shipping rule" });
    }
  });

  router.post("/", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertShippingRuleSchema.parse(req.body);

      const rule = await shippingRepository.createShippingRule(validatedData);

      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({
          error: "Validation failed",
          details: error.errors,
        });
      }
      console.error("Error creating shipping rule:", error);
      res.status(500).json({ error: "Failed to create shipping rule" });
    }
  });

  router.patch("/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      const supportedRuleTypeSchema = z.enum(["product_query_based", "location_query_based"]);
      const bodySchema = z
        .object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().max(2000).optional(),
          shippingCharge: z.coerce.string().optional(),
          isEnabled: z.boolean().optional(),
          priority: z.number().int().min(0).max(1000000).optional(),
          type: supportedRuleTypeSchema.optional(),
          conditions: z.unknown().optional(),
        })
        .strict();

      const parsedBody = bodySchema.parse(req.body ?? {});

      if (Object.keys(parsedBody).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const existingRule = await shippingRepository.getShippingRule(id);
      if (!existingRule) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }

      const typeResult = supportedRuleTypeSchema.safeParse(parsedBody.type ?? existingRule.type);
      if (!typeResult.success) {
        return res.status(422).json({
          error: "Unsupported shipping rule type. Please migrate this rule to a query-based rule.",
        });
      }
      const effectiveType = typeResult.data;

      const validatedUpdates: Partial<InsertShippingRule> = {};

      if (parsedBody.name !== undefined) validatedUpdates.name = parsedBody.name;
      if (parsedBody.description !== undefined) validatedUpdates.description = parsedBody.description;
      if (parsedBody.shippingCharge !== undefined) validatedUpdates.shippingCharge = parsedBody.shippingCharge;
      if (parsedBody.isEnabled !== undefined) validatedUpdates.isEnabled = parsedBody.isEnabled;
      if (parsedBody.priority !== undefined) validatedUpdates.priority = parsedBody.priority;
      if (parsedBody.type !== undefined) validatedUpdates.type = parsedBody.type;

      if (parsedBody.conditions !== undefined) {
        const conditionsSchema =
          effectiveType === "product_query_based"
            ? productQueryConditionsSchema
            : locationQueryConditionsSchema;
        validatedUpdates.conditions = conditionsSchema.parse(parsedBody.conditions);
      } else if (parsedBody.type !== undefined) {
        const conditionsSchema =
          effectiveType === "product_query_based"
            ? productQueryConditionsSchema
            : locationQueryConditionsSchema;
        const parsedExistingConditions = conditionsSchema.safeParse(existingRule.conditions);
        if (!parsedExistingConditions.success) {
          return res.status(422).json({
            error: "Conditions must be provided when changing rule type",
            details: parsedExistingConditions.error.errors,
          });
        }
        validatedUpdates.conditions = parsedExistingConditions.data;
      }

      const finalRuleForValidation = {
        type: (validatedUpdates.type ?? effectiveType) as "product_query_based" | "location_query_based",
        conditions: validatedUpdates.conditions ?? existingRule.conditions,
        name: validatedUpdates.name ?? existingRule.name,
        description: (validatedUpdates.description ?? existingRule.description ?? undefined) as
          | string
          | undefined,
        shippingCharge: String(validatedUpdates.shippingCharge ?? existingRule.shippingCharge),
        isEnabled: validatedUpdates.isEnabled ?? (existingRule.isEnabled ?? true),
        priority: validatedUpdates.priority ?? (existingRule.priority ?? 0),
      };

      insertShippingRuleSchema.parse(finalRuleForValidation);

      const rule = await shippingRepository.updateShippingRule(id, validatedUpdates);
      res.json(rule);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({
          error: "Validation failed",
          details: error.errors,
        });
      }
      if (error?.message?.includes("not found")) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }
      console.error("Error updating shipping rule:", error);
      res.status(500).json({ error: "Failed to update shipping rule" });
    }
  });

  router.delete("/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      await shippingRepository.deleteShippingRule(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({
          error: "Invalid ID parameter",
          details: error.errors,
        });
      }
      console.error("Error deleting shipping rule:", error);
      res.status(500).json({ error: "Failed to delete shipping rule" });
    }
  });

  return router;
}

export function createShippingRouter() {
  const router = Router();

  router.post("/calculate", async (req, res) => {
    try {
      const { cartItems, pincode, orderValue } = req.body;

      if (!cartItems || !pincode || orderValue === undefined) {
        return res
          .status(400)
          .json({ error: "Missing required fields: cartItems, pincode, orderValue" });
      }

      const shippingCharge = await shippingRepository.calculateShippingCharge({
        cartItems,
        pincode,
        orderValue,
      });

      res.json({ shippingCharge });
    } catch (error) {
      console.error("Error calculating shipping charge:", error);
      res.status(500).json({ error: "Failed to calculate shipping charge" });
    }
  });

  return router;
}
