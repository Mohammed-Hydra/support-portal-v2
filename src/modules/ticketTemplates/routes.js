const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");

function toJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return {};
  }
}

function ticketTemplatesRoutes() {
  const router = express.Router();

  router.get("/ticket-templates", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const rows = await getMany(
      `SELECT * FROM ticket_templates ORDER BY sort_order ASC, name ASC`
    );
    res.json(rows);
  });

  router.post("/ticket-templates", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.subject) {
      res.status(400).json({ error: "name and subject are required" });
      return;
    }
    const customFields = body.custom_fields_json ? toJson(body.custom_fields_json) : {};
    const created = await query(
      `
        INSERT INTO ticket_templates (name, subject, description, category, priority, custom_fields_json, sort_order, created_by)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        RETURNING *
      `,
      [
        String(body.name).trim(),
        String(body.subject).trim(),
        String(body.description || "").trim(),
        body.category || null,
        body.priority || "Medium",
        JSON.stringify(customFields),
        Number(body.sort_order) || 0,
        req.user.sub,
      ]
    );
    res.status(201).json(created.rows[0]);
  });

  router.patch("/ticket-templates/:id", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM ticket_templates WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    const body = req.body || {};
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const subject = body.subject !== undefined ? String(body.subject).trim() : existing.subject;
    const description = body.description !== undefined ? String(body.description || "").trim() : (existing.description || "");
    const category = body.category !== undefined ? (body.category || null) : existing.category;
    const priority = body.priority !== undefined ? (body.priority || "Medium") : existing.priority;
    const customFields = body.custom_fields_json !== undefined ? toJson(body.custom_fields_json) : toJson(existing.custom_fields_json);
    const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) || 0 : existing.sort_order;

    await query(
      `UPDATE ticket_templates SET name = $1, subject = $2, description = $3, category = $4, priority = $5, custom_fields_json = $6::jsonb, sort_order = $7 WHERE id = $8`,
      [name, subject, description, category, priority, JSON.stringify(customFields), sortOrder, id]
    );
    const updated = await getOne(`SELECT * FROM ticket_templates WHERE id = $1`, [id]);
    res.json(updated);
  });

  router.delete("/ticket-templates/:id", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM ticket_templates WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    await query(`DELETE FROM ticket_templates WHERE id = $1`, [id]);
    res.status(204).send();
  });

  return router;
}

module.exports = { ticketTemplatesRoutes };
