---
type: process
repo: sodax-sdks
github: 
updated: 2026-09-30
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-09-30 — audit, plan, implementation

- Target is `sodax-sdks/apps/demo` (`sodax-frontend/apps/demo` is a stale `dist/`
  only). Branch `fix/demo-mobile-responsive` off `origin/main` b0d69d10.
- Audit: three read-only agents covered every UI file at 360–390px (shell + swaps +
  bridge + bitcoin; mm + staking + dex + oracle + recovery + partner; leverage). A
  design-review agent checked the primitive changes against every call site and
  specified the verification harness. Line-level results are the Appendix of
  `plan.md`.
- User choices: compact header labels on phones; money-market tables scroll
  sideways; ⓘ tooltips open on tap.
- Baseline for comparison: a detached worktree of `origin/main` in the session
  scratchpad served on :3001, the branch on :3000. Harness: Playwright 1.62.1 (matches
  the cached chromium-1234) + pixelmatch, `rwd.mjs` (overflow report, screenshots,
  console diff, overlays, network record/replay for desktop diffs, fake EIP-6963
  wallet) and `tooltip.mjs`.

- Verification (harness): mobile/tablet 0/104 overflow on the branch (no wallet and
  stubbed EIP-6963 wallet — the demo auto-connects an announced provider that answers
  `eth_accounts`, no click needed); desktop pixel diffs identical apart from live
  data. Replay was slow until localhost requests were excluded from interception and
  long-poll misses got a 10 s timeout.
- Committed `7711e93b` (one commit, per the PR template) with Node 24.21 from a
  verified nodejs.org tarball + a corepack pnpm wrapper in the scratchpad.

- Follow-up request: Staking and Dex moved into the More menu (`591077c8`). Measured
  the one-line header after the move: ~1064px disconnected / ~1124px connected
  viewport, still over the 992px available at `lg`, so the sheet breakpoint stays `xl`;
  the header comment dropped its pixel figure so it cannot go stale.

- Polish pass (user: least-impact, most-needed): picked only visible glitches — the
  swap balance line used `font-['InterRegular']` with no `public/fonts` (serif
  fallback, on desktop too) and hid its label on phones; partner-fee page text was
  cream-on-white; leverage-yield-api had no page padding; mm tables nested a 500px
  vertical scroller on phones. Skipped: oracle chart initial scroll position (would
  need an RTL trick or JS), slippage input width, swap button style (design choices).

## Findings

- **Baseline:** every route overflows at 360/390/768 (page `scrollWidth` ≈ 900)
  because of the header; with no wallet connected nothing else overflows at page
  level — most Blockers (hub-address rows, tables, order status hashes, errors) only
  render in connected or post-action states.
- **tailwind-merge variant trap** (drove the primitive rule): base `a sm:b` + call
  site `a` keeps the base `sm:b`. Same trap explains an existing quirk: an Input's
  call-site `text-xs`/`text-sm` loses to the base `md:text-sm` from 768px up, so
  dropping a call-site `text-sm` changes nothing on desktop.
- **Radix Slot + NavLink:** `SheetClose asChild` merges `className` by string
  concatenation, so NavLink's function `className` breaks. `MobileNavLink` computes
  `isActive` with `useMatch({ path, end: false })` (segment-aware, so `/bridge` does
  not light up on `/bridge-api`) and passes a string.
- **Radix Tooltip on touch:** trigger closes on pointerdown and click, opens only on
  non-touch hover/focus. `ui/tooltip.tsx` now owns `open`, records the state at a
  touch pointerdown (before Radix closes it) and toggles on the click with
  `preventDefault()` to skip Radix's close. `tooltip.mjs`: baseline tap never opens;
  branch tap opens, second tap closes, tap outside closes; mouse hover/click results
  identical on both.
- Pre-existing, not touched: duplicate React key `SUI-Slush` in the wallet list;
  biome `noUselessFragments` (wallet-item.tsx:99) and unused import
  (SupplyAssetsList.tsx:15); `/fonts/*.ttf` 404s (served as HTML).

## Changes During Work

Plan items deliberately **not** done, because they would change desktop or were not
needed once the primitives changed:

- `w-full` on error wrappers / OrderStatus roots (`w-full max-w-lg`): would move
  desktop text from centred-shrink-wrapped to full-width; `wrap-anywhere` alone makes
  the fit-content width clamp to the viewport.
- `mx-*/mb-*` on the ManageLiquidity error box, `gap-x-4` on leverage-yield 2-col
  grids, `leading-snug` on the LimitOrderCard label: visible desktop shifts.
- `shrink-0` on mm modal symbol/Max: their min-content already equals their width;
  the Input `min-w-0` is the fix.
- Money-market helper text `w-full sm:w-auto`: `flex-wrap` alone wraps it.
- Recovery table: not hiding the asset name on phones (would hide data); the table
  already scrolls inside its wrapper.
- OrderStatus icon-button tap targets and the oracle skeleton aspect ratio: optional,
  skipped.
- Card titles: `text-xl sm:text-2xl` applied to all five `text-2xl font-bold
  text-center` card titles (SwapCard, swaps-api SwapCard, LimitOrderCard,
  BridgeManager, BridgeCard) for consistency, not only SwapCard.
- Reverted one unrelated biome reflow in `swaps-api/SwapCard.tsx` (a ternary) to keep
  the diff class-only.
