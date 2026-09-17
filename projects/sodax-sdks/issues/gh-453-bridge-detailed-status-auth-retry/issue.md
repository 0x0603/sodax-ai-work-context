---
type: issue
repo: sodax-sdks
github: 453
status: Active
tags: [bridge, bridge-api, detailed-status, api-key, dapp-kit, relay, docs, skills]
updated: 2026-09-17
related_decisions: []
---

# GH-453 Bridge Detailed Status Auth Retry

- Source: https://github.com/icon-project/sodax-sdks/issues/453
- Opened: 2026-09-14 by `R0bi7`, assigned to `0x0603`
- No parent issue, no sub-issues (checked via `gh api .../453/sub_issues` and `/timeline`)
- Started: 2026-09-17
- Related PR: none yet

## Problem

Bridge got the backend submit-tx flow and the per-action API key, but not the two
swap-parity behaviours that flow needs to be usable:

1. A caller holding only the **source-chain tx hash** cannot tell a bridge that the
   client-side fallback completed from one whose backend record is stuck. Swap solved
   this with `getDetailedStatus` / `useDetailedStatus`; bridge has no analog.
2. Every `useBridgeApi*` hook still uses `retry: 3`, so a rejected API key is retried
   3× per tick and the status hook keeps polling forever. Swaps and leverage-yield
   already stop on 401/403 via `retryUnlessAuthFailure`.

## Context — issue body, verbatim

> **Already in bridge (do not redo):** backend submit-tx + client fallback, `extras.apiKey`,
> `getSubmitTxStatus` / `useBridgeApiSubmitTxStatus` with `(txHash, srcChainKey)` + `apiConfig`,
> unit/wire tests, config flag, skills.
>
> **Not todos (swap-only, not a bridge feature):** solver quote/status/`postExecution`, limit
> orders, cancel, intent hash/packet/fill, `submitIntent`, hub-source skip-relay, delivery hooks,
> `getSolvedIntentPacket`. Those need a solver or an intent; bridge has neither.
>
> **Actual leftover swap-parity that still applies to bridge:**
>
> - **Src-tx status router** (`getDetailedStatus` / `useDetailedStatus` analog). Swap has this
>   because `getSubmitTxStatus` 404s or goes stale after fallback. Bridge has the same two-path
>   problem; the second source is the **relay packet** (`dst_tx_hash`), not the solver. Without it,
>   a UI that only holds the spoke tx cannot tell a completed fallback from a stuck backend record.
>   Ship SDK method + dapp-kit poll hook + the stale/abandoned caveat in `BRIDGE.md` /
>   `BRIDGE_API.md` / skills (swap already documents this; bridge does not).
> - **Stop retrying on 401/403 in `bridgeApi` hooks.** Swaps (and leverage-yield) use
>   `retryUnlessAuthFailure` and stop status polling on auth failure. Every `useBridgeApi*` hook
>   still uses `retry: 3` and the status hook keeps refetching a bad key. Same `x-api-key` surface;
>   copy that policy and mention 401/403 in `BRIDGE_API.md`.
> - **Optional live e2e pin** for an already-relayed **bridge** deposit in `e2e-relay.test.ts`
>   (explicitly deferred until a real `{ tx, relayData }` fixture exists). Relay idempotency is
>   already covered by the shared swap case; this only proves the bridge envelope.
>
> That is the whole list. The submit-tx flow and per-action API key are done; remaining work is
> "poll from src tx after fallback" and "don't hammer a rejected key."

## Scope answer (the question this dossier was opened to settle)

**Every item lands in `sodax-sdks` only** — packages `sdk`, `dapp-kit`, `skills` plus
`packages/sdk/docs`. No `sodax-backend` change, no `sodax-frontend` change. Evidence and
the refutation attempts are in `process.md` § Scoping evidence.

## Acceptance Criteria

Derived from the body — the issue has no checklist of its own.

- [ ] `BridgeService.getDetailedStatus({ srcChainKey, srcTxHash })` returns a tagged
      `{ source: 'backend' | 'relay', ... }` union, routing off the backend record exactly as
      swap does (`success: false`, 404, 5xx, transport error, terminal `failed`, `abandonedAt`
      → source 2).
- [ ] `LOOKUP_FAILED` with `context.reason = 'relay_not_delivered'` set **only** when the
      backend also answered (a record, or a definitive 404).
- [ ] dapp-kit `useBridgeApiDetailedStatus` (or `useBridgeDetailedStatus` — name to settle)
      polls it with a terminal-state stop and an ambiguous-read budget.
- [ ] All 10 `useBridgeApi*` hooks that hard-code `retry: 3` use `retryUnlessAuthFailure`.
- [ ] `useBridgeApiSubmitTxStatus` stops its 1s poll on `isAuthFailure(query.state.error)`.
- [ ] `BRIDGE.md` gets a `## Get Detailed Status` + `### Why it exists` + `### When it fails`
      block; `BRIDGE_API.md` gets the 401/403 paragraph. Bridge skills updated.
- [ ] Unit tests for both the router and the status hook's auth stop.
- [ ] e2e bridge pin: left deferred, with the in-source comment updated only if a fixture appears.

## Related

- Knowledge: none yet.
- Decisions: none.
- Issues: `gh-255` (bridge API v2 build-out), `gh-305` / PR #308 (standalone `@sodax/bridge-api`
  package, unmerged — will conflict), `gh-451` (bridge manual test), `gh-452` (leverage-yield
  submit-tx + api key, the same shape one feature over), `gh-429` (unified API host deprecation).
</content>
