---
type: brief
repo: builders-sodax-mcp-server
github: 125
status: In review 2026-11-20 — PR #137 open against development
next: watch CI and review on PR #137; Redis per environment must exist before REDIS_URL is set (README rollout)
updated: 2026-11-20
related_issues: [119, 124]
---

# GH-125 Redis quote store · brief

Branch `feat/125-redis-quote-store` off `origin/development` (97dc62f), worktree
`repos/client/builders-sodax-mcp-server-wt-125`. PR #137. Merged `development` (#133, #136) on 2026-11-20: one
conflict in `src/index.test.ts`, and a #133 test calling `openQuotes()` sync needed an `await`; 1360 tests green
with local Redis.

## Design (as built)

- `quoteStore.ts`: `QuoteStore` interface + `CachedQuote`. `memoryQuoteStore.ts` = old logic. `redisQuoteStore.ts` =
  Redis. `quoteCache.ts` = async facade the tools call; `useQuoteStore()` swaps the store at boot (`src/index.ts`,
  only with `REDIS_URL` and the swap tools on, module loaded by dynamic import).
- Facade mutations take the `CachedQuote` and update store + caller's copy. Both stores copy in/out (memory uses
  `structuredClone`), so the tool tests on memory exercise the same copy semantics as Redis.
- Progress records after an external step (submitted, relayed, hub outcome, refused, retry-at) never throw: a store
  failure is logged ("Couldn't record a swap's progress in the quote store") and the write is kept in process and
  replayed before that quote's next read (a relayed-for-refund deposit has no backend row: the quote is its only
  record). `refundExpired` re-reads the quote before relaying (narrows track-vs-cancel double relay).
- Redis replies LOADING/READONLY/MASTERDOWN/BUSY/TRYAGAIN count as unreachable; `/health` says `refused: true` for
  other reply errors. Stdio closes the store 30 s after stdin ends.
- Redis `ErrorReply` (script bug, OOM, WRONGTYPE) → `INTERNAL` (alerted, logged each time); connection/timeout →
  `UPSTREAM_UNAVAILABLE` (warn once a minute).
- Redis layout under `sodax-mcp:quotes:v1:<SODAX_ENV>:` (env in the prefix: a shared-by-mistake Redis can't feed a
  canary quote to production): hash `q:<id>` + sorted sets `all`, `pending`, `unclaimed`, `ended`,
  `hubRefund`, `open:<keyHash>`. Every read-then-write is one Lua script (EVAL): reserve (per-key cap, global cap,
  same eviction ranks as memory, insert), claim, set-if-present, submitted, hand over (puts back if dropped), tracked
  since, open, sweep.

## Changes from the paused plan (why)

- Client `@redis/client` 6.3.1 (node-redis core, 0 deps, 21 days old) instead of the `redis` meta package, which pulls
  json/bloom/search/time-series modules we don't use.
- Expiry follows the app clock, not PEXPIREAT: relative PEXPIRE + 1 h slack (only matters when no server sweeps). Robust to app/Redis clock skew, and
  the sweep can still log an expired-unused quote (#110 drop-off metric) before Redis drops the hash. Indexes get a
  25 h TTL refreshed on write, so nothing outlives a server that stopped using the Redis.
- Sweep kept in Redis mode (once a minute, always on); ZREM inside the script means one server logs each drop.
- Global cap + eviction ranks kept in Redis (parity; the shared suite tests them).
- Redis down: `disableOfflineQueue`, 2 s per-call timeout, `isReady` check → `UPSTREAM_UNAVAILABLE` (retryable). Boot
  doesn't wait for Redis. `/health` → `swapQuotes: { store, open, openUntil }` or `{ store: "redis", reachable: false }`.
- Heartbeat gauge and stop/crash alerts stay sync: memory counts live, Redis uses the last sweep's count; "lost" is 0
  with Redis.
- Rolling-deploy overlap (Coolify) is safe with Redis: shared state, atomic claims. Still one replica (in-flight
  dedupe, alert caps, rate limiter are per process).

## Tests

- `quoteCache.test.ts`: one suite over both stores (`describe.each`), plus Redis-only restart / two-server claim /
  TTL / unreachable. `swapTrack.test.ts` (last block, Redis only): track submit, refund and cancel across a restart; harness `redisServers` in `__fixtures__/redis.ts`.
- CI: Redis service `redis:8.2.10-alpine@sha256:cead8b06…` + `REDIS_TEST_URL`; the suite throws in CI without it.
- Local: `redis-server --port 6391`, `REDIS_TEST_URL=redis://127.0.0.1:6391 pnpm test` → 1340 green; without it
  1323 + 3 skipped (now 1344 with Redis).

## Review skips (deliberate)

- EVALSHA/defineScript, a LIMIT on the sweep: not worth it at ≤10k quotes.
- A RESERVE that times out may still store a quote (counts toward the cap until it expires): bounded, accepted.
- A failed progress write is lost if the process restarts before the replay: then a refund relay may repeat.
- `REDIS_URL` kept as the issue names it (not namespaced); stdio opens it only with the swap toolset.
- Heartbeat/shutdown `swap_quotes.open` is store-wide in Redis (= this server's with one replica).
