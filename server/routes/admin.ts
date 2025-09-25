import { Router } from "express";

import {
  usersRepository,
  ordersRepository,
  settingsRepository,
  // paymentsRepository, // Temporarily commented during payment system refactor
} from "../storage";
import type { RequireAdminMiddleware, SessionRequest } from "./types";

export function createAdminRouter(requireAdmin: RequireAdminMiddleware) {
  const router = Router();

  router.post("/login", async (req: SessionRequest, res) => {
    try {
      const { username, password } = req.body;
      const admin = await usersRepository.validateAdminLogin(username, password);
      if (admin) {
        req.session.adminId = admin.id;
        req.session.userRole = "admin";
        res.json({
          success: true,
          admin: { id: admin.id, username: admin.username, name: admin.name },
        });
      } else {
        res.status(401).json({ message: "Invalid credentials" });
      }
    } catch (error) {
      console.error("Admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  router.post("/logout", (req: SessionRequest, res) => {
    req.session.adminId = undefined;
    req.session.userRole = undefined;
    res.json({ message: "Logged out successfully" });
  });

  router.get("/orders/export", async (req, res) => {
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

      const csvHeader = "Order ID,Customer Name,Phone,Email,Total,Status,Date,Address\n";
      const csvRows = orders
        .map(order => {
          const user = order.user;
          return [
            order.id,
            user.name || "N/A",
            user.phone,
            user.email || "N/A",
            `₹${order.total}`,
            order.status,
            order.createdAt?.toISOString().split("T")[0] || "N/A",
            order.deliveryAddress
              ? `${order.deliveryAddress.address}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}`
              : "N/A",
          ]
            .map(field => `"${String(field).replace(/"/g, '""')}"`)
            .join(",");
        })
        .join("\n");

      const csv = csvHeader + csvRows;

      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const filename = `orders_${day}${month}${year}.csv`;

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting orders:", error);
      res.status(500).json({ message: "Failed to export orders" });
    }
  });

  router.get("/me", (req: SessionRequest, res) => {
    if (req.session.adminId && req.session.userRole === "admin") {
      res.json({ authenticated: true, role: "admin", id: req.session.adminId });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  router.get("/settings", requireAdmin, async (_req, res) => {
    try {
      const settings = await settingsRepository.getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  router.patch("/settings/:key", requireAdmin, async (req: SessionRequest, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }

      const admin = await usersRepository.getAdmin(req.session.adminId!);
      const updated = await settingsRepository.updateAppSetting(key, value, admin?.name || "Admin");

      res.json(updated);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  router.get("/admins", requireAdmin, async (_req, res) => {
    try {
      const admins = await usersRepository.getAdmins();
      res.json(admins);
    } catch (error: any) {
      console.error("Error fetching admins:", error);
      res.status(500).json({ error: error.message || "Failed to fetch admins" });
    }
  });

  router.post("/admins", requireAdmin, async (req, res) => {
    try {
      const { name, phone, email, password, username } = req.body;
      const admin = await usersRepository.createAdmin({
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

  router.patch("/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const admin = await usersRepository.updateAdmin(id, updateData);
      res.json({ admin });
    } catch (error: any) {
      console.error("Error updating admin:", error);
      res.status(500).json({ error: error.message || "Failed to update admin" });
    }
  });

  router.delete("/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await usersRepository.deleteAdmin(id);
      res.json({ message: "Admin removed successfully" });
    } catch (error: any) {
      console.error("Error removing admin:", error);
      res.status(500).json({ error: error.message || "Failed to remove admin" });
    }
  });

  return router;
}
