const express = require("express");
const { getOne } = require("../../db/client");

function whatsappWebhookRoutes({ createInboundTicket, appendInboundMessage, logAudit }) {
  const router = express.Router();

  router.post("/webhooks/whatsapp", async (req, res) => {
    try {
      const token = req.header("x-hook-token");
      if (process.env.INGEST_HOOK_TOKEN && token !== process.env.INGEST_HOOK_TOKEN) {
        res.status(403).json({ error: "Invalid hook token" });
        return;
      }

      const fromNumber = (req.body.fromNumber || "").trim();
      const title = (req.body.title || "").trim() || "WhatsApp Issue";
      const message = (req.body.message || "").trim();
      const imageUrl = (req.body.imageUrl || "").trim();
      if (!fromNumber) {
        res.status(400).json({ error: "fromNumber is required" });
        return;
      }

      const openTicket = await getOne(
        `
          SELECT id
          FROM tickets
          WHERE requester_contact_id IS NULL
            AND channel = 'WhatsApp'
            AND status NOT IN ('Resolved', 'Closed')
            AND description ILIKE $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [`%${fromNumber}%`]
      );

      let ticketId;
      if (openTicket) {
        ticketId = openTicket.id;
        await appendInboundMessage(ticketId, "WhatsApp", message, imageUrl);
        await logAudit(null, ticketId, "whatsapp_message_appended", { fromNumber });
      } else {
        ticketId = await createInboundTicket({
          subject: title,
          description: `${message}\n\nFrom: ${fromNumber}`,
          channel: "WhatsApp",
          requesterContact: fromNumber,
          requesterName: req.body.requesterName || fromNumber,
          priority: req.body.priority || "Medium",
          attachmentUrl: imageUrl,
        });
      }

      res.status(201).json({ success: true, ticketId });
    } catch (error) {
      res.status(500).json({ error: "Failed to process WhatsApp webhook" });
    }
  });

  return router;
}

module.exports = { whatsappWebhookRoutes };
