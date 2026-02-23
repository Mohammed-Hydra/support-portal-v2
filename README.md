# HYDRA-TECH eDesk v2

Zoho-style full support portal rebuild in a separate project.

## Project layout

- Backend API: `src/`
- Frontend React app: `web/`
- PostgreSQL schema: `src/db/schema.sql`

## Features included in v2 foundation

- PostgreSQL-first architecture and schema migration at startup
- Auth + role permissions (`admin`, `agent`, `requester`)
- Admin user management (create users + reset password)
- Ticket queues, ticket detail timeline, status updates, comments/internal notes
- Auto-assignment + SLA due date calculations
- Email and WhatsApp webhook ingestion endpoints
- Reports overview (open, closed, SLA breaches, workload)
- Contacts module
- Help Center module with KB article creation and viewing
- Arabic/English language toggle in frontend shell

## Run backend

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:
   - `npm install`
3. Start backend:
   - `npm start`

Backend URL: `http://localhost:5000`

## Run frontend (dev)

1. In `web/` install dependencies:
   - `npm install`
2. Start Vite:
   - `npm run dev`

Frontend URL: Vite default shown in terminal (usually `http://localhost:5173`)

Set `VITE_API_BASE` in `web/.env` if backend is on different host.

For forgot-password emails, set one of:
- `RESEND_API_KEY` + `RESEND_FROM` (recommended), or
- Microsoft Graph `M365_*`, or
- SMTP `SMTP_*` (fallback).

## Main API endpoints

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/users` (admin)
- `POST /api/users` (admin)
- `POST /api/users/:id/reset-password` (admin)
- `GET /api/tickets`
- `GET /api/tickets/:id`
- `POST /api/tickets`
- `PATCH /api/tickets/:id`
- `POST /api/tickets/:id/messages`
- `POST /api/tickets/:id/reopen`
- `POST /api/tickets/bulk/status`
- `GET /api/reports/overview`
- `GET /api/contacts`
- `POST /api/contacts`
- `GET /api/help-center/articles`
- `GET /api/help-center/articles/:slug`
- `POST /api/help-center/articles` (admin/agent)
- `POST /api/webhooks/email`
- `POST /api/webhooks/whatsapp`
- `POST /api/public/requester/tickets`
- `POST /api/public/requester/magic-link/send`
- `GET /api/public/requester/magic-link/verify`
- `GET /api/public/requester/tickets`
- `GET /api/public/requester/tickets/:id`
- `POST /api/public/requester/tickets/:id/messages`
- `POST /api/public/requester/tickets/:id/reopen`
