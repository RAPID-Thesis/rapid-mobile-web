# RAPID — Hybrid AI System for Earthquake Resilience

Pre-earthquake vulnerability prediction and post-earthquake damage classification through image and structural data integration, with automated action planning via Gemini.

> **Thesis project.** Study area: San Jose del Monte, Bulacan, Philippines.

---

## Repository layout

```
rapid/
├── backend/    # FastAPI + Supabase + ML inference (ResNet50 + Random Forest + Late Fusion)
├── mobile/     # Expo (React Native) — field inspector app with offline camera capture
├── web/        # Vite + React — engineer / DRRMO dashboard
├── ml/         # Training scripts, data dictionary, model metadata
└── PRD-RAPID-MVP.md
```

Each surface has its own `README.md` with details:

- [`backend/`](backend/) — API routes, schemas, ML fusion engine
- [`ml/`](ml/README.md) — how to regenerate the synthetic dataset and retrain both models
- [`ml/NEXT_STEPS.md`](ml/NEXT_STEPS.md) — post-training integration plan
- [`FRONTEND_NEXT_STEPS.md`](FRONTEND_NEXT_STEPS.md) — what's left to build on web + mobile

---

## First-time setup

### 1. Clone and install

```bash
git clone <repo-url> rapid
cd rapid

# Backend (Python 3.11+)
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows
# source .venv/bin/activate        # macOS / Linux
pip install -r requirements.txt    # ~500 MB — pulls TensorFlow

# Web
cd ..\web && npm install

# Mobile
cd ..\mobile && npm install
```

### 2. Configure environment variables

Each surface has a `.env.example`. Copy each to `.env` in the same folder and fill in the blanks:

```bash
cp backend/.env.example backend/.env
cp mobile/.env.example  mobile/.env
cp web/.env.example     web/.env
```

You need:
- A **Supabase** project — URL, anon key, service-role key, and the Postgres connection string
- A **Gemini API key** — https://aistudio.google.com/apikey (optional; the backend falls back to FEMA P-154 / ATC-20 templates if unset)

### 3. Download the trained models

The `.joblib` and `.keras` model files are **not** in Git (they total ~250 MB). Grab them from the [project's GitHub release](../../releases) and drop them into `ml/artifacts/`:

```
ml/artifacts/
├── rf_pre.joblib
├── rf_post.joblib
├── resnet50_pre.keras
└── resnet50_post.keras
```

Alternatively, **retrain from scratch** — see [`ml/README.md`](ml/README.md). Takes ~30 min for the RFs and 1-2 hours for ResNet50 on a GPU.

The SRTM elevation tile (`ml/data/gis/srtm/N14E121.hgt`, 25 MB) auto-downloads on first inference.

---

## Running the stack locally

Open three terminals:

```bash
# Terminal 1 — backend (ML + API on http://localhost:8000)
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 — web dashboard (http://localhost:5173)
cd web && npm run dev

# Terminal 3 — mobile app
cd mobile && npx expo start        # scan the QR with Expo Go on a real device
```

Cold-start timing on the backend:
- First request: ~10 s (TensorFlow loads both ResNet50 models)
- Subsequent fused predictions: ~300 ms

### Smoke test

1. Log in to the web dashboard with a Supabase account
2. Open the mobile app, grant GPS permission on first use, capture two photos of any building, submit
3. Within ~15 s the assessment appears on the dashboard with an `ai_fused_label`, probability bars, and an action plan

If the label stays `null`, check `backend` logs — usually the model files are missing from `ml/artifacts/`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Mobile | Expo 55 (React Native), expo-camera, expo-sensors, AsyncStorage |
| Web | Vite 7, React 19, Tailwind 4, React Router 7, Leaflet |
| Backend | FastAPI, SQLAlchemy, Supabase (auth + storage), google-genai |
| ML | scikit-learn (Random Forest), TensorFlow 2.20 (ResNet50 transfer learning), Late Fusion |
| Frameworks | FEMA P-154 (pre-EQ) and ATC-20 (post-EQ) |

## Model performance

See [`ml/artifacts/*_metadata.json`](ml/artifacts/):

| Model | Phase | Macro F1 |
|---|---|---|
| Random Forest | Pre-EQ | **0.85** (CV: 0.87) |
| Random Forest | Post-EQ | **0.85** |
| ResNet50 | Pre-EQ | **0.998** (val) |
| ResNet50 | Post-EQ | **0.998** (val) |

ResNet50's near-perfect val F1 partly reflects visual differences between source datasets — field-validation with real SJDM photos is the remaining step before thesis defense (see `ml/NEXT_STEPS.md` Step 7).

---

## Licensing & attribution

- PHIVOLCS Valley Fault System and Liquefaction Bulletin shapefiles — used with attribution
- SRTM 30 m DEM — public domain (USGS / NASA)
- SJDM soil map — digitized from public LGU publication for elevation-based classification
- Training imagery — public research datasets (PHI-Net, Kaggle EQ Damage, AIDER, CrackForest, xBD)
