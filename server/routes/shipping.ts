import { Router } from "express";
import { z } from "zod";
import { insertShippingRuleSchema } from "@shared/schema";
import type { RouteDependencies } from "./types";

export function createShippingRouter({ storage, requireAdmin }: Pick<RouteDependencies, "storage" | "requireAdmin">) {
  const router = Router();

  router.get("/admin/shipping-rules", requireAdmin, async (req, res) => {
    try {
      const rules = await storage.getShippingRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching shipping rules:", error);
      res.status(500).json({ error: "Failed to fetch shipping rules" });
    }
  });

  router.get("/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      const rule = await storage.getShippingRule(id);
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

  router.post("/admin/shipping-rules", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertShippingRuleSchema.parse(req.body);

      const rule = await storage.createShippingRule(validatedData);

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

  router.patch("/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      const bodyKeys = Object.keys(req.body).filter(key => req.body[key] !== undefined);
      if (bodyKeys.length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }

      const existingRule = await storage.getShippingRule(id);
      if (!existingRule) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }

      const validatedUpdates: any = {};
      if (req.body.name) validatedUpdates.name = z.string().min(1).max(255).parse(req.body.name);
      if (req.body.description !== undefined) validatedUpdates.description = z.string().max(2000).optional().parse(req.body.description);
      if (req.body.shippingCharge !== undefined) validatedUpdates.shippingCharge = z.coerce.string().parse(req.body.shippingCharge);
      if (req.body.isEnabled !== undefined) validatedUpdates.isEnabled = z.boolean().parse(req.body.isEnabled);
      if (req.body.priority !== undefined) validatedUpdates.priority = z.number().int().min(0).max(1000000).parse(req.body.priority);
      if (req.body.type) validatedUpdates.type = z
        .enum(["product_based", "location_value_based", "product_query_based", "location_query_based"])
        .parse(req.body.type);

      const effectiveType = validatedUpdates.type || existingRule.type;

      if (req.body.conditions) {
        const productBasedConditionsSchema = z
          .object({
            productNames: z.array(z.string().min(1)).optional(),
            categories: z.array(z.string().min(1)).optional(),
            classifications: z.array(z.string().min(1)).optional(),
          })
          .refine(data => data.productNames?.length || data.categories?.length || data.classifications?.length, {
            message: "At least one condition is required for product-based rules",
          });

        const locationValueBasedConditionsSchema = z
          .object({
            pincodes: z.array(z.string().regex(/^\d{6}$/, "PIN code must be 6 digits")).optional(),
            pincodeRanges: z
              .array(
                z.object({
                  start: z.string().regex(/^\d{6}$/, "Start PIN code must be 6 digits"),
                  end: z.string().regex(/^\d{6}$/, "End PIN code must be 6 digits"),
                }),
              )
              .optional(),
            minOrderValue: z.coerce.number().min(0).optional(),
            maxOrderValue: z.coerce.number().min(0).optional(),
          })
          .refine(
            data =>
              data.pincodes?.length ||
              data.pincodeRanges?.length ||
              data.minOrderValue !== undefined ||
              data.maxOrderValue !== undefined,
            { message: "At least one condition is required for location/value-based rules" },
          );

        const productQueryConditionsSchema = z.object({
          rules: z
            .array(
              z.object({
                field: z.enum(["productName", "category", "classification"]),
                operator: z.enum([
                  "IN",
                  "NOT_IN",
                  "BETWEEN",
                  "NOT_BETWEEN",
                  "EQUALS",
                  "NOT_EQUALS",
                  "GREATER_THAN",
                  "LESS_THAN",
                  "STARTS_WITH",
                  "ENDS_WITH",
                  "CONTAINS",
                ]),
                values: z.array(z.string()).min(1),
              }),
            )
            .min(1),
          logicalOperator: z.enum(["AND", "OR"]).default("AND"),
        });

        const locationQueryConditionsSchema = z.object({
          rules: z
            .array(
              z.object({
                field: z.enum(["pincode", "orderValue"]),
                operator: z.enum([
                  "IN",
                  "NOT_IN",
                  "BETWEEN",
                  "NOT_BETWEEN",
                  "EQUALS",
                  "NOT_EQUALS",
                  "GREATER_THAN",
                  "LESS_THAN",
                  "STARTS_WITH",
                  "ENDS_WITH",
                  "CONTAINS",
                ]),
                values: z.array(z.string()).min(1),
              }),
            )
            .min(1),
          logicalOperator: z.enum(["AND", "OR"]).default("AND"),
        });

        if (effectiveType === "product_based") {
          validatedUpdates.conditions = productBasedConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "location_value_based") {
          validatedUpdates.conditions = locationValueBasedConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "product_query_based") {
          validatedUpdates.conditions = productQueryConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "location_query_based") {
          validatedUpdates.conditions = locationQueryConditionsSchema.parse(req.body.conditions);
        } else {
          return res.status(422).json({ error: "Invalid rule type for conditions validation" });
        }
      }

      const rule = await storage.updateShippingRule(id, validatedUpdates);
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

  router.delete("/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);

      await storage.deleteShippingRule(id);

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

  router.post("/shipping/calculate", async (req, res) => {
    try {
      const { cartItems, pincode, orderValue } = req.body;

      if (!cartItems || !pincode || orderValue === undefined) {
        return res.status(400).json({ error: "Missing required fields: cartItems, pincode, orderValue" });
      }

      const shippingCharge = await storage.calculateShippingCharge({
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
