# Custom domain setup (Vercel)

Your app is currently live at **https://it-support-v2.vercel.app**. To use a custom domain (e.g. `https://support.yourcompany.com`):

## 1. Add the domain in Vercel

1. Go to [vercel.com](https://vercel.com) → **Dashboard** → open project **it-support-v2** (or your project name).
2. Open **Settings** → **Domains**.
3. Click **Add** and enter your domain, e.g. `support.yourcompany.com`.
4. Follow Vercel’s instructions to add the DNS records (A/CNAME) at your DNS provider.
5. Wait for SSL to be issued (Vercel does this automatically).

Your app will then be reachable at both:

- `https://it-support-v2.vercel.app` (still works)
- `https://support.yourcompany.com` (or whatever you added)

## 2. Set environment variables for the custom domain

So that **password reset links** and **requester magic links** use your custom domain (and not the Vercel URL), set these in Vercel:

1. In the project: **Settings** → **Environment Variables**.
2. Add or update:

| Variable | Example value | Used for |
|----------|----------------|----------|
| `PORTAL_BASE_URL` | `https://support.yourcompany.com` | Password reset link in emails |
| `REQUESTER_PORTAL_BASE_URL` | `https://support.yourcompany.com/public/requester/portal` | Magic-link URL in requester emails |

Use **Production** (and optionally Preview if you use custom domains there).

3. **Redeploy** the project (e.g. **Deployments** → latest → **⋯** → **Redeploy**) so the new variables are applied.

## 3. Optional: frontend API base

- If the **frontend and API are on the same domain** (this repo’s backend serves the built `web/dist`), you don’t need to set `VITE_API_BASE` for production; relative requests work.
- If you ever split the API to another domain, set `VITE_API_BASE` in the **build** environment to that API URL (e.g. `https://api.yourcompany.com`) and rebuild the frontend.

## Summary

- **Vercel Domains**: Add the custom hostname and DNS.
- **Env vars**: `PORTAL_BASE_URL` and `REQUESTER_PORTAL_BASE_URL` to your custom domain URLs.
- **Redeploy** after changing env vars.

After that, emails will link to your custom domain instead of `it-support-v2.vercel.app`.
