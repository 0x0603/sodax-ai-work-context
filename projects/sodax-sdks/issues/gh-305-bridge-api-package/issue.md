---
id: gh-305-bridge-api-package
type: issue
repo: sodax-sdks
github: 305
status: Active
created: 2026-07-23
updated: 2026-07-23
tags: [bridge, bridge-api, standalone-package, swaps-api, raw-tx-schemas]
related_issues: [gh-255-bridge-api, gh-1417-swaps-api-sdk]
related_decisions: [0001-swaps-api-throwing-minimal]
---

# gh-305 — feat(bridge-api): create new package bridge-api

## Goal

Create a standalone `@sodax/bridge-api` npm package wrapping the backend Bridge API v2,
modeled on `@sodax/swaps-api` (gh-1417), and refactor the in-SDK `BridgeApiService`
(built in gh-255 on `feat/bridge-api-v2`) into a thin `Result<T>` adapter over it —
mirroring the swaps end-state (one wire implementation). No breaking changes to the
public SDK surface; behavior improvements listed explicitly in the PR description.

Issue body on GitHub is empty — scope was defined in conversation with the user.

## User-confirmed scope decisions

1. SDK wrap in the SAME PR (mirror `SwapsApiService`).
2. No example app (`apps/bridge-api-example` deferred as follow-up).
3. ~~Share ONLY `rawTxSchemas` via a new private workspace package~~ **REVISED
   2026-07-23 (user, after discussing with the Plan agent): copy-only.** bridge-api
   carries its own verbatim copy of the HARDENED swaps-api `rawTxSchemas.ts` + the
   identical test file (the anti-drift fence); swaps-api stays 100% untouched;
   extraction into a shared private package is a follow-up issue. (NOT into
   `@sodax/types` either way — zero-runtime-dep package; valibot would leak
   graph-wide.) Everything else (http/errors/serialize/config) copied per ADR 0001.

## Branch

`feat/bridge-api-package`, off `feat/bridge-api-v2` (PR #261 still OPEN at start).
