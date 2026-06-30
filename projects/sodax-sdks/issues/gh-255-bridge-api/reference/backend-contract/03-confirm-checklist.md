---
type: reference
repo: sodax-sdks
github: 255
status: Decided
updated: 2026-06-30
---

# 03 — Questions (all DECIDED 2026-06-30)

All 13 resolved. Authoritative log + impact in `04-decisions.md`. This file keeps the
original question framing with the answer inline, for traceability.

## Routes / host

- [x] **1. Host** → **Shared base** (`/bridge/*` on swaps host; no `constants.ts`).
- [x] **2. Routes** → **5 full-parity** routes (allowance/check, approve, intents,
  submit-tx, submit-tx/status) + tokens (#3).
- [x] **3. Tokens** → **BE exposes `/bridge/tokens`** (+`/tokens/:chainKey`); SDK adds
  `useBridgeApiTokens`. (bridgeable-amount stays client-side — minor open.)

## Request body

- [x] **4. Param naming** → **swaps convention** (`inputToken/outputToken/inputAmount/
  srcAddress/dstAddress`); SDK maps from `srcToken/dstToken/amount/recipient`.
- [x] **5. srcAddress** → included (swaps body already has it).
- [x] **6. Shared build DTO** → **one** `CreateBridgeIntentParamsV2` for all 3.
- [x] **7. submit-tx body** → drop `intent`, send **full `relayData {address,payload}`**
  (needed as the relay envelope address for split-tx chains).

## Response

- [x] **8. createIntent** → `{ tx, relayData }` (drop `intent`).
- [x] **9. submit-tx** → `{ success, data:{ status:'inserted'|'duplicate', message } }`.
- [x] **10. status lifecycle** → drop `posting_execution`/`intent_hash`; terminal =
  `executed && dstIntentTxHash` / `failed || abandonedAt`; SDK inline + tolerant schema.
- [x] **11. refund/cancel fields** → **drop** `relayedForRefundAt` + `intentCancelled`
  (no intent-expiry refund for bridge); stuck bridge → `RecoveryService.withdrawHubAsset`.

## Behavior

- [x] **12. idempotency** → yes, `(txHash, srcChainKey)` upsert. Re-relay layer already
  safe (shared `relayTxAndWaitPacket` + relayer dedupe + generic e2e test 2). Flag
  default-OFF until a bridge-flavored re-relay assertion lands.
- [x] **13. Bitcoin source** → **support via Bound TRADING** (mirror swap
  `extras.bound.accessToken`); USER self-custody → on-chain `sodax.bridge`.

---

## Bottom line

Contract is locked. **SDK first (Phases 1–6), backend after** — see README sequencing.
The SDK work is not blocked: backend path is dormant (flag OFF) until the endpoints
ship to this contract.
</content>
