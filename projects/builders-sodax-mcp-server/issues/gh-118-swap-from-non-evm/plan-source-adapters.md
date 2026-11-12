---
type: plan
repo: builders-sodax-mcp-server
github: 118
status: Proposed — review complete, implementation not started
updated: 2026-11-12
related_issues: [115, 117]
---

# Source adapters and proof verification

## Final review

Reviewed #118 at `597db5b` above #117 at `8d00e27`. Recommendation: address
the two P2 proof-verification findings before merging #118. Local SDK builds from
a validated intent are an appropriate solution for non-EVM transactions whose
blockhash, sequence and fees prevent byte-for-byte rebuilding. Keep that design.

The present source verification is weaker than the EVM path:

1. Independent presence of an asset-manager marker and a payload does not prove
   that the executed deposit used that payload. A compiled Solana message calling
   only Noop is accepted by the local matcher when its data holds both markers.
   A false match can claim the quote before backend validation and prevent the
   real swap hash from using it later. Non-EVM cancel verification similarly
   needs an actual connection message rather than payload presence alone.
2. Non-EVM deposit count is hard-coded to zero or one. An Injective fixture with
   two deposits is accepted against the second quote, although the backend keys
   processing on the transaction and takes its first deposit.

These are local reproductions, not live exploit or fund-loss demonstrations.
The downstream relay still validates transactions. Reproduction details are in
`process.md`. All 1211 unit tests, type checks and lint passed on the reviewed
head; live contract tests and real swaps were not rerun.

The large SDK facade and private Sui transport access are maintenance risks,
not additional demonstrated runtime bugs. Do not make a complete module
reorganization a prerequisite for fixing the proof issues.

## Target boundary

Keep orchestration shared: quote ownership, intent validation, claim lifecycle,
deadlines, submission, retries and user-facing state transitions. Source adapters
own hash normalization, unsigned transaction builds, RPC reads and interpretation
of executed deposit/cancel evidence.

Use separate adapters for EVM spokes and Sonic: their shared receipt helpers do
not make their relay and intent-creation behavior identical. Add adapters for
NEAR, Stellar, Sui, Solana and Injective. Select an adapter once when resolving
the source, rather than spreading family switches through quote/track/cancel.

Start with plain objects/functions and a static registry, not inheritance or a
plugin framework. Keep shared types independent of SDK initialization and swap
orchestration so adapters do not create runtime import cycles.

Adapter operations: normalize hash, build deposit, build cancel, read and verify
deposit, read and verify cancel. Family-specific raw RPC objects stay internal;
the shared layer receives typed evidence/results, not arbitrary transaction bytes.
This refines the earlier interface sketch: do not expose untyped transactions
that an unrelated adapter could verify accidentally.

## Evidence and state contracts

- A deposit proof binds the executed contract/program, depositor, hub recipient,
  token, gross amount and payload commitment from the same operation. Verify
  fields against the cached quote, using each chain's canonical address encoding.
  Verify messages against the recipient and payload in the intent for cancels.
- Represent payload bytes and payload hash as distinct variants. Solana verifies
  the hash in the decoded deposit/message instruction or authoritative event;
  it must not search the whole serialized transaction for it.
- Count all relevant deposits in the transaction, not just matching deposits.
  Reject more than one before claiming the quote; do not silently pick one.
- Distinguish pending, not found, failed, confirmed and unavailable. Report pruned
  history only when the node proves it; otherwise absence remains ambiguous.
  Preserve NEAR's receipt semantics: a later callback failure does not imply the
  original deposit rolled back. For CPIs or other indirect calls, either establish
  executed evidence correctly or refuse the unrecognized shape without claiming.
- A proof result distinguishes match, wrong sender, mismatch, no deposit,
  multiple deposits and unsupported evidence. Do not turn unavailable evidence
  into successful verification or allow an unknown sender as a wildcard.
- Make post-verification actions explicit: submit, relay with optional required
  data, or await hub expiry/refund. Do not infer hub behavior from a missing
  connection field. Keep refund initiation distinct from observed completion.

## Implementation sequence

1. **Add regression cases first.** Preserve the Noop false-positive and Injective
   two-deposit reproductions as tests at the verification/claim boundary. Include
   markers or payload in an unrelated instruction, wrong sender/recipient,
   failed inner execution, and a cancel payload with no connection message.
2. **Replace heuristic verification for the five non-EVM families.** Decode
   executed deposits/messages into evidence, bind fields to the quote/intent,
   count deposits and reject ambiguous/unsupported shapes before claim or relay.
   Use the narrow adapter contract here; inspect the relay's actual per-family
   selection rules and cover their correspondence with fixtures. If a family
   cannot be verified, refuse it before offering a signable quote until fixed.
3. **Migrate orchestration incrementally.** Move source-specific operations behind
   the registry, preserving existing EVM byte-for-byte checks and Sonic event
   checks. Use separate commits for behavior fixes and mechanical extraction.
   Module paths are implementation choices, not the abstraction itself.
4. **Isolate SDK integration.** Reduce `sodax.ts` to SDK lifecycle and narrowly
   shared helpers. Keep build/read behavior in adapters. Put Sui private access
   in one guarded compatibility helper with an installed-SDK contract test;
   unexpected shapes fail explicitly. Replace with a public SDK API when one is
   available, without changing orchestration. A public SDK API is not assumed.
5. **Verify and document.** Run type checks, lint, unit tests and build; run the
   relevant read-only live contract tests for the touched adapters. For pruned
   transactions, retain real fixtures and use suitable archival reads when
   available. Document any remaining unsupported transaction forms. A real swap
   requires a funded test wallet and an explicitly authorized test scope.

Suggested delivery: one correctness commit group for steps 1–2, then an adapter
and module extraction group for steps 3–4, then validation/docs. Keep them within
the existing #118 branch unless the user chooses otherwise; do not create a PR
or change the SDK repository as part of this plan alone.

## Done when

- Both reproduced false matches are rejected before quote claim or submission;
  tracking the genuine swap afterwards remains possible.
- Cancel payload presence without an executed connection message is rejected.
- Every supported source has positive evidence fixtures and negative cases for
  sender, recipient, payload/commitment, execution failure and multiple deposits.
- EVM and Sonic behavior remains covered, including source RPC failures, expired
  quotes, backend lag, retries, refund handling and API-key ownership.
- Source-specific SDK/RPC details are behind adapters; the shared state machine
  does not inspect raw chain formats or private SDK fields.
- Validation results distinguish unit, fixture, live-read and real-swap coverage.
  Passing existing tests alone does not close the proof findings.
