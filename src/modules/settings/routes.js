const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");
const { runAutomationRules } = require("../automations/service");

function toJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function settingsRoutes({ logAudit }) {
  const router = express.Router();

  router.get("/settings/sla-policies", authRequired, roleRequired("admin"), async (req, res) => {
    const rows = await getMany(
      `
        SELECT *
        FROM sla_policies
        ORDER BY is_default DESC, priority ASC, id ASC
      `
    );
    res.json(rows);
  });

  router.post("/settings/sla-policies", authRequired, roleRequired("admin"), async (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.priority) {
      res.status(400).json({ error: "name and priority are required" });
      return;
    }
    const firstResponseMinutes = Number(body.first_response_minutes);
    const resolutionMinutes = Number(body.resolution_minutes);
    if (!Number.isFinite(firstResponseMinutes) || !Number.isFinite(resolutionMinutes)) {
      res.status(400).json({ error: "first_response_minutes and resolution_minutes must be numbers" });
      return;
    }

    if (body.is_default) {
      await query(`UPDATE sla_policies SET is_default = FALSE WHERE is_default = TRUE`);
    }

    const created = await query(
      `
        INSERT INTO sla_policies (
          name, priority, first_response_minutes, resolution_minutes, is_default,
          category, department, channel, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `,
      [
        String(body.name).trim(),
        String(body.priority),
        firstResponseMinutes,
        resolutionMinutes,
        Boolean(body.is_default),
        body.category || null,
        body.department || null,
        body.channel || null,
        body.is_active !== false,
      ]
    );

    await logAudit(req.user.sub, null, "sla_policy_created", { slaPolicyId: created.rows[0].id });
    res.status(201).json(created.rows[0]);
  });

  router.patch("/settings/sla-policies/:id", authRequired, roleRequired("admin"), async (req, res) => {
    const policyId = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM sla_policies WHERE id = $1`, [policyId]);
    if (!existing) {
      res.status(404).json({ error: "SLA policy not found" });
      return;
    }
    const body = req.body || {};
    const next = {
      name: body.name ?? existing.name,
      priority: body.priority ?? existing.priority,
      first_response_minutes: Number.isFinite(Number(body.first_response_minutes))
        ? Number(body.first_response_minutes)
        : existing.first_response_minutes,
      resolution_minutes: Number.isFinite(Number(body.resolution_minutes))
        ? Number(body.resolution_minutes)
        : existing.resolution_minutes,
      is_default: typeof body.is_default === "boolean" ? body.is_default : existing.is_default,
      category: body.category !== undefined ? body.category || null : existing.category,
      department: body.department !== undefined ? body.department || null : existing.department,
      channel: body.channel !== undefined ? body.channel || null : existing.channel,
      is_active: typeof body.is_active === "boolean" ? body.is_active : existing.is_active,
    };

    if (next.is_default) {
      await query(`UPDATE sla_policies SET is_default = FALSE WHERE id <> $1`, [policyId]);
    }

    const updated = await query(
      `
        UPDATE sla_policies
        SET name = $1,
            priority = $2,
            first_response_minutes = $3,
            resolution_minutes = $4,
            is_default = $5,
            category = $6,
            department = $7,
            channel = $8,
            is_active = $9,
            updated_at = NOW()
        WHERE id = $10
        RETURNING *
      `,
      [
        next.name,
        next.priority,
        next.first_response_minutes,
        next.resolution_minutes,
        next.is_default,
        next.category,
        next.department,
        next.channel,
        next.is_active,
        policyId,
      ]
    );

    await logAudit(req.user.sub, null, "sla_policy_updated", { slaPolicyId: policyId });
    res.json(updated.rows[0]);
  });

  router.get("/settings/automation-rules", authRequired, roleRequired("admin"), async (req, res) => {
    const rows = await getMany(
      `
        SELECT *
        FROM automation_rules
        ORDER BY execution_order ASC, id ASC
      `
    );
    const normalized = rows.map((row) => ({
      ...row,
      condition_json: toJson(row.condition_json),
      action_json: toJson(row.action_json),
    }));
    res.json(normalized);
  });

  router.post("/settings/automation-rules", authRequired, roleRequired("admin"), async (req, res) => {
    const body = req.body || {};
    if (!body.name || !body.trigger_event) {
      res.status(400).json({ error: "name and trigger_event are required" });
      return;
    }
    const created = await query(
      `
        INSERT INTO automation_rules (
          name, trigger_event, condition_json, action_json, is_active, execution_order, updated_at
        )
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW())
        RETURNING *
      `,
      [
        String(body.name).trim(),
        String(body.trigger_event),
        JSON.stringify(body.condition_json || {}),
        JSON.stringify(body.action_json || {}),
        body.is_active !== false,
        Number.isFinite(Number(body.execution_order)) ? Number(body.execution_order) : 100,
      ]
    );
    await logAudit(req.user.sub, null, "automation_rule_created", { ruleId: created.rows[0].id });
    res.status(201).json({
      ...created.rows[0],
      condition_json: toJson(created.rows[0].condition_json),
      action_json: toJson(created.rows[0].action_json),
    });
  });

  router.patch("/settings/automation-rules/:id", authRequired, roleRequired("admin"), async (req, res) => {
    const ruleId = Number(req.params.id);
    const existing = await getOne(`SELECT * FROM automation_rules WHERE id = $1`, [ruleId]);
    if (!existing) {
      res.status(404).json({ error: "Automation rule not found" });
      return;
    }

    const body = req.body || {};
    const next = {
      name: body.name ?? existing.name,
      trigger_event: body.trigger_event ?? existing.trigger_event,
      condition_json: body.condition_json !== undefined ? body.condition_json : toJson(existing.condition_json),
      action_json: body.action_json !== undefined ? body.action_json : toJson(existing.action_json),
      is_active: typeof body.is_active === "boolean" ? body.is_active : existing.is_active,
      execution_order: Number.isFinite(Number(body.execution_order)) ? Number(body.execution_order) : existing.execution_order,
    };

    const updated = await query(
      `
        UPDATE automation_rules
        SET name = $1,
            trigger_event = $2,
            condition_json = $3::jsonb,
            action_json = $4::jsonb,
            is_active = $5,
            execution_order = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `,
      [
        next.name,
        next.trigger_event,
        JSON.stringify(next.condition_json || {}),
        JSON.stringify(next.action_json || {}),
        next.is_active,
        next.execution_order,
        ruleId,
      ]
    );
    await logAudit(req.user.sub, null, "automation_rule_updated", { ruleId });
    res.json({
      ...updated.rows[0],
      condition_json: toJson(updated.rows[0].condition_json),
      action_json: toJson(updated.rows[0].action_json),
    });
  });

  router.post("/settings/automation-rules/:id/test", authRequired, roleRequired("admin"), async (req, res) => {
    const ruleId = Number(req.params.id);
    const ticketId = Number(req.body?.ticketId);
    if (!Number.isFinite(ticketId)) {
      res.status(400).json({ error: "ticketId is required" });
      return;
    }
    const rule = await getOne(`SELECT * FROM automation_rules WHERE id = $1`, [ruleId]);
    if (!rule) {
      res.status(404).json({ error: "Automation rule not found" });
      return;
    }

    const result = await runAutomationRules({
      eventName: rule.trigger_event,
      ticketId,
      actorUserId: req.user.sub,
      context: {},
      logAudit,
      targetRuleId: ruleId,
    });

    await logAudit(req.user.sub, ticketId, "automation_rule_tested", { ruleId, result });
    res.json({ success: true, ...result });
  });

  router.get("/settings/automation-runs", authRequired, roleRequired("admin"), async (req, res) => {
    const limit = Number.isFinite(Number(req.query.limit)) ? Math.min(Number(req.query.limit), 200) : 50;
    const rows = await getMany(
      `
        SELECT
          ar.*,
          r.name AS rule_name,
          t.subject AS ticket_subject,
          u.name AS actor_name
        FROM automation_runs ar
        LEFT JOIN automation_rules r ON r.id = ar.rule_id
        LEFT JOIN tickets t ON t.id = ar.ticket_id
        LEFT JOIN users u ON u.id = ar.actor_user_id
        ORDER BY ar.id DESC
        LIMIT $1
      `,
      [limit]
    );
    res.json(
      rows.map((row) => ({
        ...row,
        actions_applied: toJson(row.actions_applied),
      }))
    );
  });

  return router;
}

module.exports = { settingsRoutes };
