---
type: process
repo: sodax-sdks
github: 248
updated: 2026-06-29
---

# Process

## Log

- 2026-06-29 — Triaged issue from GitHub, scaffolded folder, wrote issue.md +
  plan.md. No code yet. Target repo confirmed: **sodax-sdks** (the referenced
  files exist there, not in sodax-frontend's `apps/demo`).

## Findings

- Realtime status already works: `OrderStatus.tsx` polls via `useStatus` /
  `useBackendSubmitSwapTxStatus` (React Query). The issue is layout (text dumped
  at top of `<main>` via `orders.map`), not missing polling.
- `orders` state already accumulates multiple swaps (`setOrders(prev => [...])`
  in both `handleSwap` and `handleSubmitTxSwap`) — "multiple swaps at once" is a
  display problem only.
- `useAppStore.tsx` uses zustand + immer, **no persist middleware** → must add
  localStorage persistence for last chain/token (helper in `apps/demo` or a
  persist slice).
- Defaults today (`SwapCard.tsx`): src = `DEFAULT_SELECTED_CHAIN`
  (ARBITRUM_MAINNET) + token[0]; dst = `POLYGON_MAINNET` + token[0].
- **Pitfall (apps/demo/AGENTS.md):** balance readers derive chain from
  `xToken.chainKey`. Persist chain key + token **symbol** only and re-resolve the
  live `XToken` from `getSupportedSolverTokens(chain)` on load — never revive a
  stored `XToken` object.
- Current list keys on array index; switch to `intentHash` (solver) / `txHash`
  (submit-tx) for stable keys + dismiss.

## Changes During Work

- 2026-06-29 — Implemented both parts in `apps/demo` (sodax-sdks). Gates green:
  `pnpm --filter sodax-demo-v2 checkTs` + `biome check` on the 5 touched files.
- Files:
  - **new** `src/lib/lastSelection.ts` — `loadLastSelection()` /
    `saveLastSelection()`; persists `{ chain, tokenSymbol }` per leg under
    `sodax-demo:solver:last-selection`, re-resolves the live `XToken` from
    `getSupportedSolverTokens(chain)` (symbol match, `[0]` fallback), validates
    via try/catch + length, SSR-guarded.
  - **rewrite** `src/components/swaps/OrderStatus.tsx` — card + status pill
    (green/amber/red/gray via `toneFromLabel`), compact truncated detail rows,
    optional `onDismiss` (X button). Kept both realtime hooks (`useStatus`,
    `useBackendSubmitSwapTxStatus`) untouched; solver "pending" card now renders
    before first data instead of returning null. Order types unchanged.
  - **new** `src/components/swaps/OrderStatusPanel.tsx` — fixed right-side panel
    (`fixed right-4 top-24 z-40 w-80 max-h-[80vh] overflow-y-auto`, `lg:` only),
    "Swaps (n)" header, empty-state null. Exports `orderId(order)` =
    `intentHash` (solver) / `txHash` (submit-tx) for stable keys + dismiss.
  - **edit** `src/pages/solver/page.tsx` — removed top `orders.map`; mounts
    `<OrderStatusPanel>`; `handleDismissOrder` filters by `orderId`.
  - **edit** `src/components/swaps/SwapCard.tsx` — lazy-init `src`/`dst` from
    `loadLastSelection()` (defaults fallback); `useEffect([src,dst])` persists.
- Gotcha hit: `getSupportedSolverTokens` returns `readonly XToken[]` — typed the
  local as `readonly XToken[]` (TS4104).
- Decisions taken (recommended defaults, pending author confirmation): panel on
  the **right**, **with** dismiss, persist **per-leg** (src and dst independent).
- Not done: manual dev-build smoke (needs a wallet); Fez approval still pending.
  No commit yet (awaiting user).

- 2026-06-29 (iteration 2, per user feedback) — reworked the panel + order model:
  - Panel moved to the **left, vertically centered** (`fixed left-4 top-1/2
    -translate-y-1/2`), **newest order on top** (`[...orders].reverse()`),
    cherry-soda count badge.
  - Card UI polish: left tone-accent border, status dot (amber pulses), pill,
    `cherry-*` brand colors. Each detail row is now **copyable**
    (`navigator.clipboard`, Copy→Check) and **linkable**: submit-tx Tx Hash →
    `getChainExplorerTxUrl(srcChainKey, txHash)`; every card resolves a
    **SodaxScan** message URL async (`getSodaxScanMessageUrl`) → "View on
    SodaxScan" link. Hashes middle-ellipsised.
  - **AMOUNT TOKEN (NETWORK) → AMOUNT TOKEN (NETWORK)** summary line per card,
    with chain icon + name (`getChainIcon`/`getChainName` from `lib/chains`).
  - **Order model made JSON-safe** (dropped `intent`/`intentDeliveryInfo` which
    carried bigint): `SolverOrder = { mode, intentHash, orderId, dstTxHash,
    summary }`; `SubmitTxOrder = { mode, txHash, srcChainKey, apiBaseURL?,
    summary }`; `OrderSummary = { from, to: { amount, symbol, chain } }`.
  - **History persisted to localStorage** — `lib/orderHistory.ts`
    (`loadOrders`/`saveOrders`, key `sodax-demo:solver:orders`) with a
    **15-item FIFO cap** (`MAX_ORDERS`, `.slice(-15)` on append + load + save).
    `solver/page.tsx` lazy-inits from storage + persists on change. Status is
    re-loaded **inside `OrderStatus`** from the stored hash, so a swap that
    settles during a refresh still shows complete on reload.
  - **Cross-file impact:** `pages/leverage-yield/page.tsx` shares the `Order`
    type and renders `<OrderStatus>` — updated its two order appends to the new
    scalar shape + `summary` (so the AMOUNT line shows for deposit/withdraw too).
    It keeps its own in-memory orders (no persistence/cap — out of scope).
  - Gates re-run green: `pnpm --filter sodax-demo-v2 checkTs`; `biome check` on
    all 7 touched files. TS gotcha: `.slice()` breaks the array-literal
    contextual typing, so order appends needed `mode: '…' as const`.
  - Files touched (7): `lib/orderHistory.ts` (new), `lib/lastSelection.ts`,
    `components/swaps/OrderStatus.tsx`, `components/swaps/OrderStatusPanel.tsx`,
    `pages/solver/page.tsx`, `components/swaps/SwapCard.tsx`,
    `pages/leverage-yield/page.tsx`.

- 2026-06-29 (iteration 3, cleanup + perf) — reviewed and simplified, and fixed a
  real polling waste the user flagged:
  - **Found:** solver `useStatus` has `refetchInterval: 3000` with no terminal
    stop → a done solver swap polls the backend every 3s **forever** while
    mounted; submit-tx (`useBackendSubmitSwapTxStatus`) stops on
    `executed`/`failed`; SodaxScan resolved once per card on mount regardless.
    So persisted/done swaps kept hitting the network on every load.
  - **Fix — cache terminal status.** Added `FinalStatus` ({label, error?,
    extraRows?, scanUrl?}) onto `Order`. `OrderStatus` now dispatches: if
    `order.final` → `StaticOrderCard` (no hooks, **0 requests**); else
    `SolverLiveCard` / `SubmitTxLiveCard` which poll, and on reaching a terminal
    label call `onSettle(id, final)`. `page.tsx` `handleSettleOrder` (useCallback)
    merges `final` into the order (guarded by `!order.final`) → persisted → next
    load renders static. SodaxScan link is snapshotted into `final.scanUrl`, so
    it survives without re-fetching.
  - **Cleanups:** 3 `TONE_*` maps → one `TONE` record; new `lib/storage.ts`
    (`readJson`/`writeJson`) so `orderHistory`/`lastSelection` drop the duplicated
    window+try/catch; `buildOrderSummary()` exported from `OrderStatus` and reused
    by `SwapCard` + `leverage-yield` (was duplicated); `orderId()` moved into
    `OrderStatus` (panel/page import it from there); `OrderCard` made pure (scanUrl
    passed in, not a hook).
  - **biome gotcha:** `useExhaustiveDependencies` is on — an array built in render
    (`extraRows`) can't be a stable dep. Fixed by `deriveSubmitTx(statusResponse)`
    (module helper, typed via `ReturnType<typeof useBackendSubmitSwapTxStatus>`)
    and depending the effect on the stable React-Query `statusResponse` ref, not
    on derived arrays. No `biome-ignore` needed.
  - Files now: `lib/storage.ts` (new, 28), `lib/orderHistory.ts` (40),
    `lib/lastSelection.ts` (47), `OrderStatus.tsx` (420 — grew vs 355 because the
    static/live split + caching is net-additive, but logic is cleaner/separated),
    `OrderStatusPanel.tsx` (37), `pages/solver/page.tsx`,
    `components/swaps/SwapCard.tsx`, `pages/leverage-yield/page.tsx`.
  - Gates green: `pnpm --filter sodax-demo-v2 checkTs`; `biome check` (8 files).
  - Note: `leverage-yield` renders `<OrderStatus>` without `onSettle`, so its
    orders don't cache/stop-polling (out of scope; pre-existing behavior). Could
    pass `onSettle` later if wanted.

## 2026-06-29 — Show/hide history toggle (smooth + persisted)

Follow-up on the same panel (still on `feat/demo-solver-status-panel`, PR #257).

- **Ask:** make the history panel show/hide "thật mượt" and persist the state in
  localStorage.
- **Toggle lives in `OrderStatusPanel`** (one change covers both solver +
  leverage-yield, which share the panel). The header is now a `<button>` with
  `aria-expanded`; a `ChevronDown` rotates `-rotate-90` when collapsed.
- **Smooth collapse without a measured pixel height:** wrap the list in a
  `grid` whose `grid-template-rows` animates `1fr ⇄ 0fr` (inner child
  `overflow-hidden`), `transition-[grid-template-rows] duration-300 ease-out`.
  Auto-height collapse, no JS measuring, no new dep (no Radix Collapsible in the
  app — didn't add one). Spacing moved off the `aside` `gap-3` onto the
  collapsible inner (`pt-3`) so a collapsed panel leaves no trailing gap.
- **Persistence:** new `lib/panelPrefs.ts` (thin over `lib/storage.ts`, mirrors
  `lastSelection`), per-feature keys `SOLVER_PANEL_KEY` /
  `LEVERAGE_YIELD_PANEL_KEY`. Panel lazy-inits collapsed from storage + re-saves
  on change. Both pages pass `storageKey`.
- **Verified in-browser (Playwright, injected 3 fake SOLVED orders):** expand
  `grid-template-rows: 391.5px` ⇄ collapse `0px`, transition prop
  `grid-template-rows` 0.3s, `localStorage … :history-collapsed` flips
  `true`/`false`, survives reload, and solver (collapsed) vs leverage-yield
  (expanded) stay independent. `checkTs` clean for the 4 touched files (the
  pre-existing `constants.ts` `hanaWallet` TS2687 reproduces on a stashed tree —
  unrelated/environmental); `biome lint` green on all 4.
- Files: `lib/panelPrefs.ts` (new), `components/swaps/OrderStatusPanel.tsx`,
  `pages/solver/page.tsx`, `pages/leverage-yield/page.tsx`.
