# Offline ML on Android — field validation checklist

On-device prediction uses **ResNet50 (TFLite) + Random Forest (ONNX) + late fusion** when model files are bundled in the APK. Without models, the app falls back to the rule-based heuristic.

## Standalone APK (no PC / no Metro)

The app is a **native development build**, not Expo Go. By default, debug APKs load JavaScript from **Metro** on your laptop (`localhost:8081`), which causes a white screen or endless loading when the PC is off or unplugged.

To open RADAR **without USB or Metro**, embed the JS bundle in the APK at build time:

1. Confirm [`mobile/android/app/build.gradle`](../android/app/build.gradle) has `debuggableVariants = []` (already set in this repo).
2. Build and install once on a connected phone:

   ```powershell
   cd mobile\android
   .\gradlew installDebug
   ```

   The build runs `createBundleDebugJsAndAssets` and packages JS + ML assets inside the APK (~4 min on a warm cache).

3. Unplug USB, stop Metro (`Ctrl+C` in the terminal running `npx expo start`), and open **RADAR** from the home screen. You should see `Running "main"` in logcat without `loadJSBundleFromMetro`.

**Alternative (cloud build):** `cd mobile && npm run build:android` (EAS preview APK) — download and sideload the same standalone result.

| After standalone install | Works without PC? |
|--------------------------|-------------------|
| Open app / UI | Yes |
| On-device ML | Yes (if models exported — see below) |
| Offline assessments | Yes |
| First-time login | Needs internet (Supabase) |
| Sync to laptop backend | Needs Wi‑Fi to laptop (`EXPO_PUBLIC_API_URL` in `.env`, baked in at build) |
| Live JS hot reload | No (dev-only; needs Metro) |

**Env changes:** `EXPO_PUBLIC_*` values in `mobile/.env` are baked in at build time. Change API IP or Supabase keys → rebuild and reinstall.

**Troubleshooting standalone load:**

| Symptom | Fix |
|---------|-----|
| Still stuck on loading | Uninstall old `com.rapid.app`, reinstall fresh APK |
| Dev menu tries `8081` | Harmless in standalone mode; JS still loads from APK assets |
| Need to develop with hot reload | Use `npx expo start` + USB `adb reverse tcp:8081 tcp:8081` |

## Prerequisites

1. Train server models (if not already):

   ```bash
   cd ml
   pip install -r requirements.txt
   python train_tabular_rf.py
   python train_resnet50.py
   ```

2. Export mobile artifacts:

   ```bash
   pip install -r ml/requirements-export.txt
   python ml/scripts/export_mobile_models.py --copy-to-mobile
   python ml/scripts/export_mobile_geo.py --copy-to-mobile
   ```

3. Verify parity (optional):

   ```bash
   python ml/scripts/parity_test_mobile_models.py
   ```

4. Build Android standalone APK (native modules — **not Expo Go**):

   ```powershell
   cd mobile\android
   .\gradlew installDebug
   ```

   See **Standalone APK (no PC / no Metro)** above. Do **not** rely on `npx expo run:android` alone for field phones — that default debug build expects Metro unless `debuggableVariants = []`.

   Or EAS:

   ```bash
   npm run build:android
   ```

## Airplane-mode test

- [ ] Install APK on a physical Android phone
- [ ] Enable airplane mode (no Wi‑Fi / mobile data)
- [ ] Open app → Continue offline or sign in (either works for capture)
- [ ] New assessment → complete all wizard steps with ≥2 photos
- [ ] On review step, confirm label shows **Device ML fusion** (not heuristic) when models bundled
- [ ] Save → open detail → verify Image (ResNet), Tabular (RF), and Fused breakdown
- [ ] Confirm action plan lists FEMA/ATC-20 items
- [ ] Assessment appears on Assessments tab with **Device ML** badge

## Expected fallback behavior

If `mobile/assets/models/mobile_manifest.json` has `"bundled": false` or `.tflite`/`.onnx` files are missing:

- Review step shows **Heuristic fallback**
- Inspection still completes; upload later runs full server ML

## Troubleshooting

| Symptom | Check |
|---------|--------|
| Always heuristic | Run export with `--copy-to-mobile`; rebuild native APK |
| Stuck on loading / white screen | Rebuild with `debuggableVariants = []` and `gradlew installDebug`; see Standalone APK section |
| Model init crash | Use native APK, not Expo Go |
| Label differs from server after sync | Expected — server re-runs Python pipeline; check "Server refined" when implemented |
| Slow first prediction | First TFLite load ~2–5 s; subsequent runs faster |
