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

(none yet — planning only)
