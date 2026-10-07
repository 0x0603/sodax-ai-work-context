---
type: process
repo: sodax-sdks
github: 302
updated: 2026-10-07
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
