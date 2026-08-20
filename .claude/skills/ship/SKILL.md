---
name: ship
description: Stage, commit, and prepare the current change for review.
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git status *) Bash(git diff *) Bash(git commit *) Bash(git log *)
argument-hint: "[optional message]"
---

## Current state
!`git status --short`

1. Review staged vs unstaged. Don't stage unrelated changes. Stage files by explicit path — never `git add -A` or `git add .` in this repo (see below).
2. Write the message: concise imperative subject (<=72 chars), then a body explaining *why* if non-obvious. Use $ARGUMENTS if provided.
3. Commit only the relevant files.
4. Summarize what changed and what a reviewer should scrutinize.

## Staging hazards specific to this repo
- **The mobile ML binaries are tracked, not ignored.** `ml/artifacts/mobile/*.onnx` + `*.tflite` are ~124 MB and *already committed by design* (the mobile build bundles them). `.gitignore` covers only the server-side `*.joblib` / `*.keras`. So a `git add -A` after re-running `export_mobile_models.py` silently stages 124 MB of rewritten binaries.
  - If the re-export is genuinely part of the change: stage those files deliberately, say so in the commit body, and note that parity was re-verified.
  - If they changed as a side effect: `git checkout -- ml/artifacts/mobile/` and leave them alone.
- **Untracked clutter lives in the tree** — a PHIVOLCS fault-line archive, `*/cursor/` scratch rules, stray asset and duplicate-module files. None of it belongs in a feature commit. Check every `??` line before staging.
- Never commit: `.env` files, real Supabase keys or service-role tokens, SRTM tiles, raw or prepared training images, `ml/data/train_*.csv`, server model artifacts.

Do not push. Deploys go out through `scripts/railway-deploy.ps1` / `scripts/vercel-deploy.ps1`, so pushing is a separate, deliberate act — leave it to the user.
