# RAPID — production rollout (step by step)

This is a practical path from local dev to a **public** stack. Adjust hosts and providers to match your org; the backend already includes a **Dockerfile** aimed at **Google Cloud Run**.

---

## 0. What “production” means here

| Piece | Dev today | Production target |
|-------|-----------|-------------------|
| **API** | `uvicorn` on your PC, LAN IP | HTTPS URL, e.g. `https://api.yourdomain.com` |
| **Database / Auth** | Supabase (already cloud) | Same project or a **dedicated prod** Supabase project |
| **Web** | Vite on `localhost:5173` | Static hosting + CDN (or behind same domain) |
| **Mobile** | Expo Go + `EXPO_PUBLIC_API_URL` LAN | **EAS build** + `EXPO_PUBLIC_API_URL` pointing at public API |

---

## 1. Supabase (production project)

1. Create or designate a **production** Supabase project (recommended: separate from thesis/dev data).
2. Apply the same **schema / migrations / RLS** you use in dev (SQL editor, migration tool, or `supabase db` CLI if you adopt it).
3. In **Settings → API**, copy:
   - Project URL  
   - `anon` key (clients)  
   - `service_role` key (**backend only**, never ship to mobile/web bundles)
4. In **Settings → Database**, copy a **production** connection string:
   - Prefer **Transaction pooler** on port **6543** with user `postgres.<project_ref>` for server workloads, or **Direct** `db.<ref>.supabase.co:5432` with user `postgres` if that matches your plan — use exactly what the dashboard shows to avoid `Tenant or user not found`.
5. Enable **email auth** settings, redirect URLs, and any **Storage** buckets (e.g. `assessment-images`) with policies matching your app.
6. **Backups**: enable Point-in-Time Recovery if the plan allows; document restore procedure.

---

## 2. Backend (FastAPI + ML)

### 2.1 Environment variables (production)

Set these on the host (Cloud Run secrets, VPS `.env`, etc.):

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `DATABASE_URL` — `postgresql+psycopg://...` (see `backend/.env.example`)
- `CORS_ALLOWED_ORIGINS` — comma-separated **https** origins for your **web** app and any other browsers that call the API (not mobile app origins; mobile is not a browser CORS client in the same way, but add if you use web views).
- `GEMINI_API_KEY` / `GEMINI_MODEL` if you use Gemini in prod
- Optional: `MODEL_DIR`, `SRTM_DIR` — the Docker image defaults to `/srv/ml/artifacts` and `/srv/ml/data/gis/srtm` (see `backend/Dockerfile`)

Never commit real `.env` files.

### 2.2 Model artifacts

The Docker build expects **`ml/artifacts`** (and optional SRTM data) **in the image** (see `backend/Dockerfile`: `COPY ml /srv/ml`). Before building:

- Ensure `rf_*.joblib`, `resnet50_*.keras`, etc. are present under `ml/artifacts/` (or adjust `MODEL_DIR` and copy strategy).
- Image size will be large (~TensorFlow); plan registry limits and cold-start on serverless.

### 2.3 Build and run locally (smoke test)

From **repository root** (as commented in the Dockerfile):

```bash
docker build -f backend/Dockerfile -t rapid-api .
docker run --rm -p 8080:8080 --env-file backend/.env rapid-api
```

Visit `http://localhost:8080/docs` and run a quick authenticated check.

### 2.4 Deploy API (example: Google Cloud Run)

1. Push image to **Artifact Registry** or **Container Registry**.
2. Create a **Cloud Run** service: set **port** to the container port (Dockerfile uses `8080`; Cloud Run sets `PORT`).
3. Inject env vars / **Secret Manager** for keys and `DATABASE_URL`.
4. **Min instances**: if you need to avoid cold starts on TensorFlow load, set ≥1 (cost tradeoff).
5. Attach a **custom domain** and managed TLS (Cloud Run domain mapping + certificate).
6. Update **`CORS_ALLOWED_ORIGINS`** to your real web origin(s), e.g. `https://app.yourdomain.com`.

Other valid options: **Fly.io**, **Railway**, **Render**, **Azure Container Apps**, **AWS ECS/Fargate**, a **VPS + Docker + Caddy/nginx** — same env vars and HTTPS reverse proxy pattern.

### 2.5 Deploy API on Railway (free trial)

1. Install CLI: `npm i -g @railway/cli` then `railway login`.
2. Ensure `backend/.env` is filled in (same vars as §2.1).
3. Place server ML files in `ml/artifacts/` (`rf_*.joblib`, `resnet50_*.keras`) **or** set `ML_ARTIFACTS_URL` on Railway to a zip download URL.
4. From repo root: `.\scripts\railway-deploy.ps1` (add `-CorsOrigin https://your-app.vercel.app` when web is deployed).
5. Generate a public URL: `railway domain`.
6. Point mobile `EXPO_PUBLIC_API_URL` and web `VITE_API_URL` at that URL; rebuild mobile (env is baked at build time).

Config lives in `railway.toml` (Dockerfile path `backend/Dockerfile`, health check `/api/health`).

---

## 3. Web dashboard (Vite)

### 3.1 Deploy on Vercel (recommended)

1. Install CLI: `npm i -g vercel` then `vercel login`.
2. Set `web/.env` (see `web/.env.example`):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL=https://rapid-api-production-14e0.up.railway.app` (your Railway URL)
3. From repo root: `.\scripts\vercel-deploy.ps1 -Production`
4. In Supabase **Auth → URL configuration**, add your Vercel **site URL** and redirect URLs.

`web/vercel.json` enables React Router SPA rewrites.

### 3.2 Manual / other hosts

1. Set production `.env` (or CI secrets):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL=https://api.yourdomain.com` (public API base, no trailing slash issues — match how the web client builds URLs)
2. Build: `cd web && npm run build`
3. Deploy `web/dist` to **static hosting** (Netlify, Vercel, Cloud Storage + Cloud CDN, S3+CloudFront, etc.).
4. In Supabase **Auth → URL configuration**, add your production **site URL** and redirect URLs.

---

## 4. Mobile app (Expo)

1. In **EAS** (or your build profiles in `eas.json`), set production env:
   - `EXPO_PUBLIC_API_URL=https://api.yourdomain.com`
   - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Build store binaries: `eas build --profile production` (Android/iOS per project config in `mobile/`).
3. Submit to **Play Store** / **App Store** (or distribute internally first).
4. **Deep links / scheme** (`rapid` in `app.json`) — confirm production domains if you use universal links later.

Expo Go is for development only; production users install your **release build**.

---

## 5. DNS and TLS (summary)

- One hostname for API: `api.yourdomain.com` → your container host / load balancer.
- One for web: `app.yourdomain.com` (or `yourdomain.com`).
- TLS termination at the load balancer or reverse proxy; **HTTPS only** in production.

---

## 6. Security checklist (minimum)

- [ ] `service_role` and DB password only on the **server**; rotate any key that ever leaked.
- [ ] Supabase **RLS** reviewed for all tables; storage policies for `assessment-images`.
- [ ] CORS restricted to real web origins (not `*` in production).
- [ ] Rate limiting / WAF (provider or reverse proxy) for public API.
- [ ] Logging without secrets; error messages don’t expose stack traces to clients in prod (tune FastAPI handlers if needed).

---

## 7. Operations

- **Monitoring**: Cloud Run / platform metrics + optional APM; alert on 5xx rate.
- **Logs**: centralize uvicorn/app logs; retain enough to debug sync failures.
- **Backups**: Supabase backups + documented restore; consider export of critical tables for DR.

---

## 8. Product / code readiness (from `SYSTEM_OVERVIEW.md`)

Before calling it “production” for real users, close gaps called out in the repo: full wizard → sync field mapping, web ↔ API integration depth, offline/mobile polish, audit logging, and ML validation on real field data as your thesis/product requires.

---

## Quick reference: what each client calls

| Client | Supabase | API |
|--------|----------|-----|
| Mobile | `EXPO_PUBLIC_SUPABASE_*` | `EXPO_PUBLIC_API_URL` |
| Web | `VITE_SUPABASE_*` | `VITE_API_URL` |
| Backend | `SUPABASE_*` + `DATABASE_URL` | N/A (it *is* the API) |

After deployment, verify end-to-end: **login → sync assessment with images → row appears in DB and dashboard**.
