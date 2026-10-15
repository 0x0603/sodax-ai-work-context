---
type: issue
repo: sodax-sdks
github: 522
status: Active
tags: [swap, leverage-yield, slippage, min-output, sdk-helper]
updated: 2026-10-15
related_decisions: []
---

# GH-522 Min Output From Quote Helper

- Source: https://github.com/icon-project/sodax-sdks/issues/522
- Started: 2026-10-15 (opened only)
- Related PR: none yet

## Problem

Every integration computes `minOutputAmount` from a quote by hand. The copies disagree: BigNumber ones
`.toFixed(0)` (round half up), bigint ones floor, and only some reject 100% slippage (a `0n` minimum accepts
any fill). Proposed: a pure SDK helper, e.g. `minOutputFromQuote(quotedAmount, { slippageBps })` →
`Result<bigint>`, bps integer 0–9999, floored, `VALIDATION_FAILED` on a bad slippage or a `0n` result.

2026-10-15: a second helper added to the issue (title now "helpers for slippage input and minOutputAmount
from a quote"): `parseSlippagePercent('0.5')` → `Result<number>` bps, 0 to under 100, at most two decimals,
empty fails. Why: every copy reads the typed slippage differently — demo swap/swaps-api/leverage-yield pass
the raw string to BigNumber, leverage-yield-api `LeverageCard.applySlippageMinOut` clamps, `swap-api-example`
allows 100% (`s > 100` check), only the playground stops below 100 (`useSwapFlow.ts` `slippageBps`); most read
an empty field as 0% (`Number('') === 0`). Demo SDK swap card: empty slippage with a quote loaded crashes the
render (`BigInt('NaN')`), on main and on #504 — the user chose NOT to fix it in #504 (only item 1 of 3).

## Context

Copies on `origin/main` (2026-10-15):
- demo: `components/swaps/SwapCard.tsx`, `components/swaps-api/SwapCard.tsx`, `pages/leverage-yield/page.tsx`,
  `components/leverage-yield-api/LeverageCard.tsx`, `pages/leverage-positions/{Adjust,Close}*Control.tsx`
- playground: `hooks/useSwapFlow.ts:210-219`, `lib/snippet.ts:151` (code generated for partners)
- `apps/swap-api-example/src/components/SwapCard.tsx:157`
- docs: `docs/developers/how-to/integrate_leverage_yield.md:55` (formula for integrators); the dapp-kit swap
  recipe's Full Example sends the raw quote as the minimum (zero slippage)

## Acceptance Criteria

- Helper in `@sodax/sdk` with tests; apps above moved to it; docs and skills point at it.

## Related

- Spun off from gh-302 (not linked on GitHub, see brief Settled).
