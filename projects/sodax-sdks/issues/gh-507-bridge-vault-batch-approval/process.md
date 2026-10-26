---
type: process
repo: sodax-sdks
github: 507
updated: 2026-10-15
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### Session 1 — 2026-10-12 — research + plan (no code)

- Shared research log for both PRs: `../gh-505-api-lane-batch-approval/process.md` § Session 1.

### Session 2 — 2026-10-12 — implementation

- Branch `feat/507-bridge-vault-batch-approval` from `feat/505-api-lane-batch-approval` @ `67bd317a` (PR #511).
- `confirmApproval` moved into `approvalBatch.ts` (structural `waitForTxReceipt` callback, madge-safe);
  SwapService's sequential path uses it — swap tests 270/270 unchanged. `ApprovalStrategyError(Code)`
  moved from `swap/errors.ts` to the shared module (same `@sodax/sdk` export) so bridge/LY don't import swap.
- B1: `completeBridge` / `completeVaultSwap` extracted; 335 bridge+LY tests unchanged and green.
- B2 bridge: `getApprovalStrategy` wraps the bridge allowance read as `ALLOWANCE_CHECK_FAILED` (mirrors swap);
  outer catch `executionFailed` like `bridge()`. +12 tests. Mutations (refusal fallback, skipped confirm) caught.
- B3 LY: private `depositSpender` / `isDepositAllowanceValid` / `buildDepositApproveTxs` / `approveDeposit`
  via `SpokeService` (LY's public `approve` / `isAllowanceValid` are the hub-vault ones — names taken).
  Withdraw → `'not-required'` before any read. Per-intent `partnerFee` passed into the raw
  `createVaultIntent`. +10 tests; mutations (drop partnerFee, drop withdraw short-circuit) caught.
- SDK totals: 3026/3026, checkTs, madge, knip green.
- B4: 4 hooks + 4 test files (mocked-wrapper pattern), manifest rows. dapp-kit 921/921, checkTs green.
- B5: BridgeDialog — Approve button gone, one action labelled from `useBridgeApprovalStrategy`,
  `unconfirmedBatchId` hold until reopen, decline → "Bridge without upgrading". LY page — allowance/approve
  branches gone, `useLeverageYieldVaultSwapWithApproval`, same hold/decline handling; withdraw untouched.
  Demo AGENTS.md bullet added. Demo checkTs green. Kept the LY edit small because of PR #501 (R0bi7).
- B6: BRIDGE.md, LEVERAGE_YIELD.md, WALLET_PROVIDERS.md, dapp-kit README (+ regenerated docs copies);
  skills: sdk bridge/LY SKILL + features, dapp-kit bridge/LY SKILL + features + recipes + hooks-index +
  querykey-conventions, wallet-sdk-core evm. check:ai, doc-links, docs-pages, docs-nav green.

### Session 3 — 2026-10-12 — review fixes

- Shared log: `../gh-505-api-lane-batch-approval/process.md` § Session 3 (review of the whole stack).

### Session 4 — 2026-10-12 — rubric review fixes

- Shared log: `../gh-505-api-lane-batch-approval/process.md` § Session 4.

- 2026-10-15: merged #511's main sync `63c4e818` as `55bbca01`; see `../gh-505-api-lane-batch-approval/process.md` § 2026-10-15.

- 2026-10-15: R0bi7 dual-agent review issuecomment-6191194626 (on `55bbca01`), Medium: an unconfirmed bridge / vault
  batch that lands later has no SDK resume. Verified: `BridgeService.ts:698` and `LeverageYieldService.ts:1452` return
  the `ATOMIC_BATCH_UNCONFIRMED` error before `completeBridge` / `completeVaultSwap`; no `resumeBatchId` on either
  API; nothing relays a deposit nobody submits (`fallbackBridgeSteps` comment); demo only offers "I checked — start
  over" (`BridgeDialog.tsx:255`, LY `page.tsx:829`) → a second deposit. Not fund loss: anyone can relay by hash, and
  `confirmApprovalBatch`, `submitTransaction`, `leverageYield.notifySolver` are public, but undocumented. Same gap
  as swap's d2cc44f7 (fixed in #504). Proposed: fix in #512 by mirroring `resumeBatchId` / `resumeBatchCallCount`.
- 2026-10-15: fixed (uncommitted, worktree `../sodax-sdks-512` on `55bbca01`), mirroring swap's resume:
  - SDK: `resumeBatchId` / `resumeBatchCallCount` on `BridgeWithApprovalParams` and `VaultSwapWithApprovalParams`;
    private `resumeAtomicBatch` in both services: `confirmApprovalBatch` → `submitTransaction` by hash →
    `waitUntilIntentExecuted`; LY then `EvmSolverService.getIntent(hub tx)` + `notifySolver`. Skips strategy and
    backend submit-tx (relayData is lost). Relay failures carry `srcTxHash`; LY solver/intent-read failures also
    `dstTxHash` (matches #509's direction). TSDoc on both `*WithApproval` methods.
  - Tests: bridge +10, LY +11 (20 fail on the old services); dapp-kit hook pass-through +1 each.
  - Demo: hold is now `{ batchId, callCount, order|payload(+summary) }`; "Check the batch again" resumes through
    `useWalletProvider({ xChainType: 'EVM' })`; releases on success or `atomic-batch-failed`; "start over" stays.
  - Docs: BRIDGE.md resume section + example, LEVERAGE_YIELD.md, regenerated pages, demo AGENTS.md, skills
    (error-codes row, sdk bridge/LY features, public-api comment, dapp-kit bridge/LY features).
  - Gates: sdk checkTs + test 3087, dapp-kit checkTs + test 931, demo checkTs, `pnpm lint`, check:ai, docs-pages,
    doc-links, docs-nav, ai-dev-files, sdk knip, circular-deps, docs-drift vs `origin/feat/505` (throwaway tree).
  - Committed `57ac69f5` (signed, hook ran), merged #511's `a16b7f57` as `b0a4f33a` (0 conflicts, playground only;
    gitleaks + checkTs/build/test by hand), pushed. Review pass added the `confirmApprovalBatch` note to the error-codes row.
  - Synced #511's analytics fix `472e45c0` as merge `6dff5bc8` (hook ran), pushed.

### 2026-10-16 — R0bi7 review 5539657046 (on `6dff5bc8`), fixes uncommitted

Seven inline comments, no P-labels, body "Nothing fund-unsafe found". Verified each in code first.

1. Held deposit batch disabled Withdraw: fixed by guarding on the payload, not the tab —
   `disabled={isSwapping || (heldBatch !== null && !intentOrderPayload.hubWalletSwap)}` plus the same check at the top
   of `handleSwap`. Tab-based guard was unsafe: the payload reset on tab change runs in a `useEffect`, so one painted
   frame has `tab === 'withdraw'` with the deposit payload still set.
2. Missing `batchId` coerced to `''`: unreachable (SDK always sets it, `approvalBatch.ts:230`; `''` would not resend
   since the SDK branches on `!== undefined`). Fixed anyway with `apps/demo/src/lib/heldBatch.ts` `unconfirmedBatchOf`
   (same `typeof batchId === 'string'` guard as dapp-kit `swapLifecycle.ts:130`), used by both pages; held-batch types
   now `UnconfirmedBatch & {...}`. Demo has no test runner (`"test": "true"`), so no unit test.
3. Resume re-implemented `relayTxAndWaitPacket`: R0bi7's "data omitted" was runtime-true but the type required `data`
   (the relay test file even documented the mismatch and cast `NO_DATA = undefined as unknown as RelayExtraData`).
   Made `RelayAndWaitParams.data` optional (runtime invariant for Solana/Bitcoin unchanged; every caller still passes
   it), and bridge / LY / swap resume now call `relayTxAndWaitPacket`. Dropped the dead `NO_DATA` cast (6 uses) and
   the now-unused imports (`submitTransaction`/`waitUntilIntentExecuted` in bridge + LY, `getIntentRelayChainId` in
   bridge). Resume tests rewritten to the helper mock. INTENT_RELAY_API.md ("always required") fixed + page regenerated.
4. Hold state machine per page: shared parsing helper only (item 2); the hooks are issues #531 (bridge) / #532 (LY).
5. LY approval helpers duplicate SwapService: not changed (LY has no SwapService; `swaps.approve` errors carry
   `feature: 'swap'` and `isLeverageYieldApproveError` checks code only; a clean share means reworking released swap API).
6. `allowAccountUpgrade` sticky: not changed — same as merged `SwapCard.tsx:148,390`; the upgrade is account-level.
7. Sequential bridge builds twice: not changed — mirrors swap's preflight (`SwapService.ts:1035`).
User: no thread replies on #511; same assumed here unless asked.

Gates: sdk test 3087 + checkTs, demo checkTs, `pnpm lint` (touched nothing else), biome on changed files,
docs:sync-pages / check:docs-pages / check:doc-links, check:ai-dev-files. demo AGENTS.md updated (withdraw stays
available; `lib/heldBatch.ts`). `core.bare` false.

Audit pass (user asked "safe, non-breaking?"): found and fixed stale `data` (required) in RELAYER_API_ENDPOINTS.md,
INTENT_RELAY_API.md type listing and two skills architecture files. Verified: no repo code reads
`RelayAndWaitParams.data` outside the helper; resume requests are byte-identical (same payload, endpoint, timeout);
the helper's own test pins "submit fails → no poll"; withdraw payload always `hubWalletSwap: true` (`:1000`) and
`'not-required'` (`:1337`), deposit never; no file overlap with #511's `79b8b538` (merge will be clean). Gates:
sdk build, sdk test 3087, dapp-kit 931, demo checkTs, skills check:ai, docs pages/links. Not verified: demo UI in a
browser (no test runner), live resume on mainnet.

Committed `b7bf1fd3` (signed, hook green), merged #511's `79b8b538` as `407add8e` (signed, no conflict; gitleaks +
build:packages + checkTs + test 21/21 by hand), pushed. claude[bot] check (issuecomment-6208703895) agreed: 1-3 fixed,
4 partial, 5/6/7 open. Finding 5 turned out to be ours (`6ed8448e`, plan decision #5 / B3 chose "mirror"); filed #533.
Posted one reply on #512 (issuecomment-6208901374): 1-3 fixed, 4 → #531/#532, 5 → #533, 6 and 7 left with reasons.

### 2026-10-20 — #511 squash-merged, #512 conflict fixed

#511 squash-merged as `14a1740a` (parent `0181a053`). PR #512 (base already `main`, head `4aa18fc8` = R0bi7's
"Update branch" merge of `0181a053`) went `CONFLICTING`: a direct merge of main hit 7 files (`approvalBatch.ts`,
`SwapService.ts`, `shared/index.ts`, `WALLET_PROVIDERS.md`, `wallet_providers.md`, `error-codes.md`, `public-api.md`)
because the squash erased #511's commits that the branch still carried. #511's final head `79b8b538` was already in
the branch.

Fix (intermediate-merge trick, no rebase): `merge-tree --write-tree 0181a053 79b8b538` equals `14a1740a^{tree}`
(`ed0590b2`), so signed intermediate `2137ff37` = `commit-tree 14a1740a^{tree} -p 14a1740a -p 79b8b538`, then signed
merge `c36904c6` = `commit-tree 4aa18fc8^{tree} -p 4aa18fc8 -p 2137ff37` (0 conflicts, tree unchanged, no hooks
needed). Pushed `4aa18fc8..c36904c6`; PR now `MERGEABLE`, 86 → 61 files.

No-code-loss checks: all 39 #511 files on main are byte-identical to `79b8b538` (no overlap with main-side changes);
the 61 PR files equal exactly the files touched by #512's 9 own non-merge commits; every (file, removed line) in
`main..c36904c6` is removed by one of those commits in the same file; `SwapService.ts` removals are the intended
`confirmApproval` / `relayTxAndWaitPacket` / `intentDepositSpender` extractions with logic preserved.

## Findings

## Changes During Work
