import { Router } from "express";

import { otpService } from "../otp-service";

export function createLegacyOtpRouter() {
  const router = Router();

  router.post("/send", async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const result = await otpService.sendOtp(phone, "buyer");

      if (result.success) {
        return res.json({ message: result.message, otpId: result.otpId });
      }

      return res.status(400).json({ message: result.message });
    } catch (error) {
      console.error("Legacy OTP send error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  router.post("/verify", async (req, res) => {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone number and OTP are required" });
      }

      const result = await otpService.verifyOtp(phone, otp, "buyer");

      if (!result.success || !result.user) {
        return res.status(400).json({ message: result.message || "Failed to verify OTP" });
      }

      return res.json({
        verified: true,
        authenticated: true,
        user: result.user,
        isNewUser: result.isNewUser,
        message: result.message,
      });
    } catch (error) {
      console.error("Legacy OTP verify error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  return router;
}
