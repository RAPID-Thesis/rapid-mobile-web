---
name: explore
description: Investigate the codebase before changing it — map the relevant files, data flow, and existing patterns. Use before implementing a feature, changing behavior, or when unsure how something works.
context: fork
agent: Explore
background: false
argument-hint: "[what to investigate]"
---

Investigate: $ARGUMENTS

Work through this and don't skip:
1. Locate every file relevant to this area with Glob/Grep. List each as `path — role`.
2. Trace the flow end to end (entry point → service → data → response, or UI → API).
3. Identify the patterns, conventions, and abstractions already in use here.
4. Note constraints: types, error handling, enum↔migration coupling, edge cases.
5. Flag risks and anything ambiguous that affects the change.

This repo has seams that duplicate or hide behavior. Check whether the area you're mapping crosses one:
- **Two ML inference paths.** [ml_fusion_engine.py](backend/app/services/ml_fusion_engine.py) (server) and [mobile/services/ml/](mobile/services/ml/) (device) implement the same pipeline. Anything involving class order, fusion weights, preprocessing, or feature encoding exists *twice* — report both.
- **Two data paths.** Mobile writes through FastAPI (`POST /api/assessments/sync`); web reads straight from Supabase under RLS. A field can be written by one side and never surfaced by the other.
- **Offline-first capture.** Wizard → on-device predict → AsyncStorage outbox ([outbox.ts](mobile/services/outbox.ts)) → background sync. Behavior differs online vs offline; map both.
- **Dead code.** `api/`, `lib/mongodb.js`, `web/src/mock/*`, `backend/radar.db`, `rapid-mobile-web-main/` are superseded by FastAPI + Supabase. Don't present them as live; note them only to warn them off.

Return a tight brief: relevant files, how it works now, the pattern to follow, and open questions. Do not write or edit code.
