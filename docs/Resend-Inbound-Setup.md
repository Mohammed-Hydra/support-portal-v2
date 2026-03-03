# Resend Inbound Email Setup

This guide explains how to let requesters send support tickets by email using Resend Inbound.

---

## 1. Add your domain in Resend

1. Go to [resend.com](https://resend.com) and sign in.
2. Open **Domains**.
3. Click **Add Domain**.
4. Enter your domain (e.g. `hydra-tech.pro`).
5. Add the DNS records Resend shows (MX, SPF, DKIM).
6. Wait until the domain is verified.

---

## 2. Create a webhook for `email.received`

1. In Resend, go to **Webhooks**.
2. Click **Add Webhook**.
3. Configure:
   - **Event:** `email.received`
   - **URL:** `https://it-support.hydra-tech.pro/api/webhooks/email/resend`  
     (Replace with your portal URL if different.)
4. Click **Add Webhook**.
5. Copy the **Signing secret** — you will need it for `RESEND_WEBHOOK_SECRET`.

---

## 3. Add environment variables in Vercel

| Variable | Value |
|----------|-------|
| `RESEND_API_KEY` | Your Resend API key (you likely already have this for sending) |
| `RESEND_WEBHOOK_SECRET` | The signing secret from the webhook you created |

If `RESEND_WEBHOOK_SECRET` is not set, the webhook will still work but signatures will not be verified (less secure).

---

## 4. MX records for receiving

1. In Resend, open **Receiving** → **Custom Domains**.
2. Add your domain if needed.
3. Copy the MX record(s) (e.g. `mx1.resend.com`, `mx2.resend.com`).
4. Add these MX records in your domain DNS.
5. Set priority as Resend specifies (often 10, 20).

---

## 5. Tell requesters the address

After DNS propagates (often 15–60 minutes), requesters can send tickets to:

**`support@yourdomain.com`**  
(or any address at your verified domain, e.g. `help@hydra-tech.pro`)

---

## Endpoint

- **URL:** `POST /api/webhooks/email/resend`
- **Format:** Resend `email.received` webhook payload
- **Verification:** Svix signature (when `RESEND_WEBHOOK_SECRET` is set)

---

## Troubleshooting

- **No ticket created:** Check Vercel logs for errors. Ensure `RESEND_API_KEY` is set.
- **401 Invalid webhook signature:** Ensure `RESEND_WEBHOOK_SECRET` matches the secret in Resend.
- **Emails not arriving:** Verify MX records and domain status in Resend.
