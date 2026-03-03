/**
 * Resend Inbound webhook handler.
 * Resend sends email.received events; we fetch full content via API and create/append tickets.
 * Requires: RESEND_API_KEY, RESEND_WEBHOOK_SECRET (for Svix verification)
 */
const { Webhook } = require("svix");
const { getOne, query } = require("../../db/client");

function extractEmailFromAddress(addr) {
  if (!addr || typeof addr !== "string") return "";
  const trimmed = addr.trim();
  const match = trimmed.match(/<([^>]+)>/);
  return (match ? match[1] : trimmed).toLowerCase();
}

function extractNameFromAddress(addr) {
  if (!addr || typeof addr !== "string") return "";
  const match = addr.match(/^([^<]+)</);
  return match ? match[1].trim() : "";
}

async function fetchResendEmailContent(emailId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function handleResendInbound(payload, { createInboundTicket, appendInboundMessage, logAudit }) {
  const data = payload?.data;
  if (!data?.email_id || !data?.from || !data?.subject) {
    throw new Error("Missing email_id, from, or subject in Resend payload");
  }

  const fromEmail = extractEmailFromAddress(data.from);
  const requesterName = extractNameFromAddress(data.from) || fromEmail;

  let body = "";
  try {
    const full = await fetchResendEmailContent(data.email_id);
    body = (full.text || full.html || "").trim();
  } catch (e) {
    body = `[Email content could not be retrieved: ${e.message}]`;
  }

  const threadKey = data.message_id || data.email_id || "";

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
    await appendInboundMessage(ticketId, "Email", body, "");
    await logAudit(null, ticketId, "email_thread_reply", { from: fromEmail, threadKey });
  } else {
    ticketId = await createInboundTicket({
      subject: data.subject,
      description: body,
      channel: "Email",
      requesterContact: fromEmail,
      requesterName,
      priority: "Medium",
      attachmentUrl: "",
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

  return ticketId;
}

function createResendWebhookHandler({ createInboundTicket, appendInboundMessage, logAudit }) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  return async (req, res) => {
    try {
      const rawBody = req.rawBody ? req.rawBody.toString("utf8") : "";
      if (!rawBody) {
        res.status(400).json({ error: "Missing body" });
        return;
      }

      const payload = JSON.parse(rawBody);
      if (payload.type !== "email.received") {
        res.status(200).json({ received: true });
        return;
      }

      if (secret) {
        const wh = new Webhook(secret);
        const id = req.headers["svix-id"];
        const timestamp = req.headers["svix-timestamp"];
        const sig = req.headers["svix-signature"];
        if (!id || !timestamp || !sig) {
          res.status(401).json({ error: "Missing Svix headers" });
          return;
        }
        try {
          wh.verify(rawBody, { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": sig });
        } catch (e) {
          res.status(401).json({ error: "Invalid webhook signature" });
          return;
        }
      }

      const ticketId = await handleResendInbound(payload, {
        createInboundTicket,
        appendInboundMessage,
        logAudit,
      });
      res.status(201).json({ success: true, ticketId });
    } catch (error) {
      res.status(500).json({ error: "Failed to process Resend inbound email" });
    }
  };
}

module.exports = { createResendWebhookHandler };
