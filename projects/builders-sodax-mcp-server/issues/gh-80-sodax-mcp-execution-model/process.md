---
type: process
repo: builders-sodax-mcp-server
github: 80
updated: 2026-10-23
---

# Process

## 2026-10-23 — local draft review

The draft has 159 lines. D1–D6 each contain context, decision and consequences. README line 275 links the actual file.
The live issue requires a merge as well as the link; the local draft does not close #80 yet.

## Findings

### P2 — calldata containment does not prove source execution (ADR line 121)

A mined transaction can carry the quote's calldata while sending it to another contract or an EOA. A smart-wallet
bundle can include a failed operation while the outer transaction succeeds. Receipt existence and substring
matching do not establish successful execution of the intended SODAX call, contrary to the draft's guarantee.

The local backend `apps/swaps-api/src/api/swaps/swaps.service.ts:223–275` accepts the supplied intent and relay data,
deduplicates by `(txHash, srcChainKey)`, and does not verify the source receipt. An incorrectly paired hash reaches
the processing queue. A real bundle containing another intent can be associated with the wrong cached intent.

Require successful execution bound to the configured asset manager and cached intent/payload, preferably through
the expected emitted event. For wrapped calls, verify inner execution rather than outer receipt success or calldata
containment alone. Apply equivalent binding to cancellation confirmation. No full SDK is required for this change.

Primary reference for bundled operations: https://eips.ethereum.org/EIPS/eip-4337

### P2 — secret screening excludes valid chain addresses (ADR line 137)

Only transaction hashes and Bound tokens are exempt from key-shaped input screening. Full Sui addresses are
32-byte hex strings; NEAR implicit account IDs can be 64 hex characters. Implementing the stated rule rejects valid
address inputs on chains expressly included in D5.

The private epic plan already includes the missing exception in its decision 12 breakdown. Restore field- and
chain-aware exceptions for validated address fields, without exempting arbitrary strings globally.

Primary Sui format reference: https://docs.sui.io/references/sui-api

### P2 — qualify cache-loss detection and alert guarantees (ADR line 132)

After a restart, an in-memory-only cache cannot identify outstanding quotes or determine which transactions were
broadcast. It cannot proactively alert for each affected swap. A later `track` call can reveal a missing handle,
but cannot alone distinguish a lost quote from an invalid quote ID.

Keep phase 1 cache scope. State that resumed tracking with a missing quote and no backend record returns an explicit
unknown-quote state and may raise a deduplicated operator alert. Do not promise automatic detection when clients never
resume. Document which source-chain/hash information the operator needs for recovery.

## Non-blocking improvements

- D2 temporarily replaces the epic's locked gateway decision; label this explicitly as D3 does. Keep owner agreement
  as a review prerequisite rather than reverting the justified interim guard.
- Add primary references to the MCP comparison and a version/date or reproduction reference for dependency/advisory
  measurements. LI.FI's described flow is confirmed by https://docs.li.fi/mcp-server/overview. deBridge's current tools
  are documented at https://github.com/debridge-finance/debridge-mcp.
- Consider single-flight by source transaction during #85: the status-first sequence alone does not suppress
  concurrent requests. Backend deduplication preserves records but duplicates still consume submission budget.
  This is an implementation follow-up, not a separate blocker for the ADR.

## Validation and limits

Read live #79/#80 with GitHub CLI after the connector rejected its credentials. Read the draft, README diff, selected
source and private context sections. Verified README target, six decision structures and `git diff --check`.
No upstream implementation changed, no transaction sent, and no runtime suite run for this documentation-only review.
Backend source is a local snapshot; deployed enforcement configuration was not verified.
