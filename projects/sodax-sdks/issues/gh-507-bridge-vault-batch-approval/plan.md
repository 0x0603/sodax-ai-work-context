---
type: plan
repo: sodax-sdks
github: 507
updated: 2026-10-12
related_issues: [gh-505, gh-302, gh-506]
---

# Plan — #507 bridge + vault one-signature approve + deposit (PR B of 2, stacked on gh-505)

> Reviewed + approved by the user 2026-10-12. Context, review findings, decisions and the shared helper (A1/A2) are in `../gh-505-api-lane-batch-approval/plan.md` — PR B reuses that helper.

## Decisions (with why)

1. **Order: #505 first, #507 stacked on #505.** Both need the batch logic out of `SwapService`. #505
   has more value (playground now, sodax.com next). It is also the consumer that justifies exporting
   the helper, since dapp-kit cannot import SDK internals.
2. **The #505 hook stops at the broadcast.** The caller still calls `/submit-tx`, because the
   playground must persist the broadcast before submitting (`apps/playground/AGENTS.md`).
3. **The #505 hook is for an EVM source (hub or spoke) whose allowance is short.** The caller passes
   `intentTx` in. Signing for every chain family stays in the app.
4. **No API-lane approval-strategy read hook.** The playground decides at execution time with the
   exported SDK function.
5. **Leverage yield does not depend on `SwapService`.** It resolves the swap spender itself
   (`config.solver.intentsContract` for the hub, `assetManager` for an EVM spoke; `SwapService.ts:321`,
   `:1246-1264`) and calls `SpokeService` directly.
6. **The playground batches `'ready'` wallets too**, per gh-302 settled decision #1. A declined upgrade
   switches that session to `allowAccountUpgrade: false`. This is a one-line flip if you would rather
   the partner widget never asks MetaMask to upgrade.

## PR B — #507 `feat(sdk,dapp-kit,demo): approve + deposit in one signature for bridge and leverage-yield vaults`

Branch `feat/507-bridge-vault-batch-approval`, created from PR A's branch, with that branch as the PR
base. It reuses A1's helper inside the SDK.

### B1. `refactor(sdk)`: extract `completeBridge` and `completeVaultSwap`

- `BridgeService.bridge()` `:517-531` → `private completeBridge(_params, created)`.
- `LeverageYieldService.vaultSwap()` `:1255-1274` → `private completeVaultSwap(_params, created)`.
- Same pattern as `SwapService.completeSwap` (`:1048-1071`).
- Keep each outer catch as it is: `executionFailed` for bridge, `unknownFailed` for leverage yield.
- #509 only touches the fallback-step methods, so there is no overlap.
- Existing tests stay unchanged.

### B2. `feat(sdk)`: bridge

- `getApprovalStrategy(_params)`: bridge's `isAllowanceValid` (`:212-265`) +
  `resolveApprovalStrategy` → `Result<ApprovalStrategy, ApprovalStrategyError>`.
- `bridgeWithApproval(_params: BridgeParams<K,false> & { allowAccountUpgrade? })` →
  `TxHashPair & { approvalStrategy }`.
  - Wrapped in `trackResult('bridge','bridgeWithApproval')`.
  - Batch: `buildApproveTxs` (`:391`) + `createBridgeIntent({ raw: true })` (`:697`) →
    `sendApprovalBatch` → `{ tx: txHash, relayData }`.
  - Sequential: `approve` (`:284`) → `confirmApproval` → `createBridgeIntent`.
  - Then `completeBridge`.
- `bridge/errors.ts`:
  - add `'bridgeWithApproval'` to `BridgeAction`
  - `BridgeWithApprovalErrorCode = BridgeOrchestrationErrorCode | 'APPROVE_FAILED' | 'ALLOWANCE_CHECK_FAILED'`.
    Both codes already exist in `BridgeErrorCode`, and this is what the issue's "new error codes" means.
  - `isBridgeWithApprovalError`
- Raw creation is safe (finding 2).

### B3. `feat(sdk)`: leverage yield

- Private allowance, approve and build-approve that mirror `SwapService.ts:1239-1448` for hub, EVM
  spoke and Stellar, using spender `config.solver.intentsContract` or `assetManager`.
- `getApprovalStrategy(_params)`: `hubWalletSwap` (withdraw) → `'not-required'`. Otherwise allowance
  plus `resolveApprovalStrategy`.
- `vaultSwapWithApproval(_params)` → `VaultSwapResponse & { approvalStrategy }`.
  - Batch: `createVaultIntent({ raw: true })` (`:996`) + build-approve → `sendApprovalBatch`.
  - Then `completeVaultSwap`, which keeps `leverageYieldPartnerFee` and `submitTx` with `operation`.
  - Never route through `swapWithApproval`.
- `leverageYield/errors.ts`: the `'vaultSwapWithApproval'` action, a `VaultSwapWithApprovalErrorCode`
  union, and a guard.
- Out of scope: the hub-side `LeverageYieldService.approve`, and positions.

### B4. `feat(dapp-kit)`: hooks

Mirror `swap/useSwapApprovalStrategy.ts` and `swap/useSwapWithApproval.ts`:

| Hook | Key | Invalidates |
| --- | --- | --- |
| `useBridgeApprovalStrategy` | `['bridge','approvalStrategy', srcChainKey, srcAddress, srcToken, amount, allowAccountUpgrade]` | — |
| `useBridgeWithApproval` | `['bridge','bridgeWithApproval']` | balances, `['bridge','allowance']`, `['bridge','approvalStrategy']` |
| `useLeverageYieldApprovalStrategy` | — | — |
| `useLeverageYieldVaultSwapWithApproval` | `['leverageYield','vaultSwapWithApproval']` | balances, `['swap','allowance']` (the vault allowance is read through `useSwapAllowance`), `['leverageYield','approvalStrategy']` |

Add tests, manifest rows and barrel exports.

### B5. `feat(demo)`: one button

- **Bridge.** `components/bridge/BridgeDialog.tsx`:
  - Drop the Approve button (`:243-251`) and the `!hasAllowance` gate (`:155-162`).
  - Bridge calls `bridgeWithApproval`, labelled from the strategy, e.g. "Approve & Bridge (1 signature)".
  - Switch Chain, Stellar and NEAR gates stay.
  - Unconfirmed → message, and the button stays disabled until the dialog closes.
  - Declined upgrade → "Bridge without upgrading", copying `components/swaps/SwapCard.tsx`.
- **Leverage yield** (finding 8). Make the smallest change on today's `pages/leverage-yield/page.tsx`:
  `handleApprove` + `handleSwap` become one deposit action, `:388-440`, buttons `:785-813`. Withdraw
  is untouched.
  - The PR body names #501.
  - If #501 merges first, the change moves into its `useFlows.ts` deposit flow instead, which today
    is `isAllowanceValid → approve → waitForTxReceipt → vaultSwap`.
  - No comment on #501 itself.

### B6. Docs and skills

- `BRIDGE.md` and `LEVERAGE_YIELD.md` get "… in one signature" sections, copied from `SWAPS.md:635-706`,
  plus their method and error tables.
- `WALLET_PROVIDERS.md` and `dapp-kit/README.md`.
- Regenerate the `docs/` copies.
- Skills:
  - `sodax-sdk`: bridge and leverage-yield
  - `sodax-dapp-kit`: bridge and leverage-yield SKILL / features / recipes,
    `leverage-yield-product-anatomy.md`, `hooks-index.md`, `querykey-conventions.md`,
    `architecture.md:299`
- The starter repo and intents-whitelabel are only mentioned in the PR.

## Verification

Run per PR, from the repo root, on Node 24:

- `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages`
- `pnpm checkTs`, `pnpm test`
- Biome on the touched files only. Never run `pnpm pretty`.
- `pnpm check:circular-deps`, `pnpm --filter @sodax/sdk check:knip`, `pnpm check-exports`
- `pnpm check:ai`, `pnpm check:doc-links`, `pnpm check:docs-pages`, `pnpm check:docs-nav`.
  `pnpm docs:validate` needs the `mint` CLI.
- Playground: `pnpm --filter @sodax/playground test`, then `checkTs`, then `build`.
- **A1 gate:** `SwapService.test.ts` byte-identical to #504's copy and green. **B1 gate:** the bridge
  and leverage-yield tests are unchanged and green.

Mainnet. The user runs these with a funded MetaMask on Base or Arbitrum, on the Vercel previews.

**#505, playground preview:**

1. Account not upgraded, USDC: one prompt plus the upgrade, then `submit-tx` reaches `solved`.
2. Same account again: one prompt.
3. Reject the batch: no second prompt.
4. Decline the upgrade, then retry: two prompts, no upgrade prompt.
5. USDT with an old allowance: a 3-call batch.
6. Sonic, or a wallet without 5792: today's two prompts.

**#507, demo preview:**

1. Bridge an ERC-20 from Base: one prompt, then `executed`.
2. Leverage-yield deposit from Base: one prompt, then `solved`, with `operation: deposit` on the backend.
3. Withdraw: unchanged.
4. Decline the upgrade: the "without upgrading" path.

## Context repo and merge

- Context folders `gh-505-api-lane-batch-approval/` and `gh-507-bridge-vault-batch-approval/` already
  exist. Refresh their `plan.md` from this file and update `brief.md` (Step 0 is done).
- Merge order: #504 → (#509, PR A) → PR B. When a base lands, merge `main` in and retarget. Never rebase.
- If #504 changes its batch code later, merge it in and re-apply the change in `approvalBatch.ts`.
- Commits carry no AI attribution and no `#123` refs. Commits and pushes happen only when the user asks.
