const { getMany } = require("../db/client");

async function fireWebhooks(event, payload) {
  const rows = await getMany(
    `SELECT id, name, type, webhook_url, events FROM integration_webhooks WHERE is_active = TRUE`
  );
  const matching = rows.filter(
    (r) => r.events && Array.isArray(r.events) && r.events.includes(event)
  );
  for (const wh of matching) {
    try {
      const body = {
        event,
        ...payload,
        timestamp: new Date().toISOString(),
      };
      const res = await fetch(wh.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`Webhook ${wh.name} (${wh.id}) failed: ${res.status}`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`Webhook ${wh.name} (${wh.id}) error:`, err?.message || err);
    }
  }
}

module.exports = { fireWebhooks };
