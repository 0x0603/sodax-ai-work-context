---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, dapp-kit, lifecycle]
---

# dapp-kit flows — deep dive (feasibility, complexity, benefit)

1. dk-2 is feasible and mostly additive, but its SDK prerequisite is bigger than the first pass said. 32 post-broadcast error exits outside #509 drop `srcTxHash` (MM 8, staking 6, migration 6, DEX 6, LY positions 2, partner 2, swap cancel 2), plus 2 in the LY positions hub branch. #534's `spoke.settle` rewrites the MM sites. The 8 DEX and swap-cancel exits change error shape when fixed, so that part is 3.0.
2. A public relay read already exists. It is low-level, needs no key (probe) and sodax-backend uses it. What is missing: the hash on errors, a named settlement read with a hook, and a way to get the hash before the relay wait. Resuming after a closed tab is an open decision that touches decision 0003.
3. The demand is real. sodax-frontend uses 14 of the target hooks (MM, staking, migration, DEX) behind hand-rolled step machines. Its timeout copy tells users to "check the explorer", but it has no hash to link. LY (#532) has no downstream consumer.
4. dk-4 is additive in 2.x, and an optional `walletProvider` stays type-compatible (probe on a stand-in params type, TS 5.5.4 and 5.9.3). The one type delta is that `vars.walletProvider` turns optional in callbacks (0 consumer reads). With today's wallet-sdk-react it needs a nestable wallet-source provider, not a `SodaxProvider` prop, and it must snapshot the wallet per attempt.
5. For dk-7, presets are small (46 sites, 8 distinct intervals), but they break `check-ai-consistency.py` unless it learns the preset table. "Execution mode" already exists as `*.useBackendSubmitTx`, and #529 decided against a lane option on the lifecycle hook, so the modes half has an incorrect premise.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| dk-2 | Feasible with caveats / Code-traced | C4 | B3 (B4 only if sodax-frontend adopts; unverified) | 2.x; the DEX and swap-cancel error change (8 exits) and the DEX lifecycle in 3.0 | The swap core is mostly generic, but 32 error exits lose the hash and #534/#540 must land first |
| dk-4 | Feasible with caveats / Proven (typing probe on a stand-in type), Code-traced (trees) | C3 | B2 | 2.x | Optional wallet vars compile backward-compatibly; 63 hook files; must nest inside the wallet tree unless wsr-1 ships a headless wallets object |
| dk-7 | Presets: Feasible with caveats; modes: Premise incorrect / Code-traced | C2 (presets only) | B2 presets / B1 modes | 2.x presets after dk-3; Drop modes | The modes already exist (config switch; hook family per lane) |

## dk-2 · Lifecycle hooks for the remaining multi-step flows
**Bullet:** "Extend lifecycle hooks to the remaining multi-step flows, using shared progress and recovery conventions"  ·  **T-ids:** T18.1–T18.7

### Today

**Flow inventory** [verified, sodax-sdks `0181a053`]. Line numbers below are in `packages/sdk/src`.

Only swap has a lifecycle: `useSwapLifecycle`, at `packages/dapp-kit/src/hooks/swap/useSwapLifecycle.ts:85-212`. The only progress events are the API-lane approve hooks' `onProgress` (`utils/approvalPlan.ts:36-48`).

The last column counts the distinct target hooks found in sodax-frontend (fe, `1b915ec7`) and intents-whitelabel (wl, `5e1fbba`): a hook counts when `git grep -lw <hook> origin/main` finds a file. It is not a file count (fe files: MM 2, staking 3, migration 1, DEX 3).

| Flow (method:line) | Steps after signing | Status read by src tx | srcTxHash kept on post-broadcast errors? | fe/wl use |
| --- | --- | --- | --- | --- |
| Swap SDK lane: `SwapService.swap` :746 / `swapWithApproval` :861 | backend submit-tx :1292 (default), else verify → relay :1226 → postExecution | `getDetailedStatus` :522 | yes: `txCtx` :1211; batch resume :1083 | wl `useSwap` |
| Swap cancel: `cancelIntent` :1948 | verify → relay | — | **no**: raw returns :1962, :1975 | 0/0 |
| Swaps API lane: `SwapsApiService.createIntent` :268 → app signs → `submitTx` :380 → `getSubmitTxStatus` :389 | backend relays | submit-tx status | n/a: the app holds the hash before submitting | fe (4 hooks) |
| Bridge: `bridge` :498 | submit-tx :636, else verify → relay :585 | `getDetailedStatus` :1014 | **no** (:582, :601); #509 fixes | wl `useBridge` |
| LY vault: `vaultSwap` :1231 | submit-tx :1399, else verify → relay → notify | `getDetailedStatus` :1681 | **no** (:1328, :1347, :1357); #509 fixes | 0/0 |
| LY positions: `openPosition` :3223, `operatePosition` :3538, `runLeveragePositionOperation` :3510 | `settleHubWalletMessage` :3617: verify → relay | `useLeveragePositionPending` (slot read every 15 s) | **no** (:3624, :3661; hub branch also drops it, see below); not in #509 | 0/0 |
| MM: `supply` :531, `borrow` :754, `withdraw` :961, `repay` :1169 | verify → relay to hub; the hub→spoke delivery leg is not awaited (:778-818) | none | **no**: 8 exits (verify 551/774/982/1188; relay 574/802/1012/1211) | fe 2, wl 4 |
| Staking: `stake` :398, `unstake` :589, `instantUnstake` :759, `claim` :947, `cancelUnstake` :1142 | verify (stake only) → relay | none | **no**: 6 (421; 437/615/785/973/1168) | fe 5 |
| Migration: `migratebnUSD` :529, `migrateIcxToSoda` :646, `revertMigrateSodaToIcx` :720, `migrateBaln` :794 | relay; bnUSD also waits for destination execution :586 | none | **no**: 6 (558; 573/595/671/747/819) | fe 2 |
| DEX: `AssetService.deposit` :494, `withdraw` :535; CL `supplyLiquidity` :730, `increaseLiquidity` :800, `decreaseLiquidity` :870, `claimRewards` :1094 | relay, no verify | none | **no**: the raw packet `Error` is returned ×6 (Asset 509/550; CL 755/825/895/1119) | fe 5 |
| Partner: `PartnerFeeClaimService.swap` :668 | hub tx → receipt :684 → postExecution :697 | — | **no** (:692, :705) | 0/0 |
| Recovery: `withdrawHubAsset` :187 | `spoke.sendMessage` :223 and return; **no relay submit, no wait** | none | n/a | 0/0 |
| Bitcoin trading setup (Radfi hooks, `useBitcoinTradingSetup`) | off-relay setup steps | n/a | n/a | wl |

- **How the counts were made.**
  - `scratchpad/deep-dk-flows/postbroadcast.py` lists every `verifyFailed(` and `mapRelayFailure(` call with its context. Outside swap, 0 calls carry `srcTxHash` in their context. The script also flags `LeverageYieldService.ts:3645`, but there the hash is only in the message text.
  - The raw returns were found with `rg -n "return (packet|packetResult|verifyTxHashResult)\s*;"`.
- **Not in the 32: the LY positions hub branch** [verified]. A hub-origin revert returns `verifyFailed` with the hash only in its message (`LeverageYieldService.ts:3645`). A `waitForTransactionReceipt` throw (:3638) reaches the callers' catch (:3350-3352, :3604-3606) as `executionFailed` with `phase: 'intentCreation'` and no hash. Counting these, LY positions has 4 exits.
- **The research-d claim was wrong.** It said "relay failures already carry srcTxHash" (`MoneyMarketService.ts:564`). Line 564 is the relay *input*, not the error context [verified].

**Recovery today: an end user closes the tab, or the relay wait times out.**

- **Funds are not lost on-chain** [verified + judgement].
  - The SDK submits to the relay before the bounded wait (`IntentRelayApiService.ts:515-550`), so after a `RELAY_TIMEOUT` the relayer still holds the packet.
  - The loss is in tracking and UX.
- **Between broadcast and relay submit**, the SDK's own model says the tx "would otherwise sit unrelayed" (`IntentRelayApiService.ts:163-166`). A backend comment says the relayer picks up a hub-origin tx "unprompted" (sodax-backend@985959e9 `apps/bridge-api/src/tasks/submit-bridge-txs/submit-bridge-txs.task.ts:300`), which suggests a spoke-origin tx needs a submit [judgement].
- **The window is small on some chains.** `verifyTxHash` returns at once for EVM, ICON, Injective and Bitcoin, and waits for a receipt on Solana, NEAR, Stellar, Sui and Stacks (`shared/services/spoke/SpokeService.ts:1230-1260`).
  - So the broadcast→submit window is about one HTTP call on EVM, ICON, Injective and Bitcoin, and up to a receipt wait on the other five [verified].
  - Solana and Bitcoin also need the off-chain `relayData` to re-submit (`IntentRelayApiService.ts:526-538`). The SDK does not persist it.
- **Public reads exist, but they are low-level** [verified].
  - `getTransactionPackets`, `submitTransaction` and `waitUntilIntentExecuted` are public from the root: `shared/services/intentRelay/index.ts:1`, `shared/services/index.ts:3`, `shared/index.ts:4` and `index.ts:2`. `getIntentRelayChainId` comes from `@sodax/types` (`types/src/utils/utils.ts:203`), re-exported at `index.ts:15`.
  - The endpoint is a public field: `sodax.moneyMarket.relayerApiEndpoint` (`MoneyMarketService.ts:226`); also `SwapService.ts:316`, `MigrationService.ts:129` and `dex/AssetService.ts:105`.
  - The read needs no key. **Probe:** one POST `get_transaction_packets` to `https://api.sodax.com/v1/relay` with a dummy Arbitrum hash. It returned `404 {"success": false, "message": "requested packet not found"}` in 2.3 s (re-run 2026-10-19: the same 404 in 1.2 s). The SDK sends no key on relay calls (`IntentRelayApiService.ts:205-209`). **Probe scope:** one unknown hash; it does not show a real packet coming back.
  - sodax-backend uses it in production: 3 imports of `getTransactionPackets` and 2 of `getIntentRelayChainId` (`scratchpad/deep-dk-flows/imports.py` over `origin/development`).
  - `sodax.bridge.getDetailedStatus` falls through to a feature-agnostic relay read (`BridgeService.ts:1037-1059`). It could serve MM or staking, but that use is not intended or documented.
  - `resolveDeliveredPacket` is internal (`backendApi/detailedStatusRouting.ts:19-22, 70`).
- **No dapp-kit hook reads relay status** for MM, staking, migration or DEX, and none re-submits [verified].
- **Hand-rolled lifecycles in the consumers** [verified]:
  - sodax-frontend has 4 step enums: `STAKE_STEP`, `UNSTAKE_STEP`, `DEPOSIT_STEP` and `SUPPLY_STEP` (`git grep "enum .*STEP\|const .*_STEP\s*="`).
  - Its DEX claim races a 15 s timeout against a relay wait of up to 120 s: sodax-frontend@1b915ec7 `apps/web/app/(apps)/pool/_components/manage-dialog/manage-position-dialog.tsx:106,387-402`.
  - On a timeout it tells the user to "check your wallet or the explorer before retrying", but it has no hash to link (`apps/web/lib/wallet-error.ts:87-90,185-190`).
  - DEX supply is two relayed SDK calls with a hand-rolled account snapshot (`supply-dialog-footer.tsx:66-99,294,374`). That snapshot is the fix for audit POOL-M-1 (frontend #1559).
  - No pending hash is persisted: `swap-store.ts:146-150` saves only tokens and slippage. A `git grep` over `apps/web` for `persist(`, `partialize` and `localStorage`/`sessionStorage.setItem` finds no hash writes.
  - intents-whitelabel@5e1fbba hand-rolls an 8-state bridge flow (`src/hooks/use-bridge.ts:11-83`) and an in-memory pending-intent context (`src/providers/pending-swap-provider.tsx`, 35 lines).
- **The SDK docs give advice callers cannot follow from the error alone** [verified]:
  - `packages/sdk/docs/MONEY_MARKET.md:739-740` says to "persist ... and retry" or to "check on-chain status before retrying".
  - `DEX.md:640-643` says to "keep polling ... not resubmit".
  - None of these errors carries the hash.

**Design inputs** [verified]:

- **`utils/swapLifecycle.ts` (183 lines)** is pure.
  - The state union (:38-48), the attempt reducer (`toSwapAttempt`/`toFinishedAttempt`, :103-136) and the resolver (`resolveSwapLifecycle`, :138-172) are generic in logic.
  - The swap-specific parts are `isSameIntent` (:84-101), the `CreateIntentParams`/`SwapWithApprovalResponse` attempt source, the `SwapStatusSummary` input, the `SwapApprovalStrategy` payload and `fillTxHash` [judgement: about 70% reusable].
  - It reads the hash from `error.context.srcTxHash` (:125-129), so every flow needs the SDK fix first.
- **Decision 0003** keeps progress local to dapp-kit. It says to revisit "if the SDK's signed approve path ever emits progress" (`projects/sodax-sdks/decisions/0003-progress-reporting-vocabulary.md`, Consequences).
- **gh-302 settled #9:** dapp-kit stores nothing. Its scope is the declined account-upgrade choice; applying it to pending hashes is [judgement].
- **#529 settled #1:** a separate hook, not a lane option on `useSwapLifecycle`.
- **#540** (R0bi7, assigned to the user) adds `*WithApproval` and approval-strategy reads for bridge, MM (supply, repay), staking, DEX deposit and migration, on one shared helper (#540 requirement 4). That this is #511's `shared/utils/approvalBatch.ts` is [judgement].
- **#534** (`!`, open, head `ecbdeddc`) replaces MM's relay with `spoke.settle({ chainKey, tx, direction, relayData })`.
  - It moves only 6 of the 24 `relayTxAndWaitPacket` calls onto `settle`: MM (4), the swap fallback and bridge (`gh pr view 534 --json files`; `rg "relayTxAndWaitPacket\("`). Staking, migration, DEX, LY and swap cancel still call the relay directly.
  - Its private `mapSettlementFailure` still passes no hash.
  - The settlement key can be an MPC tracking id for Tron (`scratchpad/deep-dk-flows/pr534.diff`, `spoke-types.ts`).
  - Bitcoin on-demand MM uses the `od:<hash>` poll id as the source identifier (`MoneyMarketService.ts:810-818`).

### Change

**SDK, from → to:**
- **Hash on every error:** every post-broadcast exit carries `context.srcTxHash`, set to the relay source id (spoke hash, `od:` id, or MPC id after #534). DEX and swap cancel go through `mapRelayFailure`.
- **Settlement read:** add a public, typed read keyed by `{ srcChainKey, srcTxHash }` over the intent relay, and over the MPC relay after #534.

**dapp-kit, from → to:**
- **Shared core:** one lifecycle core extracted from `swapLifecycle.ts`, with `resumeFrom` (`{ srcChainKey, srcTxHash }` starts in `pending`; `{ batchId, … }` starts in `unconfirmed`).
- **Hooks:** a `useSettlementStatus` hook, plus per-flow lifecycles for MM, staking, migration and DEX on #540's `*WithApproval`.

```tsx
// Before (sodax-frontend stake-dialog-footer.tsx:127-146 pattern)
const walletProvider = useWalletProvider({ xChainId: chainKey });
try {
  const { srcChainTxHash } = await stake({ params, walletProvider: walletProvider as any });
} catch (e) { onError(getWalletErrorMessage(e, { title: 'Stake Failed' })); } // RELAY_TIMEOUT: no hash, "Failed"

// After (names illustrative)
const lc = useStakingLifecycle({ action: 'stake', params, srcWalletProvider: walletProvider, chainSwitch });
// lc.state.kind: idle | checking | needsChainSwitch | ready | submitting | pending | unconfirmed | settled | failed
{lc.state.kind === 'pending' && <TxLink chain={lc.state.srcChainKey} hash={lc.state.srcTxHash} />}
// after a reload, from a key the app persisted itself (dapp-kit stores nothing):
useStakingLifecycle({ ...rest, resumeFrom: { srcChainKey, srcTxHash } });
```

```ts
// Node / P3
const r = await sodax.moneyMarket.supply({ params, walletProvider });
if (!r.ok && isSodaxError(r.error) && r.error.context?.srcTxHash) { /* poll the settlement read; never resend */ }
```

### Feasibility — Feasible with caveats · Code-traced

**Traced:**
- The resolver is pure, and the gates, chain switch and `externalBlocked` (which the Bitcoin setup plugs into) are already inputs (`useSwapLifecycle.ts:39-41`).
- The relay read is shared by every relaying flow (`IntentRelayApiService.ts:382-422`).
- The per-site SDK fix is small; #509 did 5 hash sites (plus 2 swap `dstTxHash` edits) for +38/−18 production lines.

No prototype of the generic core was run.

**Decisions, with my call:**
- **D1. Which flows.** MM and staking first: sodax-frontend has 7 hooks there and whitelabel 4 MM. Then migration. Then DEX, which needs a two-leg design: deposit → supply leaves a stranded state between the legs (POOL-M-1).
  - Skip partner, recovery, LY positions (it has `useLeveragePositionPending`) and Bitcoin setup: 0 downstream use, or no relay wait.
- **D2. Resume after a closed tab during the in-SDK relay wait.** The hash arrives only at the end, or on an error. Options:
  - (A) An SDK `onBroadcast` callback. That is close to 0003's revisit trigger, which names the signed approve path.
  - (B) The lifecycle drives `create*Intent` and then `settle` itself. No SDK event, but it duplicates the orchestration.
  - (C) No change.

  **My call:** (C) plus `resumeFrom` now. It covers timeouts in an open tab and keys the app persisted. Reconsider (A) once every relaying flow goes through `spoke.settle`. #534 moves only 6 of the 24 relay calls there, so it alone does not make a single emit point.
- **D3. What the key means.** Keep the name `srcTxHash`, matching the success value `srcChainTxHash: pollTxHash ?? tx`. Document it as the relay source id.
- **D4. Two-leg flows.** MM borrow/withdraw to a spoke, and DEX deposit→supply. In v1, `settled` means hub execution, which is the SDK's current return point. The delivery leg comes later.

**Blockers.** These are ordering, not feasibility:
- #534 for the MM sites and the settlement seam;
- #523 for `detailedStatusRouting.ts`;
- #509 for the same LY file;
- #540 for approval strategies;
- #531, inside which the core should be extracted.

### Complexity — C4

| PR | Scope | Prod LOC | Tests | After |
| --- | --- | --- | --- | --- |
| 1 sdk | Hash on 32 exits (24 additive in 2.x; DEX and cancel through `mapRelayFailure`, 8 exits, in 3.0); MM/STAKING/MIGRATION/DEX docs + skills | ~170–250 [derived: 5–8 added lines/site × 32; #509 added 38 lines over 5 hash sites and 2 swap edits] | ~350 | #509; #534 for the MM sites |
| 2 sdk | Public settlement-status read (intent + MPC relay) | ~100–150 | ~150 | #523, #534 |
| 3 dapp-kit | Generic core from `swapLifecycle.ts`; swap as an instance (its tests unchanged); `resumeFrom` | ~250 (mostly moved) | ~200 | #529; with #531 |
| 4 dapp-kit | `useSettlementStatus` with the not-found budget | ~80 | ~120 | PR 2 |
| 5–8 dapp-kit + demo | MM, staking, migration and DEX lifecycles, each with a demo page as first consumer | ~150–250 each | ~250–350 each | PR 3/4, #540; DEX also after PR 1's 3.0 part |

- **Totals** [derived]: production ≈1.2–1.7k LOC (170–250 + 100–150 + 250 + 80 + 4 × 150–250) and tests ≈1.8–2.2k (350 + 150 + 200 + 120 + 4 × 250–350). The LOC for PRs 2–8 are [judgement]. Calibration: #504's dapp-kit production was +511 LOC for one lifecycle plus `*WithApproval` (`git show --numstat 5ee56ff8`).
- **Breaking:** none in 2.x, except DEX and swap-cancel relay errors, which change from a plain `Error(message=code)` to a `SodaxError`.
  - `DEX.md:608-643` already tells callers to check `isSodaxError` first, but code that follows it sees its relay branch stop being reached (`DEX.md:643-644`).
  - `message` changes from the relay code to prose (`errors/relay-error-mapping.ts:58-63`), and `RELAY_ERROR_CODES` is documented as a public contract (`IntentRelayApiService.ts:484-488`).
  - The frontend's matcher also reads `code` (`wallet-error.ts:127`), so sodax-frontend keeps working.
  - Because it is a break, this part (8 exits) and the DEX lifecycle that reads it are timed 3.0.
- **C4, not C5** [judgement]: risk 2 below is the rubric's C5 trigger (fund paths), but the "never resend while it may still land" invariant already exists (`swapLifecycle.ts:103-118`) and is reused, not invented.
- **Risks:**
  1. Merge churn across 5 open items on the same files: #509, #523, #534 (`!`), #540 and #531.
  2. A core bug that re-enables the action while an attempt may still land would bring back double supply/borrow/stake on fund-moving paths. The same goes for re-resolving the wallet mid-flow (POOL-M-1).
- **Versus the earlier points:** T18.1–T18.7 = 25 points (2 + 3 + 2 + 5 + 5 + 3 + 5, research-d). The hash extension (~3 points) was unpointed. With #540 supplying `*WithApproval`, T18.4–T18.7 look closer to 3 points each than 5 [judgement].

### Benefit — B3

**Standalone B3** [judgement on evidence]: it removes a recurring class of post-broadcast tracking bugs. The search ran `gh issue list -R icon-project/sodax-sdks --search <srcTxHash | "relay timeout" | lifecycle | post-broadcast | unconfirmed> --state all` and took the union:
- 12 issues in all;
- 3 in this class: #489 (an external report of a lost Bitcoin payment hash), #506 (filed as feat) and #520;
- 3 lifecycle asks: #529, #531 and #540. #532 is a fourth; the search missed it because its title has no separate "lifecycle" word.

Other evidence:
- **sodax-frontend:** #800, a status poll that never stops (open), and audit #1559 POOL-M-1 and SWAP-L-1.
- **git history:** 786 commits at `0181a053`. `git log --oneline | grep -ciE "lifecycle|srcTxHash"` gives 1 (#504). The first pass's "3 hits" used an elided pattern, and adding `timeout` gives 3 with 2 unrelated hits. "This class is recent" is [judgement].

**Combined B4** [judgement], only if #540 lands and sodax-frontend adopts the hooks (unverified, see Not verified):
- the swap lifecycle's invariant, "never resend while it may still land", covers every flow that app uses;
- hand-rolled step machines are no longer needed.

**Per persona:**
- **End users** of sodax.com Save, Stake, Pool and Migrate, and of whitelabel MM. After a relay timeout (default 120 s, `types/src/common/constants.ts:5`) they see a "Failed" title with no link today [verified: `wallet-error.ts:185-190`], and a retry is a second deposit, borrow or stake [judgement].
  - With dk-2 they get a pending state with a link and completion detection.
  - Not covered without D2(A/B): a closed tab before submit on non-EVM sources.
  - How often this happens is unmeasured (see Not verified).
- **P1/P2** [verified counts]:
  - sodax-frontend: 14 distinct target hooks, 4 step enums and 1 hand-rolled race.
  - whitelabel: 6 relay-waiting hooks and an 8-state bridge flow.
  - P2 also gets the Stellar and NEAR destination gates. whitelabel already calls dapp-kit's NEAR gate for borrow and withdraw, and hand-rolls the Stellar trustline (`src/lib/stellar-utils`).
- **P3:** the hash on errors plus a typed read replace hand-rolled relay reads. The backend has 3 `getTransactionPackets` imports.
- **P4:** none. The API lane is already step-wise.
- **P5:** one core instead of up to 8 copies (#529/#531/#532 plus 4–5 here). #532 says the 2 existing copies already drift.
- **P6:** one state union to teach.

### Recommendation

- **Timing:** 2.x. Ship PR 1's 24 additive exits as a 2.x fix (a real issue today); the MM part waits for #534. The DEX and swap-cancel error change (8 exits) and the DEX lifecycle that depends on it go in 3.0.
- **Hooks:** gate them on #540 and on sodax-frontend's intent to adopt.
- **Wording:** "Lifecycle hooks for money market, staking, migration and DEX on one shared core, with srcTxHash on every post-broadcast error and a public settlement-status read"

### Corrections to earlier research

- **Hash drops undercounted.** First pass "MM, staking, migration and DEX drop srcTxHash on relay errors" → 32 exits. They include verify errors (6: MM 4, staking 1, migration 1), LY positions (2, not in #509), partner (2) and `SwapService.cancelIntent` (2, raw errors). The LY positions hub branch adds 2 more.
- **The public read exists.** First pass "needs a public relay-status read" and research-d "no public read by (srcChainKey, srcTxHash)" → a low-level, keyless read exists and production code uses it. What is missing is a named read, a hook, and the hash.
- **The hook point moved.** Research-d T18.1 hangs off `resolveDeliveredPacket`. After #534 the seam is `SpokeService.settle` for MM, the swap fallback and bridge, and the key may be an `od:` or MPC id.
- **The demand case is stronger than the demo.** Research-d rested T18.4–T18.7 on "demo as first consumer". sodax-frontend is a production consumer of exactly these flows, while #532 (LY) has 0 downstream.
- **New finding: recovery does not submit to the relay.** `RecoveryService.withdrawHubAsset` sends the message and returns (`RecoveryService.ts:223-229`); neither it nor the spoke services call a relay submit (`grep submitTransaction|relayTxAndWaitPacket`). `RECOVERY.md:105` says it "relays". Whether the relayer picks the message up without a submit is unverified.

## dk-4 · Wallets from context
**Bullet:** "Resolve wallets from context by default, with explicit overrides and support for app-provided wallets"  ·  **T-ids:** T22.1–T22.4, T3.7

### Today

**How hooks get wallets** [verified]:
- `SodaxContext` holds only `sodax` (`packages/dapp-kit/src/contexts/index.ts:4-8`), and `SodaxProvider` takes only `config` (`providers/SodaxProvider.tsx:5-27`).
- `walletProvider` is required whenever `raw` is false, through `WalletProviderSlot` (`types/src/common/common.ts:432-434`, used at :446-451).

**Hook counts** (`scratchpad/deep-dk-flows/wpcount.py`, comments stripped). 63 hook files take or pass a wallet. The script prints 54 mutation / 5 query / 4 other; `useSwapLifecycle` is moved to the composites by hand:
- **53 mutation hooks** take it in their variables: 42 via the SDK exec params (`raw: false` spread) and 11 directly. 52 require it; it is optional only in `leverageYield/useApproveLeveragePositionFunding.ts:15`.
- **5 query hooks** take `params.walletProvider`.
- **5 composites:** `useSwapLifecycle`, the Stellar and NEAR gates, `useBitcoinTradingSetup` and `useRadfiSession`.
- **9 more files mention it in comments only.** The staking, DEX and migration allowance reads use `raw: true`.

**Consumer counts** (`git grep -ow walletProvider` / `-o "useWalletProvider("` / `-o "walletProvider as any"`):

| Consumer | `walletProvider` tokens | `useWalletProvider(` calls | `as any` casts |
| --- | --- | --- | --- |
| sodax-frontend | 109 in 14 files | 13 (2 for destinations) | 23 in 9 MM/staking/DEX files |
| whitelabel | 61 | 10 | 1 by the command; 2 with `useWalletProvider(...) as any` (`swap-confirm.tsx:60`) |
| demo | 182 | 28 | — |
| skills | 627 mentions in 117 files (`git grep -ow walletProvider HEAD -- packages/skills`) | — | — |

**Downstream reads:** 0 consumer callbacks read `vars.walletProvider`; there is 1 internal read (`hooks/shared/useEstablishTrustline.ts:56`).

**Provider trees** [verified]:
- **sodax-frontend:** `SodaxProvider > SodaxWalletProvider > children` (`apps/web/providers/wallet-providers.tsx:10-11`).
- **whitelabel:** `SodaxProvider > QueryClientProvider > dynamic(WalletProviderWrapper, { ssr: false })` (`src/providers/app-providers.tsx:16-19,56-66`).
- So a source can only be read *inside* the wallet tree, below `SodaxProvider`.

**App-provided wallets:** 0 `new (Evm|Solana|…)WalletProvider(` calls in sodax-frontend or whitelabel. The only ones are server scripts in sodax-sdks `apps/node` (23 files) and `apps/node-cjs` (1) [verified].

**Package deps:** dapp-kit's only `@sodax` dependency is `@sodax/sdk` (it also depends on `viem`); wallet-sdk-react depends on `types`, `wallet-sdk-core` and `libs`. Neither imports the other; each names the other only in comments [verified, package.json and grep].

### Change

**From → to:**
- **Contract:** `WalletProviderSource { getWalletProvider(key); subscribe(onChange) }` in `@sodax/types` (plan-v3-order §2, item 6).
- **dapp-kit:** a nestable `WalletSourceProvider` and an internal resolver. The explicit argument wins, then the source by `params.srcChainKey` (or the destination key for the gates), then `SodaxError('VALIDATION_FAILED', { field: 'walletProvider' })`.
- **wallet-sdk-react:** `useWalletProviderSource()`.
- **App-provided wallets:** any object that implements the contract.

```tsx
// Before
<SodaxProvider config={c}><SodaxWalletProvider config={w}>{children}</SodaxWalletProvider></SodaxProvider>
const walletProvider = useWalletProvider({ xChainId: chainKey });
await supply({ params, walletProvider: walletProvider as any });
// After
<SodaxProvider config={c}><SodaxWalletProvider config={w}><SodaxWallets>{children}</SodaxWallets></SodaxWalletProvider></SodaxProvider>
// SodaxWallets = ({children}) => <WalletSourceProvider source={useWalletProviderSource()}>{children}</WalletSourceProvider>
await supply({ params });                 // resolved from params.srcChainKey
await supply({ params, walletProvider }); // explicit still wins
```

### Feasibility — Feasible with caveats · Proven (typing probe on a stand-in type), Code-traced (trees)

**Type probe** (`scratchpad/deep-dk-flows/probe-dk4/probe.ts`). It passed on TS 5.5.4, the repo pin (`pnpm-workspace.yaml:37`), and on TS 5.9.3, both taken from `sodax-sdks-t2probe` read-only.

It built vars as `Omit<Action,'walletProvider'> & { walletProvider?: … }` over the real `SpokeExecActionParams` and `GetWalletProviderType` from the `@sodax/types` dist. It confirmed:
1. today's values still compile, for a generic `K` too;
2. leaving the wallet out compiles;
3. an ICON provider for an Arbitrum source is still rejected;
4. reading `v.walletProvider` becomes possibly-undefined;
5. the resolver types correctly.

**Probe scope:** a stand-in params type, one chain key and generic `K`. It did not cover the real hooks. Item 5 holds only through an `as VarsToday<K>` cast in the probe. Re-run 2026-10-19: exit 0 on both TS versions.

**Design choice, with my call:**
- **(a) A `wallets=` prop on `SodaxProvider`:** neither app's tree fits it with today's hook-only wallet-sdk-react. It would fit if wsr-1 ships the headless `createSodaxWallets()` object (plan-v3-order §12, T3.8), made outside React and passed to both providers [judgement].
- **(b) A nestable provider plus a wallet-sdk-react hook:** fits both trees with a 3-line app bridge. **Choose (b).**
- **(c) A global-symbol shared context:** zero config, but implicit and fragile across duplicate copies. Reject.

**Caveats:**
- The lifecycles must snapshot the wallet at the start of an attempt (POOL-M-1).
- The wallet-sdk-react hook must read whatever store wsr-1 introduces.
- New hooks from #511, #512, #540 and #529/#531/#532 should be born with optional wallets.

**2.x vs 3.0:** all of it is additive in 2.x. Nothing is required in 3.0. The one type delta is that `vars.walletProvider` turns optional in mutation callbacks: 0 reads in sodax-frontend, whitelabel and the demo, 1 internal read (`useEstablishTrustline.ts:56`). A wrapper that resolves the wallet before the inner `mutate` would keep callback vars unchanged [judgement, not probed].

### Complexity — C3

**PRs:**
1. Types + dapp-kit provider and resolver: ~120 prod LOC, ~150 test.
2. wallet-sdk-react source hook: ~30 prod, ~60 test.
3. 63 hook files at ~3–6 LOC each: ~190–380 prod [derived: 63 × 3–6], plus one table-driven test (~200).
4. Docs, skills (the integration pages, not all 117 files) and demo adoption.

**Shape of the work:** about 340–530 prod LOC [derived: 120 + 30 + 190–380] across about 65 files. That is a package-wide mechanical change with no runtime break. The per-PR LOC are [judgement].

**Risks:**
1. Wallet re-resolution mid-flow.
2. An empty source during reconnect or SSR. Read hooks stay disabled; mutations fail clearly.

**Versus the earlier points:** T22.1 + T22.2 + T22.3 + T3.7 = 9 points, consistent with C3.

### Benefit — B2

- **P1/P2:**
  - sodax-frontend drops 13 lookups and 23 `as any` casts [verified: all 23 are `walletProvider: walletProvider as any` hook arguments]. That they hide wrong-chain mistakes from TypeScript is [judgement].
  - whitelabel drops up to 10 lookups. Its 2 casts also feed non-hook calls (`waitForTransactionReceipt`, the Stellar trustline), so they may stay [judgement].
  - P2 gains more: destination wallets also resolve by key.
- **P3/P4:** none; this is React-only.
- **P5:** the demo has 182 tokens and 28 calls.
- **P6:** the shortest correct snippet shrinks. Skills carry 627 mentions [judgement on the benefit].
- **Combined with dk-2:** lifecycle hooks lose their `src/dstWalletProvider` params.

### Recommendation

- **Timing:** 2.x.
- **Wording:** "Resolve wallets from a nestable wallet-source context by default (wallet-sdk-react or app-provided); an explicit walletProvider always wins"

### Corrections to earlier research

- **Hook count:** research-d "~70 hook files (44 + 26)" → 63 by a comment-stripped count. The 9 extra are comment-only.
- **Call counts:** research-d "12 / 9 useWalletProvider" → 13 / 10. It also did not count the 23 casts.
- **Compatibility, confirmed:** "callers that keep passing walletProvider are unaffected" now holds by probe.

## dk-7 · Polling presets and SDK/API execution modes
**Bullet:** "Add polling presets and explicit SDK/API execution modes for flows that support both"  ·  **T-ids:** T35.1, T35.2

### Today

**Polling** [verified]. `rg -n "refetchInterval" packages/dapp-kit/src --glob '!**/*.test.ts*'` finds 52 lines; 6 are comments. That leaves **46 code sites in 46 files**:
- 32 numeric literals;
- 3 module constants;
- 2 `false`;
- 9 functions.

| Interval | Sites |
| --- | --- |
| 5 s | 13 literals + 2 constants |
| 10 s | 4 |
| 30 s | 4 |
| 60 s | 4 |
| 2 s | 2 literals + 1 constant |
| 3 s | 2 |
| 15 s | 2 |
| 1 s | 1 |

**Inconsistencies:**
- Allowance reads poll at 2 s (swap, bridge, migration) or at 5 s (MM, DEX, staking, partner).
- Status polls at 3 s on the SDK lane (`STATUS_POLL_MS`, `hooks/shared/notFoundStreak.ts:16`; budget 40 polls = 120 s) and at 1 s on the API lane (`useSwapsApiStatus.ts:47`, `useSwapsApiSubmitTxStatus.ts:58`).

**Per-call override** (script check, `scratchpad/wf-verify-dk-flows/override_check.py`): all 46 sites spread the caller's `queryOptions` after their own interval, and none let the hook win. So per-call override exists; a global one does not [verified].

**`check-ai-consistency.py`:**
- Its regex reads numeric literals only (`packages/skills/scripts/check-ai-consistency.py:28`).
- Run read-only, it sees 30 hooks and checks 18 doc claims (17 + 1).
- With identifiers instead of literals it finds 0 and exits 2 (`:153-155`).

**Execution paths** [verified]:

| Feature | Client relay | Backend submit-tx (default) | API lane (server-built tx) |
| --- | --- | --- | --- |
| Swap | `fallbackSwapSteps` `SwapService.ts:1203` → `SwapResponse` | `submitTx` :1292 → same `SwapResponse`; falls back on any non-success (:1182-1190) | `SwapsApiService` :268/:380/:389 → `CreateIntentResponseV2`, `SubmitTxResponseV2`, `SubmitTxStatusResponseV2` |
| Bridge | `fallbackBridgeSteps` `BridgeService.ts:569` → `TxHashPair` | `submitTx` :636 → `TxHashPair` | `BridgeApiService` :278/:295/:307 |
| LY vault | `fallbackVaultSwapSteps` :1313 → `VaultSwapResponse` | `submitTx` :1399 → same | `LeverageYieldApiService` :534/:756/:773 |

- **The settlement switch already exists.** `swaps.useBackendSubmitTx`, `bridge.useBackendSubmitTx` and `leverageYield.useBackendSubmitTx` default to `true` (`shared/config/ConfigService.ts:503,507,515`), and the demo exposes them as toggles (`apps/demo/src/providers.tsx:151-157`).
- **No consumer sets the switch:** `git grep useBackendSubmitTx` finds 0 code hits in sodax-frontend, whitelabel and the backend (1 doc mention: sodax-frontend `docs/sdk-upgrade-guide.md:328`).
- **The API lane is its own hook family:** 22 swapsApi + 11 bridgeApi + 34 leverageYieldApi = 67 hooks.
- **Apps sign API-lane txs themselves:**
  - sodax-frontend: `apps/web/lib/swaps-api-sign.ts`, 181 lines;
  - playground: `apps/playground/src/lib/execution.ts`, 212 lines.
- **Each app uses one lane per flow.** sodax-frontend uses the API lane for swaps; whitelabel uses the SDK lane.

### Change

**Presets.** `query/polling.ts` with named cadences, plus `SodaxProvider polling={{ allowance, status, balance, … }}`:

```tsx
// before: per hook, per call
useMMAllowance({ params, queryOptions: { refetchInterval: 10_000 } });
// after: once
<SodaxProvider config={config} polling={{ allowance: 10_000 }}>
```

**Modes.** Nothing to add:
- the settlement mode exists as config with the same result types;
- the lane is chosen by hook family;
- a single hook with a lane option was ruled out for the lifecycle hook by #529 settled #1, because inputs, resume data and status sources differ. Applying that to other hooks is [judgement].

### Feasibility — Presets: Feasible with caveats · Modes: Premise incorrect · Code-traced

- **Presets are feasible.** `check-ai-consistency.py` must resolve preset names.
- **Modes: the premise is incorrect.** The bullet assumes explicit modes are missing. The settlement mode exists as config, and the lane is chosen by hook family. A lane option on the lifecycle hook was decided against (#529 settled #1).
- **The remaining real need is to document the lanes,** which is api-3.
- **The only new mode-like idea:** report which path settled (`settledVia`). No consumer has asked for it [judgement: not needed].

### Complexity — C2

**Presets** [judgement on LOC]:
- one PR in dapp-kit: ~60 LOC module, ~30 LOC provider plumbing, 46 one-line edits;
- ~40 LOC of Python in the script;
- skills doc updates.

That is additive public API. Do it after dk-3, so the `queryOptions` builders carry the presets.

**A real mode switch (T35.2)** would be C4: DTO↔SDK mappers, and a conflict with api-1/api-2.

**Risks:**
1. The doc gate silently stops checking.
2. Faster status polling against the relay's 100 req / 300 s per-IP limit. The figure comes from a backend comment and is unverified for browsers.

### Benefit — B2

- **P1/P2:** one global knob in place of per-call `queryOptions`, and consistent cadences.
  - It helps apps on rate-limited RPCs: #343 reports that Solana rate limits silently read as zero balances.
  - 0 issues ask for presets (`gh issue list --search` for preset, refetchInterval, "polling interval" and polling). #31 (closed) asked for per-call `queryOptions`, which shipped.
- **P5:** a single source for the docs gate.
- **Modes: B1.** No consumer needs a switch.

### Recommendation

- **Timing:** presets in 2.x, after dk-3. Drop modes and fold the lane docs into api-3.
- **Wording:** "Add named polling presets with a SodaxProvider override"

### Corrections to earlier research

- **Interval count:** first pass "52 interval literals" → 52 lines including 6 comments, so 46 code sites, of which 32 are numeric literals.
- **"Different shapes" is only partly true.** First pass said the three paths "return different shapes"; client relay and backend submit-tx return the same type behind an existing switch.
- **T35.2 runs against #529 settled #1.** Research-d's "transport option on the five swap hooks" is the same kind of lane option. #529 rejected it on `useSwapLifecycle`; applying its reasoning to the five swap hooks is [judgement].

## Dependencies between these bullets

**dk-2:**
- **↔ dk-4:** lifecycles take src/dst wallets, which become optional. The core must snapshot the wallet.
- **↔ dk-5:**
  - The core reads `isSodaxError(e).context.srcTxHash`.
  - PR 1's 3.0 part normalizes the DEX relay errors.
  - T22.6 (status hooks throw) changes how the lifecycles read status; land it after the lifecycles.
- **↔ dk-3:** new status hooks use the key factory.
- **↔ sdk-8:**
  - `srcTxHash` should be a standard error-context field.
  - An `AbortSignal` on the relay wait would let a lifecycle leave the wait and go to `pending`.
- **↔ sdk-1:** `spoke.settle` (#534) is the settlement seam the status read hangs off.
- **↔ sdk-10:** typed fakes for the lifecycle tests.
- **↔ api-3:** the API lane is already resumable step by step.
- **↔ sk-3:** new hooks go in the generated index.

**dk-4:**
- **↔ wsr-1:** the source hook reads the per-provider store, so it must nest inside the provider.
- **↔ wsc-2, wsc-3:** a change to `GetWalletProviderType` shapes or package homes moves the contract.
- **↔ wsc-4:** viem / EIP-1193 adapters produce app-provided sources.
- **↔ wsr-5:** Privy and similar wallets are just more sources.
- **↔ dk-6:** keep the wallet provider out of `SodaxProvider.tsx` to avoid a collision.
- **↔ x-1:** where the contract type lives.

**dk-7:**
- **↔ dk-3:** presets live in the `queryOptions` builders.
- **↔ sk-3:** the preset table feeds the docs gate.
- **↔ api-1, api-2, api-3:** the lanes become separate packages and docs.
- **↔ sdk-8:** an `AbortSignal` for polling.

**Outside the bullet list:** #509, #511, #512, #523, #529, #531, #532, #534 and #540.

## Not verified

- **Spoke-origin txs never submitted to the relay.** Whether the relayer indexes them without a submit (it does for hub-origin). This matters for closed tabs and for `RecoveryService.withdrawHubAsset`, which has no submit call.
- **How often post-broadcast errors happen.** The production rates of `RELAY_TIMEOUT` and other post-broadcast errors are unknown (no telemetry access), so dk-2's end-user benefit size is unmeasured.
- **The bridge status as a generic read.** That `sodax.bridge.getDetailedStatus` answers for a real MM or staking tx was traced in code but not run.
- **Rebuilding `relayData`.** Whether Solana and Bitcoin `relayData` can be rebuilt after a closed tab.
- **Adoption.** Whether sodax-frontend will adopt the lifecycle hooks. whitelabel is on 2.0.0-rc.12, with its last commit on 2026-08-07.
- **The relay rate limit.** The 100 req / 300 s per-IP limit comes from a backend comment (`intent-delivery.task.ts:93-94`); whether it applies to browsers is unknown.
- **MPC relay status (Tron, #534).** Its semantics for a settlement read. The `settle` coverage above is from #534 head `ecbdeddc` (2026-10-18) and may change before merge.
- **Probe coverage.** The dk-4 probe did not cover the real dapp-kit hook types, nor the wrapper that would keep callback vars unchanged.
- **DEX/cancel break size.** Whether any external caller matches the DEX or swap-cancel relay `message` strings. Known consumers do not (sodax-frontend matches by regex over `message` and `code`).

## Resume notes

The scratch dir is `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-dk-flows/`. Its outputs:
- **Scripts:** `postbroadcast.py` and `relay_ctx.py` (error exits), `imports.py` (consumer import counts: `python3 -I imports.py <repo> <ref> <pkg>`), `wpcount.py` (wallet hook files).
- **Lists:** `wp-strict.txt` and `wp-union.txt`, `fe-dappkit-imports.txt` and `wl-dappkit-imports.txt`.
- **PR diffs:** `pr509.diff`, `pr511.diff`, `pr512.diff` and `pr534.diff`.
- **Probe output:** `relay-probe.json`, and `probe-dk4/` (run with `node <t2probe>/node_modules/.pnpm/typescript@5.5.4/node_modules/typescript/bin/tsc -p tsconfig.json`).
- **Hygiene:** use `PYTHONDONTWRITEBYTECODE=1` when importing repo scripts, because a `__pycache__` was created once and removed.

All three bullets are scored. The open items are below.

**dk-2:**
- (a) Confirm against the live relay that it delivers a real MM or staking tx via `get_transaction_packets`. Find a hash through the backend MM endpoints, then POST as in `relay-probe.json`.
- (b) Read #540's plan comment, if any, for the per-feature `*WithApproval` signatures.
- (c) Re-check #534's final `mapSettlementFailure` after it merges.

**dk-4:**
- Extend `probe-dk4` to the real `useSafeMutation` var types: copy one hook's vars type from `packages/dapp-kit/src/hooks/mm/useSupply.ts` against the t2probe sdk dist.

**dk-7:**
- If the modes half is kept, read `apps/demo/src/lib/sodaxSettings.ts` for how the demo labels the toggles.

## Verification (2026-10-19)

An adversarial pass against `0181a053` (sodax-sdks-v3feas, clean), sodax-frontend `1b915ec7`, intents-whitelabel `5e1fbba` and sodax-backend `985959e9`. Outputs are in `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-dk-flows/`.

**What I checked**
- **Citations:** 114 path:line entries opened (`citations-checked.tsv`; `wc -l`). 106 hold, 3 hold in part, 5 were wrong. 13 are consumer citations, read with `git show`.
- **Numbers:** 29 re-derived (`numbers-checked.tsv`). The cheap ones were re-run:
  - `postbroadcast.py` and the raw-return `rg` (32 exits);
  - `wpcount.py` plus `wpclass.py` (63 = 53 + 5 + 5);
  - `git grep -ow`/`-o` counts in fe, wl, demo and skills;
  - `refetch_classify.py` (52 lines, 46 sites, 32/3/2/9, 8 intervals);
  - `override_check.py`;
  - `imports.py` on the backend (3 and 2 imports);
  - the `gh issue list` union (12);
  - `git show --numstat` for #504 (+511) and #509 (+38/−18).
- **Probes re-run:**
  - the dk-4 typing probe: exit 0 on TS 5.5.4 and 5.9.3;
  - one keyless `get_transaction_packets` POST: 404 in 1.2 s;
  - `check-ai-consistency.py`, loaded read-only with `python3 -I -B`: 30 hooks and 17 + 1 claims; 0 hooks once literals become identifiers.
- **Scores:** each ID's verdict, confidence, C, B and timing against the rubric.

**What I changed, and why**
- **dk-2 timing.** The report called the DEX and swap-cancel error change breaking but timed it 2.x. That breaks the rubric rule. The change moves `message` from the relay code to prose (`relay-error-mapping.ts:58-63`), and `DEX.md:643-644` says the documented relay branch stops being reached. Those 8 exits and the DEX lifecycle are now 3.0. The other 24 exits stay 2.x.
- **dk-2 benefit.** "B4 combined" rested on sodax-frontend adopting the hooks, which is unverified. It is now "B4 only if sodax-frontend adopts; unverified".
- **dk-2 count.** The scanner missed 2 exits in the LY positions hub branch: a revert at :3645 with the hash only in the message, and a receipt-wait throw that becomes `executionFailed` (:3350-3352, :3604-3606). The headline stays 32 scanned exits plus 2.
- **dk-2 D2 and the #534 seam.** #534 moves only 6 of the 24 `relayTxAndWaitPacket` calls onto `settle`. "A single emit point after #534" was wrong.
- **dk-2 wrong line refs** in `swapLifecycle.ts`:
  - `isSameIntent` :66-82 → :84-101 (66-82 is `SwapLifecycleInputs`);
  - reducer :95-125 → :103-136;
  - resolver :132-170 → :138-172;
  - hash read :114-116 → :125-129.
- **dk-2 other wording:**
  - the fe/wl column counts distinct hooks, not files;
  - `getIntentRelayChainId` comes from `@sodax/types`;
  - 0003's trigger names the signed approve path, so (A) is close to the trigger, not exactly it;
  - gh-302 settled #9 is scoped to the account-upgrade choice;
  - #532 is outside the issue-search union, so 3 lifecycle asks plus #532;
  - the "3 of 786" history count used an elided pattern; `lifecycle|srcTxHash` gives 1;
  - recovery "never relays" → "does not submit to the relay";
  - whitelabel uses dapp-kit's NEAR gate but hand-rolls Stellar;
  - the PR 1 LOC is ~170–250 (#509 added 38 lines over 5 hash sites and 2 swap edits), and the totals are 1.2–1.7k prod and 1.8–2.2k tests by the table's own arithmetic (were 1.2–1.9k and 1.8–2.3k).
- **dk-4:**
  - skills mentions 628/118 → 627/117 (`git grep -ow walletProvider HEAD -- packages/skills`);
  - whitelabel casts: the stated command gives 1, and 2 needs `useWalletProvider(...) as any`;
  - dapp-kit also depends on `viem`;
  - the contract cite is plan-v3-order §2 item 6, not §6;
  - probe item 5 rests on a cast;
  - the `vars.walletProvider` type delta is stated, with a wrapper that avoids it;
  - option (a) becomes viable if wsr-1 ships a headless wallets object;
  - hook LOC 63 × 3–6 = 190–380.
- **dk-7:**
  - The verdict "Needs a decision" became "Presets: Feasible with caveats; modes: Premise incorrect". The report's own evidence shows the modes the bullet asks for already exist, and the rubric requires "Premise incorrect" there.
  - Per-call override is 46 of 46, not 45.
  - `useBackendSubmitTx` has 0 code hits but 1 doc mention in fe.
  - The #529 rejection is scoped to `useSwapLifecycle`.
  - The 0-issues claim now states its search terms.

**Kept after checking**
- C4/C3/C2 match the PR breakdowns.
- The B2 ratings hold for dk-4 and for dk-7's presets; dk-7's modes stay B1.
- dk-4 and the dk-7 presets stay 2.x.
- All 32 exit sites, the per-flow method lines, the relay-before-wait order (`IntentRelayApiService.ts:515-550`) and the per-chain verify behaviour (`SpokeService.ts:1230-1260`) are confirmed.
- So are the consumer counts (fe 109/14/13/23-in-9, wl 61/10, demo 182/28), the 4 step enums, the 15 s claim race and the timeout copy.

**What remains judgement**
- About 70% of `swapLifecycle.ts` is reusable.
- The per-PR LOC for dk-2 PRs 2–8 and all of dk-4 and dk-7.
- dk-2 B3 ("recurring class") and the conditional B4.
- C4 rather than C5 for dk-2, despite the fund-path risk.
- Choosing (b) over (a) for dk-4.
- Dropping modes.

**Residual doubts**
- Whether the DEX/cancel change counts as breaking. `DEX.md` pre-announces it, so maintainers may call it a 2.x fix.
- Whether the relay serves real MM or staking packets keyless. The probe only saw a 404 for an unknown hash.
- #534 may change before merge.
- The skills count is off by 1 from the original under every variant I tried (627/117 or 631/119).
- The research-d "12 / 9" lookup counts could not be matched to a command.
