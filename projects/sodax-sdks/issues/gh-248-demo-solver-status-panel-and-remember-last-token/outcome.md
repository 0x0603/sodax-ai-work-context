---
type: outcome
repo: sodax-sdks
github: 248
status: In Review
updated: 2026-06-29
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/257
- Branch: `feat/demo-solver-status-panel` (rebased onto origin/main).
- Commits:
  - `203b49f4` feat(demo): solver swap status side panel + persisted history
    (fixed status panel, localStorage history 15-FIFO with terminal-status cache,
    remember last chain/token, AMOUNT summary, copy + Sonic/SodaxScan links built
    direct from the hash, **per-order `statusEndpoint`** so status polls the env
    the order was created on).
  - `5870c1c7` feat(demo): searchable network & token selects on the swap form
    (`SelectChain` search + new `SelectToken`, Radix focus-loss fix).
- Tests: `pnpm --filter sodax-demo-v2 checkTs` ✓; `biome lint` ✓ (demo `pnpm test`
  is a no-op by design). Verified live in-browser (status per-env, focus retained,
  15-item panel scroll, icons).

## Summary

Both parts of the issue implemented in `apps/demo`, demo-only, no SDK/dapp-kit
change. Type + lint gates pass. Not yet manually smoke-tested with a real wallet
and not committed (awaiting user trigger + Fez approval).

## What Changed

1. **Status panel.** Swap status moved out of the top-of-page text dump into a
   fixed **left-side, vertically-centered** panel (`OrderStatusPanel.tsx`),
   **newest on top**, one card per swap with a tone accent + status pill + dot,
   dismiss button. Realtime polling preserved (`useStatus` /
   `useBackendSubmitSwapTxStatus` per card, loaded inside the component).
2. **Copy + links.** Every detail value is copyable; submit-tx Tx Hash links to
   the chain explorer; each card resolves a SodaxScan message link async.
3. **AMOUNT summary.** Each card shows `AMOUNT TOKEN (NETWORK) → AMOUNT TOKEN
   (NETWORK)` with chain icon + name.
4. **Persisted history + queue.** `lib/orderHistory.ts` persists orders to
   localStorage with a **15-item FIFO cap**; in-flight swaps survive a refresh
   and show on completion. Order model made JSON-safe (no bigint).
5. **Remember last chain/token.** `lib/lastSelection.ts` persists last `src`/`dst`
   chain + token symbol; `SwapCard` lazy-inits + re-saves; token re-resolved from
   `getSupportedSolverTokens(chain)` (avoids the stale-`XToken` balance bug).

Files (7): `src/lib/orderHistory.ts` (new), `src/lib/lastSelection.ts` (new),
`src/components/swaps/OrderStatusPanel.tsx` (new),
`src/components/swaps/OrderStatus.tsx` (rewrite),
`src/pages/solver/page.tsx` (edit), `src/components/swaps/SwapCard.tsx` (edit),
`src/pages/leverage-yield/page.tsx` (edit — shares the `Order` type). Detail in
`process.md`.

## Follow-ups

- Manual smoke: concurrent swaps render newest-on-top + update independently;
  copy + explorer/SodaxScan links work; reload keeps history (≤15) and the
  status resolves; From/To chain+token restored with correct balances; dismiss
  works; 16th swap evicts the oldest.
- Confirm with author: SodaxScan link UX, whether leverage-yield orders should
  also persist/cap.
- Fez approval, then commit + open PR in sodax-sdks.
- Mobile: panel is `lg:`-only (centered card on small screens) — revisit if a
  responsive treatment is wanted.
