import {
  shippingRules,
  type ShippingRule,
  type InsertShippingRule,
  type CartItem,
  type Product,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import type { SettingsRepository } from "./settings";

export class ShippingRepository {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async getShippingRules(): Promise<ShippingRule[]> {
    return await db
      .select()
      .from(shippingRules)
      .orderBy(desc(shippingRules.priority), shippingRules.createdAt);
  }

  async getShippingRule(id: string): Promise<ShippingRule | undefined> {
    const [rule] = await db.select().from(shippingRules).where(eq(shippingRules.id, id));
    return rule;
  }

  async createShippingRule(rule: InsertShippingRule): Promise<ShippingRule> {
    const [created] = await db.insert(shippingRules).values(rule).returning();
    return created;
  }

  async updateShippingRule(id: string, rule: Partial<InsertShippingRule>): Promise<ShippingRule> {
    const [updated] = await db
      .update(shippingRules)
      .set({ ...rule, updatedAt: new Date() })
      .where(eq(shippingRules.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Shipping rule with id "${id}" not found`);
    }

    return updated;
  }

  async deleteShippingRule(id: string): Promise<void> {
    await db.delete(shippingRules).where(eq(shippingRules.id, id));
  }

  async getEnabledShippingRules(): Promise<ShippingRule[]> {
    return await db
      .select()
      .from(shippingRules)
      .where(eq(shippingRules.isEnabled, true))
      .orderBy(desc(shippingRules.priority), shippingRules.createdAt);
  }

  evaluateQueryRule(rule: any, context: any): boolean {
    const { field, operator, values } = rule;
    const fieldValue = context[field];

    if (fieldValue === undefined || fieldValue === null) {
      return false;
    }

    const fieldStr = String(fieldValue).toLowerCase();
    const valueStr = values[0] ? String(values[0]).toLowerCase() : "";

    switch (operator) {
      case "EQUALS":
        return fieldStr === valueStr;
      case "NOT_EQUALS":
        return fieldStr !== valueStr;
      case "IN":
        return values.some((val: string) => fieldStr === String(val).toLowerCase());
      case "NOT_IN":
        return !values.some((val: string) => fieldStr === String(val).toLowerCase());
      case "BETWEEN":
        if (values.length !== 2) return false;
        const numValue = parseFloat(String(fieldValue));
        const min = parseFloat(values[0]);
        const max = parseFloat(values[1]);
        return !isNaN(numValue) && !isNaN(min) && !isNaN(max) && numValue >= min && numValue <= max;
      case "NOT_BETWEEN":
        if (values.length !== 2) return false;
        const numVal = parseFloat(String(fieldValue));
        const minVal = parseFloat(values[0]);
        const maxVal = parseFloat(values[1]);
        return isNaN(numVal) || isNaN(minVal) || isNaN(maxVal) || numVal < minVal || numVal > maxVal;
      case "GREATER_THAN":
        const gtValue = parseFloat(String(fieldValue));
        const gtTarget = parseFloat(values[0]);
        return !isNaN(gtValue) && !isNaN(gtTarget) && gtValue > gtTarget;
      case "LESS_THAN":
        const ltValue = parseFloat(String(fieldValue));
        const ltTarget = parseFloat(values[0]);
        return !isNaN(ltValue) && !isNaN(ltTarget) && ltValue < ltTarget;
      case "STARTS_WITH":
        return fieldStr.startsWith(valueStr);
      case "ENDS_WITH":
        return fieldStr.endsWith(valueStr);
      case "CONTAINS":
        return fieldStr.includes(valueStr);
      default:
        return false;
    }
  }

  evaluateQueryConditions(conditions: any, context: any): boolean {
    const { rules, logicalOperator } = conditions;

    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      return false;
    }

    const results = rules.map((rule: any) => this.evaluateQueryRule(rule, context));

    if (logicalOperator === "OR") {
      return results.some(result => result);
    }

    return results.every(result => result);
  }

  evaluateShippingRule(
    rule: ShippingRule,
    context: {
      productName?: string;
      category?: string;
      classification?: string;
      pincode?: string;
      orderValue?: number;
    },
  ): boolean {
    const { type, conditions } = rule;

    switch (type) {
      case "product_query_based":
        return this.evaluateQueryConditions(conditions, context);
      case "location_query_based":
        return this.evaluateQueryConditions(conditions, context);
      default:
        return false;
    }
  }

  async findMatchingShippingRules(context: {
    productName?: string;
    category?: string;
    classification?: string;
    pincode?: string;
    orderValue?: number;
  }): Promise<ShippingRule[]> {
    const enabledRules = await this.getEnabledShippingRules();
    return enabledRules.filter(rule => this.evaluateShippingRule(rule, context));
  }

  async getBestShippingRule(context: {
    productName?: string;
    category?: string;
    classification?: string;
    pincode?: string;
    orderValue?: number;
  }): Promise<ShippingRule | undefined> {
    const matchingRules = await this.findMatchingShippingRules(context);
    return matchingRules.length > 0 ? matchingRules[0] : undefined;
  }

  async calculateShippingCharge(orderData: {
    cartItems: (CartItem & { product: Product })[];
    pincode: string;
    orderValue: number;
  }): Promise<number> {
    const { cartItems, pincode, orderValue } = orderData;

    const defaultShippingSetting = await this.settingsRepository.getAppSetting("default_shipping_charge");
    const defaultShipping = defaultShippingSetting ? parseFloat(defaultShippingSetting.value) : 50;

    let productBasedCharge: number | null = null;
    let locationBasedCharge: number | null = null;

    for (const item of cartItems) {
      const productContext = {
        productName: item.product.name,
        category: item.product.category ?? undefined,
        classification: item.product.classification ?? undefined,
        orderValue,
      };

      const productRule = await this.getBestShippingRule(productContext);
      if (productRule) {
        const ruleCharge = parseFloat(productRule.shippingCharge);
        productBasedCharge =
          productBasedCharge === null ? ruleCharge : Math.min(productBasedCharge, ruleCharge);
      }
    }

    const locationContext = {
      pincode,
      orderValue,
    };

    const locationRule = await this.getBestShippingRule(locationContext);
    if (locationRule) {
      locationBasedCharge = parseFloat(locationRule.shippingCharge);
    }

    const applicableCharges = [productBasedCharge, locationBasedCharge].filter(
      charge => charge !== null,
    ) as number[];

    if (applicableCharges.length === 0) {
      return defaultShipping;
    }

    return Math.min(...applicableCharges);
  }
}
