const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { migrate, query, getOne, getMany } = require("./db/client");
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
const USER_EMAIL_DOMAIN = (process.env.USER_EMAIL_DOMAIN || "hydra-tech.pro").toLowerCase();

function normalizePortalEmail(value, userId) {
  const raw = String(value || "").trim().toLowerCase();
  const localRaw = raw.includes("@") ? raw.split("@")[0] : raw;
  const cleanLocal = localRaw.replace(/[^a-z0-9._-]/g, "") || `user${userId}`;
  return `${cleanLocal}@${USER_EMAIL_DOMAIN}`;
}

async function enforceUserEmailDomain() {
  const users = await getMany(`SELECT id, email FROM users ORDER BY id ASC`);
  if (!users.length) return;
  const usedEmails = new Set();
  const updates = [];

  users.forEach((user) => {
    const baseEmail = normalizePortalEmail(user.email, user.id);
    let nextEmail = baseEmail;
    if (usedEmails.has(nextEmail)) {
      const [local] = baseEmail.split("@");
      nextEmail = `${local}.${user.id}@${USER_EMAIL_DOMAIN}`;
      let n = 1;
      while (usedEmails.has(nextEmail)) {
        nextEmail = `${local}.${user.id}.${n}@${USER_EMAIL_DOMAIN}`;
        n += 1;
      }
    }
    usedEmails.add(nextEmail);
    if (String(user.email || "").toLowerCase() !== nextEmail) {
      updates.push({ id: user.id, email: nextEmail });
    }
  });

  for (const item of updates) {
    // eslint-disable-next-line no-await-in-loop
    await query(`UPDATE users SET email = $1 WHERE id = $2`, [item.email, item.id]);
  }
}

async function ensureSeedData() {
  await enforceUserEmailDomain();
  const hasAnyUser = await getOne(`SELECT id FROM users LIMIT 1`);
  if (!hasAnyUser) {
    const adminEmail = (process.env.SUPPORT_ADMIN_EMAIL || `admin@${USER_EMAIL_DOMAIN}`).toLowerCase();
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
      name: "HYDRA-TECH.PRO API",
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
  } else {
    // Fallback when frontend is not built: serve a page that explains how to fix
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.set("Content-Type", "text/html");
      res.send(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"><title>Setup Required</title></head>
          <body style="font-family:sans-serif;max-width:560px;margin:60px auto;padding:20px;">
            <h1>Frontend not built</h1>
            <p>In Vercel: <strong>Settings → General → Build &amp; Development</strong>, set <strong>Build Command</strong> to:</p>
            <pre style="background:#eee;padding:12px;border-radius:6px;">npm run build</pre>
            <p>Then <strong>Redeploy</strong>. Alternatively, build locally: <code>cd web && npm run build</code>, then commit the <code>web/dist</code> folder and push.</p>
          </body>
        </html>
      `);
    });
  }

  return app;
}

module.exports = { createApp };
