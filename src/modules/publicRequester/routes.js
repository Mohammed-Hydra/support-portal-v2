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
const RESEND_API_URL = "https://api.resend.com/emails";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

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
  limits: {
    fileSize: 15 * 1024 * 1024,
    // Allow large base64 data URLs sent as text fields.
    fieldSize: 30 * 1024 * 1024,
  },
});

function resolveAttachmentUrl(file) {
  if (!file) return "";
  const name = String(file.originalname || "");
  const extLooksImage = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(name);
  const mimeLooksImage = String(file.mimetype || "").startsWith("image/");
  const sniffImageMime = (header) => {
    if (!header || header.length < 12) return "";
    // JPEG: FF D8 FF
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
    ) return "image/png";
    // GIF: GIF87a / GIF89a
    const asText = header.toString("ascii", 0, 6);
    if (asText === "GIF87a" || asText === "GIF89a") return "image/gif";
    // WEBP: RIFF....WEBP
    if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    // BMP: BM
    if (header[0] === 0x42 && header[1] === 0x4d) return "image/bmp";
    return "";
  };

  const tryInline = (forceMime) => {
    try {
      const mime = forceMime;
      if (!mime) return "";
      const raw = fs.readFileSync(file.path);
      return `data:${mime};base64,${raw.toString("base64")}`;
    } catch (error) {
      return "";
    }
  };

  if (mimeLooksImage || extLooksImage) {
    try {
      const mime = mimeLooksImage
        ? file.mimetype
        : (/\.(png)$/i.test(name) ? "image/png"
          : /\.(gif)$/i.test(name) ? "image/gif"
            : /\.(webp)$/i.test(name) ? "image/webp"
              : /\.(bmp)$/i.test(name) ? "image/bmp"
                : /\.(svg)$/i.test(name) ? "image/svg+xml"
                  : /\.(heic|heif)$/i.test(name) ? "image/heic"
                    : "image/jpeg");
      const inline = tryInline(mime);
      if (inline) return inline;
    } catch (error) {
      // Fall back to public uploads path if inline conversion fails.
    }
  }

  // If the device sends a generic mimetype (or no extension), sniff common image headers.
  try {
    const fd = fs.openSync(file.path, "r");
    try {
      const header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, header.length, 0);
      const sniffed = sniffImageMime(header);
      const inline = tryInline(sniffed);
      if (inline) return inline;
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    // ignore and fall back
  }
  return `/uploads-v2/${file.filename}`;
}

function resolveAttachmentFromBody(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return "";
  const mime = String(match[1] || "").toLowerCase();
  const base64 = match[2] || "";
  if (!base64) return "";

  const sniffImageMime = (header) => {
    if (!header || header.length < 12) return "";
    if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
    if (
      header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47
      && header[4] === 0x0d && header[5] === 0x0a && header[6] === 0x1a && header[7] === 0x0a
    ) return "image/png";
    const asText = header.toString("ascii", 0, 6);
    if (asText === "GIF87a" || asText === "GIF89a") return "image/gif";
    if (header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    if (header[0] === 0x42 && header[1] === 0x4d) return "image/bmp";
    return "";
  };

  if (mime.startsWith("image/")) return value;

  // Some devices/browser flows send `application/octet-stream` for images.
  // Sniff the first bytes (without decoding the full payload) and rebuild as image data URL if needed.
  try {
    const header = Buffer.from(base64.slice(0, 64), "base64");
    const sniffed = sniffImageMime(header);
    if (!sniffed) return "";
    return `data:${sniffed};base64,${base64}`;
  } catch (error) {
    return "";
  }
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

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

function hasGraphMailConfig() {
  return Boolean(
    process.env.M365_TENANT_ID
    && process.env.M365_CLIENT_ID
    && process.env.M365_CLIENT_SECRET
    && process.env.M365_SENDER_UPN
  );
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
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Graph sendMail failed: ${response.status} ${raw}`);
  }
}

async function sendEmailViaResend({ to, subject, text, html }) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend send failed: ${response.status} ${data?.message || JSON.stringify(data)}`);
  }
}

async function sendMagicLinkEmail({ email, link }) {
  const subject = "Your IT Support Portal access link";
  const text = `Use this one-time link to access your requester portal:\n\n${link}\n\nThis link expires in ${REQUESTER_MAGIC_LINK_TTL_MINUTES} minutes.`;
  const html = `<p>Use this one-time link to access your requester portal:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${REQUESTER_MAGIC_LINK_TTL_MINUTES} minutes.</p>`;

  if (hasResendConfig()) {
    await sendEmailViaResend({ to: email, subject, text, html });
    return;
  }
  if (hasGraphMailConfig()) {
    await sendEmailViaGraph({ to: email, subject, text, html });
    return;
  }
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("Mail is not configured. Set RESEND_API_KEY+RESEND_FROM, M365_*, or SMTP env vars.");
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text,
    html,
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

      const attachmentUrl = resolveAttachmentFromBody(req.body.attachmentDataUrl) || resolveAttachmentUrl(req.file);
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
      const attachmentUrl = resolveAttachmentFromBody(req.body.attachmentDataUrl) || resolveAttachmentUrl(req.file);
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
