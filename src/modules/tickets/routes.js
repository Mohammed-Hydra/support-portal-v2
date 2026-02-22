const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");
const { pickLeastLoadedAgent, computeSla, calcDueDate, runAutomationRules } = require("../automations/service");

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

function splitTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function ticketsRoutes({ logAudit }) {
  const router = express.Router();

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
      const attachmentUrl = req.file ? `/uploads-v2/${req.file.filename}` : "";
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

      const updated = await query(
        `
          UPDATE tickets
          SET status = $1,
              priority = $2,
              assigned_agent_id = $3,
              category = $4,
              tags = $5::text[],
              updated_at = NOW(),
              resolved_at = CASE WHEN $1 IN ('Resolved', 'Closed') THEN NOW() ELSE resolved_at END
          WHERE id = $6
          RETURNING *
        `,
        [nextStatus, nextPriority, assignedAgentId, req.body.category || existing.category, tags, ticketId]
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
      const attachmentUrl = req.file ? `/uploads-v2/${req.file.filename}` : "";
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
