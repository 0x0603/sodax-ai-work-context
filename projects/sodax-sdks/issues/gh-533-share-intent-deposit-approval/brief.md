---
type: brief
repo: sodax-sdks
github: 533
status: Active — issue created 2026-10-16, no code; after #512 merges
next: extract a neutral helper next to `swap/intentDepositSpender.ts`; both services wrap errors their own way
related_issues: [gh-507, gh-505]
updated: 2026-10-16
---

# GH-533 Share intent-deposit approval (swap ↔ leverage yield) · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Keep it under ~80 lines. It is a router plus the current state — not a summary of
the other files. If a section here starts explaining something, that explanation
belongs in `plan.md` or a knowledge note, and this file should link to it.

## State in five lines

Issue #533 created 2026-10-16 from R0bi7's review 5539657046 on #512 (finding 5). The duplication is ours: added in
`6ed8448e` (#512) per gh-507 plan decision #5 / B3 ("mirror SwapService.ts:1239-1448"); `70acf35f` extracted only
`intentDepositSpender`. On main the demo approved LY deposits through `useSwapAllowance`/`useSwapApprove`.

## Blocked on

1. #512 merged and the user's mainnet bridge/LY test done first (it touches swap's released approve path).

## Next action

Diff `LeverageYieldService.ts` `isDepositAllowanceValid`/`buildDepositApproveTxs`/`approveDeposit` against
`SwapService.ts` `isAllowanceValid`/`approve`/`buildApproveTxs`, note every error-wrapping difference, then extract.

## Settled — do not re-litigate

1. Not a `SwapService` dependency in LY (services don't call each other; `feature: 'swap'` mislabel).
2. No public API change; existing swap + LY tests pass unchanged.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What and why | `issue.md` | 0.3k |
| Design (empty) | `plan.md` |  |
|  | `process.md` (index) |  |
|  | `outcome.md` |  |

<!-- ~tok ≈ bytes / 3800. Refresh with:
     for f in *.md; do printf "%5.1fk  %s\n" \
       "$(echo "scale=2; $(wc -c <"$f")/3800" | bc)" "$f"; done -->

## Landmines

- LY's wallet-provider check uses `leverageYieldInvariant` (LY SodaxError); swap's uses plain `invariant`. A naive
  shared helper changes LY's error for a wrong provider — keep provider checks or pass an assert in.
