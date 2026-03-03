# Credentials Checklist — Support Portal v2

**⚠️ Do not write real passwords, API keys, or secrets in this file or anywhere in the repo.**  
Store real values only in:
- **Vercel** → Project → Settings → Environment Variables (for production)
- Local **`.env`** (never commit `.env`; it is in `.gitignore`)

Use this checklist to track **which** credentials you need and **where** to set them.

---

## 1. Database (PostgreSQL)

| Credential | What it is | Where to get it | Where to set it |
|------------|------------|-----------------|-----------------|
| **DATABASE_URL** | Full connection string: `postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require` | **Neon:** Dashboard → your project → Connection string (copy URI). **Supabase:** Project → Settings → Database → Connection string (URI). | Vercel env vars, or local `.env` |
| **PGSSLMODE** | Optional. Use `require` for cloud DBs; `disable` only for local Postgres. | — | Vercel env vars, or local `.env` |

**Logins (for reference only — get the URL from their dashboards):**
- **Neon:** [neon.tech](https://neon.tech) → sign in → create project → copy connection string.
- **Supabase:** [supabase.com](https://supabase.com) → sign in → create project → Settings → Database → connection string.

---

## 2. App secrets (required)

| Credential | What it is | Where to set it |
|------------|------------|-----------------|
| **JWT_SECRET** | Secret string for signing login tokens. Use a long random string. | Vercel env vars, local `.env` |
| **REQUESTER_SESSION_SECRET** | Secret for requester magic-link sessions. Can be same as JWT_SECRET or different. | Vercel env vars, local `.env` |
| **INGEST_HOOK_TOKEN** | Optional. Token for email/WhatsApp webhook auth. If set, webhooks must send this. | Vercel env vars, local `.env` |

---

## 3. First admin user (built from env on first run)

| Credential | What it is | Where to set it |
|------------|------------|-----------------|
| **SUPPORT_ADMIN_EMAIL** | Email for the first admin (e.g. `admin@hydra-tech.pro`). | Vercel env vars, local `.env` |
| **SUPPORT_ADMIN_PASSWORD** | Password for that admin. Change after first login. | Vercel env vars, local `.env` |
| **USER_EMAIL_DOMAIN** | Domain allowed for portal users (e.g. `hydra-tech.pro`). | Vercel env vars, local `.env` |

---

## 4. Portal URLs (for links in emails)

| Credential | What it is | Where to set it |
|------------|------------|-----------------|
| **PORTAL_BASE_URL** | Full URL of the portal (e.g. `https://support.hydra-tech.pro`). | Vercel env vars, local `.env` |
| **REQUESTER_PORTAL_BASE_URL** | Full URL of requester portal page (e.g. `https://support.hydra-tech.pro/public/requester/portal`). | Vercel env vars, local `.env` |

---

## 5. Email — Resend (recommended)

| Credential | What it is | Where to get it | Where to set it |
|------------|------------|-----------------|-----------------|
| **RESEND_API_KEY** | API key for sending email. | [resend.com](https://resend.com) → sign in → API Keys → Create. | Vercel env vars, local `.env` |
| **RESEND_FROM** | Sender address (e.g. `Support <noreply@yourdomain.com>`). Must use a verified domain in Resend. | Resend dashboard → Domains. | Vercel env vars, local `.env` |

**Login:** [resend.com](https://resend.com) — use your account email/password (not stored in this app).

---

## 6. Email — Microsoft 365 (Graph)

| Credential | What it is | Where to get it | Where to set it |
|------------|------------|-----------------|-----------------|
| **M365_TENANT_ID** | Azure AD tenant ID. | Azure Portal → Azure Active Directory → Overview. | Vercel env vars, local `.env` |
| **M365_CLIENT_ID** | App (client) ID of the app registration. | Azure Portal → App registrations → your app → Overview. | Vercel env vars, local `.env` |
| **M365_CLIENT_SECRET** | Client secret for that app. | Azure Portal → App registrations → your app → Certificates & secrets → New client secret. | Vercel env vars, local `.env` |
| **M365_SENDER_UPN** | Email/user principal name of the mailbox that sends (e.g. `support@yourdomain.com`). | Your M365 admin; app needs Mail.Send permission. | Vercel env vars, local `.env` |

**Login:** [portal.azure.com](https://portal.azure.com) — use your Microsoft work/school account (not stored in this app).

---

## 7. Email — SMTP (fallback)

| Credential | What it is | Where to get it | Where to set it |
|------------|------------|-----------------|-----------------|
| **SMTP_HOST** | SMTP server (e.g. `smtp.office365.com`, `smtp.gmail.com`). | Your email provider’s docs. | Vercel env vars, local `.env` |
| **SMTP_PORT** | Usually `587` (TLS) or `465` (SSL). | Your email provider’s docs. | Vercel env vars, local `.env` |
| **SMTP_USER** | SMTP login (often your full email). | Your mailbox or admin. | Vercel env vars, local `.env` |
| **SMTP_PASS** | SMTP password or app password. | Your mailbox; for Gmail/Office use an app password if 2FA is on. | Vercel env vars, local `.env` |
| **SMTP_FROM** | From address shown in emails (e.g. `Support <support@yourdomain.com>`). | — | Vercel env vars, local `.env` |
| **SMTP_SECURE** | Set `true` for port 465, else `false`. | — | Vercel env vars, local `.env` |

**Logins:** Use your email provider’s website (e.g. Office 365, Gmail) to manage the mailbox; do not put that login in this repo.

---

## 8. Vercel (hosting)

| What | Where |
|------|--------|
| **Project env vars** | [vercel.com](https://vercel.com) → your project → Settings → Environment Variables. Add each name (e.g. `DATABASE_URL`) and value here for Production (and optionally Preview). |
| **Your Vercel login** | [vercel.com](https://vercel.com) — email/password or GitHub. Not stored in this app; use for dashboard only. |

---

## 9. GitHub (code repo)

| What | Where |
|------|--------|
| **Repo access** | [github.com](https://github.com) — your account (e.g. Mohammed-Hydra). Used to push/pull code and connect Vercel. Not stored in this app. |

---

## 10. Cursor (editor)

| What | Where |
|------|--------|
| **Cursor login** | [cursor.com](https://cursor.com) — your Cursor account. Used only to open and edit the project; not used by the running app. |

---

## Quick checklist (no values)

- [ ] **DATABASE_URL** — from Neon or Supabase (or other Postgres)
- [ ] **JWT_SECRET** — long random string
- [ ] **REQUESTER_SESSION_SECRET** — long random string (or same as JWT_SECRET)
- [ ] **SUPPORT_ADMIN_EMAIL** and **SUPPORT_ADMIN_PASSWORD** — first admin
- [ ] **PORTAL_BASE_URL** and **REQUESTER_PORTAL_BASE_URL** — your portal URLs
- [ ] **Email (pick one):** Resend (**RESEND_API_KEY**, **RESEND_FROM**) **or** M365 (**M365_***) **or** SMTP (**SMTP_***)
- [ ] All of the above set in **Vercel** → Settings → Environment Variables for Production
- [ ] Redeploy after changing env vars

**Never commit real secrets to Git. Never paste them into this file.**
