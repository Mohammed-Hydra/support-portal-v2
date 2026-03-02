const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");

function cannedResponsesRoutes() {
  const router = express.Router();

  router.get("/canned-responses", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const category = String(req.query.category || "").trim();
    const rows = await getMany(
      `
        SELECT id, title, body, category_filter, sort_order
        FROM canned_responses
        ORDER BY sort_order ASC, title ASC
      `
    );
    let filtered = rows;
    if (category) {
      filtered = rows.filter((r) => {
        const cats = r.category_filter || [];
        if (!cats.length) return true;
        return cats.some((c) => String(c).toLowerCase() === category.toLowerCase());
      });
    }
    res.json(filtered);
  });

  router.post("/canned-responses", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const body = req.body || {};
    if (!body.title || !body.body) {
      res.status(400).json({ error: "title and body are required" });
      return;
    }
    const categoryFilter = Array.isArray(body.category_filter) ? body.category_filter : [];
    const created = await query(
      `
        INSERT INTO canned_responses (title, body, category_filter, sort_order, created_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        String(body.title).trim(),
        String(body.body).trim(),
        categoryFilter,
        Number(body.sort_order) || 0,
        req.user.sub,
      ]
    );
    res.status(201).json(created.rows[0]);
  });

  router.patch("/canned-responses/:id", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM canned_responses WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({ error: "Canned response not found" });
      return;
    }
    const body = req.body || {};
    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    const respBody = body.body !== undefined ? String(body.body).trim() : existing.body;
    const categoryFilter = body.category_filter !== undefined
      ? (Array.isArray(body.category_filter) ? body.category_filter : [])
      : (existing.category_filter || []);
    const sortOrder = body.sort_order !== undefined ? Number(body.sort_order) || 0 : existing.sort_order;

    await query(
      `UPDATE canned_responses SET title = $1, body = $2, category_filter = $3, sort_order = $4 WHERE id = $5`,
      [title, respBody, categoryFilter, sortOrder, id]
    );
    const updated = await getOne(`SELECT * FROM canned_responses WHERE id = $1`, [id]);
    res.json(updated);
  });

  router.delete("/canned-responses/:id", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const id = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM canned_responses WHERE id = $1`, [id]);
    if (!existing) {
      res.status(404).json({ error: "Canned response not found" });
      return;
    }
    await query(`DELETE FROM canned_responses WHERE id = $1`, [id]);
    res.status(204).send();
  });

  return router;
}

module.exports = { cannedResponsesRoutes };
