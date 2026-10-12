---
type: process
repo: sodax-sdks
github: 505
updated: 2026-10-12
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### Session 1 — 2026-10-12 — research + plan (no code)

- Read at `feat/506-post-broadcast-src-tx-hash` = #504 head `ab1ec388` + #509 commit `2ec0db1d`;
  `origin/main` @ `7cece954` is not ahead on these files. #504 still a draft.
- API lane facts (agent map, spot-checked): no dapp-kit hook signs the intent tx or calls submit-tx —
  apps chain `useSwapsApiApproveAndBroadcast` + their own per-family signer (`apps/playground/src/lib/execution.ts`
  `broadcast`, demo `swaps-api/lib/signAndBroadcast.ts`). `runApprovalPlan` (`dapp-kit/src/utils/approvalPlan.ts`)
  has senders for hub / EVM spoke / Stellar only. Intent tx has no `chainId`; chain comes from `body.srcChainKey`.
- SDK batch code read directly: `SwapService.ts` 782-1071 (`getApprovalStrategy`, `swapWithApproval`,
  `createIntentInAtomicBatch`, `sendAtomicBatch`, `approveThenCreateIntent`, `completeSwap`).
  `SwapService.test.ts` asserts `reason`/`code`, not message text, so neutral messages are safe.
- `evmAtomicBatch.ts` is internal (not in the barrel) — dapp-kit cannot use it, hence the public export in PR A.
- Error wrappers (`intentCreationFailed`, `approveFailed`, `allowanceCheckFailed`) already take any `SodaxFeature`.
- #509 only touches the bridge/vault fallback-step methods — no overlap with extracting `completeBridge` /
  `completeVaultSwap`.
- Leverage yield has no spoke approval of its own; docs/demo use `sodax.swaps.isAllowanceValid/approve`.
  `LeverageYieldService` has no `SwapService` ref (`Sodax.ts:122-127`) — resolve the same spender locally.

### Session 2 — 2026-10-12 — PR A implemented (uncommitted)

- Branch `feat/505-api-lane-batch-approval` cut from `origin/feat/302-swap-lifecycle` @ `ab1ec388`;
  **upstream unset** (switch -c auto-tracked #504's branch — a bare push would have gone there).
  Node 22.15 (engines >=22.12; the Node 26 landmine does not apply).
- A1/A2 — `packages/sdk/src/shared/utils/approvalBatch.ts`: `ApprovalStrategy`, `resolveApprovalStrategy`,
  `sendApprovalBatch`, `ATOMIC_BATCH_REFUSED` / `ATOMIC_BATCH_UNCONFIRMED` / `ACCOUNT_UPGRADE_DECLINED`
  (moved from `swap/errors.ts`), named-exported from `shared/index.ts`. `SwapService` now calls them;
  `SwapApprovalStrategy = ApprovalStrategy`. Gate held: `SwapService.test.ts` byte-identical, 281/281.
  New `approvalBatch.test.ts` (19). Mutations (`receipts.at(0)`, drop 500 from nothing-landed) caught by
  both suites. sdk vitest 3003/3003, checkTs, madge, knip, check-exports green.
- **Deviation:** `confirmApproval` NOT extracted in PR A — single consumer until bridge/LY; moves to PR B.
- A3 — `useSwapsApiBroadcastWithApproval` (+13 tests, contract + apiKeyWire rows, barrel). Order: EVM-chain
  guard → `/swaps/approve` → account check vs `body.srcAddress` and `intentTx.from` → strategy → batch, or
  `runApprovalPlan` + `sendTransaction`. One cast (`approve` txs → `EvmRawTransaction`) with a why-comment,
  same as `approvalPlan.ts`. Mutation (always throw on batch error) caught. dapp-kit 895/895, checkTs green.
  Removed no-op `biome-ignore noExplicitAny` lines from the new test (rule is off; siblings carry them).
- A4 — playground: `executeSwap` gains deps `approvalStrategy` + `approveAndSign`; batch path skips
  `approving` and signs in `signing`. `evmDeposit()` reuses `broadcast`'s checks (extracted `assertSigner`).
  `useExecution`: `upgradeDeclined` ref (next try `allowAccountUpgrade: false`), `heldReview` state — an
  unconfirmed batch disables that snapshot's action ("Check your wallet activity", `SwapReview.tsx`).
  `executionError` gives the unconfirmed message. +7 tests; 376/376, checkTs, build green.
- A5 — SWAPS.md (API-lane paragraph), WALLET_PROVIDERS.md, dapp-kit README; skills: sdk `swaps-api.md`
  (new section; fixed "reset + approve cannot be batched" which is only true for separate txs), dapp-kit
  hooks-index / querykey-conventions / architecture. `docs:sync-pages` regenerated 3 pages; check:ai,
  doc-links, docs-pages, docs-nav green. `docs:validate` not run — no `mint` CLI locally.

## Findings

## Changes During Work
