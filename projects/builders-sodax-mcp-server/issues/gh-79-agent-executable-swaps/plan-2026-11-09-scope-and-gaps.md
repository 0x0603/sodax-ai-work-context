---
type: plan
repo: builders-sodax-mcp-server
github: 79
status: Active
created: 2026-11-09
updated: 2026-11-09
tags: [plan, r0bi7, scope, ci, release, ops, rpc, api-key]
related_issues: [90, 91, 93, 95, 96, 97, 98, 102, 104, 107, 108, sodax-sdks-577]
---

# Scope and order for R0bi7's 2026-11-07 list, and what is left to finish the MCP (2026-11-09)

Re-evaluation of `review-2026-11-07-pre-r0bi7.md` (no code re-review; PR tips unchanged since 2026-11-05).

## Changes to the 11-07 checklist

1. Scope. R0bi7 asked for ~13 things; the checklist has ~45 boxes. Work only the tiers below.
2. No merge-up after each fix. Fix each PR on its own branch, then one bottom-up sweep #91 → #102 once #104 is
   squash-merged (the guard port needs it). #93–#98 fixes barely touch the port's conflict files.
3. CI never runs on #92–#98 or #102: `ci.yml` runs `pull_request` only into `development`/`master` [verified].
   So "rerun CI on the integrated heads" needs a trigger change; drop the `branches:` filter under `pull_request`
   in #104 (one line), then every stacked PR runs CI on push, including `mcp-publisher validate` for #102.
4. Misplaced item: `swapsApi.ts:296` `apiMessage` through `withoutUrls` belongs to #97, not #94. `withoutUrls`
   first exists in #97 (`logger.ts:22`) [verified by `git grep` on `feat/84` and `feat/87`].
5. Pre-release items depend on others and take calendar time: ask for them now, in parallel with the code.

## Tiers

Must (R0bi7 + blockers):

- #104: `docs_refresh` ok flag + text + test; batch 429 headers + `Retry-After` + test; global limiter answers
  `/mcp` in JSON-RPC shape; README lists `/mcp` error bodies; compat note via a `docs:` commit; `ci.yml` trigger;
  PR body (base, test count, HTML 404).
- #93: native sentinel + test.
- #95: post-claim errors (blocker); `callTool` moved down from #102 + `swapQuote.contract.test.ts:41`;
  `pollUntil` + stop clause in the retry advice; stranded-deposit alert budget; `alerted` = posted vs held.
- #96: NEAR fix + 2 tests + texts.
- #97: oracle keyless + test; unpriced-output warning + fix the wrong test; redaction (incl. `swapsApi.ts:296`)
  with a real viem error; the two false positives (Solana signature in non-tx-hash fields; unlisted 64-hex token
  → not found).
- #90: ADR decision-level fixes (D2 key format, D3 REST, D4 switch, D5 RPC env EVM-only), then body.
- #79 merge-plan comment; guard port + sweep; refused-SSE slot test; `checkTs` on every branch.

Should (cheap, same files): #95 `lastSubmitAt` throttle, lowercase `quoteId`, contract tsconfig in `checkTs`;
#94 all-uppercase partner address, Stellar 404 → `DESTINATION_NOT_READY`, missing trustline config → non-retry;
#96 refuse Stellar `C…`/`M…` and BTC testnet; #98 `minimumAmount ≥ 0.97×` floor, `if: always()` leak grep;
#102 RPC 295, alert-cap wording, "before merging", release-note gaps, 30-min refund window; PR bodies.

Deferred (answer if asked): SSE cap / idle reaper / SSE nits (#108 drops SSE); wiring tests (R0bi7 accepted the
route tests); `%2f` guard (the port encodes); `stalled` state; secret false negatives; #92/#94/#98/#102 nits;
#79 body; an SDK issue for `trustlineConfigs` (known gap in #94's body instead).

## Order

0. Now, no code: ask R0bi7/ops for the pre-release items and the `canary-e2e` environment.
1. #104 → R0bi7 re-review → squash → release master (#76; take #109 along) → hold. In parallel: fixes on
   #93–#98/#102 branches; ADR + #90 body.
2. After #104: merge `development` into #91 (port), sweep once to #102; `checkTs` + lint + test per branch.
3. Edit the #79 merge plan, reply to R0bi7 point by point.
4. #90 any time; #91 → #98; green canary E2E; #102; real canary through arrival; release; sdks #577.

## Left to finish the MCP, outside R0bi7's code list

Release blockers (owners outside this repo):

- `canary-e2e` environment (development only), secrets, wallet with ~20 USDC + gas on Arbitrum/Base (admin).
- Paid RPCs for EVM sources: 1/137/295 failed the 2026-11-03 probe; 13 EVM sources in SDK 2.2.0 (ops).
- Coolify: one replica, no rolling overlap (the quote cache is in memory), ~230 MB more RSS, `SODAX_ENV=canary`
  on staging, `DISCORD_WEBHOOK_URL`, `POSTHOG_CLIENT_ID_SECRET`.
- Named owners: alerts, manual relay, kill switch, RPC accounts.
- Backend intent canceller running in production (track's refund path depends on it; seen off on canary
  2026-10-20) [not verified].
- Drain: no drain mode; at least check `/health.swapQuotes` before merging to master; hard-drain undecided.
- Live with real funds, not run yet: cancel, EIP-5792 batch, native source, restart before the first track.

New facts to settle with R0bi7/BE:

- Shared `submit-tx` 10/min per IP is half solved [verified in code]: sodax-backend #1380 (merged 2026-11-02, on
  `main`) puts `OrgLimitAwareThrottlerGuard` on swaps `submit-tx` (`swaps.controller.ts:582-583`); it skips the
  per-IP throttle for a valid key whose org has `rateLimitPerMinute`. `ApiKeyGuard` attaches the principal only
  when its mode isn't `off` (`api-key.guard.ts:79`). So with `monitor` in production, keyed MCP users no longer
  share 10/min; made-up keys still do. Confirm the production mode. `improvement-ideas.md` #1 (MCP service key) is
  no longer needed. Still open: a key counted twice, write cap / jail on the MCP's IP (edge).
- Made-up keys still swap (format check only; backend not enforcing, a fake key got 200 on 11-07). R0bi7's
  "gateway check" will fail today, and per-key quote-cache caps mean little while keys can be minted.
  Recommendation: release anyway (the MCP never signs or holds funds; the risk is availability), say so up front.
- `builders.sodax.com` is not behind the edge yet (D2): it resolves to `46.224.215.235` directly, not Cloudflare
  like `api.sodax.com` [verified 2026-11-09]. No owner. Not a blocker while the server keeps its own limiter.

Gaps not on any list:

- Non-EVM RPCs can't be overridden (`SODAX_RPC_URL_<evmChainId>` only, `sodax.ts:48-54`; the README's env table
  says so from #96 on, but no checklist has it). Balance and
  recipient checks use SDK 2.2.0 public defaults from one server IP: `api.mainnet-beta.solana.com`,
  `free.rpc.fastnear.com`, `horizon.stellar.org`, `fullnode.mainnet.sui.io`, `api.mainnet.hiro.so`,
  `mempool.space` [verified in `@sodax/types` dist]. Rate limits under load are a judgement. Fix: let
  `parseRpcOverrides` take non-EVM chain keys (env only, settled decision 4). Before real traffic, not before release.
- No run with a real third-party wallet MCP yet (the live test used our viem signer). Run one on canary before
  release: `chainId` in `tx`, approve-then-swap order, `wallet_sendCalls` envelope.
- First MCP Registry publish (#101's job) runs with the #104 release: check the job and the listing.

After release: #108 (drop SSE); #107 (drift check red daily on `development` since 2026-10-30); pnpm 10
`minimumReleaseAge`; Tier 3 refactors, generic action template before phase 2; BE `estimatedSeconds` and minimum
output; hub card PR (`docs/builders-mcp-swap-sdk`) after #94; #79 body; sdks #577. PR #71 (0xrpj, conflicting since
2026-10-01) touches the stack's files (`index.ts`, `http.ts`, `sodaxApi.ts`, `logger.ts`): ask R0bi7 about it, don't
comment on it.
