---
name: review-changes
description: Rigorously review the current diff before committing.
disable-model-invocation: true
allowed-tools: Bash(git diff *) Bash(git status *)
---

## Changes under review
!`git diff HEAD`

## Working tree — untracked files do NOT appear in the diff above
!`git status --short`

Review the diff above. **Any `??` file in the status list that belongs to this change is part of the review — read it before judging.** A new page, service, or migration is invisible to `git diff`, and reviewing only the diff will miss it entirely.

Report only real findings, ranked by severity, each as `file:line — problem — concrete fix`. If a category is clean, say so in one line.

- Correctness: logic errors, off-by-one, wrong types, unhandled null/None, races.
- Error handling: swallowed exceptions, missing validation at inputs and API boundaries. This repo fails loud on purpose — flag anything that turns an error into a silent `null`, and any `db.rollback()` missing from a failure path.
- Security: injection, missing authz/authn, unsafe deserialization, PII in logs. Specifically: the service-role key must never appear in `web/` or `mobile/` (they ship to users); privileged mutations belong behind FastAPI + `require_roles`; `EXPOSE_SYNC_TRACEBACK` must not be enabled in a production path; new Supabase tables/columns need RLS considered, not assumed.
- ML: parity drift between [ml_fusion_engine.py](backend/app/services/ml_fusion_engine.py) and [mobile/services/ml/](mobile/services/ml/) — class order, fusion weights, preprocessing, encodings. Also train/test or target leakage, request-time data that should be precomputed, unpinned model version, unexpected non-determinism. If either inference path changed, was `parity_test_mobile_models.py` re-run?
- Contracts: API boundary stays `snake_case` and matches the Pydantic schema; new enum values require a migration in `supabase/migrations/`, not just a Python change; `.env.example` updated for any new env var.
- Offline path: did anything add a network dependency to capture, wizard, or on-device prediction? Does a failed upload still leave a retryable outbox item?
- Verification: there's no test suite, so ask what was actually run — typecheck, `smoke_test_models.py`, `parity_test_mobile_models.py`, `/api/health`, or an end-to-end capture → sync → dashboard pass. "Looks right" is not verification.
- Scope: unrelated edits, reformatting, dead code, debug prints, stray TODOs, accidental commits of the superseded `api/` or `web/src/mock/*` code.

End with a one-line verdict: safe to commit, or blockers first.
