---
type: process
repo: sodax-backend
github:
updated: 2026-11-15
---

# Process

## Log

- 2026-11-15: Diagnosed the pasted prod logs, built the fixes, ran `/code-review` (15 findings),
  fixed the valid ones, reran everything green, stashed at the user's request (see `brief.md`).

## Findings

- First draft put address validators in DTOs; review showed allowance/check and approve share those DTOs
  and would start rejecting dstAddress placeholders. Moved to service-level checks on intent paths.
- First draft mapped the SDK receipt-wait timeout to 404 too; reverted: after the pre-check, a timeout
  means the hub RPC failed and should stay 502/ERROR.
- First draft skipped Bitcoin sources; Radfi TRADING mode interpolates srcAddress into
  `/wallets/details/${addr}`, so it is now validated.
- Removed per-chain format hints from the 400 text at the user's request (no help for spammers).
- Consumers checked: MCP server maps 404 and 502 alike to UPSTREAM_UNAVAILABLE; dapp-kit retries
  (`retryUnlessAuthFailure`, 3); sodax-sdks branches on no status for these routes. poc-swap-intent-sender
  and sodax-solver-qa-bot are not in the hub, unchecked.

## Changes During Work

- Test gotchas: submit-tx throttle bucket (own `x-real-ip` per test); pre-check mocks must queue
  `HUB_TX_PRECHECK_ATTEMPTS` rejections; `vitest --maxWorkers` breaks (minThreads conflict).
- 7 unit fixtures used fake addresses (`bc1qsrc`, EVM address on a BTC source); replaced with valid ones,
  test meaning unchanged.
