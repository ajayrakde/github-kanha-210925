import { Router } from "express";
import type { RouteDependencies, SessionRequest } from "./types";

export function createAdminRouter({ storage, requireAdmin }: Pick<RouteDependencies, "storage" | "requireAdmin">) {
  const router = Router();

  router.post("/admin/login", async (req: SessionRequest, res) => {
    try {
      const { username, password } = req.body;
      const admin = await storage.validateAdminLogin(username, password);
      if (admin) {
        req.session.adminId = admin.id;
        req.session.userRole = "admin";
        res.json({ success: true, admin: { id: admin.id, username: admin.username, name: admin.name } });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  router.post("/admin/logout", (req: SessionRequest, res) => {
    req.session.adminId = undefined;
    req.session.userRole = undefined;
    res.json({ message: "Logged out successfully" });
  });

  router.get("/admin/me", (req: SessionRequest, res) => {
    if (req.session.adminId && req.session.userRole === "admin") {
      res.json({ authenticated: true, role: "admin", id: req.session.adminId });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  router.get("/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  router.patch("/admin/settings/:key", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }

      const admin = await storage.getAdmin(req.session.adminId!);
      const updated = await storage.updateAppSetting(key, value, admin?.name || "Admin");

      res.json(updated);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  router.get("/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;

      const publicSettings = ["otp_length", "otp_login_enabled"];
      if (!publicSettings.includes(key)) {
        return res.status(403).json({ error: "Setting not publicly accessible" });
      }

      const setting = await storage.getAppSetting(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }

      res.json(setting);
    } catch (error) {
      console.error("Error fetching app setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  router.put("/admin/settings/:key", requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }

      const setting = await storage.updateAppSetting(key, value, "admin");
      res.json(setting);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ error: "Failed to update app setting" });
    }
  });

  router.get("/admin/admins", requireAdmin, async (req, res) => {
    try {
      const admins = await storage.getAdmins();
      res.json(admins);
    } catch (error: any) {
      console.error("Error fetching admins:", error);
      res.status(500).json({ error: error.message || "Failed to fetch admins" });
    }
  });

  router.post("/admin/admins", requireAdmin, async (req, res) => {
    try {
      const { name, phone, email, password, username } = req.body;
      const admin = await storage.createAdmin({
        name,
        phone,
        email,
        password: password || undefined,
        username: username || undefined,
      });
      res.json({ admin });
    } catch (error: any) {
      console.error("Error creating admin:", error);
      res.status(500).json({ error: error.message || "Failed to create admin" });
    }
  });

  router.patch("/admin/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const admin = await storage.updateAdmin(id, updateData);
      res.json({ admin });
    } catch (error: any) {
      console.error("Error updating admin:", error);
      res.status(500).json({ error: error.message || "Failed to update admin" });
    }
  });

  router.delete("/admin/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAdmin(id);
      res.json({ message: "Admin removed successfully" });
    } catch (error: any) {
      console.error("Error removing admin:", error);
      res.status(500).json({ error: error.message || "Failed to remove admin" });
    }
  });

  return router;
}
