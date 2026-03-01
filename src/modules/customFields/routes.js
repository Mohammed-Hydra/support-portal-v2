const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");

function customFieldsRoutes() {
  const router = express.Router();

  router.get("/custom-fields/definitions", authRequired, async (req, res) => {
    const category = (req.query.category || "").trim();
    const rows = await getMany(
      `SELECT id, key, label, field_type, category_filter, is_required, sort_order
       FROM custom_field_definitions
       ORDER BY sort_order, id`
    );
    const filtered = category
      ? rows.filter(
          (r) =>
            !r.category_filter ||
            !Array.isArray(r.category_filter) ||
            r.category_filter.length === 0 ||
            r.category_filter.includes(category)
        )
      : rows;
    res.json(filtered);
  });

  router.post("/custom-fields/definitions", authRequired, roleRequired("admin"), async (req, res) => {
    const key = String(req.body.key || "").trim().replace(/[^a-z0-9_]/g, "_") || "field";
    const label = String(req.body.label || "").trim() || key;
    const fieldType = ["text", "number", "select"].includes(req.body.field_type) ? req.body.field_type : "text";
    const categoryFilter = Array.isArray(req.body.category_filter) ? req.body.category_filter : null;
    const isRequired = Boolean(req.body.is_required);
    const sortOrder = Number(req.body.sort_order) || 0;
    const inserted = await query(
      `INSERT INTO custom_field_definitions (key, label, field_type, category_filter, is_required, sort_order)
       VALUES ($1, $2, $3, $4::text[], $5, $6)
       ON CONFLICT (key) DO UPDATE SET label = $2, field_type = $3, category_filter = $4, is_required = $5, sort_order = $6
       RETURNING id, key, label, field_type, category_filter, is_required, sort_order`,
      [key, label, fieldType, categoryFilter || [], isRequired, sortOrder]
    );
    res.status(201).json(inserted.rows[0]);
  });

  router.get("/tickets/:id/custom-fields", authRequired, async (req, res) => {
    const ticketId = Number(req.params.id);
    const rows = await getMany(
      `SELECT field_key, field_value FROM ticket_custom_fields WHERE ticket_id = $1`,
      [ticketId]
    );
    const obj = {};
    rows.forEach((r) => {
      obj[r.field_key] = r.field_value;
    });
    res.json(obj);
  });

  router.put("/tickets/:id/custom-fields", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const ticketId = Number(req.params.id);
    const fields = req.body && typeof req.body === "object" ? req.body : {};
    const definitions = await getMany(`SELECT key FROM custom_field_definitions`);
    const validKeys = new Set(definitions.map((d) => d.key));
    for (const [k, v] of Object.entries(fields)) {
      if (!validKeys.has(k)) continue;
      const val = v == null ? "" : String(v);
      await query(
        `INSERT INTO ticket_custom_fields (ticket_id, field_key, field_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (ticket_id, field_key) DO UPDATE SET field_value = $3`,
        [ticketId, k, val]
      );
    }
    const rows = await getMany(`SELECT field_key, field_value FROM ticket_custom_fields WHERE ticket_id = $1`, [ticketId]);
    const obj = {};
    rows.forEach((r) => {
      obj[r.field_key] = r.field_value;
    });
    res.json(obj);
  });

  return router;
}

module.exports = { customFieldsRoutes };
