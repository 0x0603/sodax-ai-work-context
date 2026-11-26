---
type: process
repo: builders-sodax-mcp-server
github: 147
status: Both findings fixed (uncommitted)
updated: 2026-11-26
tags: [bridge, swap, expiry, cache, abuse, review]
source_commit: a78690e plus uncommitted changes
---

# Five-minute preparation window and pinning review

The user requested an assessment of the uncommitted five-minute sign-by, pressure-driven eviction and
track/cancel pinning policy. Review only; product changes were neither modified nor committed.

## P2: invalid track requests pin records for the full retention period

`bridge/track.ts:87` calls `markTracked` before `sourceTxHash` validates the hash and before the chain
is read. `swap/source.ts:106` similarly pins during source resolution. Correct key ownership is checked,
but a track request is not evidence of a transaction being broadcast. Pinned records fail `releasable`.

Reproduction through the actual MCP tool harness, all chain/API calls mocked: create 100 bridge records
under one synthetic client identity; submit malformed hashes naming each build; every result is
`INVALID_TX_HASH` and no deposit is claimed. Advance the clock six minutes. `checkBridgeRoom` still
throws the client-limit error. This contradicts the claimed maximum five-minute resource hold; bridge
records may remain until prepare+35 minutes, swap records until deadline+30 minutes. Valid but nonexistent
hashes have the same evidentiary problem. The bridge retry delay is clipped to five minutes, which does
not promise capacity will actually be available by then.

At minimum validate input before setting a pin. For abuse resistance, distinguish a short unverified
tracking lease from retention justified by a matching pending/mined transaction; alternatively explicitly
accept full-TTL reservations and do not claim five-minute worst-case recovery. A malformed request or
arbitrary hash must not be treated as proof of a sent deposit.

## P2: global swap eviction ignores tracking pins after the intent deadline

`swap/quoteCache.ts:127-132` still uses the older `evictionRank` loop before the new sign-by eviction.
An unclaimed quote ranks zero even if `trackedAt` is set. At global cache capacity it is evicted once
its intent deadline passes, before `expiresAt` (deadline+30 minutes). This contradicts the new promise
that tracking pins it throughout retention. A pending deposit that mines after the deadline can still
need its quote to start a refund or operator recovery.

Reproduction: fill 10,000 quote records with a 15-minute deadline, mark the oldest one tracked, advance
to minute 16, then insert a quote with a later deadline under another key. The tracked quote disappears,
although its retention expiry is minute 45. Apply a consistent eviction policy in both global branches,
preserving records still needed for pending deposits/refunds rather than consulting signBy alone.

## Scope of the improvement

A five-minute agent-visible execution window separate from a swap's on-chain deadline is reasonable.
Pressure-driven reclamation improves idle-record turnover. The 100-client cap is an occupancy limit,
not a quota of 100 RPC/build calls per five minutes; failed prepares and read-only previews can still
consume RPC resources without retaining a build. Real key verification, per-tool cost budgets and active
work concurrency limits remain separate concerns. Shared-egress/NAT users still share the IP cap.

## Validation

- Existing bridge store, swap quote cache and bridge track tests: 3 files / 55 tests passed.
- Two temporary regression tests failed with the exact behaviors above; 50 copied harness cases skipped.
- Temporary tests were removed after the run; `git diff --check` passed.
- No load test, production relay submit, signing, broadcast, product fix or public security issue/comment.

## Resolution (2026-11-26, uncommitted on `a78690e`)

- The permanent pin became a 5' hold (`heldUntil`, `holdForTrack`), set only after `sourceTxHash` accepts the
  hash: in bridge `follow`, swap `trackSwap` and `cancelSwap` (no longer in `resolveSource`). Each poll renews it;
  only a claimed deposit keeps a record for good. A call buys no more hold than a prepare does.
- `evictionRank` ranks an unclaimed quote 0 only when `releasable` (unheld, past sign-by), so the global branch
  follows the same rule as the per-key/per-client ones.
- Tests: malformed hash holds nothing (bridge and swap track), a hold ends after 5', a held past-deadline quote
  survives a full cache until its hold ends. Mutations caught: hold before the hash check (bridge 1, swap 2
  failures), global eviction ignoring the hold (1), holds never ending (4). 3304 tests green.
- Not changed: RPC cost per IP is bounded by the existing `/mcp` limiter (60 messages/min/IP); there is no global
  cap on concurrent upstream work.
