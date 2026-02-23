const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { getMany, getOne, query } = require("../../db/client");
const { authRequired, roleRequired, signToken } = require("../../middleware/auth");

const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 60);
const PORTAL_BASE_URL = process.env.PORTAL_BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:5173");
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

function hashToken(raw) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function hasGraphMailConfig() {
  return Boolean(
    process.env.M365_TENANT_ID
    && process.env.M365_CLIENT_ID
    && process.env.M365_CLIENT_SECRET
    && process.env.M365_SENDER_UPN
  );
}

function getEmailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function getGraphAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(process.env.M365_TENANT_ID)}/oauth2/v2.0/token`;
  const payload = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.M365_CLIENT_ID,
    client_secret: process.env.M365_CLIENT_SECRET,
    scope: GRAPH_SCOPE,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Graph token request failed: ${response.status} ${data.error_description || data.error || "unknown error"}`);
  }
  return data.access_token;
}

async function sendEmailViaGraph({ to, subject, text, html }) {
  const accessToken = await getGraphAccessToken();
  const senderUpn = process.env.M365_SENDER_UPN;
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderUpn)}/sendMail`;
  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: html || `<pre>${text}</pre>`,
        },
        toRecipients: [
          {
            emailAddress: {
              address: to,
            },
          },
        ],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Graph sendMail failed: ${response.status} ${raw}`);
  }
}

async function sendPasswordResetEmail({ email, resetLink }) {
  const subject = "Reset your portal password";
  const text = `Use this link to set a new password:\n\n${resetLink}\n\nThis link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.`;
  const html = `<p>Use this link to set a new password:</p><p><a href="${resetLink}">${resetLink}</a></p><p>This link expires in ${PASSWORD_RESET_TTL_MINUTES} minutes.</p>`;
  if (hasGraphMailConfig()) {
    await sendEmailViaGraph({
      to: email,
      subject,
      text,
      html,
    });
    return;
  }
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error("Mail is not configured. Set Microsoft Graph OAuth (M365_*) or SMTP env vars.");
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text,
    html,
  });
}

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

  router.post("/auth/forgot-password", async (req, res) => {
    try {
      const email = (req.body.email || "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({ error: "Email is required" });
        return;
      }
      const user = await getOne(
        `SELECT id, name, email FROM users WHERE email = $1 AND is_active = TRUE`,
        [email]
      );
      if (user) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
        await query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [user.id, tokenHash, expiresAt]
        );
        const resetLink = `${PORTAL_BASE_URL}/reset-password?token=${encodeURIComponent(rawToken)}`;
        await sendPasswordResetEmail({ email: user.email, resetLink });
      }
      res.json({ message: "If an account exists with this email, you will receive a password reset link." });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("forgot-password email error:", error);
      const rawMessage = String(error?.message || "");
      if (/535\s*5\.7\.139|basic authentication is disabled/i.test(rawMessage)) {
        res.status(502).json({
          error: "Email login failed: Microsoft 365 SMTP basic authentication is disabled. Configure Graph OAuth mail sender (recommended) or enable SMTP AUTH for the mailbox.",
        });
        return;
      }
      if (/Graph token request failed|Graph sendMail failed/i.test(rawMessage)) {
        res.status(502).json({
          error: "Microsoft Graph email sending failed. Please verify M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET, and M365_SENDER_UPN.",
        });
        return;
      }
      res.status(500).json({ error: "Unable to send reset email right now. Please contact portal admin." });
    }
  });

  router.post("/auth/reset-password", async (req, res) => {
    try {
      const token = (req.body.token || "").trim();
      const newPassword = (req.body.newPassword || "").trim();
      if (!token || !newPassword) {
        res.status(400).json({ error: "token and newPassword are required" });
        return;
      }
      if (newPassword.length < 6) {
        res.status(400).json({ error: "New password must be at least 6 characters" });
        return;
      }
      const tokenHash = hashToken(token);
      const row = await getOne(
        `SELECT prt.id, prt.user_id FROM password_reset_tokens prt
         WHERE prt.token_hash = $1 AND prt.expires_at > NOW() AND prt.used_at IS NULL`,
        [tokenHash]
      );
      if (!row) {
        res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
        return;
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, row.user_id]);
      await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
      await logAudit(row.user_id, null, "password_reset_via_link", {});
      res.json({ message: "Password updated. You can now sign in." });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset password" });
    }
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
