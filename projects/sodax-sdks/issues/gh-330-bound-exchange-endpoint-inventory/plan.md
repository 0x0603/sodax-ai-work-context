---
type: plan
repo: sodax-sdks
github: 330
updated: 2026-08-12
---

# Plan

## Goal

Establish whether this is actionable, and correct the inventory before anyone relies on it.

## Findings that change the plan

**The premise is false.** The backend proxy this ticket is gated on does not exist and nothing
tracks it — see `process.md`. What shipped instead was HMAC signing for swaps-api's own
server-to-server calls. So there is nothing to point `apiUrl` at.

**The inventory is accurate but incomplete**, and following it would produce a config flip that
misses two of the three Bound clients in the workspace.

## Approach

Do not write code. Record the corrections, and record what a complete switch would actually
have to cover so the next person does not ship a partial one:

1. `packages/sdk/.../RadfiProvider.ts` via `chains.bitcoin.radfi.apiUrl` — what the ticket covers.
2. `apps/node/src/bitcoin-radfi.ts` — **hardcoded** base URLs, bypasses `RadfiProvider` entirely.
3. `apps/demo/src/providers.tsx` — hardcodes its own defaults, so it would not move either.

Plus the second config surface (`BitcoinRpcConfig.radfiApiUrl` / `radfiUmsUrl`), which
`wallet-sdk-react` consumes and the SDK never reads — a partner setting those silently gets the
packaged default.

## Verification

n/a — nothing changed.

## Risks

The risk is a *partial* switch that looks complete: flipping the packaged default while
`apps/node` and `apps/demo` keep calling Bound directly, and while partners who configured
`radfiApiUrl` (the other spelling) quietly don't move.
