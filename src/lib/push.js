const webpush = require("web-push");
const { getMany, query } = require("../db/client");

let vapidKeys = null;

function getVapidKeys() {
  if (vapidKeys) return vapidKeys;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  vapidKeys = { publicKey, privateKey };
  webpush.setVapidDetails("mailto:support@hydra-tech.pro", publicKey, privateKey);
  return vapidKeys;
}

async function sendPushToUser(userId, payload) {
  const keys = getVapidKeys();
  if (!keys) return;

  const subs = await getMany(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 }
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, sub.endpoint]);
      }
    }
  }
}

module.exports = { getVapidKeys, sendPushToUser };
