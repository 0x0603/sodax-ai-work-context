---
type: process
repo: sodax-frontend
github: 1869
updated: 2026-09-18
---

# Process

## Log

- 2026-09-18 — Branch `feat/swap-min-amount-message` off `origin/main`
  (`a6699893`); checkout was on `chore/bump-sodax-sdk-2.2.0-rc.3` before, tree
  clean. Implemented both layers; Biome clean on changed files.
- 2026-09-18 — Committed `841b2fa8`, pushed. Parent issue sodax-sdks#471, sub-issue
  sodax-frontend#1869 linked via `addSubIssue`, PR sodax-frontend#1870. Label
  "Front end" does not exist in that repo; used "Front end UI".
- 2026-09-18 — Designer (image in chat) found the message overflowing the fixed-width
  button and asked for the line below the button instead. User then dropped the
  price × amount input check: detect from the error only. Reworked, store and
  button back to main, verified in the browser at localhost:3001/exchange/swap
  with 0.5 USDC (`.playwright-mcp/swap-too-small.png`).
- 2026-09-18 — User confirmed; amended to `ef1846b3`, force-pushed with lease, PR body
  rewritten. Issues 1869 and 471 already updated.
- 2026-09-18 — Designer's Discord text bolds "Increase to continue". Split the copy
  into `SWAP_AMOUNT_TOO_SMALL_MESSAGE` + `SWAP_AMOUNT_TOO_SMALL_ACTION` and render
  the line exactly like `SupportCard`: same wrapper (`mt-(--layout-space-comfortable)`,
  `flex items-center gap-1`), `text-espresso`, InterRegular + InterBold. Measured in
  the browser: both lines sit at y=679, 32px below the button (desktop token), so
  the gap the user felt was "too much" is the support line's own. Amended to `6c8be29a`, force-pushed.

## Findings

- `apps/web` `checkTs` on main already fails with 3 stale `.next/types` errors
  (partner-dashboard page) and `lib/available-assets.ts` importing
  `isRealWorldAsset` that the installed `@sodax/types` lacks. Not from this change.
- `swap-review-button.tsx` has two pre-existing `as any` Biome errors (trustline
  call); left alone.
- `useSwapInfo` is consumed only by the review button, so adding `useTokenPrice`
  there dedupes against the page's identical query key.

## Changes During Work

- None.
- 2026-09-18 — User chose the timing line's look for the message instead of the
  support line's: `mt-(--layout-space-small)` (16px desktop, so the line does not
  jump when it replaces "Takes ~30s Total fees"), `text-clay-light`, `leading-tight`,
  second sentence still InterBold. Screenshot `.playwright-mcp/swap-too-small-v3.png`.
  Amended to `61e1d31f`, force-pushed.
