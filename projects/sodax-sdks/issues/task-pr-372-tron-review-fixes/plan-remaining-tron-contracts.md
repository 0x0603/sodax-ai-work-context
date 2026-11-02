---
type: plan
repo: sodax-sdks
github:
status: Proposed
updated: 2026-11-02
---

# Remaining Tron API and settlement contracts

Design proposal requested by the user; no SDK implementation or public issue/PR update.
Current source is the uncommitted wt-534 diff on `665a215e`. Raw-specific types,
required decoded body, expiration extension and submit digest checks are now present;
this planning pass does not certify those edits or rerun their gates.

## Decisions

Treat rows 7, 10 and 11 as one domain-contract problem: submitting an authorization,
tracking a relay request and observing on-chain delivery are distinct operations.
Keep chain encoding (row 8) and payout admission (row 4) separate from relay transport.
Make changes in the owning types/spoke/API layers; avoid scattered Tron branches in features.

## Order and scope

1. Row 8: dispatch `encodeRecipient` on `getChainType`; TRON uses `tronRecipientBytes`,
   others retain `encodeAddress`. Identity/hub-wallet salt encoding stays separate.
   Adding another MPC-relay family must not silently apply Tron padding to it.
2. Row 4: turn the configured payout floor into a default admission check before
   signing/broadcast/hub burn, shared by feature and raw construction paths. Compare
   payout amount (not source input or unrelated quote amount) with the configured
   minimum using correct token decimals. Reject equality too. Preserve feature
   SodaxError/Result patterns. Do not add a force/skip bypass as part of this task.
   The current symbol-keyed constants are advisory policy, not a live fee quote;
   call the rejection below-configured-minimum, not proof of the actual current fee.
   A public fee preflight and a fee bound honored by the relay are a separate
   cross-repo contract if exact net-payout guarantees are required. A quote alone
   cannot prevent a fee change between checking and the irreversible burn.
3. Rows 7/10/11: define typed submission references and honest delivery outcomes,
   then propagate them through routing and feature results.
4. Add strict raw schemas to both wire clients and migrate their backend producers
   against the same contract. Client parsing support alone is not backend Tron support.
5. Reassess LY separately after the shared model and resume path are available.

## Submission and delivery types

A tracking id should not be named or placed in a transaction-hash field. A branded
string alias alone is insufficient because it remains assignable to string and cannot
be discriminated at runtime. Use a discriminated reference for signed submissions,
for example transaction `{ kind, chainKey, txHash }` versus withdraw authorization
`{ kind, chainKey, trackingId }`. Keep both JSON-safe.

Separate refs for a hub release include hub chain, hub tx hash, destination and log
index; the hub tx alone is ambiguous when it emits several releases. Re-notification
must recover/reuse the same reference; never generate another nonce or sign again.

Settlement outcomes hold the submission and actual transaction refs with chain keys.
There may be no source-chain transaction for an off-chain authorization. Do not put the
tracking id in `TxHashPair.srcChainTxHash` or relabel the hub burn as a Tron source tx.
Keep existing actual hash-pair behavior for established chain flows where it is true;
introduce the honest result for Tron deliberately and update every consumer together.
The unreleased Tron contract need not inherit Bitcoin's opaque-payload limitation.

## Submit, read, wait

- `submit`: confirm/locate the hub event as needed, notify the relay, return its stable
  reference after acceptance; never poll until release here. Bounded confirmation is
  compatible with non-blocking release; a full durable backend job is needed if the
  caller must return before confirmation and then close the app safely.
- `get`: one side-effect-free read. Do not notify from polling/status hooks.
- `wait`: poll the same read contract with timeout/cancellation. Explicitly retain
  bounded idempotent re-notification or durable backend retry: notify can precede the
  verifier's confirmation threshold and an accepted notify is not durable completion.
- Existing blocking `settle` composes these primitives. Feature services use the same
  entrypoint; do not maintain parallel feature-specific release orchestration.

Use the existing MpcRelaySettlement interface, not a speculative new plugin framework.
Avoid promising exactly-once processing; persist/reuse identity and make retries idempotent.
Current relay release records stay `submitted` even after payment, so success must read
`txs.release.hash`. Missing release or a client timeout is not a proven terminal failure.

## Packet API

Add an honest delivery result, e.g. an intent-relay arm with real PacketData and an
MPC-relay arm with the release reference/record and real payout tx. Common fields carry
only genuinely common state. `get` remains read-only; waiting/submission are explicit.

The old `getSolvedIntentPacket` remains packet-only: existing intent-relay behavior
is preserved; an unsupported MPC call returns a clear error directing the caller to
the delivery API. It must not manufacture `conn_sn=0`, empty payload/signatures/address.
For an intentional breaking rename, update SDK + HTTP DTOs/clients + dapp-kit/demo
consumers and docs in one migration instead of casting the new union back to PacketData.

## Raw type inference

Propagate operation-aware return types through SpokeService and IntentTxResult/feature
wrappers, preserving the chain key. Do not special-case Tron at every call site.
Use overloads based on `{ raw: true }` and the existing execute slot, with a generic
fallback for genuinely dynamic callers, so literals infer without `<true>`.
Allow a union when chain/mode/operation are actually unknown; do not cast it away.
Compile-test direct and routed APIs, feature raw flows, default signed mode, true/false
variables and dynamic chain keys. No consumer cast in the successful type examples.

## TRON wire schemas

Both swaps-api and bridge-api stay independent of the SDK/wallet providers; schemas
live in those wire packages, common DTOs in @sodax/types. Do not add valibot to types.
Validate the appropriate transaction vs withdraw-auth operation, required decoded body,
hex shapes, numeric expiry, decimal nonce/chain id and signing scheme. Keep serialization
JSON-safe and preserve necessary decoded contract fields. Hash/body consistency remains
an explicit signing-boundary check, not an unsafe schema cast.
Don't refactor all existing raw-schema duplication as a prerequisite for this task.

## LY findings

Do not remove its guard yet. The old stated blocker is partly obsolete because settle
can stop at the hub burn, but LY still has direct intent-relay waits in the vault
fallback and settleHubWalletMessage, uses backend submit for MPC deposits, and detailed
status routes a Tron withdraw tracking id as a deposit. Later hub exit/refund releases
also require durable notification/status/resume. Recipient origin already uses encodeRecipient.
Verify deployed position/vault exit behavior before claiming support; SDK code/comments
alone do not prove that every exit and refund emits the expected release.

## Verification required before implementation is called complete

- Payout tests: below/equal/above floor, token identity and decimal conversion, raw
  and signed paths, every actual payout entrypoint; no signature/broadcast on rejection.
- Encoding: known Tron bytes unchanged, other families unchanged, relay membership
  cannot choose recipient encoding.
- Types: literal raw inference, operation narrowing through features/router, tracking
  refs rejected where a tx hash is required, no new cast/suppression escape hatches.
- Settlement: hub reverted/not confirmed, missing/multiple release events, duplicate
  submit, early notify plus retry, reload/resume, timeout/cancel and release-hash success.
- Wire: fixtures round-trip both clients and backend; malformed payloads rejected.
- Packet compatibility and LY lifecycle tests are explicit, not invented success records.

Source anchors: SpokeService.ts:1339/1374/1462; SwapService.ts:2104;
shared/types/types.ts:24-33; shared/utils/shared-utils.ts:157/178;
types/chains/chains.ts:108-115; types/utils/utils.ts:230-248.
