# HYDRA-TECH Support Portal v2 — Services & Stack Reference

This document lists **every website, service, and tool** this app uses and **what it is used for**.

---

## 1. Database (you choose one)

The app uses **PostgreSQL** only. You set `DATABASE_URL` in Vercel (or `.env`). No code change is needed — use whichever provider you want.

| Service | Website | What the app uses it for |
|--------|---------|---------------------------|
| **Neon** | [neon.tech](https://neon.tech) | **Database** — Serverless PostgreSQL. You create a project, copy the connection string, and set it as `DATABASE_URL`. The app stores users, tickets, contacts, help center articles, magic links, audit logs, etc. |
| **Supabase** | [supabase.com](https://supabase.com) | **Database** — PostgreSQL (with extra features). Use the **Connection string** from Project → Settings → Database. Set it as `DATABASE_URL`. Same data as above; the app does not use Supabase Auth or Realtime — only the Postgres database. |
| **Other Postgres** | Your own host or e.g. Railway, Vercel Postgres | Same as above — any PostgreSQL server works as long as `DATABASE_URL` is set. |

**In the code:** `src/db/client.js` uses the `pg` package and `DATABASE_URL` only. No Neon- or Supabase-specific SDK.

---

## 2. Email (you choose one)

The app sends **password reset** and **requester magic-link (track ticket)** emails. It tries, in order: Resend → Microsoft Graph → SMTP.

| Service | Website | What the app uses it for |
|--------|---------|---------------------------|
| **Resend** | [resend.com](https://resend.com) | **Sending emails** — API at `api.resend.com`. You set `RESEND_API_KEY` and `RESEND_FROM` in Vercel. Used for password reset links and requester “track by email” magic links. |
| **Microsoft 365 (Graph)** | [portal.azure.com](https://portal.azure.com) (config), [login.microsoftonline.com](https://login.microsoftonline.com), [graph.microsoft.com](https://graph.microsoft.com) | **Sending emails** — OAuth token from Azure AD, then Send Mail API. You set `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`, `M365_SENDER_UPN`. Same emails as Resend. |
| **SMTP** | Your provider (e.g. [Office 365](https://www.office.com) → `smtp.office365.com`) | **Sending emails** — You set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Fallback if Resend and Graph are not configured. |

**In the code:** `src/modules/users/routes.js` (password reset), `src/modules/publicRequester/routes.js` (magic link).

---

## 3. API (this app’s backend)

| Term | What it means in this app |
|------|----------------------------|
| **API** | The **backend** of this portal — Node.js + Express in `src/`. It exposes REST endpoints like `/api/auth/login`, `/api/tickets`, `/api/public/requester/magic-link/send`, etc. The **frontend** (React) calls this API; there is no separate “third-party API” — the API *is* this app’s server. |
| **Where it runs** | On **Vercel** (same deployment as the frontend). So “the API” = your Vercel serverless functions. |

**In the code:** Backend = `src/app.js`, `src/index.js`, `src/modules/*`. Frontend calls it via `web/src/api.js` (uses `VITE_API_BASE` or same origin).

---

## 4. Coding — Frontend

| Technology | Website / Registry | What the app uses it for |
|------------|--------------------|---------------------------|
| **React** | [react.dev](https://react.dev) | **UI framework** — All portal pages (login, dashboard, tickets, reports, requester portal, etc.) are built with React. |
| **React Router** | [reactrouter.com](https://reactrouter.com) | **Routing** — Navigation and URLs (e.g. `/login`, `/tickets`, `/public/requester`). |
| **Vite** | [vitejs.dev](https://vitejs.dev) | **Build tool** — Dev server (`npm run dev` in `web/`) and production build (`npm run build`). Output is in `web/dist/`. |
| **npm** | [npmjs.com](https://www.npmjs.com) | **Packages** — Frontend dependencies (React, React DOM, React Router, Vite, ESLint, etc.) are installed from npm. |

**In the repo:** `web/` — `web/package.json`, `web/vite.config.js`, `web/src/*.jsx`, `web/index.html`.

---

## 5. Coding — Backend

| Technology | Website / Registry | What the app uses it for |
|------------|--------------------|---------------------------|
| **Node.js** | [nodejs.org](https://nodejs.org) | **Runtime** — The backend runs on Node (Express server). |
| **Express** | [expressjs.com](https://expressjs.com) | **Web framework** — Routes, middleware, serving the built frontend and handling API requests. |
| **pg** | [npmjs.com/package/pg](https://www.npmjs.com/package/pg) | **PostgreSQL client** — Connects to `DATABASE_URL` (Neon, Supabase, or any Postgres). |
| **Other backend deps** | npm | **bcryptjs** (passwords), **cors**, **dotenv**, **jsonwebtoken**, **multer** (uploads), **nodemailer** (SMTP), etc. |

**In the repo:** Root `package.json`, `src/` (e.g. `src/app.js`, `src/index.js`, `src/db/client.js`, `src/modules/*`).

---

## 6. Hosting & deployment

| Service | Website | What the app uses it for |
|--------|---------|---------------------------|
| **Vercel** | [vercel.com](https://vercel.com) | **Hosting** — The whole app (backend + frontend) is deployed here. Backend runs as serverless Node (`vercel.json` → `src/index.js`). Frontend is built and served from the same deployment. Production URL: e.g. `https://support.hydra-tech.pro` or `https://it-support-v2.vercel.app`. |
| **GitHub** | [github.com](https://github.com) | **Code repository** — Source code lives here (e.g. `Mohammed-Hydra/support-portal-v2`). Pushing to `main` can trigger Vercel deploys if connected. |

**In the repo:** `vercel.json` configures the build and routes.

---

## 7. Editor / IDE

| Service | Website | What it is used for |
|--------|---------|----------------------|
| **Cursor** | [cursor.com](https://cursor.com) | **Code editor** — The IDE used to write and edit this project. It is not part of the running app; it’s where you code. The repo has `.cursor/settings.json` (e.g. Supabase plugin enabled for the workspace). |

---

## 8. Optional / inbound

| Service | What the app uses it for |
|--------|----------------------------|
| **WhatsApp** | **Inbound only** — Webhook endpoint receives messages (e.g. `POST /api/webhooks/whatsapp`). You configure your WhatsApp provider to call this URL; the app does not call a specific WhatsApp website. |
| **Email ingestion** | **Inbound only** — Webhook receives incoming emails. No fixed third-party “website”; you point your mail provider at your webhook. |

---

## Quick reference table

| Category | Service | Website | Used for |
|----------|---------|---------|----------|
| **Database** | Neon | neon.tech | PostgreSQL (optional; set `DATABASE_URL`) |
| **Database** | Supabase | supabase.com | PostgreSQL (optional; set `DATABASE_URL`) |
| **Email** | Resend | resend.com | Sending emails (optional; set `RESEND_*`) |
| **Email** | Microsoft Graph | graph.microsoft.com, login.microsoftonline.com | Sending emails (optional; set `M365_*`) |
| **Email** | SMTP | Your host (e.g. smtp.office365.com) | Sending emails (optional; set `SMTP_*`) |
| **API** | This app’s backend | Same as app URL (Vercel) | All portal logic (auth, tickets, reports, etc.) |
| **Frontend** | React | react.dev | UI |
| **Frontend** | Vite | vitejs.dev | Build & dev server |
| **Frontend** | npm | npmjs.com | Frontend packages |
| **Backend** | Node.js | nodejs.org | Runtime |
| **Backend** | Express | expressjs.com | Web server & API |
| **Backend** | npm | npmjs.com | Backend packages |
| **Hosting** | Vercel | vercel.com | Deploy & run the app |
| **Repo** | GitHub | github.com | Store source code |
| **IDE** | Cursor | cursor.com | Edit code (not used by the running app) |

---

*Last updated to match the current codebase and env configuration.*
