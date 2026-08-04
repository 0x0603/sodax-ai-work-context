---
type: issue
repo: sodax-sdks
github: 331
status: Active
tags: [erc20, approve, usdt, swaps-api, cross-repo]
updated: 2026-08-04
related_decisions: []
---

# GH-331 Usdt Stale Allowance Approve

- Source: https://github.com/icon-project/sodax-sdks/issues/331 — **topic**, with one sub-issue per repo
- Started: 2026-08-04
- Sub-issues (GitHub native, cross-repo):

  | Order | Repo | Issue | PR |
  | --- | --- | --- | --- |
  | 1 | sodax-sdks | #342 | #341 (ready) |
  | 2 | sodax-backend | #1042 | — (branch only, blocked) |
  | 3 | sodax-frontend | #1635 | #1634 (draft, blocked) |

  Each PR closes its **sub-issue**, not the topic — otherwise merging the SDK PR would close #331
  while two repos were still untouched. The topic closes when all three do.

## Problem

A swap on Ethereum mainnet dead-ends. `approve(assetManager, 1550.5668 USDT)` reverts with
`data: 0x` and keeps reverting on every retry, so the UI can only say "Approval failed".

Ethereum USDT still runs its 2017 bytecode, whose `approve` carries a race-condition guard:

```solidity
require(!((_value != 0) && (allowed[msg.sender][_spender] != 0)));
```

An allowance cannot go from one non-zero value to another. The reported wallet
(`0xd1ffb0c0136b6360841b6677893e122d2d30f0d2`) holds a stale 205 USDT allowance to the asset manager
`0x39E77f86C1B1f3fbAb362A82b49D2E86C09659B4`, so it can never approve anything.

Three properties make it worse than it first looks:

- The guard tests **zero vs non-zero**, not sufficient vs insufficient. Re-approving the exact
  current value reverts too.
- Not fixable token-side: the bytecode is byte-identical to the 2017 deployment, `deprecated()` is
  false.
- Not fixable with a helper contract: `approve` writes `allowed[msg.sender][spender]`, so a contract
  calling on the user's behalf only ever approves itself.

The fix has to be client-side.

## Context

The issue offered four options. **Option 1 was chosen** — read the allowance and, when a reset is
needed, send `approve(0)` then `approve(amount)` sequentially, waiting for the first to be mined.
Option 2 (EIP-5792 batching when the wallet is already a smart account) was dropped: it only helps
wallets that upgraded on their own and it does not remove the sequential fallback.

The decisive discovery during planning: **the swap flow on the production dapp does not use the
wallet-provider path.** It goes

```
sodax-frontend swap-confirm-dialog.tsx:135  useSwapsApiApprove
  → dapp-kit useSwapsApiApprove.ts:40       sodax.api.swaps.approve
  → sdk SwapsApiService.ts:226              POST /swaps/approve
  → sodax-backend swaps.service.ts:185      sodax.swaps.approve({ raw: true })
  → SpokeService.approve (raw branch)       exactly one unsigned tx
```

`ApproveResponseV2` is `{ tx }` — singular. A fix confined to the signed path of
`SpokeService.approve` would leave the reported user still stuck. Closing the issue therefore spans
three repos.

## Acceptance Criteria

- A wallet holding a stale, insufficient allowance on a guarded token can approve again.
- `approve` keeps its `Promise<Hash>` contract — no consumer is forced to change.
- Detection is behavioural, not a hardcoded token list (repo rule).
- `raw: true` callers are not silently changed; the unsigned path opts in explicitly.
- The production swap flow (swaps API) is covered, not just the wallet-provider flows.

## Related

- Knowledge: on-chain survey of the whole SODAX token list — `process.md` § Findings
- Decisions: scope locked with the user — `plan.md` § Decisions
