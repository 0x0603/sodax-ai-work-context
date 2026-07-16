---
type: plan
repo: sodax-backend
github: 268
related_issues: [255, 269]
tags: [bridge-api, backend, swaps-api, leverage-yield, colocate, drainer]
status: Active
updated: 2026-07-15
---

# Bridge-API Backend — Implementation Plan (GitHub issue #268, sodax-backend)

> Status: PLAN ONLY — no code. Reader-grounded; every mirror cites the swaps-api / leverage-yield precedent it copies. The SDK client side (issue #255, PR #261, `sodax.api.bridge.*`, 7 routes, dapp-kit hooks, demo `/bridge-api`) is already DONE — this plan covers ONLY the backend, which currently does not exist.

---

## 0. Architecture decision (DECIDE FIRST — the fork that shapes everything)

The whole plan hinges on one choice: **a new `apps/bridge-api` app vs. a bridge module colocated inside `apps/swaps-api`.** Issue #268's body recommends a new app on port 3009 with full swaps-api parity. Context-repo Decision #1 (2026-06-30) and milktea's leverage-yield precedent (PR #928, `origin/fix/leverage-swap-api`) both point the other way.

### Option A — NEW app `apps/bridge-api` on port 3009 (issue #268's stated recommendation)

Everything a new app must **duplicate**, none of which carries bridge-specific value:

| Duplicated artifact | Reader evidence |
| --- | --- |
| `main.ts` (CORS `*`/helmet/AllExceptionsFilter/CustomValidationPipe/Swagger bootstrap) | `apps/swaps-api/src/main.ts:50-95` |
| `app.module.ts` shell (Cache/Redis, Mongo default + `STATEFUL_CONNECTION_NAME`, Schedule, EventEmitter, Throttler, `SharedServicesModule`, `IncidentManagerModule`, `RuntimeFlagsModule`, global `BigIntGuardInterceptor`, middleware chain) | `app.module.ts:29-113` |
| `config/*` (configuration.ts, config.class, config.service), `logger/*`, `runtime-flags.ts` | `configuration.ts:23,34`; `runtime-flags.ts:12` |
| Shared guards/pipes/interceptors/middleware (`HaproxyThrottlerGuard`, `AdminTokenGuard`, `IPGuard`, `ValidationPipe`, `BigIntGuardInterceptor`, HttpLogger/RequestContext/Prometheus middleware) | `shared/guards/*`, `shared/pipes/*`, `app.module.ts:97,112` |
| `api/health/*` + `api/prometheus/*` (liveness/readiness/metrics) | `app.module.ts` |
| `sodax.provider.ts` (a **second** Sodax singleton, Mongo + Redis pool, runtime container) | `sodax.provider.ts:9-50` |
| Dockerfile target | `Dockerfile:86-93` |
| docker-compose service (~40 lines: build target, env, ports, healthcheck, volumes, depends_on) | `docker-compose.yml:185-224` |
| Makefile `run-dev-bridge-api` target | `Makefile:127-129` |
| `.env-example` — new `BRIDGE_API_PORT` block + `RUN_BRIDGE_API` flag | `.env-example:194-204` |
| Monitoring registration `SERVICES_TO_MONITOR += sodax-bridge-api` | `.env-example:492` |
| **NEW HAProxy `/bridge` route** — external infra, plus an **SDK config change** (see below) | leverage doc lists HAProxy `/v1/<domain>/*` as still-owed |

### Option B — COLOCATE a `bridge` module inside `apps/swaps-api` (Decision #1 + milktea leverage precedent)

Two parts, exactly mirroring how leverage-yield was added:

1. **Read/intent-building module** — `src/api/bridge/` (controller + service + DTOs) that does `imports:[SwapsModule]` and gets the configured Sodax SDK instance (`sodax.bridge.*`), shared DTOs, error-mapper, pipes, and guards for free. This is a **1:1 structural copy** of leverage-yield's colocation recipe (`apps/swaps-api/src/api/leverage-yield/` — module 24 lines, `@Module({ imports:[SwapsModule], … })`, registered with a 2-line diff in `app.module.ts`; evidence: `git diff development origin/fix/leverage-swap-api -- apps/swaps-api/src/app.module.ts` = exactly 2 added lines).

2. **NEW submit pipeline** — `src/tasks/submit-bridge-txs/` drainer + `stateful_submit_bridge_tx` collection + own db-service. **This is the part bridge canNOT reuse the way leverage did.** Leverage got the submit-tx pipeline + drainer for free because "a vault swap tx IS a swap tx" — identical solver relay→postExecution→getStatus→solved lifecycle, and the drainer `submit-swap-txs.task.ts` has **zero** `operation`/leverage branches (verified: `git show origin/fix/leverage-swap-api:…/submit-swap-txs.task.ts | grep operation|leverage` → NO matches). Bridge's relay-only submit machine is a **different lifecycle**, so the leverage discriminator-on-shared-collection trick does not transfer. Bridge reuses only tiers 1–2 (SODAX SDK instance, shared DTOs/mappers/guards) and forks its own collection + relay-only drainer + db-service.

Colocation cost: ~3 lines in `app.module.ts`, 1 line in `main.ts` (Swagger `include:[SwapsModule]` array → add `BridgeModule`, `main.ts:87-89`), 2 config flags, plus the bridge-specific business files that are **identical work under either architecture**.

### RECOMMENDATION: **Option B (colocate).**

Reasoning:

- **The SDK already routes `/bridge/*` on the shared base host.** `resolveBridgeApiConfig` is an **alias of `resolveBaseApiConfig`** (`backendBridgeApiV2.ts:14-21` header "served on the shared swaps host"; `BridgeApiService.ts:93-97` "Bridge API shares the swaps host") — same baseURL/port 3008/HAProxy backend as swaps. Colocation makes the shipped SDK client work **out of the box with no SDK change**. A new app on port 3009 forces an **SDK "S1" config fix** (`resolveBridgeApiConfig` must stop aliasing the base host) **plus a new HAProxy route** — net new work with zero product benefit.
- **Same Sodax singleton already exposes `sodax.bridge`.** `Sodax.ts:33,100-105` builds `this.bridge = new BridgeService(...)` on the same facade `sodax.provider.ts` already constructs. A second app means a second SDK instance + Mongo/Redis pool for a 7-route surface.
- **Fresh in-repo precedent.** Milktea's PR #928 just did exactly this for a comparably-sized SDK domain; following the established pattern lowers review/onboarding cost.
- **Context Decision #1** explicitly chose "one `@Controller('bridge')` in the swaps app."
- **#268's product-separation argument was already litigated and rejected once**: #269 made the same "separate app" argument for leverage-yield and it was rejected in favor of colocation. Same shape of decision, same answer.

**⚠️ This diverges from #268's WRITTEN recommendation (new app, port 3009).** Confirm with the team before P1 (see §5). **The rest of this plan ASSUMES Option B** and flags every Option-A-only extra file inline.

---

## 1. Phasing

**P0 — gate the shape (no code until resolved).**
- Confirm Option A vs B + host/port with the team (diverges from #268).
- Confirm **terminal semantics**: success = `status==='executed' && result.dstIntentTxHash` (destination delivery, NOT just hub-executed); failure = `status==='failed' || abandonedAt`. Confirm `dstIntentTxHash` is populated only on destination settlement.
- Confirm **split-tx** handling: Solana/Bitcoin need an off-chain `{address, payload}` data payload at relay submit — affects submit DTO, persistence, idempotency key.

**P1 — discovery/read + intent-building module** (the 6 non-durable routes: `GET /bridge/tokens`, `GET /bridge/tokens/:chainKey`, `POST /bridge/allowance/check`, `POST /bridge/approve`, `POST /bridge/intents`; standalone value; mirrors the leverage colocation exactly).

**P2 — submit pipeline** (`POST /bridge/submit-tx` + `GET /bridge/submit-tx/status`, `stateful_submit_bridge_tx` collection, relay-only ~2-step drainer, alerter, heartbeat).

**P3 — ops + docs + tests** (admin re-relay/mark-addressed, healthz label, prometheus, monitoring registration, `bridge-api-sdk-mapping.md`, unit + e2e).

---

## 2. File-by-file work list

Paths assume **Option B** (`apps/swaps-api/src/api/bridge/…`). Under Option A, substitute `apps/bridge-api/src/…` and add the whole shell from §0 Option A.

### P1 — read + intent-building module

| Path | Action | What it does | Mirrors (evidence) |
| --- | --- | --- | --- |
| `api/bridge/bridge.module.ts` | create | `@Module({ imports:[SwapsModule], controllers:[BridgeController], providers:[BridgeService, HaproxyThrottlerGuard], exports:[BridgeService] })` — gets `SODAX` token via `SwapsModule` exports. **Unlike leverage**, also registers bridge's OWN submit-tx collection `forFeature` on `STATEFUL_CONNECTION_NAME` (added in P2). | `leverage-yield.module.ts` (24-line template); `swaps.module.ts:33` exports `SODAX`; `swaps.module.ts:16-19` forFeature on stateful conn |
| `api/bridge/bridge.controller.ts` | create | `@Controller('bridge')` + `@ApiTags`; 7 routes implementing `IBridgeApiV2` (`backendBridgeApiV2.ts:239-254`). `CacheInterceptor`/`CacheTTL` on token reads; `HaproxyThrottlerGuard` + `@Throttle({default:{ttl:60_000,limit:10}})` on submit-tx (match `/swaps/submit-tx`). Every handler funnels through `handleSwapsError`; `ParseHexHashPipe` on hash params. | `swaps.controller.ts`; `leverage-yield.controller.ts` (@Controller pattern, try/catch → handleSwapsError) |
| `api/bridge/bridge.service.ts` | create | `@Inject(SODAX) sodax`. Delegates: allowance/check→`sodax.bridge.isAllowanceValid` (`BridgeService.ts:252`); approve→`sodax.bridge.approve` (must `stringifyBigInts` the `RawTxReturnType` tx before return — see gotchas); intents→`sodax.bridge.createBridgeIntent` (`:558`, returns `{tx,relayData}`, **no intent struct**, `raw:true`); tokens→derived from `sodax.bridge.config.getSupportedSwapTokens()/…ByChainId` projecting `XToken`→`BridgeTokenV2` (`ConfigService.ts:262-267`; `tokens.ts:23-32` — `XToken` already carries `symbol/name/decimals/address/chainKey/hubAsset/vault`). | `swaps.service.ts:77-83,164-190`; `leverage-yield.service.ts` domain-call pattern (`sodax.leverageYield.*`) |
| `api/bridge/dto/*` | create + reuse | **Reuse verbatim by import** from `../swaps/dto/`: `AllowanceCheckResponseDto`, `ApproveResponseDto` (leverage reused these). **New bridge DTOs**: `CreateBridgeIntentParamsDto` (allowance/approve/intents share it — maps `CreateBridgeIntentParamsV2`→`BridgeParams`), `BridgeTokenResponseDto` (`BridgeTokenV2`), `CreateBridgeIntentResponseDto` (`{tx,relayData}`, no intent). Reuse `ZERO_ADDRESS` from `../swaps/constants`, `IsDecimalString` from `../../shared/validation/decimal-string`. **NO `partnerFee` DTO, NO `deadline`** (bridge fee is config-driven, `ConfigService.bridgePartnerFee`, `BridgeService.ts:162`; no per-request fee → no `/bridge/fees` route). | leverage `dto/create-intent.dto.ts`, `dto/quote.dto.ts`, `dto/vault.dto.ts`; shared `../swaps/dto/*` |
| `app.module.ts` | modify | Register `BridgeModule` in `imports:[]` right after `SwapsModule` (~2 lines, exactly leverage's diff). | `git diff … app.module.ts` = 2 added lines |
| `main.ts` | modify | Add `BridgeModule` to Swagger `include:[SwapsModule]` array so `/bridge/*` appears in `/docs` (1 line). | `main.ts:87-89` |

### P2 — submit pipeline (bridge-specific NEW code — the part that does NOT reuse swaps)

| Path | Action | What it does | Mirrors (evidence) |
| --- | --- | --- | --- |
| `api/bridge/schemas/stateful-submit-bridge-tx.schema.ts` | create | Queue doc for the NEW `stateful_submit_bridge_tx` collection. **KEEP**: `txHash`, `srcChainKey`, `walletAddress` (relay envelope address), `relayData` (the split-tx `{address,payload}`), `status` (enum `pending\|relaying\|relayed\|executed\|failed`), `failedAtStep`, `failureReason`, `processingAttempts`, `lastAttemptAt`, `abandonedAt`, `alertedAt`, `addressedAt/By/Reason`, `result{dstIntentTxHash, packetData}`. **DROP**: intent subdoc, `postExecutionAttempts`, `relayedForRefundAt`, the whole solver sidecar (`lastSolverStatusCode/At`, `lastSolverOkAt`, `lastSolverPollError`, `solverPollErrorSince`, `stuckAlertedAt`), `result.intent_hash/fillTxHash`. **Indexes**: keep unique `{txHash,srcChainKey}`, `{status,processingAttempts,lastAttemptAt,createdAt}`, `{processingAttempts,abandonedAt}`, partial `{abandonedAt}`; DROP partial `{solverPollErrorSince}` + `dstIntentTxHash/intentId` lookup indexes. Bridge module is **sole writer**. | `schemas/stateful-submit-swap-tx.schema.ts:25-33,129-158,160-188,204-227,234-261` |
| `api/bridge/types/submit-bridge-tx.ts` | create | Status union `pending\|relaying\|relayed\|executed\|failed` (`SubmitBridgeTxStatusV2`, `backendBridgeApiV2.ts:178`), row type `ISubmitBridgeTx`, result `{dstIntentTxHash, packetData}`. Reuse `IPacketDataDomain`/`PacketDataStatus` (`'pending'\|'validating'\|'executing'\|'executed'`) verbatim. DROP `SolverPollSignal` + sidecar fields. | `types/submit-swap-tx.ts:20,35-46,48-55,132`; `packet-data.schema.ts:5` |
| `api/bridge/dto/submit-bridge-tx.dto.ts` | create | Insert DTO: `txHash`, `srcChainKey`, `walletAddress`, `relayData` (Hex, **required** — the split-tx payload) + bridge params (`dstChainKey/token/amount/recipient` for observability). **DROP nested `IntentDto`** (bridge has no intent.creator to rebuild the relay address, so the client must send it — `backendBridgeApiV2.ts:138-147`). Response DTO `{status:'inserted'\|'duplicate'}` reused as-is. | `dto/submit-tx.dto.ts:8-70` |
| `api/bridge/submit-bridge-tx-db.service.ts` | create | CRUD for the bridge collection. **KEEP**: `findOrUpsertSubmitBridgeTx` (idempotent upsert by `{txHash,srcChainKey}`, `$setOnInsert`, dup-key→`duplicate`), `exists`, `getToProcess` (status `$in [pending,relaying,relayed]`, `abandonedAt` absent, `processingAttempts<MAX`, backoff — minus solver states), `claimForProcessing` (`$inc` crash-safe), `getNewlySaturated`, `markAbandoned`, `getAbandonedUnalerted`, `markGivenUpAlerted`, `markAddressed/unmarkAddressed`, `updateStatus`, `getBridgeTxStatus`. **DROP**: `keepAwaitingSolver`/`recordSolverPollOk`/`getStuckPostedExecution`/`markStuckAlerted`, `recordPostExecution`, `markRelayedForRefund`/`markManuallyPostedToSolver`, intent-journal user-hint helpers. **Flip `NON_TERMINAL_SUCCESS_FILTER` from `{$ne:'solved'}` → `{$ne:'executed'}`** (load-bearing — see gotchas). Cannot delegate to `SubmitSwapTxDbService` (writes the swaps collection). | `submit-tx-db.service.ts:43,85-100,275-313,322-327,466-505,514-536,547-568,570-646` |
| `api/bridge/relay-bridge-tx.ts` | create | `sodax.swaps.submitIntent` (idempotent by `tx_hash`) + `waitUntilIntentExecuted({intentRelayChainId, srcTxHash, timeout, apiUrl: relayerApiEndpoint})` → `PacketData` whose `.status` reaches `'executed'` (generic packet relay, not swap-specific). Keep split-tx branch (`isSolanaChainKeyType\|\|isBitcoinChainKeyType` requires `relayData`) but **read the envelope address from the bridge row field, not `intent.creator`**. Return `[dstIntentTxHash, packetData]`. (If SDK exposes a `sodax.bridge` relay path / `relayTxAndWaitPacket`, prefer it — flow identical.) | `relay-swap-tx.ts:58,59-69,76-88,93-121`; `BridgeService.ts:5` (`relayTxAndWaitPacket` import) |
| `tasks/submit-bridge-txs/submit-bridge-txs.task.ts` | create | Own drainer. **Reuse the shell verbatim**: tick guard + lease (`tryAcquireModelLease` on the BRIDGE model) + heartbeat + `pendingKick` + shutdown-drain; `processBatches` + per-batch lease-renew + `Promise.allSettled` + claim-first. **Replace pipeline body** with the 2-step relay-only machine: `pending/relaying` → `relayBridgeTx` (`submitIntent`) → persist `relayed` → poll `waitUntilIntentExecuted`/packet status → `executed` (`packetData.status==='executed'`, TERMINAL) \| `failed`. **DROP** `postToSolver`/`resolveSolverStatus`/`resolveNotFound`/`markSolvedFromJournal`/`handleExpiredTerminal`/`relayForRefund`/`classifyTerminallyUnprocessable`. Classify errors via `isTransientSubmitError`; wrap EVERY SDK call in `withTimeout`. **Base it on CURRENT `development` drainer, NOT this branch's in-flight concurrency refactor.** | `submit-swap-txs.task.ts:166-241,248-341` (shell KEEP); `:404-476,494-540,564-682,751-871` (solver/refund DROP) |
| `tasks/submit-bridge-txs/submit-bridge-tx-alerter.task.ts` | create | KEEP the 2-phase give-up alerter (`getNewlySaturated`→`markAbandoned`→`getAbandonedUnalerted`→raise `BRIDGE_SUBMIT_GIVE_UP`→`markGivenUpAlerted`), incl. the `nonPageable` `addressedAt` filter. DROP Phase-3 `alertStuckPostedExecution` + cause-marker machinery (no solver sidecar → a never-executed packet saturates the attempt cap and abandons naturally). | `submit-swap-tx-alerter.task.ts:104-204` (KEEP), `:243-309` (DROP) |
| `tasks/submit-bridge-txs/submit-bridge-tx-heartbeat.service.ts` | create | Verbatim except `LABEL = TaskLabel.BRIDGE_SUBMIT_TX`. Reuses `TaskExecutorHeartbeat` model on the **LOCAL default connection** (not stateful — mirror exactly, #880). | `submit-swap-tx-heartbeat.service.ts:42,57-100` |
| `tasks/submit-bridge-txs/constants.ts` | create | KEEP `MAX_TO_PROCESS`/`BATCH_SIZE`, submit-intent timeout analog, lock TTL, alerter interval, abandon grace, `STATEFUL_LOCK_MANAGER` token, give-up cause marker. DROP `MAX_POST_EXECUTION_ATTEMPTS`, `SOLVER_STATUS`, `SOLVER_*_REASON`, get-status/post-execution timeouts, `SWAP_STUCK_*`, `BACKEND_API_LOOKUP_TIMEOUT_MS`. | `constants.ts:42,98,101,111,122,142,160-166` |
| `tasks/submit-bridge-txs/submit-bridge-txs.module.ts` | create | Wire the task + alerter + heartbeat. Reuse the `STATEFUL_LOCK_MANAGER` `useFactory` binding `LockManagerService` to the stateful-connection locks model, but keyed by the **BRIDGE model** (independent lease, shared locks collection). Import `BridgeModule` (bridge model + SODAX). **DROP `IntentJournalApiClient` provider.** Gate on `RUN_SUBMIT_BRIDGE_TXS_TASK`. | `submit-swap-txs.module.ts:17,28,40-44` |
| `app.module.ts` | modify | Register `SubmitBridgeTxsModule` in `imports`; add `RUN_SUBMIT_BRIDGE_TXS_TASK` to `getSwapsApiRuntimeFlags`. | `app.module.ts:29-48` |
| `config/runtime-flags.ts` + `config/configuration.ts` | modify | Add `resolveBooleanFlag('RUN_SUBMIT_BRIDGE_TXS_TASK', false)` + env parsing. **[Option A only]** also add `BRIDGE_API_PORT` (3009) + `RUN_BRIDGE_API`. | `runtime-flags.ts:12`; `configuration.ts:23,34` |
| `packages/shared-enums/src/enums/enums.ts` | modify | Add `CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX = 'stateful_submit_bridge_tx'` (near `:202`) + `TaskLabel.BRIDGE_SUBMIT_TX` (near `:263`). Bridge is an action-taker → **exclude from PAUSABLE tasks** (like `SWAPS_SUBMIT_TX`, `:270`). | `enums.ts:202,248-263,270` |
| `packages/incident-manager/src/constants.ts` + `playbook.ts` | modify | Add `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP` (`constants.ts:35`) + `ALERT_ONLY_PLAYBOOK` entry `{anchor: CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX}` (`playbook.ts:178-180`). | `constants.ts:35`, `playbook.ts:178-180` |

### P3 — ops, docs, tests

| Path | Action | What it does | Mirrors |
| --- | --- | --- | --- |
| `api/admin/bridge-admin.controller.ts` + `bridge-admin.service.ts` | create (optional) | `mark-addressed` reused near-verbatim (`AdminTokenGuard`). Manual re-relay collapses to **relay-only** (submit + poll to `executed`), NO post-execution/Situation-A/B. | `swaps-admin.service.ts:87-266,279-327` |
| `docs/bridge-api-sdk-mapping.md` | create | One-row-per-route endpoint→SDK-call table (handler \| service method \| `sodax.*` call) + "Why colocated in swaps-api" + "Design split" + "Row shapes" sections. | `docs/leverage-yield-api-sdk-mapping.md` |
| `CLAUDE.md` (sodax-backend) — Collection Write Ownership table | modify | Add row: `stateful_submit_bridge_tx` → sole writer = swaps-api (bridge module). | sole-writer invariant |
| `apps/swaps-api/test/**` (unit + e2e) | create | Mirror swaps layout. **e2e must assert bridge re-relay idempotency** — the gate before `useBackendSubmitTx` flips ON. | swaps test layout |
| **[Option A only]** `Dockerfile`, `docker-compose.yml`, `Makefile`, `.env-example`, `apps/monitoring-service`, HAProxy `/bridge` route, SDK `resolveBridgeApiConfig` fix | mirror | The full duplication list from §0 Option A. **All avoided under Option B.** | `docker-compose.yml:185-224`, `Dockerfile:86-93`, `Makefile:127-129`, `.env-example:194-204,492` |

---

## 3. Key implementation notes / gotchas

- **Terminal semantics are load-bearing.** Success = `status==='executed' && result.dstIntentTxHash` (destination delivery, not hub-executed); failure = `status==='failed' \|\| abandonedAt` (`backendBridgeApiV2.ts:17,181`). The packet-poll step terminates on `packetData.status==='executed'` — swaps treats packet landing as merely `relayed` then hands to the solver; **bridge has no handoff, packet execution IS completion**.
- **Terminal-success rename must be applied EVERYWHERE.** Swaps guards every forward/abandon write with `NON_TERMINAL_SUCCESS_FILTER={$ne:'solved'}` (`submit-tx-db.service.ts:43,224,269,452,473,499,606`) and clears `failedAtStep`/`failureReason` only on the `'solved'` write (`:641-643`). Flip ALL to `'executed'`. Miss one → a completed bridge re-enters `getToProcess` and gets abandoned, or a terminal row's reason never clears.
- **Split-tx data payload.** For Solana/Bitcoin (`isSplitTxChain`), the relay submit needs `{address, payload}` (`relay-swap-tx.ts:59-69`). The payload must be **persisted at insert** and is **REQUIRED** in the submit DTO. A split-tx row with empty `relayData` is a permanent data error (consume to abandon), NOT retryable. **Idempotency key stays `(txHash, srcChainKey)`** — `relayData` is NOT part of the key (`findOrUpsert:88`, unique index `:234`).
- **Refund-vs-consume differs fundamentally from swaps.** Swaps must never abandon a live intent (solver fills async off-chain) so it refunds every poll. A bridge packet is delivered by the RELAYER; a packet that never reaches `executed` SHOULD saturate to abandon and page. So: refund only on transport/relayer-outage errors (`isTransientSubmitError`); **consume an attempt on a persistently-unexecuted packet**. Otherwise `waitUntilIntentExecuted` timeouts (classified transient, "timed out") refund forever and nothing ever pages. **Decide the packet-poll bound explicitly.**
- **Single-writer collection invariant.** `stateful_submit_bridge_tx` is a NEW collection; bridge module is its sole writer. Register it in the CLAUDE.md Collection Write Ownership table. Reuse the `STATEFUL_CONNECTION_NAME` shared-DB connection (`app.module.ts:80-93`) so both prod instances see one queue.
- **Drainer concurrency.** Single collection-wide Mongo lease via `tryAcquireModelLease(model, TTL, holderId)` keyed by the BRIDGE model → independent lease, same stateful locks doc-collection. Do NOT reuse the swaps model or the two drainers serialize against each other (see `docs/swaps-drainer-concurrency.md` / #837). Precondition: `STATEFUL_MONGO_*` must point at the shared DB, or the lease falls back to local and the task must run on only ONE deployment.
- **Heartbeat and lease live on DIFFERENT connections.** Lease on `STATEFUL_CONNECTION_NAME`; heartbeat writes `TaskExecutorHeartbeat` on the LOCAL default connection (#880). Mirror exactly or cross-deployment observability fragments.
- **`BigIntGuardInterceptor` is global and throws 500 on leaked bigint** (`app.module.ts:97`). `approve`/`intents` return `RawTxReturnType` (bigint-bearing). Wire type is decimal string; SDK client re-parses on receive (`backendBridgeApiV2.ts:10-12`). Bridge service **MUST run `stringifyBigInts` on `tx` before returning**, like `SwapsService.approve/createIntent` (`swaps.service.ts:179,189`).
- **No deadline, no solver, no intent journal.** Skip `isIntentDeadlineExpired` (`swaps.service.ts:195`), the expired-deadline 400 guard, and all solver-poll/posted_execution/getStatus/user-hint logic. Do NOT port `IntentJournalApiClient`, `toSdkIntent`, `getIntentHash`, `SOLVER_*` reasons.
- **`GET /bridge/tokens` has NO dedicated SDK getter** (the one gap). Derive from `sodax.bridge.config.getSupportedSwapTokens()/…ByChainId` and project `XToken`→`BridgeTokenV2` (every `XToken` already has `hubAsset`+`vault`). Do NOT use `getBridgeableTokens(from,to,token)` (`BridgeService.ts:979`) — that is PAIRWISE bridgeability, a different concept. Document the exact token universe (likely all vault-backed supported tokens).
- **`useBackendSubmitTx` stays default-OFF** (SDK ships OFF) until the bridge re-relay idempotency e2e assertion lands (P3 gate).
- **Back-compat: none needed** — new collection, no legacy rows, no migration.
- **Isolate the pattern from PR #928's noise.** That branch bundles an unrelated drainer-concurrency refactor (`claimNext`/`nextEligibleAt` visibility-timeout, `swaps-drainer-instance.schema`) and a status-union single-sourcing refactor. When mirroring, base the bridge drainer on the CURRENT `development` swaps drainer, not the in-flight refactor.

---

## 4. Local test-flow tie-in (the user's original goal)

Once P1 + P2 land, the full local test flow becomes runnable:

1. Build the SDK (`sodax-sdks`, branch `feat/bridge-api-v2`).
2. Link into backend via `pnpm pack` + name-based overrides (so `apps/swaps-api` resolves the local SDK build).
3. Run `swaps-api` locally (`make run-dev-swaps-api`) with `RUN_SUBMIT_BRIDGE_TXS_TASK=true` and the shared stateful Mongo pointed at a local instance.
4. Point the demo `/bridge-api` page `baseURL` at the local host.
5. Exercise create-intent → submit-tx → status.

- **Under Option B**, the demo `baseURL` is just the swaps-api host (port 3008) — the SDK's shared-host assumption (`resolveBridgeApiConfig = resolveBaseApiConfig`) is already correct, **no SDK change**.
- **Under Option A**, `baseURL` is the new 3009 host **and** the SDK needs the S1 fix so `resolveBridgeApiConfig` stops aliasing the base host.

---

## 5. Open questions for the team

1. **Architecture: A (new `apps/bridge-api`, port 3009 — #268's written reco) vs B (colocate in swaps-api — this plan's recommendation, matching Decision #1 + leverage precedent).** This plan assumes B and diverges from #268 — needs explicit sign-off. Confirm host/port and whether the shared-host SDK assumption is intended to stay.
2. **Terminal semantics**: confirm `dstIntentTxHash` is populated only on destination settlement (not hub-executed), and that success requires both `status==='executed'` AND a populated `dstIntentTxHash`.
3. **Split-tx**: confirm the exact chain list (Solana + Bitcoin), that the `{address,payload}` data payload is persisted at insert, and that it is NOT part of the `(txHash, srcChainKey)` idempotency key.
4. **Retry/abandon budgets**: reuse swaps' `MAX_SWAP_TX_RETRIES=3` / `SWAP_TX_RETRY_BACKOFF_MS=60_000`? And what packet-poll timeout bound (so timeouts consume rather than refund forever)?
5. **Rate-limit tier** on `/bridge/submit-tx` — match `/swaps/submit-tx` (`ttl:60_000, limit:10`)?
6. **Drainer lease (#837)**: confirm the shared stateful-locks lease pattern applies to the bridge collection (independent lease, same locks doc-collection, shared-DB precondition on `STATEFUL_MONGO_*`).
7. **Bridge partner fee**: is a `bridgePartnerFee` wanted in the backend Sodax config, or does `getFee` returning `0n` suffice (no `/bridge/fees` route either way)?
8. **Admin surface (P3)**: is the optional `bridge-admin` re-relay/mark-addressed controller in scope for v1, or deferred?