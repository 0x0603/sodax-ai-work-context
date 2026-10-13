---
type: brief
repo: sodax-sdks
github: 
status: Active
next: fix 1.1 dstAddress (encodeRecipient) on the user's go-ahead; rest needs outside answers
updated: 2026-10-13
---

# PR 372 Tron review fixes · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- Pushed to `gcranju/sodax-sdks:feat/tron-spoke` on 2026-10-13: merge `6484af32`, fixes `94bcc241`
  and `2f40c0b2` (all signed). PR head `2f40c0b2`, `MERGEABLE`; waiting on review/CI.
- Courtesy comments: #issuecomment-6137137117 and #issuecomment-6138549112.
- Fixed: review-comment 1–4; `/code-review` 1.3, 2.5, group 3 (incl. leftover), 4.1–4.4, 4.6, 4.7.
- 1.1 now verified against the deployed Intents contract: `sendToken` passes `intent.dstAddress`
  through to `AssetManager.transfer` unpadded, so Arbitrum → Tron pays the 20-byte form. Same pass-through
  hits a cancel refund to a Tron source (`intent.srcAddress`).
- Open: 1.1 (fix ready to make), 1.2, 2.1–2.4, 4.5 (see `code-review-findings.md`).
- Questions for gcranju drafted in `author-questions.md`, NOT posted.

## Next action

On the user's go-ahead: switch intent `dstAddress` to `encodeRecipient` (`EvmSolverService.ts:129`,
`SonicSpokeService.ts:326`) and teach `reverseEncodeAddress` the 32-byte word; leave the `srcAddress`
refund case to the author. Other open items wait on the solver team (1.2, solver-side parsing of
`dstAddress`) and the MPC relay owner (2.1–2.4, 4.5).

## Settled — do not re-litigate

- Merge, not rebase. Main's entries first in every appended map, Tron after.
- Hub verify fix is parity-only (see process.md Findings) — still done, by request.
- `tronBase58ToHex` is strict: only base58check (25 bytes, `0x41`, checksum) or 21-byte `41…` hex.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the review asked for | `issue.md` | 0.4k |
| What broke in the merge and why, KATs | `process.md` | 1.0k |
| Final result | `outcome.md` | 0.5k |
| Open design questions for the author (draft, not posted) | `author-questions.md` | 0.4k |
| `/code-review` findings in 4 groups, evidence + fix order (for a fix plan) | `code-review-findings.md` | 3.5k |

## Landmines

- The PR's own description is stale in places (tron.png "still needed", swap "quote-only"); it is
  gcranju's body — don't edit it.
- Don't commit the fixes inside the merge commit by accident (`git commit -a`).
- Don't run `biome format` on `SpokeService.ts` / `SpokeService.test.ts`: it re-adds the main-drift
  reformat that 4.7 removed.
