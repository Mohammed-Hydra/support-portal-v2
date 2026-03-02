const express = require("express");
const { authRequired } = require("../../middleware/auth");
const { getOne, query } = require("../../db/client");
const { getVapidKeys } = require("../../lib/push");

function pushRoutes() {
  const router = express.Router();

  router.get("/push/vapid-public", authRequired, (req, res) => {
    const keys = getVapidKeys();
    if (!keys) {
      res.status(503).json({ error: "Push notifications not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." });
      return;
    }
    res.json({ publicKey: keys.publicKey });
  });

  router.post("/push/subscribe", authRequired, async (req, res) => {
    const keys = getVapidKeys();
    if (!keys) {
      res.status(503).json({ error: "Push notifications not configured." });
      return;
    }
    const { endpoint, keys: subscriptionKeys } = req.body || {};
    if (!endpoint || !subscriptionKeys?.p256dh || !subscriptionKeys?.auth) {
      res.status(400).json({ error: "endpoint and keys.p256dh, keys.auth required" });
      return;
    }
    const userId = req.user.sub;
    try {
      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, endpoint) DO UPDATE SET p256dh = $3, auth = $4`,
        [userId, endpoint, subscriptionKeys.p256dh, subscriptionKeys.auth]
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save subscription" });
    }
  });

  return router;
}

module.exports = { pushRoutes };
