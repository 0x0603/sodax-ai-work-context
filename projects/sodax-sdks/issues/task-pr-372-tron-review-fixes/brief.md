---
type: brief
repo: sodax-sdks
github: 
status: Active
next: user decides how to get the #372 fixes into #534 (cherry-pick by gcranju, or re-review after)
updated: 2026-10-27
---

# PR 372 Tron review fixes · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- #372 closed unmerged 2026-10-16; superseded by #534 (`gosodax:feat/tron-mpc-integration`, head
  reviewed `a9a8736c`). Our fixes `94bcc241`, `2f40c0b2`, `7b1e9469` (on `gcranju:feat/tron-spoke`) are NOT in it.
- In #534 the author re-did only 1.1 and the strict address check; 1.2, 1.3, 2.5, Group 3, C1–C4,
  4.1/4.2/4.6 and the `TronSpokeService` checks are back to pre-fix code (process.md, 2026-10-27 entry).
- Still open: 1.4/1.4b, 2.1–2.4, DEX relay bypass, 4.5. No author reply to #issuecomment-6144735748.
- New in #534: reserve warn-only, memo not recomputed, RPC tx bytes signed unchecked (raw key),
  MPC timeouts mapped to `RELAY_FAILED`/`UNKNOWN`.
- Bot review on #534 (#issuecomment-6416633757): six findings, all hold against the code. Docs
  pass: two pages made false, raw Tron deposit recipe wrong, skills/READMEs not updated (process.md).

## Next action

The user decides how the #372 fixes get into #534 (ask gcranju to cherry-pick the three commits, or
re-review after he re-does them). Then route 2.x and 1.4/1.4b per the MPC relay owner's and
gcranju's answers. Don't post on either PR unless the user asks.

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
