const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne } = require("../../db/client");

function reportsRoutes() {
  const router = express.Router();

  router.get("/reports/overview", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const daysRaw = String(req.query.days || "").trim();
    const parsedDays = Number(daysRaw);
    const days = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : null;
    const params = days ? [days] : [];
    const rangeWhere = days ? `WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')` : "";
    const rangeAnd = days ? `AND created_at >= NOW() - ($1::int * INTERVAL '1 day')` : "";
    const joinRangeAnd = days ? `AND t.created_at >= NOW() - ($1::int * INTERVAL '1 day')` : "";

    const summary = await getOne(
      `
        SELECT
          COUNT(*) AS total_tickets,
          SUM(CASE WHEN status NOT IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS open_tickets,
          SUM(CASE WHEN status IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS closed_tickets,
          SUM(CASE WHEN resolution_due_at IS NOT NULL AND resolution_due_at < NOW() AND status NOT IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS sla_breaches
        FROM tickets
        ${rangeWhere}
      `,
      params
    );

    const avgResolution = await getOne(
      `
        SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) AS avg_resolution_hours
        FROM tickets
        WHERE resolved_at IS NOT NULL
        ${rangeAnd}
      `,
      params
    );

    const avgFirstResponse = await getOne(
      `
        SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 3600.0) AS avg_first_response_hours
        FROM tickets
        WHERE first_response_at IS NOT NULL
        ${rangeAnd}
      `,
      params
    );

    const workload = await getMany(
      `
        SELECT u.id, u.name, COUNT(t.id) AS open_items
        FROM users u
        LEFT JOIN tickets t ON t.assigned_agent_id = u.id AND t.status NOT IN ('Resolved','Closed') ${joinRangeAnd}
        WHERE u.role = 'agent'
        GROUP BY u.id, u.name
        ORDER BY open_items DESC
      `,
      params
    );

    const avgResolutionHours = Number.parseFloat(avgResolution?.avg_resolution_hours ?? 0);
    const avgFirstResponseHours = Number.parseFloat(avgFirstResponse?.avg_first_response_hours ?? 0);

    res.json({
      periodDays: days,
      totalTickets: Number(summary?.total_tickets || 0),
      openTickets: Number(summary?.open_tickets || 0),
      closedTickets: Number(summary?.closed_tickets || 0),
      slaBreaches: Number(summary?.sla_breaches || 0),
      avgResolutionHours: Number.isFinite(avgResolutionHours) ? Number(avgResolutionHours.toFixed(2)) : 0,
      avgFirstResponseHours: Number.isFinite(avgFirstResponseHours) ? Number(avgFirstResponseHours.toFixed(2)) : 0,
      workload,
    });
  });

  return router;
}

module.exports = { reportsRoutes };
