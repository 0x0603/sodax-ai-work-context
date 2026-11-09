---
type: review
repo: builders-sodax-mcp-server
github: 79
status: Open — findings only, nothing fixed yet
created: 2026-11-07
updated: 2026-11-07
tags: [review, r0bi7, near, alerts, oracle, secrets, guards, docs, checklist]
related_issues: [90, 91, 92, 93, 94, 95, 96, 97, 98, 102, 104, sodax-sdks-577]
---

# R0bi7's 2026-11-07 fix list + our pre-review · router and work checklist

R0bi7 rechecked the stack on 2026-11-07 (Discord) and listed fixes on #104, #93, #95, #96 (main blocker), #97, plus
#90's body, the merge plan, the guard port and pre-release confirmations. On the same day seven agents pre-reviewed
every PR so his next pass finds nothing new. All of his points are confirmed in code; we found 2 blockers and a set
of should-fix items he would likely catch. Nothing is fixed, committed or posted yet.

## Read this first

- His words, verbatim (11-07 message + the 11-01 reviews still open): `review-2026-11-07/r0bi7-feedback.md`.
- Tips reviewed (2026-11-05 sync, unchanged on 11-07): #90 `1dc6dfc`, #91 `31a3f68`, #92 `f5105bc`, #93 `cd3ea00`,
  #94 `520e484`, #95 `8d60529`, #96 `3b038e0`, #97 `35fd941`, #98 `2cee78b`, #102 `c665c75`, #104 `102e6d8`,
  sdks #577 `eb2affb9`. If a tip moved, re-check the lines the detail file cites before editing:
  `gh pr list -R gosodax/builders-sodax-mcp-server --json number,headRefOid`.
- Line numbers in the detail files are at each PR's own tip unless they say "#102".
- Local worktrees are stale: `builders-sodax-mcp-server-hardening` at `bc03e46` (origin `102e6d8`),
  `sodax-sdks-89-docs` at `50b9587c` (origin `eb2affb9`). Pull first.

## Detail files (open one, not the folder)

| Question | File | ~tok |
| -------- | ---- | ---: |
| R0bi7's exact words, 11-07 and 11-01 (#104, #91, #90, #577) | `review-2026-11-07/r0bi7-feedback.md` | 2.2k |
| #104: docs_refresh, batch 429 headers (prototype fix), 429 shape, SSE cap, weak route tests; how to port the guards up the stack, conflicts, risks | `review-2026-11-07/pr104-guard-port.md` | 2.3k |
| #90 stale body + ADR vs code; merge plan (#79 comment 6464424485) stale items; drafts of both texts; #91/#92 findings (path params, wiring tests, profiles) | `review-2026-11-07/pr90-91-92.md` | 3.3k |
| #93 native sentinel (fix + test); #94 Stellar recipient "service down", uppercase partner address, native-approve test | `review-2026-11-07/pr93-94.md` | 1.6k |
| #95 contract import, unbounded retry, alert budgets, BLOCKER post-deposit errors, weak tests | `review-2026-11-07/pr95.md` | 2.2k |
| #96 NEAR BLOCKER (code path, live account, fix code, tests), other chains, unreadable addresses | `review-2026-11-07/pr96.md` | 1.7k |
| #97 oracle key, unpriced output, redaction, secret false +/-; #98 canary floor, leak check, environment | `review-2026-11-07/pr97-98.md` | 2.1k |
| #102 docs/release-note fixes, pre-release gaps vs R0bi7's list; sdks #577 claims, conflict, #576 label | `review-2026-11-07/pr102-sdks577.md` | 1.9k |

## Blockers

1. #96 NEAR (`balance.ts:76-78`, still at #102): a missing native account returns token 0 without reading the
   token; NEP-141 balances live in the token contract. A failed token read also shows as 0. → `pr96.md`.
2. #95 post-deposit errors (`track.ts:178`, `:252`, still at #102): after the deposit is claimed, only
   `SWAP_REJECTED` is handled; 400/401/403 get quote-time advice ("larger amount", "new key"), no alert, no "don't
   send again" → user can deposit twice. → `pr95.md` finding 1.

## Work checklist (in merge order; each fix lands on the lowest PR that owns the code, then merges up)

Per sub-issue workflow (user): plan → implement → `/simplify` → `/code-review` → fix → explicit "commit push".
Sync by merge only, never rebase or force-push.

#104 (merges first)
- [ ] `docs_refresh`: return `ok`, say "Refresh failed; serving N cached", assert the text in the test.
- [ ] Batch 429: set `RateLimit-Remaining`/`Reset` after `countBatch`, `Retry-After` on its 429; test.
- [ ] Global limiter answers `/mcp` in JSON-RPC shape too; README lists `/mcp` error bodies; compat note that
      reaches the CHANGELOG (`docs:` commit or `BEGIN_COMMIT_OVERRIDE`).
- [ ] SSE cap: fix (/48, reap near cap, evict oldest idle) or answer why not.
- [ ] Route test for the idle reaper (`createHttpApp` idle option) and a non-default body limit.
- [ ] PR body: base, test count, HTML 404 claim.

#91 / #92 (after #104 merges: sync #91 with development and port the guards, `pr104-guard-port.md`)
- [ ] Port guards; keep `createHttpApp` + `isEntryPoint()`, `GET /mcp` before `app.all`, `resolveConnection`
      before `sseLimiter.open()`, `mcpLimiter` before the 403, `asyncHandler`; run `checkTs`, not only tests.
- [ ] Path params encoded on every tip (comes with the port) + `%2f`/`%5c` guard in `forwardedApiKey`.
- [ ] Wiring tests in `index.test.ts`: concurrent keys, `/messages` per-POST key, keyless, stdio; refused-SSE slot test.
- [ ] Nits: `redirect: "error"` message, repeated profile message, README `?profile=` on `GET /sse`, server.json
      profile header placement.

#93 / #94
- [ ] Sentinel: no cross-chain address match for `0x0{40}` / `0xeeee…`; test with a catalog missing `hyper`.
- [ ] Stellar recipient: 404 → `DESTINATION_NOT_READY`; missing trustline config → non-retry refusal.
- [ ] Partner address: drop the all-uppercase branch (or `getAddress`); test 400.
- [ ] Native approve skip: `isNativeToken` + assert no `/allowance/check`; `details.side` on side errors.
- [ ] ~~`swapsApi.ts:296` `apiMessage` through `withoutUrls`~~ moved to #97: `withoutUrls` first exists there.

#95
- [ ] Move `callTool` into `swapClient.ts` here (from #102); contract-only tsconfig in `checkTs`; fix
      `swapQuote.contract.test.ts:41`.
- [ ] BLOCKER: all non-retryable errors after the claim alert + deposit-is-safe wording; "must not send again" on
      every track/cancel code.
- [ ] Bounded retry: `pollUntil`, stop clause, final `stalled` + alert, `lastSubmitAt` throttle; CHAIN_UNAVAILABLE
      past `pollUntil` alerts.
- [ ] Alert budgets split (stranded / public / tool errors; tool errors from #102 too), held alerts with tx hashes
      in the hourly summary, `alerted` reflects posted vs held.
- [ ] Tests named stronger than they assert (`swapTrack.test.ts:673,679`, `alerts.test.ts:33`,
      `swapCancel.test.ts:285`); lowercase `quoteId`; PR body.

#96
- [ ] NEAR fix + two tests; rename `swapBalance.test.ts:133`; text updates in `balance.ts`, `swap.ts`, PR body.
- [ ] Stellar tokens missing from `trustlineConfigs`: non-retry error; Stellar `C…`/`M…` and BTC testnet refused
      at validation (balance and quote `toAddress`).

#97
- [ ] Oracle keyless (`runWithRequestContext({}, …)`), comment, test.
- [ ] Unpriced-output warning (+ optional `checks.market`), fix the test that asserts no warning, PR body.
- [ ] Redaction: `Request body:`/`metaMessages`, `file:` frames, `:\/\/`, `sodax_…`, `Bearer`, `swapsApi.ts:296` `apiMessage`; test with a real viem error.
- [ ] Secrets: per-token matching, wider prefixes, chain fields, Solana-signature hedge; pass/refuse table test.
      Scope 2026-11-09: only the false positives (R0bi7 said "false secret rejections").

#98
- [ ] `minimumAmount` floor (0.97×) before signing; `AMOUNT` cap; automated `if: always()` leak grep; drift step
      authoritative on `schedule`; drop the "keep the switch off" advice once #102 lands.

#102
- [ ] RPC 295 in README + `.env.example`; alert-cap wording; "before merging" not "before a deploy"; release note
      (key forwarding on builder calls, instruction changes, stale #100/#104/test count); nits 5-8.
- [ ] Retarget to development at merge time so CI (and `mcp-publisher validate`) runs.

Texts to post (drafts in `pr90-91-92.md`; user posts)
- [ ] Fix ADR items (REST Swaps API, kill switch, key format, RPC env EVM-only, etc.), then edit #90's body.
- [ ] Edit #79 comment 6464424485 with the new merge plan (add the pre-release gaps). #79's body is stale too.
- [ ] Reply to R0bi7 point by point once fixes are pushed; rerun CI on the integrated heads.

Pre-release (ask R0bi7 / ops; `pr102-sdks577.md` §Pre-release gaps)
- [ ] Named owners: alerts, manual relay, kill switch, paid RPCs.
- [ ] `SODAX_RPC_URL_1/137/295` in production; gateway check incl. builder tools with a fake/revoked key.
- [ ] One replica + Coolify deploy mode (no rolling overlap); drain step before merging to master; webhook channel.
- [ ] `canary-e2e` environment (development only) + secrets + funded wallet; real non-dry-run canary through arrival.

sodax-sdks
- [ ] #577 after release: resolve `packages/skills/AGENTS.md` (keep the new row, then main's row), rerun
      `check:ai`, doc nits (`:72`, `:106`, `:110`, `:126`); #576 needs `plan-approved` or `no-plan`.
- [ ] File an SDK issue: 22/66 Stellar tokens missing from `trustlineConfigs`; `getWalletBalance` throws on a missing
      trustline instead of 0n.
