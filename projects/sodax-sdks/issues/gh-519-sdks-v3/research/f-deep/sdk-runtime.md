---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, sdk-runtime]
---

# SDK runtime API — deep dive (feasibility, complexity, benefit)

- **sdk-8** is feasible and mostly additive. Probes show three of the four suspected defects. The fourth (caller abort reported as `REQUEST_TIMEOUT`) is latent, because no caller signal reaches that code yet. All three consumer repos carry workarounds for the error shapes.
- **sdk-9** needs product decisions first. The "remote" config is the backend's pinned SDK release (2.2.0-rc.8), so today it is at most as new as a published SDK release. No release applies remote config today: 2.0.0-rc.19 and later have a no-op `initialize()`, and rc.2–rc.18 fetch a v1 route whose `version: 27` they reject. The packaged config costs about 37 KB gzip, which a cold fetch of the live config (28–34 KB brotli) roughly cancels out.
- **sdk-9 trust:** token lists are not a low-trust subset. Every entry carries routing addresses and `decimals`.
- **sdk-10** is feasible and additive. A prototype compiles under strict tsc and drives the real `SwapsApi` client: 151 lines of typed fakes for all 9 wallet interfaces and a 45-line fake `fetch`, plus 72 lines of checks (268 in all). No consumer repo has wallet fakes or HTTP-level SDK fakes today. Its in-repo value is replacing 44 wallet casts and 49 global `fetch` stubs, and it needs a `fetch` option the SDK lacks.
- **Status:** first written as an early checkpoint; a finish pass then compiled and ran the sdk-10 prototype and closed two sdk-8 lookups. A verification pass then corrected several counts, the `initialize()` history and three ratings (see "Verification" at the end). What is still unproven is under "Not verified" and "Resume notes".

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| sdk-8 | Feasible with caveats / Code-traced (defects Proven) | C4 (C5 once signals reach the action flows) | B3 | 2.x (solver result type in 3.0) | Additive context and signal plumbing over 8 transport sites. Risks: aborts after broadcast on fund-moving flows, and backend classifiers that match SDK prose |
| sdk-9 | Needs a decision / Code-traced (live data Proven) | C5 (remote fund-routing data on deposit paths; cross-repo data source) | B2 standalone, B3 combined | 3.0; decisions now | Benefit needs a version rule, a trust rule and a data source newer than SDK releases. The bundle saving is ~37 KB gzip, offset by the fetch |
| sdk-10 | Feasible with caveats / Code-traced (typed fakes and fake `fetch` Proven; `Sodax({ fetch })` and the subpath build not prototyped) | C3 | B2 | 2.x for the `fetch` option and fixtures; 3.0 for wallet fakes, after wsc-2 | Typed fakes for all 9 interfaces compile in 151 lines with no runner dependency. Needs a `fetch` option and a subpath build. No consumer tests use it today |

## sdk-8 · Error metadata, AbortSignal, request IDs
**Bullet:** "Standardize API error metadata, support AbortSignal for requests and polling, and add request IDs where supported"  ·  **T-ids:** T19.1, T19.2, T19.3, T19.4, T19.5, T19.6

### Today

**Inventory.** Counted with `python3 -I scripts/inventory.py <repo>` over production sources (no tests, e2e or `.d.ts`). Comment lines are excluded.

- **Fetch call sites: 34 [verified].**
  - By package: sdk 25, swaps-api 1, bridge-api 1, wallet-sdk-core 1, wallet-sdk-react 5, dapp-kit 1.
  - **8 of them call SODAX APIs, in 5 files:** `api-utils.ts:189`, `swaps-api/src/http.ts:178`, `bridge-api/src/http.ts:178`, `SolverApiService.ts:90,154,230` and `IntentRelayApiService.ts:205,239`.
  - The other 26 call chain RPCs, indexers, Bound and DefiLlama.
- **HTTP error types: 5 [verified].**
  - `SwapsApiError` (8 construction sites), which is the same type as `BridgeApiError` (7 sites). The two `http.ts` files differ only in comments, checked by a diff after renaming.
  - `BackendHttpError` (1, `api-utils.ts:99-112`).
  - `HttpRelayError` (1, `IntentRelayApiService.ts:70-78`, wrapped in `Error('SUBMIT_TX_FAILED')`).
  - `RadfiApiError` (14 sites).
  - `SolverErrorResponse`, a plain object, not an `Error` (`types/src/common/common.ts:122-127`).
- **Layouts on the wrapping `SodaxError<'EXTERNAL_API_ERROR'>`: at least 3 [verified].** Each layout has different fields:
  - swaps/bridge: `{api, endpoint, code, status, reason?, issues?}` (`SwapsApiService.ts:152-205`);
  - makeRequest: `{api, endpoint, status?}`, with no transport category (`api-utils.ts:240-254`);
  - solver-wrapped: `{phase, api:'solver', solverCode, solverDetail}` (`SwapService.ts:661-675`).
- **Wait and poll loops [verified].**
  - 20 `sleep`/timer awaits: sdk 16, swaps-api 1, bridge-api 1, wallet-sdk-core 2.
  - 9 `while` loops. Two of them are not waits: Sui pagination and a bigint sqrt.
  - Retry-style `for` loops in swaps and bridge `http.ts:175`, `IntentRelayApiService.ts:231`, `SponsoringService.ts:494`, `NearSpokeService.ts:386`, `StellarSpokeService.ts:743` and `EvmWalletProvider.ts:271`.
  - viem 2.29.2 `waitForTransactionReceipt` takes `pollingInterval`, `retryCount` and `timeout`, but no `signal` (`viem/_types/actions/public/waitForTransactionReceipt.d.ts:36-51`) [verified]. So the SDK has to race EVM receipt waits against a signal, or replace them with its own `getTransactionReceipt` poll loop [judgement].
- **Caller `AbortSignal`: none in the public API of sdk, types, swaps-api or bridge-api [verified].**
  - There are 7 internal `AbortController`s.
  - The 11 `signal: AbortSignal` matches are internal helpers (swaps/bridge `sleep`, Sui gRPC, wallet-sdk-react `withDeadline`) and Privy internals.
  - `RequestOverrideConfig` has no `signal` (`api-utils.ts:33-42`).
- **dapp-kit [verified, `python3 -I scripts/dappkit_hooks.py <repo>`].**
  - 128 query hooks.
  - 61 call `sodax.api.*` or `backendApi`.
  - 7 call solver- or relay-backed reads.
  - 47 poll; 14 of the polling hooks are HTTP-backed.
  - **0 pass React Query's `signal`.** Example: `useQuote.ts:51-67` polls every 3 s, and its `queryFn` takes no context.
- **How many need a signal threaded through [derived from the counts above].**
  - 8 transport sites in 5 files.
  - 87 public methods would inherit a signal from one new field on `RequestOverrideConfig`: Backend 21, Swaps 21, Bridge 10, LeverageYield 33, Sponsoring 2 (`grep -cE '^\s+public async'`).
  - 31 standalone client methods need per-call options: swaps 21, bridge 10.
  - 14 wait units: relay wait, relay packet poll, submit-tx poll, batch wait, 7 spoke loops (Icon, Solana, Injective, Stacks, Bitcoin, Near, Stellar), the sponsoring retry, `retry()` and `sleep()`.
  - Feature action params: `SpokeExecActionParams` (`types/src/common/common.ts:446-451`) is used by 12 service files in 9 feature directories (bridge, dex, leverageYield, migration, moneyMarket, partner, recovery, staking, swap) [verified, `rg -l "SpokeExecActionParams" packages/sdk/src --glob '!*.test.ts' | wc -l` = 12].
  - 68 dapp-kit query hooks.

**Defects.** Probe `scripts/probe-sdk8.mjs` ran the t2probe built dists against a local HTTP server; output is in `probe-sdk8.out`. It covered the cases below and nothing else. The t2probe sdk ESM is a tsc build of `0181a053` plus one throwaway change, a lazy ECC init in `BitcoinSpokeService.ts`, which these paths do not touch [verified, `git diff` in t2probe].

- **P1: swaps-api retries a caller abort as a network error [verified, Proven].**
  - **How the abort gets in:** through the documented `fetch` option (`swaps-api/src/config.ts:14-19`).
  - **Signal already aborted, `getTokens`:** `NETWORK_ERROR`, 3 fetch invocations, 0 server hits, 1 ms.
  - **Abort 150 ms into a hung request, `getSubmitTxStatus`:** `NETWORK_ERROR`, 3 invocations, 1 server hit, 164 ms.
  - **Cause:** `timedOut()` only checks the client's own controller (`http.ts:168,184-191`).
  - **Not run:** bridge-api (identical code) and mutations. Mutations are not retried (`http.ts:189-191`), but they are still classified as `NETWORK_ERROR` [code-traced].
- **P2: an abort is reported as `REQUEST_TIMEOUT` — latent, not reachable today [verified].**
  - **P2a:** with a stubbed global `fetch` that rejects with `AbortError`, the makeRequest stack returns `REQUEST_TIMEOUT`, with the cause "Request timeout after 30000ms", after 1 ms and 1 attempt. The context has no transport code.
  - **P2b:** the SDK swaps stack classifies the same stub as `NETWORK_ERROR`, after 3 attempts.
  - Today no caller signal can reach `makeRequest`, so this only bites once T19.2 adds one. The mapping is by error name only (`api-utils.ts:204-206`).
- **P3: the solver transport loses the status and often the message [verified, Proven].** Calls to `SolverApiService.postExecution`:
  - A 400 returns the raw body with no status (`SolverApiService.ts:104,164,240`).
  - A 500 with a NestJS body returns an object without `detail`, typed as `SolverErrorResponse`. That is a type lie: `res.error.detail.code` throws.
  - A 502 with an HTML body returns `{code:-999, message:'{}'}`.
  - A refused connection returns the same, after 4,006 ms (3 tries 2 s apart).
  - `retry()` writes `console.error` even with a silent logger (`shared-utils.ts:57`).
- **P3b: the same failures through `sodax.swaps.postExecution` [verified].**
  - Both cases return `SodaxError('EXTERNAL_API_ERROR', '{}')` with `solverCode -999` and no status: 10 ms for the 502 and 4,005 ms for the refused connection.
  - The docstring promises `EXECUTION_FAILED` for transport failures (`SwapService.ts:644`).
  - `getQuote` and `getStatus` return the raw `SolverErrorResponse` publicly (`SwapService.ts:388,437`).
  - The SDK itself builds an `UNKNOWN` (-999) solver detail at 8 production sites [verified]: 6 by name (`rg -n "code: SolverIntentErrorCode.UNKNOWN" packages/sdk/src --glob '!*.test.ts'`) and 2 as the literal `-999` (`rg -n "\-999\b" packages/sdk/src --glob '!*.test.ts'`). They are the solver transport (`SolverApiService.ts:125,181,259`), "solver said NOT_FOUND but the intent record could not be read" (`SwapService.ts:494`, `LeverageYieldService.ts:1637`) and a malformed solver error (`SwapService.ts:662`, `LeverageYieldService.ts:1494,1546`). None carries an HTTP status, so a structured error context has to cover all 8.
- **P4: `toJSON` drops the backend body on the swaps/bridge stack only [verified].**
  - **P4a:** a 400 from the SDK swaps stack keeps the body only in `cause.context.body`. `JSON.stringify(error)` loses it, because the serialized cause keeps only name, message and stack (`SodaxError.ts:104-111`).
  - **P4b:** the makeRequest stack keeps it, inside the nested cause message `HTTP 400: {…}` (`api-utils.ts:106`).

**Request IDs.**
- **Backend (sodax-backend@985959e9) [verified]:**
  - `RequestContextMiddleware` captures method, path, body and query, but no ID (`packages/shared-utils/src/utils/request-context.middleware.ts:23-39`).
  - Only the API-key guard copies a caller's `x-request-id` into usage events (`packages/api-auth-client/src/api-key.guard.ts:115`).
  - `apps/api/src/main.ts:38` exposes `X-Request-Id`, but nothing sets it. A grep finds no setter, and the live response has no such header.
  - The middleware is shared by api, swaps-api, bridge-api and stateful-api (each `app.module.ts`).
- **Live preflights, 2026-10-19 11:16 UTC, prod and canary identical [verified]:**
  - **Allowed** (the server echoes requested headers): `/v1/be`, `/v2/be`, `/v1/swaps`, `/v1/bridge` and `/v1/sponsorships`.
  - **Allowed** (wildcard): solver `/v1/intent/quote` answers `*, x-api-key`.
  - **Rejected:** solver `/v1/intent/execute` and `/v1/intent/status` answer `Content-Type, Authorization, x-api-key`.
  - **Rejected:** relay `/v1/relay` answers `Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`.
  - The relay returns `x-amzn-requestid` without exposing it.
- **SDK:** no request-ID code at all [verified: `rg -i -c 'x-request-id' packages/*/src --glob '!*.test.*'` finds 0 files; the `requestId` hits are staking unstake IDs].

**What this costs consumers today [verified]:**
- **Backend:**
  - `apps/swaps-api/src/api/swaps/error-mapper.ts:31` duck-types solver errors and walks cause chains for RadFi.
  - `apps/swaps-api/src/shared/utils/solver-reconcile.ts:11,30,36` matches SDK prose "until the SDK ships a distinct code (icon-project/sodax-sdks#390)". #390 is open.
- **Frontend (sodax-frontend@1b915ec7):**
  - `apps/web/lib/swap-quote-error.ts:1-42` regex-matches 4 fields up to cause depth 4.
  - `apps/web/app/(apps)/swap/page.tsx:112-117` turns off all quote retries so that a deterministic "no path" error shows at once (the code comment's reason). A `retryable` flag would let it retry only transient errors [judgement].
- **Whitelabel:** `intents-whitelabel@5e1fbba:src/hooks/use-swap-quote.ts:43` replaces every solver error with `'Quote failed'`.

### Change

1. **One context schema on every `EXTERNAL_API_ERROR`.**
   - Fields: `transport` (network | timeout | aborted | http | parse | validation), `status`, a bounded `body`, `retryable`, `retryAfterSeconds` and `requestId`.
   - The solver keeps the status and text bodies, and network messages are no longer `{}`.
   - `retry()` logs through the logger.
   - Export `isRetryableError()`.
   - In 2.x, `SolverErrorResponse` gains optional `status` and `body`. In 3.0, `getQuote` and `getStatus` return `SodaxError` (shared with dk-5).
2. **Signals in requests.**
   - `RequestOverrideConfig.signal` covers the 87 methods.
   - The standalone clients get `options?: { signal }`, link the caller signal to their timeout controller by hand, and never retry after an abort.
   - The abort is classified by `signal.reason`, not by the error name. Otherwise P2 just moves into swaps-api.
3. **Signals in loops.** Add `sleep(ms, signal)` and thread it through the 14 wait units. viem waits are raced.
4. **Signals on action params**, with the #509 contract: an abort after broadcast returns `srcTxHash`.
5. **dapp-kit** passes `queryFn({ signal })` in the 68 HTTP hooks.
6. **`x-request-id` per request** to hosts that allow it, recorded on `context.requestId`. The cross-repo work it needs:
   - a sodax-backend PR to the shared middleware (accept or generate the ID, log it, echo it, expose it in swaps-api and bridge-api CORS);
   - the solver owner allowing it on `/execute` and `/status`;
   - the relay owner allowing it at the API Gateway.

```ts
const ac = new AbortController();
const r = await sodax.api.swaps.getQuote(body, undefined, { signal: ac.signal }); // proposed
if (!r.ok && isRetryableError(r.error)) retryLater(r.error.context.requestId);
```

### Feasibility — Feasible with caveats · Code-traced (defects Proven)
- **Proven:** P1, P3, P3b and P4 within their stated scope. P2a and P2b ran with a stubbed `fetch` that rejects with `AbortError`; P2a is latent.
- **Verified:** `RequestOverrideConfig` already reaches every `sodax.api` and `backendApi` method (all 87 `public async` methods take it; signature scan of the 5 `backendApi/*Service.ts` files), so the SDK side needs no new standalone API.
- **Caveats:**
  - viem receipt waits take no `signal` [verified d.ts]; they have to be raced or replaced by an own poll loop.
  - Aborts after broadcast depend on #509 being merged and extended to MM, staking, migration and DEX (dk-2).
  - From browsers, request IDs reach only the backend-owned hosts and solver `/quote` until the solver and relay owners act [verified, CORS preflights; re-run on prod 2026-10-19 11:51 UTC]. CORS does not limit Node callers.
  - The backend matches SDK message strings (`solver-reconcile.ts:11`, the `'No filled intent found'` and `'Invariant failed'` prefixes). Messages must stay stable, or the change must be coordinated.
- **Open decision 1:** how the standalone clients report an abort:
  - (a) rethrow `signal.reason`, which breaks the "always `SwapsApiError`" contract (`http.ts:141`); or
  - (b) add an `ABORTED` code, which breaks exhaustive switches. Consumers have none [verified grep].
- **Open decision 2:** where IDs are sent. Either only to hosts that allow them, or ask the solver and relay owners first.

### Complexity — C4 (C5 once signals reach the action flows)
- **Rating:** C4 for the error context, request signals, request IDs and dapp-kit query signals. The loop and action-param signals (Change items 3–4) let an abort land after a broadcast on fund-moving flows; the rubric rates "risk on paths that move funds" C5.
- **PR breakdown [judgement on LOC]:**
  - error context, solver and logger fixes: ~250 LOC, sdk and types;
  - request signals: ~250 LOC, swaps-api, bridge-api and sdk;
  - loop signals: ~150 LOC, sdk;
  - action-param signals: ~250–300 LOC, types and 12 service files in 9 feature directories;
  - dapp-kit pass-through: ~140 LOC;
  - request IDs: ~100 LOC, plus one backend PR and two external asks.
- **Size:** about 1.1–1.2k LOC of production code across 5 packages [derived: 250 + 250 + 150 + (250–300) + 140 + 100 = 1,140–1,190], plus tests for before- and after-broadcast aborts.
- **Coordination:**
  - #483 (`errors/guards.ts`, CONFLICTING, R0bi7);
  - #512 (`IntentRelayApiService.ts`);
  - #509, #511 and #523 (feature services);
  - land the loop signals before the sdk-1 chain moves.
- **Breaking:** no, except the 3.0 solver result type.
- **Top 2 risks:**
  1. An abort that hides a broadcast transaction, on a path that moves user funds.
  2. Changed messages or shapes silently breaking backend classifiers.
- **Earlier estimate:** 17 pts (T19.1–T19.6). That fits C4; T19.3 and T19.4 (3 + 5 pts, `parent-issues.md:754-755`) are the loop and action-param parts that carry the C5 risk.

### Benefit — B3
- **P5 (maintainers):**
  - 4 of the 82 issues opened in 90 days are of this class: #390, #489, #506 and #520 (title regex plus a manual filter [judgement]).
  - In 90 days there were 38 fix commits out of 141. Only 11 commits touched the error and transport files (`api-utils.ts`, both `http.ts`, `SolverApiService.ts`, `IntentRelayApiService.ts` and `sdk/src/errors/`), and 1 of those was a fix [verified, `git log --oneline --since=2026-07-21 origin/main -- <those paths>`].
  - Support has no ID to correlate a user's error with backend logs: the request-context logger records none, and only API-key usage events store a caller-sent `x-request-id` [verified].
- **P3 (backend):** it would delete the prose matching and shape sniffing above [verified that the code exists; the size of the saving is judgement].
- **P1/P2:**
  - The frontend could turn quote retries back on for transient errors.
  - The whitelabel could show real messages.
  - Stale quote polls stop when the key changes [judgement, unmeasured: POSTing quotes was out of scope].
- **P4:** cancellation without the network-error misreport [Proven via P1].
- **P6:** one shape for agents to handle [judgement].
- **Combined:** with dk-5 (hooks throw `SodaxError`) and dk-2 (`srcTxHash` on every flow), this becomes one error contract end to end.
- **Cost of not doing it:** the consumer workarounds keep growing.

### Recommendation
- **Timing:** 2.x, additive. Move the solver result type in 3.0.
- **Wording:** "Standardize API error metadata (status, body, retryable, aborted vs timeout), support AbortSignal for requests and polling, and add request IDs where the backend supports them"

### Corrections to earlier research
- e-file sdk-8 said "Caller aborts are reported as `REQUEST_TIMEOUT`". This is latent: no caller signal reaches `makeRequest` (`api-utils.ts:33-42,184`).
- e-file said "the relay and solver CORS reject it". Only the relay and solver `/execute` and `/status` reject it; solver `/quote` allows it. Both "allows `*`" (d T19) and "no longer does" (e corrections) were route-dependent.
- e-file counted "four error shapes". It is 5 transport error types plus at least 3 `SodaxError` context layouts.
- "`toJSON` drops the body" holds for the swaps/bridge stack only (P4a vs P4b).
- d T19 listed only sdk fetch sites. The total is 34.
- New finding: `postExecution`'s documented `EXECUTION_FAILED` is unreachable for transport failures (P3b).
- New finding: `retry()` bypasses the logger.
- New finding (verification pass): 2 of the 8 synthetic `UNKNOWN` sites use the literal `-999` (`SwapService.ts:662`, `LeverageYieldService.ts:1494`), so a search by name finds only 6.

## sdk-9 · Remote token lists and chain metadata
**Bullet:** "Support remote token lists and chain metadata, with product decisions on defaults, fallback and trusted config fields"  ·  **T-ids:** T20.1 (= #543), T20.2, T20.3

### Today

**#543 (open; assignee 0x0603; author R0bi7, who posted the open questions).**
- **What it covers:** an opt-in `initialize()` that fetches config v2 and applies it to every service, including services created before the call (R1). Explicit options win (R2). One version rule (R3). Unknown fields are ignored (R4). Failures are atomic (R5). The API base stays local (R7).
- **Non-goals:** background refresh, dapp-kit auto-init and backend deploy.
- **AC1:** remote endpoints and addresses must apply. That contradicts any field restriction.
- **"Blocked" is stale:** `GET https://api.sodax.com/v2/be/config/all` returns 200, and canary is byte-identical [verified, 2026-10-19].
- **Code today:** `ConfigService.initialize()` is a no-op (`ConfigService.ts:158-181`).

**Live config [verified].**
- **Version and sections:** `version 2020008` (2.2.0-rc.8). 10 sections: chains, swaps, moneyMarket, bridge, dex, leverageYield, hub, api, solver, relay.
- **Contents:** 22 chains, 382 swap tokens, 200 money-market tokens and 407 chain tokens, unique by chain and address (202 and 410 raw entries) [verified, `token-delta.mjs` and a Python recount].
- **Size** (KB = 1,024 B in this section):
  - raw: 297,082 B;
  - gzip: 70.8 KB at level 9 with node zlib (72.7 KB with the gzip CLI), 74.2–74.4 KB as served;
  - brotli: 28.7 KB at q11, 34.4 KB as served.
- **Caching:** a weak ETag, and `If-None-Match` returns 304. There is no `Cache-Control`.
- **Latency:** 0.45–4.7 s from one location.

**Where the data comes from [verified].**
- The backend serves its installed SDK's packaged `sodaxConfig` and `CONFIG_VERSION` (`sodax-backend@985959e9:apps/api/src/api/v2/config/config-v2.controller.ts:82-87`).
- `/swaps/tokens` does the same (`apps/swaps-api/src/api/swaps/swaps.service.ts:79-80`).
- The pin is `2.2.0-rc.8` (`pnpm-workspace.yaml:199-200`).
- **No independent token registry exists in sodax-backend:** the dashboard token registry and `packages/hub-assets` also read the installed `@sodax/types` [verified, `git grep` at 985959e9].
- **Backend pin bumps:** rc.2 on 09-02, rc.3 on 09-05, rc.4 on 09-09, rc.5 on 09-11, rc.6 on 09-19 and rc.8 on 09-29. Stable 2.2.0 (released 10-12) is still not pinned 7 days later.

**Versions [verified].**
- `CONFIG_VERSION` at each tag: 210 (2.0.0-rc.12), 220 (2.0.0), 230 (2.1.0), 231–235 (2.2.0-rc.1…rc.5), 2,020,008 (rc.8) and 2,020,099 (2.2.0). The encoding arrived with #445 on 2026-09-16.
- On main the committed value is `2_000_017`, because it is bumped only on release branches (`types/src/index.ts:33`).
- `parseConfigVersion` rejects values below 1,000,000 (`types/src/index.ts:85-88`).
- `initialize()` fetches only in 2.0.0-rc.2…rc.18 (17 tags). From 2.0.0-rc.19 on (#210, 2026-07-01), including 2.0.0, 2.1.x and 2.2.x, it is a no-op [verified, `git show <tag>:…/ConfigService.ts` for all 40 `@sdks@2.*` tags].
- With the default base URL, the fetching releases call `GET /v1/be/config/all`, and all 17 reject a remote `version` below their own [verified per tag]. The route returns a v1-shaped body with `version: 27`, which the backend pins (`sodax-backend@985959e9:apps/api/src/api/config/SdkConfigV1ToV2Adapter.ts:49-55`; live GET 2026-10-19 11:49 UTC). 27 is below their `CONFIG_VERSION` (200–216), so they log a warning and keep the packaged config. No released SDK applies remote config today. These releases had 7.7% of last week's downloads [derived, `S/dl-npm/`].

**How often listings change [verified, `git log --since=2026-07-19 origin/main -- <7 data files>`; script `classify_commits.sh`].**
- 29 of 142 commits touched config data; 18 of them touched `tokens.ts` or `chains.ts`.
- **13 were listing-only:** #306, #340, #357, #384, #387, #393, #403, #419, #437, #438, #470, #473 and #485.
- 2 were RPC-default fixes that also changed wallet-sdk-react (#360, #397).
- 1 was a new chain that needed code (#326).
- 9 of the 20 release ranges carried a listing commit [verified, `git log --no-merges <previous tag>..<tag>` over consecutive tags; an earlier count said 10]. **0 releases were listing-only**, so remote config would have saved no release.

**What lagging clients miss [verified, `scripts/token-delta.mjs`, tag sources bundled with esbuild].** Swap / MM tokens in the live config that the tag lacks:

| Tag | Swap | MM | Note |
| --- | ---: | ---: | --- |
| 2.0.0-rc.12 | 170 | 47 | Whitelabel's pin. The tag also has 3 swap tokens that are no longer live |
| 2.0.0 | 163 | 32 | |
| 2.1.0 | 130 | 7 | |
| 2.2.0 | 0 | 0 | Identical to live |

**Consumers [verified].**
- **Whitelabel:**
  - pinned to `2.0.0-rc.12` (`package.json:22-27`);
  - calls `initialize()` expecting live tokens (`src/lib/sodax.ts:13`). Its rc.12 does fetch, but gets `version: 27` from the v1 route and keeps the packaged lists, so the 170 missing swap tokens stay missing (see Versions);
  - reads token lists through instance getters.
- **Frontend:**
  - 26 files reference static config exports (52 `spokeChainConfig`, 10 `dexPools`, 8 `SodaTokens`, 6 `sodaxConfig`, …);
  - they would not see remote data.
- **npm last week:** 1,298 downloads; 2.2.0 had 21.0%, 2.1.0 10.8% and 2.2.0-rc.8 2.9% (a weak proxy).

**Bundle weight of the packaged config [verified, `scripts/measure-config.mjs`; the verifier's re-run gave identical figures].** esbuild 0.25.12, browser, minify, gzip -9, t2probe dists (the `new Sodax()` entry uses the T2 unbundled sdk ESM). The second figure stubs the 7 data modules.

| Entry | Packaged | Data stubbed |
| --- | ---: | ---: |
| `sodaxConfig` only | 146.7 KB min · 38.8 KB gzip · 30.7 KB brotli | 1.5 KB gzip |
| `getChainType` | 37.5 KB gzip | 1.5 KB gzip |
| `new Sodax()` | 1,257.7 KB gzip | 1,219.5 KB gzip (−38.2 KB, −3.0%) |

### Change
Beyond #543:
1. **Decisions (below).**
2. **3.0 default-on.** Remote config is on by default, as stale-while-revalidate: render with the bundled config, then swap in the fetched one. dapp-kit's `SodaxProvider` refreshes it and invalidates the token-list queries.
3. **A trusted-field merge.** Apply only the allowed sections, or verify a signature.
4. **Optionally, the bundled config as an opt-in import.**
   - It goes behind `@sodax/types/config-fallback`.
   - It needs the x-1 types split and async-ready readers.
   - It adds a multi-package dependency (x-1) on top of the C5 base.
5. **A backend data source newer than SDK releases.** This is cross-repo.
6. **Apps read config from the instance**, not from static exports. The frontend has 26 files that do the latter.

### Feasibility — Needs a decision · Code-traced (live data Proven)

**Version rule, with today's numbers [derived].** L is the SDK's `CONFIG_VERSION`, R the remote one.
- **R ≥ L** (the disabled code; live in 2.0.0-rc.2…rc.18 against the v1 route):
  - 2.2.0 (L = 2,020,099) rejects today's R = 2,020,008.
  - Every release newer than the backend pin gets nothing.
  - It accepts a 3.x config into a 2.x SDK, which risks a shape mismatch.
- **Same major:**
  - It accepts across all 2.x releases, including older data into newer SDKs.
  - Under the replace semantics of the disabled code (`ConfigService.ts:171-177`), that is a downgrade: tokens added later vanish and fixed addresses revert.
- **Exact match:**
  - Only the backend's exact pin accepts (2.9% of downloads).
  - It brings no new data by definition.
- **Same major and R ≥ L:** no downgrade and no cross-major acceptance. It is fresh only for clients older than the pin.
- **Separate schema version from data revision:** the cleanest option. It needs backend and types work.

**Trust surface [verified counts, `scripts/trust_surface.py`; the categories are a heuristic].** The live config has 8,412 leaves:
- 3,181 token address, `hubAsset` or `vault` values;
- 1,059 `decimals`;
- 133 contract addresses (asset managers, connections, intents, money market, leverage yield);
- 23 `chainId`;
- 43 × 3 Stellar trustline fields;
- 10 `access` gates;
- 25 RPC endpoints, 2 Bound endpoints, 2 solver/relay endpoints and 1 API base;
- 22 relay chain IDs;
- about 2,569 display-only leaves (31%);
- the remaining 1,256 are tuning values and fields the heuristic does not classify [derived: 8,412 minus the categories above].

Any of these except the display leaves can redirect or mis-scale funds, or redirect traffic [judgement].

**Trust options:**
1. Allow-list display data plus new tokens only. New tokens still trust the server.
2. Add-only merge. It cannot delist a token or fix an entry; see the 3 stale rc.12 tokens.
3. Sign the config in the release pipeline and verify it with viem against a pinned signer [judgement: no new dependency].
4. Verify new tokens on-chain. The hub asset manager exposes `assets(chainId, spoke)` and `assetInfo(hubAsset)` (`EvmAssetManagerService.ts:32,138`). `vault` and `decimals` need other reads. Unproven.

**Interaction with #543 [verified lower bound].** At least 16 service files snapshot endpoints, addresses or RPC clients in their constructors (the verifier's heuristic `ctor_snapshots.py` finds 19 files whose constructors store config-derived values). #543's R1 is a refactor if every field may change, and a ConfigService-only change if only token lists may.

**Decision list:**
1. Version rule (above).
2. Default on or off in 3.0.
3. Fallback: always bundled, an opt-in import, or none.
4. Trusted fields (the options above, and whether to amend AC1).
5. Data source: the backend pin, or a registry.
6. Unknown chains: drop quietly or log.
7. Start-up: blocking, stale-while-revalidate, or explicit; plus timeout and caching (ETag works).
8. Who bumps the backend pin, and within what time.
9. Partner-hosted base URLs.
10. SSR cache scope.

### Complexity — C5
- **Rating:** the rubric rates "risk on paths that move funds" and a cross-repo dependency C5. Remote token lists are fund-routing data (the trust surface above), top risk 1 below is remote addresses on deposit paths, and a source newer than SDK releases needs backend work. Only a display-only scope would be C4, and the trust section shows that is not what sdk-9 asks for.
- **PR breakdown [judgement]:**
  - default-on in sdk and dapp-kit: ~150 LOC;
  - trusted-field merge and tests: ~200 LOC;
  - signing: ~80 LOC in the SDK, plus a release-pipeline step;
  - a fallback entry: needs x-1 and async readers, C5;
  - the backend registry: a cross-repo epic.
- **Breaking:** yes in 3.0, through the start-up network dependency.
- **Top 2 risks:**
  1. Remote addresses on deposit paths.
  2. Downgrades or partial application.
- **Earlier estimate:** 7 pts (T20.1–T20.3). That undercounts R1 when all fields may change.

### Benefit — B2 standalone, B3 combined
- **Bytes:**
  - Up to 36–38 KB gzip less per bundle, but only with the opt-in fallback.
  - In a v3-shaped swap-only bundle (169 KB, measurements.md) that is about 22% [derived: 37.5/169].
  - A cold start then fetches 28–34 KB brotli, so the bytes on the wire are about neutral. The gain after that comes from ETag caching.
- **Freshness:** only for clients that run a #543 release and are older than the backend pin. 0 releases saved [verified].
- **P2 (whitelabel-type apps):** the 130–170 tokens their pins lack arrive with any upgrade to 2.2.0 or later, with or without remote config. Remote config adds only tokens listed after the installed release [derived from the table above].
- **P2 (frontend):** gains nothing until its 26 static-import files migrate.
- **P4:** no change; they already get the backend's lists.
- **P6:** the docs stop claiming that `initialize()` fetches config.
- **Combined:** with a backend registry and default-on, new tokens reach every 3.x app without a release [judgement].

### Recommendation
- **Timing:** 3.0. Decide the version rule and the trusted fields now, because #543 needs them.
- **Wording:** "Building on #543: decide the version rule, trusted fields and 3.0 default for remote config, and give token lists a source newer than SDK releases"

### Corrections to earlier research
- e-file decision 7, "compare majors": same-major alone allows downgrades. Use "same major and ≥", or a separate data revision.
- b T20 and client-usage T20 proposed allowing remote token lists plus display metadata as the low-trust subset. Token lists are fund-routing data (3,181 addresses and 1,059 `decimals`).
- b T20 noted that 2.2.0 rejects the live config, which is correct. Add that releases before #445 used small counters (200–235), that 2.0.0-rc.19 and later have a no-op `initialize()`, and that rc.2–rc.18 fetch `/v1/be/config/all` and reject its `version: 27`.
- An earlier draft of this report said every installed release ships the no-op `initialize()`. That was wrong for 2.0.0-rc.2…rc.18, which include the whitelabel's pin.
- #543's "Blocked" and Q4: the route is live at `/v2/be/config/all`. The SDK must derive a v2 base from `…/v1` (`types/src/common/constants.ts:16`).

## sdk-10 · `@sodax/sdk/testing`
**Bullet:** "Add a @sodax/sdk/testing entry with mock wallet providers and API fixtures"  ·  **T-ids:** T31.4

### Today

**In-repo tests [verified with rg over `packages/**/*.test.ts(x)`].**
- 196 test files, with no shared helpers, fixtures or setup files.
- **Wallet fakes:**
  - 44 `as unknown as I*WalletProvider` casts in 22 files: sdk 43, wallet-sdk-react 1.
  - By interface: EVM 21, Bitcoin 8, Stellar 6, Solana 4, and 1 each for Sui, Stacks, Near, Injective and Icon.
  - 0 `satisfies` fakes. 1 fake is typed by annotation (`sdk/src/shared/utils/evmAtomicBatch.test.ts:19`).
- **Network stubs:**
  - 49 `vi.stubGlobal('fetch')`: sdk 42, dapp-kit 5, wallet-sdk-react 2.
  - 12 injections through the `fetch` option: swaps-api 6, bridge-api 6 [verified, `rg -n '\bfetch:\s'` over test files; the 2 dapp-kit hits counted earlier are error strings inside global stubs].
- **General mocking:** 160 `vi.mock(` calls; 649 lines with `vi.fn(` (689 calls); 1,737 lines with `mockResolvedValue` or `mockResolvedValueOnce` [verified, `rg -c` summed and `rg -o | wc -l`].
- **dapp-kit tests:** 53 `vi.mock` in 18 of 40 files (react-query 14, `useSodaxContext` 13).

**Building blocks [verified].**
- 9 wallet interfaces, with 5–11 members each, counting `getPublicKey`, which all 9 have (required only on Stacks) [verified, TypeScript checker, `iface-members.cjs`]. `@sodax/types` has no dependencies. Its declarations have one type-only import of `buffer` (`types/dist/solana/solana-web3.d.ts:1`; found with `grep -hoE "from '[^.][^']*'"` over the 60 `.d.ts` files). The prototype below included `@types/node` 22.18.1. Without it, the fakes still compile with `skipLibCheck`; with `skipLibCheck: false`, tsc reports exactly 1 error, TS2307 for `buffer` in that file [verified, verifier run].
- `new Sodax()` has no `fetch` option (`types/src/sodax-config/sodax-config.ts:114-135`).
- swaps-api exports 17 response schemas and `rawTxSchemaForChainKey` (`swaps-api/src/index.ts:20-38`). bridge-api exports none, though it has internal ones (`bridge-api/src/schemas.ts`), as does the SDK backend client (`backendApi/backendApiSchemas.ts`). The solver and relay have no schemas.

**Packaging [verified].** The sdk is one tsup entry with `splitting: false` (`sdk/tsup.config.ts:4-8`). A second entry would duplicate any runtime it imports.

**Consumers [verified, `scripts/consumer_test_mocks.py`].**
- **Frontend:** 5 test files, all scripts, none importing `@sodax`.
- **Whitelabel:** 0 tests.
- **Backend:**
  - 227 test files;
  - 6 `as unknown as Sodax` in 4 files, faking instance surfaces (`config.getRelayChainIdMap`, `swaps.relayerApiEndpoint`, `submitIntent`, `postExecution`);
  - 3 `vi.mock('@sodax/sdk')`;
  - 0 wallet fakes.

**Partner guidance [verified].** The skills recipe `sodax-sdk/integration/knowledge/recipes/testing.md`:
- teaches `as unknown as Sodax` with `vi.fn`;
- says to "let `initialize()` fetch config" (`testing.md:78`), which is false for every release since 2.0.0-rc.19; older releases fetch, then reject the v1 route's `version: 27`.

### Change
- **`src/testing`:**
  - `createFake<Chain>WalletProvider(overrides) satisfies I<Chain>WalletProvider` for the 9 chains. Calls are recorded in arrays, with no `vi.fn`.
  - `createFakeFetch(routes)` and `fixtures.*` for the swaps, bridge, solver, relay and backend endpoints. Each fixture is checked in sodax-sdks CI against the client's valibot schema where one exists (exported for swaps-api, internal for bridge-api and the backend client).
- **Packaging:** a `./testing` export that imports only types and swaps-api.
- **SDK option:** `new Sodax({ fetch })`, held on `ConfigService` like `logger`.
- **Docs:** update the skills testing recipe.

```ts
import { createFakeEvmWalletProvider, createFakeFetch, fixtures } from '@sodax/sdk/testing'; // proposed
const sodax = new Sodax({ fetch: createFakeFetch({ 'POST /swaps/quote': fixtures.swaps.quote() }) });
```

### Feasibility — Feasible with caveats · Code-traced (typed fakes and fake `fetch` Proven)
- **Prototype [verified, probe].** Files in `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-sdk-runtime/sdk10-proto/`, output in `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-sdk-runtime/proto.out`.
  - **Scope:** `@sodax/types` and `@sodax/swaps-api` dists at 2.0.0-rc.17 from t2probe (`0181a053`), linked read-only into the scratch `node_modules`. tsc 5.9.3 with the sdk `tsconfig.json` options that apply (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, NodeNext, `skipLibCheck`), plus `noEmit`. Runtime: node 22.15.0 `--experimental-strip-types`. tsc `--listFiles` shows all 60 `types/dist` `.d.ts` files loaded.
  - **Fakes:** `createFake<Chain>WalletProvider(overrides) … satisfies I<Chain>WalletProvider` for all 9 interfaces, in 151 lines (`wc -l src/fakes.ts`). Calls go to a plain `calls` array; an unstubbed member throws `fake <chain>.<method> is not stubbed`. No `vi.fn`, no test-runner import. `tsc --noEmit` exits 0.
  - **Negative checks:** 4 `@ts-expect-error` cases (missing members, wrong `chainType`, a renamed member as an excess property, an override with a non-`0x` EVM address). With the directives removed tsc reports exactly 4 errors, so each check fires.
  - **Verifier re-run (2026-10-19) [verified, probe]:** on a copy, tsc exits 0 and `run.ts` prints `ALL OK` again; with the directives removed the 4 errors are TS1360, TS2322, TS2353 and TS2322. The 4 checks cover only the EVM and Icon interfaces, so an extra type check (`verify-checks.ts`) confirmed that none of the 9 interfaces, and none of their members, resolves to `any`, which would make `satisfies` vacuous. The fakes carry every member except the optional `getPublicKey` on 7 interfaces.
  - **Fake network:** a 45-line `createFakeFetch(routes)` plus a `fixtures.swaps.quote()` typed as the input of `makeQuoteResponseSchema`. The real `SwapsApi` client, given `fetch`, calls `POST /v1/swaps/quote?includeTxData=true` and returns the fixture; `v.parse(makeQuoteResponseSchema(rawTxSchemaForChainKey('0xa4b1.arbitrum')), fixture)` passes and turns `tx.value` into a bigint. A drifted fixture (`quotedAmount: 990000`) is rejected with `SwapsApiError` `VALIDATION_ERROR`.
- **Code-traced:** the swaps-api client already accepts `fetch` (`swaps-api/src/config.ts:14-19`).
- **Limit found by the prototype [verified]:** the schema input type for `tx` is `unknown` (`GenericSchema<unknown, RawTxReturnType>`), so tsc checks only the fixture envelope. Drift inside `tx` is caught only by the runtime schema test, which is why the fixtures need a schema test in CI.
- **Not prototyped:** the `new Sodax({ fetch })` option (it does not exist yet), solver and relay fixtures, and the `./testing` subpath build.
- **Caveats:**
  - wsc-2 will shrink the wallet interfaces, so fakes shipped in 2.x would change in 3.0.
  - sdk-1 moves the per-chain fakes into plugins.
  - The `fetch` option touches the same 8 transport sites as sdk-8.
  - Solver and relay fixtures are type-checked only, until those APIs get schemas.

### Complexity — C3
- **PR breakdown [judgement]:**
  - `fetch` option: ~200 LOC, sdk and types;
  - fakes, router and fixtures with schema tests: ~800 LOC, sdk. The prototype covers the 9 fakes and the router in 196 lines [verified, `wc -l`]; the rest is fixtures for the 31 swaps and bridge client methods plus solver, relay and backend reads, with their tests [judgement on LOC];
  - optional dogfood migration of the 22 cast files: about net 0 LOC.
- **Breaking:** no; the change is additive.
- **Top 2 risks:**
  1. Duplicated runtime in a bundled subpath.
  2. Fixture drift for the unschematized solver and relay APIs.
- **Earlier estimate:** 3 pts. That undercounts the `fetch` option and the packaging [judgement: ~5–8 pts].

### Benefit — B2
- **P5:** could replace 44 casts and 49 global stubs (the stubs only once `new Sodax({ fetch })` exists). The fakes also act as conformance checks when interfaces change [verified counts; value is judgement].
- **P6:** a canonical, typed testing recipe [judgement].
- **P3:** small. The backend fakes the `Sodax` instance surface, not wallets. Its 65 global `fetch` stubs (10 files) test its own HTTP clients; none of those files imports `@sodax` [verified, `consumer_test_mocks.py` plus `git grep`]. A `fetch` option would let it test against the real SDK with a fake network [judgement].
- **P1/P2:** no frontend or whitelabel test touches `@sodax` today [verified], so the value for external partners is unmeasured.
- **Combined:** with api-4, the fixtures double as contract samples.

### Recommendation
- **Timing:**
  - 2.x: the `fetch` option and API fixtures.
  - 3.0: the wallet fakes, after wsc-2.
- **Wording:** "Add a @sodax/sdk/testing entry with typed fake wallet providers, schema-checked API fixtures and a fetch option, with no test-runner dependency"

### Corrections to earlier research
- d T31 said "only one test builds a `satisfies` fake". There are 0 `satisfies` fakes and 1 fake typed by annotation (`evmAtomicBatch.test.ts:19`).
- T31.4's 3 pts left out the `fetch` option and the subpath packaging.

## Dependencies between these bullets
- **sdk-8 ↔ sdk-10:** they share the 8 transport sites (signal and `fetch`). Do them in one pass.
- **sdk-8 → api-1:** fix the two identical `http.ts` copies before merging them, or during the merge.
- **sdk-8 ↔ dk-5:** the solver `SodaxError` comes in 3.0.
- **sdk-8 ↔ dk-2:** `srcTxHash` on every flow before action-param aborts.
- **sdk-8 ↔ dk-3 and dk-7:** query signals and polling presets.
- **sdk-8 → sdk-1:** loop signals land before the chain moves.
- **sdk-8 ↔ wsc-2:** receipt waits move to chain clients.
- **sdk-8 ↔ x-4:** availability of `AbortSignal.any` and `crypto.randomUUID`.
- **sdk-8 ↔ api-4:** error-body schemas.
- **sdk-9 needs #543 (T20.1):**
  - x-1 for a fallback entry;
  - sdk-1 for dropping unknown chains;
  - the dk area (`SodaxProvider` refresh);
  - a backend data source (api area, cross-repo);
  - sk-1 and sk-2 for docs truth;
  - x-2 to budget the config weight;
  - x-5 for the cross-major version rule.
- **sdk-10 ↔ wsc-2 and sdk-1:** fake shapes and where they live.
- **sdk-10 ↔ sdk-2 and sdk-6:** subpath packaging.
- **sdk-10 ↔ api-1 and api-4:** where fixtures live and how they are validated.

## Not verified
- The bridge-api abort behaviour was not run. It follows from identical code.
- Mutation-path aborts were not run (code-traced only).
- Whether the solver or relay log `x-request-id`, and whether Cloudflare forwards it to the origin. Those services are outside our repos.
- Support for `AbortSignal.any` and `crypto.randomUUID` in React Native and older browsers.
- Wasted quote requests and solver latency. POSTs to SODAX APIs were out of scope.
- sdk-10 prototype limits: it ran against the rc.17 dists only, not against `@sodax/sdk`; `new Sodax({ fetch })`, solver and relay fixtures and the `./testing` subpath build were not prototyped; `exactOptionalPropertyTypes` was off, as in the repo. The check without `@types/node` covered `fakes.ts` and `negative.ts` only, because `run.ts` imports `node:assert`.
- No prototype was built for signed config or on-chain token verification.
- The rc.2–rc.18 `initialize()` path was traced in code and checked against one live GET of `/v1/be/config/all`; no rc.12 client was run. If that route's `version` ever reached 200–216, those releases would try to apply a body that has no `config` field [code-traced; outcome not run].
- The verifier re-ran the CORS preflights on prod only, not on canary.
- npm downloads include mirrors and CI.
- Latency was measured from one location.

## Resume notes

Scratch directory: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-runtime/` (written `S` below).
Finish-pass scratch: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-sdk-runtime/` (written `W` below).
Verification scratch: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-sdk-runtime/` (written `V` below): `V/proto/` (prototype copy plus `src/verify-checks.ts`, `tsconfig.nonode*.json`, `neg/`), `V/scripts/` (`iface-members.cjs`, `ctor_snapshots.py`, and copies of `measure-config.mjs`, `token-delta.mjs`, `probe-sdk8-swapservice.mjs`), `V/tagsrc/`, `V/dl-v1config/` and `V/dl-cors/`.

- **Done in the finish pass (2026-10-19):** the sdk-10 typed-fake and fake-fetch prototype (`W/sdk10-proto/`, `W/neg-check/`, output `W/proto.out`); the `SolverIntentErrorCode.UNKNOWN` sites (6 by name; the verification pass found 2 more written as `-999`); the `SpokeExecActionParams` definition and its 12 users. Results are in the sdk-8 and sdk-10 sections.

- **sdk-8.**
  - **Outputs:**
    - `S/scripts/probe-sdk8.mjs` with its output in `S/probe-sdk8.out`;
    - `S/scripts/probe-sdk8-swapservice.mjs`;
    - `S/scripts/inventory.py` (`-v` lists sites);
    - `S/scripts/dappkit_hooks.py`;
    - `S/dl-cors/`.
  - **Next:**
    - optional: run P1 against `@sodax/bridge-api` and a mutation (`submitTx` with a valid intent). It would not change a score.
- **sdk-9.**
  - **Outputs:**
    - `S/dl-config/` (live JSON and headers);
    - `S/scripts/{analyze_config,trust_fields,trust_surface}.py`;
    - `S/scripts/measure-config.mjs` with `S/bundle-config/`;
    - `S/scripts/brotli-data.mjs`;
    - `S/scripts/token-delta.mjs` with `S/tagsrc/`;
    - `S/scripts/classify_commits.sh` with `S/listing-commits.txt`;
    - `S/dl-npm/`.
  - **Next (optional; the verdict stays "Needs a decision" whatever they show [judgement]):**
    - prototype the on-chain check: `assets(chainId, spoke)` for 5 new tokens, through viem against Sonic;
    - prototype the signed-config size and verify cost.
- **sdk-10.**
  - **Outputs:** `S/scripts/consumer_test_mocks.py`; `W/sdk10-proto/` (re-run: `<t2probe>/node_modules/.bin/tsc -p W/sdk10-proto/tsconfig.json`, then `node --experimental-strip-types W/sdk10-proto/src/run.ts`).
  - **Next (optional, no score depends on it):** prototype `new Sodax({ fetch })` once the option exists, and solver and relay fixtures.

## Verification (2026-10-19)

An adversarial pass over this report. Scratch: `V` in Resume notes.

**What was checked**
- **Citations:** 43 citation groups opened. 29 are in sodax-sdks at `0181a053`, and 14 are in the consumers at the cited commits, which are still the remote heads (`gh api …/commits/<branch>`). All matched, except `ConfigService.ts:176-181`, which now reads `171-177`.
- **Numbers:** 35 number groups re-derived by command.
  - sdk-8: the inventory (34, 8, 8/7/1/1/14, 20, 9, 7, 11), 87 methods (all take `RequestOverrideConfig`), 31 client methods, dapp-kit hooks (128/61/7/47/14, 0 signals), 12 `SpokeExecActionParams` users, 141/38/11 commits, 82 issues, the `UNKNOWN` sites.
  - sdk-9: live config size and token counts, the trust surface (all categories), the bundle table and the token-delta table (both re-run with identical output), 142/29/18 commits, release ranges, npm shares, `CONFIG_VERSION` and `initialize()` at all 40 tags, the frontend export counts (52/10/8/6), the constructor lower bound.
  - sdk-10: 196 test files, 44 casts in 22 files and their split, 0 `satisfies`, 49 stubs, `fetch` injections, mocking counts, dapp-kit 53/18/40, consumer test counts, interface members, prototype line counts (151/45/268), 60 `.d.ts`, 17 schemas.
- **Probes re-run:**
  - the sdk-10 prototype (tsc, `run.ts`, negative checks), plus two new checks: the any and coverage check, and a run without `@types/node`;
  - P3b, at 9 ms and 4,005 ms;
  - CORS preflights for 9 prod routes at 11:51 UTC;
  - one GET of `/v1/be/config/all`.
- **GitHub, read-only:** #390, #543 (author and assignee), and PRs #483, #509, #511, #512 and #523 (state and touched files).

**What changed, and why**
- **sdk-9 `initialize()` history.** "Every installed release ships the no-op `initialize()`" was false. 2.0.0-rc.2…rc.18 fetch `/v1/be/config/all` and reject its `version: 27`, and the whitelabel's rc.12 is one of them. The conclusion that no release applies remote config still holds, for a different reason. Fixed in the summary, Versions, Consumers, the partner-guidance line and Corrections.
- **sdk-9 complexity, C4 → C5.** The rubric rates "risk on paths that move funds" C5. This section's own top risk is remote addresses on deposit paths, and the fresh data source is cross-repo.
- **sdk-8 complexity, C4 → "C4 (C5 once signals reach the action flows)".** The loop and action-param signals sit on fund-moving flows, which is this section's own top risk 1. The request-level work stays C4.
- **sdk-10 confidence, Proven → "Code-traced (typed fakes and fake `fetch` Proven)".** `new Sodax({ fetch })` and the subpath build were not prototyped, and the subpath build carries the top risk. The label now follows the other two rows. The table timing now says 3.0 for wallet fakes, as the Recommendation does.
- **Counts corrected:**
  - `UNKNOWN` sites: 6 → 8. Two are written as `-999`.
  - Release ranges with a listing commit: 10 → 9.
  - `fetch` injections: 14 → 12. The 2 dapp-kit hits were error strings.
  - Interface members: 4–10 → 5–11, and the fakes omit the optional `getPublicKey` on 7 interfaces.
  - Mocking counts are now labelled as lines.
  - sdk-8 size: 1.3k → 1.2k LOC at the top, which is the sum of the breakdown.
  - Token counts are now marked as unique.
- **Calibration:**
  - Removed "can never be newer", "can only be raced", "cannot be cancelled" and "can only be type-checked".
  - Scoped "no independent token registry" to sodax-backend, and the request-ID reach to browsers.
  - Replaced "excluded by hand" with a command.
  - Tagged the frontend retry motive and the trust-impact sentence as judgement.
  - Fixed the whitelabel benefit line, which counted tokens that any upgrade brings anyway.
  - Labelled P2a/P2b and P4a/P4b.
  - Named the t2probe build that the probes ran on.
  - Closed the "not tried without `@types/node`" gap.

**What remains judgement**
- All LOC and point estimates.
- sdk-8's B3, which rests on 4 issues in 90 days and three consumer workarounds, and sdk-9's "B3 combined".
- Reading the rubric's funds clause as C5 for sdk-8's flow signals and for sdk-9.
- The trust-option trade-offs, and the class filter behind "4 of 82 issues".

**Residual doubts**
- Other area reports seem to rate fund-path risk below C5: dk-2 is C4, and sdk-7's Bitcoin track is "a further C3 on a fund-moving path". So the C5 readings here may not match across areas until the funds clause is applied the same way everywhere.
- Canary CORS, the as-served sizes and the latencies rest on the earlier agent's unsaved outputs. Only one preflight header file was kept, and prod CORS was re-run.
- The frontend's "26 files" has no recorded export set. An 8-name grep finds 28.
- The 16-file constructor lower bound has no recorded command. The verifier's heuristic finds 19.
- The rc.2–rc.18 outcome is code-traced, not run.
