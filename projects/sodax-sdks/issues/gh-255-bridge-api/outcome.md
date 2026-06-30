---
type: outcome
repo: sodax-sdks
github: 255
status: Not started
updated: 2026-06-30
---

# Outcome

- PR:
- Commits:
- Tests:

## Summary

Not started. Analysis + detailed plan complete (`plan.md`). Implementation is gated on:

1. Phase 0 prerequisite: rebase onto `origin/feat/swaps-api-v2` (PR #210 must land first
   or be the base branch) — the runtime foundation it adds is required.
2. Confirming the backend `/bridge/*` route list + DTO shapes (Open Q #1).
3. Resolving the decisions in `plan.md` §"Risks / Open questions" (host, config key,
   client-side vs backend reads, status lifecycle, idempotency, Bitcoin coverage).

## What Changed

(nothing yet)

## Follow-ups

- After SDK work + PR: backend implementation, pointing its `package.json` at local
  `dist/` (`pnpm build:packages`).
- Independently verify bridge re-relay idempotency before enabling `useBackendSubmitTx`
  anywhere (it ships default-OFF).
