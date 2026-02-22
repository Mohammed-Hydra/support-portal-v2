const express = require("express");
const { getOne, query } = require("../../db/client");

function emailWebhookRoutes({ createInboundTicket, appendInboundMessage, logAudit }) {
  const router = express.Router();

  router.post("/webhooks/email", async (req, res) => {
    try {
      const token = req.header("x-hook-token");
      if (process.env.INGEST_HOOK_TOKEN && token !== process.env.INGEST_HOOK_TOKEN) {
        res.status(403).json({ error: "Invalid hook token" });
        return;
      }

      const subject = (req.body.subject || "").trim();
      const from = (req.body.from || "").trim().toLowerCase();
      const body = (req.body.body || "").trim();
      const threadKey = (req.body.threadId || req.body.messageId || "").trim();
      if (!subject || !from) {
        res.status(400).json({ error: "subject and from are required" });
        return;
      }

      let ticketId;
      if (threadKey) {
        const linked = await getOne(
          `SELECT ticket_id FROM channel_threads WHERE source = 'Email' AND thread_key = $1`,
          [threadKey]
        );
        if (linked) {
          ticketId = linked.ticket_id;
        }
      }

      if (ticketId) {
        await appendInboundMessage(ticketId, "Email", body, req.body.attachmentUrl || "");
        await logAudit(null, ticketId, "email_thread_reply", { from, threadKey });
      } else {
        ticketId = await createInboundTicket({
          subject,
          description: body,
          channel: "Email",
          requesterContact: from,
          requesterName: req.body.requesterName || from,
          priority: req.body.priority || "Medium",
          attachmentUrl: req.body.attachmentUrl || "",
        });
        if (threadKey) {
          await query(
            `
              INSERT INTO channel_threads (source, thread_key, ticket_id)
              VALUES ('Email', $1, $2)
              ON CONFLICT (source, thread_key) DO NOTHING
            `,
            [threadKey, ticketId]
          );
        }
      }

      res.status(201).json({ success: true, ticketId });
    } catch (error) {
      res.status(500).json({ error: "Failed to process email webhook" });
    }
  });

  return router;
}

module.exports = { emailWebhookRoutes };
