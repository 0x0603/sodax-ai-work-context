---
type: process
repo: builders-sodax-mcp-server
github: 118
updated: 2026-11-12
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-11-12 — independent logic/design review of 597db5b

Reviewed only the non-EVM changes above #117's `8d00e27`. No source changes.
`pnpm checkTs`, `pnpm lint`, and all 1211 unit tests (47 files) passed.
Live contract tests and real swaps were not rerun.

Two P2 correctness findings, reproduced locally with an unsigned Solana message
and modified public Injective fixtures (no signing, broadcasting, or live RPC):

1. `track.ts:302-309` accepts independent presence of an asset-manager marker and
   payload as a deposit proof. `nonEvmSource.ts:77-86` searches whole serialized
   messages, without binding the bytes to the executed deposit instruction. A
   compiled Solana v0 message with only an SPL Noop instruction, containing the
   packaged asset-manager bytes and keccak of the fixture quote's relay payload
   in that instruction's data, returns `match` when passed through
   `solanaTxFrom({meta:{err:null},transaction:{message}})` and `checkQuoteDeposit`.
   The message has no asset-manager instruction. This is a local matcher repro,
   not a claim of live execution. A false match reaches `claimDeposit`, binding
   the quote to a wrong hash before backend validation; a later correct deposit
   then gets `quote_used`. Decode a successful deposit/message, binding contract,
   sender, destination and payload together. Cancel's non-EVM payload-only check
   (`cancel.ts:148-151`) has the same weak evidence, though the relay still
   validates before reaching the hub.
2. `track.ts:284-285` hard-codes every non-EVM transaction with an asset-manager
   marker to one deposit. Repro: duplicate the fixture Injective execute message,
   change the second intentId and its transfer.data to the SDK's rebuilt payload,
   parse with `injectiveTxFrom`, and check against the second quote. Result:
   `match`, not `multiple_deposits`. This contradicts the transaction-keyed backend
   constraint the EVM guard enforces: the backend takes the first deposit. Count
   decoded deposits and reject ambiguous transactions before claiming a quote.

Design assessment: local SDK builds from a validated intent are appropriate for
transactions whose sequence/blockhash prevents byte-for-byte rebuilding. Keep
that approach, but replace substring-based evidence with per-family decoding.
Sui's private SDK transport field and the monolithic sodax.ts adapter are
maintenance concerns, not independently reproduced runtime bugs.

## Findings

## Changes During Work

### 2026-11-12 — final feedback and proposed remediation plan

At the user's request, consolidated the final review and long-term adapter plan
in `plan-source-adapters.md`, linked from both the brief and original plan.
Correctness fixes precede broad extraction; adapter operations return verified
evidence instead of exposing arbitrary transaction bytes. Explicit execution,
sender, recipient and deposit-count checks are acceptance criteria. Sui private
access stays isolated until a public SDK API is available. Implementation has
not started; no new tests were run for this documentation-only change.
