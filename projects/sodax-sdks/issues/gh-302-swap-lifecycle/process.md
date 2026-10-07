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
