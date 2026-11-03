---
type: plan
repo: sodax-sdks
github:
status: Proposed
updated: 2026-11-03
---

# Remaining Tron API and settlement contracts

Design proposal requested by the user; no SDK implementation or public issue/PR update.
Latest read-only check: wt-534 is clean at `fa8c419a` (raw commits `8814cb6a`,
`fa8c419a` on `665a215e`). This design pass does not rerun implementation gates.

## Decisions

Treat rows 7, 10 and 11 as one domain-contract problem: submitting an authorization,
tracking a relay request and observing on-chain delivery are distinct operations.
Keep chain encoding (row 8) and payout admission (row 4) separate from relay transport.
Make changes in the owning types/spoke/API layers; avoid scattered Tron branches in features.

## Order and scope — revised with the user, 2026-11-03

1. Row 8: dispatch encodeRecipient on getChainType; TRON uses tronRecipientBytes,
   others retain encodeAddress. Relay membership controls transport only.
2. Row 4: reject payouts at/below configured minimum by default, with no override.
   Validate before signing/broadcast/burn for raw and signed construction alike.
   Swap destination checks use minOutputAmount and destination decimals. Demo's
   SmallPayoutConfirm becomes a blocking minimum message; remove its onContinue path.
3. Investigate 1.4/1.4b in parallel with 1/2. Source-address encoding, historical
   intents and solver/backend automatic cancellation are release gates, not cleanup.
4. Rows 7/10/11 together: typed submission references, submit/get/wait and honest
   delivery outcomes. Migrate hooks/demo and resume/status consumers together.
5. Operation-specific raw types through SpokeService/features and strict TRON schemas
   in both wire clients. Keep explicit generics; inference/overloads are outside #534.
6. Implement the investigated refund fix and remaining verified old findings.
   No merge until any supported automatic-refund path is safe or disabled at its owner.

LY and cross-chain raw-inference improvements remain separate PRs.

The configured minimum is a conservative admission policy, not a live fee quote.
An exact net-payout guarantee requires a fee bound the relay honors across the burn;
a quote alone cannot close the race. A swap refund is a different payout: assess its
actual refundable input, after relevant fees and partial fills where applicable.
Checking destination minOutputAmount does not cover source-chain refund dust.
If the policy rejects equality, the UI must say the amount must be greater than the
floor, not merely that amounts below it are disallowed.

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
Use chain-conditional feature results: existing chains retain exactly TxHashPair,
Tron gets the new outcome. Propagate through dapp-kit hooks and demo. A genuinely
dynamic/union chain key must expose the corresponding union, without a cast.
Keep established actual hash-pair behavior and update every new-contract consumer together.
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

## Raw type scope

Propagate operation-aware return types through SpokeService and IntentTxResult/feature
wrappers while preserving the chain key. Keep explicit generic arguments, including
<true>, consistent with existing EVM/feature patterns. Do not add overloads or change
raw inference across all chains in #534. That is a separate cross-chain API task.
Compile-test direct and routed APIs, feature raw flows, signed mode and dynamic chain
keys. Successful consumer examples use explicit generics, without result casts.

## TRON wire schemas

Both swaps-api and bridge-api stay independent of the SDK/wallet providers; schemas
live in those wire packages, common DTOs in @sodax/types. Do not add valibot to types.
Validate the appropriate transaction vs withdraw-auth operation, required decoded body,
hex shapes, numeric expiry, decimal nonce/chain id and signing scheme. Keep serialization
JSON-safe and preserve necessary decoded contract fields. Hash/body consistency remains
an explicit signing-boundary check, not an unsafe schema cast.
Don't refactor all existing raw-schema duplication as a prerequisite for this task.

## Refund investigation and old findings — source checked 2026-11-03

- New SDK intents already use encodeRecipient for srcAddress (EvmSolverService:128),
  and LY origin uses it too. Distinguish prevention for new intents, consumer
  compatibility and remediation of existing on-chain intents carrying old 20 bytes.
  Editing the SDK cannot rewrite those historical signed/persisted intent structs.
- SDK reverseEncodeAddress accepts both old 20-byte identity and padded recipient
  (shared-utils:292-299); this does not prove all solver/backend readers do.
- Backend automatic cancellation is independent of the SDK guard. It reconstructs
  persisted srcAddress exactly, cancels on hub, then submits relay transport
  (backend apps/task-executor/src/tasks/intent-canceller/intent-canceller.service.ts:
  141/153/238-256). Solver source is not locally initialized, so its consumers remain
  unverified. Investigate payload/event-to-release notification and fees as well as bytes.
  Verified additional blocker: its submitRelay (:179-195) posts only to the intent relay;
  no MPC notify branch. New padded recipients therefore still need backend auto-cancel
  delivery routing. Do not rewrite legacy persisted srcAddress before cancellation: those
  bytes belong to the already-created intent, and changing storage does not change it on chain.
- Bridge getDetailedStatus already reads MPC deposits and hub releases
  (BridgeService:1337/1373). Reclassify old missing-MPC-status finding as implemented,
  needing regression tests, not a missing implementation.
- DEX Asset deposit/withdraw already delegate MPC sources to spoke.settle
  (AssetService:502/547/594), and drive MPC destinations. Remaining consolidation
  into submit/get/wait is architectural follow-through, not the old wrong-relay bug.
  ConcentratedLiquidityService explicitly refuses MPC sources; keep that restriction
  distinct from currently supported Asset flows.
- SDK cancel still refuses MPC source (SwapService:1810). Enable only after identity,
  refund release, status and resume contracts are verified; the guard alone does not
  stop backend/solver automatic cancellations.
- 4.5 means re-notification continues after relay progress, not missing retries.
  Stopping early is a correctness change; do it only with proof of durable acceptance
  for every verifier/quorum stage. Otherwise retain idempotent retry and defer the
  optimization. Current loops are TronSpokeService:370 and :588.

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
