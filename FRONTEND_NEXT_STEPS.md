# RAPID — Frontend Integration Plan

The backend AI pipeline is fully wired: both models load lazily on first request,
`process_assessment` runs after sync, and the three `/api/ai/predict/*` routes are
live. This document covers everything left to do on the **mobile app** and **web
dashboard** so the system actually uses the backend end-to-end.

> The order below is rough priority. P0 items are required for an end-to-end demo.
> Everything above "Definition of Done" must be finished before pushing to GitHub.

---

## Where the frontends are today

| Surface | Built | Missing |
|---|---|---|
| Mobile — capture wizard | 4-step form, real camera, quality checks | **Submit is a local `Alert.alert()` stub**, no API call |
| Mobile — assessment list | Reads directly from Supabase | Not using backend, no AI fields shown in cards |
| Mobile — assessment detail | Reads directly from Supabase | No images, no action plan, no AI probability bars |
| Mobile — sync tab | Static "all synced" placeholder | No real queue, no retry logic |
| Mobile — `services/sync.ts` | Has payload builder for `/api/assessments/sync` | Builder writes **hard-coded fake values**, ignores the captured form |
| Web — login | Supabase direct auth | Works |
| Web — dashboard stats | Supabase direct read | Works; hardcoded filters |
| Web — assessments list | Supabase direct read + filters | Works; no backend round trip |
| Web — assessment detail | Reads AI fields (`ai_fused_label`, probabilities, action plan) | **"Submit Review" button is not wired** to `PUT /api/assessments/{id}/review` |
| Web — heatmap | Leaflet map, Taal coordinates hardcoded | Should center on SJDM; markers from real GPS |
| Web — reports | Filters reviewed assessments | **"Generate PDF" button does nothing** |
| Both — AI fusion demo page | — | Missing entirely (great-for-defense item) |

---

## P0 — end-to-end submission (required for demo)

### 1. Mobile: wire `new.tsx` to actually submit

```110:129:mobile/app/assessment/new.tsx
  const handleSubmit = () => {
    Alert.alert('Assessment Saved', 'Your assessment has been saved locally and queued for sync.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };
```

Replace this stub with a real flow:

```ts
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl, parseApiError } from '../../services/api';
import { getUserToken } from '../../services/auth';

async function handleSubmit() {
  // 1. Get GPS fix (elevation_m / slope_deg are auto-derived by the backend from this).
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

  // 2. Build the payload that matches AssessmentSyncPayload on the backend.
  const payload = {
    building_code: buildingCode,
    address,
    barangay,
    municipality: 'San Jose del Monte',
    longitude: loc.coords.longitude,
    latitude: loc.coords.latitude,
    building_use: buildingUse,
    number_of_stories: Number(structuralData.stories) || 1,
    year_built: Number(structuralData.yearBuilt) || null,
    phase,
    structural_data: {
      material: structuralData.primaryMaterial,
      structural_system: structuralData.structuralSystem,
      soil_classification: structuralData.soilClass,
      topography: structuralData.topography,
      vertical_irregularity: structuralData.verticalIrregularity,
      plan_irregularity: structuralData.planIrregularity,
      pounding_hazard: structuralData.poundingHazard,
      falling_hazard: structuralData.fallingHazard,
    },
  };

  // 3. Try online submit first; on any network failure, push onto AsyncStorage queue.
  try {
    await submitOnline(payload, Object.values(capturedPhotos));
    Alert.alert('Submitted', 'Assessment uploaded. AI processing started.');
  } catch (err) {
    await queueForLater(payload, Object.values(capturedPhotos));
    Alert.alert('Saved offline', 'Will sync automatically when connectivity returns.');
  }
  router.back();
}
```

Move `submitOnline` and `queueForLater` into `mobile/services/sync.ts`.

### 2. Mobile: fix `sync.ts` to use real form data

```44:63:mobile/services/sync.ts
export function buildAssessmentPayloadFromQueueItem(item: SyncQueueItem): BackendAssessmentPayload {
  return {
    building_code: item.assessmentPayload.buildingId ?? `RADAR-${item.queueId}`,
    address: 'Queued from mobile device for backend sync',
    barangay: 'TBD Barangay',
    ...
  };
}
```

This currently throws away the real wizard state and substitutes fake defaults.
Rewrite so the queue item stores the **full typed payload**, and the sync function
forwards it verbatim:

```ts
export interface QueuedAssessment {
  id: string;                       // uuid, local only
  payload: AssessmentSyncPayload;   // matches backend schema exactly
  imageUris: string[];              // file:// URIs from expo-camera
  attempts: number;
  lastAttemptAt: string | null;
  status: 'queued' | 'syncing' | 'failed';
}
```

Persist the queue in `AsyncStorage` under `@rapid:sync-queue`. On each sync tick
(on-demand or NetInfo `isConnected` transition), iterate queued items, try
`POST /api/assessments/sync`, and move successful ones to a `@rapid:sync-history`
bucket so the Sync tab can show "uploaded today".

### 3. Mobile: real sync tab

Replace the static placeholder in `mobile/app/(tabs)/sync.tsx` with:

- Queue count pulled from AsyncStorage on focus.
- Per-item row with building code, age, attempts, and a manual retry button.
- A "Sync now" button that iterates the queue.
- A toggle for "Auto-sync when connected" (persisted to AsyncStorage).

Use `@react-native-community/netinfo` for online/offline detection. Install:

```bash
cd mobile && npx expo install @react-native-community/netinfo
```

### 4. Web: wire the engineer review submit button

```236:238:web/src/pages/AssessmentDetailPage.tsx
                  <button className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors">
                    Submit Review
                  </button>
```

This is a dead button today. Wire it to the existing backend endpoint:

```ts
async function submitReview() {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(`${API_BASE}/api/assessments/${id}/review`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ override_classification: overrideClass || null, justification }),
  });
  if (!res.ok) throw new Error(await res.text());
  // refresh the page state
}
```

Add a shared `web/src/lib/api.ts` helper so every page reuses the same base URL
and auth injection logic — right now each page goes through `supabase` directly,
which is fine for reads but not for backend-only endpoints like reviews.

---

## P1 — materially better demo

### 5. Mobile: auto-fill GPS at the start of the wizard

Add one `useEffect` in `new.tsx` that calls `Location.requestForegroundPermissionsAsync`
followed by `Location.getCurrentPositionAsync`, and show the captured lat/lon as a
"GPS: 14.8127, 121.0453 — accurate to 8m" line under the Building Info step. Let
the user override if the fix is bad.

### 6. Mobile: list + detail via backend (consistent AI fields)

Both screens currently hit Supabase directly. That works, but the backend's
`AssessmentDetailRead` response already joins building + images and returns the AI
probability maps. Switch to:

```ts
// mobile/services/assessments.ts (new file)
export async function fetchAssessments(): Promise<Assessment[]> {
  const token = await getUserToken();
  const res = await fetch(buildApiUrl('/api/assessments'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await parseApiError(res, 'Failed to load'));
  return res.json();
}
```

Then update `app/(tabs)/assessments.tsx` and `app/assessment/[id].tsx` to use
these helpers. The detail screen should render:

- The four captured images in a horizontal scroller (fetch with signed URLs from
  Supabase Storage — the backend already returns `storage_path`).
- The action plan list (`action_recommendations`) with the generator tag.
- A confidence bar for image branch, tabular branch, and fused label — mirrors the
  web detail page's `ConfidenceBar` component.

### 7. Web: heatmap centered on SJDM with real markers

```32:32:web/src/pages/HeatmapPage.tsx
  const center: [number, number] = [13.879, 120.921];
```

Change to `[14.8127, 121.0453]` (SJDM city center) and pull marker positions from
the `buildings.latitude` / `longitude` columns. Consider swapping `CircleMarker`
for `react-leaflet-heatmap-layer-v3` so the visualization actually looks like a
heatmap rather than scattered dots.

### 8. Web: live dashboard + real-time

Add a Supabase Realtime subscription on the `assessments` table so that when the
background task writes `ai_fused_label`, the dashboard reloads without a manual
refresh. One subscription is enough:

```ts
useEffect(() => {
  const channel = supabase
    .channel('assessments-feed')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assessments' }, () => load())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

### 9. Web: PDF report generation

The "Generate PDF Report" button in `ReportsPage.tsx` is a dead control. Two options:

- **Backend approach (recommended)**: add `GET /api/assessments/{id}/report.pdf`
  using `reportlab` or `weasyprint`. Produces a FEMA P-154 styled PDF with the
  building info, photos, AI results, and action plan. Keeps PDF templates in one
  place; can be audited and versioned.
- **Client approach**: use `jspdf` + `html2canvas` to snapshot the AssessmentDetail
  page. Fastest to ship but fragile.

Pick one and wire both the assessment-detail and reports-page buttons to it.

---

## P2 — polish and thesis-defense extras

### 10. Web: standalone "AI Fusion Demo" page

A new route `/ai-demo` (engineer/admin only) that lets an engineer:

1. Upload 1-4 photos via drag-and-drop.
2. Fill in the same structural form used in the mobile wizard.
3. Hit a "Run Fused Prediction" button that calls `POST /api/ai/predict/fused`.
4. Display the three probability vectors (image, tabular, fused) side-by-side,
   the fusion weights, and the top RF feature importances.

This is **gold for the thesis defense** because it lets you demonstrate the
multimodal pipeline live without pretending to be a field inspector. It also
exercises the two individual endpoints (`/predict/image`, `/predict/tabular`) so
you can show graceful degradation when one modality is missing.

### 11. Web: Gemini action-plan regeneration

On the assessment detail page, add a "Regenerate with Gemini" button that calls a
new `POST /api/assessments/{id}/action-plan` endpoint which re-invokes the
planner and overwrites `action_recommendations`. Useful for when the inspector
noted additional context after the initial run.

### 12. Mobile: pre-EQ vs post-EQ UX polish

The mobile wizard currently shows a "Pre-Earthquake / Post-Earthquake" toggle but
the downstream UI is identical. For post-EQ:

- Rename "Damage Close-up" to "Visible Damage — each type".
- Require **4 of 4** angles instead of 2 (damage assessment needs full coverage).
- Surface the resulting SAFE / RESTRICTED / UNSAFE placard as a big color-coded
  banner on the review screen, mirroring the mobile detail page.

### 13. Shared types package

Mobile and web both redefine `Assessment`, `Building`, `AIResult`, etc. Extract
these into a tiny `packages/types/` folder and reference it from both. This
prevents drift when the backend schemas evolve (e.g., when you add `elevation_m`
to `BuildingRead` server-side, both clients pick it up).

---

## Cross-cutting setup

### Environment variables

| File | Required keys |
|---|---|
| `mobile/.env` | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `web/.env` | `VITE_API_URL` *(new — add this)*, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `backend/.env` | `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, optional `MODEL_DIR` / `SRTM_DIR` |

Web currently has no `VITE_API_URL` — add it and create `web/src/lib/api.ts`
that mirrors `mobile/services/api.ts` so review submissions and future backend
calls have a single place to configure.

### Running the full stack locally

```bash
# Terminal 1 — backend (ML + API)
cd backend && uvicorn app.main:app --reload --port 8000

# Terminal 2 — web dashboard
cd web && npm run dev          # http://localhost:5173

# Terminal 3 — mobile app
cd mobile && npx expo start    # scan with Expo Go on a real phone
```

On first `/api/assessments/sync` call, TensorFlow loads both ResNet50 models
(~8-12s cold). Subsequent predictions are ~200-400ms. The SRTM tile is fetched
once and cached to disk.

---

## Definition of Done (before `git push`)

Minimal slice that makes the repo demoable on another machine:

- [ ] P0.1 — mobile `handleSubmit` calls `/api/assessments/sync` with real data + photos
- [ ] P0.2 — `services/sync.ts` stores the real payload, not fake defaults
- [ ] P0.3 — mobile sync tab shows real queued items + retry
- [ ] P0.4 — web "Submit Review" button hits `PUT /api/assessments/{id}/review`
- [ ] `mobile/.env.example` and `web/.env.example` committed (no secrets!)
- [ ] README at repo root updated with the 3-terminal run instructions above
- [ ] Smoke test: submit one assessment from the mobile app on a real device,
      watch it appear on the web dashboard within ~15 seconds, with an
      `ai_fused_label` and action plan rendered.

Everything under P1 and P2 can land in follow-up commits without breaking the
demo path.

---

## Suggested commit slicing

```
feat(mobile): wire real assessment submission to /api/assessments/sync
feat(mobile): real offline queue + NetInfo-triggered sync
feat(web): wire engineer review submission + shared API client
feat(web): SJDM-centered heatmap with real building GPS
feat(web): AI Fusion Demo page for live /predict/fused calls
feat(backend): PDF report endpoint for assessment detail
chore: shared types package + .env.example files
docs: root README with full-stack run instructions
```

Small PR-sized commits keep the diff reviewable and let you roll back a single
surface if needed.
