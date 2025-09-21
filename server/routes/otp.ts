import { Router } from "express";
import type { RouteDependencies, SessionRequest } from "./types";

export function createOtpRouter({ storage }: Pick<RouteDependencies, "storage">) {
  const router = Router();

  router.post("/otp/send", async (req, res) => {
    const { phone } = req.body;
    console.log(`Sending OTP to ${phone}: 123456`);
    res.json({ message: "OTP sent successfully" });
  });

  router.post("/otp/verify", async (req: SessionRequest, res) => {
    const { phone, otp } = req.body;
    const otpLengthSetting = await storage.getAppSetting("otp_length");
    const expectedOtpLength = otpLengthSetting?.value ? parseInt(otpLengthSetting.value) : 6;

    if (otp && otp.length === expectedOtpLength) {
      let user = await storage.getUserByPhone(`+91${phone}`);
      if (!user) {
        user = await storage.createUser({
          phone: `+91${phone}`,
          name: "",
          email: null,
        });
      }

      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regenerate error:", err);
          return res.status(500).json({ message: "Session error" });
        }

        req.session.userId = user.id;
        req.session.userRole = "buyer";

        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Session save error:", saveErr);
            return res.status(500).json({ message: "Session error" });
          }
          res.json({ verified: true, user, authenticated: true });
        });
      });
    } else {
      res.status(400).json({ message: "Invalid OTP" });
    }
  });

  return router;
}
