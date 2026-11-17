---
type: brief
repo: sodax-sdks
github: 634
related_issues: [633]
status: Active, fixes pushed to the PR branch, waiting for CI and review
next: watch CI on 337fcd3d; the backend config API still has to list the equities (author's follow-up)
updated: 2026-11-17
tags: review, money-market, robinhood, stock-tokens, borrow
---

# PR 634 review fixes (AntonAndell, 11 Robinhood Stock Tokens as money-market collateral) · brief

## State

- gosodax/sodax-sdks#634 `feat/money-market-robinhood-stocks` @ `c08cb8d5`, closes #633. Same-repo branch.
- Fixes pushed straight to the PR branch (user chose direct push), 4 signed commits `3582a5bf`..`337fcd3d` on
  top of `c08cb8d5`, from worktree `repos/client/sodax-sdks-wt-634`. No PR comment after the push.
- PR comment by 0x0603 listing what gets fixed: `issuecomment-6937361931`. No plan comment on #633
  (the user asked for a PR comment, not an issue comment).
- Checks on the working tree: affected `checkTs` and `test` green, `pnpm check:ai` green. The read-only mainnet
  script (`createBorrowIntent` raw for AAPL/GLD/USDG/bnUSD) was denied permission and not run.

## Verified facts (2026-11-17, Sonic pool `getConfiguration`)

- All 11 equity reserves live, `borrowingEnabled=0`, tiny supply caps (39–356 tokens).
- Pre-existing borrow-disabled reserves: bnUSD vault (SDK borrows bnUSDd instead, which has borrow on) and
  sodahyTB (not in SDK lists). So the equities are the first borrow-disabled tokens in the SDK MM lists.
- GLD is priced by the pool oracle (~$354), so "no Chainlink feed" in the old registry comment was stale.

## Decisions

- SDK rejects a borrow up front by reading the reserve config on-chain (`pool.getReserveData`), not from a static
  list in `@sodax/types`: borrow on/off is governance state and a list would drift.
- Check mirrors Aave `validateBorrow` flags: active, not frozen, borrowing enabled, not paused → `VALIDATION_FAILED`.
- bnUSD maps to its debt reserve via one private `getBorrowReserve`, shared with `buildBorrowData`.

- Demo keeps collateral-only rows and only disables Borrow (Repay is only reachable from those rows), checking
  `borrowingEnabled` alone because the merged bnUSD reserve takes only that flag from the debt reserve.
- Docs: the ticker list lives only on `docs/robinhood-chain/money-market.mdx`; other pages link there
  (`docs/AGENTS.md` forbids hand-written token lists; R0bi7-sodax-worker's review flagged the 7 copies).

## Reviews of #634

- R0bi7-sodax-worker `issuecomment-6936585840` (static, dual-agent): its three findings are correct (FAQ count,
  suffix-only test, ticker list in 7 pages). It missed the SDK borrow gap, the demo Borrow button, the add-token
  skill claim and the stale `tokens.ts` comment.
- Own /code-review round on the fixes: fixed docs-pages sync, demo repay/empty-list regressions, bnUSD flag
  mismatch, message wording, check placed after `encodeAddress`, single `encodeBorrow` in `buildBorrowData`, live
  configuration words pinned in tests. Skipped: Promise.all with the wallet lookups, exporting a public
  "borrowable" predicate, a static collateral-only marker in `@sodax/types`.

- Speed tier: `getSwapSpeedTier` excludes RWA vaults from sodaAsset (`isRealWorldAsset` on the hub chain). Checked
  offline over all 267,806 production swap pairs: 0 pairs differ from main's tiers; the excluded set is exactly
  the 11 equity vaults. Without it, 26,796 pairs (mostly stock ↔ stock) jumped to fast. This contradicts the PR
  comment, which said speed tier stays as is; the commit message explains it. If the contracts team says equity
  vaults are sodaAssets, drop the RWA condition.

## Open (not fixed, raised in the PR comment)

- Contracts team still to define "sodaAsset" for the speed tier (the RWA exclusion is the conservative default).
- Whether US users should see Stock Tokens in MM lists by default (Robinhood terms) is a product call.
