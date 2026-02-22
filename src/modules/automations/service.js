const { getMany, getOne, query } = require("../../db/client");

function statusRank(status) {
  if (status === "Resolved" || status === "Closed") return 99;
  if (status === "In Progress") return 2;
  if (status === "Waiting User") return 3;
  return 1;
}

async function pickLeastLoadedAgent() {
  const agent = await getOne(
    `
      SELECT u.id, u.name, COUNT(t.id) AS open_count
      FROM users u
      LEFT JOIN tickets t
        ON t.assigned_agent_id = u.id
        AND t.status NOT IN ('Resolved', 'Closed')
      WHERE u.role = 'agent' AND u.is_active = TRUE
      GROUP BY u.id, u.name
      ORDER BY open_count ASC, u.id ASC
      LIMIT 1
    `
  );
  return agent || null;
}

async function computeSla(priority) {
  if (priority && typeof priority === "object") {
    const scoped = priority;
    const scopedPolicy = await getOne(
      `
        SELECT *
        FROM sla_policies
        WHERE is_active = TRUE
          AND (priority = $1 OR is_default = TRUE)
          AND (category = $2 OR category IS NULL OR category = '')
          AND (department = $3 OR department IS NULL OR department = '')
          AND (channel = $4 OR channel IS NULL OR channel = '')
        ORDER BY
          CASE WHEN priority = $1 THEN 0 ELSE 1 END,
          CASE WHEN category = $2 AND category IS NOT NULL THEN 0 ELSE 1 END,
          CASE WHEN department = $3 AND department IS NOT NULL THEN 0 ELSE 1 END,
          CASE WHEN channel = $4 AND channel IS NOT NULL THEN 0 ELSE 1 END,
          is_default DESC,
          id ASC
        LIMIT 1
      `,
      [scoped.priority || "Medium", scoped.category || null, scoped.department || null, scoped.channel || null]
    );
    if (scopedPolicy) return scopedPolicy;
  }

  const p = typeof priority === "string" ? priority : "Medium";
  const policy = await getOne(
    `
      SELECT *
      FROM sla_policies
      WHERE is_active = TRUE
        AND priority = $1
      ORDER BY is_default DESC, id ASC
      LIMIT 1
    `,
    [p]
  );
  if (policy) return policy;

  const defaults = {
    Low: { first_response_minutes: 240, resolution_minutes: 72 * 60 },
    Medium: { first_response_minutes: 120, resolution_minutes: 48 * 60 },
    High: { first_response_minutes: 60, resolution_minutes: 24 * 60 },
    Critical: { first_response_minutes: 30, resolution_minutes: 8 * 60 },
  };
  return defaults[p] || defaults.Medium;
}

function calcDueDate(minutes) {
  return new Date(Date.now() + minutes * 60000).toISOString();
}

module.exports = {
  pickLeastLoadedAgent,
  computeSla,
  calcDueDate,
  statusRank,
  runAutomationRules,
};

function asObject(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}

function textIncludes(haystack, needle) {
  if (!needle) return true;
  return String(haystack || "").toLowerCase().includes(String(needle).toLowerCase());
}

function ticketMatchesConditions(ticket, conditions, context = {}) {
  if (conditions.priority && ticket.priority !== conditions.priority) return false;
  if (conditions.status && ticket.status !== conditions.status) return false;
  if (conditions.category && (ticket.category || "") !== conditions.category) return false;
  if (conditions.channel && (ticket.channel || "") !== conditions.channel) return false;
  if (conditions.assigned === "unassigned" && ticket.assigned_agent_id) return false;
  if (conditions.assigned === "assigned" && !ticket.assigned_agent_id) return false;
  if (conditions.requesterCompany && !textIncludes(ticket.requester_company_name, conditions.requesterCompany)) return false;
  if (conditions.subjectIncludes && !textIncludes(ticket.subject, conditions.subjectIncludes)) return false;
  if (conditions.descriptionIncludes && !textIncludes(ticket.description, conditions.descriptionIncludes)) return false;

  if (Array.isArray(conditions.statusChangedFromTo) && conditions.statusChangedFromTo.length === 2) {
    const [fromStatus, toStatus] = conditions.statusChangedFromTo;
    if ((context.previousStatus || "") !== fromStatus || ticket.status !== toStatus) return false;
  }
  if (Array.isArray(conditions.priorityChangedFromTo) && conditions.priorityChangedFromTo.length === 2) {
    const [fromPriority, toPriority] = conditions.priorityChangedFromTo;
    if ((context.previousPriority || "") !== fromPriority || ticket.priority !== toPriority) return false;
  }

  return true;
}

async function applyRuleActions(rule, ticket, context = {}, logAudit) {
  const actions = asObject(rule.action_json);
  const changes = {};

  let nextStatus = actions.setStatus || ticket.status;
  let nextPriority = actions.setPriority || ticket.priority;
  let nextAssignedAgentId = ticket.assigned_agent_id;

  if (actions.assignStrategy === "least_loaded") {
    const leastLoaded = await pickLeastLoadedAgent();
    nextAssignedAgentId = leastLoaded ? leastLoaded.id : null;
  } else if (actions.assignAgentId) {
    nextAssignedAgentId = Number(actions.assignAgentId) || null;
  }

  if (
    nextStatus !== ticket.status ||
    nextPriority !== ticket.priority ||
    Number(nextAssignedAgentId || 0) !== Number(ticket.assigned_agent_id || 0)
  ) {
    const sla = await computeSla({
      priority: nextPriority,
      category: ticket.category || null,
      department: ticket.department || null,
      channel: ticket.channel || null,
    });

    const updated = await query(
      `
        UPDATE tickets
        SET status = $1,
            priority = $2,
            assigned_agent_id = $3,
            first_response_due_at = CASE WHEN $2 <> priority THEN $4 ELSE first_response_due_at END,
            resolution_due_at = CASE WHEN $2 <> priority THEN $5 ELSE resolution_due_at END,
            updated_at = NOW(),
            resolved_at = CASE WHEN $1 IN ('Resolved', 'Closed') THEN NOW() ELSE resolved_at END
        WHERE id = $6
        RETURNING *
      `,
      [nextStatus, nextPriority, nextAssignedAgentId, calcDueDate(sla.first_response_minutes), calcDueDate(sla.resolution_minutes), ticket.id]
    );
    Object.assign(ticket, updated.rows[0]);
    changes.ticket = { status: nextStatus, priority: nextPriority, assignedAgentId: nextAssignedAgentId };
  }

  if (actions.addInternalNote) {
    await query(
      `
        INSERT INTO ticket_messages (ticket_id, author_user_id, source, body, is_internal)
        VALUES ($1, $2, 'automation', $3, TRUE)
      `,
      [ticket.id, context.actorUserId || null, String(actions.addInternalNote)]
    );
    changes.internalNote = true;
  }

  if (actions.addTag) {
    const existingTags = Array.isArray(ticket.tags) ? ticket.tags : [];
    const tagValue = String(actions.addTag).trim();
    if (tagValue && !existingTags.includes(tagValue)) {
      const merged = [...existingTags, tagValue];
      await query(`UPDATE tickets SET tags = $1::text[], updated_at = NOW() WHERE id = $2`, [merged, ticket.id]);
      ticket.tags = merged;
      changes.tags = merged;
    }
  }

  if (actions.notifyText) {
    changes.notification = String(actions.notifyText);
  }

  if (Object.keys(changes).length && typeof logAudit === "function") {
    await logAudit(context.actorUserId || null, ticket.id, "automation_rule_applied", {
      ruleId: rule.id,
      ruleName: rule.name,
      changes,
    });
  }

  return changes;
}

async function runAutomationRules({
  eventName,
  ticketId,
  actorUserId = null,
  context = {},
  logAudit,
  targetRuleId = null,
}) {
  const ticket = await getOne(`SELECT * FROM tickets WHERE id = $1`, [ticketId]);
  if (!ticket) return { executed: 0, matched: 0 };

  const rules = await getMany(
    `
      SELECT *
      FROM automation_rules
      WHERE is_active = TRUE
        AND trigger_event = $1
      ORDER BY execution_order ASC, id ASC
    `,
    [eventName]
  );
  const selectedRules = targetRuleId
    ? rules.filter((rule) => Number(rule.id) === Number(targetRuleId))
    : rules;

  let matchedCount = 0;
  for (const rule of selectedRules) {
    try {
      const conditions = asObject(rule.condition_json);
      const matched = ticketMatchesConditions(ticket, conditions, context);
      if (!matched) {
        // eslint-disable-next-line no-await-in-loop
        await query(
          `
            INSERT INTO automation_runs (rule_id, ticket_id, event_name, matched, actor_user_id)
            VALUES ($1, $2, $3, FALSE, $4)
          `,
          [rule.id, ticket.id, eventName, actorUserId]
        );
        continue;
      }

      matchedCount += 1;
      // eslint-disable-next-line no-await-in-loop
      const changes = await applyRuleActions(rule, ticket, { ...context, actorUserId }, logAudit);
      // eslint-disable-next-line no-await-in-loop
      await query(
        `
          INSERT INTO automation_runs (rule_id, ticket_id, event_name, matched, actions_applied, actor_user_id)
          VALUES ($1, $2, $3, TRUE, $4::jsonb, $5)
        `,
        [rule.id, ticket.id, eventName, JSON.stringify(changes || {}), actorUserId]
      );
    } catch (error) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `
          INSERT INTO automation_runs (rule_id, ticket_id, event_name, matched, error_message, actor_user_id)
          VALUES ($1, $2, $3, FALSE, $4, $5)
        `,
        [rule.id, ticket.id, eventName, error.message || "Rule execution failed", actorUserId]
      );
    }
  }

  return { executed: selectedRules.length, matched: matchedCount };
}
