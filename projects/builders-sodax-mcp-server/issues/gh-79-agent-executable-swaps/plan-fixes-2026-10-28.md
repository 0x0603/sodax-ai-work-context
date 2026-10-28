---
type: plan
github: 79
repo: builders-sodax-mcp-server
status: Active
created: 2026-10-28
updated: 2026-10-28
related_issues: [81, 82, 83, 84, 85, 86, 87, 88, 89, 99]
tags: [mcp, swap, review, fixes, security]
---

# GH-79 fixes from the 2026-10-28 review

Findings: `review-2026-10-28-project.md` (IDs). Principle (user, 2026-10-28): the MCP does its own job (build and
verify unsigned txs, submit once after proving the deposit, report status); push the rest to its owner; no new
system inside the MCP.

## Done, uncommitted

### A. Stack fixes, at the tip (`feat/89-swap-docs` in the hub submodule)

31 files, +785/−197; 791 tests (749 before), checkTs, lint, build green; builder snapshot byte-identical; 21/21
contract tests keyless on canary, production 20/21 then green on rerun (an upstream 15 s timeout). Every new test
failed on the old code. To land: split per PR as fixup commits on each branch, then restack (`brief.md` §procedure).

| Item | Verdict, evidence | Change | PR |
|---|---|---|---|
| C2 | Confirmed: Arbitrum/Base/Optimism/Polygon share asset manager and `connection` (`@sodax/types` `spokeChainConfig`); viem JSON-RPC accounts use the wallet's chain, MetaMask refuses a mismatched `chainId` | `toStepTx(tx, chainId)` puts hex `chainId` in every swap and cancel step; quote nextStep names the chain and says to switch | quote.ts, swap.ts #94; cancel.ts #95; canary fixture #98; README #102 |
| C4 | Confirmed | With a cached quote, `resolveSource` takes chain id / `connection` / asset manager from the SDK config only (`namesChain`); new quotes keep the live check | #95 |
| C5/S3 | Confirmed | Per-key count until `expiresAt`; when full: expired first, then the oldest unclaimed past-deadline; live and claimed never dropped; otherwise `RATE_LIMITED` retry 60 s before building | #94 |
| C6 | Confirmed; BE refuses a new submit only when `deadline < now − 120 s` (`swaps.service.ts:229-257`, `utils.ts:118-123`); SDK `getSwapDeadline` has no skew, the 300 s is the MCP's `MAX_CLOCK_SKEW_SEC` | Early refusal alerts and returns `submit_refused` with `retryAfterSec` = to deadline + 15 s; refusals within 360 s of the deadline relay at once | #95 |
| C7/U2 | Confirmed; RLP `[token, from, to, amount, data]` (SDK `SpokeService.encodeTransfer`) | `other_sender` alerts (`other_sender_deposit`); someone else's deposit in the tx → `not_a_deposit`; `deposit_mismatch` alerts (`other_quote_deposit`, small budget) with a "deposit safe, don't resend" nextStep | #95 |
| C8 | Partly: BE returns only the 7 known statuses (`types/submit-swap-tx.ts:49-57`) | Unknown status polls only before the quote's deadline, then a non-polling `unknown` | #95 |
| C9/S9 | Confirmed | Compare a quote only when `depositTxHash === txHash`, else `QUOTE_MISMATCH`; without a quote: intent `srcChain` = this chain, receipt holds a transfer from `intent.srcAddress` to `intent.creator`, `creator` = `userHubWallet`; own reason text so its alert can't mute the quote comparison | #95 |
| S6 (stack) | Confirmed | `messageContext()` in `connection.ts`: a `/messages` POST on a keyed session without that key → 403 | #92 |
| U7 | Done | Sentence added only when both toolsets are on; no builder definition changed | #95 |
| U8 | Confirmed | `otherChains` matches exact symbols too; nextStep names both suggestions | #93 |
| U9 | Confirmed | `didYouMean` within 2 edits (#93); `fromChain` / track `chain` list only swap sources (`isSwapSource`, `evmSpokeFor`) (#95) | #93, #95 |
| U10 | Partly: schema errors come from McpServer before the handler (`mcp.js:125-178`), skipped | `field` on `INVALID_ADDRESS` (#97) and `INVALID_AMOUNT`; "no commas or units" (#94); numeric `amount` only without exponent and ≤ 15 significant digits (#97) | #94, #97 |
| U11 | Confirmed | Track/cancel descriptions drop "use the same API key"; `QUOTE_KEY_MISMATCH` says the connection's key changed, tell the user | #95 |
| Q4 | Confirmed | `getSwapTokens()` through the Swaps API `send`; `RATE_LIMITED` / `API_KEY_REQUIRED` pass through | #94 (swapsApi.ts arrives there) |
| Q9 | Done | drift-check "Swap contract tests" step, `SODAX_ENV: production`, `if: !cancelled()`, advisory on PRs, job timeout 5 → 10 min | #98 |

### B. Pre-existing hardening: committed and pushed 2026-10-28 as `fix/server-hardening` @ `efaa764` (5 commits on `fix/sse-start-once`; no PR or issue yet). Worktree `sodax/builders-sodax-mcp-server-hardening`, branch `fix/server-hardening` off `fix/sse-start-once`, no upstream)

11 files, +236/−73 plus 4 test files; 125 tests (90 before); checkTs, lint, build green; checked with curl on the
built server. Every new test failed on the old code. A separate PR on top of #100; needs a neutrally worded issue
(security, public repo: details via AuditMap only).

| Item | Verdict, evidence | Change |
|---|---|---|
| S1 | Confirmed (70 messages = 1 limiter hit). Batching exists only in protocol 2025-03-26, which the SDK still accepts and defaults to | `createMcpLimiter()` in new `httpGuards.ts`: each batch message counts; more than 10 → 400 `-32600` |
| S4 | Confirmed in 13 service functions; BE formats from `origin/main` controllers | `pathParam()` in `sodaxApi.ts`: `^[A-Za-z0-9._-]{1,128}$`, rejects `.`/`..`, `encodeURIComponent`; tools/list byte-identical |
| S6 | Confirmed | GET `/mcp` → 405 (`Allow: POST, DELETE`); `SseSessionLimiter`: 10 per IP, 200 total, 1 h idle, 429 over cap; also fixes a session leak on early disconnect |
| S8 | Confirmed | `refreshDocsTools()`: upstream at most once a minute, never clears the cache |
| S11 | Confirmed | HMAC-SHA256 with `POSTHOG_CLIENT_ID_SECRET` when set; unchanged when unset |
| S12 | Confirmed | `create-github-app-token` v1.12.0, `release-please-action` v4.4.1, `checkout` v4.4.0 pinned by SHA; `permissions: contents: read` on ci.yml and drift-check.yml |
| S13 | Confirmed (HTML stack traces with paths when `NODE_ENV` unset) | `jsonErrorHandler` last; `/mcp`, `/sse`, `/messages` wrapped in `asyncHandler` |

### C. Follow-up round (user's go-ahead, 2026-10-28), uncommitted

| Item | Change | Where / PR |
|---|---|---|
| S13 alert | `jsonErrorHandler` calls `notifyError` on a 500, at most once a minute (existing `DISCORD_WEBHOOK_URL`) | hardening worktree; 126 tests |
| Q9 | Contract step `continue-on-error: true` everywhere | stack, #98 |
| C6 | `markSubmitRefused`: after a refusal, track before the deadline answers `submit_refused` without resubmitting | stack, #95 |
| C3 | Our deposit in a tx with more than one asset-manager Message → `not_submitted` `multiple_deposits` + alert (checked budget), nothing claimed or submitted | stack, #95 |
| C1 | `source_not_found` tells the agent to track a sped-up or replaced tx's new hash with the same quoteId, and to quote again only if the wallet shows nothing was sent | stack, #95 |
| U6 (part) | `expiresInSec` on a ready quote | stack, #94 |

Stack tip: 792 tests, checkTs, lint, build green, builder snapshot unchanged; new tests caught a revert of C6, C3 and
`expiresInSec`. Decisions 1–6 above are settled by this round (4 and 5: keep as is).

## Research for groups 2–4 (read from source; intent-relay and solver-v2 not readable: submodules not initialised, 404)

| Item | Facts | Recommendation (owner) |
|---|---|---|
| Missed track | Relay acts only on submitted `{chain_id, tx_hash}` (hub card); BE has no spoke watcher; canceller refunds only hub intents. An unsubmitted deposit stays locked in the spoke asset manager: not filled, not lost; relaying it after the deadline creates the hub intent and the canceller refunds it (`track.ts` already does this) | Agent/user owns track; operators backstop via the monitor's missing-SN check and the admin relay. Nothing more in the MCP |
| C1 | No BE lookup finds an unrelayed deposit (status keyed by tx hash); frontend and SDK have no replaced-tx handling | Research: scan `connection` logs from a block stored at quote time. Simpler, per the principle: since the deposit is safe, reword `source_not_found` ("if the wallet sped up or replaced it, track the new hash with the same quoteId; otherwise nothing was sent") and let the wallet supply the hash. User decides |
| C3 | Rows keyed on (txHash, chain); BE and SDK take the first packet; `intent_hash` only from `posted_execution`; only smart-wallet batches produce two deposits | MCP: more than one deposit Message → `not_submitted` `multiple_deposits` + alert, "send each swap as its own transaction". BE follow-up: pick the packet whose payload matches the row |
| U3 | No hub intent → nothing to cancel; frontend has no cancel; an unsubmitted deposit isn't filled | MCP: no row + cached quote → read receipt: not mined → nothing to cancel; mined before deadline → "won't be swapped unless tracked; call cancel again after the deadline to refund; don't track"; after deadline → `relayForRefund`, return `refunding` |
| S5 | Swaps API has no oracle check; quote passes the solver's amount through; canary `/v1/intent/oracle` routes to the staging solver (wrong prices for mainnet swaps, 502 now: solver team) | MCP (verifying txs is its job; BE issue for all integrators): price the expected output with the cached oracle; refuse `PRICE_OFF_MARKET` (alerted) when worth < 90% of the input net of partner fee; unpriced keeps the warning; oracle always from production |
| U1 | Quote reads no source RPC; overrides exist; 13 EVM sources in SDK 2.2.0 (1, 10, 56, 137, 151, 295, 999, 1890, 4663, 8217, 8453, 42161, 43114) | Ops: a server-side Alchemy key (not the frontend's domain-locked one) for 8 chains, BE `RPC_CONFIG` endpoints or SDK defaults for the rest; Ethereum and Polygon first. MCP: `getBlockNumber` in the quote's existing `Promise.all` (no added latency), dead RPC → `CHAIN_UNAVAILABLE` before steps. Amends settled decision 11 |
| U4 | MCP tasks experimental in SDK 1.26.0 (in-memory store); client timeout 60 s | MCP: track waits in 5 s rounds while unchanged, no new rounds after 20 s, early return on change; skip `expired_unsubmitted`; nextStep "call again now" |
| U5 | `wallet_sendCalls` needs `{calls, chainId, from, version, atomicRequired}`; results are also sent twice (text + structured) | MCP: drop `calls` from `batch`, keep the envelope and `replaces`; nextStep says to build calls from the replaced steps. Optionally compact JSON |
| U6 | Quote returns only `quotedAmount`; protocol fee fixed 0.1% and already net (SDK `getSolverFee`); gas units only; no time or price impact upstream (frontend hard-codes ~30 s / ~3 min) | MCP: `protocolFee {bps: 10, amount, symbol, included: true}`, `expiresInSec`, `usdOut` (from S5). Time estimate: BE should add `estimatedSeconds` |
| S2 | Edge keys on `CF-Connecting-IP`/socket, write cap 120/60 s, jail 1500/10 s, never trusts XFF, nothing on `x-api-key`. **BE `submit-tx` allows 10/60 s per `X-Real-IP` (`HaproxyThrottlerGuard`): every MCP user shares 10 submits a minute**; the API-key guard runs first, so `keyId` is available | Edge (sodax-unified-api, Paul): the MCP egress IP gets its own table (higher cap, no jail), like the portal. BE (sodax-backend): `HaproxyThrottlerGuard.getTracker` keys on `apiKeyPrincipal.keyId` when present (~3 lines, also covers bridge). MCP: only S1. Keep `sodax_relay_submit_tx` keyless |
| S7 | One proxy hop (builders.sodax.com resolves to the host, not Cloudflare); infra scan shows 22/80/443 only; spoofed XFF didn't move the bucket live | Keep `trust proxy 1`. Deploy owner confirms Coolify has no port mapping and records expected ports. Optional: compose binds `127.0.0.1` |
| S12 env | `canary-e2e` doesn't exist (only `copilot`); README and `e2e-canary.yml` say it's branch-restricted | Admin creates it before any secret: selected branches = `development`, no tags, admin bypass off |
| Q2/Q12 | No profile name is public yet; #101 publishes `server.json` (header `choices`) on release; #101's `serverJson.test.ts` counts builder tools only and will fail against #102; its publish job uses unpinned `checkout@v4` with `id-token: write` | Rename `swap` → `actions` before #102 merges (bridge, money market join later; tool names keep the domain prefix). User decides |

## Decisions for the user

1. S13: a rejected async handler now returns 500 JSON + an error log instead of crashing with a Discord alert.
   Recommendation: keep it, and call the existing `notifyError` on 500s so the alert stays.
2. Q9: the contract step can go red on a slow Swaps API. Recommendation: advisory everywhere (`continue-on-error`).
3. C6: a track before the deadline after a refusal submits again (one of the 10/min). Recommendation: record the
   refusal on the quote.
4. C7: an `other_sender` deposit doesn't claim the quote, so a later correct deposit still submits. Recommendation: keep.
5. U10: `0.30000000000000001` parses to `0.3` and can't be detected. Recommendation: keep accepting numbers under the
   15-digit rule.
6. C1: reword and let the wallet supply the new hash (simple), or scan `connection` logs. Recommendation: reword.
7. Implement C3, U3, S5, U1 (probe), U4, U5, U6 as above? Each is small and MCP-only.
8. Q2/Q12: rename `swap` → `actions` now?
9. ~~Ask Paul and the BE about the shared-IP limits~~ Parked: the user asked R0bi7 (2026-10-28); revisit later.
10. Deploy: `POSTHOG_CLIENT_ID_SECRET`; RPC overrides; `canary-e2e` created by an admin.
