---
type: outcome
repo: sodax-sdks
github: 302
status: Implemented locally — 11 commits on feat/302-swap-lifecycle, not pushed; merge gated on the mainnet matrix
updated: 2026-10-07
related_issues: [gh-328, gh-329, gh-21, gh-208]
---

# Outcome

- PR: not opened yet (needs the user's go-ahead)
- Branch: `feat/302-swap-lifecycle` off `origin/main` @ `93f86c5d`, worktree `sodax-sdks-302`
- Commits: `2c67bc83` … `7c7b9533` (11), 56 files, +2900 / −278
- Gates (local, Node 24.21.0): every commit passed the pre-commit hook (checkTs + build + test,
  21/21 turbo tasks). Branch head: `lint`, `check:circular-deps`, `check:knip`, `check-exports`,
  `check:docs-pages`, `check:docs-nav`, `check:doc-links`, `check:ai`, `check:ai-dev-files`, docs
  drift (`origin/main..HEAD`) all exit 0. SDK tarball 1,010,706 B vs the 1,050,000 B gate.
- Not run: `pnpm test:e2e` (live mainnet, advisory in CI); the mainnet matrix (plan.md § Verification).

## What shipped, by commit

| # | Commit | What |
| - | ------ | ---- |
| 1 | `2c67bc83` feat(types) | Optional `getAtomicBatchSupport` / `sendAtomicBatch` / `waitForBatch` on `IEvmWalletProvider` + batch types |
| 2 | `80599e5e` feat(wallet-sdk-core) | `EvmWalletProvider` over viem `getCapabilities` / `sendCalls(forceAtomic)` / `waitForCallsStatus`; private-key account → unsupported; shared `assertActiveChain`; `defaults.waitForCallsStatus` |
| 3 | `c944f535` feat(sdk) | `summarizeSwapStatus`; `context.srcTxHash` (+ `srcChainKey`) on verify / relay / postExecution failures; optional `srcTxHash` on `MapRelayFailureCtx` |
| 4 | `7c7b68e0` docs(dapp-kit) | `useDetailedStatus` as the swap status read in README + skills (routing, recipe, polling, query keys) |
| 5 | `9c2bcb33` feat(sdk) | `@deprecated useBackendSubmitTx?` back on `SwapServiceConstructorParams` (wins over config); JSDoc names `SwapsOptions` + v3 removal; swap-side compat + type tests; CONFIGURE_SDK snippet |
| 6 | `e9f8744b` refactor(sdk) | `completeSwap` extracted from `swap()`; `swap()` now awaits the completion inside its guard (a fallback rejection becomes UNKNOWN instead of escaping) |
| 7 | `ac929426` feat(sdk) | `getApprovalStrategy` + `swapWithApproval`; `evmAtomicBatch.ts`; 5750 → USER_REJECTED arm; `SwapWithApprovalError` |
| 8 | `96137e3c` feat(dapp-kit) | `useSwapApprovalStrategy` (query, not polled) + `useSwapWithApproval` (mutation, registered in `_mutationContract.test.ts`) |
| 9 | `5730b9db` feat(dapp-kit) | `useSwapLifecycle` + pure `utils/swapLifecycle.ts`; `useNearStorageGate` accepts undefined chain, exports types |
| 10 | `ac35612c` feat(demo) | `SwapLiveCard` via `useDetailedStatus`; env-pinned / hash-less orders keep the solver poll |
| 11 | `7c7b9533` feat(demo) | `SwapCard` on `useSwapLifecycle`: one button, label from state/strategy; 743 → 684 lines |

## Deviations from the issues (state in the PR)

- No viem bump (#302 asked for one): 2.29.2 already ships the stable EIP-5792 actions.
- No new error code (#302): repo rule — `context.reason` / `batchId` / `statusCode` / `approvalStrategy` instead.
- Public SDK surface is `getApprovalStrategy` + `swapWithApproval`; `createIntentInAtomicBatch` is private.
- Sonic hub never batches in v1 (hub tx goes straight to the solver; MetaMask has no 5792 on Sonic).
- No fallback to separate transactions once the wallet received a batch.
- #329: bridge has the same constructor-param gap — left as is.
- #328: no rename of `getDetailedStatus` / `useDetailedStatus`.

## Follow-ups

- **Mainnet matrix** (plan.md § Verification) — the merge gate. Rows 1, 2, 9 decide whether backend
  submit-tx and the relayer accept a 7702 batch tx hash.
- #390 (`resolveSolverStatus` −999 collision) — untouched.
- #208 (paymaster) can extend `EvmSendBatchOptions` with capabilities.
- Batching for bridge / money market once the swap pilot is proven.

## Draft PR body — NOT POSTED

> **feat: swap lifecycle — EIP-5792 one-signature approve + swap, universal status, `useSwapLifecycle`**
>
> Closes #302, closes #328, closes #329.
>
> **#302 — approve + swap in one signature.** `IEvmWalletProvider` gains three optional EIP-5792
> methods, implemented by `EvmWalletProvider` over viem's stable `getCapabilities` / `sendCalls` /
> `waitForCallsStatus` (no viem bump needed — 2.29.2 already ships them; the issue's "installed 2.45.1"
> was not the case). `sodax.swaps.swapWithApproval` folds the approval into `swap()`: none when the
> allowance suffices; `[reset?, approve, deposit]` as one atomic batch on an EVM spoke whose wallet
> reports `supported` or `ready`; otherwise approve → wait → swap. `getApprovalStrategy` exposes the
> choice. Completion is `swap()`'s. dapp-kit: `useSwapWithApproval`, `useSwapApprovalStrategy`.
>
> **#328 — status.** The core shipped in #371 (`getDetailedStatus` / `useDetailedStatus`). This adds
> `summarizeSwapStatus` (one vocabulary), `context.srcTxHash` on post-broadcast `swap()` failures so a
> caller can keep polling, the demo `/swaps-sdk` card on `useDetailedStatus`, and the docs/skills that
> still routed status to `useStatus`.
>
> **#329 — options.** The core shipped in #362. #362 also dropped `useBackendSubmitTx` from
> `SwapServiceConstructorParams`; it is back as `@deprecated` (honoured). Swap-side compat and
> type-level tests, a migration snippet, and the v1→v2 skill note.
>
> **`useSwapLifecycle`** — one hook for a swap form: strategy, Stellar/NEAR destination gates, injected
> chain switch, `useSwapWithApproval`, `useDetailedStatus` → one discriminated `state` + `next()`. The
> demo `SwapCard` is rebuilt on it (first instance of the #21 controller-hooks design).
>
> **Deliberate choices** — no new error code (detail in `context`); no fallback after a batch reached
> the wallet (USER_REJECTED on reject / declined upgrade 5750); Sonic hub stays sequential; bridge's
> identical constructor-param gap left for a follow-up; `swap()` now catches a rejection from its
> fallback path as UNKNOWN (was an escaping rejection).
>
> **Verification** — local gates green (list). **Mainnet matrix: TODO before merge** — table from
> plan.md § Verification, results filled in.

## Draft issue comments — NOT POSTED

> **#328** — The core of this landed in #371: `sodax.swaps.getDetailedStatus({ srcChainKey, srcTxHash })`
> reads the backend submit-tx record first and falls back to the solver via the relay packet, and
> dapp-kit wraps it as `useDetailedStatus`. #<PR> finishes it: `summarizeSwapStatus` collapses the two
> vocabularies, post-broadcast `swap()` errors carry `context.srcTxHash` so you can keep polling, and
> the demo + docs now use it as the default status read.

> **#329** — Done in #362 (deprecated `swapsOptions` / `SwapsClientOptions`, default ON). One gap left:
> #362 removed `useBackendSubmitTx` from `SwapServiceConstructorParams`; #<PR> restores it as
> `@deprecated` and adds swap-side compat tests + a migration snippet. I read "deprecate
> useBackendSubmitTx" as the legacy `swapsOptions.useBackendSubmitTx`, not removing the flag — shout if
> you meant otherwise.
