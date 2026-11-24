---
type: issue
repo: builders-sodax-mcp-server
github: 147
status: Active
tags: [bridge, action-tools, builders-mcp]
updated: 2026-11-24
related_issues: [79, 119, 127, 129, 125]
related_decisions: []
---

# GH-147 Bridge tools: move a token across chains through the Bridge API

- Source: https://github.com/gosodax/sodax-mcp/issues/147 (Feature, sub-issue of #119, Sodax board #1 Backlog, stream Builders MCP)
- Started: 2026-11-23
- Related PR: none yet

## Problem

Two tools on the action template: `sodax_bridge_prepare` (resolve pair on `/v1/bridge/tokens`, bridgeable +
`bridgeable-amount` checks, build approval + deposit, verify the build, `confirm` then `execute`) and
`sodax_bridge_submit_and_track` (check sent tx, `/v1/bridge/submit-tx` with stored `relayData`, track to arrival).
Every result carries #129's `nextAction`. Full AC on GitHub.

## Context (verified 2026-11-23)

- Bridge API is live: `GET /v1/bridge/tokens` 200 on `api.sodax.com` and `canary-api.sodax.com`. Endpoints:
  sodax-backend `apps/bridge-api/src/api/bridge/bridge.controller.ts` (tokens, allowance/check, approve, intents,
  fee, bridgeable-amount, bridgeable/check, submit-tx, submit-tx/status).
- `POST /bridge/intents` returns only `{ tx, relayData }` (`bridge.service.ts:140-149`), no structured intent, so the
  swap's field-by-field check (`quote.ts:394-418`) doesn't carry over. Instead recompute the payload with the SDK's
  public `BridgeService.buildBridgeData(params, srcToken, dstToken, partnerFee)` (sodax-sdks
  `packages/sdk/src/bridge/BridgeService.ts:1205`, present in `@sodax/sdk@2.3.0-rc.3`) and compare bytes.
- Status lifecycle `pending → relaying → relayed → executed | failed` (`submit-bridge-tx-status.dto.ts:12`).
  `executed` plus a non-empty `result.dstIntentTxHash` = the source packet landed: on the hub for a spoke source,
  on the destination for a Sonic source. Spoke→spoke hub→destination hop is NOT tracked by the backend
  (`bridge.service.ts:49-51`) → needs #127's delivery infrastructure (PR #145), with bridge-specific matching.
- Bridgeable = same `vault`; direction guard (`XToken.access`) is enforced only in the backend
  (`bridge.service.ts:250-262`).
- Bitcoin needs Bound (`bound.accessToken`), refused like swaps.
- Profile is hard-coded `"swap"` (`profiles.ts:11`, `actionTool.ts` `registerAppTool(server, "swap", …)`).

## Related

- Base: PR #138 (`feat/129-next-action` @ `33e9e24`). Delivery: PR #145 (#127). Quote store: PR #137 (#125).
- #79 issue D6: bridge reuses the action template.
