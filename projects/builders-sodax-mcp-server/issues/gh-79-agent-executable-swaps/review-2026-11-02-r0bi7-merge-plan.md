---
type: review
repo: builders-sodax-mcp-server
github: 79
status: Answered 2026-11-04 (comment 6624748212); fixes pushed, see plan-review-2026-11-02.md Progress
created: 2026-11-03
updated: 2026-11-04
tags: [merge-order, release, restack, cancel, ops]
---

# R0bi7's review of the merge plan (issue comment 6574665986, 2026-11-02)

Each point checked against the code at the tips listed in `brief.md` (2026-11-03, a full clone; the
hub clone is shallow). Simulation: squash #104 onto `development`, then merge each stack branch up.

| # | Point | Verdict | Evidence / what to do |
|---|---|---|---|
| 1 | Restack after #104 conflicts; taking the stack side drops the guards; no test imports `index.ts` | True | Conflicts: #91 `src/index.ts`, #93 `src/services/sodaxApi.ts` (#104's `pathParam` vs #93's cache refactor), #97 `analytics.test.ts`; merging dev+#104 straight into #102 conflicts in all three. Whole-file "ours" drops `asyncHandler`, `mcpGetNotAllowed`, the SSE lease, `jsonErrorHandler`, and brings back `transport.start()` because **no stack branch has #100 yet**. No test imports `index.ts` (`httpGuards.test.ts` tests the guards alone). Fix: merge `development` (#100) into #91 now; port the guards by hand at #91's sync (keep both `asyncHandler` and `runWithRequestContext`); add a route-level test in #104 (export an app factory, hit GET /mcp → 405, SSE cap → 429, bad JSON → JSON 400). |
| 2 | Squash + plain rebase replays #91's commits | True for rebase, moot | Since 2026-10-29 the stack syncs by merge only (brief). The 10-28 plan comment still said "rebase". Answer: merge commits, squash on merge. |
| 3 | Releases in between aren't no-ops | True | #91: relay base `xcall-relay.nw.iconblockchain.xyz` → `api.sodax.com/v1/relay`, `redirect: apiKey ? "error" : "follow"` in `http.ts`, key forwarding. #92: unknown `?profile=` → 400, `?profile=swap` with switch off → 400. #94 (`48b307b`): SSE message without its session's key → 403; partner fee query/header parsed → 400. All live with the switch off. |
| 4 | Keep `SODAX_SWAP_TOOLS_ENABLED`, default true | Valid | #102 `5e5e35a` removes it. Cheap to keep: default flips to true, rollback becomes config. |
| 5 | Before #102's release: RPC 1/137, gateway checks, real canary on the candidate commit | Valid | Keys are regex-only (`parseApiKey`), validity is BE/gateway's job (settled #5). `e2e-canary.yml` runs only on the default branch (`canary-e2e` env), so the real run (`dry_run` false) happens on `development` after #102 merges, before the master release. Our plan already wants an RPC override for every EVM source, broader than 1/137. |
| 6 | In-memory quote cache: redeploy before first track strands deposits | True | `quoteCache.ts` is a `Map`. After a restart, track with quoteId + chain → `withoutQuote` → `not_submitted_unknown_quote`, alert `unknown_quote` (Discord) only when a quoteId is named; the deposit needs an operator relay. Needs single replica, drain before deploy (idea: open-quote count in `/health`), `DISCORD_WEBHOOK_URL` in prod, an alert owner. |
| 7 | `cancel.ts:151` no-quote path doesn't bind the deposit payload to the intent | True | `isDepositsIntent` checks chain, a deposit from `intent.srcAddress` to `intent.creator`, and hub-wallet ownership; `holdsDeposit` ignores the transfer's `data`. A backend intent for another intent of the same wallet passes and `cancel` returns `ready` for it. Missing test: chain only, `hubIntent: { ...INTENT, intentId: "8" }` → expect `SWAP_MISMATCH`. Fix: compare the deposit's `data` with the intent (decode its `createIntent` call). |
| 8 | D5 scope | Valid, docs only | ADR on #90 already says EVM sources only. The epic body's D5 row still lists every family: edit the issue body. |
| 9 | Add #101: after #104, keep `id: release`, before #102 | Valid | #101 adds `id: release` on the release-please step #104 pins by SHA (same line). Also #101's new job uses `actions/checkout@v4` unpinned; pin it like #104. #101 vs #102 `server.json` test clash still stands. |

## Independent review of the fixes (2026-11-04)

A subagent reviewed `321e133`, `e9a5767`, `12d1374`, `4c59fdc` with the code only. Six findings, all fixed:
the batch-cap case passed without the cap (the MCP SDK refuses an all-initialize batch itself; now pings);
`/sse` and `/messages` guards were untested; `isEntryPoint` missed `node .`; a two-deposit tx passed the
no-quote cancel; the README deploy advice was false on a busy server; a crash didn't report lost quotes.
Kept on purpose: `/health.swapQuotes` is public (a live quote count; volume is public on chain anyway).
A hard drain (refuse new ready quotes on a signal) is offered to R0bi7 as a follow-up, not built.

