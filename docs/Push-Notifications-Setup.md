# Push Notifications Setup (Alerts When Portal Closed)

To receive notifications **even when the portal tab is closed**, you need to configure VAPID keys.

## 1. Generate VAPID Keys

Run in the project root:

```bash
node -e "const webpush = require('web-push'); const k = webpush.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + k.publicKey); console.log('VAPID_PRIVATE_KEY=' + k.privateKey);"
```

## 2. Add to Vercel Environment Variables

In [Vercel](https://vercel.com) → your project → **Settings** → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | (from step 1) |
| `VAPID_PRIVATE_KEY` | (from step 1) |

Apply to **Production** (and Preview if desired).

## 3. Redeploy

Redeploy the project so the new env vars take effect.

## 4. Enable Push (User)

1. Log in to the portal
2. Go to **Settings**
3. Click **"Enable push (alerts when tab closed)"**
4. Allow notifications when prompted

After that, you'll receive desktop notifications for new tickets and replies even when the portal tab or browser is closed.
