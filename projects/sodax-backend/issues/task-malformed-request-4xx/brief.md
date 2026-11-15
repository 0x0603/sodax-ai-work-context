---
type: brief
repo: sodax-backend
github:
status: Active
next: restore the stash, open a sodax-backend issue, commit and PR against development (all on the user's word)
tags: [swaps-api, bridge-api, leverage-yield, error-handling, validation]
updated: 2026-11-15
---

# Malformed request 4xx · brief

## State in five lines

Code done, tests green, **parked in a git stash, not committed**. Nothing pushed, no issue, no PR.
Branch `fix/submit-tx-intent-required` (off `origin/development`) in the worktree
`sodax-backend/.claude/worktrees/submit-tx-intent-required`; working tree is clean because of the stash.
Stash SHA `f8fd0e0ce40608a6b5ba2a214494ea032697d205`, message
`submit-tx-intent-required: 400/404 for malformed swaps/bridge/leverage requests (2026-11-15)`.
Last run: swaps-api 662 unit / 493 e2e, bridge-api 189 unit / 137 e2e, tsc and biome lint clean.

## Next action

1. In the worktree: `git stash apply f8fd0e0ce40608a6b5ba2a214494ea032697d205` (apply by SHA, never
   `pop`: the stash stack is shared with other worktrees). Drop it by its current `stash@{n}`, found by
   message, once the tree is confirmed whole.
2. Rebuild `packages/shared-dtos` (apps read its `dist`), rerun the suites.
3. When the user asks: `create-issue` in sodax-backend, commit (stage files by name), PR to `development`
   linking the issue. File list and PR notes: `outcome.md`.

## Settled — do not re-litigate

- Address checks run in the services on intent-building paths, not in DTOs: allowance/check and approve
  share the DTOs and never encode dstAddress (placeholders there must stay 200).
- The check is the SDK's own `encodeAddress`, so no false rejects; 400 text is plain, no format hints
  (the user objected to helping spammers).
- Hub-tx pre-check: 3 reads × 2s timeout, 1s apart; no receipt → 404. Only "No intent found" maps to 404;
  an SDK receipt-wait timeout stays 502 at ERROR (a hub RPC fault should page).
- SodaxError 400s (VALIDATION_FAILED, USER_REJECTED) log at WARN; INTENT_CREATION_FAILED stays ERROR.
- Bitcoin sources are validated too (Radfi TRADING mode puts srcAddress into a URL path).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The prod errors and why they paged | `issue.md` | 0.6k |
| Design, trade-offs, what was accepted and why | `plan.md` | 1.4k |
| Code-review triage, gotchas hit while testing | `process.md` | 1.0k |
| Changed files, test counts, PR body notes, follow-ups | `outcome.md` | 0.9k |

## Landmines

- The stash lives only in this machine's local hub clone (stashes are never pushed). On the other
  machine the code does not exist; rebuild from `plan.md` + `outcome.md` or push a WIP branch first.
- One biome organizeImports error in `apps/swaps-api/test/unit/swaps.service.spec.ts` is pre-existing
  (HEAD has it too); not ours.
- submit-tx e2e tests share a 10/min throttle bucket; new tests set their own `x-real-ip`.
