---
type: process
repo: sodax-sdks
github: 302
updated: 2026-10-08
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Session 1 — 2026-10-07 — research + plan (sodax-sdks main @ 93f86c5d)

### What already shipped (do not rebuild)

- **#362** (`c5a2b007`, 2026-08-09, R0bi7) — `useBackendSubmitTx` moved to `swaps`/`bridge` slots,
  default ON; `swapsOptions`/`bridgeOptions`/`SwapsClientOptions`/`BridgeClientOptions` deprecated and
  still honored (`ConfigService.ts:502-508`). No "Closes #329" → issue left open. It also **removed**
  `useBackendSubmitTx?` from `SwapServiceConstructorParams` (present in `@sdks@2.0.0` at
  `SwapService.ts:169-170`) — the one type-compat gap.
- **#371** (`4598a2db`, 2026-08-16, R0bi7) — `getDetailedStatus({srcChainKey, srcTxHash})`: backend
  record while in play, else relay packet → hub hash → `resolveSolverStatus`; `useDetailedStatus`
  with a not-found budget. No "Closes #328".
- **#468 / #475** — shared routing in `backendApi/detailedStatusRouting.ts`, polling policy in
  `dapp-kit/src/hooks/shared/solverStatusPolicy.ts` (shared with leverage yield).

### #328 gaps found

- No common status: backend arm uses submit-tx strings, solver arm numeric codes; hub/fill hash field
  names differ per arm. Demo re-implements the collapse (`OrderStatus.tsx` `deriveDetailed`).
- `swap()` post-broadcast failures carry no `srcTxHash` (`relay-error-mapping.ts:49-53`), so a caller
  cannot keep polling a swap the backend may still complete.
- Demo `/swaps-sdk` status card uses a raw solver fetch (`apps/demo/src/hooks/useSolverStatus.ts`).
- `useDetailedStatus` missing from dapp-kit README swap list, swap SKILL routing, recipes, polling table,
  query-key conventions.

### #302 facts

- `IEvmWalletProvider` (`types/src/evm/evm.ts:59-64`) has one real implementation
  (`wallet-sdk-core/.../EvmWalletProvider.ts`); stubs are cast `as unknown as`, except uncast literals in
  `apps/playground/src/lib/execution.test.ts:153-192` → new methods must be optional.
- viem 2.29.2 (`pnpm-workspace.yaml:36`) already exports stable `sendCalls` (returns `{id}`,
  `forceAtomic`), `getCapabilities` (`atomic.status`), `getCallsStatus`, `waitForCallsStatus` (resolves
  on `statusCode >= 200`, 60s default) in `walletActions`; wagmi's `getWalletClient` extends
  `walletActions`. No bump needed.
- EIP-5792 `atomic.status`: `supported` / `ready` (wallet upgrades with user approval — MetaMask EOA via
  EIP-7702) / `unsupported`. `atomicRequired: true` on a `ready` wallet MUST upgrade first; reject = 5750.
  MetaMask 5792 networks: Ethereum, BSC, OP, Base, Polygon, Arbitrum, Gnosis, Unichain, Berachain.
- `SwapService.approve` returns the approve hash without waiting for its receipt; the USDT stale-
  allowance reset is waited inside `SpokeService.executeErc20ApprovalPlan`.
- Backend `POST /swaps/submit-tx` does not verify the source tx on-chain — it relays the hash
  (`sodax-backend/apps/swaps-api/src/api/swaps/swaps.service.ts:219`, `relay-swap-tx.ts:83`). Whether
  the relayer accepts a 7702 self-call tx is unverified → mainnet matrix gates the merge.
- `isWalletRejection` (`errors/wrappers.ts:66-104`) has no `code === 5750` arm; it only matches 5750 by
  message text today.
- Related: #208 (gasless via 7702 + Pimlico, ERC-7677 paymaster capability) — keep batch options open
  for capabilities; don't build it.

### Lifecycle hook inputs

- gh-21 design (2026-08-12): discriminated-union controller, one `next()`, escape hatches. Only state
  machine precedent: `wallet-sdk-react/src/useWalletModalStore.ts`.
- Demo `SwapCard.tsx` (743 lines) wires quote, allowance, approve, swap, Stellar + NEAR gates, Bitcoin
  readiness booleans, `useEvmSwitchChain`, 4 error states, a multi-clause `disabled` (`:675-686`).
- dapp-kit cannot import wallet-sdk-react → chain switch and Bitcoin readiness are injected.

### Decisions

User: scope + `useSwapLifecycle`; `supported`+`ready` batchable, `forceAtomic`, reject → USER_REJECTED
no fallback; one PR; full #328 tail. Mine: EVM spokes only (Sonic sequential); no fallback after a batch
send attempt; optional provider methods; public SDK = `getApprovalStrategy` + `swapWithApproval`; no
new error code; bridge ctor gap out of scope. Full plan in `plan.md`.

## Session 1 (cont.) — implementation

- Node 24.21.0 downloaded into the session scratchpad (official tarball, sha256-checked) with a corepack
  `pnpm` wrapper; every commit ran the full pre-commit hook with it.
- **`swap()` refactor is not byte-identical.** The old body returned `this.fallbackSwapSteps(...)`
  un-awaited inside `try`, so a fallback rejection escaped the guard. `completeSwap` is awaited, so it is
  now an UNKNOWN `Result`. Called out in commit 6.
- 5750 was already matched by text (`/user rejected/i` hits viem's "…the user rejected the upgrade");
  added explicit `code === 5750` / name arms anyway. `TransactionExecutionError` copies the cause's
  `shortMessage`, which is what makes wrapped rejections classify.
- viem's `getCapabilities({ chainId })` types the per-chain entry as present but returns `undefined` for
  an omitted chain — annotated `| undefined` instead of casting.
- First attempt put dapp-kit invalidations in `onSettled` (an approval can land when the swap after it
  fails); moved back to `onSuccess` per `shared/types.ts`. `useSwapAllowance` polls anyway, and
  `useSwapLifecycle.reset()` refetches the strategy.
- dapp-kit tests in this package must not use `any` with a `biome-ignore` — `noExplicitAny` is off
  there, so the suppression is itself a warning; typed captures instead.
- A first skills edit added a `swapsOptions` row to the **v1 → v2** table — wrong, it is a 2.0.x key;
  moved to a "Within v2" note.

## Session 1 (cont.) — review of #503 / #504 and fixes

Review (two independent agents + own verification) — #503 approve-with-comments (2 nits: unresolved
`{@link SwapsOptions}` in `SwapService.ts`, ctor-override test only covers `false`). #504 request-changes.
Dropped as wrong: "missing changeset" (changesets retired after #407; #475 had none) and Biome reformat noise.

Fixed on `feat/302-swap-lifecycle` (local, not pushed yet):

- `ebb1b300` wallet-sdk-core — viem `sendCalls` tags the batch with `client.chain` and, unlike
  `sendTransaction`, never asserts it; `sendAtomicBatch` now also refuses when `walletClient.chain.id` ≠
  target. `waitForBatch` takes `{ timeout }`; viem's `status` predicate dropped from the policy.
- `e065295d` sdk — batch wait gets the caller's `timeout`; sent-but-unconfirmed (or success with no
  receipt) → `TX_VERIFICATION_FAILED` + `reason: ATOMIC_BATCH_UNCONFIRMED` (exported) + `batchId`, never
  "nothing sent". Wallet refusing before signing (4200, -32601, 5700, 5710, 5740, 5760; walks viem causes)
  → falls back to sequential. Approval-step errors get `action`/`approvalStrategy` via new
  `withErrorContext`. JSDoc/table fixes.
- `b002056f` dapp-kit + demo — lifecycle `unconfirmed` state (next() never retries; only reset());
  `pending.error`; status auth failure surfaced; `reset()` no-op while submitting; `isSameIntent` compares
  all but deadline. Demo/recipe: honest "in progress" labels, Start over / Stop tracking, passive setup.
  The demo's exhaustive `switch` on `state.kind` caught the new state at checkTs — keep it exhaustive.
- `a99b99c7` demo — order summary snapshotted at click (RQ runs onSuccess with the latest render's options).

Left as is: unchecked casts on the batch path (runtime-guarded), post-broadcast failures not added to the
demo order history, an unconfirmed batch that lands later is not relayed by the client (needs the tx hash).

## Session 2 — 2026-10-08 — declined upgrade, #503 follow-ups

- #503: `eb506c60` spells out the only v3 form (`swaps: { partnerFee, useBackendSubmitTx }`, bridge likewise);
  `2853c0ae` covers the drift bot's gap (ctor field in the v1→v2 skill) + the pre-existing over-long test line.
  The demo never used `swapsOptions` (`git log -S` over `apps/` is empty); it adopted `swaps:` in #402.
- Gap found while explaining the test plan: a user who declines MetaMask's upgrade was stuck — `ready`
  stays `ready`, every retry re-prompts, and MetaMask docs don't say it remembers the decline.
  User's call: SDK exposes a true/false option only; policy belongs to the app. `5f4d1574`:
  `SwapWithApprovalParams.allowAccountUpgrade`, `ACCOUNT_UPGRADE_DECLINED` (exported),
  `isAccountUpgradeDeclined` (internal, shares the cause walk), dapp-kit key gains `allowAccountUpgrade`
  (resolved to `true` when omitted), demo shows "Swap without upgrading (2 signatures)" after a decline.
  PR body + checklist updated.

## Session 2 (cont.) — 2026-10-08 — detailed review of #504 and fixes

- Four parallel review agents (wallet provider, SwapService, dapp-kit, demo); each finding re-checked in code.
  No fund-loss defect in the SDK; chain binding, spender/amount, pre-send-only fallback and the hub-side
  simulation of the raw `createIntent` all hold.
- Fixed (`ff7473c9`, `e618d2ea`, pushed; PR body updated):
  - lifecycle dropped an `unconfirmed` / post-broadcast attempt when `intentParams` changed (the demo
    trigger rebuilds params from a quote that refreshes every 3 s) → state `ready` → second swap.
    Those attempts now hold until `reset()`; the demo trigger keeps the tracked order.
  - `batch.status === 'success'` with a non-success / unidentifiable deposit receipt was reported as
    `atomic-batch-failed` ("nothing deposited"). Now only EIP-5792 400/500 are failed; the rest unconfirmed.
  - `timeout: 0` → viem waits forever; clamped to 1 ms in the SDK and the provider.
  - `next()` had no in-flight guard (two calls in one tick both saw `ready`); `useRef` guard.
  - fallback gated on `INTENT_CREATION_FAILED` so a rejection carrying a refusal code never re-prompts.
- Left as follow-ups (told the user): "Swap without upgrading" reuses the old payload if the form changed;
  setup actions in flight still read `needsSetup`; late-landing batch not relayed; hook state is
  mount-local; `"0x0"` capability key ignored by viem; strategy key lacks wallet identity.
- Backend notes for the USDT question: swaps-api `POST /swaps/approve` already returns `tx` + optional
  `resetTx` via `buildApproveTxs`; its DTO doc still says the two "cannot be batched", and
  `leverage-yield.service.ts` uses single-tx `swaps.approve` (stale USDT allowance would revert). Not filed.
- Follow-up fixes (`ab1ec388`): setup step in flight or its check refreshing → `checking` (via the gate
  mutation flags + `useIsFetching` on the three check key prefixes, since the mutations don't await their
  invalidations); demo "Swap without upgrading" rebuilds the order first; "Stop tracking" always offered in
  `pending`. A real "status read stopped" signal would need a change to `useDetailedStatus` (existing hook),
  skipped per the no-breaking rule.


## Session 3 — 2026-10-09 — first mainnet 7702 batch checked (read-only)

User's Base tx from 2026-10-08: `0xa2894131596b1a46c8a4a02374a00819ca3f5c1e7d43ba4e6e0f76655d451775`
(block 52332197). Checked over public RPC + `api.sodax.com/v1/relay`:

- Type `0x4` with an authorization list (nonce 0) → the EOA `0xb924…bb61` was upgraded in this tx; its
  code is now `0xef0100` + `0x63c0c19a…` (MetaMask delegator). One tx, one receipt.
- Outer tx is **not** a self-call: `from` = `0xc066…8b8c` (code-less relayer EOA), `to` = `0xdb9b…7db3`
  (a contract, likely MetaMask's DelegationManager). The user paid 9788 units of USDC (0.009788 USDC) to `0xe347…1964`, which
  looks like MetaMask's pay-gas-in-token relay. So the source tx's `from` is not `srcAddress`.
- Logs in order: USDC Approval to the asset manager (1.01 USDC) → Transfer to the asset manager →
  connection `0x4555…88eD` Message → USDC fee transfer.
- Relay: `get_transaction_packets` (chain 30) → `executed`, `src_address` = asset manager, hub tx
  `0x6f80…943e`. The relayer keys off the connection log, not tx `to`/`from`.
- Hub intent `0x1905…c255` closed with `intent-filled` (`0x2756…1db2`); both delivery packets back to Base
  are `executed`. End to end works.
- `GET /v1/swaps/submit-tx/status` → 404 on prod and canary: this swap did not go through backend
  submit-tx, so that leg is still unproven by a real tx. The backend forwards the same
  `{ chain_id, tx_hash }` relay submit for EVM (`relay-swap-tx.ts`), so it should behave the same.
- SDK `verifyTxHash` does nothing for EVM (`SpokeService.ts:1232`), so a relayed `from` breaks nothing there.

Second tx, through backend submit-tx: `0x3c06ab8c6d2843de5819d734ffb0235687bf0fa36b0b3c58d4ff805f34c3cde9`
(Base block 52362094):

- Type `0x2`, `from` = `to` = the user EOA (already upgraded, no authorization list), selector
  `0xe9ae5c53` (ERC-7579 `execute`). Plain 7702 self-call, gas paid in ETH by the user. One receipt.
- Logs: USDC Approval to the asset manager (1.1 USDC) → Transfer → connection Message.
- `GET /v1/swaps/submit-tx/status` (prod) → `status: solved`, `processingAttempts: 0`, `dstIntentTxHash`
  `0x4aa9…9e5e`, `intent_hash` `0xb9c6…e55c`, `fillTxHash` `0xcc2a…b458`. Hub intent closed with `intent-filled`.
- So both shapes the wallet produces, the relayed upgrade tx and the self-call, are accepted, and backend
  submit-tx carries a batch hash to `solved` with no retries.

Why the two differ: the user held **0 ETH** on Base before tx 1, so MetaMask relayed it and took gas in
USDC. Its selector `0xcef6d209` is `redeemDelegations(bytes[],bytes32[],bytes[])` (MetaMask Delegation
Framework) and the wallet added its own fee call to the batch. Swap 1 delivered ~0.000389 ETH, so tx 2 paid
its own gas (`0xe9ae5c53` = ERC-7579 `execute(bytes32,bytes)`). Gas used: 379,669 vs 156,554. Watch item:
a wallet that returns per-call receipts *and* appends a fee call gives `receipts.length = txs.length + 1`,
which `sendAtomicBatch` reads as unconfirmed. Here it was one receipt, so it did not bite.

Third tx, native ETH source: `0x2f8b27d6128e48b3bb7a750e6efa9695b2525f9a87fb6dc51a5fd84bb291363d`
(Base block 52362217, 2026-10-09 02:43 UTC). Type `0x2`, `from` = user (still 7702-delegated) → `to` = the
asset manager directly, `value` 0.00082 ETH, selector `0xc6b4180b` = `transfer(address,bytes,uint256,bytes)`.
One log (connection Message), no approval, no batch: the `not-required` path. Backend submit-tx → `solved`,
0 retries, fill `0x8f27…53b5`. A delegated EOA still sends a plain tx fine.

Fourth tx, relayed shape through backend: `0xee1b20f7183892a10cfb4e9e7e1b91df7decb10057240996f6f1a2836d817e8c`
(Base block 52362271, 2026-10-09 02:44 UTC). The user had ~0.0000055 ETH left after tx 3, so MetaMask relayed
again: `from` = `0xb42f…ead6` (a different code-less relayer EOA), `to` = DelegationManager, `redeemDelegations`,
no authorization list (already upgraded). Calls: approve 1.1 USDC → deposit → 0.011173 USDC fee to `0xe347…1964`.
Gas 357,181 (tx 1 was 379,669; the ~22.5k gap is the authorization). Backend submit-tx → `solved`, 0 retries,
fill `0xaec3…5884`. This closes the last shape gap: a relayed batch hash also goes through backend submit-tx.
