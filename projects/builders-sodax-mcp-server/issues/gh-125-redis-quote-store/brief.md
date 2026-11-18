---
type: brief
repo: builders-sodax-mcp-server
github: 125
status: Paused 2026-11-18 at the user's call ("để sau"); no code yet, worktree removed
next: when resumed, branch feat/125-redis-quote-store off #124's branch (or development once #124 merges), follow the plan below
updated: 2026-11-18
related_issues: [119, 124]
---

# GH-125 Redis quote store · brief

## Plan (decisions)

- `quoteCache.ts` today is sync and callers mutate the returned object in place (`quote.handedOver = …`). The store
  becomes an async interface; every state change goes through a store method that persists it. Callers: index.ts,
  source.ts, track.ts, cancel.ts, quote.ts, sources/types.ts, tools/__fixtures__/swapBackend.ts.
- Memory implementation stays the default (stdio, local, tests). Redis when `REDIS_URL` is set; never a silent
  fallback to memory.
- Client: `redis` (node-redis, the Redis-maintained client), exact pin, a version ≥14 days old, no install scripts
  (supply-chain.md). Justified in the PR.
- Keys expire at the quote's `expiresAt` (PEXPIREAT); a handed-over quote extends to 24 h. `claimDeposit` atomic
  (one Lua script). Per-key open cap and `/health` `swapQuotes` read from Redis.
- Redis down: new quotes refused, track/cancel a retryable error.
- One store test suite runs against both; CI gets a pinned Redis service. README: `REDIS_URL`, Redis settings
  (pinned image, appendonly yes, noeviction, internal only), Operating, rollout/rollback.
- Out of scope: more than one replica.
