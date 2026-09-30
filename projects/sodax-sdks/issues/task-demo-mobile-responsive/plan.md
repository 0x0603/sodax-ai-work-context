---
type: plan
repo: sodax-sdks
github: 
updated: 2026-09-30
---

# Plan: make `apps/demo` usable on mobile (UI only)

## Context

`sodax-sdks/apps/demo` (`sodax-demo-v2`: Vite, React 19, Tailwind 4.3, shadcn/Radix
primitives) was built desktop-first. Only 22 of ~65 `.tsx` files use a breakpoint
prefix, and most of those only set dialog widths. An audit of all UI files on
`origin/main` at 360–390px found:

- **Header.** The logo, 8 nav entries, Settings, the "N Chains" pill and Wallet form
  one row that doesn't wrap, about 1240px wide. It overflows on phones, and between
  1024 and 1279px the nav already slides under the right-hand buttons.
- **Dialogs.** `ui/dialog.tsx` is `fixed w-full max-w-lg p-6` with no max-height and
  no scroll. Tall dialogs (swap/limit review, bridge + BTC setup, staking, BTC
  fund/withdraw) can't be scrolled on a phone, and every dialog runs edge to edge.
- **Long unbreakable strings.** Tx/intent hashes, hub-wallet addresses and raw viem
  errors widen dialogs and pages until the whole page scrolls sideways. Examples:
  swap intent details, bridge-api / leverage-yield-api order status, the hub-address
  rows in money-market / staking / recovery, and partner-fee tx hashes.
- **Rows that can't shrink.** An `<Input>` won't shrink below about 20ch, and it sits
  next to buttons. Button groups and label/value rows don't wrap. Three pages have
  no side gutter. The 8-column money-market tables squash each header to one word
  per line.

**Goal.** Every route is usable from 360 to 430px, with no page-level horizontal
scroll and every dialog scrollable. Tablet widths (768–1279) get fixed along the
way. Desktop at ≥1280 renders as it does today.

**Scope.** UI only. Nothing changes in hooks, state, handlers, effects,
conditionals, props passed to SDK hooks, or desktop copy.

## Ground rules

1. **Call sites are mobile-first.** `X` becomes `<mobile> sm:X` (or `md:`, `lg:`), so
   the current class still applies from the breakpoint up. This follows patterns the
   app already uses: `flex flex-col sm:flex-row`, `grid-cols-1 md:grid-cols-3`,
   `hidden sm:inline`.
2. **Shared `ui/*` primitives only get unprefixed changes that no call site
   overrides, or `max-sm:` additions. Never add an `a sm:b` pair.**
   - `cn()` is tailwind-merge 2.6. It drops a base class only when the override has
     the same variant. So base `gap-2 sm:gap-0` plus a call-site `gap-2 sm:flex-col`
     would keep `sm:gap-0` and change desktop.
   - Card is left alone for the same reason: call sites override `p-0`, `pt-0`,
     `pb-0`, `py-8`, `pt-6`.
   - Write arbitrary values with brackets (`[var(--x)]`). tailwind-merge 2.6 doesn't
     understand v4 `(--x)` shorthand.
3. **Only presentational edits:**
   - `className` strings. State-driven ternaries stay intact; only their fixed part is
     edited.
   - A wrapper `<div>` for scrolling.
   - `max-sm:sr-only` on labels. This hides them visually on phones but keeps the
     accessible name.
   - One new presentational component, `MobileNav`.
   - The only new state is the tooltip open flag in `ui/tooltip.tsx` (Q3).
   - No new dependencies.
4. **Long strings.** Use `break-all` for bare hashes, addresses and amounts. Use
   `wrap-anywhere` (Tailwind ≥4.1) for "label: value" lines, prose and raw errors: it
   keeps labels whole and, unlike `break-words`, lets grid and flex items shrink.
   Never put both on one element.
5. **Fix only the leaf that overflows.** Don't restyle things that already work.

## Setup

- In `sodax-sdks` (currently on `fix/460…`, merged as #461, tree clean), run
  `git fetch origin && git switch -c fix/demo-mobile-responsive origin/main`, then
  `pnpm install && pnpm build:packages`.
- **Capture the `before` run of the harness (below) before the first edit.**
- Context repo:
  - Run `scripts/new-issue.sh sodax-sdks task demo mobile responsive`.
  - Put this plan in its `plan.md`, plus a `brief.md`.
  - Save harness output (overflow reports, screenshots) under `artifacts/`.

## Changes

### 1. Shared primitives (`src/components/ui/`, not linted or formatted by biome)

- **`dialog.tsx` DialogContent:**
  - `w-full` becomes `w-[calc(100%-2rem)]`, a 16px gutter. Call sites only override
    `max-w-*`, so their widths hold.
  - Add `max-h-[calc(100dvh-2rem)] overflow-y-auto`.
  - `sm:rounded-lg` becomes `rounded-lg`.
  - Known desktop side effects, only where content already overflows:
    - A dialog taller than the window now scrolls.
    - Horizontal overflow scrolls inside the dialog instead of spilling out, because
      `overflow-y:auto` forces `overflow-x:auto`.
  - Nothing gets clipped: no dialog has absolutely positioned children, and Select and
    Tooltip are portaled.
  - SodaxSettingsModal keeps its own inner scroll pane, so there is no double
    scrollbar.
- **`dialog.tsx` DialogFooter:** add `max-sm:gap-2` so stacked buttons stop touching.
  Call sites with `gap-2` are unaffected.
- **`input.tsx`:** add `min-w-0`.
  - This fixes about 20 input+button rows at once: address rows, amount rows,
    PartnerFeeFields.
  - It only changes rows that already overflow. The one such row on desktop is
    `PartnerFeeFields.tsx:85`, whose `w-[130px]` input must get `shrink-0`, or it
    shrinks to about 100px on the swaps-api / bridge-api cards.
- **`select.tsx` SelectContent (popper):**
  - Add `max-w-[var(--radix-select-content-available-width)]`.
  - `max-h-96` becomes `max-h-[min(24rem,var(--radix-select-content-available-height))]`.
  - This covers the ~415px eMode menu and long Settings options.
  - Both CSS variables exist in Radix Select 2.2.6.

### 2. App shell

- **`components/shared/header.tsx`**
  - `<nav>` in `NavigationMenu` becomes `hidden xl:flex`. It is exported but imported
    nowhere else.
  - `MobileNav` is new and lives in the same file, because `navEntries` and
    `menuItemClass` are module-private. It is an **uncontrolled** `<Sheet>`:
    - `SheetTrigger asChild` wraps
      `<Button variant="cherryOutline" size="sm" className="xl:hidden" aria-label="Open navigation">`
      with a lucide `Menu` icon. The trigger must be the only rendered element;
      anything else would add a `gap-4` on desktop.
    - `SheetContent side="left" aria-describedby={undefined}` gets `overflow-y-auto`
      and an sr-only `SheetTitle`. Without both, Radix logs a warning and an error.
    - It renders `navEntries`: plain entries as links, groups as a small heading plus
      links.
    - Each `NavLink` is wrapped in `SheetClose asChild` and uses `menuItemClass`. It
      closes on navigate and returns focus, with no new state or handlers.
  - Put the hamburger before the logo. `NavDropdown` and its `onBlur`/Escape logic
    stay untouched.
  - Below `sm`, compact the header so it fits at 360px (Q1: shorter labels):
    - `gap-4` becomes `gap-2 sm:gap-4`.
    - The Settings and Wallet labels become `max-sm:sr-only`, leaving an icon-only
      button with its name kept.
    - The chains pill label becomes `{n}` followed by
      `<span className="max-sm:sr-only"> Chain{s}</span>`.
    - The logo's "demo" becomes `max-sm:hidden`.
    - "Connect Wallet" stays.
  - The chains dropdown gets `max-w-[calc(100vw-2rem)]`.
  - Measure at 1280, connected and disconnected. If the connected header already
    collides at 1280 today, report it as pre-existing and don't fix it: fixing it
    changes desktop, so it needs a separate sign-off.
- **`wallet-modal/index.tsx`**
  - `SheetContent className="w-full p-4 sm:w-3/4 sm:max-w-sm sm:p-6"`.
  - Inner `mt-10 p-4` becomes `mt-10 sm:p-4`.
  - List height becomes `h-[calc(100dvh-8rem)] sm:h-[calc(100vh-290px)]`.
  - `wallet-item.tsx` `gap-6` becomes `gap-3 sm:gap-6`.
- **`SodaxSettingsModal.tsx`**
  - `max-h-[85vh]` becomes `max-h-[85dvh]`.
  - Header, body and footer `px-6` become `px-4 sm:px-6`.
  - The footer row gets `flex-wrap`, and the Cancel/Save group gets `ml-auto`.
  - Drop the Input's `text-sm` override but keep the `modified` ternary. The base
    `text-base md:text-sm` avoids iOS focus-zoom.
- **Page gutters.** Add `px-4` (not `p-4`, which would shift desktop vertically) to
  `<main>` in:
  - `pages/swaps-sdk/page.tsx`
  - `pages/swaps-api/page.tsx`
  - `pages/bridge-api/page.tsx`
  - `pages/leverage-yield-api/page.tsx`

### 3. Recurring patterns (full file:line list in the Appendix)

| Pattern | Fix | Representative sites |
| --- | --- | --- |
| Bare hash/address pill, full-precision amount | `break-all` | hub-address pills, dex fee values, mm success amount |
| "label: hash" lines, prose, raw errors | `wrap-anywhere` | intent-detail lists in both SwapCards + LimitOrderCard, bridge-api / leverage-yield-api `OrderStatus` root (`w-full max-w-lg … wrap-anywhere`), LeverageCard / BridgeDialog / dex errors, partner "Transaction sent: 0x…" |
| Label + hub/wallet address pill | `flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2`, plus `break-all` on the pill | money-market, staking, recovery. BorrowAssetsList header uses `flex-wrap` |
| Input + long-label button | `flex flex-col gap-2 sm:flex-row sm:items-center` | staking account row, dex "Find position ID", partner "Load from Tx", PartnerFeeFields |
| Input + short button or symbol | Input `min-w-0` only, plus `shrink-0` on the symbol and Max | mm Supply/Borrow/Withdraw/Repay amounts, ManageLiquidity inputs |
| Button groups | add `flex-wrap` (and `gap-2` if missing) | ManageLiquidity slippage, UserPositions actions, partner buttons, UnstakingInfo |
| `justify-between` label/value rows | `gap-2`, plus `text-right` on the value; no desktop effect | SwapCard summary, leverage-yield summary, staking stats |
| Card padding nested 2–3 deep | `px-4 sm:px-6` / `p-3 sm:p-4` at the call site | dex nested card + UserPositions, LeveragePositionsPanel, BitcoinTradingSection, staking card |
| Full-width button with a long, state-driven label | `h-auto whitespace-normal text-center` plus the `min-h` for its size (`min-h-9` sm, `min-h-10` default, `min-h-11` lg), so desktop height is unchanged | Close/Adjust/Pending leverage controls, partner "Use Max (…)" |
| Range slider in a flex row | `min-w-0` | CreatePosition, ClosePosition, AdjustLeverage |
| Tiny tap targets (last, optional) | padding plus a matching negative margin (`-m-1.5 p-1.5`), so layout doesn't move | "Use max" / "Max" links, OrderStatus icon buttons (info icons are in §5) |

### 4. Area-specific changes (not covered by the patterns)

- **Money market:**
  - Tables: add `min-w-[56rem]` to both `<Table unstyled>`. They already scroll
    inside the card's `overflow-y-auto` box, and the sticky header scrolls with them.
    At ≥1280 the card is about 1246px, so nothing changes (Q2: scroll sideways, no
    card layout).
  - Controls-bar chain row: `flex flex-wrap items-center gap-x-3 gap-y-1`.
  - Connect placeholders (money-market, BorrowAssetsList, recovery):
    `min-h-[500px] p-12` becomes `min-h-[320px] p-6 sm:min-h-[500px] sm:p-12`.
- **Leverage positions:**
  - `PositionSummary` SummaryTiles: `grid grid-cols-1 gap-1 … sm:grid-cols-3 sm:gap-2`.
  - On phones each tile becomes a label-left / value-right row
    (`grid-cols-[minmax(0,1fr)_auto] … sm:block sm:text-center`), keeping the
    `toneClass` / `className` interpolation.
  - CreatePositionCard token pair: `grid-cols-1 sm:grid-cols-2`.
  - The page's `xl:grid-cols-[1fr_…]` switch already stacks below xl, so leave it.
- **Bitcoin Fund/Withdraw dialogs:**
  - From→To row: `flex flex-col … gap-3 sm:flex-row sm:gap-6`.
  - Arrow: `rotate-90 sm:rotate-0` plus `sm:mt-[-24px]` / `sm:mt-8`.
  - Withdraw spacer: `hidden sm:inline`.
- **Dex:** ManageLiquidity TabsTriggers become `px-1.5 text-xs sm:px-3 sm:text-sm`.
- **Oracle:** in `CandleChart`, wrap the `<svg>` in `<div className="overflow-x-auto">`
  and give it `min-w-[640px]`. The card is ≥640 on desktop, so desktop doesn't change.
- **Headings:**
  - dex / partner `text-3xl` becomes `text-2xl sm:text-3xl`.
  - SwapCard title `text-2xl` becomes `text-xl sm:text-2xl`.

### 5. Tap-to-open tooltips (Q3: open on tap)

Radix Tooltip ignores touch. Its trigger closes the tooltip on pointerdown and on
click, and it opens only on non-touch hover or on focus. Fix this once in
`ui/tooltip.tsx`, so every call site gets it with no call-site edits. The call sites
are the `InfoHint` in `PositionSummary`, the money-market header and health-factor
icons, and the `money-market/page.tsx` icon.

- **`Tooltip`** owns `open` state and passes `open` / `onOpenChange` to
  `TooltipPrimitive.Root`, forwarding the caller's `onOpenChange` and `defaultOpen`.
  No call site controls a tooltip today.
  - It shares `{ open, setOpen }` through a small context.
  - Every Radix-driven change still goes through `onOpenChange`, so mouse and keyboard
    behave as they do now.
- **`TooltipTrigger`** handles pointerdown and click:
  - On `onPointerDown` with `pointerType === 'touch'`, it records `wasOpen`. This runs
    before Radix's own handler, which closes the tooltip.
  - On `onClick` after a touch, it calls `preventDefault()`, which skips Radix's
    close-on-click, and then `setOpen(!wasOpen)`.
  - Mouse and pen events never enter this branch.
  - The caller's handlers still run first.
  - Tapping outside closes the tooltip through the content's DismissableLayer, which
    already exists.
  - Add one comment line naming the trap: Radix Tooltip ignores touch.
- **Tap targets** now matter, because a tap does something:
  - `InfoHint` gets `-m-1.5 p-1.5`.
  - The money-market info buttons get `-m-1 p-1`.
  - Both are negative-margin padding, so layout doesn't move.

### Out of scope (follow-ups)

- **CandleChart OHLC values** exist only in SVG `<title>` hover text. That's not a
  Tooltip, and fixing it needs tap-to-inspect UI.
- **`autoFocus` on the chain/token search inputs** opens the phone keyboard. Fixing it
  is a prop change.

## Verification

1. `pnpm --filter sodax-demo-v2 checkTs`, `lint` and `build` all pass.
2. **Logic guard:** `git diff origin/main -- apps/demo/src`, minus `className` lines,
   should show only these, each read by eye:
   - `MobileNav`
   - the `max-sm:sr-only` label spans
   - the CandleChart wrapper
   - `ui/tooltip.tsx`
3. **Playwright harness.** Scratch dir: `npm i playwright@1.62.1 pixelmatch pngjs`.
   Version 1.62.1 matches the cached chromium-1234, so there's no browser download.
   The script is `rwd.mjs --phase before|after` against `pnpm dev:demo`.
   - **Routes:**
     - `/swaps-sdk`, `/swaps-api`
     - `/money-market` (assert the redirect to `/money-market/0xa4b1.arbitrum`)
     - `/bridge`, `/bridge-api`, `/dex`, `/staking`, `/partner-fee-claim`, `/recovery`
     - `/leverage-yield`, `/leverage-yield-api`, `/leverage-positions`, `/oracle`
     - Also check once that `/` and `/solver` redirect.
   - **Widths:** 360, 390, 768, 1024, 1280 and 1440.
   - **Per page:**
     - Settle: `networkidle` (30s cap; `/leverage-positions` polls), fonts ready, no
       `.animate-pulse` or `.animate-spin`, 1s with no DOM changes.
     - **Overflow:** `scrollWidth > clientWidth`, plus the top offenders with
       `right > vw` or `left < 0`, skipping clipped descendants.
     - A full-page screenshot.
     - A console error/warning diff against `before`. Fail on the Radix
       DialogTitle/Description messages.
   - **Overlays:**
     - Mobile nav: open it, assert all links, tap "Oracle", then check the URL and
       that the sheet closed.
     - Settings: scroll to the footer.
     - Wallet sheet.
     - A Select listbox.
     - Each overlay must sit inside the viewport and have no inner horizontal
       overflow.
   - **Wallet-only states** (mm tables, chains pill, header fit at 1280): an
     `addInitScript` EIP-6963 fake EVM provider with a fixed address and chain
     `0xa4b1`, so wagmi lists it. Connect once and reuse `storageState`.
   - **Tooltips:**
     - In a `hasTouch` / `isMobile` context on `/leverage-positions` and the money
       market, `tap()` an info icon and expect `[role=tooltip]`.
     - Tap it again and expect it gone.
     - Tap it, then tap outside, and expect it gone.
     - With a mouse at 1280, hover opens the tooltip and leaving closes it, as before.
   - **Desktop diff (1280, 1440):**
     - `before` records the network, and `after` replays it with JSON-RPC ids
       normalized.
     - Clock fixed, animations off.
     - pixelmatch, masking only `canvas` and the oracle chart.
     - The only allowed diffs are the overflow cases the dialog change fixes. List
       them in the PR.
4. **Manual on a real phone with a wallet:**
   - Swap review dialog, mm supply/borrow, staking dialogs, bridge + BTC setup,
     leverage create/close.
   - Scroll each dialog.
   - Type in inputs and check there's no zoom.

## Delivery

- One PR in `sodax-sdks` (one PR per repo), with `fix(demo): …` conventional
  commits. Suggested commits:
  1. Primitives (including tap-to-open tooltips) + shell.
  2. Swaps / bridge / bitcoin.
  3. mm / staking / dex / oracle / recovery / partner.
  4. Leverage.
- Commit with Node 24; the pre-commit hook fails on Node 26. No AI trailers.
- `apps/demo/AGENTS.md` gets one pitfall bullet: call sites are mobile-first, `ui/*`
  never gets `a sm:b` pairs (the tailwind-merge variant trap), and `break-all` vs
  `wrap-anywhere`. No counts.
- Other open PRs touch the same files:
  - SwapCard: #483, #478, #372.
  - Wallet modal and SodaxSettingsModal: #486.
  - mm modals: #483.
  - Our edits are class-only, so conflicts should be small. Rebase right before merge.
- Context repo:
  - Update `brief.md` / `outcome.md` in the task folder: harness results, and the
    pre-existing 1280 header collision if one is found.
  - Commit and push `sodax-ai-work-context` at session end.

## Appendix: per-file checklist (line numbers on `origin/main` cbce9d2)

`(Input)` is fixed by the Input `min-w-0`, `(Dialog)` by the DialogContent/Footer
change, `(Select)` by SelectContent. Paths are under `apps/demo/src/`.

**Shell / shared**
- `components/shared/wallet-modal/index.tsx`: L57, L62, L63.
- `wallet-item.tsx`: L81.
- `SodaxSettingsModal.tsx`:
  - L456 → `85dvh`.
  - L457, L465, L654 → `px-4 sm:px-6`.
  - L655 → `flex-wrap`.
  - L662 → `ml-auto`.
  - L283 → drop `text-sm`.
- `PartnerFeeFields.tsx`:
  - L75 `flex space-x-2` → `flex flex-col gap-2 sm:flex-row`.
  - L85 → `w-full shrink-0 sm:w-[130px]`.

**Swaps**
- `components/swaps/SwapCard.tsx`:
  - L406 → `text-xl sm:text-2xl`.
  - L448, L509 (Input).
  - L539, L545, L553, L561 → `gap-2`.
  - L541, L555, L563 → `text-right`.
  - L567 → `w-full wrap-anywhere`.
  - L607 → `wrap-anywhere`.
  - L601, L657 (Dialog).
- `components/swaps-api/SwapCard.tsx`:
  - L604, L674 (Input).
  - L622, L771 → `wrap-anywhere`.
  - L706, L712, L720 → `gap-2`.
  - L744 → `w-full wrap-anywhere`.
  - L765, L826 (Dialog).
- `components/swaps/LimitOrderCard.tsx`:
  - L289, L343 (Input).
  - L371 → `wrap-anywhere`.
  - L365, L415 (Dialog).
- `components/swaps/LimitOrderItem.tsx`: L129, L132 → `wrap-anywhere`.
- Pages: `swaps-sdk/page.tsx` L39 and `swaps-api/page.tsx` L26 → `px-4`.

**Bridge / Bitcoin**
- `components/bridge/BridgeManager.tsx`: L194, L249 (Input).
- `BridgeDialog.tsx`: L236 → `wrap-anywhere`; L166 (Dialog).
- `components/bridge-api/BridgeCard.tsx`:
  - L489, L561 (Input).
  - L479, L634 → `wrap-anywhere`.
  - L607, L640 (Dialog).
- `bridge-api/OrderStatus.tsx`: L19, L29 → `flex w-full max-w-lg flex-col pb-4 text-center wrap-anywhere`.
- `pages/bridge-api/page.tsx`: L9 → `px-4`.
- `components/bitcoin/FundTradingWalletDialog.tsx`:
  - L71 → row.
  - L85 → arrow.
  - L129 → drop `text-sm`.
  - L139 → `wrap-anywhere`.
- `WithdrawTradingWalletDialog.tsx`:
  - L102 → row.
  - L116 → arrow.
  - L127 → spacer.
  - L139, L158 → drop `text-sm`.
  - L194 → `wrap-anywhere`.
- `BitcoinSetupPanel.tsx`:
  - L148 → `p-3 sm:p-4`.
  - L149, L192 → `flex-wrap gap-2`.
  - L350 → `wrap-anywhere`.

**Money market**
- `pages/money-market/page.tsx`:
  - L76 → chain row.
  - L79 → `w-full sm:w-auto`.
  - L85–87 → address row.
  - L101 → placeholder.
- `components/mm/lists/SupplyAssetsList.tsx`:
  - L124 → `flex-wrap gap-2`.
  - L126 → `px-3 sm:px-4`.
  - L159 → Table `min-w-[56rem]`.
- `borrow/BorrowAssetsList.tsx`:
  - L113 → `flex flex-wrap items-center gap-x-3 gap-y-2 mx-4 sm:mx-6 pb-2`.
  - L117 → `flex min-w-0 max-w-full items-center gap-2 sm:ml-2`.
  - L119 → `break-all`.
  - L129 → Table `min-w-[56rem]`.
  - L271 → placeholder.
- Amount rows (Supply L255, Repay L291, Borrow L351, Withdraw L276) → `shrink-0` on
  the symbol and Max (the Input part is covered by the Input change).
- `ActionSuccessContent.tsx`:
  - L102 → `break-all`.
  - L111 → `flex-wrap gap-y-1`.
- `BitcoinTradingSection.tsx`: L33 → `px-4 sm:px-6 pt-0`.

**Staking**
- `pages/staking/page.tsx`:
  - L291 → `px-4 sm:px-6`.
  - L306 → `flex flex-col gap-2 sm:flex-row sm:items-center`.
  - L319 → `w-full sm:max-w-40`.
  - L326–328 → address row.
  - L393, L397, L454, L460 → `gap-2`.
  - Dialogs (Dialog).
- `components/staking/UnstakingInfo.tsx`: L149 → `flex-wrap gap-2`.
- `SodaBalance.tsx`: L26 → `flex-wrap gap-x-2`.

**Dex**
- `pages/dex/page.tsx`: L9 → heading.
- `components/dex/Setup.tsx`:
  - L42 → `flex-wrap`.
  - L82 → `gap-3`.
- `ManageLiquidity.tsx`:
  - L258–265 → triggers.
  - L281, L355, L432, L709, L768 (Input) → badge `shrink-0`.
  - L421, L426 → `px-4 sm:px-6`.
  - L498 → `break-all`.
  - L636 → `flex-wrap gap-2`.
  - L833–835 → `mx-4 mb-4 sm:mx-6 sm:mb-6` + `wrap-anywhere`.
- `UserPositions.tsx`:
  - L77, L232 → `wrap-anywhere`.
  - L190 → `p-3 sm:p-4`.
  - L204, L208, L215, L219 → `break-all`.
  - L239 → `flex-wrap`.
  - L253 → `sm:ml-2`.
  - L348, L351 → `px-4 sm:px-6`.
  - L358, L375 → `flex flex-col gap-2 sm:flex-row`.
- `SimplePoolManager.tsx`: L311 → `min-w-0 wrap-anywhere`.

**Oracle / Recovery / Partner fee**
- `components/oracle/CandleChart.tsx`: L32 → wrapper + `min-w-[640px]`.
- `OracleCandlesCard.tsx`: L113 → `wrap-anywhere`.
- `pages/recovery/page.tsx`:
  - L141–145 → address row.
  - L153 → CardHeader `flex-wrap gap-3`.
  - L184 → `px-4 sm:px-6`.
  - L186 → `flex-wrap`.
  - L187 → `shrink-0`.
  - L196 → `wrap-anywhere`.
  - L291 → placeholder.
- `pages/partner-fee-claim/page.tsx`:
  - L375 → heading.
  - L380 → `flex-wrap`.
  - L382 → `flex-1 min-w-[12rem]`.
  - L419, L607, L613, L706, L712 → `wrap-anywhere`.
  - L451 → `gap-3`.
  - L453 → `min-w-0`.
  - L463 → `min-w-0 text-right break-all`.
  - L675, L773 → button wrap.
  - L813, L896 → `flex-wrap gap-2`.
  - L854 → `flex flex-col gap-2 sm:flex-row`.

**Leverage**
- `pages/leverage-yield-api/page.tsx`: L24 → `px-4`.
- `components/leverage-yield-api/OrderStatus.tsx`: L20, L32 → same as the bridge-api OrderStatus.
- `LeverageCard.tsx`:
  - L550, L602 → `wrap-anywhere`.
  - L532, L582 → `gap-2`.
  - L538, L586 → Max tap target.
- `pages/leverage-yield/page.tsx`:
  - L613, L623, L636, L690 → `gap-2` + `text-right`.
  - L728 (Input).
  - L781 → `h-9 text-base sm:h-7 sm:text-xs`.
- `pages/leverage-positions/page.tsx`: L109 → `grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-2`.
- `PositionSummary.tsx`:
  - L51, L78, L79 → tiles.
  - L39 → InfoHint tap.
  - L165 → `min-h-9 sm:min-h-0`.
- `CreatePositionCard.tsx`:
  - L732 → grid.
  - L768, L801 → `gap-2`.
  - L773 → tap target.
  - L810 → `text-right`.
  - L940 (Select).
  - L963 → `min-w-0`.
- `LeveragePositionsPanel.tsx`:
  - L247, L251 → `px-4 sm:px-6`.
  - L115 → `p-2 sm:p-3`.
- `ClosePositionControl.tsx`:
  - L405 → slider.
  - L425, L467 → button wrap.
- `AdjustLeverageControl.tsx`:
  - L300 → `gap-2`.
  - L357 → slider.
  - L390 → button wrap.
- `PendingOperationControl.tsx`: L176, L189, L206 → button wrap.
