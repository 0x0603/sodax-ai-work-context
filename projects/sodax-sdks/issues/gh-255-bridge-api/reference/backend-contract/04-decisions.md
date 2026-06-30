---
type: reference
repo: sodax-sdks
github: 255
status: Decided
updated: 2026-06-30
tags: [bridge-api, decisions, sdk-first, backend-contract]
---

# 04 — Locked Decisions (13/13)

Authoritative decision log for the Bridge API contract. Decided 2026-06-30 via a
grounded Q&A (every answer traced against real swap/bridge source).

## Priority & order

1. **SDK is first.** Implement `@sodax/sdk` (+ types, dapp-kit, demo, skills —
   Phases 1–6 of `../../plan.md`) against this contract NOW.
2. **Backend is second.** `/bridge/*` does not exist yet; the backend implements to
   this same contract afterwards. `useBackendSubmitTx` ships **default-OFF** until
   the backend is live and §12's re-relay assertion lands.
3. **Schemas tolerant.** Build to the contract but accept extra/optional response
   fields, so the eventual backend still parses.

## The 13 decisions

| # | Topic | Decision | SDK impact | BE impact (later) |
|---|---|---|---|---|
| 1 | Host | **Shared base** — `/bridge/*` on the swaps host | `resolveBridgeApiConfig = resolveBaseApiConfig`; no `constants.ts` change | one `@Controller('bridge')` in the swaps app |
| 2 | Routes | **5 full-parity routes** | `BridgeApiService` 5 methods | `allowance/check`, `approve`, `intents`, `submit-tx`, `submit-tx/status` |
| 3 | Tokens | **BE exposes `/bridge/tokens`** (+`/tokens/:chainKey`) | add hook `useBridgeApiTokens` + method | `GET /bridge/tokens` |
| 4 | Param naming | **Swaps convention** (`inputToken/outputToken/inputAmount/srcAddress/dstAddress`) | `BridgeApiService` maps SDK `srcToken/dstToken/amount/recipient` → wire names | DTO uses swaps names |
| 5 | srcAddress | **Included** (folded into #4 — swaps body already has it) | — | — |
| 6 | Build DTO | **One shared DTO** for allowance/approve/intents | one request type | one `CreateBridgeIntentParamsDto` |
| 7 | submit-tx body | **Send full `relayData {address,payload}`, drop `intent`** | pass `created.relayData` (not `.payload`) | use `relayData.address` as relay envelope addr |
| 8 | createIntent resp | **`{ tx, relayData }`** (drop `intent`) | response schema | response DTO |
| 9 | submit-tx resp | **`{ success, data:{ status:'inserted'\|'duplicate', message } }`** | copy swaps | copy swaps |
| 10 | Status lifecycle | terminal = `executed && dstIntentTxHash` / `failed \|\| abandonedAt`; **drop `intent_hash`** | inline terminal check + tolerant schema | BE free to pick state set |
| 11 | Refund/cancel fields | **Drop `relayedForRefundAt` + `intentCancelled`**; keep `failureReason/abandonedAt/userMessage` | — | stuck bridge handled by `RecoveryService`, not status |
| 12 | Idempotency | **Yes, `(txHash, srcChainKey)`** + re-relay already safe | flag OFF until bridge e2e assertion | upsert dedupe → `duplicate` |
| 13 | Bitcoin source | **Support via Bound TRADING** (mirror swap `extras.bound.accessToken`); USER-mode → on-chain | SDK plumbing change (see below) | accept `bound.accessToken` in body |

## Details on the non-trivial ones

### §7 — relayData carries the relay address (NOT just payload)

Swap sends `intent` + `relayData.payload`; the backend rebuilds the relay envelope
`{ address: intent.creator, payload }` for split-tx chains. Bridge has no `intent`,
but its `relayData.address` (`= hubWallet`, `BridgeService.ts:495`) is the same
address. So bridge **drops `intent` but must send the full `relayData {address,
payload}`** — dropping the address would break split-tx-chain relay
(Stellar/Solana/Sui/Stacks…). `relay-swap-tx.ts:74-78` is where the backend uses it.

### §12 — two idempotency layers

- **DB row (BE):** copy swaps `findOneAndUpdate({txHash,srcChainKey}, {$setOnInsert},
  {upsert,new:false})` → duplicate-key ⇒ `'duplicate'`. `txHash` unique per deposit.
- **On-chain re-relay (the real gate):** the bridge fallback reuses the *same generic*
  `relayTxAndWaitPacket`. The relayer dedupes (`IntentRelayApiService.ts:195`:
  "already relayed → success") and `e2e-relay.test.ts` test 2 (generic, not
  swap-specific) already proves re-relay returns the existing `executed` packet. The
  swap-ONLY part (re-post intent) is exactly what bridge lacks/doesn't need. → bridge
  re-relay is safe by construction; ship flag OFF only until a **bridge-flavored
  assertion** is added to `e2e-relay.test.ts` (re-relay a real bridge deposit →
  existing `executed` packet).

### §13 — Bitcoin source via Bound TRADING (feasible, needs SDK plumbing)

`BitcoinSpokeService.deposit` raw has two branches:
- **TRADING (Bound):** `raw:true` → PSBT from the Bound/Radfi backend
  (`radfi.createWithdrawTransaction`), needs only **`accessToken`** — no wallet, no
  pubkey to build. ✅ works through the API.
- **USER (self-custody):** `raw:true` → **throws** ("Raw mode is not supported for
  normal Bitcoin deposits"). ❌ those users stay on on-chain `sodax.bridge`.

Bridge currently does NOT plumb the Bound token (its `coreParams` lacks
`accessToken`; `CreateBridgeIntentParams` has no `extras` slot; Bitcoin setup is
gated on `raw===false`). Swap does (`extras.bound.accessToken` + `srcPublicKey`).
The V2 mirror types already exist (`BitcoinBoundExtrasV2`, `SwapExtrasV2`).

**SDK change to support it (mirror swap):**
- `BridgeParams` → add 4th type-arg `E = BitcoinBoundExtras`; `CreateBridgeIntentParamsV2`
  → add `bound?` (+`srcPublicKey?`).
- `createBridgeIntent` → pass `accessToken: extras?.bound?.accessToken` (+`srcPublicKey`)
  into `coreParams`; lift `getEffectiveWalletAddress` to run for raw too.
- FE supplies the Bound `accessToken` (Radfi login) in the request + signs the PSBT
  via the 2-of-2 flow.

## Minor open (not blocking)

- **bridgeable-amount endpoint?** #3 exposed `/bridge/tokens`; a backend
  bridgeable-amount endpoint has **no swaps analog** (swaps uses `quote`). Recommend
  keeping bridgeable-amount **client-side** (`useGetBridgeableAmount` + vault math).
  Confirm when wiring the BE tokens endpoint.
</content>
