const nodemailer = require("nodemailer");

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const RESEND_API_URL = "https://api.resend.com/emails";

function hasGraphMailConfig() {
  return Boolean(
    process.env.M365_TENANT_ID
    && process.env.M365_CLIENT_ID
    && process.env.M365_CLIENT_SECRET
    && process.env.M365_SENDER_UPN
  );
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

function getEmailTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function getGraphAccessToken() {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(process.env.M365_TENANT_ID)}/oauth2/v2.0/token`;
  const payload = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.M365_CLIENT_ID,
    client_secret: process.env.M365_CLIENT_SECRET,
    scope: GRAPH_SCOPE,
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Graph token request failed: ${response.status} ${data.error_description || data.error || "unknown error"}`);
  }
  return data.access_token;
}

async function sendEmailViaGraph({ to, subject, text, html }) {
  const accessToken = await getGraphAccessToken();
  const senderUpn = process.env.M365_SENDER_UPN;
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderUpn)}/sendMail`;
  const response = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: html || `<pre>${text}</pre>`,
        },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`Graph sendMail failed: ${response.status} ${raw}`);
  }
}

async function sendEmailViaResend({ to, subject, text, html }) {
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Resend send failed: ${response.status} ${data?.message || JSON.stringify(data)}`);
  }
}

async function sendEmailViaSmtp({ to, subject, text, html }) {
  const transporter = getEmailTransporter();
  if (!transporter) {
    throw new Error("SMTP is not configured.");
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
}

function getPortalBaseUrl() {
  return (
    process.env.PORTAL_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")
  );
}

function getRequesterTrackUrl() {
  const base = getPortalBaseUrl();
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/public/requester/track`;
}

async function sendNotificationEmail({ to, subject, text, html }) {
  if (!to) return { ok: false, skipped: true, reason: "missing_to" };
  if (hasResendConfig()) {
    await sendEmailViaResend({ to, subject, text, html });
    return { ok: true, provider: "resend" };
  }
  if (hasGraphMailConfig()) {
    await sendEmailViaGraph({ to, subject, text, html });
    return { ok: true, provider: "graph" };
  }
  const transporter = getEmailTransporter();
  if (transporter) {
    await sendEmailViaSmtp({ to, subject, text, html });
    return { ok: true, provider: "smtp" };
  }
  return { ok: false, skipped: true, reason: "mail_not_configured" };
}

module.exports = {
  sendNotificationEmail,
  getPortalBaseUrl,
  getRequesterTrackUrl,
};

