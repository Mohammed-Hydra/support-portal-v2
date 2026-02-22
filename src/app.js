const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { migrate, query, getOne } = require("./db/client");
const { usersRoutes } = require("./modules/users/routes");
const { ticketsRoutes } = require("./modules/tickets/routes");
const { reportsRoutes } = require("./modules/reports/routes");
const { contactsRoutes } = require("./modules/contacts/routes");
const { helpcenterRoutes } = require("./modules/helpcenter/routes");
const { emailWebhookRoutes } = require("./modules/channels/emailWebhook");
const { whatsappWebhookRoutes } = require("./modules/channels/whatsappWebhook");
const { settingsRoutes } = require("./modules/settings/routes");
const { publicRequesterRoutes } = require("./modules/publicRequester/routes");
const { pickLeastLoadedAgent, computeSla, calcDueDate } = require("./modules/automations/service");

async function ensureSeedData() {
  const hasAnyUser = await getOne(`SELECT id FROM users LIMIT 1`);
  if (!hasAnyUser) {
    const adminEmail = (process.env.SUPPORT_ADMIN_EMAIL || "admin@hydra-tech.com").toLowerCase();
    const adminPassword = process.env.SUPPORT_ADMIN_PASSWORD || "ChangeThisPassword123!";
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await query(
      `
        INSERT INTO users (name, email, password_hash, role, is_active, locale)
        VALUES ($1, $2, $3, 'admin', TRUE, 'en')
      `,
      ["HYDRA Admin", adminEmail, passwordHash]
    );
  }

  const hasPolicy = await getOne(`SELECT id FROM sla_policies LIMIT 1`);
  if (!hasPolicy) {
    const policies = [
      ["Default Low", "Low", 240, 4320],
      ["Default Medium", "Medium", 120, 2880],
      ["Default High", "High", 60, 1440],
      ["Default Critical", "Critical", 30, 480],
    ];
    for (const policy of policies) {
      // eslint-disable-next-line no-await-in-loop
      await query(
        `
          INSERT INTO sla_policies (name, priority, first_response_minutes, resolution_minutes, is_default)
          VALUES ($1, $2, $3, $4, TRUE)
        `,
        policy
      );
    }
  }
}

async function createApp() {
  await migrate();
  await ensureSeedData();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true }));

  const webDist = path.join(__dirname, "..", "web", "dist");
  const hasWebDist = fs.existsSync(webDist);
  if (hasWebDist) {
    app.use(express.static(webDist));
  }
  app.use("/uploads-v2", express.static(process.env.VERCEL === "1" ? "/tmp/uploads-v2" : path.join(__dirname, "..", "uploads")));

  async function logAudit(actorUserId, ticketId, action, details = {}) {
    await query(
      `
        INSERT INTO audit_logs (actor_user_id, ticket_id, action, details)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [actorUserId || null, ticketId || null, action, JSON.stringify(details || {})]
    );
  }

  async function createInboundTicket({
    subject,
    description,
    channel,
    requesterContact,
    requesterName,
    priority,
    attachmentUrl,
  }) {
    const agent = await pickLeastLoadedAgent();
    const sla = await computeSla(priority || "Medium");
    const inserted = await query(
      `
        INSERT INTO tickets (
          subject, description, status, priority, channel, assigned_agent_id, first_response_due_at, resolution_due_at
        )
        VALUES ($1, $2, 'New', $3, $4, $5, $6, $7)
        RETURNING id
      `,
      [
        subject,
        `${description || ""}\n\nRequester: ${requesterName || requesterContact || "unknown"} (${requesterContact || "n/a"})`,
        priority || "Medium",
        channel,
        agent ? agent.id : null,
        calcDueDate(sla.first_response_minutes),
        calcDueDate(sla.resolution_minutes),
      ]
    );

    const ticketId = inserted.rows[0].id;
    await query(
      `
        INSERT INTO ticket_messages (ticket_id, source, body, attachment_url, is_internal)
        VALUES ($1, $2, $3, $4, FALSE)
      `,
      [ticketId, channel, description || "", attachmentUrl || ""]
    );
    return ticketId;
  }

  async function appendInboundMessage(ticketId, source, body, attachmentUrl) {
    await query(
      `
        INSERT INTO ticket_messages (ticket_id, source, body, attachment_url, is_internal)
        VALUES ($1, $2, $3, $4, FALSE)
      `,
      [ticketId, source, body || "", attachmentUrl || ""]
    );
    await query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);
  }

  app.use("/api", usersRoutes({ logAudit }));
  app.use("/api", ticketsRoutes({ logAudit }));
  app.use("/api", reportsRoutes());
  app.use("/api", contactsRoutes());
  app.use("/api", helpcenterRoutes());
  app.use("/api", settingsRoutes({ logAudit }));
  app.use("/api", publicRequesterRoutes({ logAudit }));
  app.use("/api", emailWebhookRoutes({ createInboundTicket, appendInboundMessage, logAudit }));
  app.use("/api", whatsappWebhookRoutes({ createInboundTicket, appendInboundMessage, logAudit }));

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "v2" });
  });

  app.get("/", (req, res) => {
    if (hasWebDist) {
      res.sendFile(path.join(webDist, "index.html"));
      return;
    }
    res.json({
      name: "HYDRA-TECH eDesk v2 API",
      message: "Frontend build is not present. Run web build or use Vite dev server.",
    });
  });

  if (hasWebDist) {
    app.use((req, res, next) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/uploads-v2/")) {
        next();
        return;
      }
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  return app;
}

module.exports = { createApp };
