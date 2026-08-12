---
type: issue
repo: sodax-sdks
github: 330
status: Blocked
tags: [bitcoin, bound, radfi, inventory, config, proxy]
updated: 2026-08-12
related_issues: [gh-1024-bound-auth-email-provider]
related_decisions: []
---

# GH-330 Bound Exchange Endpoint Inventory

- Source: https://github.com/icon-project/sodax-sdks/issues/330
- Started: 2026-08-12 (verification pass — no code)
- Related PR: none
- Filed out of `sodax-backend` `task-bound-backend-proxy` (Discord thread with R0bi7, 2026-07-30)

## Problem

After sodax-backend#831, `swaps-api` calls Bound Exchange server-to-server with an HMAC
`x-api-signature`. Every other Bound call still goes browser → Bound directly, which requires
Bound to whitelist each consumer's domain. **The ticket's premise is that the backend will
proxy these**, and that the SDK-side change is therefore just the config switch:

1. a dApp opts in today with `new Sodax({ chains: { bitcoin: { radfi: { apiUrl: '<proxy>' } } } })`;
2. flip the packaged default in `@sodax/types` `chains.ts` once the proxy is live
   (changeset + `CONFIG_VERSION`).

The issue body carries the full endpoint inventory of
`packages/sdk/src/shared/entities/btc/RadfiProvider.ts`.

## Context

`radfi.signRequest` (from sodax-backend#831) stays as the escape hatch for partners running
their own Bound credential.

## Acceptance Criteria

- [ ] Flip `chains.bitcoin.radfi.apiUrl` to the proxy — **blocked, the proxy does not exist**.
- [x] Inventory verified against current `main`. Corrections in `process.md`.

## Related

- Knowledge:
- Decisions:
