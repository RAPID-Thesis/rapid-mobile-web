# Project: RAPID — seismic assessment ML portal + mobile app

Hybrid AI system for pre-earthquake resilience prediction (FEMA P-154) and post-earthquake
damage classification (ATC-20). Study area: San Jose del Monte, Bulacan. Thesis project,
~70% complete. See [PRD-RAPID-MVP.md](PRD-RAPID-MVP.md) for requirements and
[README.md](README.md) for setup. Note: [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) is stale in
places (it predates Supabase and on-device ML) — trust the code over it.

## Stack
- **Backend:** Python 3.11/3.12 (**not** 3.13+ — no TF wheels), FastAPI, SQLAlchemy 2.0
  (`Mapped`/`mapped_column`), Pydantic v2, Supabase Postgres via `postgresql+psycopg`.
  Routes in [backend/app/main.py](backend/app/main.py), services in [backend/app/services/](backend/app/services/).
- **Auth / DB / Storage:** Supabase. JWTs are minted by Supabase and verified server-side in
  [backend/app/security.py](backend/app/security.py) (`auth.get_user` → `profiles` row →
  role + `verification_status == 'approved'`). Schema, RLS policies, and the
  `assessment-images` bucket live in [supabase/migrations/](supabase/migrations/).
- **ML (server):** scikit-learn 1.6.1 Random Forest (`rf_pre/post.joblib`) + TensorFlow 2.20
  ResNet50 (`resnet50_pre/post.keras`), combined by weighted-average late fusion in
  [backend/app/services/ml_fusion_engine.py](backend/app/services/ml_fusion_engine.py).
  Action plans via `google-genai` in [gemini_planner.py](backend/app/services/gemini_planner.py)
  with a FEMA/ATC-20 template fallback.
- **ML (device):** the same two models exported to ONNX (RF, `onnxruntime-react-native`) and
  TFLite (ResNet50, `react-native-fast-tflite`) under `ml/artifacts/mobile/`, run in
  [mobile/services/ml/](mobile/services/ml/). Training/export scripts in [ml/](ml/).
- **Web:** Vite 7, React 19, TypeScript strict, Tailwind 4, React Router 7, Leaflet,
  `@supabase/supabase-js`. Pages in [web/src/pages/](web/src/pages/).
- **Mobile:** Expo 55 / React Native 0.83, expo-router, TypeScript strict, AsyncStorage
  outbox, expo-camera / expo-location / expo-sensors. Screens in [mobile/app/](mobile/app/),
  logic in [mobile/services/](mobile/services/).
- **Infra:** [backend/Dockerfile](backend/Dockerfile) → Railway ([railway.toml](railway.toml),
  health check `/api/health`) or Cloud Run ([cloudbuild.yaml](cloudbuild.yaml));
  web → Vercel; mobile → EAS. Deploy steps in [PRODUCTION.md](PRODUCTION.md).

### Dead code — do not extend or "fix"
`api/` (Express + Mongo), `lib/mongodb.js`, `scripts/*mongodb*`, `web/src/mock/*`,
`backend/radar.db`, `rapid-mobile-web-main/`. These are superseded by FastAPI + Supabase.
Delete on request; otherwise leave alone.

## Architecture rules
- **Two inference paths must stay in parity.** Server
  ([ml_fusion_engine.py](backend/app/services/ml_fusion_engine.py)) and device
  ([mobile/services/ml/](mobile/services/ml/)) implement the same pipeline. Class order
  (`PRE_CLASSES = high, low, moderate` / `POST_CLASSES = RESTRICTED, SAFE, UNSAFE`), fusion
  weights (image 0.45 / tabular 0.55), 224px preprocessing, and feature encoding must match
  on both sides. Touching one side means updating the other, re-running
  `ml/scripts/export_mobile_models.py`, and verifying with
  `ml/scripts/parity_test_mobile_models.py`.
- **Models are frozen.** Inference only. Do not add training, fine-tuning, or augmentation
  code to `backend/` or `mobile/` — retraining belongs in `ml/train_*.py`.
- **Write path vs read path.** Mobile writes go through FastAPI
  (`POST /api/assessments/sync`, multipart: JSON payload + images); the web dashboard reads
  directly through `supabase-js` under RLS; privileged mutations (user approval, deletion)
  go through FastAPI, which holds the service-role key. Never reach for the service-role key
  from `web/` or `mobile/`.
- **Offline-first is a hard requirement.** Capture → on-device prediction → local action plan →
  AsyncStorage outbox ([outbox.ts](mobile/services/outbox.ts)) → background sync. Never
  introduce a network dependency into the capture or wizard path; a failed upload must leave a
  retryable outbox item, not lose data.
- Business logic lives in the service layer. Route handlers stay thin: validate payload →
  call service → persist → return. Heavy inference runs via `BackgroundTasks`
  (`process_assessment`), not inline in the request.
- Keep TensorFlow off import paths: ML imports stay function-local in the fusion engine so
  API startup and cold starts don't pay for them.
- Imports flow one way: UI → API client → service → data. No cross-layer or circular imports.

## Code standards
- Type everything: Python type hints with `from __future__ import annotations`; TS strict in
  both [web](web/tsconfig.app.json) and [mobile](mobile/tsconfig.json). No `any`, no untyped
  public functions.
- API boundary is `snake_case` (Pydantic schemas in [schemas.py](backend/app/schemas.py) and
  the TS interfaces mirroring them); local TS state is `camelCase`. Don't blur the two.
- Fail loud: raise `HTTPException` with an accurate status code; `db.rollback()` on failure.
  Never swallow an error into a silent `null` result — the mobile client distinguishes
  `device-ml-fusion` from `device-offline-heuristic` and the UI surfaces it.
- Enum values are Postgres native ENUMs (see [models.py](backend/app/models.py) and migration
  001). Adding a value requires a migration, not just a Python change.
- Match the patterns already in the file before introducing new ones.

## Never
- Hardcode secrets, model paths, or hostnames. Backend reads `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`,
  `GEMINI_API_KEY`, `GEMINI_MODEL`, `MODEL_DIR`, `SRTM_DIR`, `GEO_BUNDLE_PATH`,
  `FUSION_IMAGE_WEIGHT`, `FUSION_TABULAR_WEIGHT`; web reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL`, `VITE_SITE_URL`; mobile reads `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL`. Update the matching `.env.example`
  when adding one. `EXPO_PUBLIC_*` values are baked in at build time — changing them means a
  rebuild.
- Commit **server** ML binaries (`*.keras`, `*.joblib`) or SRTM tiles — gitignored by design,
  distributed via release/`ML_ARTIFACTS_URL`. Note the asymmetry: the **device** artifacts
  (`ml/artifacts/mobile/*.onnx`, `*.tflite`, ~124 MB) *are* tracked in git so the mobile build
  can bundle them — re-exporting them produces a huge diff, so stage them deliberately or not
  at all.
- Add a dependency without flagging it and why. Native mobile modules are especially costly:
  they break Expo Go and force a dev/EAS build (see [OFFLINE_ML_ANDROID.md](mobile/docs/OFFLINE_ML_ANDROID.md)).
- Reformat or refactor unrelated code inside a feature change.

## Commands
Run from the repo root unless noted.

| Task | Command |
|---|---|
| Backend install | `py -3.12 -m venv backend/.venv` · `backend\.venv\Scripts\activate` · `pip install -r backend/requirements.txt` |
| Backend run | `cd backend && uvicorn app.main:app --reload --port 8000` (first inference loads TF, ~30–120 s) |
| Web install / run | `cd web && npm install && npm run dev` (http://localhost:5173) |
| Web build / lint / typecheck | `npm run build` (runs `tsc -b`) · `npm run lint` · `npx tsc -b --noEmit` |
| Mobile install / run | `cd mobile && npm install && npx expo start` |
| Mobile typecheck | `cd mobile && npx tsc --noEmit` |
| Mobile Android build | `npm run build:android` (EAS preview) or `cd mobile/android && ./gradlew installDebug` |
| Export device models | `python ml/scripts/export_mobile_models.py` then `python ml/scripts/parity_test_mobile_models.py` |
| Retrain | `python ml/train_tabular_rf.py` · `python ml/train_resnet50.py` (see [ml/README.md](ml/README.md)) |
| Server model smoke test | `python ml/scripts/smoke_test_models.py` |
| Rebuild geo bundle | `python ml/scripts/export_mobile_geo.py --copy-to-mobile` (**needs `ml/.venv`** for geopandas) |

### Image dataset pipeline (run in this order)
Use `backend/.venv` — these need Pillow/TensorFlow, not geopandas.

| Step | Command |
|---|---|
| 1. Hash + group near-duplicates | `python ml/scripts/dedupe_images.py` → `ml/data/image_groups.csv` |
| 2. Build a labeling workspace | `python ml/scripts/relabel_workspace.py prepare --pool C [--no-junk]` |
| 3. Collect sorted labels | `... collect --pool C` (solo) or `... collect-team --pool C` (reports Fleiss' κ) |
| 4. Label a pool by source definition | `... autolabel --pool A --label low --reason "..."` |
| 5. Merge every pool | `... merge` → `ml/data/image_labels.csv` |
| 6. Group-aware split | `python ml/scripts/prepare_image_dataset.py --force` |
| 7. Train | `python ml/train_resnet50.py --mode both` |
| 8. **Honest evaluation** | `python ml/scripts/kfold_real.py` (k-fold CV on real field photos) |
| Shortcut diagnostic | `python ml/train_resnet50.py --shortcut-probe` — accuracy must fall near chance (0.33) |
| Single-holdout eval | `python ml/scripts/evaluate_on_real.py [--deploy-prior 0.10,0.85,0.05]` |

**Never quote the validation split as the model's accuracy.** The classes were originally
defined by source dataset, which let a model reach 0.9975 val macro F1 and 0.074 accuracy on
real photos. `kfold_real.py` is the number that means something; `train_resnet50.py` aborts
above 0.98 val macro F1 for this reason.
| Docker smoke test | `docker build -f backend/Dockerfile -t rapid-api .` · `docker run --rm -p 8080:8080 --env-file backend/.env rapid-api` |

**There is no automated test suite and no Python linter/formatter configured.** Verify changes
with: `GET /api/health`, the OpenAPI UI at `/docs`, `ml/scripts/smoke_test_models.py`,
`ml/scripts/parity_test_mobile_models.py`, and an end-to-end mobile capture → sync → dashboard
run. If you add tests, say where you put them and how to run them.
