import { Router } from "express";
import { z } from "zod";

import {
  ordersRepository,
  usersRepository,
  offersRepository,
  shippingRepository,
} from "../storage";
import {
  insertUserAddressSchema,
  insertUserSchema,
} from "@shared/schema";
import type { RequireAdminMiddleware, SessionRequest } from "./types";

export function createOrdersRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  const orderCreationSchema = z.object({
    userInfo: z
      .object({
        name: z.string().optional(),
        email: z.string().email().or(z.literal("")).optional().nullable(),
        addressLine1: z.string().min(1, "Address line 1 is required"),
        addressLine2: z.string().min(1, "Address line 2 is required"),
        addressLine3: z.string().optional(),
        landmark: z.string().optional(),
        city: z.string().min(1, "City is required"),
        pincode: z.string().min(1, "Pincode is required"),
        makePreferred: z.boolean().optional().default(false),
      })
      .optional(),
    offerCode: z.string().optional().nullable(),
    paymentMethod: z.string().min(1, "Payment method is required"),
    selectedAddressId: z.string().optional().nullable(),
  });

  router.post("/", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const validatedData = orderCreationSchema.parse(req.body);
      const { userInfo, offerCode, paymentMethod, selectedAddressId } = validatedData;
      const userId = req.session.userId;

      const cartItems = await ordersRepository.getCartItems(req.session.sessionId!);

      if (cartItems.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      let deliveryAddressId = selectedAddressId ?? undefined;

      if (selectedAddressId) {
        const userAddresses = await usersRepository.getUserAddresses(userId);
        const selectedAddress = userAddresses.find(addr => addr.id === selectedAddressId);
        if (!selectedAddress) {
          return res.status(400).json({ message: "Selected address does not belong to user" });
        }
      }

      if (!selectedAddressId && userInfo) {
        const addressValidationSchema = insertUserAddressSchema
          .omit({ userId: true })
          .extend({
            makePreferred: z.boolean().optional().default(false),
          });

        const fullAddress = [
          userInfo.addressLine1,
          userInfo.addressLine2,
          userInfo.addressLine3,
        ]
          .filter(line => line?.trim())
          .join("\n");

        const validatedAddressData = addressValidationSchema.parse({
          name: "Delivery Address",
          address: fullAddress,
          city: userInfo.city,
          pincode: userInfo.pincode,
          makePreferred: userInfo.makePreferred,
        });

        const existingAddresses = await usersRepository.getUserAddresses(userId);
        const shouldBePreferred =
          validatedAddressData.makePreferred || existingAddresses.length === 0;

        const addressData = {
          userId,
          name: existingAddresses.length === 0 ? "Primary Address" : "Delivery Address",
          address: validatedAddressData.address,
          city: validatedAddressData.city,
          pincode: validatedAddressData.pincode,
          isPreferred: shouldBePreferred,
        };

        const newAddress = await usersRepository.createUserAddress(addressData);

        if (shouldBePreferred && existingAddresses.length > 0) {
          await usersRepository.setPreferredAddress(userId, newAddress.id);
        }

        deliveryAddressId = newAddress.id;
      }

      if (!deliveryAddressId) {
        return res.status(400).json({ message: "Delivery address is required" });
      }

      if (userInfo) {
        const {
          addressLine1,
          addressLine2,
          addressLine3,
          landmark,
          city,
          pincode,
          makePreferred,
          ...userInfoToUpdate
        } = userInfo;
        if (Object.keys(userInfoToUpdate).length > 0) {
          const userUpdateSchema = insertUserSchema
            .partial()
            .pick({ name: true, email: true })
            .extend({
              email: z.string().email().or(z.literal("")).optional().nullable(),
            });
          const validatedUserUpdate = userUpdateSchema.parse(userInfoToUpdate);
          if (validatedUserUpdate.email === "") {
            validatedUserUpdate.email = null;
          }
          await usersRepository.updateUser(userId, validatedUserUpdate);
        }
      }

      const subtotal = cartItems.reduce(
        (sum, item) => sum + parseFloat(item.product.price) * item.quantity,
        0,
      );
      let discountAmount = 0;
      const appliedOffer = offerCode ? await offersRepository.getOfferByCode(offerCode) : undefined;

      if (appliedOffer) {
        if (appliedOffer.discountType === "percentage") {
          discountAmount = (subtotal * parseFloat(appliedOffer.discountValue)) / 100;
          if (appliedOffer.maxDiscount) {
            discountAmount = Math.min(
              discountAmount,
              parseFloat(appliedOffer.maxDiscount),
            );
          }
        } else {
          discountAmount = parseFloat(appliedOffer.discountValue);
        }
      }

      const address = await usersRepository
        .getUserAddresses(userId)
        .then(addresses => addresses.find(addr => addr.id === deliveryAddressId));

      const shippingCharge = address
        ? await shippingRepository.calculateShippingCharge({
            cartItems,
            pincode: address.pincode,
            orderValue: subtotal,
          })
        : 50;

      const total = subtotal - discountAmount + shippingCharge;

      const orderData = {
        userId,
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        shippingCharge: shippingCharge.toString(),
        total: total.toString(),
        amountMinor: Math.round(total * 100),
        offerId: appliedOffer?.id,
        paymentMethod,
        paymentStatus: "pending" as const,
        status: "pending" as const,
        deliveryAddressId,
      };

      const order = await ordersRepository.createOrder(orderData);

      const orderItems = cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.product.price,
        orderId: order.id,
      }));

      await ordersRepository.createOrderItems(orderItems);

      if (appliedOffer) {
        await offersRepository.createOfferRedemption({
          offerId: appliedOffer.id,
          userId,
          orderId: order.id,
          discountAmount: discountAmount.toString(),
        });
        await offersRepository.incrementOfferUsage(appliedOffer.id);
      }

      await ordersRepository.clearCart(req.session.sessionId!);

      res.json({ order, message: "Order placed successfully" });
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res
          .status(400)
          .json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  router.get("/", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };

      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value && value !== "all"),
      );

      const orders = await ordersRepository.getOrders(
        Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined,
      );
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  router.get("/:id", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const order = await ordersRepository.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      res.json(order);
    } catch (error) {
      console.error("Error fetching order:", error);
      res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  return router;
}
