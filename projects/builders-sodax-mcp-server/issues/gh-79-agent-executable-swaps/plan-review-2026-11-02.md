---
type: plan
repo: builders-sodax-mcp-server
github: 79
status: Active — D-a..D-d accepted 2026-11-04; steps 0, 1, 2, 5, 7 done except 7.2 (see Progress); rest waits on merges
created: 2026-11-03
updated: 2026-11-04
tags: [merge-order, release, restack, cancel, ops, route-test]
related_files: [review-2026-11-02-r0bi7-merge-plan.md]
---

# Plan: handle R0bi7's merge-plan review (2026-11-02)

Findings per point: `review-2026-11-02-r0bi7-merge-plan.md`. This file is the work: decisions, order,
per-step changes and checks, owners, and the reply draft. Tips as of 2026-11-03: #104 `538aa29`,
#91…#98 as in `brief.md`, #102 `02ede6c`, #101 `70e6779` (fork `hazy2go`, maintainer can push).

## Progress (2026-11-04)

| Step | State |
|---|---|
| 1 | Done: #104 `321e133` + `bc03e46` (`createHttpApp`, entry check via `createRequire().resolve(argv[1])` so `node .` works, `src/index.test.ts` 10 cases; every guard on every route mutation-checked; SSE responses must be held or GC frees the session). CI green |
| 2 | Done: #95 `e9a5767` + `47e0cf3` (`createIntentPayload` + `checkDeposit` match; two-deposit tx refused; `rebuildSwapTx` reuses it). Merged up to #102 |
| 5 | Done: #79 body D5 row edited |
| 7.1 | Done: #102 `12d1374` (switch back via revert of 5e5e35a, default true, 5e5e35a's boot order kept, wording "turned off") |
| 7.3, 7.4 | Done: #102 `4c59fdc` + `676ffeb` (`openQuotes()` → `/health.swapQuotes`, stop message and crash alert count, README "Operating the swap tools", honest about a busy server) |
| 7.5 | Done: #102 title/body (release note, pre-release checklist); #104 and #95 bodies got update notes |
| 0 | Done: reply on #79 (comment 6624748212) after an independent review of the 4 commits (6 findings, all fixed) |
| 7.2 | Waits on #101 merging: merge the two server.json tests on #102 |
| 3, 4, 6, 8–10 | Wait on R0bi7 merging #104 / #101 |

## Decisions

| id | Question | Recommendation | Why |
|---|---|---|---|
| D-a | Point 3: hold master until #102, or release-note each PR? | Hold master after the #100/#104/#101 release until #102, then one release with a "Behavior changes" note | Fewest releases with half the stack. The note still lists what #91–#98 change for builder users |
| D-b | Point 4: keep `SODAX_SWAP_TOOLS_ENABLED`? | Keep, default `true`; `false` serves no swap tools | Rollback without a redeploy; 5e5e35a's other gains stay |
| D-c | Point 1: where does the route test live? | In #104, with a small seam in `index.ts` (no code moved) | Guards are tested before the restack; moving routes to a new file would make every route-touching stack PR conflict |
| D-d | Point 2 | Merge commits (already the rule since 2026-10-29), squash on merge | Nothing to decide; answer R0bi7 |

## Order

| Step | What | Owner | Points |
|---|---|---|---|
| 0 | Post the reply on #79 (draft below), after D-a and D-b | user | all |
| 1 | #104: route-level test + seam; push; R0bi7 reviews, merges | user, R0bi7 | 1 |
| 2 | #95: cancel no-quote fix + test; merge up #96 → #102 | user | 7 |
| 3 | #101: merge `development` (with #104) in, keep pins + `id: release`; R0bi7 merges | user or hazy2go, R0bi7 | 9 |
| 4 | Release #100 + #104 + #101 to master; then freeze master (D-a) | R0bi7 | 3 |
| 5 | Edit the epic body's D5 row; #90 merges any time | user | 8 |
| 6 | Restack: sync #91 with `development`, port the guards, merge up to #102 | user | 1, 2 |
| 7 | #102: keep the switch (default true), merge the two `server.json` tests, open-quote count in `/health`, ops runbook, release note | user | 3, 4, 6, 9 |
| 8 | Merge #91 … #98 in order (sync each next branch by merge, retarget base) | R0bi7 | 2 |
| 9 | Pre-release checklist for #102 (RPC, gateway, single replica, webhook, alert owner) | ops owner (ask R0bi7) | 5, 6 |
| 10 | #102 merges → real canary run on `development` (dry_run false) → release → sodax-sdks #577 | user, R0bi7 | 5 |

Steps 1, 2, 5 and the code part of 7 don't depend on each other and can start now.

## Step 1 — route-level test in #104 (point 1)

Seam, `src/index.ts` only, nothing moved:

- Split `runHTTP`: `export function createHttpApp(): Express` holds everything from `const app = express()`
  through `app.use(jsonErrorHandler)`. `runHTTP` keeps `warmDocsCache()`, `seedToolRegistry()`, then
  `createHttpApp().listen(...)`.
- Wrap `main().catch(...)` and the four `process.on(...)` lines in an entry check, so importing the module in
  a test starts nothing: `if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href)`.
  Verify it still boots with `pnpm dev` (tsx watch), `pnpm start` and the Docker image. If tsx breaks the
  check, fall back to `if (!process.env.VITEST)`.

New `src/httpApp.test.ts` (listen on port 0, plain `fetch`):

| Case | Expect | Guards against |
|---|---|---|
| `GET /mcp` | 405, `Allow: POST, DELETE`, JSON-RPC body | lost `mcpGetNotAllowed` |
| `POST /mcp` with `{bad` | 400 JSON body | lost `jsonErrorHandler` |
| `POST /mcp` with a 101 kB body | 413 JSON body | lost body limit / handler order |
| `POST /mcp` batch of 11 | 400 batch error | lost `createMcpLimiter` |
| `GET /sse`, then `POST /messages?sessionId=…` initialize | 200 `event: endpoint`; 202; stream still open | `transport.start()` back (the #100 bug) |
| 11th `GET /sse` from one IP | 429 | lost `SseSessionLimiter` |
| `hashClientIp` mocked to throw once, `POST /mcp` | 500 JSON, server still answers next request | lost `asyncHandler` |

Close open SSE responses in `afterAll`. Mutation check before pushing: delete `app.get("/mcp", mcpGetNotAllowed)`,
then add back `await transport.start()`; each must turn the test red.

## Step 2 — cancel without a quote binds the deposit to the intent (point 7)

Lowest PR with `isDepositsIntent`: #95 (`feat/85-swap-track`). Fix there, then merge up.

- `src/services/sodax.ts`: `export function createIntentPayload(intent: IntentJson): string | undefined`,
  shaped like `cancelPayload`: `EvmSolverService.reconstructCreateIntentData(toSdkIntent(intent),
  solverConfig.intentsContract, false)` in a try/catch. The SDK documents it as byte-identical to the payload
  built at creation (fee recovered from the intent's data).
- `src/services/swap/cancel.ts` `isDepositsIntent`: replace `holdsDeposit(...)` with
  `checkDeposit(receipt, { connection, assetManager, srcChain: intent.srcChain, srcAddress: intent.srcAddress,
  relayData: { address: intent.creator, payload } }) === "match"`; no payload → `false`. Keep the hub-wallet
  check. Update the doc comment. Drop `holdsDeposit` and its tests if nothing else uses it (only cancel does today).
- `src/tools/swapCancel.test.ts`: add `["another intent of the same wallet", { intentId: "8" }, CREATOR]` to the
  `refuses, without a quote, a hub intent %s` table. The no-quote happy paths (chain only, around lines 94, 117,
  139, 277) must stay green: if the receipt fixture's transfer data isn't byte-equal to the rebuilt payload,
  regenerate it with `__fixtures__/encode.ts`. If `sodax.js` is mocked there, use the real
  `createIntentPayload`.
- Mutation check: put `holdsDeposit` back, the new case goes red.

## Step 3 — #101 (point 9)

After #104 merges, `release-please.yml` conflicts (same step line). Resolution keeps #104's SHA pins, #101's
`id: release` and job `outputs`. Also pin `actions/checkout` in the new `publish-mcp-registry` job (it has
`id-token: write`), same style as #104. Ask hazy2go first; the branch allows maintainer pushes if they're away.
#102 then conflicts in `server.json` and has two server.json tests: step 7.

## Step 5 — D5 (point 8)

Edit the D5 row of #79's body to: "Phase 1 sources: the EVM spoke chains (Sonic, the hub, not yet). Other
families open once the backend checks source txs in submit-tx. Any destination. See ADR 0001 D5." R0bi7 said
the epic is a draft the user may adjust; say so in the reply.

## Step 6 — restack (points 1, 2)

Sync by merge only; never rebase or force-push.

1. `feat/81-forward-api-key`: `git merge origin/development` (brings #100, #104, #101). In `src/index.ts`
   resolve by hunk, never whole-file:
   - `/mcp`: `app.get("/mcp", mcpGetNotAllowed)`, then `app.all("/mcp", mcpLimiter, asyncHandler(...))` whose
     last line is `await runWithRequestContext({ apiKey: callerApiKey(req) }, () => transport.handleRequest(req, res, req.body))`.
   - `/sse`: #104's lease version as git auto-merges it; no `transport.start()`.
   - `/messages`: `asyncHandler`, `session.lease.touch()`, then #91's `runWithRequestContext` with the POST's own key.
   - Keep `app.use(jsonErrorHandler)` last and the `sodaxEnv` field in the listen log.
   - `createHttpApp` from step 1 takes whatever #91 needs.
2. Merge each branch into the next, in order. Expected: `index.ts` at the PRs that touch the routes (#92 profile
   and `resolveConnection`, #94 SSE context, #102 switch), because `asyncHandler` re-indents the handler bodies;
   #93 `sodaxApi.ts` (keep `pathParam` from #104 and #93's cache calls); #97 `analytics.test.ts` (keep both sets).
3. At every branch, before pushing: `git grep -n "transport.start()" -- src` is empty, then `pnpm checkTs && pnpm lint && pnpm test`
   (the route test from step 1 runs at each). Check ahead/behind before each push.
4. Smoke the top (#102) once: Docker with `SODAX_ENV=canary`, `GET /mcp` 405, an SSE session, one quote.

During step 8, after each squash merge: `git merge origin/development` into the next branch (clean, same
content; through an intermediate branch if the squash conflicts), push, `gh pr edit <next> --base development`.

## Step 7 — #102 changes (points 3, 4, 6, 9)

1. Keep the switch (D-b): bring back `parseSwapToolsEnabled` and its threading from before 5e5e35a
   (`git show 5e5e35a` lists the 18 files), with `value?.trim().toLowerCase() || "true"`. Keep 5e5e35a's
   other behavior: RPC overrides parsed on every boot, SDK loaded at HTTP boot when the switch is on, a swap-only
   stdio server skips the docs warm-up. Landing page Swaps card only when on. Tests: unset → swap tools served;
   `false` → `?profile=swap` 400 "not enabled"; `yes` → boot fails. README env row: default `true`, "set
   `false` to turn the swap tools off without a rollback". `.env.example` likewise.
2. `server.json`: merge #101's and #102's server.json tests into one file; keep both sets of checks.
3. `/health`: add `swapQuotes: { awaitingDeposit, lastDeadline }`, from the quote cache (quotes with no
   handed-over deposit, deadline not past). `notifyServerStopping` adds the same count to the Discord message.
4. README "Operating the swap tools": one replica only (the quote cache is in memory); before a deploy, wait
   until `awaitingDeposit` is 0 or `lastDeadline` has passed; after any restart watch Discord for
   `unknown_quote` (carries chain key and tx hash); recover by relaying the deposit tx with the relay API, which is
   what track's relay-for-refund does; `DISCORD_WEBHOOK_URL` required in production.
5. Release note for the master release (D-a), in #102's PR body and the release PR: relay host now
   `api.sodax.com/v1/relay`; keyed calls don't follow redirects; unknown `?profile=` → 400; malformed partner
   fee → 400; an SSE message without its session's key → 403; swap profile; the kill switch.

## Step 9 — pre-release checklist for #102 (points 5, 6)

Each item needs a named owner in the reply.

- RPC: probe on 2026-11-03 of the SDK's packaged defaults (a receipt read): `ethereum` (1) 429 rate-limited,
  `0x89.polygon` (137) 401 "tenant disabled", `hedera` (295) timeout; the other EVM spokes answered. Set paid
  `SODAX_RPC_URL_1`, `_137`, `_295` at least; ideally every EVM source.
- Gateway: on staging and production, `/mcp?profile=swap` with a well-formed fake `sodax_…` key must not get a
  quote; per-key limits apply. The server checks the key's shape only.
- One replica in Coolify; `DISCORD_WEBHOOK_URL` set (startup message shows up in Discord); an alert owner for
  `unknown_quote` and the other operator alerts.
- Coolify memory for the SDK (~230 MB RSS, from `brief.md`).

## Step 10 — candidate run

`e2e-canary.yml` runs only on the default branch. After #102 merges: `workflow_dispatch` on `development` with
`dry_run` false, 5 USDC; it must reach `solved` and the arrival check. No merge into `development` between that
run and the release PR, or run it again. Needs the `canary-e2e` secrets (blocker 3 in `brief.md`).

## Reply draft for #79

```
Thanks, all nine hold up. I checked each against the branches.

1. Confirmed: #91, #93 and #97 conflict after #104, and the stack doesn't have #100 yet, so taking the stack side brings transport.start() back. I'll port the guards when I sync #91. #104 gets a route-level test first (GET /mcp 405, bad JSON, body limit, batch cap, SSE cap, SSE start, a throwing handler), so the restack can't drop them quietly.
2. Merge commits. The stack syncs by merge since 10-29; the plan comment still said rebase.
3. Agreed. I'd hold master after the #100/#104/#101 release until #102 and ship one release with a list of the behavior changes (relay host, no redirects on keyed calls, profile and partner-fee 400s, SSE key 403).
4. Will do: #102 keeps SODAX_SWAP_TOOLS_ENABLED, default true.
5. RPC defaults today: Ethereum 429, Polygon 401 (tenant disabled), Hedera times out; the others answer. Who can set SODAX_RPC_URL_1/137/295 and run the gateway check with a fake sodax_ key? The real canary run happens on development after #102 merges, before the release.
6. Agreed. #102 adds an open-quote count to /health and the stop message, and a short ops section (one replica, wait for open quotes before a deploy, relay a stranded deposit by hand). Who owns the alerts?
7. Real gap. The no-quote path will match the deposit's payload against the hub intent (rebuilt with the SDK), with the same-wallet, different-intent test. Fix goes on #95.
8. ADR 0001 on #90 already says EVM sources only; I'll update D5 in the description.
9. Added: #101 after #104, keeping id: release, and before #102. I'll also pin checkout in its publish job.
```
