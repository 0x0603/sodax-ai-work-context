---
type: review
repo: sodax-sdks
github:
status: Active
updated: 2026-11-03
---

# Local design changes review

Scope: all staged/unstaged/untracked SDK changes against HEAD `fa8c419a` in wt-534.
54 tracked changed paths plus operation-return-types.test.ts; staged UI rename included.
Read-only review, no SDK source edits, commits, pushes or PR comments.

## Finding — P2: borrow minimum checks gross instead of actual payout

`packages/sdk/src/moneyMarket/MoneyMarketService.ts:843-847` passes params.amount to
assertMpcPayoutAboveMinimum. buildBorrowData translates it to vault precision,
subtracts this.partnerFee at 1387-1388, and translates the net payout at 1429-1443.

Reproduced offline against the newly built package with real config and real
buildBorrowData. Stubbed hub-wallet lookup and spoke sendMessage only, then decoded
the last AssetManager.transfer in the payload:

- Tron USDT requested amount: 3,100,000 (3.1 USDT).
- moneyMarket.partnerFee.percentage: 1,000 (10%).
- Configured floor: 3,000,000 (3 USDT).
- createBorrowIntent({ raw: true, ... }) returns ok=true.
- Encoded payout amount: 2,790,000 (2.79 USDT).

The enforced floor is bypassed by configured partner fees; a sufficiently large fee
can reduce the payout to dust. Apply the guard to exactly the translated net amount
used by the builder, and cover fee-boundary cases without mocking buildBorrowData.
Same construction is used by the signed flow. No transaction was broadcast.

## Verification

- SDK: 93 files / 3,359 tests pass.
- Types: 1,197; dapp-kit: 934; bridge-api: 113; swaps-api: 107 tests pass.
- Workspace checkTs: 15/15 pass (cache).
- Read-only Biome lint: no errors, 36 warnings / 2 infos.
- check:ai, ai-dev-files, doc-links, docs-pages, docs-nav and diff whitespace pass.
- E2E: 9 passed / 9 failed; dependency calls fail with DNS/network errors.
- No additional substantiated new bug in raw schemas, conditional feature results,
  hook/demo routing, encoding or release submit/read/wait was found in this pass.

Known separate work remains separate: backend automatic-cancel MPC notification,
legacy 20-byte refund remediation, LY enablement and cross-chain raw inference.
The dynamic-chain raw union is explicitly retained by the new type test, so it is
not reported as a regression or as an inference requirement for this patch.
