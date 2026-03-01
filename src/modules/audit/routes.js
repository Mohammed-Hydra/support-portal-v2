const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany } = require("../../db/client");

function auditRoutes() {
  const router = express.Router();

  router.get("/audit-logs", authRequired, roleRequired("admin"), async (req, res) => {
    const action = (req.query.action || "").trim();
    const ticketId = req.query.ticketId ? Number(req.query.ticketId) : null;
    const actorId = req.query.actorId ? Number(req.query.actorId) : null;
    const since = (req.query.since || "").trim();
    const until = (req.query.until || "").trim();
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const conditions = [];
    const params = [];
    let idx = 1;

    if (action) {
      conditions.push(`a.action = $${idx}`);
      params.push(action);
      idx += 1;
    }
    if (ticketId != null && Number.isFinite(ticketId)) {
      conditions.push(`a.ticket_id = $${idx}`);
      params.push(ticketId);
      idx += 1;
    }
    if (actorId != null && Number.isFinite(actorId)) {
      conditions.push(`a.actor_user_id = $${idx}`);
      params.push(actorId);
      idx += 1;
    }
    if (since) {
      conditions.push(`a.created_at >= $${idx}::timestamptz`);
      params.push(since);
      idx += 1;
    }
    if (until) {
      conditions.push(`a.created_at <= $${idx}::timestamptz`);
      params.push(until);
      idx += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);

    const rows = await getMany(
      `SELECT a.id, a.actor_user_id, a.ticket_id, a.action, a.details, a.created_at,
              u.name AS actor_name, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx}`,
      params
    );
    res.json(rows);
  });

  router.get("/audit-logs/actions", authRequired, roleRequired("admin"), async (req, res) => {
    const rows = await getMany(
      `SELECT DISTINCT action FROM audit_logs ORDER BY action`
    );
    res.json(rows.map((r) => r.action));
  });

  return router;
}

module.exports = { auditRoutes };
