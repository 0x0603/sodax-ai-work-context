---
type: issue
repo: sodax-sdks
github: 505
status: Active
tags: [eip-5792, atomic-batch, swaps-api, dapp-kit, playground]
updated: 2026-10-12
related_issues: [gh-302, gh-506, gh-507]
related_decisions: []
---

Source: https://github.com/icon-project/sodax-sdks/issues/505 (opened by the user as a #504 follow-up).
Started: 2026-10-12. Related PR: — (not opened yet).

Body verbatim:

## feat(dapp-kit): approve + intent in one signature for the API lanes

#504 adds one-signature approve + swap, but only for the SDK lane (`swapWithApproval`). sodax.com and the playground swap through the API lane (`useSwapsApiApproveAndBroadcast`, then sign the `/intents` tx), so users there still sign twice, or three times for USDT-like tokens.

## Proposal

Add a dapp-kit hook that sends the approval and the intent tx from the API as one EIP-5792 batch:

1. If the allowance is already enough, keep the current flow.
2. Otherwise fetch `/approve` (`{ tx, resetTx? }`) and `/intents`.
3. If the source is an EVM spoke and the wallet supports atomic batches (`getAtomicBatchSupport`, added in #504), send `[resetTx?, tx, intentTx]` with `sendAtomicBatch`, wait for it, and pass the tx hash to `/submit-tx`.
4. Otherwise fall back to `runApprovalPlan` and sign the intent, as today.

No backend change is needed. `/approve` already returns unsigned txs, `/intents` only simulates on the hub so it works before the approval lands, and `/submit-tx` doesn't check the tx on-chain.

Same rules as #504: Sonic stays sequential, no fallback once the wallet has the batch, and rejecting the batch or the account upgrade (5750) counts as a user rejection. The API returns `value` as a string, so convert it to bigint before sending.

The bridge and leverage-yield APIs have the same `/approve` + `/intents` shape, so they can follow in separate PRs.

## Done when

- [ ] Hook(s) for the swaps API lane, with tests for the batch, fallback and no-approval paths
- [ ] Used in the demo swaps-api card or the playground, and checked on mainnet with MetaMask (Base or Arbitrum)
- [ ] Skills and README updated

## Depends on

#504 and its mainnet test (whether the relayer accepts a 7702 batch tx).

## Related

#506, #507. Switching sodax-frontend over is a separate ticket.
