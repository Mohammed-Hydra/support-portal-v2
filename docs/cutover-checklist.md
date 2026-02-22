# Cutover Checklist (v2)

## Pre-cutover

- Confirm `DATABASE_URL`, `JWT_SECRET`, and webhook secrets are set in v2 environment.
- Run smoke tests:
  - Admin login
  - Create user and relogin
  - Create ticket and update status
  - Add internal note and public reply
  - Email webhook creates/updates ticket
  - WhatsApp webhook creates/updates ticket
- Run migration script if importing v1 data:
  - `SOURCE_DATABASE_URL=<v1-db> DATABASE_URL=<v2-db> node src/migration/from-v1.js`

## Cutover

- Deploy v2 to staging and verify.
- Deploy v2 to production project.
- Point production alias/domain to v2 deployment.
- Enable channels to use v2 webhook endpoints:
  - `/api/webhooks/email`
  - `/api/webhooks/whatsapp`

## Post-cutover

- Monitor logs for 24 hours.
- Validate new account persistence and password reset.
- Validate SLA/report metrics updates.
- Keep v1 read-only fallback for rollback window.
