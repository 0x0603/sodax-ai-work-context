---
type: plan
repo: sodax-sdks
github: 302
updated: 2026-10-07
related_issues: [gh-328, gh-329, gh-21, gh-208]
---

# Swap lifecycle in dApp Kit — #302 + #328 + #329 + `useSwapLifecycle`

## Context

Three `icon-project/sodax-sdks` issues, grouped as "Lifecycle hook in dApp Kit (swaps)":

- **#302** — one-signature approve + create-intent on EVM via EIP-5792 (`wallet_getCapabilities` /
  `wallet_sendCalls`), swap pilot. **Nothing exists yet** (zero 5792 usage in repo).
- **#328** — universal status method + hook. **Core already shipped** in PR #371 (2026-08-16):
  `SwapService.getDetailedStatus({srcChainKey, srcTxHash})` (backend first → relay packet → solver)
  + dapp-kit `useDetailedStatus`. Left: two vocabularies the caller must switch on, `srcTxHash` lost
  when `swap()` fails after broadcast, demo bypasses the SDK (`apps/demo/src/hooks/useSolverStatus.ts`
  raw fetch), README/skills gaps.
- **#329** — deprecate `SwapsClientOptions`, submit-tx default. **Core already shipped** in PR #362
  (2026-08-09): legacy keys deprecated, `ConfigService.ts:502-508` resolves
  `swaps ?? swapsOptions ?? true`. Left: #362 removed `useBackendSubmitTx?` from
  `SwapServiceConstructorParams` (present in `@sdks@2.0.0`) — a type break vs the issue's
  "type-wise compatible"; swap-side compat tests; JSDoc; CONFIGURE_SDK snippet; v1→v2 skill.

Then a new **`useSwapLifecycle`** hook composes everything (strategy → gates → approve/batch → swap →
status) so a swap form stops hand-wiring ~10 hooks, 4 error states and a multi-clause `disabled`
(gh-21 controller-hooks design, first instance). Demo `SwapCard.tsx` is rewritten on it as the
before/after.

Issue claims found stale: viem is **2.29.2** everywhere (not 2.45.1) and 2.29.2 already ships
**stable** `sendCalls` / `getCapabilities` / `waitForCallsStatus` in `walletActions` → **no viem bump**.
"Add an error code" conflicts with `packages/sdk/AGENTS.md` (detail goes in `error.context`) → no new code.

### Decisions (user, 2026-10-07)
- Scope: 3 issues **+ `useSwapLifecycle`** + demo rewrite.
- Atomic: `'supported'` **and** `'ready'` count as batch-capable; send with `forceAtomic: true`.
  Upgrade rejected (5750) or batch rejected (4001) → `USER_REJECTED`, **no** auto-fallback.
- **One PR** for everything (closes #302, #328, #329).
- #328: full tail (summary helper + `srcTxHash` in context + demo + docs). No rename.

### Design decisions (mine — call out in PR)
- Batch only for **EVM spokes** in v1; **Sonic hub → sequential** (hub tx goes straight to the solver,
  7702 self-call unverified there; MetaMask has no 5792 on Sonic anyway). One-line gate to widen later.
- No sequential fallback **after** `sendAtomicBatch` was attempted (risk of double execution); fallback
  only pre-send (`'unsupported'`, method missing, capability read throws).
- Wallet provider reports facts, SDK owns policy. New provider methods are **optional** (third-party
  providers and uncast test literals in `apps/playground/src/lib/execution.test.ts:153-192` keep compiling).
- Public SDK surface kept minimal: `getApprovalStrategy` + `swapWithApproval`; the create-only variant
  stays private until someone needs it.
- Bridge has the same constructor-param gap as #329 — mention in PR, don't fix.

## Setup

1. Context repo: `git pull`; scaffold `scripts/new-issue.sh sodax-sdks 302 swap lifecycle` →
   `projects/sodax-sdks/issues/gh-302-swap-lifecycle/` with `related_issues: [gh-328, gh-329, gh-21, gh-208]`;
   copy this plan into `plan.md`, research findings into `process.md`, write `brief.md`.
2. sodax-sdks: worktree `sodax-sdks-302` on branch `feat/302-swap-lifecycle` off `origin/main`;
   `pnpm i && pnpm build:packages` (`TURBO_CONCURRENCY=2`). Commit with Node 24 on PATH (pre-commit
   hook breaks on Node 26). Signing key `~/.ssh/id_ed25519_sodax_signing`.
3. No `.changeset` files (unused since 2026-09-16; release notes come from conventional commits).

## Implementation (commit order — each green on its own)

### 1. `feat(types): add optional EIP-5792 batch methods to IEvmWalletProvider`
`packages/types/src/evm/evm.ts` (after `:57`; hand-written, viem-free):
```ts
export type EvmAtomicBatchSupport = 'supported' | 'ready' | 'unsupported';
export type EvmSendBatchOptions = { expectedChainId: number };            // room for #208 capabilities
export type EvmBatchReceipt = { transactionHash: Hash; status: 'success' | 'reverted' };
export type EvmBatchResult = { status: 'success' | 'failure'; statusCode: number; atomic: boolean; receipts: readonly EvmBatchReceipt[] };
// IEvmWalletProvider — optional, callers guard before use:
getAtomicBatchSupport?: (chainId: number) => Promise<EvmAtomicBatchSupport>;
sendAtomicBatch?: (txs: readonly EvmRawTransaction[], options: EvmSendBatchOptions) => Promise<string>; // batch id
waitForBatch?: (batchId: string) => Promise<EvmBatchResult>;
```
Docs: `packages/sdk/docs/WALLET_PROVIDERS.md` (mapped).

### 2. `feat(wallet-sdk-core): implement EIP-5792 atomic batches in EvmWalletProvider`
`packages/wallet-sdk-core/src/wallet-providers/evm/EvmWalletProvider.ts`:
- Extract the chain check at `:182-190` into `private assertActiveChain(expectedChainId)`; reuse in
  `sendTransaction` and `sendAtomicBatch`.
- `getAtomicBatchSupport(chainId)`: `'unsupported'` unless `walletClient.account.type === 'json-rpc'`
  (local accounts would send `wallet_*` to a plain RPC — test fixtures put local accounts in browser
  config, so gate on account type, not config mode); else
  `(await walletClient.getCapabilities({ chainId }))?.atomic?.status`, unknown → `'unsupported'`
  (viem types the per-chain entry non-null but it is `undefined` at runtime). RPC errors propagate.
- `sendAtomicBatch`: reject non-json-rpc, `assertActiveChain`, `sendCalls({ calls: txs.map(({to,value,data}) => ({to,value,data})), forceAtomic: true })` → `id`.
- `waitForBatch(id)`: `waitForCallsStatus({ id, ...this.mergePolicy('waitForCallsStatus') })` (it resolves
  on any `statusCode >= 200`), map `status !== 'success'` → `'failure'`, keep `statusCode`/`atomic`/receipts.
- `types.ts`: `EvmWalletDefaults.waitForCallsStatus?` policy slot, mirroring `waitForTransactionReceipt`.
Docs: `packages/wallet-sdk-core/README.md` EVM section; skill `packages/skills/skills/sodax-wallet-sdk-core/evm/SKILL.md`.

### 3. `feat(sdk): add summarizeSwapStatus and srcTxHash on post-broadcast swap errors` (#328)
- `packages/sdk/src/swap/detailedStatus.ts` (pure) + export from `swap/index.ts`:
  ```ts
  export type SwapStatusSummary = { state: 'pending' | 'solved' | 'failed'; hubTxHash?: Hex; fillTxHash?: Hex };
  export function summarizeSwapStatus(status: DetailedSwapStatus): SwapStatusSummary;
  ```
  backend arm: `solved`/`failed` else pending; hub = `result.dstIntentTxHash`, fill = `result.fillTxHash`.
  solver arm: `SOLVED`/`FAILED` else pending; hub = `dstTxHash`, fill = `fill_tx_hash`. Keep hashes only if `isHex`.
- `SwapService.fallbackSwapSteps` (`:760-823`, the only post-broadcast failure sink — submitTx failures
  fall back into it): pass `srcTxHash` into `verifyFailed` / `mapRelayFailure` ctx and rebuild the
  passed-through `postExecution` error with `context.srcTxHash`. `MapRelayFailureCtx`
  (`errors/relay-error-mapping.ts`) gets optional `srcTxHash?` merged into its `baseCtx` (`:49-53`) —
  other features unaffected.
Docs: `packages/sdk/docs/SWAPS.md` (§ Get Detailed Status `~:1039`, § context fields `~:261`);
skills `sodax-sdk/swap/SKILL.md`, `sodax-sdk/integration/knowledge/features/swap.md`.

### 4. `docs(dapp-kit): document useDetailedStatus as the swap status read` (#328)
`packages/dapp-kit/README.md` (`:7`, `:137-146`); skills under `packages/skills/skills/sodax-dapp-kit/`:
`swap/SKILL.md` (route "poll swap status" → `useDetailedStatus`), `integration/knowledge/recipes/swap.md`,
`architecture.md` (`~:299`), `features/auxiliary-services.md` polling table (`:441-464`),
`reference/querykey-conventions.md` (`['swap','detailedStatus',…]`).

### 5. `feat(sdk): honor deprecated SwapService useBackendSubmitTx override` (#329)
- `SwapServiceConstructorParams` (`SwapService.ts:197-202`): re-add
  `/** @deprecated Use new Sodax({ swaps: { useBackendSubmitTx } }) ({@link SwapsOptions}); removed in v3. */ useBackendSubmitTx?: boolean`;
  store as `private readonly useBackendSubmitTxOverride`; getter (`:263-265`) →
  `this.useBackendSubmitTxOverride ?? this.config.swapUseBackendSubmitTx`. `Sodax.ts` unchanged.
- JSDoc on `SwapsClientOptions` / `BridgeClientOptions` (`types/src/sodax-config/sodax-config.ts:98-112`):
  `{@link SwapsOptions}` / `{@link BridgeOptions}`, "removed in v3".
- Docs: `CONFIGURE_SDK.md:228-231` before/after snippet; skill
  `sodax-sdk/migration-v1-to-v2/knowledge/reference/sodax-config.md` (`swaps`/`bridge.useBackendSubmitTx`, default ON).

### 6. `refactor(sdk): extract completeSwap from swap()`
Lift `swap()` `:700-721` (timeout resolve → `submitTx` if backend on → `fallbackSwapSteps`) verbatim into
`private completeSwap(_params, created)`. `swap()` = `createIntent` → `completeSwap`, `trackResult` stays
inline. Existing tests must pass untouched.

### 7. `feat(sdk): add getApprovalStrategy and swapWithApproval with EIP-5792 batching` (#302)
```ts
export type SwapApprovalStrategy = 'not-required' | 'atomic-batch' | 'sequential';
export type SwapWithApprovalResponse = SwapResponse & { approvalStrategy: SwapApprovalStrategy };
public getApprovalStrategy<K>(_params: SwapActionParams<K, false>): Promise<Result<SwapApprovalStrategy, ApprovalStrategyError>>;
public swapWithApproval<K>(_params: SwapActionParams<K, false>): Promise<Result<SwapWithApprovalResponse, SwapWithApprovalError>>;
private createIntentInAtomicBatch<K>(_params): Promise<Result<CreateIntentResult<K, false>, SwapWithApprovalError>>;
private approveThenCreateIntent<K>(_params): Promise<Result<CreateIntentResult<K, false>, SwapWithApprovalError>>;
```
- `getApprovalStrategy` (read, untracked): `isAllowanceValid` (`:915-955`) fails → `ALLOWANCE_CHECK_FAILED`;
  valid (incl. native, non-allowance chains) → `'not-required'`; EVM spoke + EVM provider + batch methods
  present + support `'supported'|'ready'` for `getEvmViemChain(src).id` → `'atomic-batch'`; else `'sequential'`.
- `swapWithApproval`: `trackResult('swap','swapWithApproval', …)` inline; strategy → `createIntent` /
  `createIntentInAtomicBatch` / `approveThenCreateIntent` → `completeSwap` → add `approvalStrategy`.
- `createIntentInAtomicBatch`: `buildApproveTxs({raw:true})` (`:1067-1124`, includes USDT reset) +
  `createIntent({raw:true})` (walletProvider omitted) → `[resetTx?, approveTx, depositTx]` →
  `sendAtomicBatch(…, {expectedChainId})` → `waitForBatch`; not success / last receipt reverted →
  `INTENT_CREATION_FAILED` `{reason:'atomic-batch-failed', batchId, statusCode}`; else
  `tx = lastReceipt.transactionHash`. Throws → `intentCreationFailed(…, {approvalStrategy, batchId})`.
- `approveThenCreateIntent`: `approve` (returns hash without waiting) → `spoke.waitForTxReceipt` →
  not success → `APPROVE_FAILED` `{reason:'approve-not-confirmed', approveTxHash}` → `createIntent`.
- New `packages/sdk/src/shared/utils/evmAtomicBatch.ts` (not in barrel): `canSendAtomicBatch(wp)` type
  guard + `readAtomicBatchSupport(wp, chainId)` (missing/throws → `'unsupported'`).
- `swap/errors.ts`: `SwapWithApprovalErrorCode = SwapErrorCode | 'APPROVE_FAILED' | 'ALLOWANCE_CHECK_FAILED'`,
  `SwapWithApprovalError`, `ApprovalStrategyError`, `isSwapWithApprovalError`; `'swapWithApproval'` in `SwapAction`.
- `errors/wrappers.ts:~93`: user-rejection also on `code === 5750` / `name === 'AtomicReadyWalletRejectedUpgradeError'`
  (today it only matches by message text).
- `SpokeService.ts:377-379` comment: "cannot be sent as separate transactions until the previous is mined".
Docs: `SWAPS.md` (§ Available Methods, new § "Approve and swap in one signature" after § Token Approval
Flow `~:523`, incl. wallet/chain support + 'ready' upgrade note); sdk swap skills.

### 8. `feat(dapp-kit): add useSwapApprovalStrategy and useSwapWithApproval`
- `hooks/swap/useSwapApprovalStrategy.ts` — read hook `{ payload, walletProvider }`, key
  `['swap','approvalStrategy', srcChainKey, srcAddress, inputToken, inputAmount.toString()]`, `unwrapResult`, no polling.
- `hooks/swap/useSwapWithApproval.ts` — mutation, key `['swap','swapWithApproval']`, `raw:false`;
  onSuccess invalidates balances + `['swap','allowance']` + `['swap','approvalStrategy']`, then consumer callback.
- Export from `hooks/swap/index.ts`; register in `hooks/_mutationContract.test.ts`; README; skills
  `reference/hooks-index.md`, `reference/querykey-conventions.md`, `features/swap.md`.

### 9. `feat(dapp-kit): add useSwapLifecycle`
```ts
export type UseSwapLifecycleParams<K extends SpokeChainKey = SpokeChainKey> = {
  intentParams: CreateIntentParams<K> | undefined;
  srcWalletProvider: GetWalletProviderType<K> | undefined;
  dstWalletProvider: GetWalletProviderType<SpokeChainKey> | undefined;
  dstAccountAddress: string | undefined;
  chainSwitch?: { isWrongChain: boolean; switchChain: () => void | Promise<void> }; // from useEvmSwitchChain
  externalBlocked?: boolean;                                   // app-owned prerequisite, e.g. Bitcoin setup
  extras?: SwapExtras<K>; timeout?: number;
  mutationOptions?: MutationHookOptions<SwapWithApprovalResponse, UseSwapWithApprovalVars<K>>;
};
export type SwapLifecycleState =
  | { kind: 'idle' } | { kind: 'checking' } | { kind: 'needsChainSwitch' }
  | { kind: 'needsSetup'; reason: 'stellarActivation' | 'stellarFunding' | 'stellarTrustline' | 'stellarCheckFailed' | 'nearStorage' | 'external' }
  | { kind: 'ready'; approvalStrategy: SwapApprovalStrategy }
  | { kind: 'submitting' }
  | { kind: 'pending'; srcChainKey: SpokeChainKey; srcTxHash: string }
  | { kind: 'settled'; srcChainKey: SpokeChainKey; srcTxHash: string; fillTxHash?: Hex }
  | { kind: 'failed'; error: Error; srcTxHash?: string };
// returns { state, error, next(), reset(), approvalStrategy, swap, status, stellar, nearStorage } — sub-results are escape hatches
```
- No React state; derived. Pure resolver `src/utils/swapLifecycle.ts` (like `utils/stellarGate.ts`),
  precedence: pending mutation → `submitting`; current attempt has `srcTxHash` (success data or
  `error.context.srcTxHash`) → `summarizeSwapStatus` → settled/failed/pending; attempt failed without
  hash → `failed`; missing inputs → `idle`; Stellar gate → NEAR gate → `externalBlocked` → wrong chain →
  strategy loading/error → `ready`. "Current attempt" = mutation whose `variables.params === intentParams`.
- `next()`: chain switch / gate action (activate, requestTrustline, retry, registerStorage) / `mutateAsyncSafe`
  / `reset` per state; no-op for `stellarFunding`/`external`. `reset()` = `swap.reset()` + strategy refetch.
- Widen `useNearStorageGate`/`resolveNearStorageGate` to `SpokeChainKey | undefined`; export `NearStorageGate` type.
- Skills: `recipes/swap.md` swap-form recipe, `swap/SKILL.md`, hooks-index; README.

### 10. `feat(demo): read swaps-sdk order status from useDetailedStatus`
`apps/demo/src/components/swaps/OrderStatus.tsx`: add `SwapLiveCard` (`useDetailedStatus` + existing
`deriveDetailed`); route at `~:531-545` when swap order has `srcChainKey`+`srcTxHash` and is **not**
pinned to another env (env-pinned orders keep `SolverLiveCard`/`useSolverStatus` on purpose).
Update `apps/demo/AGENTS.md` routing sentence.

### 11. `feat(demo): rebuild SDK SwapCard on useSwapLifecycle`
`apps/demo/src/components/swaps/SwapCard.tsx`: drop `useSwapAllowance`/`useSwapApprove`/`useSwap`/gates,
the 4 error `useState`s, approve/Stellar/NEAR handlers and the `disabled` expression (`:675-686`);
one `useSwapLifecycle` (chainSwitch from `useEvmSwitchChain`, `externalBlocked` from the Bitcoin panels,
`mutationOptions.onSuccess` → `appendOrder`); one primary button labelled by state/strategy
("Approve & Swap (1 signature)" / "Approve, then Swap" / "Swap" / gate actions). Keep quote, selection,
delivery-hook toggle, Bitcoin panels, dialog.

## Tests
- **wallet-sdk-core** (spy real viem clients, `EvmWalletProvider.test.ts` style): local account →
  `'unsupported'` without RPC; chainId forwarded; status mapping incl. missing entry/unknown; throws
  propagate; `sendAtomicBatch` chain mismatch + local rejected, `forceAtomic`, `from` dropped; `waitForBatch` mapping.
- **sdk**: `evmAtomicBatch.test.ts`; `wrappers.test.ts` (5750 raw + wrapped in `TransactionExecutionError`
  → USER_REJECTED, 5760 not); `relay-error-mapping.test.ts` (`srcTxHash` only when passed);
  `detailedStatus.test.ts` (summary matrix); `SwapService.test.ts`: strategy matrix (allowance ok/fails,
  EVM spoke ready/supported/unsupported/missing/throws, Sonic+ready → sequential, Stellar, Solana);
  atomic path (call order ± reset tx, expectedChainId, last receipt hash reaches backend submit-tx and
  relay, 4001/5750 → USER_REJECTED with no approve/sendTransaction, failure/timeout →
  INTENT_CREATION_FAILED + batchId); sequential (approve receipt awaited before createIntent, unconfirmed
  → APPROVE_FAILED); not-required == plain createIntent; analytics events; `swap()` never touches batch
  methods; post-broadcast errors carry `srcTxHash` (keep `solverCode`); #329 legacy/precedence/default/
  ctor override + `expectTypeOf<SwapsClientOptions>()` still assignable to `SodaxOptions['swapsOptions']`.
- **dapp-kit** (node env; mock sub-hooks / capture `mutationFn` like `useSwap.test.ts`): new hooks' keys,
  enabled, invalidations; `utils/swapLifecycle.test.ts` full precedence matrix (stale variables ignored,
  pending wins over param change, post-broadcast error → pending); `useSwapLifecycle.test.ts` `next()`
  dispatch + `reset`; `nearStorageGate.test.ts` undefined chain.

## Verification
From repo root:
```bash
pnpm i --frozen-lockfile && pnpm build:packages
pnpm lint && pnpm checkTs && pnpm check:circular-deps && pnpm test
pnpm check:ai && pnpm check:ai-dev-files
pnpm docs:sync-pages && pnpm check:docs-pages && pnpm check:doc-links && pnpm check:docs-nav
pnpm check:knip && pnpm check-exports && pnpm build
.github/scripts/check-docs-drift.sh origin/main HEAD
```
Mainnet matrix on demo `/swaps-sdk`, small amounts — **gate for merge** (backend/relayer acceptance of a
7702 batch tx is unverified):
1. MetaMask Base USDC, EOA not upgraded (`ready`) → 1 prompt (upgrade + batch) → submit-tx + relay accept hash → `getDetailedStatus` solved + fill hash
2. Same account (`supported`) → 1 prompt, no upgrade
3. Reject upgrade (5750) / 4. reject batch (4001) → USER_REJECTED, no second prompt
5. Sonic ERC-20, Avalanche → sequential, 2 prompts
6. Native ETH Arbitrum → `not-required`, 1 tx
7. Ethereum USDT with stale non-zero allowance → 3-call batch succeeds
8. Allowance already sufficient → `not-required`
9. `swaps.useBackendSubmitTx:false` + batch → client verify/relay accept the 7702 tx
10. apps/node private-key provider → sequential · 11. injected wallet without 5792 → sequential
12. Coinbase Smart Wallet (ERC-4337) on Base → observe (risk) · 13. wrong chain → `needsChainSwitch`
14. Stellar / NEAR / Bitcoin destinations → gates still block through the lifecycle

## Risks / open
- Relayer/solver handling of 7702 self-call txs unverified (matrix 1, 2, 9 decide). ERC-4337 / Safe
  wallets return bundler/multisig txs and may hit the 60s wait → batch id but no tx hash to poll.
- MetaMask `ready` shows an upgrade prompt mid-swap — button copy should warn.
- Strategy query not polled → label can be stale (execution recomputes). Lifecycle stays `pending` if
  `useDetailedStatus` gives up polling.
- Out of scope: #390 (`-999` collision), bridge ctor-param gap, #208 paymaster, other features' batching.

## Outward actions (confirm before doing)
- Comment on #328/#329 (assigned to R0bi7) that the core shipped in #362/#371 and this PR carries the tail.
- Push branch + open the PR (body: closes #302 #328 #329, deviations listed above, matrix results).
- Context repo: commit + push the gh-302 dossier at session end.
