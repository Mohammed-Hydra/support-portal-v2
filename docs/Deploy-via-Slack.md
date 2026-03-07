# Deploy via Slack

Trigger a production deployment of the Support Portal from Slack using a slash command.

## Prerequisites

- Vercel project connected to your Git repository
- Slack workspace with admin access

## Step 1: Create a Vercel Deploy Hook

1. Go to [Vercel Dashboard](https://vercel.com) → your project (**it-support-v2**)
2. **Settings** → **Git** → scroll to **Deploy Hooks**
3. Click **Create Hook**
4. Name: `Slack Deploy` (or similar)
5. Branch: `main` (or your production branch)
6. Copy the generated URL (e.g. `https://api.vercel.com/v1/integrations/deploy/...`)

## Step 2: Add Environment Variables

Add these to your Vercel project (**Settings** → **Environment Variables**):

| Variable | Value | Notes |
|----------|-------|-------|
| `VERCEL_DEPLOY_HOOK_URL` | The URL from Step 1 | Your deploy hook URL |
| `DEPLOY_SECRET` | A random secret string | e.g. `openssl rand -hex 24` |

**Important:** Redeploy after adding these variables so they take effect.

## Step 3: Create a Slack Slash Command

1. Go to [Slack API](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Name: `Support Portal Deploy` (or similar), select your workspace
3. In the app, go to **Slash Commands** → **Create New Command**
4. Configure:
   - **Command:** `/deploy-portal` (or `/deploy`)
   - **Request URL:**  
     `https://YOUR-PORTAL-DOMAIN/api/deploy?token=YOUR_DEPLOY_SECRET`  
     Replace with your portal URL (e.g. `it-support-v2.vercel.app`) and `YOUR_DEPLOY_SECRET` with the same value as `DEPLOY_SECRET`
   - **Short Description:** `Trigger production deployment`
   - **Usage Hint:** (optional) ``
5. **Save**
6. Go to **Install App** → **Install to Workspace** → authorize

## Step 4: Use the Command

In any channel, type:

```
/deploy-portal
```

Slack will send a POST request to your API. You should see a brief “Working…” message, then the deployment will start. Check your Vercel dashboard for the new deployment.

## Alternative: Slack Workflow + Webhook

If you prefer a shortcut instead of a slash command:

1. Use [Slack Workflow Builder](https://slack.com/help/articles/360035692513) or a tool like **Workflow Buddy** that can send HTTP requests
2. Create a workflow triggered by a shortcut (e.g. “Deploy portal”)
3. Add a step to send a POST request to:  
   `https://YOUR-PORTAL-DOMAIN/api/deploy?token=YOUR_DEPLOY_SECRET`

## Security

- Keep `DEPLOY_SECRET` private; anyone with the full URL can trigger deployments
- The token can be passed as: query `?token=`, header `Authorization: Bearer ...`, or body `{ "token": "..." }`
- Regenerate the secret if it is ever exposed
