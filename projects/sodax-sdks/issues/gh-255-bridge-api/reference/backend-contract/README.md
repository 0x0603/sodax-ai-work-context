---
type: reference
repo: sodax-sdks
github: 255
status: Decided
updated: 2026-06-30
tags: [bridge-api, backend-contract, decisions, swaps-reference, sdk-first]
---

# Bridge API — Backend Contract (DECIDED)

The `/bridge/*` HTTP contract the SDK `BridgeApiService` targets, plus the 13
decisions that locked it. Grounded in the real swaps controller/DTOs + bridge SDK.

## ⚠️ Sequencing — SDK FIRST, backend AFTER

**`@sodax/sdk` is priority #1.** Build the SDK (Phases 1–6 in `../../plan.md`) now,
against the locked contract below. **The backend `/bridge/*` endpoints come later**
— they do not exist yet (verified: no bridge controller in `sodax-backend`, only
`apps/swaps-api/src/api/swaps`). The issue itself sequences backend after SDK.

Consequences (unchanged):

1. Build `BridgeApiService` to the locked contract (`04-decisions.md`), mirroring
   `SwapsApiService` verbatim.
2. Keep valibot response schemas **tolerant** (extra/optional fields don't break
   parse) so the eventual real backend still validates.
3. Ship `bridgeOptions.useBackendSubmitTx` **default-OFF** — the path is dormant
   until the backend is live AND the bridge re-relay assertion lands
   (`04-decisions.md` §12).

The SDK work is **not blocked** by the backend: the API path is dormant (flag OFF),
so Phases 1–6 proceed independently. The backend then implements to this same
contract.

## Files

- `04-decisions.md` — **the 13 locked decisions** (authoritative) + SDK-first order.
- `01-routes.md` — `/bridge/*` route table.
- `02-request-response-dtos.md` — request/response shapes (locked naming + relayData).
- `03-confirm-checklist.md` — the questions, now marked DECIDED with answers.

## Source of truth (real files mirrored)

`sodax-backend` (swaps reference):
- `apps/swaps-api/src/api/swaps/swaps.controller.ts`
- `apps/swaps-api/src/api/swaps/dto/{create-intent,submit-tx,submit-tx-status}.dto.ts`
- `apps/swaps-api/src/api/swaps/types/submit-swap-tx.ts` (status lifecycle)

`sodax-sdks` (bridge domain + swap reference):
- `packages/sdk/src/bridge/BridgeService.ts` (`createBridgeIntent`, `bridge()`, `CreateBridgeIntentParams`)
- `packages/sdk/src/swap/SwapService.ts` (`submitTx`, Bitcoin raw + `extras.bound.accessToken`)
- `packages/sdk/src/shared/services/spoke/BitcoinSpokeService.ts` (`deposit` raw — TRADING vs USER)
- `packages/sdk/src/shared/services/intentRelay/IntentRelayApiService.ts` (relay idempotency)
- `packages/types/src/backend/backendApiV2.ts` (`BitcoinBoundExtrasV2`, `SwapExtrasV2`)
</content>
