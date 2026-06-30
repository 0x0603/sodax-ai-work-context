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

Code not started, but **unblocked**. Analysis + plan complete (`plan.md`), and the
backend contract is now **decided** (`reference/backend-contract/04-decisions.md`,
13/13). Status of the earlier gates:

1. ✅ Phase 0 done — branch `feat/bridge-api-v2` is off `feat/swaps-api-v2`, so the
   #210 runtime foundation is present; a WIP scaffold commit (`8fd58453`, 17 stub
   files across all 5 packages) already exists.
2. ✅ Backend `/bridge/*` routes + DTOs decided (mirror swaps; backend not built yet
   — it implements to the decided contract LATER).
3. ✅ All open questions resolved (host, naming, reads, status, idempotency, Bitcoin).

**Next: implement the SDK (priority #1) — Phases 1–6 in `plan.md`**, against the
decided contract, schemas tolerant, `useBackendSubmitTx` default-OFF. Backend follows.

## What Changed

(nothing yet)

## Follow-ups

- After SDK work + PR: backend implementation, pointing its `package.json` at local
  `dist/` (`pnpm build:packages`).
- Independently verify bridge re-relay idempotency before enabling `useBackendSubmitTx`
  anywhere (it ships default-OFF).
