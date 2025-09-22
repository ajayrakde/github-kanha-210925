import { Router } from "express";

import { storage } from "../storage";
import { otpService } from "../otp-service";
import type { SessionRequest } from "./types";

export function createAuthRouter() {
  const router = Router();

  router.post("/login", async (req: SessionRequest, res) => {
    const { phone, otp } = req.body;
    const otpLengthSetting = await storage.getAppSetting("otp_length");
    const expectedOtpLength = otpLengthSetting?.value
      ? parseInt(otpLengthSetting.value)
      : 6;

    if (otp && otp.length === expectedOtpLength) {
      let user = await storage.getUserByPhone(`+91${phone}`);
      if (!user) {
        user = await storage.createUser({
          phone: `+91${phone}`,
          name: "",
          email: null,
        });
      }
      req.session.userId = user.id;
      req.session.userRole = "buyer";
      res.json({ success: true, user });
    } else {
      res.status(400).json({ message: "Invalid OTP" });
    }
  });

  router.post("/logout", async (req: SessionRequest, res) => {
    req.session.userId = undefined;
    req.session.userRole = undefined;
    res.json({ message: "Logged out successfully" });
  });

  router.get("/me", async (req: SessionRequest, res) => {
    if (req.session.userId && req.session.userRole === "buyer") {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          res.json({ authenticated: true, user });
        } else {
          res.status(401).json({ authenticated: false });
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ authenticated: false });
      }
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  router.get("/orders", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const orders = await storage.getOrdersByUser(req.session.userId);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching user orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  router.get("/addresses", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const addresses = await storage.getUserAddresses(req.session.userId);
      res.json(addresses);
    } catch (error) {
      console.error("Error fetching user addresses:", error);
      res.status(500).json({ message: "Failed to fetch addresses" });
    }
  });

  router.get("/addresses/last", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const lastOrderAddress = await storage.getLastOrderAddress(req.session.userId);
      res.json(lastOrderAddress);
    } catch (error) {
      console.error("Error fetching last order address:", error);
      res.status(500).json({ message: "Failed to fetch last order address" });
    }
  });

  router.post("/addresses", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const { name, address, city, pincode, isPreferred } = req.body;
      const existingAddresses = await storage.getUserAddresses(req.session.userId);
      const shouldBePreferred = isPreferred || existingAddresses.length === 0;

      const newAddress = await storage.createUserAddress({
        userId: req.session.userId,
        name,
        address,
        city,
        pincode,
        isPreferred: shouldBePreferred,
      });

      if (shouldBePreferred && existingAddresses.length > 0) {
        await storage.setPreferredAddress(req.session.userId, newAddress.id);
      }

      res.json(newAddress);
    } catch (error) {
      console.error("Error creating address:", error);
      res.status(500).json({ message: "Failed to create address" });
    }
  });

  router.put("/addresses/:id/preferred", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      await storage.setPreferredAddress(req.session.userId, req.params.id);
      res.json({ message: "Preferred address updated" });
    } catch (error) {
      console.error("Error setting preferred address:", error);
      res.status(500).json({ message: "Failed to set preferred address" });
    }
  });

  router.delete("/addresses/:id", async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== "buyer") {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      await storage.deleteUserAddress(req.params.id, req.session.userId);
      res.json({ message: "Address deleted" });
    } catch (error) {
      console.error("Error deleting address:", error);
      res.status(500).json({ message: "Failed to delete address" });
    }
  });

  router.post("/send-otp", async (req: SessionRequest, res) => {
    try {
      const { phone, userType } = req.body;

      if (!phone || !userType) {
        return res.status(400).json({ message: "Phone number and user type are required" });
      }

      if (!["admin", "buyer", "influencer"].includes(userType)) {
        return res.status(400).json({ message: "Invalid user type" });
      }

      const result = await otpService.sendOtp(phone, userType);

      if (result.success) {
        res.json({ message: result.message, otpId: result.otpId });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Error sending OTP:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  router.post("/verify-otp", async (req: SessionRequest, res) => {
    try {
      const { phone, otp, userType } = req.body;

      if (!phone || !otp || !userType) {
        return res
          .status(400)
          .json({ message: "Phone number, OTP, and user type are required" });
      }

      const result = await otpService.verifyOtp(phone, otp, userType);

      if (result.success && result.user) {
        switch (userType) {
          case "admin":
            req.session.adminId = result.user.id;
            req.session.userRole = "admin";
            break;
          case "influencer":
            req.session.influencerId = result.user.id;
            req.session.userRole = "influencer";
            break;
          case "buyer":
            req.session.userId = result.user.id;
            req.session.userRole = "buyer";
            break;
        }

        res.json({
          message: result.message,
          user: result.user,
          isNewUser: result.isNewUser,
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  router.post("/login-password", async (req: SessionRequest, res) => {
    try {
      const { phone, password, userType } = req.body;

      if (!phone || !password || !userType) {
        return res
          .status(400)
          .json({ message: "Phone number, password, and user type are required" });
      }

      if (!["admin", "buyer", "influencer"].includes(userType)) {
        return res.status(400).json({ message: "Invalid user type" });
      }

      const cleanPhone = phone.replace(/\D/g, "");
      if (cleanPhone.length !== 10 || !cleanPhone.match(/^[6-9]\d{9}$/)) {
        return res.status(400).json({ message: "Please enter a valid Indian phone number" });
      }

      let user: any = null;

      switch (userType) {
        case "admin": {
          const admin = await storage.authenticateAdmin(cleanPhone, password);
          if (admin) {
            user = admin;
            req.session.adminId = admin.id;
            req.session.userRole = "admin";
          }
          break;
        }
        case "influencer": {
          const influencer = await storage.authenticateInfluencer(cleanPhone, password);
          if (influencer) {
            user = influencer;
            req.session.influencerId = influencer.id;
            req.session.userRole = "influencer";
          }
          break;
        }
        case "buyer": {
          const buyer = await storage.authenticateUser(cleanPhone, password);
          if (buyer) {
            user = buyer;
            req.session.userId = buyer.id;
            req.session.userRole = "buyer";
          }
          break;
        }
      }

      if (!user) {
        return res.status(401).json({ message: "Invalid phone number or password" });
      }

      res.json({
        message: "Login successful",
        user,
      });
    } catch (error) {
      console.error("Error during password login:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  return router;
}
