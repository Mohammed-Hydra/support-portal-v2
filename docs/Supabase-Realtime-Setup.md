# Supabase Realtime Setup (Optional)

Enables live ticket message updates so agents and requesters see new messages instantly without refreshing.

## 1. Enable Realtime for `ticket_messages`

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE ticket_messages;
```

## 2. Frontend environment variables

Add to `web/.env` (and Vercel env vars for the web app):

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key from Project Settings → API |

Find these in **Supabase Dashboard → Project Settings → API**.

## 3. Verify

- Open a ticket as an agent and as a requester in two tabs.
- Send a message from one tab; it should appear instantly in the other.

If these env vars are not set, the app falls back to polling (every 15–30 seconds).
