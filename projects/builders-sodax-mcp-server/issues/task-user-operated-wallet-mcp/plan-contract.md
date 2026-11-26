---
type: plan
repo: builders-sodax-mcp-server
status: Proposed protocol, not implemented
updated: 2026-11-26
tags: [mcp, wallet, signing, protocol, idempotency]
---

# Tool and execution contract

## Tools

| Host | Proposed tool | Input | Output |
| --- | --- | --- | --- |
| Wallet | `sodax_wallet_get_accounts` | Optional chain filter | Account aliases, public addresses, capability/policy mode |
| Wallet | `sodax_wallet_sign_transaction` | Account alias, opaque prepared request, step ID, bounded finalization hints | Signed artifact, approval-required, signing-pending or refusal |
| Wallet | `sodax_wallet_get_operation` | Operation ID | Durable signing status and same result on retry |
| SODAX | `sodax_transaction_broadcast` | Request ID, step ID, signing result | Source tx identity and broadcast/confirmation state |
| SODAX | `sodax_transaction_get_status` | Request ID and step ID | Source state and follow-up tracking instruction |

Existing `sodax_swap_submit_and_track` and `sodax_bridge_submit_and_track` continue accepting their existing quote/bridge IDs and source deposit tx hashes. Broadcasting and backend/relay submission remain distinct.

## Prepared request

Agent transports an opaque signed envelope to avoid rewriting binary payloads. Choose a versioned canonical encoding and asymmetric attestation with an allowlisted algorithm/key ID. Wallet pins issuer verification keys/configuration; request-provided key URLs are untrusted. An attestation key authenticates request origin and is not a wallet signer.

Envelope fields:

- `version`, `issuer`, `requestId`, `issuedAt`, `expiresAt`.
- `operation`: swap, bridge or cancel; `operationRef`: quote ID or bridge ID.
- Canonical network namespace/reference plus existing SODAX chain key; exact signer address.
- Steps: stable `stepId`, kind, prerequisite step IDs, typed payload, immutable template digest, allowed finalization fields/ranges.
- Constraints: input/output token identities, base-unit amounts, minimum output, recipient, destination chain, fee currency/cap, spender/approval bounds and operation-specific limits.
- Display summary derived from decoded data, informational only.

Implement explicit payload schemas: EVM transaction JSON, serialized Solana transaction, Stellar XDR, Sui BCS bytes, NEAR Borsh bytes, Tron transaction object and TON wallet-transfer template. Do not retain unrestricted `unknown` as the signing contract. Network identifiers and SDK/raw-object mappings require reconciliation with existing SODAX types before implementation.

Wallet validates attestation/schema/expiry, then independently decodes the actual operation and compares it against constraints and local policy. Authentic SODAX origin is not spending authorization. Reject wrong signer/network, unknown formats, extra calls, changed destination, excessive approvals or uninterpretable operations in autonomous mode. Validate contract/relay arguments, not only the human-readable summary.

SODAX stores the operation durably bound to the preparing authenticated API-key principal. Request ID is not authorization. The envelope contains no API/provider secret. Broadcast lookup checks that same principal. Wallet aliases map through owner-controlled configuration, not an agent-supplied provider wallet ID. Never accept arbitrary RPC URLs, key URLs or provider credentials as tool arguments.

## Finalization

EVM prepare may lack nonce/fee/gas. Wallet may fill only explicitly permitted fields, within the envelope's caps; all business fields are immutable. Use trusted configured RPCs and serialize pending nonce allocation per account/network. For v1, do not alter non-EVM transaction bytes; expired blockhash/sequence requires a new prepare/approval.

Compute the finalized signing digest before human approval/policy authorization. Sign exactly that digest through Privy sign-only and assemble a chain-specific result. Any later change requires reauthorization. SODAX independently decodes the signed result, validates its cryptographic signature/signer, checks allowed finalization fields and compares all immutable fields to its prepared record. Never trust a wallet-reported hash or summary alone.

One step at a time: sign → broadcast → required source confirmation → next step. Both wallet and SODAX independently verify prerequisites. An agent-provided confirmed flag is not proof. No silent fee bump or replacement in v1.

## Signing result example

```json
{
  "version": 1,
  "status": "signed",
  "operationId": "wallet-operation-id",
  "requestId": "prepared-request-id",
  "stepId": "deposit",
  "signerAddress": "public-address",
  "templateDigest": "immutable-template-digest",
  "finalizedDigest": "exact-chain-signing-digest",
  "artifact": {
    "format": "stellar-signed-envelope-xdr-base64",
    "data": "signed-XDR"
  }
}
```

All fields above are illustrative. Format is a discriminated union, not a claim every family returns the same string:

| Family | Artifact |
| --- | --- |
| EVM | Serialized signed transaction hex |
| Solana | Signed transaction base64 |
| Stellar | Signed envelope XDR base64 |
| Sui | Transaction bytes plus serialized signature array |
| NEAR | SignedTransaction Borsh base64 |
| Tron | Explicit verified signed-transaction schema after provider/node integration test |
| TON | Signed external message BoC plus identity metadata needed for reconciliation |

Non-success results include approval-required, signing-pending, rejected, expired, unsupported-chain, payload-mismatch and provider-unavailable. Return structured bounded next actions. Approval occurs outside model control; status queries cannot authorize spending. A provider that broadcasts implicitly is incompatible with this sign-only contract.

## Durable retry protocol

Wallet operation key binds owner/account + issuer/request + step + exact finalized digest. Different content under the same request/step is rejected. Atomic locking ensures concurrent retries share the same operation and spending reservation. Save provider request identity before calling it. Use provider idempotency/retrieval only after verifying actual API support. An ambiguous signing response stays signing-pending for reconciliation; do not launch an independent signing operation.

SODAX commits validated signed artifact and chain-specific tx identity before RPC broadcast. Retry returns/reconciles that record, or rebroadcasts identical bytes where appropriate; never builds a new deposit automatically. Store request/step → finalized artifact binding atomically. If state was lost, stop for recovery instead of treating a missing RAM entry as permission to repeat.

States: prepared → approval-required/authorized → signing-pending/signed → broadcast-pending → source-confirmed → tracking → terminal. Provider and RPC timeouts are uncertain states, not proof of failure. Persist enough to resume after restart. A source identity must be computed correctly for each chain; TON message hash/seqno are not a finalized chain tx hash. Do not claim exactly-once chain execution from an application lock.

Effective validity is the minimum of operation deadline, transaction validity and authorization expiry. Check before sign and first broadcast. If expired before sending, prepare anew only after resolving any already-signed artifact. Once broadcast may have occurred, query chain state and continue tracking/refund handling, not a fresh deposit. Retain spending reservations until consumption or proven invalidity/expiry.

If approval succeeds but deposit does not, report both states and recheck allowance before retry. A NEAR transaction can retain a successful deposit receipt despite later receipt failure; preserve existing evidence logic. Source confirmation is not destination delivery. Stop after bounded retries with stable operation IDs for later resumption.

## Verification

Test altered requests before signing, altered signed results before broadcast, wrong owner/network, forged issuer, expiry, approval order, concurrent budget/nonce allocation, provider timeout and restart, RPC acknowledgement loss, identical-byte retry and destination confirmation. Require local-chain EVM coverage before any explicitly authorized small-value provider canary transaction.
