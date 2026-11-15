---
type: plan
repo: sodax-backend
github:
updated: 2026-11-15
---

# Plan

## Goal

Turn malformed-input failures into fast 4xx at WARN without changing behavior for valid requests.

## Approach

- **submit-tx `intent`**: `@IsDefined() @IsObject() @ValidateNested()` on `SubmitTxDto.intent`
  (LeverageYieldSubmitTxDto inherits it) → pipe 400 before the service.
- **Addresses**: `packages/shared-dtos/src/validation/address-for-chain-key.ts` —
  `assertAddressesForChainKeys(...)` runs the SDK's `encodeAddress(chainKey, value)` and throws
  `BadRequestError` (→ 400 at WARN). Unknown chain keys are left to the SDK. Called after the existing
  Bound guards, before any solver/SDK call, on: swaps intents + limit-orders + quote with
  `includeTxData`; leverage deposit/withdraw intents + both quotes (withdraw also checks
  `recipient ?? srcAddress` on dstChainKey, since the SDK defaults to that); bridge intents.
- **Hub-tx pre-check** (`SwapsService.assertHubTxMined`): zero hash → 404 with no RPC; otherwise
  `getTransactionReceipt` with 2s timeout, up to 3 attempts 1s apart; only
  `TransactionReceiptNotFoundError` counts as missing → 404. Any other read error falls through to the SDK.
  Then only `No intent found` maps to 404 (`isIntentNotFoundError`).
- **Log level**: in both `error-mapper.ts` (swaps, bridge), SodaxError → 400 logs WARN, others ERROR.

## Trade-offs accepted

- A tx still unmined after the ~4s re-read window gets 404 where the SDK used to wait; clients retry.
- Receipt read twice on success (pre-check + SDK); avoiding it means re-implementing SDK log parsing.
- VALIDATION_FAILED at WARN could hide an SDK/config outage; mitigate with a 4xx-rate alert.
- Unthrottled GETs: HAProxy edge limits already cover them.
- Real-timer retry waits in e2e (~1–2s per test).

## Not done (belongs elsewhere)

- sodax-sdks: classify `encodeAddress` failures as VALIDATION_FAILED; expose a receipt timeout option.
- Hedera token-id (`0.0.x`) → long-zero address support: product decision for the team.

## Verification

Full unit + e2e for swaps-api and bridge-api; tsc; biome. Valid-address probes for every chain family
(EVM checksum/lowercase, ICON, Sui, Solana, Stellar G/C, NEAR named/implicit, Injective, Stacks incl.
contract principal, Bitcoin 1/3/bc1q/bc1p/uppercase/testnet) all pass the validator.
