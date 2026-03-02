const express = require("express");
const { authRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");

function notificationsRoutes() {
  const router = express.Router();

  router.get("/notifications", authRequired, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const unreadOnly = req.query.unread === "true" || req.query.unread === "1";
    const userId = req.user.sub;

    let where = "WHERE user_id = $1";
    const params = [userId];
    if (unreadOnly) {
      where += " AND read_at IS NULL";
    }
    params.push(limit);

    const rows = await getMany(
      `SELECT n.id, n.ticket_id, n.type, n.title, n.body, n.actor_name, n.read_at, n.created_at, t.subject AS ticket_subject
       FROM notifications n
       LEFT JOIN tickets t ON t.id = n.ticket_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT $2`,
      params
    );
    res.json(rows);
  });

  router.get("/notifications/unread-count", authRequired, async (req, res) => {
    const row = await getOne(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.sub]
    );
    res.json({ count: row?.count ?? 0 });
  });

  router.post("/notifications/:id/read", authRequired, async (req, res) => {
    const id = Number(req.params.id);
    const userId = req.user.sub;
    await query(
      `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, userId]
    );
    res.json({ ok: true });
  });

  router.post("/notifications/read-all", authRequired, async (req, res) => {
    await query(
      `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL`,
      [req.user.sub]
    );
    res.json({ ok: true });
  });

  return router;
}

async function createNotification({ userId, ticketId, type, title, body, actorName }) {
  try {
    const { query } = require("../../db/client");
    await query(
      `INSERT INTO notifications (user_id, ticket_id, type, title, body, actor_name) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, ticketId || null, type, title, body || null, actorName || null]
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("createNotification failed:", err?.message || err);
  }
}

async function notifyAdmins({ ticketId, type, title, body, actorName }) {
  const { getMany, query } = require("../../db/client");
  const admins = await getMany(`SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`);
  for (const a of admins) {
    try {
      await query(
        `INSERT INTO notifications (user_id, ticket_id, type, title, body, actor_name) VALUES ($1, $2, $3, $4, $5, $6)`,
        [a.id, ticketId || null, type, title, body || null, actorName || null]
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("notifyAdmins failed for user", a.id, err?.message || err);
    }
  }
}

module.exports = { notificationsRoutes, createNotification, notifyAdmins };
