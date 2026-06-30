---
type: reference
repo: sodax-sdks
github: 255
status: Decided
updated: 2026-06-30
---

# 02 — Request / Response DTOs

> Decided (see `04-decisions.md`). JSON-safety rule (as swaps): response values are
> pure JSON — bigint→decimal string, Date→ISO string; the one typed exception is the
> unsigned `tx` (`RawTxReturnType`).

---

## Request: `CreateBridgeIntentParamsV2` (build body — allowance/approve/intents)

**Decision #4: swaps naming convention** (not the SDK bridge field names). The SDK
`BridgeApiService` maps the SDK domain `CreateBridgeIntentParams`
(`srcToken/dstToken/amount/recipient`) → these wire names.

```ts
{
  srcChainKey: string;   // "0xa4b1.arbitrum"
  dstChainKey: string;
  inputToken:  string;   // ← SDK srcToken
  outputToken: string;   // ← SDK dstToken
  inputAmount: string;   // ← SDK amount (decimal string)
  srcAddress:  string;   // sender on source spoke (needed to build the unsigned tx)
  dstAddress:  string;   // ← SDK recipient (non-encoded)

  // Bitcoin TRADING source only (#13) — mirror SwapExtrasV2:
  srcPublicKey?: string;
  bound?: { accessToken?: string };   // BitcoinBoundExtrasV2
}
```

Dropped vs swaps `CreateIntentParamsDto`: `minOutputAmount`, `deadline`,
`allowPartialFill`, `solver`, `data` (no quote/slippage/solver).

---

## Response: build endpoints

```ts
// POST /bridge/allowance/check
interface BridgeAllowanceCheckResponseV2 { valid: boolean }

// POST /bridge/approve
interface BridgeApproveResponseV2 { tx: RawTxReturnType }

// POST /bridge/intents  (#8 — DROP intent vs swaps {tx, intent, relayData})
interface CreateBridgeIntentResponseV2 {
  tx: RawTxReturnType;
  relayData: RelayExtraDataResponseV2;   // { address: Hex; payload: Hex }
}
```

`RelayExtraDataResponseV2 = { address: Hex; payload: Hex }` — `address` is the hub
wallet (`= intent.creator` in swap terms). Both fields matter downstream (see below).

---

## Request: `BridgeSubmitTxRequestV2` (`POST /bridge/submit-tx`)

**Decision #7: drop `intent`, send the FULL `relayData` object** (not just payload).

```ts
{
  txHash:        string;   // signed+broadcast spoke deposit tx hash
  srcChainKey:   string;
  walletAddress: string;
  relayData: { address: Hex; payload: Hex };   // FULL object from createBridgeIntent
}
```

Why the full object: swap sends `intent` so the backend can rebuild the relay
envelope `{ address: intent.creator, payload }` for split-tx chains. Bridge has no
`intent`, but `relayData.address` (= hub wallet) is that same address. Dropping it
breaks split-tx-chain relay (Stellar/Solana/Sui/Stacks…). See `04-decisions.md` §7.

---

## Response: `submit-tx` (#9 — identical to swaps)

```ts
interface BridgeSubmitTxResponseV2 {
  success: boolean;
  data: { status: 'inserted' | 'duplicate'; message: string };
}
```

---

## Response: `GET /bridge/submit-tx/status` (#10, #11)

```ts
// BE free to choose its state set; SDK only keys on terminal. Bridge has no
// solver post-execution, so 'posting_execution' is expected absent.
type SubmitBridgeTxStatusV2 = 'pending' | 'relaying' | 'relayed' | 'executed' | 'failed';

interface BridgeSubmitTxStatusResultV2 {
  dstIntentTxHash: string;        // terminal-success marker
  packetData?: PacketDataV2;
  // NO intent_hash (#10 — no solver)
}

interface BridgeSubmitTxStatusDataV2 {
  txHash: string;
  srcChainKey: string;
  status: SubmitBridgeTxStatusV2;
  failedAtStep?: string;
  failureReason?: string;         // kept
  processingAttempts: number;
  abandonedAt?: string;           // kept (ISO)
  result?: BridgeSubmitTxStatusResultV2;
  userMessage?: string;           // kept
  // DROPPED (#11): relayedForRefundAt, intentCancelled — bridge has no
  // intent-expiry refund / cancel. Stuck bridge → RecoveryService.withdrawHubAsset.
}

interface BridgeSubmitTxStatusResponseV2 {
  success: boolean;
  data: BridgeSubmitTxStatusDataV2;
}
```

**SDK terminal logic (robust regardless of BE state set):**
- success = `status === 'executed' && result?.dstIntentTxHash` → `{ srcChainTxHash, dstChainTxHash: result.dstIntentTxHash }`
- failure = `status === 'failed' || abandonedAt`
- anything else → keep polling.

Schema stays **tolerant**: extra/unknown optional fields (e.g. a stray
`posting_execution`, or swaps' refund fields) don't break valibot parse.
</content>
