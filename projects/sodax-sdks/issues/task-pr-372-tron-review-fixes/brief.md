---
type: brief
repo: sodax-sdks
github: 
status: Active
next: PR #534 head 5d2d118a (+ uncommitted submitHubDelivery). Mainnet run complete (T1-T5, T4b, B1-B2, E1-E2, S1-S2, R1-R4), results in PR comment 6604137581. Found+fixed this session: Tron-to-spoke bridge status ended at hub mint (dstChainKey), Tron wallet provider lost on page reload (sign-time eth_requestAccounts), backend 400 on tron status read (backendRelaysBridge). Open: user to test unlock prompt + optional EVM MM smoke; follow-up issue drafts in session scratchpad (server watcher for 2nd leg, BE Tron submit-tx, relay fee quote, solver TRX route, LY from Tron, L2 2-gwei priority fee). Backend keeper/watcher is the BE/relay team's call; discussed on Discord 2026-11-04.
updated: 2026-11-04
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
- 2026-10-28 head `bdda76d4`: gcranju fixed Q1 (srcAddress/originAddress → `encodeRecipient`), memo
  recompute, node-built tx check. That made our cancel-refusal reason false. Q2/Q3 open, reserve warn-only.
- 2026-11-02: no author activity since 10-27. Chain evidence (`chain-evidence-2026-11-02.md`): 2.1/2.2
  SDK outcomes are certain, 1.4 refund stuck on chain (accepted, unreleased feature), relay fee
  undocumented → docs note pushed as `2b2ebc6d`.
- 2026-11-02: design pass at `2b2ebc6d` appended to #issuecomment-6569347015 as rows 6–10, trimmed to the
  before-merge contract fixes (raw contract, trackingId typed as tx hash, `encodeRecipient` keyed on MPC
  membership, provider signs txID unchecked) plus 10: shape raw output + a relay-agnostic submit/status
  seam so the Swaps/Bridge API can add Tron later with no Tron-specific flow (user's ask). The backend
  (`development`) has no MPC handling yet; both API clients lack a `TRON` raw-tx schema.
- 2026-11-02: design re-check at `0f6f792d` (not posted). Rows 6–9 untouched. Row 10 half done:
  `spoke.getHubRelease` is the status read, but the only release trigger is the blocking
  `settleHubRelease`. New: the swap
  `getSolvedIntentPacket` returns a filler `PacketData`, and the `mpcRelay` status arm holds a deposit or
  a release record; `AssetService.withdraw`/`SwapService` route the Tron leg outside `settle`. CI red
  since `a3ef535d` on the sdk size-check (1,106,880 B > 1,102,729 B).
- 2026-11-02: structure-safe fixes pushed onto `feat/tron-mpc-integration` as `665a215e` (on `0f6f792d`,
  from worktree `repos/client/sodax-sdks-wt-534-fix`, removable; signed, hook green): row 9
  (raw-key `signTransaction` signs `sha256(raw_data_hex)`, refuses a mismatched txID; README, docs mirror,
  skills note), orphaned `missingFarSideHash` JSDoc, `getSolvedIntentPacket` 300 s floor doc. sdk 3302 +
  wallet-sdk-core 191 tests, checkTs, check:ai, docs gates green. Rows 6–8, 10 and the filler packet left
  for gcranju (contract/design calls). wt-534 untouched: its demo dev server is running.
- 2026-11-02: bridge to/from Tron needs the app open until `/notify` (backend submit-tx skipped for MPC
  chains). gcranju: bridge moves to the solver (same-token swap), so ignore it in #534. Filed #594,
  which the user closed 2026-11-02; don't reference it on #534.
- 2026-11-02: relay source now readable (hub `repos/offchain/MPC-relay`). Code confirms: no hub watcher,
  fee taken in the hub verifier and fee ≥ amount is dropped silently, recipient = payload `to` (32 bytes),
  Tron deposits never `swept`. Details: `chain-evidence-2026-11-02.md`, last section.

- 2026-11-02: row 6 implemented on `665a215e` in worktree `repos/client/sodax-sdks-wt-534`, uncommitted. Raw deposit
  returns the checked node-built transfer (`TronRawTransaction` = unsigned tx shape), raw `sendMessage` returns
  `TronRawWithdraw` { message: `MpcWithdrawMessage`, digest, scheme }, new `spoke.tron.submitSignedWithdraw`,
  `estimateGas` reads the raw tx. Gates green (checkTs 15/15, sdk 3313, types 1197, wallet-sdk-core 191, check:ai,
  docs). Then, after a pasted 3-P2 review: per-operation raw types (`TronDepositReturnType`, `TronSendMessageReturnType`,
  explicit `<true>` like EvmSpokeService tests), required `raw_data` (`TronRawData`), `spoke.tron.extendExpiration`,
  wallet `signAndSendTransaction` (broadcasthex, all signatures), txID check in `signTransaction` for both modes,
  digest/scheme check in `submitSignedWithdraw`. Expiry guards were tried and dropped: the node rejects an expired
  tx, and a local-clock guard could refuse valid deposits. Pushed 2026-11-03 as `8814cb6a` (sdk/types) +
  `fa8c419a` (wallet-sdk-core + docs), signed, hooks green; no PR comment (user rule).

## Next action

2026-11-03 latest code review: **one P2 remains** — MM borrow minimum checks gross amount,
while the payout is net of partner fee. Reproduced 3.1 USDT -> 2.79 USDT accepted against a 3 USDT floor.
See `local-design-review-2026-11-03.md` for evidence and gates; no SDK edits by this review.

2026-11-03 scope revision: keep explicit raw generics; conditional feature results preserve old-chain
TxHashPair. Investigate manual/automatic refund and legacy 20-byte intents before merge. Bridge MPC
status and DEX Asset routing already exist at fa8c419a; 4.5 is retry optimization, not missing notify.
See `plan-remaining-tron-contracts.md` for the revised sequence and remaining evidence gaps.

2026-11-02 design proposal: see [`plan-remaining-tron-contracts.md`](plan-remaining-tron-contracts.md).
Rows 7/10/11 share submission/delivery contracts; row 8 and the payout floor can be fixed separately.
LY remains blocked by routing/status/resume work. No SDK implementation in this planning pass.

2026-11-03: the three findings in [`raw-review-2026-11-02.md`](raw-review-2026-11-02.md) are addressed and
pushed as `8814cb6a` + `fa8c419a` (state line above). Not yet run on mainnet: re-run T1 and one raw deposit
through `signAndSendTransaction` on that head before relying on it.

2026-11-02, end of day (latest): **gcranju's fix landed; run T2–T5 on the current head.**
- Head = `665a215e` (our row-9 commit) on top of gcranju's `0f6f792d`. On another machine: in the hub,
  `git -C repos/client/sodax-sdks worktree add ../sodax-sdks-wt-534 feat/tron-mpc-integration` (or pull
  an existing one), then `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages`, demo from `apps/demo`.
- T2–T5 results are not in #issuecomment-6569638398 yet (last edit 05:23Z); fill them in there.
- Design comment #issuecomment-6569347015 updated 2026-11-02 13:24Z at `665a215e`: Status column on both
  tables, row 1 withdrawn, 2/3 fixed pending T2/T4, 4 warn-only (open), 9 fixed, 10 half done, new row 11
  (filler `PacketData`). Open: 4, 6, 7, 8, 10, 11. The user takes these on (not waiting for gcranju).
- CI red only on the sdk size-check (gcranju's growth; baseline is a maintainer call). Never comment
  on the PR after pushing; report pushes in chat only (user rule).

Earlier (2026-11-02): **waiting on gcranju's fix, then resume testing.** gcranju confirmed hub → Tron
goes through the MPC relay, not `get_transaction_packets`. The relay already tracks it at
`GET /deposit/146-0x<hub tx>-<BridgeRequest logIndex>`: success = `txs.release.hash` present (status
stays `submitted`); skipped/unknown = `pending` with empty `txs` (no failure signal); id needs the
`0x`. So the 2.1 fix is SDK-only (settle routes a hub source by destination), no refusal needed.
Mainnet test plan #issuecomment-6569638398: T1 passed and is filled in; T2–T5 wait for the fix.
Issues table #issuecomment-6569347015 (reserve warn-only, 2.1, 2.2, below-fee, fee). Demo runs from
worktree `repos/client/sodax-sdks-wt-534` (branch `feat/tron-mpc-integration`); pull + rebuild
after gcranju pushes. Earlier state:

Findings are posted on #534 (#issuecomment-6432900564), including "port the #372 fixes". The docs
and skills #534 lacked are pushed onto `feat/tron-mpc-integration` as `f4e3af0e` (process.md, last
entry); main merged in as `c678c649`; the fixes in `plan-pr534-fixes.md` are pushed as `e6c3d6a3`.
Open owner questions posted (#issuecomment-6436894146): wait for answers before touching 1.4/1.4b,
2.1/2.2, 4.5. #541 still has no plan label. Reserve/memo trust items go through AuditMap if the user
wants. Don't post again unless asked.

## Settled — do not re-litigate

- Merge, not rebase. Main's entries first in every appended map, Tron after.
- Hub verify fix is parity-only (see process.md Findings) — still done, by request.
- `tronBase58ToHex` is strict: only base58check (25 bytes, `0x41`, checksum) or 21-byte `41…` hex.
- Bitcoin vault withdraw (`hubWalletSwap`) relays with the JSON payload as `tx_hash` + `{ address,
  payload }`, like the backend — it works. Never switch it to the on-demand (`od:`) identity.
- `settle` outbound on an MPC chain waits for a release; only use it for messages that pay out on Tron.
- Sonic → Tron releases are hub-triggered (`AssetManager` emits `BridgeRequest`, the backend watches it);
  no Tron signature is needed. Delivery is verified on chain only for solver fills; a user-originated
  hub → Tron tx has never run, so its delivery is unverified (`chain-evidence-2026-11-02.md`).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Latest remaining-design code review and reproduced borrow guard bug | `local-design-review-2026-11-03.md` | 0.6k |
| Proposed approach for remaining design rows, raw inference and LY | `plan-remaining-tron-contracts.md` | 1.5k |
| Latest local raw-mode review, findings and gate results | `raw-review-2026-11-02.md` | 0.8k |
| What the review asked for | `issue.md` | 0.4k |
| What broke in the merge and why, KATs; C-round log | `process.md` | 1.6k |
| Final result per commit | `outcome.md` | 0.8k |
| Original draft questions (superseded by the PR comment) | `author-questions.md` | 0.3k |
| All findings with evidence: groups 1–4, C, open items, fix order | `code-review-findings.md` | 6k |
| #534 fix plan: what is fixed how, what waits for an owner | `plan-pr534-fixes.md` | 1.6k |
| What chain data and the relay code (MPC-relay `cbc10dd`) prove about deposits, releases, fee, 1.4 | `chain-evidence-2026-11-02.md` | 1.6k |

## Landmines

- The PR's own description is stale in places (tron.png "still needed", swap "quote-only"); it is
  gcranju's body — don't edit it.
- Don't run `biome format` on `SpokeService.ts` / `SpokeService.test.ts`: it re-adds the main-drift
  reformat that 4.7 removed.
- `LeverageHook` source is not in the verified sonicscan bundle; claims about how it pays out rest on
  `LeveragePosition.sol` comments.
