---
type: issue
repo: sodax-backend
github:
status: Active
tags: [swaps-api, bridge-api, leverage-yield, error-handling, validation]
updated: 2026-11-15
related_decisions: []
---

# Malformed request 4xx

- Source: (no GitHub issue yet; one must exist before the PR)
- Started: 2026-11-15
- Related PR:

## Problem

Prod swaps-api logged ERROR (which pages) for requests carrying placeholder or wrong-format input
(tx hash `0xaaaa…`, token `0x1111…`, Hedera `0.0.456858`, non-base58 Solana addresses):

1. `POST submit-tx` without `intent` → 500 `Cannot read properties of undefined (reading 'deadline')`.
   `@ValidateNested()` passes on undefined.
2. Wrong-family or malformed src/dst addresses → SDK `INTENT_CREATION_FAILED` 422 at ERROR
   (Solana `Non-base58 character`, Hedera `0.0.x` on an EVM chain key).
3. `VALIDATION_FAILED` invariants (e.g. Hedera/Stellar inputToken) → 400 but logged at ERROR.
4. `GET intent/:txHash` and `/fill` with a hash not on the hub → SDK waits 180s for the receipt, then
   `WaitForTransactionReceiptTimeoutError` → 502 at ERROR. Holds a request slot for 3 minutes.

bridge-api shares (2) and (3); leverage-yield shares (1), (2) and (4).

## Acceptance Criteria

- Caller-input mistakes return 400/404 and log at WARN; real upstream faults still 5xx at ERROR.
- No false rejects for any valid address on any supported chain family.
- allowance/check and approve behavior unchanged.
- Garbage tx hashes answered in seconds, with tolerance for a slow or lagging hub RPC.

## Related

- Consumers (sodax-backend `DEPENDENCIES.md`): `/v1/swaps` → sodax-sdks, sodax-frontend (dapp-kit),
  poc-swap-intent-sender, sodax-solver-qa-bot; `/v1/leverage-yield`, `/v1/bridge` → sodax-sdks.
