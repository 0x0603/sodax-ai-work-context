---
type: plan
repo: builders-sodax-mcp-server
github: 118
status: Done, uncommitted in worktree -wt-118 (on 412d5ff); waiting for "commit push"
related_issues: [118, 124]
updated: 2026-11-16
---

# GH-118 · Fix plan for the 2026-11-16 /code-review of PR #124

Review of `feat/118-swap-from-non-evm` @ `412d5ff` against `feat/115-swap-from-hub` @ `827de4b`. Every finding
re-checked in code; SDK claims checked in `sodax-sdks` at tag `@sdks@2.2.0` (the version the MCP pins).
Tags: **verified** = read in code, **derived** = reasoned from code, **judgement** = a call.

## Verdicts

| # | Finding | Verdict | Do |
|---|---|---|---|
| 1 | No live asset-manager check for non-EVM sources | **Valid** (verified): `parseCatalog` keeps only EVM-shaped asset managers (`tokens.ts:178-180`), so `live` is always undefined off EVM (`quote.ts:212`). The live config names asset manager and connection for every spoke, in the packaged spelling (checked through the sodax MCP). | Fix (A) |
| 2 | Solana pin checks `to`, not the signed bytes | **Not reachable with SDK 2.2.0** (verified): Anchor 0.30.1 `new Program(idl)` takes its id from `idl.address`; `to` and the instruction's program are the same `Program.programId` (`SolanaSpokeService.ts:113,191`). Holds only while the SDK keeps it so. | Harden (B) |
| 3 | Sui `withSender` fails open | **Latent** (verified): 2.2.0 returns `from` and `data = tx.serialize()` as strings (`SuiSpokeService.ts:189-194, 258-263`), so the sender is set today; it fails open only on SDK drift. | Fix (B) |
| 4 | Sui cancel unpinned though "the SDK reads the package from chain" | **False** (verified): a cancel is `createCancelIntent` → `spoke.sendMessage`, whose connection comes from the packaged config, no chain read (`SwapService.ts:1431-1470`, `SuiSpokeService.ts:240`). `ConfigService.initialize` is a no-op in 2.2.0 and the MCP never calls it. | Harden for symmetry (B) |
| 5 | Non-EVM tx in flight reads as `source_not_found` without a quote | **Valid, narrow** (verified): `seen` is always false off EVM (`nonEvm.ts:74`), NEAR returns null while in flight (`near.ts:50`). Window (derived): Solana `finalized` ≈ 13 s, NEAR FINAL a few s; Sui/Stellar/Injective ≈ 1-6 s. | Fix (E) |
| 6 | `isDepositsIntent` treats unreadable as a mismatch | **Valid** (verified): unreadable → `messages: []` → `not_a_deposit` → error log + SWAP_MISMATCH (`cancel.ts:277-289`). | Fix (C) |
| 7 | Unreadable cancel tx reported `cancel_relayed` | **Valid, wording** (verified, `cancel.ts:137-142`). Relaying stays: the relay checks the message itself, and it's the only way a real cancel moves. Only the status overclaims. | Fix (C) |
| 8 | NEAR `failed` lost when an event is unreadable | **Partly valid** (verified, `nonEvm.ts:68`). The outcome (`unverified` + operator alert) is the conservative answer; the reviewer's `source_failed/depositHeld` would claim a deposit nobody could read. Only the information is lost. | Keep outcome, keep the fact (C) |
| 9 | `failedSource` alerts without checking the deposit against the quote | **Valid** (verified): `track.ts:361-367`, unlike the success path (`track.ts:206-211`). | Fix (D) |
| 10 | Claimed deposit no longer re-read | **Valid regression** (verified): base re-read a claimed receipt (`receipt.reverted → source_failed`); `c3234ef` dropped it for every source (`track.ts:192`). Right for non-EVM (final reads, pruning nodes), wrong for EVM (claim made from a `latest` receipt). | Fix for EVM/hub only (D) |
| 11 | Solana frame-pop regex matches `Program log: success` | **Not exploitable** (derived): program logs can only pop frames (a `msg!` line can't match the `invoke` pattern), and a forged attribution needs third-party code inside the connection's own frame, which only CPIs the system program. The parser must attribute as the relay does (`solana.ts:37`). | No change (judgement) |
| 12 | Solana `SendMessage` decode accepts trailing bytes | **Valid, trivial** (verified): Sui checks `reader.done` (`sui.ts:61`), Solana doesn't (`solana.ts:50-60`). | Fix (C) |
| 13 | `seenTx` memo blocks reads for 10 s off EVM | **Valid** (verified): a non-EVM `false` means "can't say", yet it's memoized (`track.ts:197-199`, TTL 10 s): `trackSwapWaiting` reads at 0/10/20 s instead of every 5 s. | Fix (E) |
| 14 | Global `console.*` patch is the wrong altitude | **Proposed fix doesn't apply** (verified): 2.2.0 writes with hard-coded `console.log` (`solana/utils/utils.ts:42`, `constant-utils.ts:96`), which its `logger` option never routes; no `console.dir/table` or `process.stdout` in SDK src. Stdio-only is right: HTTP mode doesn't carry JSON-RPC on stdout. | No change |
| 15 | `pinnedSourceOf` recomputed; duplicate hex parsing | **Valid cleanup** (verified): `near.ts:44`, `injective.ts:27` vs `bytes.ts`. | Do (F) |

## Changes, one commit each on `feat/118-swap-from-non-evm`

No issue refs in commit messages. Merge, never rebase.

### A. Check a non-EVM source's live asset manager and connection at quote (#1)

- `tokens.ts` `parseCatalog`: keep `assetManager` (as `swapContract`) and `connection` for every chain: EVM as now
  (address pattern, non-zero), any other family a non-empty string of bounded length.
- `quote.ts:211-213`: compare `swapContract` and, for a spoke, `connection` with the pinned ones. Equality by
  family: hex case-insensitive (`same`); Sui each `0x…` segment padded to 64 hex, lower case; anything else exact.
  A difference throws `configDisagrees(chainKey, "swapContract" | "connection")`.
- Tests (`swapQuote.test.ts`, `tokens.test.ts`, fixture `swapBackend.ts`): Solana/NEAR/Sui with another live asset
  manager or connection → SWAP_MISMATCH; Sui with dropped leading zeros passes; a config without them skips the check.

### B. Pin Solana and Sui builds by what is signed; fail closed on SDK drift (#2, #3, #4)

- `solana.ts` `callsPinned`: decode the v0 message in `data` (compact-u16 signatures, header, static keys,
  instructions). Refuse a legacy message or any address-table lookup. Every instruction's program is ComputeBudget or
  the pinned one (asset manager for the swap, connection for the cancel); the swap instruction's accounts include the
  pinned connection. Replaces the `to` comparison and the `Buffer.includes` heuristic. `ByteReader` gains `shortVec()`.
- `sui.ts` `callsPinned`: read the PTB JSON's commands. Exactly one `MoveCall`, the rest `SplitCoins`/`MergeCoins`;
  swap target = the Swaps API build's `to`, cancel target = `<pinned connection package>::<module>::send_message_ua`
  (package ids normalized with `fullAddress`).
- `sui.ts` `withSender`: throw when `from`/`data` aren't strings. `nonEvm.ts` `prepareSwap`/`cancelStep`: an
  `ActionError` passes the catch, so a finish failure is INTERNAL with an error log, not a CHAIN_UNAVAILABLE retry loop.
- Tests: hand-built v0 messages (extra program, lookup table, missing connection, legacy) and Sui JSON (other package,
  other function, two MoveCalls, no `from`). Contract tests already push live builds through `callsPinned`.

### C. Answer unreadable non-EVM txs honestly (#6, #7, #8, #12)

- `solana.ts` `sendMessageEvent`: `if (!reader.done) throw` (→ `UnreadableEvents` via `readable`).
- `UnreadableEvents` carries `failed`; `nearEvidence` computes it before decoding; `nonEvm.ts` read returns
  `{ failed, messages: [], unreadable: true }`. `track.ts` and `cancel.ts` `checkSwapTx` test `unreadable` before
  `failed`, so the answer stays `unverified`; the alert/log carries `failed`.
- `cancel.ts` `isDepositsIntent`: unreadable → `QUOTE_NOT_FOUND` with the pruned case's final nextStep (safe on the
  hub, give support the hash), warn log, no SWAP_MISMATCH.
- `cancel.ts:137`: still relay an unreadable cancel tx, but answer `cancel_relayed` with `verified: false`; `swap.ts`
  wording: the relay checks it; track the swap, and if it isn't cancelled within a few minutes, ask the user to check
  the cancel tx.
- Tests: Solana event with a trailing byte; NEAR failed + unreadable; cancel without quote of an unreadable deposit;
  unreadable cancel tx.

### D. Failed tx's held deposit checked against the quote; claimed EVM deposits re-read (#9, #10)

- `track.ts` `failedSource`: with a quote, run `checkQuoteDeposit`; `match`/`multiple_deposits` as now
  (`failed_tx_deposit`), anything else → `notThisDeposit`. Without a quote unchanged.
- `track.ts:192`: for a claimed deposit on a non-pruning source (EVM spoke, hub) with no row, re-read the receipt
  before `submitDeposit`, as base did: none → `awaiting_source_confirmation` (seen), failed → `source_failed`.
  Non-EVM keeps "the claim is its proof".
- Tests: NEAR failed tx holding another quote's deposit; claimed EVM deposit whose receipt now reverts or is gone.

### E. Tell an in-flight Solana/NEAR tx from an unknown one; memo only a node's own answer (#5, #13)

- `SourceAdapter.seen` becomes optional: absent = the node can't tell. EVM as now; Solana `getSignatureStatuses`
  (a status = seen); NEAR `viewTransactionStatus` answering at all = seen, `UnknownTransactionError` = not;
  Sui/Stellar/Injective none.
- `track.ts`: memoize only a defined answer; `seenOnChain` true only when seen. A non-EVM `source_not_found` nextStep
  adds: if it was sent under a minute ago, call again in about 15 seconds first.
- Tests: Solana processed-not-finalized without a quote → awaiting (seen); Sui unknown polled every step, not memoized.

### F. Cleanup (#15)

- `sources/index.ts`: memoize `pinnedSourceOf` per chain key (packaged config is constant).
- `near.ts`, `injective.ts`: `hex(hexBytes(…))` from `bytes.ts` instead of their own HEX regexes.

## Not changed, and why (for the PR thread if asked)

- #11: not exploitable (above); tightening alone would make the MCP attribute differently from the relay.
- #14: the SDK's own `console.log` calls bypass its logger; the stdio patch is the standard fix. An SDK change to route
  them through `logger` would let it go, nothing more.

## Outcome (2026-11-16)

Implemented A-F, then /simplify (4 agents) and /code-review; two plan decisions reversed on review:

- **#10 reverted, accepted risk.** Re-reading a claimed EVM deposit before submit made an RPC outage turn a checked
  swap into a refund, and split track from cancel (which trusts the claim). The root fix, claiming only from a
  finalized receipt, costs minutes on L1/L2 against a 15-min default deadline. A reorg that reverts a claimed deposit
  is left to submit-tx/relay refusing it, which alerts.
- **#12 reverted.** Refusing trailing bytes adds no safety (the compared fields are a prefix; a moved layout can't
  match a quote) and would stop every Solana swap if the connection appends a field. Comment left in `solana.ts`.

Changed from the plan while implementing:
- Sui builds are the v1 PTB JSON (`transactions[]`, `kind: "MoveCall"`, `target`); the SDK's `to` has no `0x` and names
  the upgraded package (`e5f0…`, config says `a17a…`). Live builds recorded in `__fixtures__/non-evm-builds.json`
  (untracked: stage it by path).
- Unreadable evidence: `unreadable?: { failed }` (marker), not `failed` on the evidence, so no check-order rule;
  `sentCancel` answers `cancel_failed` for a failed one.
- #6 answered as `not_cancellable` / `unverified` (a state, not an error); #7 as `cancel_relayed` + `unverified`.
- #9: a failed tx's held deposit still alerts `failed_tx_deposit` (public budget) whenever a held quote is named, as
  the README promises; `reason: "not this quote's"` when it doesn't bind that quote. No longer `notThisDeposit`.
- #13 reverted (third review): the 10 s unseen memo is a README contract ("at most once every 10 seconds per API
  key"), so a node that can't say is remembered as unseen too.
- #1 fails closed: a live address present but not an address is `null` in the catalog, which never agrees.
- #5: NEAR `seen` = any stage it knows, FINAL included (a tx final between read and seen isn't "not found"); a status
  without a stage isn't seen. The repeat status call is accepted (memo bounds it; transient failure is retryable).
- #15: hexText only; the `assetManagerSender` memo dropped (microseconds, module state). Injective keeps its no-`0x`
  hex rule (mirror the relay).
- Sui: a build in another format than v1 JSON is INTERNAL ("shape this server doesn't read"), not SWAP_MISMATCH.

Skipped on the third review: a third Sui id normalizer (`sameConfigAddress` fails closed on a format change; a shared
lowercasing one would be unsafe for base58), relaying a readable cancel when the deposit is unreadable without a quote
(was SWAP_MISMATCH before), NEAR failed+unreadable cancel as `cancel_failed` (same as a readable failed one).

Fourth review (user-run): fixed a failing status call failing the track (`seen` now "can't say"), Sui pin also checks
the packaged state objects, `notThisQuote` on a held deposit that isn't the quote's (agent asks for the right hash),
EVM zero address = none given, `unseen` wording for Solana/NEAR, README (live config check, Sui/cancel pins,
`unverified` cancel states, `seenOnChain` by family). Skipped repeats and reversals of earlier rounds (one alert per
tx by design, stage-less NEAR status, unreadable marker shape, normalizer reuse, NEAR repeat status call).

Lesson: two reversals (#10, #13) came from changing behaviour before checking the README's stated contracts; the
review never returns zero findings and later rounds contradict earlier ones, so stop once what's left is judgement.

Results: checkTs, biome, build, unit 1267/1267, contract 48/48. Not run: Docker E2E, real non-EVM swaps.

## Done when

tsc, biome, unit, build, contract tests (live canary builds for all five families) green; real-tx fixtures still
match; then /simplify, /code-review, fix, retest. Push only on the user's "commit push"; PR body gets one line on the
review fixes. No `docs/kb/` in this repo (hub rule `kb.md`): note it in the report.
