# HYDRA-TECH Support Portal v2 – Deployment & Setup Steps

This document lists all steps for deploying and configuring the IT Support Portal v2 on Vercel and fixing common issues.

---

## 1. Prerequisites

- **Git** installed ([git-scm.com/download/win](https://git-scm.com/download/win))
- **GitHub** account
- **Vercel** account ([vercel.com](https://vercel.com))
- Project folder: **D:\IT support portal v2**

---

## 2. Initial Git Setup (if not a repo yet)

```powershell
cd "D:\IT support portal v2"
git init
git add .
git commit -m "Initial commit - Support Portal v2"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your GitHub username and repository name.

---

## 3. GitHub Repository

1. Go to [github.com](https://github.com) → **New repository**
2. Name (e.g. `support-portal-v2`), **Public**, do **not** add README
3. Create repository, then use the URL in the `git remote add` command above

---

## 4. Vercel Project Settings

In Vercel: **Project → Settings → General → Build & Development**

| Setting | Value |
|--------|--------|
| **Root Directory** | *(empty)* |
| **Framework Preset** | Other |
| **Build Command** | `npm run build` (Override: **ON**) |
| **Output Directory** | *(empty)* (Override: **ON**) |
| **Install Command** | *(default)* (Override: OFF) |

---

## 5. Push and Deploy

```powershell
cd "D:\IT support portal v2"
git add .
git status
git commit -m "Your message"
git push -u origin main
```

Use `git push` (without `-u origin main`) for later pushes.

---

## 6. Include Built Frontend (fix 404)

If the app shows **404 NOT_FOUND** after deploy:

1. **Build the frontend locally:**
   ```powershell
   cd "D:\IT support portal v2\web"
   npm run build
   ```

2. **Commit and push the built files:**
   ```powershell
   cd "D:\IT support portal v2"
   git add web/dist web/.gitignore src/app.js
   git commit -m "Include built frontend for deploy"
   git push
   ```

3. In Vercel, set **Build Command** to `npm run build` and **Output Directory** to *(empty)*, then **Redeploy**.

---

## 7. Logo

- Logo file: **web/src/assets/hydra-tech-logo.svg** (and **web/public/hydra-tech-logo.svg**)
- Used in **Layout.jsx** and **LoginPage.jsx** via `import logoSrc from "../assets/hydra-tech-logo.svg"` and `src={logoSrc}`

---

## 8. Share Portal & Requester Links

- In the sidebar (admin/agent only): **Portal: Copy link** and **Requester: Copy link**
- Portal URL = main app URL; Requester URL = same origin + `/public/requester`
- Translations in **web/src/i18n.js** (EN/AR)

---

## 9. Company Name Column (Ticket Queue)

- **Ticket List** table has a **Company Name** column after **Contact**
- Data from `requester_company_name` or `requester_company_from_contact` (API already returns these)

---

## 10. Personal Access Token (GitHub)

When `git push` asks for a password:

1. GitHub → **Settings → Developer settings → Personal access tokens**
2. **Generate new token (classic)** → check **repo**
3. Copy the token and paste it as the password when Git prompts

---

## 11. Troubleshooting

| Issue | Fix |
|-------|-----|
| **404 NOT_FOUND** | Set Build Command to `npm run build`, Output Directory empty; commit and push **web/dist**; redeploy |
| **Logo not showing** | Logo is imported from `web/src/assets/hydra-tech-logo.svg`; ensure file exists and redeploy |
| **Cannot GET /login** | Ensure frontend is built (web/dist) and served by Node server; check Vercel Build Command and Output Directory |
| **git not recognized** | Install Git from git-scm.com and restart the terminal |
| **Nothing to commit** | Changes already committed; run `git push` |
| **fatal: repository not found** | Replace YOUR_USERNAME/YOUR_REPO_NAME in `git remote add` with your real GitHub repo URL |

---

## 12. After Frontend Changes

1. Build: `cd "D:\IT support portal v2\web"` then `npm run build`
2. Commit: `git add web/dist` then `git commit -m "Update frontend"` then `git push`
3. Vercel will redeploy automatically, or trigger **Redeploy** from the dashboard

---

*Generated for IT Support Portal v2 (HYDRA-TECH).*
