---
type: outcome
repo: sodax-backend
github:
status: Not started — design agreed, nothing implemented
updated: 2026-07-31
---

# Outcome

- PR:
- Commits:
- Tests:

## Summary

Design and inventory only (2026-07-31). No code written.

## What Changed

Nothing in either repo yet.

## Follow-ups

1. ✅ Filed as [sodax-sdks#330](https://github.com/icon-project/sodax-sdks/issues/330) (2026-07-31).
2. Ask the Bound team the one blocking question: does the HMAC pair authenticate `/auth/*`
   server-to-server, or only `/sodax/*`? (`plan.md` step 1.)
3. Extract `packages/bound/` in sodax-backend — pure move, unblocked by (2).
4. Rotate `BOUND_API_SECRET_KEY` / `BOUND_API_SECRET_WORD` before production; they were
   pasted in plaintext into Discord (test credentials, but the log is permanent).
