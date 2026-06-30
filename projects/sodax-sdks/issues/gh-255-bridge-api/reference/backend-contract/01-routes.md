---
type: reference
repo: sodax-sdks
github: 255
status: Decided
updated: 2026-06-30
---

# 01 — Routes

> Decided (see `04-decisions.md`). SDK builds these now; backend implements later.

## Locked bridge routes

5 full-parity routes (#2) on the **shared swaps host** (#1, route `/bridge/*`,
no `constants.ts` change) + a tokens endpoint (#3).

| Verb + path | SDK method (`sodax.api.bridge.*`) | Request | Response |
| --- | --- | --- | --- |
| `POST /bridge/allowance/check` | `checkAllowance(body)` | `CreateBridgeIntentParamsV2` | `{ valid: boolean }` |
| `POST /bridge/approve` | `approve(body)` | `CreateBridgeIntentParamsV2` | `{ tx: RawTx }` |
| `POST /bridge/intents` | `createBridgeIntent(body)` | `CreateBridgeIntentParamsV2` | `{ tx: RawTx, relayData }` |
| `POST /bridge/submit-tx` | `submitTx(body)` | `BridgeSubmitTxRequestV2` | `{ success, data:{ status, message } }` |
| `GET  /bridge/submit-tx/status?txHash=&srcChainKey=` | `getSubmitTxStatus(query)` | query string | `{ success, data: {...} }` |
| `GET  /bridge/tokens` | `getTokens()` | — | `Record<chainKey, BridgeToken[]>` |
| `GET  /bridge/tokens/:chainKey` | `getTokensByChain(chainKey)` | path param | `BridgeToken[]` |

> The `submit-tx` + `submit-tx/status` pair is the stateful (persisted, polled)
> relay flow the SDK `useBackendSubmitTx` toggle uses — the swaps `intents/submit`
> synchronous variant is NOT mirrored.

## Dropped vs swaps (not in bridge)

`quote`, `deadline`, `intents/submit` (sync), `intents/status` (solver),
`intents/cancel` — bridge has no quote/slippage/solver/limit-order/cancel.

## Client-side, NOT backend

- **bridgeable-amount** — no swaps analog (swaps uses `quote`). Keep client-side
  (`useGetBridgeableAmount` + vault math). Confirm when wiring the tokens endpoint.

## Decided route-level points

- **Host (#1):** shared base, `/bridge/*`. `resolveBridgeApiConfig` =
  `resolveBaseApiConfig`.
- **`POST /bridge/intents`** keeps the plural `intents` path even though the
  response has no intent struct.
- **One body DTO (#6):** `allowance/check`, `approve`, `intents` all take
  `CreateBridgeIntentParamsV2`.
- **Throttle/idempotency (#12):** mirror swaps `submit-tx` (10 req/60s, HTTP 200,
  idempotent on `(txHash, srcChainKey)`).
</content>
