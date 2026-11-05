---
type: brief
repo: sodax-backend
github: 1424
status: Active, in review — PR #1439 open, CI green, no reviewer yet
next: get a human reviewer on #1439; merge origin/development in before merge (10 behind on 2026-11-05)
updated: 2026-11-05
---

# GH-1424 Stellar register/users rejects SEP-53 signatures · brief

## State

- The issue is filed (Bug, High, Sprint Cherry, assigned to 0x0603).
- PR #1439 `issue/1424-stellar-register-users-rejects-sep-53` @ `739de339` → `development`. Worktree:
  hub `repos/backend/sodax-backend/.claude/worktrees/1424-stellar-register-users-rejects`.
  Changes: `chain-utils.ts` fix, `stellar-chain-utils.unit.test.ts`, a stateful-api integration spec
  `register-users-stellar.spec.ts`, one line in `claude-agents/SERVICES.md`.
- 2026-11-05: CI all green, mergeable, Codex review on `739de339`: no findings. `REVIEW_REQUIRED`, no
  reviewer requested. 10 commits behind `origin/development`.
- Root cause: `verifyStellarSignature` only accepts the old format, so SEP-53 wallets (Freighter,
  the next Hana build) get a 400 from `register/users`.
- Both reported payloads are valid SEP-53 signatures.

## Next action

Request a reviewer on #1439 (user's call who). Merge `origin/development` in before it merges.

## Settled — do not re-litigate

- The fix lives only in backend `shared-utils`. FE and wallet-sdk stay unchanged.
- Keep the old-format path, since the current Hana release still uses it.
- No Stellar SDK upgrade; 13.3.0 is enough.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Report, context, acceptance criteria | `issue.md` | 0.4k |
| Code locations, format facts, fix, test vectors | `plan.md` | 0.8k |

## Landmines

- `users.service.spec.ts` mocks `verifyStellarSignature`, so put the tests in `shared-utils`.
