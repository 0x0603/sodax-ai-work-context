---
type: issue
repo: sodax-sdks
github: 529
status: Active
tags: [dapp-kit, swaps-api, eip-5792, lifecycle]
updated: 2026-10-16
related_decisions: []
related_issues: [gh-505, gh-302]
---

# GH-529 useSwapsApiSwapLifecycle

- Source: https://github.com/icon-project/sodax-sdks/issues/529 (created 2026-10-16 at the user's request)
- Started: 2026-10-16
- Related PR: none yet

## Problem

`useSwapLifecycle` (#504) packages the whole SDK-lane swap. The API lane has no equivalent: sodax.com
(`sodax-frontend/apps/web/app/(apps)/swap/_components/swap-confirm-dialog.tsx`, checkout 2026-10-05) and the
playground wire `useSwapsApiCreateIntent` / `ApproveAndBroadcast` / `SubmitTx` / `SubmitTxStatus` by hand, and
#511 adds `useSwapsApiBroadcastWithApproval`. Easy-to-get-wrong steps: fresh intent + deadline after a separate
approval; submit-tx with the signed build's `intent` + `relayData`; never resend an `ATOMIC_BATCH_UNCONFIRMED`
batch, and keep that build's data across reloads to resume it.

## Context

- Came out of R0bi7's review 5537362965 on #511 (P2: fallback signed the pre-approval intent) and the user asking
  for a simple client sample, then whether dapp-kit should package it.
- Separate hook, not a `lane` option on `useSwapLifecycle`: input type (`CreateIntentParamsV2` strings vs
  `CreateIntentParams` bigint), resume data (SDK lane reads the intent back from the hub tx; API lane must keep
  `intent` + `relayData`) and status source differ.
- Per-family signing of backend-built txs lives in the playground: `broadcast` in `apps/playground/src/lib/execution.ts`
  (EVM, Solana, Sui, Stellar, NEAR, Stacks, Injective; no Bitcoin).

## Acceptance Criteria

- Hook with tests: no-approval, batch, refusal, unconfirmed-resume, settled, failed.
- Playground's `executeSwap` runs on it (first consumer).
- dapp-kit README, skills, docs.

## Related

- Depends on #511 (gh-505). Related #504 (gh-302).
- Knowledge:
- Decisions:
