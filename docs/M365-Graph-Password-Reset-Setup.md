# Microsoft Graph Password Reset Mail - Full Settings

This guide gives you a full copy-paste setup for forgot-password emails using Microsoft Graph OAuth (no SMTP basic auth).

---

## 1) Copy-paste environment variables (Vercel)

Set these in **Vercel -> Project -> Settings -> Environment Variables** for **Production**:

```env
PORTAL_BASE_URL=https://it-support-v2.vercel.app
PASSWORD_RESET_TTL_MINUTES=60

# Microsoft Graph OAuth (required)
M365_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
M365_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
M365_CLIENT_SECRET=your-client-secret-value
M365_SENDER_UPN=Mohamed.client2022@outlook.com
```

### What each value means
- `PORTAL_BASE_URL`: Your live frontend URL (without trailing slash).
- `PASSWORD_RESET_TTL_MINUTES`: Reset link expiry time.
- `M365_TENANT_ID`: Azure tenant (Directory) ID.
- `M365_CLIENT_ID`: App registration (Application) ID.
- `M365_CLIENT_SECRET`: Secret value from Certificates & secrets.
- `M365_SENDER_UPN`: Mailbox to send from (full email address).

---

## 2) Azure App Registration setup

1. Go to **Azure Portal -> Microsoft Entra ID -> App registrations**.
2. Create or open your app.
3. Go to **API permissions -> Add a permission -> Microsoft Graph -> Application permissions**.
4. Add permission: **Mail.Send**.
5. Click **Grant admin consent**.
6. Go to **Certificates & secrets** and create a client secret.
7. Copy these values:
   - Tenant ID
   - Client ID
   - Client Secret (value)

---

## 3) Sender mailbox

Set:

```env
M365_SENDER_UPN=Mohamed.client2022@outlook.com
```

Use the exact mailbox address that should send reset emails.

Requirements:
- Mailbox exists in the same tenant.
- Mailbox is active/licensed (or valid shared mailbox configuration).
- App has `Mail.Send` application permission with admin consent.

---

## 4) Redeploy after env changes

After adding/changing env vars in Vercel:
- Trigger a redeploy from Vercel dashboard, or
- Push a new commit to `main`.

---

## 5) Quick test

1. Open login page.
2. Click **Forgot password?**
3. Enter agent email.
4. Expected result: reset email sent successfully.

If it fails, check Vercel logs for:
- `Graph token request failed` -> Tenant/Client/Secret issue
- `Graph sendMail failed` -> permission/sender mailbox issue

---

## 6) Common errors

- **535 basic authentication disabled**
  - Cause: SMTP basic auth path used.
  - Fix: ensure all `M365_*` variables are set correctly in Vercel.

- **403 from Graph**
  - Cause: `Mail.Send` permission missing or admin consent not granted.
  - Fix: Add `Mail.Send` (Application) and Grant admin consent.

- **404 mailbox not found**
  - Cause: wrong `M365_SENDER_UPN`.
  - Fix: set exact existing mailbox address.

---

## 7) Optional local `.env` (for local testing)

```env
PORTAL_BASE_URL=http://localhost:5173
PASSWORD_RESET_TTL_MINUTES=60
M365_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
M365_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
M365_CLIENT_SECRET=your-client-secret-value
M365_SENDER_UPN=Mohamed.client2022@outlook.com
```

