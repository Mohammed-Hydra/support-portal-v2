const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");
const { pickLeastLoadedAgent, computeSla, calcDueDate, runAutomationRules } = require("../automations/service");
const { sendNotificationEmail, getRequesterTrackUrl } = require("../../lib/mailer");

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

function splitTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function ticketsRoutes({ logAudit, createNotification }) {
  const router = express.Router();
  const noop = () => {};

  async function getRequesterNotificationTarget(ticketId) {
    const row = await getOne(
      `
        SELECT
          COALESCE(NULLIF(t.requester_email, ''), c.email, '') AS email,
          COALESCE(NULLIF(t.requester_name, ''), c.name, '') AS name,
          t.subject,
          t.status,
          t.priority
        FROM tickets t
        LEFT JOIN contacts c ON c.id = t.requester_contact_id
        WHERE t.id = $1
      `,
      [ticketId]
    );
    const email = String(row?.email || "").trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      name: String(row?.name || "").trim(),
      subject: String(row?.subject || "").trim(),
      status: String(row?.status || "").trim(),
      priority: String(row?.priority || "").trim(),
    };
  }

  async function shouldSendEmailToRequester(ticketId, eventType) {
    const target = await getRequesterNotificationTarget(ticketId);
    if (!target?.email) return false;
    const row = await getOne(
      `SELECT notify_on_message, notify_on_status_change, notify_on_assignment FROM requester_email_preferences WHERE email = $1`,
      [target.email.toLowerCase()]
    );
    if (!row) return true;
    if (eventType === "message" && !row.notify_on_message) return false;
    if (eventType === "status_change" && !row.notify_on_status_change) return false;
    if (eventType === "assignment" && !row.notify_on_assignment) return false;
    return true;
  }

  async function notifyRequester({ ticketId, title, bodyLines, eventType = "message" }) {
    const target = await getRequesterNotificationTarget(ticketId);
    if (!target) return;
    const sendEmail = await shouldSendEmailToRequester(ticketId, eventType);
    if (!sendEmail) return;

    const trackUrl = getRequesterTrackUrl();
    const subject = title || `Update on ticket #${ticketId}`;
    const lines = (Array.isArray(bodyLines) ? bodyLines : [String(bodyLines || "")]).filter(Boolean);

    const text = [
      ...(target.name ? [`Hi ${target.name},`, ""] : []),
      `Ticket #${ticketId}: ${target.subject || ""}`.trim(),
      `Status: ${target.status}${target.priority ? ` | Priority: ${target.priority}` : ""}`,
      "",
      ...lines,
      ...(trackUrl ? ["", `View / Reply: ${trackUrl}`] : []),
    ].join("\n");

    const html = [
      ...(target.name ? [`<p>Hi ${escapeHtml(target.name)},</p>`] : []),
      `<p><strong>Ticket #${ticketId}</strong>: ${escapeHtml(target.subject || "")}</p>`,
      `<p><strong>Status</strong>: ${escapeHtml(target.status)}${target.priority ? ` &nbsp;|&nbsp; <strong>Priority</strong>: ${escapeHtml(target.priority)}` : ""}</p>`,
      ...lines.map((line) => `<p>${escapeHtml(line)}</p>`),
      ...(trackUrl ? [`<p><a href="${trackUrl}">View / Reply</a></p>`] : []),
    ].join("");

    try {
      await sendNotificationEmail({ to: target.email, subject, text, html });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Requester notification failed:", error?.message || error);
    }
  }

  router.get("/tickets", authRequired, async (req, res) => {
    const filters = [];
    const params = [];
    let idx = 1;

    if (req.user.role === "requester") {
      filters.push(`t.requester_user_id = $${idx}`);
      params.push(req.user.sub);
      idx += 1;
    }
    if (req.query.status) {
      filters.push(`t.status = $${idx}`);
      params.push(req.query.status);
      idx += 1;
    }
    if (req.query.priority) {
      filters.push(`t.priority = $${idx}`);
      params.push(req.query.priority);
      idx += 1;
    }
    if (req.query.channel) {
      filters.push(`t.channel = $${idx}`);
      params.push(req.query.channel);
      idx += 1;
    }
    if (req.query.category) {
      filters.push(`t.category = $${idx}`);
      params.push(req.query.category);
      idx += 1;
    }
    if (req.query.agent) {
      const agentId = Number(req.query.agent);
      if (Number.isFinite(agentId)) {
        filters.push(`t.assigned_agent_id = $${idx}`);
        params.push(agentId);
        idx += 1;
      }
    }
    if (req.query.id) {
      const ticketId = Number(req.query.id);
      if (Number.isFinite(ticketId)) {
        filters.push(`t.id = $${idx}`);
        params.push(ticketId);
        idx += 1;
      }
    }
    if (req.query.breached === "1" || req.query.breached === "true") {
      filters.push(`t.resolution_due_at IS NOT NULL AND t.resolution_due_at < NOW() AND t.status NOT IN ('Resolved','Closed')`);
    }
    if (req.query.days) {
      const parsedDays = Number(req.query.days);
      if (Number.isFinite(parsedDays) && parsedDays > 0) {
        filters.push(`t.created_at >= NOW() - ($${idx}::int * INTERVAL '1 day')`);
        params.push(Math.floor(parsedDays));
        idx += 1;
      }
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const tickets = await getMany(
      `
        SELECT
          t.*,
          ru.name AS requester_name_from_user,
          ru.email AS requester_email_from_user,
          c.name AS requester_name_from_contact,
          c.email AS requester_email_from_contact,
          c.phone AS requester_phone_from_contact,
          c.company AS requester_company_from_contact,
          au.name AS assigned_agent_name
        FROM tickets t
        LEFT JOIN users ru ON ru.id = t.requester_user_id
        LEFT JOIN contacts c ON c.id = t.requester_contact_id
        LEFT JOIN users au ON au.id = t.assigned_agent_id
        ${whereClause}
        ORDER BY t.updated_at DESC
      `,
      params
    );
    res.json(tickets);
  });

  router.get("/tickets/:id", authRequired, async (req, res) => {
    const ticketId = Number(req.params.id);
    const ticket = await getOne(
      `
        SELECT
          t.*,
          ru.name AS requester_name_from_user,
          ru.email AS requester_email_from_user,
          c.name AS requester_name_from_contact,
          c.email AS requester_email_from_contact,
          c.phone AS requester_phone_from_contact,
          c.company AS requester_company_from_contact,
          au.name AS assigned_agent_name
        FROM tickets t
        LEFT JOIN users ru ON ru.id = t.requester_user_id
        LEFT JOIN contacts c ON c.id = t.requester_contact_id
        LEFT JOIN users au ON au.id = t.assigned_agent_id
        WHERE t.id = $1
      `,
      [ticketId]
    );
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    if (req.user.role === "requester" && Number(ticket.requester_user_id) !== Number(req.user.sub)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const messages = await getMany(
      `
        SELECT m.*, u.name AS author_name
        FROM ticket_messages m
        LEFT JOIN users u ON u.id = m.author_user_id
        WHERE m.ticket_id = $1
          AND ($2::text IN ('admin', 'agent') OR m.is_internal = FALSE)
        ORDER BY m.created_at ASC
      `,
      [ticketId, req.user.role]
    );

    const collaborators = await getMany(
      `
        SELECT tc.user_id, u.name, u.email, u.role
        FROM ticket_collaborators tc
        JOIN users u ON u.id = tc.user_id
        WHERE tc.ticket_id = $1
        ORDER BY u.name
      `,
      [ticketId]
    );

    res.json({ ...ticket, messages, collaborators });
  });

  router.post("/tickets", authRequired, upload.single("attachment"), async (req, res) => {
    try {
      const subject = (req.body.subject || "").trim();
      if (!subject) {
        res.status(400).json({ error: "subject is required" });
        return;
      }

      const priority = req.body.priority || "Medium";
      const status = req.body.status || "New";
      const sla = await computeSla(priority);
      const autoAgent = await pickLeastLoadedAgent();
      const attachmentUrl = resolveAttachmentUrl(req.file);
      const tags = splitTags(req.body.tags);
      const requesterNameFromBody = (req.body.requesterName || "").trim();
      const requesterPhone = (req.body.requesterPhone || "").trim();
      const requesterCompanyName = (req.body.requesterCompanyName || "").trim();

      const requesterUser = await getOne(
        `
          SELECT id, name, email, phone, company_name
          FROM users
          WHERE id = $1
        `,
        [req.user.sub]
      );
      const isRequesterActor = req.user.role === "requester";
      const requesterName = isRequesterActor ? (requesterNameFromBody || requesterUser?.name || "Requester") : null;
      const requesterEmail = isRequesterActor ? (requesterUser?.email || "") : "";

      let requesterContactId = null;
      if (isRequesterActor && requesterEmail) {
        const contactUpsert = await query(
          `
            INSERT INTO contacts (name, email, phone, company)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (email)
            DO UPDATE SET
              name = EXCLUDED.name,
              phone = COALESCE(NULLIF(EXCLUDED.phone, ''), contacts.phone),
              company = COALESCE(NULLIF(EXCLUDED.company, ''), contacts.company)
            RETURNING id
          `,
          [
            requesterName,
            requesterEmail,
            requesterPhone || requesterUser?.phone || "",
            requesterCompanyName || requesterUser?.company_name || "",
          ]
        );
        requesterContactId = contactUpsert.rows[0]?.id || null;
      }

      const created = await query(
        `
          INSERT INTO tickets (
            subject, description, status, priority, channel, category, tags,
            requester_user_id, requester_contact_id, requester_phone, requester_company_name, requester_name, requester_email,
            assigned_agent_id, first_response_due_at, resolution_due_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING *
        `,
        [
          subject,
          req.body.description || "",
          status,
          priority,
          req.body.channel || "Portal",
          req.body.category || null,
          tags,
          req.user.sub,
          requesterContactId,
          isRequesterActor ? (requesterPhone || requesterUser?.phone || null) : null,
          isRequesterActor ? (requesterCompanyName || requesterUser?.company_name || null) : null,
          requesterName,
          requesterEmail || null,
          autoAgent ? autoAgent.id : null,
          calcDueDate(sla.first_response_minutes),
          calcDueDate(sla.resolution_minutes),
        ]
      );
      const ticket = created.rows[0];

      await query(
        `
          INSERT INTO ticket_messages (ticket_id, author_user_id, source, body, attachment_url, is_internal)
          VALUES ($1, $2, $3, $4, $5, FALSE)
        `,
        [ticket.id, req.user.sub, req.body.channel || "Portal", req.body.description || "", attachmentUrl]
      );

      if (autoAgent) {
        await query(
          `
            INSERT INTO ticket_collaborators (ticket_id, user_id)
            VALUES ($1, $2)
            ON CONFLICT (ticket_id, user_id) DO NOTHING
          `,
          [ticket.id, autoAgent.id]
        );
      }

      await logAudit(req.user.sub, ticket.id, "ticket_created", { priority, status });
      const notify = createNotification || noop;
      if (autoAgent && Number(autoAgent.id) !== Number(req.user.sub)) {
        await notify({ userId: autoAgent.id, ticketId: ticket.id, type: "assignment", title: `Assigned to ticket #${ticket.id}`, body: ticket.subject });
      }
      await runAutomationRules({
        eventName: "ticket_created",
        ticketId: ticket.id,
        actorUserId: req.user.sub,
        context: {},
        logAudit,
      });
      res.status(201).json(ticket);
    } catch (error) {
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  router.patch("/tickets/:id", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const existing = await getOne(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
      if (!existing) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      const nextStatus = req.body.status || existing.status;
      const nextPriority = req.body.priority || existing.priority;
      const nextSubject = typeof req.body.subject === "string" ? req.body.subject.trim() || existing.subject : existing.subject;
      const nextDescription = Object.prototype.hasOwnProperty.call(req.body || {}, "description")
        ? (req.body.description ?? existing.description)
        : existing.description;
      const hasAssignedAgentField = Object.prototype.hasOwnProperty.call(req.body || {}, "assignedAgentId");
      let assignedAgentId = existing.assigned_agent_id;
      if (hasAssignedAgentField) {
        if (req.body.assignedAgentId === null || req.body.assignedAgentId === "" || req.body.assignedAgentId === "null") {
          assignedAgentId = null;
        } else {
          const parsed = Number(req.body.assignedAgentId);
          assignedAgentId = Number.isFinite(parsed) ? parsed : existing.assigned_agent_id;
        }
      }
      const tags = splitTags(req.body.tags || existing.tags || []);
      const nextCategory = Object.prototype.hasOwnProperty.call(req.body || {}, "category")
        ? ((req.body.category && String(req.body.category).trim()) || null)
        : existing.category;
      const nextChannel = typeof req.body.channel === "string" && req.body.channel.trim()
        ? req.body.channel.trim()
        : existing.channel;
      const nextRequesterName = Object.prototype.hasOwnProperty.call(req.body || {}, "requesterName")
        ? (req.body.requesterName != null ? String(req.body.requesterName).trim() || null : existing.requester_name)
        : existing.requester_name;
      const nextRequesterEmail = Object.prototype.hasOwnProperty.call(req.body || {}, "requesterEmail")
        ? (req.body.requesterEmail != null ? String(req.body.requesterEmail).trim() || null : existing.requester_email)
        : existing.requester_email;
      const nextRequesterPhone = Object.prototype.hasOwnProperty.call(req.body || {}, "requesterPhone")
        ? (req.body.requesterPhone != null ? String(req.body.requesterPhone).trim() || null : existing.requester_phone)
        : existing.requester_phone;

      const updated = await query(
        `
          UPDATE tickets
          SET status = $1,
              priority = $2,
              subject = $3,
              description = $4,
              assigned_agent_id = $5,
              category = $6,
              tags = $7::text[],
              channel = $8,
              requester_name = $9,
              requester_email = $10,
              requester_phone = $11,
              updated_at = NOW(),
              resolved_at = CASE WHEN $1 IN ('Resolved', 'Closed') THEN NOW() ELSE resolved_at END
          WHERE id = $12
          RETURNING *
        `,
        [nextStatus, nextPriority, nextSubject, nextDescription, assignedAgentId, nextCategory, tags, nextChannel, nextRequesterName, nextRequesterEmail, nextRequesterPhone, ticketId]
      );

      if (Array.isArray(req.body.collaboratorIds)) {
        for (const collaboratorId of req.body.collaboratorIds) {
          // eslint-disable-next-line no-await-in-loop
          await query(
            `
              INSERT INTO ticket_collaborators (ticket_id, user_id)
              VALUES ($1, $2)
              ON CONFLICT (ticket_id, user_id) DO NOTHING
            `,
            [ticketId, collaboratorId]
          );
        }
      }

      await logAudit(req.user.sub, ticketId, "ticket_updated", {
        status: nextStatus,
        priority: nextPriority,
        assignedAgentId: assignedAgentId || null,
      });

      await runAutomationRules({
        eventName: "ticket_updated",
        ticketId,
        actorUserId: req.user.sub,
        context: {
          previousStatus: existing.status,
          previousPriority: existing.priority,
        },
        logAudit,
      });
      if (nextStatus !== existing.status) {
        await runAutomationRules({
          eventName: "ticket_status_changed",
          ticketId,
          actorUserId: req.user.sub,
          context: {
            previousStatus: existing.status,
            previousPriority: existing.priority,
          },
          logAudit,
        });
      }
      if (nextPriority !== existing.priority) {
        await runAutomationRules({
          eventName: "ticket_priority_changed",
          ticketId,
          actorUserId: req.user.sub,
          context: {
            previousStatus: existing.status,
            previousPriority: existing.priority,
          },
          logAudit,
        });
      }

      if (nextStatus !== existing.status) {
        if (nextStatus === "Waiting User") {
          await notifyRequester({
            ticketId,
            title: `Action required for ticket #${ticketId}`,
            bodyLines: [
              "Our support team needs more information to proceed.",
              "Please reply in the requester portal with any additional details or screenshots.",
            ],
            eventType: "status_change",
          });
        }
        if (nextStatus === "Resolved" || nextStatus === "Closed") {
          await notifyRequester({
            ticketId,
            title: `Ticket #${ticketId} marked as ${nextStatus}`,
            bodyLines: [
              "Your ticket has been marked as resolved.",
              "If the issue is not fixed, you can reopen the ticket from the requester portal.",
            ],
            eventType: "status_change",
          });
        }
        const ticketRow = await getOne(`SELECT subject, requester_user_id, assigned_agent_id FROM tickets WHERE id = $1`, [ticketId]);
        const notify = createNotification || noop;
        if (ticketRow?.requester_user_id) {
          await notify({ userId: ticketRow.requester_user_id, ticketId, type: "status_change", title: `Ticket #${ticketId} status: ${nextStatus}`, body: ticketRow.subject });
        }
        if (ticketRow?.assigned_agent_id && Number(ticketRow.assigned_agent_id) !== Number(req.user.sub)) {
          await notify({ userId: ticketRow.assigned_agent_id, ticketId, type: "status_change", title: `Ticket #${ticketId} status: ${nextStatus}`, body: ticketRow.subject });
        }
      }
      if (assignedAgentId !== existing.assigned_agent_id && assignedAgentId) {
        const ticketRow = await getOne(`SELECT subject FROM tickets WHERE id = $1`, [ticketId]);
        const notify = createNotification || noop;
        await notify({ userId: assignedAgentId, ticketId, type: "assignment", title: `Assigned to ticket #${ticketId}`, body: ticketRow?.subject });
        const requesterRow = await getOne(`SELECT requester_user_id FROM tickets WHERE id = $1`, [ticketId]);
        if (requesterRow?.requester_user_id) {
          await notifyRequester({
            ticketId,
            title: `Ticket #${ticketId} assigned`,
            bodyLines: ["Your ticket has been assigned to an agent."],
            eventType: "assignment",
          });
        }
      }

      res.json(updated.rows[0]);
    } catch (error) {
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  router.post("/tickets/:id/messages", authRequired, upload.single("attachment"), async (req, res) => {
    try {
      const ticketId = Number(req.params.id);
      const ticket = await getOne(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      if (req.user.role === "requester" && Number(ticket.requester_user_id) !== Number(req.user.sub)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const body = (req.body.body || "").trim();
      const attachmentUrl = resolveAttachmentUrl(req.file);
      const isInternal = req.body.isInternal === "true" || req.body.isInternal === true;
      if (!body && !attachmentUrl) {
        res.status(400).json({ error: "body or attachment required" });
        return;
      }
      if (req.user.role === "requester" && isInternal) {
        res.status(403).json({ error: "Requester cannot create internal notes" });
        return;
      }

      await query(
        `
          INSERT INTO ticket_messages (ticket_id, author_user_id, source, body, attachment_url, is_internal)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [ticketId, req.user.sub, req.user.role, body, attachmentUrl, isInternal]
      );

      await query(
        `
          UPDATE tickets
          SET updated_at = NOW(),
              first_response_at = CASE WHEN first_response_at IS NULL AND $1 IN ('admin','agent') THEN NOW() ELSE first_response_at END
          WHERE id = $2
        `,
        [req.user.role, ticketId]
      );

      await logAudit(req.user.sub, ticketId, "message_added", { isInternal });
      await runAutomationRules({
        eventName: "ticket_message_added",
        ticketId,
        actorUserId: req.user.sub,
        context: { isInternal },
        logAudit,
      });

      if ((req.user.role === "admin" || req.user.role === "agent") && !isInternal) {
        const snippet = body ? (body.length > 500 ? `${body.slice(0, 500)}…` : body) : "";
        await notifyRequester({
          ticketId,
          title: `New reply on ticket #${ticketId}`,
          bodyLines: [
            snippet ? `Message: ${snippet}` : "A new update was added to your ticket.",
          ],
          eventType: "message",
        });
        const ticketRow = await getOne(`SELECT subject, requester_user_id, assigned_agent_id FROM tickets WHERE id = $1`, [ticketId]);
        const notify = createNotification || noop;
        if (ticketRow?.requester_user_id) {
          await notify({ userId: ticketRow.requester_user_id, ticketId, type: "new_message", title: `New reply on ticket #${ticketId}`, body: snippet || "New update" });
        }
        if (ticketRow?.assigned_agent_id && Number(ticketRow.assigned_agent_id) !== Number(req.user.sub)) {
          await notify({ userId: ticketRow.assigned_agent_id, ticketId, type: "new_message", title: `New reply on ticket #${ticketId}`, body: snippet || "New update" });
        }
      }
      if (req.user.role === "requester") {
        const ticketRow = await getOne(`SELECT assigned_agent_id FROM tickets WHERE id = $1`, [ticketId]);
        const notify = createNotification || noop;
        if (ticketRow?.assigned_agent_id) {
          await notify({ userId: ticketRow.assigned_agent_id, ticketId, type: "new_message", title: `New reply on ticket #${ticketId}`, body: body ? (body.length > 200 ? body.slice(0, 200) + "…" : body) : "New reply" });
        }
      }
      res.status(201).json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to add message" });
    }
  });

  router.post("/tickets/:id/reopen", authRequired, async (req, res) => {
    const ticketId = Number(req.params.id);
    const ticket = await getOne(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    if (req.user.role === "requester" && Number(ticket.requester_user_id) !== Number(req.user.sub)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    await query(`UPDATE tickets SET status = 'New', updated_at = NOW() WHERE id = $1`, [ticketId]);
    await logAudit(req.user.sub, ticketId, "ticket_reopened", {});
    res.json({ success: true });
  });

  router.post("/tickets/bulk/status", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const ticketIds = Array.isArray(req.body.ticketIds) ? req.body.ticketIds.map(Number) : [];
    const status = req.body.status || "In Progress";
    if (!ticketIds.length) {
      res.status(400).json({ error: "ticketIds required" });
      return;
    }
    await query(`UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = ANY($2::bigint[])`, [status, ticketIds]);
    await logAudit(req.user.sub, null, "tickets_bulk_status_update", { status, ticketIds });
    res.json({ success: true, updated: ticketIds.length });
  });

  return router;
}

module.exports = { ticketsRoutes };
