---
type: outcome
repo: sodax-sdks
github: 330
status: Blocked — the backend proxy it depends on does not exist and is not tracked
updated: 2026-08-12
---

# Outcome

- PR: none
- Commits: none
- Tests: n/a

## Summary

Not actionable. The ticket frames the SDK-side work as a one-line default flip "once the proxy
is live" — but the proxy was never built. `sodax-backend#831` was resolved by HMAC-signing
swaps-api's own server-to-server calls (#1028), not by proxying browser traffic, and no issue
anywhere tracks the proxy.

Separately, the inventory needs three corrections before anyone acts on it, the most important
being that **two of the three Bound clients in the workspace would not move** if the packaged
default were flipped.

## What Changed

Nothing in the repo. The corrected inventory is in `process.md`.

## Follow-ups

- **Someone has to decide whether the browser → Bound proxy is still wanted.** If yes it needs
  a backend issue; `task-bound-backend-proxy` in this repo has the agreed design and the
  unanswered blocking question (does the HMAC pair authenticate `/auth/*`, or only `/sodax/*`?).
- If the flip ever happens it must also cover `apps/node/src/bitcoin-radfi.ts` (hardcoded URLs,
  bypasses `RadfiProvider`) and `apps/demo/src/providers.tsx` (hardcoded defaults), or it is a
  partial switch that looks complete.
- Reconcile the two config spellings — `chains.bitcoin.radfi.apiUrl` (SDK) vs
  `BitcoinRpcConfig.radfiApiUrl` (wallet-sdk-react, never read by the SDK). A partner setting
  the second one today silently gets the packaged default.

## Draft comment for the issue — NOT POSTED

> Checked this against `main` before acting on it. Three things.
>
> **The proxy this is gated on doesn't exist.** #831 closed on 2026-08-07, but not with a proxy
> — Bound offered HMAC-SHA256 instead and #1028 shipped that, which signs *swaps-api's own*
> server-to-server calls. Browser → Bound traffic is untouched, and I can't find any backend
> issue tracking a proxy. So there's nothing to point `apiUrl` at, and this should probably be
> marked blocked rather than ready.
>
> **The inventory would produce a partial switch.** Flipping the packaged default doesn't move
> `apps/node/src/bitcoin-radfi.ts`, which bypasses `RadfiProvider` entirely with raw `fetch` and
> hardcoded base URLs (`:17-23`), or `apps/demo/src/providers.tsx`, which hardcodes its own
> defaults. There's also a second config surface — `BitcoinRpcConfig.radfiApiUrl` /
> `radfiUmsUrl` in `packages/types/src/common/common.ts:340-344`, consumed by wallet-sdk-react
> and **never read by the SDK** — so a partner who sets that spelling silently gets the default.
>
> **Line numbers are +11 across the board** (the gh-831 options type landed above :148); every
> endpoint → method mapping is still right. Two small corrections while I'm here:
> `getMaxWithdrawable` *does* have a first-party caller (`BitcoinSetupPanel.tsx:127`) — only
> `createTradingWallet` has none — and there's a third credential path at `RadfiProvider.ts:611`
> that falls back to `config.apiKey`.
