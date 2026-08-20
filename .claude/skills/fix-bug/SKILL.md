---
name: fix-bug
description: Diagnose and fix a bug by root cause, not symptom. Use when something errors, crashes, returns wrong output, or behaves unexpectedly.
argument-hint: "[describe the bug]"
---

Fix the bug: $ARGUMENTS

In order, no skipping ahead:
1. Reproduce — state the exact trigger and expected vs actual. If you can't reproduce it, say so and ask for what's missing.
2. Isolate — narrow to the smallest failing unit. Read the real code path; don't guess.
3. Root cause — explain *why* it fails in one or two sentences. Separate cause from symptom.
4. Fix — the minimal change that addresses the cause. No unrelated refactoring.
5. Prove — run a real check that fails before and passes after (list below). Report the command and its actual output.
6. Blast radius — list anything else that relied on the old behavior. If the fix touched shared inference logic, state whether the *other* inference path needs the same change.

## Proving it — there is no test suite in this repo
Pick the closest executable check and name it. Do **not** scaffold pytest/jest to satisfy step 5; if the bug genuinely warrants a test harness, flag it and let the user decide (it's a new dependency).

| Area | Check |
|---|---|
| Backend / API | `GET /api/health`, the endpoint via `/docs`, or `curl` with a real Supabase JWT |
| Server ML | `python ml/scripts/smoke_test_models.py` |
| Server↔device ML parity | `python ml/scripts/parity_test_mobile_models.py` |
| Web | `cd web && npx tsc -b --noEmit && npm run lint`, then the affected page in the browser |
| Mobile | `cd mobile && npx tsc --noEmit`, then capture → outbox → sync end to end |

## Reproduction traps in this stack
- **Inference is asynchronous.** `POST /api/assessments/sync` returns 201 *before* ML runs (`process_assessment` via `BackgroundTasks`). Failures show up as backend log entries and a null `ai_fused_label` — never in the HTTP response.
- **Expo Go has no TFLite/ONNX.** On-device ML silently degrades to the rule-based heuristic there. Check `prediction_source` (`device-ml-fusion` vs `device-offline-heuristic`) before blaming a model; reproduce on a dev/EAS build.
- **First inference is slow, not hung.** TensorFlow load is ~30–120 s on a cold backend. Don't chase a timeout that's really a cold start.
- **403 usually means unapproved, not broken auth** — `verification_status != 'approved'` in `profiles`.
- **Missing dashboard rows are often RLS, not missing data.** Check the policy in `supabase/migrations/` before rewriting the query.
- **`EXPO_PUBLIC_*` is baked in at build time.** A stale API URL or Supabase key needs a rebuild, not a restart.

If the cause is unclear, add targeted logging and say what to run, rather than shipping a speculative fix.
