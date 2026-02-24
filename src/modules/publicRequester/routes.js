const crypto = require("crypto");
const express = require("express");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const { getMany, getOne, query } = require("../../db/client");
const { calcDueDate, computeSla, pickLeastLoadedAgent, runAutomationRules } = require("../automations/service");

const REQUESTER_SESSION_SECRET = process.env.REQUESTER_SESSION_SECRET || process.env.JWT_SECRET || "change-me-v2";
const REQUESTER_MAGIC_LINK_TTL_MINUTES = Number(process.env.REQUESTER_MAGIC_LINK_TTL_MINUTES || 20);
const REQUESTER_LINK_COOLDOWN_SECONDS = Number(process.env.REQUESTER_LINK_COOLDOWN_SECONDS || 60);
const REQUESTER_PORTAL_BASE_URL = process.env.REQUESTER_PORTAL_BASE_URL || "https://it-support-v2.vercel.app/public/requester";

const uploadDir = process.env.VERCEL === "1" ? "/tmp/uploads-v2" : path.join(__dirname, "..", "..", "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function resolveAttachmentUrl(file) {
  if (!file) return "";
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    try {
      const raw = fs.readFileSync(file.path);
      return `data:${file.mimetype};base64,${raw.toString("base64")}`;
    } catch (error) {
      // Fall back to public uploads path if inline conversion fails.
    }
  }
  return `/uploads-v2/${file.filename}`;
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim();
}

function signRequesterSession(payload) {
  return jwt.sign(
    { type: "requester_portal", email: payload.email, name: payload.name || "" },
    REQUESTER_SESSION_SECRET,
    { expiresIn: "12h" }
  );
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function buildRequesterMagicUrl(rawToken) {
  const url = new URL(REQUESTER_PORTAL_BASE_URL);
  url.searchParams.set("token", rawToken);
  return url.toString();
}

function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMagicLinkEmail({ email, link }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.");
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Your IT Support Portal access link",
    text: `Use this one-time link to access your requester portal:\n\n${link}\n\nThis link expires in ${REQUESTER_MAGIC_LINK_TTL_MINUTES} minutes.`,
    html: `
      <p>Use this one-time link to access your requester portal:</p>
      <p><a href="${link}">${link}</a></p>
      <p>This link expires in ${REQUESTER_MAGIC_LINK_TTL_MINUTES} minutes.</p>
    `,
  });
}

function getBearerToken(req) {
  const auth = req.header("authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

async function requesterSessionRequired(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing requester token" });
      return;
    }
    const decoded = jwt.verify(token, REQUESTER_SESSION_SECRET);
    if (decoded.type !== "requester_portal" || !decoded.email) {
      res.status(401).json({ error: "Invalid requester token" });
      return;
    }
    req.requester = {
      email: normalizeEmail(decoded.email),
      name: normalizeName(decoded.name || ""),
    };
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid requester token" });
  }
}

async function ensureRequesterOwnsTicket(requesterEmail, ticketId) {
  const ticket = await getOne(
    `
      SELECT t.*, c.email AS contact_email, c.name AS contact_name
      FROM tickets t
      LEFT JOIN contacts c ON c.id = t.requester_contact_id
      WHERE t.id = $1
    `,
    [ticketId]
  );
  if (!ticket) return null;
  const ownerEmail = normalizeEmail(ticket.requester_email || ticket.contact_email || "");
  if (ownerEmail !== normalizeEmail(requesterEmail)) return null;
  return ticket;
}

function publicRequesterRoutes({ logAudit }) {
  const router = express.Router();

  router.post("/public/requester/tickets", upload.single("attachment"), async (req, res) => {
    try {
      const subject = normalizeName(req.body.subject);
      const description = String(req.body.description || "").trim();
      const requesterName = normalizeName(req.body.requesterName);
      const requesterEmail = normalizeEmail(req.body.requesterEmail);
      const requesterPhone = normalizeName(req.body.requesterPhone);
      const requesterCompanyName = normalizeName(req.body.requesterCompanyName);
      const priority = normalizeName(req.body.priority) || "Medium";

      if (!subject || !requesterEmail || !requesterName) {
        res.status(400).json({ error: "subject, requesterName, and requesterEmail are required" });
        return;
      }

      const attachmentUrl = resolveAttachmentUrl(req.file);
      const agent = await pickLeastLoadedAgent();
      const sla = await computeSla({ priority, channel: "Portal" });

      const contact = await query(
        `
          INSERT INTO contacts (name, email, phone, company)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (email)
          DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            company = EXCLUDED.company
          RETURNING id
        `,
        [requesterName, requesterEmail, requesterPhone || null, requesterCompanyName || null]
      );

      const createdTicket = await query(
        `
          INSERT INTO tickets (
            subject, description, status, priority, channel, category,
            requester_contact_id, requester_phone, requester_company_name,
            requester_name, requester_email,
            assigned_agent_id, first_response_due_at, resolution_due_at
          )
          VALUES (
            $1, $2, 'New', $3, 'Portal', $4,
            $5, $6, $7,
            $8, $9,
            $10, $11, $12
          )
          RETURNING *
        `,
        [
          subject,
          description || "",
          priority,
          normalizeName(req.body.category) || null,
          contact.rows[0].id,
          requesterPhone || null,
          requesterCompanyName || null,
          requesterName,
          requesterEmail,
          agent ? agent.id : null,
          calcDueDate(sla.first_response_minutes),
          calcDueDate(sla.resolution_minutes),
        ]
      );
      const ticket = createdTicket.rows[0];

      await query(
        `
          INSERT INTO ticket_messages (ticket_id, source, body, attachment_url, is_internal)
          VALUES ($1, 'requester_portal', $2, $3, FALSE)
        `,
        [ticket.id, description || "", attachmentUrl]
      );

      await logAudit(null, ticket.id, "public_requester_ticket_created", {
        requesterEmail,
        requesterName,
      });

      await runAutomationRules({
        eventName: "ticket_created",
        ticketId: ticket.id,
        actorUserId: null,
        context: {},
        logAudit,
      });

      let magicLinkSent = false;
      try {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + REQUESTER_MAGIC_LINK_TTL_MINUTES * 60000).toISOString();
        await query(
          `
            INSERT INTO requester_magic_links (email, token_hash, expires_at, created_ip)
            VALUES ($1, $2, $3, $4)
          `,
          [requesterEmail, tokenHash, expiresAt, String(req.ip || "")]
        );
        await sendMagicLinkEmail({ email: requesterEmail, link: buildRequesterMagicUrl(rawToken) });
        magicLinkSent = true;
      } catch (error) {
        magicLinkSent = false;
      }

      res.status(201).json({
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        magicLinkSent,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create requester ticket" });
    }
  });

  router.post("/public/requester/magic-link/send", async (req, res) => {
    try {
      const email = normalizeEmail(req.body.email);
      if (!email) {
        res.status(400).json({ error: "email is required" });
        return;
      }

      const hasTicket = await getOne(
        `
          SELECT t.id
          FROM tickets t
          LEFT JOIN contacts c ON c.id = t.requester_contact_id
          WHERE LOWER(COALESCE(t.requester_email, c.email, '')) = $1
          LIMIT 1
        `,
        [email]
      );
      if (!hasTicket) {
        res.json({ success: true });
        return;
      }

      const latestLink = await getOne(
        `
          SELECT created_at
          FROM requester_magic_links
          WHERE email = $1
          ORDER BY id DESC
          LIMIT 1
        `,
        [email]
      );
      if (latestLink) {
        const diffSeconds = (Date.now() - new Date(latestLink.created_at).getTime()) / 1000;
        if (diffSeconds < REQUESTER_LINK_COOLDOWN_SECONDS) {
          res.status(429).json({ error: `Please wait ${Math.ceil(REQUESTER_LINK_COOLDOWN_SECONDS - diffSeconds)} seconds before requesting another link.` });
          return;
        }
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashToken(rawToken);
      const expiresAt = new Date(Date.now() + REQUESTER_MAGIC_LINK_TTL_MINUTES * 60000).toISOString();

      await query(
        `
          INSERT INTO requester_magic_links (email, token_hash, expires_at, created_ip)
          VALUES ($1, $2, $3, $4)
        `,
        [email, tokenHash, expiresAt, String(req.ip || "")]
      );

      const link = buildRequesterMagicUrl(rawToken);
      await sendMagicLinkEmail({ email, link });
      await logAudit(null, null, "requester_magic_link_sent", { email });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message || "Failed to send magic link" });
    }
  });

  router.get("/public/requester/magic-link/verify", async (req, res) => {
    try {
      const rawToken = String(req.query.token || "").trim();
      if (!rawToken) {
        res.status(400).json({ error: "token is required" });
        return;
      }
      const tokenHash = hashToken(rawToken);
      const linkRecord = await getOne(
        `
          SELECT *
          FROM requester_magic_links
          WHERE token_hash = $1
            AND used_at IS NULL
            AND expires_at > NOW()
          LIMIT 1
        `,
        [tokenHash]
      );
      if (!linkRecord) {
        res.status(401).json({ error: "Invalid or expired magic link" });
        return;
      }

      await query(`UPDATE requester_magic_links SET used_at = NOW() WHERE id = $1`, [linkRecord.id]);
      const firstRequester = await getOne(
        `
          SELECT COALESCE(t.requester_name, c.name, '') AS name
          FROM tickets t
          LEFT JOIN contacts c ON c.id = t.requester_contact_id
          WHERE LOWER(COALESCE(t.requester_email, c.email, '')) = $1
          ORDER BY t.id DESC
          LIMIT 1
        `,
        [linkRecord.email]
      );
      const token = signRequesterSession({ email: linkRecord.email, name: firstRequester?.name || "" });
      await logAudit(null, null, "requester_magic_link_verified", { email: linkRecord.email });
      res.json({
        token,
        requester: {
          email: linkRecord.email,
          name: firstRequester?.name || "",
        },
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to verify magic link" });
    }
  });

  router.get("/public/requester/tickets", requesterSessionRequired, async (req, res) => {
    try {
      const rows = await getMany(
        `
          SELECT
            t.*,
            au.name AS assigned_agent_name
          FROM tickets t
          LEFT JOIN contacts c ON c.id = t.requester_contact_id
          LEFT JOIN users au ON au.id = t.assigned_agent_id
          WHERE LOWER(COALESCE(t.requester_email, c.email, '')) = $1
          ORDER BY t.updated_at DESC
        `,
        [req.requester.email]
      );
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to load requester tickets" });
    }
  });

  router.get("/public/requester/tickets/:id", requesterSessionRequired, async (req, res) => {
    const ticketId = Number(req.params.id);
    const ticket = await ensureRequesterOwnsTicket(req.requester.email, ticketId);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const messages = await getMany(
      `
        SELECT m.*
        FROM ticket_messages m
        WHERE m.ticket_id = $1
          AND m.is_internal = FALSE
        ORDER BY m.created_at ASC
      `,
      [ticketId]
    );
    res.json({ ...ticket, messages });
  });

  router.post("/public/requester/tickets/:id/messages", requesterSessionRequired, upload.single("attachment"), async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const ticket = await ensureRequesterOwnsTicket(req.requester.email, ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      const body = String(req.body.body || "").trim();
      const attachmentUrl = resolveAttachmentUrl(req.file);
      if (!body && !attachmentUrl) {
        res.status(400).json({ error: "body or attachment required" });
        return;
      }

      await query(
        `
          INSERT INTO ticket_messages (ticket_id, source, body, attachment_url, is_internal)
          VALUES ($1, 'requester_portal', $2, $3, FALSE)
        `,
        [ticketId, body, attachmentUrl]
      );
      await query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
      await logAudit(null, ticketId, "public_requester_message_added", { email: req.requester.email });

      await runAutomationRules({
        eventName: "ticket_message_added",
        ticketId,
        actorUserId: null,
        context: { isInternal: false },
        logAudit,
      });

      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add requester message" });
    }
  });

  router.post("/public/requester/tickets/:id/reopen", requesterSessionRequired, async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const ticket = await ensureRequesterOwnsTicket(req.requester.email, ticketId);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }
      await query(`UPDATE tickets SET status = 'New', updated_at = NOW() WHERE id = $1`, [ticketId]);
      await logAudit(null, ticketId, "public_requester_ticket_reopened", { email: req.requester.email });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to reopen ticket" });
    }
  });

  return router;
}

module.exports = { publicRequesterRoutes };
