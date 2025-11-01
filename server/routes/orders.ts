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
import { configResolver } from "../services/config-resolver";

export function createOrdersRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  // Save checkout intent endpoint
  router.post("/checkout-intent", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const intentSchema = z.object({
        checkoutIntentId: z.string(),
        userInfo: z.any().optional(),
        paymentMethod: z.string(),
        offerCode: z.string().optional().nullable(),
        selectedAddressId: z.string().optional().nullable(),
        cartItems: z.array(z.any()),
        subtotal: z.number(),
        discount: z.number(),
        shippingCharge: z.number(),
        total: z.number(),
      });

      const validatedData = intentSchema.parse(req.body);

      // Save intent to database with 1 hour expiry
      const intent = await ordersRepository.saveCheckoutIntent({
        ...validatedData,
        sessionId: req.session.sessionId!,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      });

      res.json({ success: true, intentId: intent.id });
    } catch (error) {
      console.error('[CheckoutIntent] Error saving intent:', error);
      res.status(500).json({ 
        message: "Failed to save checkout intent",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

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

      let commissionAmount = 0;
      if (
        appliedOffer &&
        appliedOffer.influencerId &&
        appliedOffer.commissionType &&
        appliedOffer.commissionValue
      ) {
        const orderValueExcludingShipping = Math.max(subtotal - discountAmount, 0);
        const commissionValue = parseFloat(appliedOffer.commissionValue.toString());
        if (appliedOffer.commissionType === "percentage") {
          commissionAmount = (orderValueExcludingShipping * commissionValue) / 100;
        } else {
          commissionAmount = commissionValue;
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

      // Resolve generic "upi" payment method to the active provider
      let resolvedPaymentMethod = paymentMethod;
      if (paymentMethod === 'upi') {
        try {
          const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as 'test' | 'live';
          const enabledProviders = await configResolver.getEnabledProviders(environment, 'default');
          
          // Find first enabled UPI provider (cashfree or phonepe)
          const upiProvider = enabledProviders.find(p => 
            p.provider === 'cashfree' || p.provider === 'phonepe'
          );
          
          if (upiProvider) {
            resolvedPaymentMethod = upiProvider.provider;
            console.log(`Resolved payment method "upi" to active provider: ${resolvedPaymentMethod}`);
          } else {
            console.warn('No UPI provider enabled, keeping payment method as "upi"');
          }
        } catch (error) {
          console.error('Failed to resolve UPI payment provider:', error);
          // Keep original paymentMethod if resolution fails
        }
      }

      const orderData = {
        userId,
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        shippingCharge: shippingCharge.toString(),
        total: total.toString(),
        amountMinor: Math.round(total * 100),
        offerId: appliedOffer?.id,
        paymentMethod: resolvedPaymentMethod,
        paymentStatus: "pending" as const,
        status: "pending" as const,
        deliveryAddressId,
      };

      // Step 1: Create local order first
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
          commissionAmount: commissionAmount.toFixed(2),
        });
        await offersRepository.incrementOfferUsage(appliedOffer.id);
      }

      // Step 2: For UPI payments (Cashfree), create Cashfree order immediately with retry
      let cashfreeCreated = false;
      let cashfreeOrderId: string | undefined;
      let cashfreePaymentSessionId: string | undefined;
      let cashfreeOrderStatus: string | undefined;
      let cashfreeError: string | undefined;

      if (resolvedPaymentMethod === 'cashfree') {
        const { retryCashfreeOperation } = await import('../utils/retry');
        const { CashfreeAdapter } = await import('../adapters/cashfree-adapter');
        
        try {
          const environment = (process.env.NODE_ENV === 'production' ? 'live' : 'test') as 'test' | 'live';
          const config = await configResolver.resolveConfig('cashfree', environment, 'default');
          const cashfreeAdapter = new CashfreeAdapter(config);

          // Get user details for Cashfree customer
          const user = await usersRepository.getUser(userId);
          if (!user) {
            throw new Error('User not found');
          }

          const address = await usersRepository
            .getUserAddresses(userId)
            .then(addresses => addresses.find(addr => addr.id === deliveryAddressId));

          // Attempt to create Cashfree order with retries
          let attempts = 0;
          const result = await retryCashfreeOperation(async () => {
            attempts++;
            
            // Check if order already exists before creating
            const existingOrder = await cashfreeAdapter.checkOrderExists(order.id);
            if (existingOrder) {
              console.log(`[Order ${order.id}] Cashfree order already exists, using existing order`);
              return {
                providerOrderId: existingOrder.order_id,
                providerData: {
                  paymentSessionId: existingOrder.payment_session_id,
                },
                status: cashfreeAdapter['mapPaymentStatus'](existingOrder.order_status),
              };
            }

            console.log(`[Order ${order.id}] Attempt ${attempts}: Creating Cashfree order`);
            return await cashfreeAdapter.createPayment({
              orderId: order.id,
              orderAmount: Math.round(total * 100),
              currency: 'INR',
              customer: {
                id: user.id,
                name: user.name || 'Customer',
                email: user.email || undefined,
                phone: user.phone,
              },
              successUrl: `${req.protocol}://${req.get('host')}/payment-success?orderId=${order.id}`,
              failureUrl: `${req.protocol}://${req.get('host')}/payment-failed?orderId=${order.id}`,
            });
          }, (attempt, error) => {
            console.log(`[Order ${order.id}] Retry attempt ${attempt} failed:`, error);
          });

          cashfreeCreated = true;
          cashfreeOrderId = result.providerOrderId;
          cashfreePaymentSessionId = result.providerData?.paymentSessionId;
          cashfreeOrderStatus = result.status;

          console.log(`[Order ${order.id}] Cashfree order created successfully after ${attempts} attempt(s)`);

          // Update order with Cashfree details
          await ordersRepository.updateCashfreeOrderDetails(order.id, {
            cashfreeOrderId,
            cashfreePaymentSessionId,
            cashfreeOrderStatus,
            cashfreeCreated: true,
            cashfreeAttempts: attempts,
          });
        } catch (error) {
          cashfreeError = error instanceof Error ? error.message : 'Unknown error';
          console.error(`[Order ${order.id}] Failed to create Cashfree order after retries:`, error);

          // Store failure details
          await ordersRepository.updateCashfreeOrderDetails(order.id, {
            cashfreeCreated: false,
            cashfreeLastError: cashfreeError,
            cashfreeAttempts: 3,
          });
        }
      }

      // Clear cart only for non-UPI or successful Cashfree creation
      if (resolvedPaymentMethod !== 'upi' && resolvedPaymentMethod !== 'cashfree') {
        await ordersRepository.clearCart(req.session.sessionId!);
      }

      const fullOrderWithRelations = await ordersRepository.getOrder(order.id);
      if (!fullOrderWithRelations) {
        return res.status(500).json({ message: "Failed to retrieve created order" });
      }

      const user = await usersRepository.getUser(userId);
      
      const deliveryAddressString = [
        fullOrderWithRelations.deliveryAddress.address,
        `${fullOrderWithRelations.deliveryAddress.city}, ${fullOrderWithRelations.deliveryAddress.pincode}`
      ].join('\n');

      const mappedItems = fullOrderWithRelations.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product?.name ?? "Product",
        quantity: item.quantity,
        price: item.price,
        imageUrl: item.product?.displayImageUrl ?? item.product?.imageUrl ?? null,
      }));

      const orderResponse = {
        id: fullOrderWithRelations.id,
        total: fullOrderWithRelations.total,
        subtotal: fullOrderWithRelations.subtotal,
        discountAmount: fullOrderWithRelations.discountAmount,
        shippingCharge: fullOrderWithRelations.shippingCharge,
        paymentMethod: fullOrderWithRelations.paymentMethod,
        deliveryAddress: deliveryAddressString,
        userInfo: {
          name: user?.name || '',
          email: user?.email || '',
          phone: user?.phone || '',
        },
        createdAt:
          fullOrderWithRelations.createdAt instanceof Date
            ? fullOrderWithRelations.createdAt.toISOString()
            : fullOrderWithRelations.createdAt,
        items: mappedItems,
        cashfreeCreated,
        cashfreePaymentSessionId,
      };

      // Return appropriate response based on Cashfree creation status
      if (resolvedPaymentMethod === 'cashfree') {
        if (!cashfreeCreated) {
          return res.status(201).json({
            order: orderResponse,
            message: "Order saved but payment gateway unavailable. Our team will contact you.",
            cashfreeCreated: false,
            error: cashfreeError,
          });
        }
      }

      res.json({ order: orderResponse, message: "Order placed successfully" });
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

 router.get("/", async (req: SessionRequest, res) => {
    const { session } = req;

    if (session.adminId && session.userRole === "admin") {
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
        return res.json(orders);
      } catch (error) {
        console.error("Error fetching orders:", error);
        return res.status(500).json({ message: "Failed to fetch orders" });
      }
    }

    if (session.influencerId && session.userRole === "influencer") {
      try {
        const orders = await ordersRepository.getOrdersByInfluencer(session.influencerId);
        return res.json(orders);
      } catch (error) {
        console.error("Error fetching influencer orders:", error);
        return res.status(500).json({ message: "Failed to fetch orders" });
      }
    }

    if (!session.userRole) {
      return res.status(401).json({ message: "Authentication required" });
    }

    return res.status(403).json({ message: "Access denied" });
  });


  router.get("/:id", async (req: SessionRequest, res) => {
    const { session } = req;

    if (!session.userRole) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const order = await ordersRepository.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const hasAccess = 
        (session.adminId && session.userRole === "admin") ||
        (session.userId && session.userRole === "buyer" && order.userId === session.userId) ||
        (session.influencerId && session.userRole === "influencer" && order.offer?.influencerId === session.influencerId);

      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied" });
      }

      const deliveryAddressString = [
        order.deliveryAddress.address,
        `${order.deliveryAddress.city}, ${order.deliveryAddress.pincode}`
      ].join('\n');

      const itemSummaries = order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        name: item.product?.name ?? "Product",
        quantity: item.quantity,
        price: item.price,
        imageUrl: item.product?.displayImageUrl ?? item.product?.imageUrl ?? null,
      }));

      const orderDataForPayment = {
        orderId: order.id,
        total: order.total,
        subtotal: order.subtotal,
        discountAmount: order.discountAmount,
        shippingCharge: order.shippingCharge,
        paymentMethod: order.paymentMethod,
        deliveryAddress: deliveryAddressString,
        userInfo: {
          name: order.user.name,
          email: order.user.email,
          phone: order.user.phone,
        },
        createdAt:
          order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
        items: itemSummaries,
        rawOrder: order,
      };

      return res.json(orderDataForPayment);
    } catch (error) {
      console.error("Error fetching order:", error);
      return res.status(500).json({ message: "Failed to fetch order" });
    }
  });

  return router;
}
