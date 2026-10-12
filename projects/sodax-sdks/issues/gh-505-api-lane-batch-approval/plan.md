---
type: plan
repo: sodax-sdks
github: 505
updated: 2026-10-12
related_issues: [gh-507, gh-302, gh-506]
---

# Plan — #505 API-lane one-signature approve + intent (PR A of 2; PR B is gh-507)

> Reviewed + approved by the user 2026-10-12 (second pass, after a detailed code review). Context, findings and decisions cover both PRs; PR B lives in `../gh-507-bridge-vault-batch-approval/plan.md`.

## Context

PR #504 (draft, `origin/feat/302-swap-lifecycle` @ `ab1ec388`) shipped EIP-5792 one-signature
approve + swap, but only for the SDK swap lane. These two follow-ups extend it:

- **#505**: the swaps **API lane**, which the playground and sodax.com use. Users there still sign 2–3 times.
- **#507**: the SDK lane for **bridge** and **leverage-yield vault deposits**. Approvals are for the
  exact amount, so almost every ERC-20 deposit from an EVM spoke takes two signatures.

Mainnet results so far (context repo, gh-302 process.md Session 3): a 7702 batch hash was relayed and
went through backend `submit-tx` to `solved` on Base. Both PRs **stack on #504** and keep its rules:

- Sonic stays sequential.
- Never fall back after the wallet has received the batch.
- 4001/5750 → `USER_REJECTED`.
- No new global error codes. Details go in `error.context`.

All line numbers below are at #504's head. The local checkout is now `main` (clean), so read #504
with `git show origin/feat/302-swap-lifecycle:<path>`.

## Review findings that changed the plan

1. **Step 0 is done.** The #509 doc fix is committed as `b33f91f9` and pushed. The checkout moved to `main`.
2. **Batching is safe for every lane.** None of the three paths simulates against the spoke allowance:
   - SDK raw deposit just builds the tx (`EvmSpokeService.ts:157-175`).
   - SDK simulation is the hub-side `simulateRecvMessage` (`SpokeService.ts:604-627`, `:818`).
   - Backend `/swaps/intents` is `sodax.swaps.createIntent({ raw: true })` with no allowance check
     (sodax-backend `apps/swaps-api/src/api/swaps/swaps.service.ts:149-152, 208-211`).

   The comment in #501, "deposit simulates against the new allowance", is about the wallet's own gas
   estimate in signed mode, not the SDK.
3. **The issue's "`value` is a string, convert it" is outdated.** The swaps-api client already parses
   it to bigint (`packages/swaps-api/src/rawTxSchemas.ts:22,38-43`, tested `src/schemas.test.ts:158`).
   No conversion needed.
4. **"Swap tests unchanged" is achievable, with one constraint.** The #504 batch tests spy on public
   methods: `sodax.swaps.isAllowanceValid`, `buildApproveTxs`, `createIntent`, `approve` and
   `sodax.spoke.waitForTxReceipt`. So the extracted helper must still be reached through
   `this.<method>` and `this.spoke.waitForTxReceipt(...)`, never a detached function reference.
5. **madge counts type imports** (`packages/sdk/package.json:61`). The helper must not import
   `SpokeService`, even as a type. It takes the receipt wait as a structurally typed callback.
   `errors/` imports nothing from `shared/`, so importing the error wrappers is cycle-free.
6. **`_apiKeyWire.test.ts` needs the API call first.** Its rows assert the backend request is the
   hook's first step and pass `walletProvider: {}` with a **Sonic** source body (`:70-80`, `:374-382`).
   So the new hook fetches `/swaps/approve` before any wallet call, and it must accept the hub.
7. **Unconfirmed batch in the playground: double-deposit risk.** On error, `useExecution.ts:312-321`
   re-arms the action. A batch reported `atomic-batch-unconfirmed` may still land, so a second click
   could sign a second deposit. Handled in A4.
8. **PR #501 (R0bi7, open, +3398/−1690) rewrites the leverage-yield demo**, including
   `pages/leverage-yield/page.tsx`, into `components/leverage-yield/hooks/useFlows.ts` and friends.
   Handled in B5.
9. **PR #503 (ours) touches `SwapService.ts`** (constructor), in a different region from A1. Expect a
   trivial merge.
10. **Error types to reuse, not redefine:**
    - `ApprovalStrategyError` (`swap/errors.ts`, `SodaxError<'ALLOWANCE_CHECK_FAILED'>`) is already
      generic. Bridge and leverage yield reuse it.
    - `isWalletRejection` trusts `SodaxError.code`, and the canonical `USER_REJECTED` message
      ("User rejected the request") already matches the playground's `isUserRejection` regex.

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

## PR A — #505 `feat(sdk,dapp-kit,playground): approve + intent in one signature for the swaps API lane`

Branch `feat/505-api-lane-batch-approval`, created from `origin/feat/302-swap-lifecycle`, with that
branch as the PR base. Setup: Node 24, then `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages`.

### A1. `refactor(sdk)`: move the batch logic into a shared helper (swap behaviour unchanged)

New file `packages/sdk/src/shared/utils/approvalBatch.ts`, built on the internal primitives in
`evmAtomicBatch.ts` (which stays internal):

- `type ApprovalStrategy = 'not-required' | 'atomic-batch' | 'sequential'`.
  - `SwapApprovalStrategy` becomes an alias of it.
  - `ATOMIC_BATCH_UNCONFIRMED` and `ACCOUNT_UPGRADE_DECLINED` move here from `swap/errors.ts:45,52`.
  - The import path stays `@sodax/sdk`.
- `resolveApprovalStrategy({ srcChainKey, walletProvider, allowAccountUpgrade = true })` returns
  `'atomic-batch' | 'sequential'`.
  - Use it once the allowance is known to be short.
  - It is `SwapService.ts:801-811`: EVM spoke + `canSendAtomicBatch` + `'supported'`, or `'ready'`
    with the upgrade allowed.
- `sendApprovalBatch({ walletProvider, srcChainKey: EvmSpokeOnlyChainKey, txs, timeoutMs, feature, context })`
  returns `Result<{ txHash, batchId }, SodaxError<'USER_REJECTED'|'INTENT_CREATION_FAILED'|'TX_VERIFICATION_FAILED'>>`.
  - It is `SwapService.ts:939-1003` with feature-neutral messages. The `CreateIntentResult` wrapping
    goes back to the caller.
  - The hub is excluded by the type. `expectedChainId` is derived internally.
  - A provider without the batch methods is treated as a refusal.
  - Outcomes, unchanged from #504:

    | Case | Code | `context.reason` |
    | --- | --- | --- |
    | Refused (4200, -32601, 5700, 5710, 5740, 5760) | `INTENT_CREATION_FAILED` | new exported `ATOMIC_BATCH_REFUSED` |
    | 5750 | `USER_REJECTED` | `ACCOUNT_UPGRADE_DECLINED` |
    | Status 400/500 | `INTENT_CREATION_FAILED` | `'atomic-batch-failed'` |
    | Anything else after the send | `TX_VERIFICATION_FAILED` | `ATOMIC_BATCH_UNCONFIRMED`, plus `batchId` |

  - Keep `Math.max(1, timeoutMs)` and the "1 receipt or one per call" rule.
- `confirmApproval({ waitForTxReceipt, txHash, chainKey, feature, context })` is internal and not
  exported. It returns `APPROVE_FAILED` with `approve-not-confirmed` (`SwapService.ts:1028-1038`).
  `waitForTxReceipt` is a structural callback; per finding 5, do not import `SpokeService`.
- `SwapService` keeps `getApprovalStrategy`, `swapWithApproval` and the two private builders. They
  become thin callers that still go through `this.*`, per finding 4.
- **Gate:** `git diff origin/feat/302-swap-lifecycle -- packages/sdk/src/swap/SwapService.test.ts` is
  empty, and `npx vitest run src/swap/SwapService.test.ts` passes. New unit tests go in
  `shared/utils/approvalBatch.test.ts`. `evmAtomicBatch.test.ts` stays as is.

### A2. `feat(sdk)`: export the helper

Add **named** re-exports, not `export *`, so the `evmAtomicBatch` primitives stay internal. The
pattern is `swap/index.ts:7-10`. Exported names:

- `ApprovalStrategy`
- `resolveApprovalStrategy`
- `sendApprovalBatch`
- `ATOMIC_BATCH_REFUSED`, `ATOMIC_BATCH_UNCONFIRMED`, `ACCOUNT_UPGRADE_DECLINED`

Refusal is detected with `error.context?.reason === ATOMIC_BATCH_REFUSED`. No new predicate: the name
`isAtomicBatchRefused` is already taken by the raw-code check.

### A3. `feat(dapp-kit)`: `useSwapsApiBroadcastWithApproval`

`packages/dapp-kit/src/hooks/swapsApi/useSwapsApiBroadcastWithApproval.ts`. Mutation key
`['swapsApi','broadcastWithApproval']`. Same shape as `useSwapsApiApproveAndBroadcast.ts`.

- **Vars:** `{ body: CreateIntentParamsV2, intentTx: EvmRawTransaction, walletProvider: IEvmWalletProvider, apiConfig?, allowAccountUpgrade?, onProgress? }`.
- **Order** (finding 6):
  1. Pure guard: the source is the hub or an EVM spoke.
  2. `unwrapResult(sodax.api.swaps.approve(body, apiConfig))`.
  3. Wallet guard: `getWalletAddress()` equals `body.srcAddress` and `intentTx.from`, case-insensitive.
  4. `resolveApprovalStrategy`.
  5. `'atomic-batch'` → `sendApprovalBatch([resetTx?, tx, intentTx])`.
  6. `'sequential'`, or a refusal → `runApprovalPlan` (`utils/approvalPlan.ts`) with the same plan,
     then `sendTransaction(intentTx, { expectedChainId })`.
- **Returns** `{ txHash, approvalStrategy, approval? }`.
- **Errors:** batch errors are `SodaxError`s. Sequential errors stay as raw wallet errors, the same as
  the existing approve hook. Document both.
- `onSuccess` awaits the invalidation of `['swapsApi','allowance']`.
- **Registration:** `_mutationContract.test.ts`, `_apiKeyWire.test.ts` (row like `:374-382`), barrels.
- **Tests** use the existing pattern: mock `useSafeMutation`, then call `captured.mutationFn`. Cases:
  - batch: one send, txHash taken from the receipt
  - refused → sequential with the same plan, intent sent once
  - non-batch wallet → sequential
  - user rejects the batch → `USER_REJECTED`, no approve sent
  - unconfirmed → `TX_VERIFICATION_FAILED`, no fallback
  - hub → sequential
  - sender mismatch → throws before any send
  - non-EVM source → throws before the API call

### A4. `feat(playground)`: one signature on batch-capable wallets

- **`lib/execution.ts` `executeSwap`.** When `checkAllowance` reports a short allowance on an EVM
  spoke, call a new dep, `approvalStrategy(body)`, which wraps `resolveApprovalStrategy` through
  `@sodax/dapp-kit`.
  - `'atomic-batch'`: skip `approving`, then `getDeadline` → `createIntent`. In the `signing` phase,
    a new dep `approveAndSign(body, tx)` replaces `sign`.
  - Otherwise: today's path, untouched. The re-quote around approval stays.
  - `onBroadcast` still runs before `submitTx`.
- **`hooks/useExecution.ts`** wires the hook. The batch dep keeps the existing payload checks:
  `isEvmTransfer(tx)` for a malformed payload, chain binding, and the sender check.
- **Unconfirmed** (finding 7): on `TX_VERIFICATION_FAILED` with `ATOMIC_BATCH_UNCONFIRMED`, show
  "Your wallet accepted the swap but it has not confirmed — check your wallet activity before swapping
  again." Do not re-arm the action for that snapshot; the visitor has to close and review again.
  Recovery through `waitForBatch(batchId)` is out of scope, the same known gap as #504.
- **Declined upgrade:** `ACCOUNT_UPGRADE_DECLINED` sets an in-memory flag, so the next attempt uses
  `allowAccountUpgrade: false`. No storage, per the playground's storage rule.
- **`lib/progress.ts`:** only a wording change if it is needed. The `signing` label already reads
  "Confirm in your wallet".
- **Tests** in `lib/execution.test.ts`:
  - batch branch order: no `approve` call, `onBroadcast` before `submitTx`
  - sequential path unchanged
  - an unconfirmed batch does not resubmit

### A5. Docs and skills (Docs Drift: SDK and dapp-kit source changed)

- `packages/sdk/docs/SWAPS.md` § "Approve and Swap in One Signature" (`:635`): an API-lane paragraph
  and the exported helper. This page is mapped.
- `WALLET_PROVIDERS.md` (mapped): the list of batch-method consumers.
- `packages/dapp-kit/README.md` (mapped).
- `SWAPS_API.md` is **unpublished**, so it is optional and does not count toward Docs Drift.
- Run `pnpm docs:sync-pages`.
- Skills:
  - `sodax-dapp-kit`: swaps-api feature and recipe, `reference/hooks-index.md`,
    `reference/querykey-conventions.md`
  - `sodax-sdk`: the swap feature (helper exports)

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
