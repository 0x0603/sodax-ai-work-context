---
type: brief
repo: sodax-sdks
github: 
status: Active
next: wait for answers to the open-items comment on the PR (1.4/1.4b, solver check for 1.1, 2.x)
updated: 2026-10-13
---

# PR 372 Tron review fixes · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- Pushed to `gcranju/sodax-sdks:feat/tron-spoke` (all signed): merge `6484af32`, fixes `94bcc241`,
  `2f40c0b2`, `7b1e9469`. PR head `7b1e9469`. Worktree `sodax-sdks-pr372` is clean.
- `7b1e9469`: 1.1 + 1.2 (`encodeRecipient` for swap / partner auto-swap `dstAddress`), C1–C4
  (`code-review-findings.md` § Group C). Leverage yield now settles via `spoke.settle`; Tron vault
  withdraw + `operatePosition` are refused before signing; Bitcoin relays exactly as before.
- PR comments: #issuecomment-6137137117, #issuecomment-6138549112 (courtesy), and
  #issuecomment-6144735748 — open items by severity, posted at the user's request.
- Open: 1.4 + 1.4b (Tron `srcAddress` / `originAddress` 20 bytes — one question for gcranju), solver
  check for 1.1, 2.1–2.4, DEX relay bypass, 4.5, one JSDoc. All listed in the PR comment.
- claude[bot] re-checked the table (#issuecomment-6144955938): citations hold, six claims wrong or
  overstated (process.md, last Log bullet). No reply posted.

## Next action

Wait for replies on the PR comment. Then: if gcranju says `srcAddress` should be the 32-byte word, switch
`EvmSolverService.ts:133`, `SonicSpokeService.ts:325` and `LeverageYieldService.ts:2498` together; route
2.x per the MPC relay owner's answers. Don't post more on the PR unless the user asks.

## Settled — do not re-litigate

- Merge, not rebase. Main's entries first in every appended map, Tron after.
- Hub verify fix is parity-only (see process.md Findings) — still done, by request.
- `tronBase58ToHex` is strict: only base58check (25 bytes, `0x41`, checksum) or 21-byte `41…` hex.
- Bitcoin vault withdraw (`hubWalletSwap`) relays with the JSON payload as `tx_hash` + `{ address,
  payload }`, like the backend — it works. Never switch it to the on-demand (`od:`) identity.
- `settle` outbound on an MPC chain waits for a release; only use it for messages that pay out on Tron.
- Sonic → Tron releases are hub-triggered (`AssetManager` emits `BridgeRequest`, the backend watches it);
  no Tron signature is needed. 2.1 is a status/polling gap, not a delivery gap.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the review asked for | `issue.md` | 0.4k |
| What broke in the merge and why, KATs; C-round log | `process.md` | 1.6k |
| Final result per commit | `outcome.md` | 0.8k |
| Original draft questions (superseded by the PR comment) | `author-questions.md` | 0.3k |
| All findings with evidence: groups 1–4, C, open items, fix order | `code-review-findings.md` | 6k |

## Landmines

- The PR's own description is stale in places (tron.png "still needed", swap "quote-only"); it is
  gcranju's body — don't edit it.
- Don't run `biome format` on `SpokeService.ts` / `SpokeService.test.ts`: it re-adds the main-drift
  reformat that 4.7 removed.
- `LeverageHook` source is not in the verified sonicscan bundle; claims about how it pays out rest on
  `LeveragePosition.sol` comments.
