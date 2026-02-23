const express = require("express");
const bcrypt = require("bcryptjs");
const { getMany, getOne, query } = require("../../db/client");
const { authRequired, roleRequired, signToken } = require("../../middleware/auth");

function usersRoutes({ logAudit }) {
  const router = express.Router();

  router.post("/auth/login", async (req, res) => {
    try {
      const email = (req.body.email || "").trim().toLowerCase();
      const password = req.body.password || "";
      if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
      }

      const user = await getOne(
        `SELECT id, name, email, role, password_hash, is_active, locale FROM users WHERE email = $1`,
        [email]
      );
      if (!user) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      if (!user.is_active) {
        res.status(403).json({
          error: "Your account is disabled. Please check with portal admin.",
          code: "ACCOUNT_DISABLED",
        });
        return;
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      res.json({
        token: signToken(user),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          locale: user.locale,
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Login failed" });
    }
  });

  router.get("/auth/me", authRequired, async (req, res) => {
    const user = await getOne(
      `SELECT id, name, email, role, locale, is_active FROM users WHERE id = $1`,
      [req.user.sub]
    );
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!user.is_active) {
      res.status(403).json({
        error: "Your account is disabled. Please check with portal admin.",
        code: "ACCOUNT_DISABLED",
      });
      return;
    }
    res.json(user);
  });

  router.post("/auth/change-password", authRequired, async (req, res) => {
    try {
      const currentPassword = (req.body.currentPassword || "").trim();
      const newPassword = (req.body.newPassword || "").trim();
      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: "currentPassword and newPassword are required" });
        return;
      }
      const userId = req.user.sub;
      const user = await getOne(
        `SELECT id, password_hash FROM users WHERE id = $1`,
        [userId]
      );
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const ok = await bcrypt.compare(currentPassword, user.password_hash);
      if (!ok) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userId]);
      await logAudit(userId, null, "password_changed_by_user", {});
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  router.get("/users", authRequired, roleRequired("admin"), async (req, res) => {
    const users = await getMany(
      `SELECT id, name, email, role, is_active, locale, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(users);
  });

  router.get("/users/agents", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const agents = await getMany(
      `
        SELECT id, name, email
        FROM users
        WHERE role = 'agent' AND is_active = TRUE
        ORDER BY name ASC, id ASC
      `
    );
    res.json(agents);
  });

  router.post("/users", authRequired, roleRequired("admin"), async (req, res) => {
    try {
      const name = (req.body.name || "").trim();
      const email = (req.body.email || "").trim().toLowerCase();
      const role = (req.body.role || "requester").trim();
      const password = (req.body.password || "").trim();
      const locale = req.body.locale === "ar" ? "ar" : "en";
      if (!name || !email || !password) {
        res.status(400).json({ error: "name, email and password are required" });
        return;
      }
      if (!["admin", "agent", "requester"].includes(role)) {
        res.status(400).json({ error: "Invalid role" });
        return;
      }

      const existing = await getOne(`SELECT id FROM users WHERE email = $1`, [email]);
      if (existing) {
        res.status(409).json({ error: "Email already exists" });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const inserted = await query(
        `
          INSERT INTO users (name, email, password_hash, role, is_active, locale)
          VALUES ($1, $2, $3, $4, TRUE, $5)
          RETURNING id, name, email, role, is_active, locale, created_at
        `,
        [name, email, passwordHash, role, locale]
      );

      await logAudit(req.user.sub, null, "user_created", { targetEmail: email, role });
      res.status(201).json(inserted.rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  router.patch("/users/:id", authRequired, roleRequired("admin"), async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (userId === Number(req.user.sub)) {
        res.status(400).json({ error: "You cannot change your own account status" });
        return;
      }
      const target = await getOne(`SELECT id, email, role, is_active FROM users WHERE id = $1`, [userId]);
      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const isActive = req.body.is_active;
      if (typeof isActive !== "boolean") {
        res.status(400).json({ error: "is_active (boolean) is required" });
        return;
      }
      await query(`UPDATE users SET is_active = $1 WHERE id = $2`, [isActive, userId]);
      await logAudit(req.user.sub, null, "user_status_updated", {
        targetUserId: userId,
        targetEmail: target.email,
        is_active: isActive,
      });
      res.json({ success: true, is_active: isActive });
    } catch (error) {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  router.post("/users/:id/reset-password", authRequired, roleRequired("admin"), async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const newPassword = (req.body.newPassword || "").trim();
      if (!newPassword) {
        res.status(400).json({ error: "newPassword is required" });
        return;
      }

      const target = await getOne(`SELECT id, email FROM users WHERE id = $1`, [userId]);
      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, userId]);
      await logAudit(req.user.sub, null, "password_reset", { targetUserId: userId, email: target.email });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  return router;
}

module.exports = { usersRoutes };
