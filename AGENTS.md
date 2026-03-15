# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

HYDRA-TECH eDesk v2 is an IT Support Portal / Helpdesk with an Express.js backend (port 5000) and a React+Vite frontend (port 5173). See `README.md` for standard setup/run commands.

### Services

| Service | Port | Start command |
|---------|------|---------------|
| Backend API | 5000 | `node -r dotenv/config src/index.js` (from repo root) |
| Frontend (Vite) | 5173 | `npx vite --host 0.0.0.0` (from `web/`) |
| PostgreSQL | 5432 | `sudo pg_ctlcluster 16 main start` |

### Non-obvious caveats

- **dotenv is not imported in source code.** The backend depends on `dotenv` as a dependency but never calls `require('dotenv').config()`. You must preload it: `node -r dotenv/config src/index.js`. The npm scripts `start`/`dev` do NOT preload dotenv, so running `npm start` without env vars exported will fail with `DATABASE_URL is required`.
- **PostgreSQL SSL.** Set `PGSSLMODE=disable` in `.env` for local PostgreSQL (the default `.env.example` uses `require`).
- **Schema auto-migration.** The backend runs `schema.sql` statements on every startup — no separate migration step is needed.
- **Admin seed.** On first start with an empty DB, the backend auto-creates an admin user from `SUPPORT_ADMIN_EMAIL` / `SUPPORT_ADMIN_PASSWORD` env vars (defaults: `admin@hydra-tech.pro` / `ChangeThisPassword123!`).
- **No automated tests.** `npm test` in root just echoes "No tests configured". Lint is available only in `web/`: `cd web && npx eslint .`.
- **Frontend .env.** `web/.env` needs `VITE_API_BASE=http://localhost:5000` to connect to the local backend.
