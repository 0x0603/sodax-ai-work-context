---
type: plan
repo: sodax-sdks
github: 248
updated: 2026-06-29
---

# Plan

## Goal

Two scoped, demo-only UX changes on the Solver swap page (`apps/demo`):

1. Replace the plain text status dump (top of `<main>`) with a **fixed side
   panel** that shows one card per in-flight swap, each updating in realtime
   with a clear status indicator (`SOLVED` / `pending` / error).
2. Persist the last `From`/`To` chain + token to `localStorage` and restore them
   as the defaults on reload.

No SDK / dapp-kit changes — this is presentation + local persistence in
`apps/demo` only. Realtime polling already exists (React Query hooks in
`OrderStatus.tsx`); we are not adding new data wiring.

## Approach

### Part 1 — Fixed status panel

- New component `apps/demo/src/components/swaps/OrderStatusPanel.tsx`:
  - Fixed container, recommended **right side**:
    `fixed right-4 top-24 z-40 w-80 max-h-[80vh] overflow-y-auto space-y-2`
    (the issue sketch shows a right-hand side panel). Hide/collapse on small
    screens (`hidden lg:block`) since the swap card is centered — note this is a
    demo, mobile polish is out of scope.
  - Header ("Swaps") + empty state when `orders.length === 0`.
  - Maps `orders` → one `<OrderStatusCard order=... onDismiss=... />` each.
- Refactor `OrderStatus.tsx` into a card-with-badge:
  - Keep the two realtime hooks (`useStatus`, `useBackendSubmitSwapTxStatus`) —
    do **not** regress polling. Each card stays its own component so each polls
    independently.
  - Derive a small `{ label, variant }` status descriptor (e.g. `pending`
    (amber) / `SOLVED` (green) / `error` (red)) and render it as a Badge in the
    card header; keep the existing detail rows (Order ID / hashes) in the body,
    compact.
  - Reuse `statusCodeToMessage` (`@/lib/utils`) for the solver status text.
- Order identity for stable keys + dismiss: give each `Order` a stable id —
  solver order has `intentHash`, submit-tx order has `txHash`. Key the list on
  that instead of array index (current code keys on `index`). Add an optional
  dismiss "×" that calls `setOrders(prev => prev.filter(o => id(o) !== id))`.
- `pages/solver/page.tsx`: remove the top `orders.map(...)`; render
  `<OrderStatusPanel orders={orders} onDismiss={...} />` as a fixed sibling so it
  floats and no longer pushes the centered card down.

### Part 2 — Remember last chain/token (localStorage)

- Store **chain key + token symbol only** — never a revived `XToken` object.
  Per `apps/demo/AGENTS.md`, the live token must be re-resolved from
  `getSupportedSolverTokens(chain)` on the target chain, or `useXBalances`
  fetches the wrong chain's balance.
- New helper `apps/demo/src/lib/lastSelection.ts` (or inline in SwapCard):
  - Key: `sodax-demo:solver:last-selection`.
  - Shape: `{ src: { chain, tokenSymbol }, dst: { chain, tokenSymbol } }`.
  - `loadLastSelection()` → validate `chain ∈ supportedSpokeChains`, resolve
    token by symbol from `getSupportedSolverTokens(chain)`, fallback to `[0]`;
    on any miss / parse error return the current hardcoded defaults
    (`DEFAULT_SELECTED_CHAIN` src / `POLYGON_MAINNET` dst).
  - `saveLastSelection(src, dst)` → writes `{ chain, token.symbol }` only.
  - Guard `typeof window !== 'undefined'` and wrap JSON parse in try/catch.
- `SwapCard.tsx`:
  - Initialize `src`/`dst` `useState` via lazy initializer reading
    `loadLastSelection()`.
  - `useEffect([src, dst])` → `saveLastSelection(src, dst)`.
  - Leave all existing chain/token re-resolution (`onSrcChainChange`,
    `onDestChainChange`, token `Select`) untouched — they already resolve from
    `getSupportedSolverTokens(chain)`.

## Steps

1. `lib/lastSelection.ts` — load/save with validation + safe fallback.
2. Refactor `OrderStatus.tsx` → export an `OrderStatusCard` (badge + compact
   detail rows); keep both polling hooks intact.
3. `OrderStatusPanel.tsx` — fixed side container, empty state, maps orders,
   optional dismiss.
4. `pages/solver/page.tsx` — drop top map; mount `<OrderStatusPanel>`; add stable
   order id helper; thread `onDismiss`.
5. `SwapCard.tsx` — lazy-init `src`/`dst` from persisted selection; persist on
   change.
6. Gates + manual smoke.

## Verification

- `pnpm --filter sodax-demo-v2 checkTs` and `pnpm lint` green.
- Manual (`pnpm dev:demo`):
  - Fire two swaps → two cards appear in the side panel; statuses advance
    independently and in realtime; dismiss removes one.
  - Change From/To chain + token, reload → defaults restore to the last picks;
    balances read the correct (restored) chain (no stale-token bug).
  - Clear/legacy `localStorage` → falls back to hardcoded defaults without
    throwing.

## Risks

- **Stale `XToken` pitfall** — mitigated by persisting symbol only and
  re-resolving per chain (see `apps/demo/AGENTS.md`).
- **Layout overlap** — fixed panel can overlap the card on narrow viewports;
  gate behind `lg:` and keep the card centered. Demo-only, acceptable.
- **Order identity** — switch list keys from index to `intentHash`/`txHash` so
  dismiss/realtime updates target the right card.
- **Approval gate** — issue needs Fez's sign-off (he wants realtime; already
  satisfied by existing hooks) before merge.

## Open decisions (confirm with author)

- Panel side: **right** (recommended, matches the sketch) vs left.
- Dismiss button: include (recommended) vs auto-keep all until reload.
- Persist scope: per-`src`/`dst` independently (recommended) vs a single
  last-chain shared by both.
