---
type: issue
repo: sodax-sdks
github: 248
status: Active
tags: [demo, solver, swap, ui, localstorage, status-panel]
updated: 2026-06-29
related_decisions: []
---

# GH-248 Demo Solver Status Panel And Remember Last Token

- Source: https://github.com/icon-project/sodax-sdks/issues/248
- Work repo: `sodax-sdks`
- Started: 2026-06-29
- Related PR:

## Problem

Two small UX improvements on the Solver swap page (`apps/demo`):

1. **Intent status panel.** Swap status (Order ID / Intent Hash / Intent Tx
   Hash / Status) currently dumps as plain text stacked at the top of the
   screen. Move it into a dedicated **fixed side container** (left or right),
   update in realtime, and support **multiple concurrent swaps**, each with its
   own status (e.g. `SOLVED`, `pending`).
2. **Remember last chain/asset.** Persist the last picked chain + asset to
   `localStorage`. On reload, use the last chain/token as the selected default
   for both **From** and **To**.

> Keep it small. Needs Fez's approval — he's on board and wants the status to
> update in realtime.

## Raw Issue

```text
Repo:    icon-project/sodax-sdks
Issue:   #248
Title:   [demo] Solver swap: fixed status panel + remember last chain/token
State:   OPEN
Author:  0x0603
Labels:  (none)

Body:
-----
Two small things on the Solver swap page (apps/demo).

## 1. Intent status panel
Right now the swap status (Order ID / Intent Hash / Intent Tx Hash / Status)
just dumps as plain text on top of the screen. It's annoying.
- Move it into a dedicated fixed container on the side (left or right).
- Update in realtime.
- Support multiple swaps at once, each with its own status (e.g. SOLVED, pending).
(See attached: current behavior + sketch of the fixed side panel.)

## 2. Remember last chain/asset
- Store the last picked chain and asset in localStorage.
- On reload, use the last chain/token as the selected default for both From and To.

No rush, keep it small. Needs Fez's approval — he's already on board and wants
the status to update in realtime.

Where to look:
- apps/demo/src/pages/solver/page.tsx — status is rendered at the top via orders.map
- apps/demo/src/components/swaps/OrderStatus.tsx — status display
- apps/demo/src/components/swaps/SwapCard.tsx — src/dst chain+token defaults (currently hardcoded)
```

## Context

Verified against current source (sodax-sdks, 2026-06-29):

### 1. Status rendering (today)

- `apps/demo/src/pages/solver/page.tsx`
  - `SolverPage` owns `const [orders, setOrders] = useState<Order[]>([])`.
  - Renders `orders.map((order, i) => <OrderStatus key={i} order={order} />)`
    at the **top of `<main>`**, above the env/order-type tabs and the card.
  - Passes `setOrders` down to `<SwapCard setOrders={setOrders} />`.
- `apps/demo/src/components/swaps/OrderStatus.tsx`
  - `Order = SolverOrder | SubmitTxOrder` (discriminated on `mode`).
  - `SolverOrderStatus` already polls realtime via `useStatus(...)`;
    `SubmitTxOrderStatus` via `useBackendSubmitSwapTxStatus(...)`.
  - **Realtime already works** at the data layer (React Query hooks). The issue
    is purely layout/placement + multi-swap presentation, not wiring new
    polling.
  - Renders plain stacked `<div>`s; `status.value.status` is mapped through
    `statusCodeToMessage(...)` (`@/lib/utils`).
- `apps/demo/src/components/swaps/SwapCard.tsx`
  - `handleSwap` / `handleSubmitTxSwap` append to `orders` via
    `setOrders(prev => [...prev, ...])`. Both order modes already accumulate, so
    "multiple swaps at once" is supported by state — only display needs a panel.

### 2. Chain/token defaults (today)

- `SwapCard.tsx`:
  - `src` default: `{ chain: DEFAULT_SELECTED_CHAIN, token: getSupportedSolverTokens(DEFAULT_SELECTED_CHAIN)[0] }`
  - `dst` default: `{ chain: ChainKeys.POLYGON_MAINNET, token: getSupportedSolverTokens(ChainKeys.POLYGON_MAINNET)[0] }`
  - `DEFAULT_SELECTED_CHAIN = ChainKeys.ARBITRUM_MAINNET` (from `@/zustand/useAppStore`).
- `apps/demo/src/zustand/useAppStore.tsx`
  - zustand + `immer` middleware, **no `persist` middleware**. So persistence
    must be added (either a `persist` slice or direct localStorage in SwapCard).

### Key pitfall (from `apps/demo/AGENTS.md`)

> Balance readers derive the chain from `xToken.chainKey`, not the selected
> chain. On a chain switch, "keep the same token" logic must re-resolve the
> selected `XToken` to the **new chain's** instance (match by symbol from
> `getSupportedSolverTokens(chain)`) — never retain the previous `XToken`
> object, or `useXBalances` fetches the old chain's balance.

→ Therefore localStorage must store **chain key + token symbol/address only**,
and on load re-resolve the token from `getSupportedSolverTokens(chain)`. Never
JSON-revive a stale `XToken` object as the live token.

## Acceptance Criteria

- Status panel is a **fixed side container** (not stacked at top of `<main>`).
- Multiple concurrent swaps each render their own status card in the panel.
- Status updates in realtime (preserve existing `useStatus` /
  `useBackendSubmitSwapTxStatus` hooks; do not regress polling).
- A clear per-order status indicator (e.g. `SOLVED` / `pending` / error).
- Last picked `src`/`dst` chain + token persist to `localStorage`.
- On reload, From/To default to the persisted chain + a token re-resolved from
  `getSupportedSolverTokens(chain)` (symbol match), with a safe fallback to
  `[0]` when the symbol no longer exists on that chain.
- Scope stays small and demo-only; no business logic leaks into `apps/demo`.
- Gates green: `pnpm --filter sodax-demo-v2 checkTs`, `pnpm lint`.

## Related

- Knowledge:
- Decisions:
- Sibling issue: gh-252-integrate-hana-wallet-bitcoin-connector (same repo/app surface)
