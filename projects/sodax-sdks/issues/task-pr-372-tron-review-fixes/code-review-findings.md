---
type: findings
repo: sodax-sdks
github: 
tags: [tron, mpc-relay, settle, review]
updated: 2026-10-13
---

# PR 372 — `/code-review` findings, grouped for a fix plan

Source: `/code-review` run on worktree `sodax-sdks-pr372` (2026-10-13), after merging `origin/main`
and applying the review-comment fixes. 15 findings. Every one was checked against code and is
**present at the PR head `e8fb0c75` (gcranju)** — none came from the merge or from our fixes.

Line numbers are for the merged tree (branch `pr-372-tron-spoke`). Verification levels:

- **Code-verified** — the code does what the finding says; read and cited.
- **Behaviour unverified** — the code path is real, but the on-chain / relay / solver outcome needs
  someone who owns that system. Do not "fix" these blind.

Status legend: **OPEN** · **FIXED (ours, in the fix commit)**.

Shared background for groups 1–2 (the PR's own statements, both code-verified):

- `encodeRecipient` (`packages/sdk/src/shared/utils/shared-utils.ts:162`, doc at :154-160): a hub
  release reads its recipient from `data[0..32]` as `12 zero bytes ‖ 20-byte hash`; for an MPC-relay
  chain the 20-byte identity from `encodeAddress` must be left-padded, or the recipient mis-decodes.
- `MoneyMarketService.test.ts:1542-1545` (and :2026): "The bare form is still accepted on-chain, so
  getting this wrong delivers funds to a dead address."
- `encodeRecipient` is used only in MM borrow/withdraw (`MoneyMarketService.ts:844`, `:1024`),
  bridge (`BridgeService.ts:942`) and recovery (`RecoveryService.ts:200`).
- Settlement routing: `SpokeService.settle` (`SpokeService.ts:1336`) picks the MPC path with
  `getMpcRelayService(chainKey)` (`:1340`) where `chainKey` is always the **source** chain the caller
  passes. Inbound MPC → `waitForDeposit` (resolves on `minted`/`swept`, `MpcRelayApiService.ts:214`);
  outbound MPC → `waitForWithdrawal` (resolves only on `released` or `failed`,
  `MpcRelayApiService.ts:261`); everything else → `verifyTxHash` + `relayTxAndWaitPacket` (`:1369`).

---

## Group 1 — possible loss of funds (Tron recipient encoded as the bare 20-byte identity)

Root cause in common: a hub-side payout to a Tron recipient built with `encodeAddress` instead of
`encodeRecipient`. Severity hinges on one question only the contracts/solver team can answer:
**does the path below end in `AssetManager.transfer` with this exact byte string as `to`, or does
something on the hub/solver re-encode it?**

### 1.1 Swap intents to Tron — OPEN (code-verified; behaviour unverified)

- `packages/sdk/src/shared/services/spoke/SonicSpokeService.ts:326` and
  `packages/sdk/src/swap/EvmSolverService.ts:129`:
  `dstAddress: encodeAddress(createIntentParams.dstChainKey, dstAddress)` → 20-byte identity for Tron.
- Reachable today: `stagingSwapSupportedTokens[TRON]` lists TRX + USDT (`packages/types/src/swap/swap.ts`);
  staging runs against mainnet chains, so funds are real.
- Scenario: staging swap Arbitrum USDC → Tron USDT. If the fill pays out via
  `AssetManager.transfer(…, intent.dstAddress, …)`, the release reads a 20-byte value as a 32-byte
  word and pays a different/dead address.
- Fix direction: switch both call sites to `encodeRecipient` **only after** confirming (a) the
  Intents contract passes `dstAddress` through unchanged, and (b) the solver/backend do not parse
  `intent.dstAddress` assuming the 20-byte form (they may also use it for display, matching or
  status). Changing it blind can break fills instead of fixing them. Interim option: drop Tron from
  `stagingSwapSupportedTokens` until confirmed.
- Tests to add: swap intent for a Tron destination encodes the 32-byte word (mirror the MM test at
  `MoneyMarketService.test.ts:1541`).

### 1.2 Partner fee auto-swap to Tron — OPEN (code-verified; behaviour unverified)

- `packages/sdk/src/partner/PartnerFeeClaimService.ts:379`: `setAutoSwapPreferences` stores
  `encodeAddress(params.dstChainKey, params.dstAddress)`.
- Scenario: partner sets auto-swap output to Tron USDT; every later payout uses the stored 20-byte
  destination. Persisted on-chain, so a wrong value keeps mis-delivering until reset.
- Fix direction: same question as 1.1 (ProtocolIntents → intent → payout); then `encodeRecipient`.
  Also check how already-stored Tron preferences would be read back (`reverseEncodeAddress` expects
  the identity form — `shared-utils.ts` TRON case uses `tronHashToBase58`, which accepts both 20- and
  21-byte input but not a 32-byte word).

### 1.3 `apps/node/src/tron.ts` mainnet harness — FIXED in `2f40c0b2` (`encodeRecipient`, as `MoneyMarketService.ts:844/:1024`)

- `apps/node/src/tron.ts:122-123`: `buildBorrowData` / `buildWithdrawData` get
  `tronIdentityBytes(recipient)` (bare identity) while `MoneyMarketService` now passes
  `encodeRecipient(...)`. Per the PR's own MM test comment, the bare form is accepted on-chain and
  pays a dead address.
- Scenario: `pnpm tsx src/tron.ts withdraw --amount-trx 3` signs a real withdrawal to the wrong
  recipient.
- Fix direction: use `encodeRecipient(TRON, recipient)` (public, via the `@sodax/sdk` barrel) or call
  `sodax.moneyMarket.withdraw/borrow` instead of hand-building. Low effort, but `apps/node` is dead
  code that does not typecheck (see memory `sdks-apps-node-is-dead-code`) — fix or delete the
  `withdraw`/`borrow` subcommands; don't leave a funds-moving script known to be wrong.

---

## Group 2 — wrong status / timeouts (funds arrive, SDK reports failure)

All stem from `settle()` choosing the mechanism from the source chain only, plus intent-relay
assumptions outside `settle()`. Mostly **behaviour unverified** — need the MPC relay owner.

### 2.1 Hub-sourced legs to Tron go to the intent relay — OPEN

- MM borrow/withdraw from Sonic with `dstChainKey: tron`: `needsSettlement` is true
  (`MoneyMarketService.ts:765`, `:942`) → `settle({ chainKey: srcChainKey /* sonic */, direction: 'outbound' })`
  (`:774`, `:954`) → `verifyTxHash` + `relayTxAndWaitPacket` (`SpokeService.ts:1369`).
- Bridge Sonic → Tron: `BridgeService.ts:576` always calls `settle({ chainKey: params.srcChainKey, direction: 'inbound' })`.
- The intent relay does not serve Tron (the `RelayChainIdMap` Tron entry exists only to keep the
  map total, `packages/types/src/chains/chains.ts` comment above the entry), so the wait ends in
  `RELAY_TIMEOUT` → `MM_RELAY_TIMEOUT` / bridge relay error, while the MPC relay may already have
  released the TRX.
- Unverified: how a hub→Tron payout is picked up (does the MPC relay watch the hub, and what record
  id does it expose?). Without that id there is nothing for the SDK to poll.
- Fix direction: `settle` needs the destination too (e.g. `dstChainKey` in `SettleParams`), and a
  "hub → MPC chain" branch that waits on the MPC relay record for the hub tx — or returns success
  after hub verification with an explicit "release pending" state. Design decision for the author.

### 2.2 Tron-sourced borrow/withdraw delivered to a non-Tron chain — OPEN

- `MoneyMarketService` passes `chainKey: srcChainKey` (tron) + `direction: 'outbound'` →
  `waitForWithdrawal` (`SpokeService.ts:1352`), which resolves only on `released` (`MpcRelayApiService.ts:261`).
  Ladder: `submitted → burned → attested → released | failed` (`MpcRelayApiService.ts:90-91`).
- Scenario: `moneyMarket.borrow({ srcChainKey: 'tron', dstChainKey: 'sonic' | '0xa4b1.arbitrum' })`.
  The hub executes the borrow; if nothing is released on Tron the record never reaches `released`,
  the 300 s floor (`TRON_SETTLEMENT_FLOOR_MS`) expires → `MM_RELAY_TIMEOUT` for a borrow that worked.
- Unverified: which terminal status the relay assigns when the payload has no Tron release.
- Fix direction: ask the relay owner for the terminal state of a "no release" withdrawal; resolve
  on that (likely the hub-execution status) when the destination is not the MPC chain itself.

### 2.3 `hubMint ?? tx` fallback hands a Tron txID to swap post-execution — OPEN (code-verified)

- `SpokeService.ts:1348`: `dstChainTxHash: settled.value.txs?.hubMint?.hash ?? tx` (same pattern for
  `release` at `:1356`).
- `SwapService.ts:807` uses it as `dstIntentTxHash`, then `postExecution({ intent_tx_hash })`.
- Scenario: deposit record reaches `minted`/`swept` without `txs.hubMint` → a bare Tron txID (no
  `0x`) is cast to the hub intent tx → solver can't find the intent; the swap fails after funds minted.
- Unverified: whether `minted` always carries `txs.hubMint`.
- Fix direction: treat a missing `hubMint` on a minted record as an error (or keep polling) instead
  of falling back to the source id; at least never feed a non-hub hash to `postExecution`.

### 2.4 Cancel and detailed status still use the intent relay — OPEN (code-verified)

- Cancel: `SwapService.ts:1535` `relayTxAndWaitPacket({ ...buildCancelRelayIdentity(...), chainKey: srcChainKey })`.
  For a Tron source, `createCancelIntent` → `TronSpokeService.sendMessage` returns an MPC
  `trackingId`, which is then submitted to the intent relay → cancel reported as failed.
  (The PR's own pre-merge cancel also used the intent relay; main's version kept that.)
- Detailed status: `SwapService.ts:530` and `BridgeService.ts:1035` `resolveDeliveredPacket(...)` —
  a Tron source never has an intent-relay packet.
- Fix direction: route cancel through `settle({ direction: 'outbound' })`; give detailed status an
  MPC branch (deposit/withdrawal record → status). Note cancel is only reachable for staging swaps.

### 2.5 Backend submit-tx path is chain-unaware — FIXED in `2f40c0b2` (swap + bridge skip it for MPC sources)

- Default on: `ConfigService.ts:503` / `:507` (`?? true`, already the default before the PR).
- `SwapService.ts:718` and `BridgeService.ts:521` hand the Tron tx to `/submit-tx` before the
  client-side `settle()` fallback.
- Scenario: Tron → Sonic bridge with default config: the backend can't relay a Tron tx through the
  intent relay; the whole backend attempt budget is spent before the MPC deposit wait starts →
  multi-minute delay or timeout.
- Fix direction: skip the backend path for `isMpcRelayChainKey(srcChainKey)` (go straight to
  `settle`), unless the backend team adds MPC support to `/submit-tx`. Cheap, low risk.
- **Severity correction (verified 2026-10-13, sodax-backend `origin/main` 41327c64):** the scenario
  above overstated today's cost. `SubmitTxDto.srcChainKey` is `@IsIn(Object.values(CHAIN_KEYS))` from
  the SDK the backend ships with, which has no Tron yet, so the backend answers 400 at once and the SDK
  falls back after one wasted request. It becomes the stall described above only once the backend
  bumps to an SDK that includes Tron. The backend has no MPC code at all.
- Done: `SwapService` / `BridgeService` gate `useBackendSubmitTx && !isMpcRelayChainKey(src)`; SWAPS.md,
  BRIDGE.md and the skills Tron row say so. `LeverageYieldService` left alone: its client fallback
  calls `relayTxAndWaitPacket` directly, so a Tron-source vault swap is broken with or without it.

---

## Group 3 — wallet-sdk-react `TronXService` (same bugs the SDK had) — FIXED

- Was `packages/wallet-sdk-react/src/xchains/tron/TronXService.ts`: `tronToHex` did
  `BigInt(B58.indexOf(c))` (invalid char → `-1`) and no checksum/length check; `getBalance` parsed
  any `constant_result` (a revert with reason → huge garbage balance in the UI).
- Fixed in our fix commit: strict base58check / 21-byte hex `tronToHex` (viem byte helpers, no
  `Buffer`), and the read requires `result.result === true` + a 64-hex word; failures still show `0n`
  per the method's documented `@warning`. New `TronXService.test.ts` (9 tests; 4 fail on old code).
- Related, also fixed: `TronSpokeService.getDeposit` had the same silent-`0n`/garbage read.
- Leftover, FIXED in `2f40c0b2`: `estimateTrc20Energy` returned `energy_used ?? 0`. Live TronGrid
  (2026-10-13): missing contract → `CONTRACT_VALIDATE_ERROR`, no `energy_used` (was reported as 0);
  revert → `result: { result: true, message: 'REVERT opcode executed' }` with `energy_used` 8624, the
  energy burned up to the revert, while a real USDT transfer simulates at ~130k. Now throws unless
  `result.result === true`, no `message`, and a numeric `energy_used`.

---

## Group 4 — docs and code quality

| # | Finding | Where | Status |
|---|---|---|---|
| 4.1 | `MpcRelayChainConfig` doc named nonexistent `isMpcRelayChainConfig`, said "no hardcoded list" | `packages/types/src/chains/chains.ts` (doc above `MpcRelayChainConfig`) | FIXED |
| 4.2 | `settle()` JSDoc stacked on private `getMpcRelayService` | `SpokeService.ts` | FIXED |
| 4.3 | `to: params.dstAddress as Hex` — unchecked cast of caller input, then hashed into the signed withdraw-auth | `TronSpokeService.ts:421` | FIXED in `2f40c0b2` — `isAddress` throws before signing. Why it matters: the digest is an unframed concat with variable-length `data` after `to`, so `to` must be 20 bytes; EVM's `dstAddress` is ABI `bytes` (length-prefixed) and needs no such check. Defense-in-depth, not a live bug: 14 SDK callers pass a contract-read hub wallet; only swap cancel (`intent.creator`, caller-supplied) or a direct `spoke.sendMessage` caller can pass a bad one. Whether the relay rejects one is unknown (no relay source available) |
| 4.4 | `estimateGas` runs the TRC-20 energy call and the tx build sequentially | `TronSpokeService.ts:379` | FIXED in `2f40c0b2` — `Promise.all`; test asserts both node calls are in flight together |
| 4.5 | `waitForDeposit` re-POSTs `/notify` every 6 s for the whole wait, even after the record left `pending` | `TronSpokeService.ts:313-318` | OPEN — tried an `onStatus` hook that stopped re-notifying past `pending`, then REVERTED before commit: it changes relay interaction on a settlement path on an unverified assumption, adds public API to an exported function, and saves only idempotent POSTs. Needs the relay owner to confirm `/notify` is useless past `pending` |
| 4.6 | 3-line inline comments (repo rule: 1 line, 2 max) | `chains.ts` `RelayChainIdMap` Tron entry; `MoneyMarketService.test.ts` (3 places); `apps/node/src/tron.ts` (2) | FIXED in `2f40c0b2` — all 6 added `//` runs of 3+ lines in the PR diff cut to 1–2 lines; the chains.ts one also dropped its false "settle routes MPC chains away" claim (see 2.1) |
| 4.7 | Unrelated reformatting (approveTx cast ~`SpokeService.ts:360`, `isNoteworthy` ~`:489`, `it.each` + `requestTrustline` spy in `SpokeService.test.ts`) | `SpokeService.ts`, `SpokeService.test.ts` | FIXED in `2f40c0b2` — `SpokeService.test.ts` is byte-identical to main again (the PR's only change to it was formatting); the 2 `SpokeService.ts` hunks restored to main's form. Both were Biome output over main's format drift: `biome format` on those files recreates them, so don't run it there |

---

## Suggested order for a fix plan

1. **Ask first** (blocks 1.1, 1.2, 2.1, 2.2, 2.3): contracts/solver team on intent `dstAddress`
   handling for MPC chains; MPC relay owner on hub→Tron pickup, "no release" terminal status, and
   whether `minted` always has `hubMint`. Draft questions: `author-questions.md`.
2. ~~Safe now, no external input: 2.5, 1.3, 4.3, 4.4.~~ Done in `2f40c0b2`.
3. **Interim guard if 1.1 can't be answered before release:** remove Tron from staging swap tokens.
4. **After answers:** 1.1/1.2 encoding switch + tests; `settle` destination-aware design (2.1, 2.2);
   cancel/status MPC branches (2.4); 2.3 fallback.
5. Group 4 done in `2f40c0b2` except 4.5 (reverted; needs the relay owner).
