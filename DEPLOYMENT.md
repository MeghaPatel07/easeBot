# Deployment Guide

Host the frontend (`Wedding-Ease-TheWeddingBot-Chat`) on **Vercel**, the backend (`easebot-backend`) on **Railway**, and point a **GoDaddy** domain at both.

---

## Part 1 — Deploy Backend to Railway

### 1. Prepare the repo
- Ensure `easebot-backend/package.json` has a `start` script (e.g. `"start": "node server.js"`).
- Server must listen on `process.env.PORT` and bind `0.0.0.0`.
- Commit and push to GitHub.

### 2. Create Railway project
1. Go to [railway.app](https://railway.app) → **Login with GitHub**.
2. Click **New Project** → **Deploy from GitHub repo** → select your repo.
3. If the backend lives in a subfolder, open **Settings → Root Directory** and set it to `easebot-backend`.
4. Under **Settings → Build**: Railway auto-detects Node. Leave defaults unless you need a custom build command.
5. Under **Settings → Deploy**: set **Start Command** to `npm start` (if not auto-detected).

### 3. Environment variables
1. Open the service → **Variables** tab.
2. Add every key from your local `.env` (API keys, DB URLs, Azure TTS keys, etc.).
3. Do **not** set `PORT` — Railway injects it automatically.

### 4. Generate public domain
1. **Settings → Networking → Generate Domain**.
2. Railway gives you `your-app.up.railway.app`. Test it: `https://your-app.up.railway.app/health` (or your health route).
3. Keep this URL — the frontend needs it.

### 5. Custom backend subdomain (optional, recommended)
1. **Settings → Networking → Custom Domain** → enter `api.yourdomain.com`.
2. Railway shows a **CNAME target** (e.g. `xyz.up.railway.app`). Copy it — you'll use it in GoDaddy (Part 3).

---

## Part 2 — Deploy Frontend to Vercel

### 1. Prepare the repo
- Confirm `Wedding-Ease-TheWeddingBot-Chat` builds locally: `npm run build`.
- SPA rewrites are already configured (`vercel.json` exists).
- Use an env var for the API base URL (e.g. `VITE_API_URL` for Vite, `NEXT_PUBLIC_API_URL` for Next).

### 2. Import project
1. Go to [vercel.com](https://vercel.com) → **Add New → Project** → import the GitHub repo.
2. **Root Directory**: set to `Wedding-Ease-TheWeddingBot-Chat`.
3. Framework preset: auto-detected (Vite / Next / CRA).
4. **Build Command** and **Output Directory**: leave defaults unless customised.

### 3. Environment variables
1. **Settings → Environment Variables**.
2. Add `VITE_API_URL` = `https://your-app.up.railway.app` (or `https://api.yourdomain.com` once DNS is live).
3. Apply to **Production**, **Preview**, and **Development**.
4. Click **Deploy**.

### 4. CORS
On the backend, allow the Vercel domain and your custom domain:
```js
app.use(cors({ origin: ['https://yourdomain.com', 'https://www.yourdomain.com', 'https://your-app.vercel.app'] }));
```
Redeploy Railway after changing.

### 5. Add custom frontend domain
1. Vercel project → **Settings → Domains** → add `yourdomain.com` and `www.yourdomain.com`.
2. Vercel displays the DNS records you need (an `A` record `76.76.21.21` for the apex, a `CNAME` → `cname.vercel-dns.com` for `www`). Copy them.

---

## Part 3 — GoDaddy DNS Setup

### 1. Open DNS manager
1. Login to [godaddy.com](https://godaddy.com) → **My Products → Domains**.
2. Click your domain → **DNS** → **Manage Zones**.

### 2. Remove conflicting records
- Delete the default GoDaddy **Parked** `A` record for `@`.
- Delete any existing `CNAME` for `www` that points to `@`.
- Keep `MX`, `TXT` (SPF/DKIM), and other unrelated records.

### 3. Add frontend records (Vercel)
| Type  | Name | Value                     | TTL      |
|-------|------|---------------------------|----------|
| A     | @    | `76.76.21.21`             | 600 sec  |
| CNAME | www  | `cname.vercel-dns.com`    | 1 Hour   |

### 4. Add backend record (Railway)
| Type  | Name | Value                              | TTL     |
|-------|------|------------------------------------|---------|
| CNAME | api  | `<the CNAME target from Railway>`  | 1 Hour  |

### 5. Save and wait
- Click **Save** for each record.
- DNS propagation: usually 5–30 minutes, up to 48 hours.
- Check with [dnschecker.org](https://dnschecker.org).

### 6. Verify in dashboards
- Vercel **Domains**: status should flip to **Valid Configuration** with an auto-issued SSL cert.
- Railway **Custom Domain**: status should go **Active** with SSL.

---

## Part 4 — Post-deploy checklist

- [ ] `https://yourdomain.com` loads the frontend
- [ ] `https://api.yourdomain.com/health` returns 200
- [ ] Frontend `VITE_API_URL` updated to `https://api.yourdomain.com` → redeploy
- [ ] Backend CORS allows the final frontend origin
- [ ] Test chat flow end-to-end in production
- [ ] Enable Vercel Analytics / Railway metrics if needed

---

## Troubleshooting

- **`ERR_NAME_NOT_RESOLVED`** — DNS not propagated yet; wait or flush DNS (`ipconfig /flushdns`).
- **Mixed content / CORS errors** — backend URL must be HTTPS and listed in CORS origins.
- **Vercel 404 on refresh** — confirm `vercel.json` SPA rewrite is present.
- **Railway build fails** — check logs for missing env vars or wrong root directory.
- **GoDaddy won't let you set A `@`** — delete the forwarding rule under **Domain Settings → Forwarding** first.
