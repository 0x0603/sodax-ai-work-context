---
type: plan
repo: sodax-backend
github: 268
related_issues: [255, 269]
tags: [bridge-api, backend, option-a, new-app, swaps-api, drainer]
status: Active
decision: Option A — standalone apps/bridge-api on port 3009 (per Robi #268 structure)
updated: 2026-07-15
---

> Decision A-vs-B analysis archived in decision-analysis-a-vs-b.md. This is the committed Option A plan.

# apps/bridge-api — Final Implementation Plan (GitHub issue #268)

> Standalone new NestJS app wrapping `@sodax/sdk` `BridgeService` (relay-only, raw-tx mode) on port **3009**. Client side (SDK `sodax.api.bridge.*`, dapp-kit hooks, demo `/bridge-api`) is DONE on `feat/bridge-api-v2` / PR #261; this plan builds the backend that those 7 routes call.

---

## 0. Decision (settled) & reuse taxonomy

**Decision:** Option A — a brand-new `apps/bridge-api` workspace app, its own container/host on port **3009**, following Robi's issue structure. NOT colocated in `swaps-api` (that was milktea's leverage-yield precedent in PR #928 — we borrow its `api/<domain>/` module *shape* only, not its colocation). Confirmed `apps/bridge-api` does not exist yet (`ls apps/bridge-api` → not found; existing apps: api, data-aggregator, data-transformator, monitoring-service, sodax-backend-dashboard, stateful-api, swaps-api, task-executor).

**The real-work boundary — three buckets:**

| Bucket | Mechanism | Effort | Contents |
|---|---|---|---|
| **(1) `@repo/*` + `@sodax/sdk`** | `import` via `workspace:*` — shared source, **zero copy** | ~0 (just declare deps) | See below |
| **(2) swaps-api app-local shell** | Physically **copied** into `apps/bridge-api/src` (swaps-api is an app, not a package — nothing is importable) | Low — ~14 files verbatim/rename, ~9 files a mechanical logic delta | See §2 P1 |
| **(3) bridge-new** | **Authored** — no swaps analog to copy line-for-line | The genuine work | `api/bridge/*` feature module, submit pipeline, drainer/alerter, `relay-data.schema.ts`, cross-cutting enum/incident edits, infra, SDK S1 |

### Bucket 1 — `@repo/*` workspace reuse (imported, never copied)

Add these to `apps/bridge-api/package.json` `"workspace:*"` block (mirror `apps/swaps-api/package.json:42-47`) and import identically:

- **`@repo/shared-utils`** — `AllExceptionsFilter`, `RequestContextMiddleware`, `STATEFUL_CONNECTION_NAME`, `buildMongoConfig`, `safeStringifyWithBigInt`, `handleErrorAsHttpException/AndThrow/AndContinue`, `isDuplicateKeyError`, `NotFoundError`, `resolveBooleanFlag`, `createBatches`, `delay`, `intervalMsToCron`, `loadGenericNumberEnv/loadLogLevelEnv/stringToBoolean`, `MAX_SWAP_TX_RETRIES(=3)` + `SWAP_TX_RETRY_BACKOFF_MS(=60000)` (`shared-utils/constants.ts:18-19`).
- **`@repo/shared-services`** — `SharedServicesModule`, `RuntimeFlagsModule.forRoot`, `startDisabledModeHealthServer`, `LockManagerService` + `LockSchema` (drainer only).
- **`@repo/shared-logger`** — `createLogger`.
- **`@repo/shared-enums`** — `EnvType`, `CollectionNames`, `TaskLabel` (also **edited** — see bucket 3).
- **`@repo/shared-schemas`** — `TaskExecutorHeartbeat` model (drainer heartbeat only; **conditional**).
- **`@repo/incident-manager`** — `IncidentManagerModule/Service` (alerter give-up only; **conditional**).
- **`@sodax/sdk`** — `Sodax` exposing `readonly bridge: BridgeService` (`dist/index.d.ts:16868-16872`); `BridgeService.isAllowanceValid/approve/createBridgeIntent` (`BridgeService.ts:182/252/558`); `sodax.bridge.config.getSupportedTokensPerChain` (`ConfigService.ts:250`); `waitUntilIntentExecuted`, `isSolanaChainKeyType/isBitcoinChainKeyType`, `DEFAULT_RELAY_TX_TIMEOUT`.

`@repo/incident-manager` and `@repo/shared-schemas` are **conditional** — imported only if the persisted relay queue + drainer is kept (this plan keeps it; see §1). A pure synchronous passthrough would drop both.

### Bucket 2 — copied swaps-api shell (see §2 P1 for per-file deltas)

`main.ts`, `app.module.ts`, `app.controller.ts`, `app.service.ts`, `config/{configuration,config.module,config.service,runtime-flags}.ts`, `shared/class/config.class.ts`, `shared/providers/sodax.provider.ts`, `logger/logger.ts`, `api/health/*`, `api/prometheus/*`, `shared/{pipes,interceptors,middleware,guards,validation}/*`, `shared/utils/utils.ts` (partial), `test/vitest.setup.ts`, and tooling (`package.json`, `nest-cli.json`, `tsconfig*.json`, `vitest*.config.ts`, `biome.json`, `example.env.dev`, `README.md`).

### Bucket 3 — bridge-new (the genuine work)

`api/bridge/**` (controller/service/dtos/schemas/types/db-service/relay/mappers/error-mapper), `tasks/submit-bridge-txs/**` (task/alerter/heartbeat/constants/module), `api/admin/bridge-admin/**`, cross-cutting enum + incident edits, root infra edits, and the SDK S1 config fix in `sodax-sdks`.

---

## 1. Phasing

For a NEW app, P1 is the entire runnable shell plus the stateless routes — a developer can `curl` it before any persistence exists.

- **P0 — Gate (no code):** resolve Robi open questions in §6 that block schema/route shape: terminal semantics (`dstIntentTxHash`), split-tx chain list + idempotency key, the production bridge host/prefix for SDK S1, retry/abandon budgets. Confirm bridge is **relay-only with a persisted async submit queue** (this plan assumes yes, mirroring swaps' drainer; a pure passthrough collapses P2).
- **P1 — Scaffold + discovery (runnable shell):** copy the whole bucket-2 shell, retarget to bridge, boot on 3009 with `/healthz` green + Swagger up. Wire the `api/bridge` feature module with the **5 stateless routes**: `GET /bridge/tokens`, `GET /bridge/tokens/:chainKey`, `POST /bridge/allowance/check`, `POST /bridge/approve`, `POST /bridge/intents`. These delegate straight to `sodax.bridge.*` / config — no Mongo needed yet.
- **P2 — Submit pipeline (persistence):** add `CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX_V2`, the `stateful-submit-bridge-tx` schema + `relay-data.schema.ts`, `SubmitBridgeTxDbService`, the 2 stateful routes (`POST /bridge/submit-tx`, `GET /bridge/submit-tx/status`), and the relay-only drainer (`relay-bridge-tx.ts` + `submit-bridge-txs.task.ts`).
- **P3 — Ops / docs / tests / SDK:** alerter (`BRIDGE_SUBMIT_GIVE_UP`) + heartbeat (`BRIDGE_SUBMIT_TX`), `bridge-admin`, unit + e2e tests, root infra (Dockerfile/compose/Makefile/env/monitoring), `CLAUDE.md` write-ownership row, `docs/bridge-api-sdk-mapping.md`, and the **SDK S1** change in `sodax-sdks` (`apiConfig.ts` + `constants.ts`).

---

## 2. File-by-file work list (grouped by phase)

Classification legend: **VERBATIM** / **RENAME** (identity strings only) / **LOGIC** (keep-drop delta) / **NEW** (authored) / **INFRA-EDIT** (existing shared/root file).

### P1 — Scaffold (bucket 2, tooling)

| File (`apps/bridge-api/…`) | Class | Mirrors | Delta |
|---|---|---|---|
| `package.json` | LOGIC | `swaps-api/package.json:2-4,42-48` | name `swaps-api`→`bridge-api`, description → "REST API wrapping @sodax/sdk v2 BridgeService (raw-tx mode)"; keep all `@repo/*` + `@sodax/sdk 2.0.0-rc.18` deps; `start:prod`=`node dist/src/main`. Keep `@repo/incident-manager`/`@repo/shared-schemas` (drainer kept). |
| `nest-cli.json` | VERBATIM | — | none |
| `tsconfig.json` / `tsconfig.build.json` | VERBATIM | — | `extends ../../tsconfig.json` unchanged |
| `vitest.config.ts` / `vitest.e2e.config.ts` | VERBATIM | — | none |
| `biome.json` | VERBATIM | — | none |
| `test/vitest.setup.ts` | LOGIC | `swaps-api/test/vitest.setup.ts:24-27` | keep `loadGenericNumberEnv`+`buildMongoConfig` stubs; keep `buildStatefulMongoConfig` stub **iff** stateful conn kept (kept here). |
| `example.env.dev` | LOGIC | swaps `example.env.dev` | `RUN_SWAPS_API`→`RUN_BRIDGE_API`, `SWAPS_API_PORT=3008`→`BRIDGE_API_PORT=3009`; DROP `SOLVER_CONFIG` sample; `MONGO_DB=sodax-swaps`→bridge db; keep `RPC_CONFIG`, redis/mongo, admin/IP. |
| `README.md` | LOGIC | `swaps-api/README.md` | rewrite for bridge; remove SOLVER_CONFIG section; keep RPC_CONFIG template; add RELAY_CONFIG if used. |

### P1 — Scaffold (bucket 2, `src` shell)

| File | Class | Delta (cite) |
|---|---|---|
| `src/main.ts` | LOGIC | **DROP** the ⚠️ TEMP DEV-ONLY Bound/RadFi `fetch` spoof (`main.ts:15-34`, marked "REMOVE before committing"). `RUN_SWAPS_API`→`RUN_BRIDGE_API`, `SWAPS_API_PORT`→`BRIDGE_API_PORT`, `SWAPS_API_SERVICE`→`BRIDGE_API_SERVICE`, `getSwapsApiRuntimeFlags`→`getBridgeApiRuntimeFlags` (`:40,44-48`). Swagger `setTitle('SODAX Swaps API')`→`'SODAX Bridge API'`, description `SwapService`→`BridgeService` (`:78-79`), `addServer('http://localhost:3008')`→3009 (`:83`), `include:[SwapsModule]`→`[BridgeModule]` (`:88`). Keep helmet/CORS/pipes/`AllExceptionsFilter`/`ValidationPipe`/`startDisabledModeHealthServer`/shutdown verbatim. |
| `src/app.module.ts` | LOGIC | `:30-32` `SwapsModule/SwapsAdminModule/SubmitSwapTxsModule` → `BridgeModule` (+ `BridgeAdminModule`, `SubmitBridgeTxsModule` in P3). `:12,46-47` service id + runtime-flags → bridge. **KEEP** default + `STATEFUL_CONNECTION_NAME` Mongoose (`:63-73,80-93`), `IncidentManagerModule` (`:35`), Cache/Schedule/EventEmitter/Throttler/SharedServices/RuntimeFlags/Prometheus/Health, global `BigIntGuardInterceptor` (`:96`), middleware chain — all verbatim. |
| `src/app.controller.ts` | VERBATIM | `@ApiExcludeController` root `GET /`. |
| `src/app.service.ts` | RENAME | `:12` `name: 'SODAX Swaps API'`→`'SODAX Bridge API'`. |
| `src/config/configuration.ts` | LOGIC | `:23` `SWAPS_API_PORT`(3008)→`BRIDGE_API_PORT`(3009); `:28` `RUN_SWAPS_API`→`RUN_BRIDGE_API`. **DROP** `SOLVER_CONFIG`/`normalizeSolverConfig` (`:15,46-50,104`). Keep `RPC_CONFIG` (`:45,100`), env/logLevel/cache/mongo/statefulMongo/prometheusIP/origin/allowedIps/adminTokens/discord/telegram. Rename `submitSwapTxsTask`→`submitBridgeTxsTask` (`:34-37,96-99`). Optionally ADD `RELAY_CONFIG`. |
| `src/config/config.module.ts` | VERBATIM | — |
| `src/config/config.service.ts` | LOGIC | **DROP** `solverConfig` getter (`:62-64`) + `SolverConfigClass` import; DROP `backendApiEndpoint` getter (`:66-69`) unless a bridge drainer authoritative-state source is added. Keep config/mongo/statefulMongo/cache/rpcConfig getters; rename `submitSwapTxsTask` getter. |
| `src/config/runtime-flags.ts` | RENAME | `:4` `SWAPS_API_SERVICE='swaps-api'`→`BRIDGE_API_SERVICE='bridge-api'`; `:11-13` `getBridgeApiRuntimeFlags` → `resolveBooleanFlag('RUN_BRIDGE_API',true)` + `RUN_SUBMIT_BRIDGE_TXS_TASK`. |
| `src/shared/class/config.class.ts` | LOGIC | **DROP** `SolverConfigClass`/`IsSolverConfig`/`normalizeSolverConfig` (`:146-230`) + `solverConfig` field (`:271-277`). Keep `MongoConfigClass`/`CacheConfigClass`/`ChainRpcConfigClass`/`IsRpcConfigRecord`/`ConfigClass` core. Keep `stripTrailingSlashes` only if RELAY_CONFIG normalization added. Rename `SubmitSwapTxsTaskConfigClass`→bridge. |
| `src/shared/providers/sodax.provider.ts` | LOGIC | **DROP** the solver-override block + `solverConfig` read (`:36-41`). **KEEP** RPC override + sonic→`hub.rpcUrl` mirror (`:22-34`) — bridge needs chains + hub RPC — and the default `new Sodax()` path (`:44-49`). Optionally ADD `overrides.relay = { relayerApiEndpoint }` if RELAY_CONFIG added. Token `'SODAX'` unchanged; bridge feature reads `sodax.bridge`. |
| `src/logger/logger.ts` | RENAME | `:5` `serviceName: 'swaps-api'`→`'bridge-api'`. |
| `src/shared/pipes/validation.pipe.ts` | VERBATIM | only dep is `@repo/shared-utils safeStringifyWithBigInt`. |
| `src/shared/interceptors/big-int-guard.interceptor.ts` | VERBATIM | none functionally; doc comment `:14` retarget swap-mappers→bridge-mappers. **Consequence:** every bridge response DTO MUST string-map SDK bigints or it 500s (`:30-33`). |
| `src/shared/middleware/{logging,prometheus}.middleware.ts` | VERBATIM | generic. |
| `src/shared/guards/{bearer,ip-allow,haproxy-throttler}.guard.ts` | VERBATIM* | logic unchanged; `bearer.guard.ts:17` + `ip-allow.guard.ts` import `ADMIN_ACCESS_TOKENS`/`ALLOWED_IPS` from app-local `config/configuration` (already copied). Reword the "swaps-api admin" doc comment. |
| `src/shared/validation/{decimal-string,strict-boolean}.ts` | VERBATIM | `@IsDecimalString`, `toStrictBoolean` — reused by bridge amount DTOs. |
| `src/shared/utils/utils.ts` | LOGIC | KEEP `withTimeout` (`:269`), `formatResultError` (`:55`), `isTransientSubmitError` (`:183`), `isIntentDeadlineExpired` (`:111`). **DROP** `getSubmitSwapTxCacheKey` (`:4`), `IntentLike` (`:13`), `toSdkIntent` (`:35`) + the `src/api/swaps/constants` import (`:2`); write bridge equivalents. Re-tune the transient-error allowlist to bridge relay error shapes. |
| `src/api/health/{health.controller,health.module,health.dto}.ts` | VERBATIM | liveness/readiness/uptime; guards + ORIGIN unchanged. |
| `src/api/health/health.service.ts` | RENAME | `:77` `service: 'swaps-api'`→`'bridge-api'`. (Static payload — no heartbeat read here.) |
| `src/api/prometheus/{controller,module,service}.ts` | VERBATIM | generic `http_requests_total`/`http_request_duration_seconds`/`http_response_size_bytes` (`prometheus.module.ts:7,12,18`) — no rename. Optional cosmetic `app` default label `:11`. Controller reads `config.prometheusIP` from app-local config (copied). |

### P1 — `api/bridge` discovery routes (bucket 3)

| File (`src/api/bridge/…`) | Class | Delta (cite) |
|---|---|---|
| `bridge.module.ts` | LOGIC | mirror `swaps.module.ts`; register `StatefulSubmitBridgeTx` on `STATEFUL_CONNECTION_NAME` (P2); provide `sodaxProvider`(`SODAX`) + `BridgeService` + `SubmitBridgeTxDbService` + `HaproxyThrottlerGuard`; **DROP** `IntentJournal` forFeature (`swaps.module.ts:24-26,33`). |
| `bridge.controller.ts` | LOGIC | `@Controller('bridge')` — **exactly 7 handlers** (do NOT `implements IBridgeApiV2`). Keep from `swaps.controller.ts`: `GET tokens`(`:66`), `GET tokens/:chainKey`(`:87`), `POST allowance/check`(`:197`), `POST approve`(`:214`), `POST intents`(`:232`→createBridgeIntent), `POST submit-tx`(`:519`), `GET submit-tx/status`(`:548`). **DROP** all other swaps routes (quote/deadline/cancel/hash/packet/extra-data/`:txHash`/limit-orders/gas/fees `:108-510`). Keep `@Throttle`+`HaproxyThrottlerGuard` on submit-tx (`:521-522`). |
| `bridge.service.ts` | LOGIC | Route→SDK map (see §2 route table). Build the SDK action via a bridge request-mapper. **DROP** the expired-deadline 400 guard (`swaps.service.ts:195,215-223`) and the solver/data/minOutputAmount `buildRawIntentAction` fields (`:428-450`) — SDK `BridgeParams={srcAddress,srcChainKey,srcToken,amount,dstChainKey,dstToken,recipient}` (`BridgeService.ts:80-88`). |
| `constants.ts` | RENAME | `SUBMIT_SWAP_TX_CREATED_EVENT`→`SUBMIT_BRIDGE_TX_CREATED_EVENT`, cache prefix `'submit-swap'`→`'submit-bridge'` (`:13,26-33`). DROP `ZERO_ADDRESS`/`EMPTY_DATA` (`:6-9`). |
| `error-mapper.ts` | VERBATIM | `throwSdkError` helper. |
| `parse-hex-hash.pipe.ts` | **DROP** | no `/:txHash` hex-param route in the 7. |
| `dto/create-bridge-intent.dto.ts` | LOGIC | `CreateBridgeIntentParamsDto = {srcChainKey,dstChainKey,inputToken,outputToken,inputAmount,srcAddress,dstAddress}` + optional `srcPublicKey`/`bound` (`backendBridgeApiV2.ts:76-101`). DROP `minOutputAmount/deadline/allowPartialFill/solver/data/partnerFee` (`create-intent.dto.ts:56-110`). `CreateBridgeIntentResponseDto={tx,relayData}` — DROP intent field (`:139-155`; `backendBridgeApiV2.ts:120-125`). Keep `RelayExtraDataDto {address,payload}` (`:117-137`). |
| `dto/bridge-token.dto.ts` | RENAME | `BridgeTokenResponseDto {symbol,name,decimals,address,chainKey,hubAsset,vault}` — `BridgeTokenV2` is `XToken` projected, same 7 fields as swaps `XTokenResponseDto` (`backendBridgeApiV2.ts:31-46`; `tokens.ts:23-32`). |

### P2 — submit pipeline persistence (bucket 3)

| File (`src/api/bridge/…`) | Class | Delta (cite) |
|---|---|---|
| `schemas/relay-data.schema.ts` | **NEW** | `RelayDataDocument {address:Hex, payload:Hex}` sub-schema. Bridge stores the **FULL** relay envelope because there is no `intent.creator` to rebuild the split-tx address from (`backendBridgeApiV2.ts:16-19,131-137`). Replaces swaps' `IntentSchema` entirely. |
| `schemas/stateful-submit-bridge-tx.schema.ts` | LOGIC | `collection: CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX_V2`. Status values `['pending','relaying','relayed','executed','failed']` (swaps `:25-33` drops `posting_execution/posted_execution/solved`). **REPLACE** `intent:IIntent + relayData:Hex` (`:90-101`) with single `relayData:RelayDataSchema`. Result sub-doc `{dstIntentTxHash, packetData?}` — DROP `intent_hash`/`fillTxHash` (`:36-49`). DROP `postExecutionAttempts`(`:143-149`), `relayedForRefundAt`(`:193-194`), the solver-poll sidecar (`:22,204-227`). KEEP `txHash/srcChainKey/walletAddress/status/failedAtStep/failureReason/processingAttempts/lastAttemptAt/abandonedAt/alertedAt` (+ optional `addressedAt/By/Reason`). Indexes: KEEP `{txHash,srcChainKey}` unique (`:234`), `{status,processingAttempts,lastAttemptAt,createdAt}`(`:236`), `{processingAttempts,abandonedAt}`(`:241`), `{abandonedAt}` partial (`:246`), `{'result.dstIntentTxHash'}`(`:260`); DROP `{'intent.intentId'}`(`:261`) + `{solverPollErrorSince}`(`:253`). |
| `schemas/packet-data.schema.ts` | VERBATIM | `PacketDataSchema`. |
| `types/submit-bridge-tx.ts` | LOGIC | DROP `IIntent`(`:3-18`); add `IRelayDataDomain {address,payload}`. `SubmitBridgeTxStatus` = 5-value union (swaps `:39-46`). `ISubmitBridgeTxResult={dstIntentTxHash,packetData?}` — DROP `intent_hash/fillTxHash`(`:48-55`). `ISubmitBridgeTx.relayData:IRelayDataDomain`; DROP `intent/postExecutionAttempts/relayedForRefundAt/lastSolver*/stuckAlertedAt`(`:61-123`), `SolverPollSignal`(`:132`), `intentCancelled`(`:145,151`). |
| `dto/submit-bridge-tx.dto.ts` | LOGIC | `relayData` becomes nested `@ValidateNested RelayExtraDataDto {address,payload}` (NOT swaps `@IsHex relayData!:Hex`, `submit-tx.dto.ts:63-69`). DROP `intent:IntentDto`(`:55-61`). Keep `txHash/srcChainKey/walletAddress` + `{success,data:{status:'inserted'|'duplicate',message}}` response (`backendBridgeApiV2.ts:138-163`). |
| `dto/submit-bridge-tx-status.dto.ts` | LOGIC | `PUBLIC_SUBMIT_BRIDGE_TX_STATUS_VALUES=['pending','relaying','relayed','executed','failed']` — DROP `posting_execution` (`submit-tx-status.dto.ts:15-22`). Result DTO `{dstIntentTxHash,packetData?}` — DROP `intent_hash/fillTxHash`(`:38-49`) + `relayedForRefundAt`(`:95-102`). Keep `abandonedAt/userMessage/processingAttempts/failedAtStep`. Status is bridge-native — **no `toWireStatus` collapse** (the doc status IS the wire status; `backendBridgeApiV2.ts:178`). |
| `dto/submit-bridge-tx-key.dto.ts` | VERBATIM | `{txHash,srcChainKey}` — rename class only. |
| `dto/packet-data.dto.ts` | VERBATIM | `PacketDataDomainResponseDto`. |
| `submit-bridge-tx-db.service.ts` | LOGIC | `NON_TERMINAL_SUCCESS_FILTER={$ne:'executed'}` (rename from `{$ne:'solved'}`, `submit-tx-db.service.ts:43`). KEEP `findOrUpsert`(`:85`), `exists`(`:107`), `getSubmitTxStatus`(`:112`) **minus** the intent-journal `INTENT_CANCELLED`/`SOLVER_*_REASON` enrichment (`:80-83,149-176,654-724`), `findByKey`(`:190`), `getToProcess` status `$in ['pending','relaying','relayed','failed']`(`:275,292`), `claimForProcessing`(`:322`), `getNewlySaturated`(`:466`), `markAbandoned`(`:492`), `getAbandonedUnalerted`(`:514`), `markGivenUpAlerted`(`:530`), `updateStatus`(`:570`) with terminal='executed'. **DROP** `markManuallyPostedToSolver`(`:218`), `markRelayedForRefund`(`:263`), `keepAwaitingSolver`(`:339`), `recordSolverPollOk`(`:380`), `getStuckPostedExecution`(`:396`), `markStuckAlerted`(`:425`), `recordPostExecution`(`:450`), `SOLVER_POLL_PHASE_FILTER`(`:56`). |
| `relay-bridge-tx.ts` | LOGIC | `relayBridgeTx`: split-tx envelope comes from **STORED** `params.relayData {address,payload}` — NOT reconstructed `{address:params.intent.creator, payload:relayData}` (`relay-swap-tx.ts:70-88`; bridge has no intent — a verbatim copy won't compile). Keep `isSplitTxChain=isSolana||isBitcoin`(`:58`) + payload guard(`:59-69`), `withTimeout(submitIntent)`(`:93`), `waitUntilIntentExecuted`(`:106-121`). **DROP** the hub-source short-circuit (`:38,122-124`) — bridge **always relays** (`BridgeService.ts:437-441`). |
| `shared/utils/bridge-mappers.ts` | LOGIC/NEW | `mapSubmitBridgeTxStatusToResponseDto` (no `toWireStatus`, `swap-mappers.ts:27-31`), result/packetData mappers (drop `intent_hash/fillTxHash` `:149-156`), `stringifyBigInts` VERBATIM(`:184-256`), request-mapper. DROP `mapIntentToResponseDto`(`:96-113`), `toSdkPartnerFee`(`:208-218`). Bridge request-mapper: `inputToken→srcToken`, `outputToken→dstToken`, `BigInt(inputAmount)→amount`, `dstAddress→recipient`, pass `srcChainKey/dstChainKey/srcAddress`, forward `srcPublicKey/bound` extras, `raw:true`, **NO partnerFee** (config-driven via `ConfigService.bridgePartnerFee`, `BridgeService.ts:162-168`). |

### P3 — drainer / alerter / heartbeat (bucket 3)

| File (`src/tasks/submit-bridge-txs/…`) | Class | Delta (cite) |
|---|---|---|
| `submit-bridge-txs.task.ts` | LOGIC | KEEP scheduling/lease/holder/heartbeat/pendingKick/shutdown scaffolding (`submit-swap-txs.task.ts:59-321`) + CLAIM-first (`:323-341`). REWRITE `executeSubmitTxPipeline`(`:404-476`) relay-only: `pending/relaying → updateStatus('relaying') → relayBridgeTx(submit) → updateStatus('relayed', {dstIntentTxHash})` checkpoint → `updateStatus('executed', {dstIntentTxHash,packetData})` TERMINAL. Failure → `failWith('relaying'/'relayed', reason, {transient:isTransientSubmitError})`. Resume via `getResumeStep`(`:914`); a `'relayed'` resume skips re-submit and only re-polls the packet (idempotent). **DROP** `postToSolver`(`:494`), `resolveSolverStatus`(`:564`), `resolveNotFound`(`:698`), `handleExpiredTerminal`/`relayForRefund`/`isRefundableSituationA`(`:751,768,822,837`), `markSolvedFromJournal`(`:881`), `IntentJournalApiClient` dep(`:90`) + all deadline/journal/solver imports(`:8,25,35-45`). |
| `submit-bridge-tx-alerter.task.ts` | LOGIC | KEEP two-phase `scanAndAlert` latch(`markAbandoned`)→page(`getAbandonedUnalerted`/`markGivenUpAlerted`) (`:104-204`) on `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP`. **DROP** entire Phase-3 `alertStuckPostedExecution`(`:243-309`) + `raiseDeliveredCause` dual-cause machinery + `SWAP_STUCK_CAUSE_MARKER`(`:22-25,84-98,284`) — bridge has a single give-up cause, so the marker-collision handling collapses (a straight copy references a nonexistent stuck marker). DROP the `relayedForRefundAt` non-pageable arm(`:140-146`). |
| `submit-bridge-tx-heartbeat.service.ts` | RENAME | `LABEL = TaskLabel.BRIDGE_SUBMIT_TX` (new enum) instead of `SWAPS_SUBMIT_TX`(`heartbeat.service.ts:42`). Otherwise identical on the shared `TaskExecutorHeartbeat` model. |
| `constants.ts` | LOGIC | KEEP `MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS`, `BATCH_SIZE`, `SUBMIT_INTENT_TIMEOUT`(30s), `LOCK_TTL`, `SHUTDOWN_DRAIN`, `ALERTER_INTERVAL`, `ABANDON_GRACE`, `STATEFUL_LOCK_MANAGER` token, single `BRIDGE_GIVE_UP_CAUSE_MARKER`. **Recompute** worst-case/`ABANDON_GRACE`: now `submitIntent(30s)+DEFAULT_RELAY_TX_TIMEOUT(~120s)` only — DROP the `postExecution(90s)+getStatus(15s)` terms (`:88-98,132-142`). DROP `POST_EXECUTION/GET_STATUS` timeouts(`:21,31`), `MAX_POST_EXECUTION_ATTEMPTS`(`:42`), `SOLVER_*`(`:51,61,160`), `SWAP_STUCK_*`(`:84,111`), `BACKEND_API_LOOKUP_TIMEOUT`(`:151`). Keep `MANUAL_RELAY_OBSERVE`(`:72`) only if admin manual-relay kept. |
| `submit-bridge-txs.module.ts` | LOGIC | import `BridgeModule` (SODAX + `StatefulSubmitBridgeTx`, `module.ts:7,17`); keep `STATEFUL_LOCK_MANAGER` factory binding `LockManagerService` to the stateful locks model(`:28,40-44`); providers `SubmitBridgeTxsTask/Alerter/Heartbeat` — DROP `IntentJournalApiClient`(`:10,36`). |
| `intent-journal-api.client.ts` | **DROP** | bridge never consults `intent_journal`; packet landing is authoritative. |

### P3 — admin (bucket 3, optional but planned)

| File (`src/api/admin/…`) | Class | Delta (cite) |
|---|---|---|
| `bridge-admin.controller.ts` | RENAME | `@Controller('admin/bridge')` `@ApiExcludeController`, `AdminTokenGuard`; POST relay + POST mark-addressed (`swaps-admin.controller.ts:33,48`). |
| `bridge-admin.service.ts` | LOGIC | `manualRelay`: `findByKey` → `'executed'`⇒`already_executed`; `!abandonedAt`⇒`not_abandoned`; else `relayBridgeTx`(bounded) → packet⇒`updateStatus('executed',result)` else `'incomplete'` (idempotent retry). **DROP** the deadline/Situation-A/B/relay-for-refund/`posted_to_solver` block (`swaps-admin.service.ts:130-265`). `markAddressed` as-is (`:279-327`) if triage fields kept. |
| `bridge-admin.module.ts` | RENAME | import `BridgeModule` (`swaps-admin.module.ts:12`). |
| `dto/manual-relay.dto.ts` | LOGIC | `MANUAL_RELAY_OUTCOMES=['executed','already_executed','not_abandoned','incomplete']` — DROP `posted_to_solver/solved/relayed_for_refund/refund_in_progress/already_solved`(`:37-46`); response drops `intentHash/deadline`(`:69,80-84`). |
| `dto/mark-addressed.dto.ts` | RENAME | field-identical; point status-values import at bridge schema. |

### The 7 routes → backend call map (for `bridge.service.ts` + `bridge.controller.ts`)

| Route | Backend call | Req DTO | Res DTO |
|---|---|---|---|
| `GET /bridge/tokens` | `sodax.bridge.config.getSupportedTokensPerChain()` (`ConfigService.ts:250`) → project `XToken`→`BridgeTokenV2` | none | `GetBridgeTokensResponseV2` |
| `GET /bridge/tokens/:chainKey` | `…getSupportedTokensPerChain().get(chainKey)` | path `chainKey` | `GetBridgeTokensByChainResponseV2` |
| `POST /bridge/allowance/check` | `sodax.bridge.isAllowanceValid(action)` (`BridgeService.ts:182`) | `CreateBridgeIntentParamsV2` | `{valid}` |
| `POST /bridge/approve` | `sodax.bridge.approve(action, raw)` (`:252`) → `{tx:stringifyBigInts}` | `CreateBridgeIntentParamsV2` | `{tx}` |
| `POST /bridge/intents` | `sodax.bridge.createBridgeIntent(action, raw)` (`:558,681-687`) → `{tx, relayData}` NO intent | `CreateBridgeIntentParamsV2` | `{tx, relayData}` |
| `POST /bridge/submit-tx` | `SubmitBridgeTxDbService.findOrUpsert` + emit created (idempotent by `txHash+srcChainKey`) | `BridgeSubmitTxRequestV2` (full relayData) | `{success,data:{status:'inserted'\|'duplicate',message}}` |
| `GET /bridge/submit-tx/status` | `SubmitBridgeTxDbService.getSubmitTxStatus` | query `{txHash,srcChainKey}` | `BridgeSubmitTxStatusResponseV2` |

(Bridgeable-amount stays client-side — no backend route, `backendBridgeApiV2.ts:237`.)

### P3 — cross-cutting shared-package edits (bucket 3, INFRA-EDIT)

| File | Edit |
|---|---|
| `packages/shared-enums/src/enums/enums.ts` | ADD `CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX_V2` (mirror `:202`) and `TaskLabel.BRIDGE_SUBMIT_TX='BRIDGE SUBMIT TX'` (mirror `SWAPS_SUBMIT_TX` `:263`). **Verify** the task-executor unit test asserting `TASK_LABELS` stays in sync with the catchup-guard maps (`:270-275`) — add `BRIDGE_SUBMIT_TX` to the non-guardable action-taker list like `SWAPS_SUBMIT_TX`. |
| `packages/incident-manager/src/constants.ts` + `playbook.ts` | ADD `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP` (mirror `SWAP_SUBMIT_GIVE_UP` `:35`) **and its playbook entry** (else `raise()` on the flow is unmapped) — `unique_active_per_target` on `stateful_submit_bridge_tx_v2`. |

### P3 — root infra edits (bucket 3, INFRA-EDIT — `sodax-backend`)

| File | Edit |
|---|---|
| `Dockerfile` (after `:93`) | New stage mirroring swaps (`:85-93`): `FROM base AS bridge-api` / `COPY ./apps/bridge-api` / `pnpm --filter bridge-api install --frozen-lockfile` / `run build` / `ARG SOURCE_COMMIT` / `ENV GIT_SHA` / `CMD ["pnpm","--filter","bridge-api","run","start:prod"]`. |
| `docker-compose.yml` (after `:224`) | New `sodax-bridge-api`: `build.target: bridge-api`; env `<<: [*global-env, *api-cache-env]` + `MONGO_URI` + `STATEFUL_MONGO_URI/DB` + `BRIDGE_API_PORT` + `RUN_BRIDGE_API` + `RUN_SUBMIT_BRIDGE_TXS_TASK` + `SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS` + `RPC_CONFIG` + `ADMIN_ACCESS_TOKENS` + `ALLOWED_IPS`; **DROP** `SOLVER_CONFIG`; `ports: "${BRIDGE_API_PORT}:${BRIDGE_API_PORT}"`; healthcheck `curl -f http://localhost:${BRIDGE_API_PORT}/healthz/live`; logs + certs volumes; `depends_on: *api-depends-on`; `restart: on-failure`; `labels: {origin: ${ORIGIN}}`. |
| `Makefile` (`.PHONY:11`, help `:57`, after `:127-129`) | `run-dev-bridge-api: run-dev-mongo` → `docker compose … up -d sodax-bridge-api --build`. |
| `.env-example` (after `:204`; `:492`) | `# ─── Bridge API ───` block: `RUN_BRIDGE_API="true"`, `BRIDGE_API_PORT=3009`, `RUN_SUBMIT_BRIDGE_TXS_TASK="false"`, `SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS=60000`. Append `,sodax-bridge-api` to `SERVICES_TO_MONITOR`. |
| `.env.dev` (after `:204`; `:492`) | Identical block but `RUN_SUBMIT_BRIDGE_TXS_TASK="true"` (dev precedent, `.env.dev:203`). Append `,sodax-bridge-api`. |
| `apps/monitoring-service` | **NO source edit** — `configuration.ts:11-18` splits CSV + `${ORIGIN}:` prefix; `monitoring.service.ts:521` includes by container name == compose service name `sodax-bridge-api`. Optional `DISCORD_THREAD_MAP` entry. |
| `sodax/CLAUDE.md` | Add a write-ownership row: `bridge-api` owns `stateful_submit_bridge_tx_v2` + `service_runtime_flags._id='bridge-api'`; must never write swaps-owned collections. |
| `docs/bridge-api-sdk-mapping.md` | NEW — the 7-route→SDK map + status enum + terminal-success semantics (for reviewers). |

### P3 — SDK S1 (bucket 3, sdk-edit — `sodax-sdks`, branch `feat/bridge-api-v2`)

| File | Edit (cite) |
|---|---|
| `packages/types/src/common/constants.ts` | ADD `DEFAULT_BRIDGE_API_ENDPOINT` (placeholder `https://api.sodax.com/v1/bridge` — confirm real host, §6). ADD `type BridgeApiConfig = BaseApiConfig`. Extend `CustomApiConfig` (`:35-37`) with optional `bridgeApiConfig?` + a bridge-only variant. |
| `packages/sdk/src/backendApi/apiConfig.ts` | `isCustomApiConfig`(`:33`) += `\|\| 'bridgeApiConfig' in config`. Rewrite `resolveBridgeApiConfig`(`:95-96`) from `return resolveBaseApiConfig(config)` to seed from `bridgeDefault={baseURL:DEFAULT_BRIDGE_API_ENDPOINT,…}` and `layerConfigs(bridgeDefault, config.bridgeApiConfig)` — passing `bridgeDefault` FIRST overrides `layerConfigs`' hardcoded base seed (`:43,54`); **do NOT** inherit `baseApiConfig.baseURL` (bridge is a separate host, unlike `resolveSwapsApiConfig:82`). |
| `packages/sdk/src/backendApi/BackendApiService.ts` (`:199-201`) | Wiring unchanged; fix the now-false "Bridge shares the swaps host" comment. |
| `packages/sdk/src/backendApi/BridgeApiService.ts` (`:77,94-99`) | `/bridge/*` suffixes stay AS-IS **iff** the standalone app keeps `@Controller('bridge')` — the one SDK↔backend coordination point. Update the "shares the swaps host" JSDoc. |

---

## 3. Key implementation notes / gotchas

1. **Terminal-success rename everywhere:** `NON_TERMINAL_SUCCESS_FILTER {$ne:'solved'}→{$ne:'executed'}` (`submit-tx-db.service.ts:43`) on **every** forward/abandon write. Terminal success = `status==='executed' && result.dstIntentTxHash` (`backendBridgeApiV2.ts:16-19`).
2. **Split-tx payload persisted at insert, NOT in the idempotency key:** the full `{address,payload}` envelope is stored on the doc (`relay-data.schema.ts`) and replayed verbatim by `relayBridgeTx` — bridge has no `intent.creator` to rebuild it (`relay-swap-tx.ts:77-79` won't compile if copied). Idempotency key stays `txHash+srcChainKey`.
3. **The one genuinely new state:** `relaying→relayed→executed`. `'relayed'` = submit accepted / `dstIntentTxHash` checkpoint (resume skips re-submit, only re-polls the packet — idempotent); `'executed'` = packet confirmed on hub. Swaps never had this split (it terminates at solver `'solved'`).
4. **Refund-vs-consume:** a transient relay/packet failure refunds the claimed attempt (`$inc -1` guarded `$gt:0`) and resumes from `failedAtStep`; a non-transient/unknown failure **consumes** toward `MAX_SWAP_TX_RETRIES(=3)`. At the cap the alerter latches `abandonedAt` (CAS `$exists:false`) and raises `BRIDGE_SUBMIT_GIVE_UP`. Bridge must **abandon a never-executed packet, not refund forever** — there is no solver refund path.
5. **BigIntGuard is global and 500s on any leaked bigint** (`big-int-guard.interceptor.ts:30-33`). `approve`/`intents` tx payloads and any fee/amount MUST go through `stringifyBigInts` in `bridge-mappers.ts` — mandatory, not optional.
6. **Single-writer invariant:** bridge writes ONLY `stateful_submit_bridge_tx_v2` (never `stateful_submit_swap_tx_v2`); its `service_runtime_flags` doc keys `_id:'bridge-api'` (disjoint). Reuse `STATEFUL_CONNECTION_NAME` only for bridge-owned `forFeature`.
7. **Drainer lease keyed by the BRIDGE collection:** the lease lives in the shared stateful `locks`, keyed by the bridge model's collection, so bridge + swaps drainers don't contend — but both need `STATEFUL_MONGO_*` pointed at the same server, and `RUN_SUBMIT_BRIDGE_TXS_TASK` must be true on **exactly one** deployment (#826/#837 topology).
8. **Heartbeat on the local conn, lease on the stateful conn** — mirror swaps: `TaskExecutorHeartbeat` (`BRIDGE_SUBMIT_TX`) writes via `@repo/shared-schemas` on the default connection; `LockManagerService` binds the stateful `locks`.
9. **`getSubmitTxStatus` must drop the intent-journal read** (`submit-tx-db.service.ts:80-83,149-176,654-724`) — bridge never registers `IntentJournal`; keeping the injection fails DI. `userMessage` collapses to abandoned/generic-failed hints.
10. **sodax.provider — what bridge keeps:** KEEP `RPC_CONFIG` + sonic→`hub.rpcUrl` mirror (bridge needs chains + hub); DROP `SOLVER_CONFIG` end-to-end (`BridgeService` uses `hubProvider/config/spoke` + `relay.relayerApiEndpoint`, never the solver API — `BridgeService.ts:13137-13195`). Optionally ADD `RELAY_CONFIG` (SDK ships a default relayer, so optional).
11. **`useBackendSubmitTx` ships default-OFF** until the re-relay e2e gate passes (client already default-OFF per PR #261).
12. **Do NOT base the drainer on PR #928's in-flight concurrency refactor** — copy the current `submit-swap-txs.task.ts` claim/lease/drain shape, not leverage-yield's rework.

---

## 4. Sequenced build order (first commits)

1. Scaffold bucket-2 shell + tooling; `pnpm install`; boots on 3009, `/healthz/live` green, Swagger renders (no bridge routes yet).
2. `sodax.provider` retarget (drop solver, keep RPC/hub); `bridge.module` + `bridge.service` + `bridge.controller` with the **5 stateless routes**; `curl` tokens/allowance/approve/intents against `sodax.bridge.*`.
3. Add `CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX_V2`; `relay-data.schema.ts` + `stateful-submit-bridge-tx.schema.ts` + types + DTOs; `SubmitBridgeTxDbService.findOrUpsert`; `POST /bridge/submit-tx` returns `inserted`/`duplicate`.
4. `relay-bridge-tx.ts` (stored-envelope relay) + `submit-bridge-txs.task.ts` relay-only pipeline; row drains `pending→relaying→relayed→executed`.
5. `GET /bridge/submit-tx/status` returns the native status DTO.
6. Alerter (`BRIDGE_SUBMIT_GIVE_UP` + `packages/incident-manager` edit) + heartbeat (`BRIDGE_SUBMIT_TX` enum edit); verify `task_executor_heartbeats` row + give-up incident.
7. `bridge-admin` manual-relay + mark-addressed.
8. Root infra (Dockerfile/compose/Makefile/env/`SERVICES_TO_MONITOR`) + `CLAUDE.md` row + `docs/bridge-api-sdk-mapping.md`.
9. SDK S1 (`apiConfig.ts` + `constants.ts`) — bridge resolves to its own host.
10. Unit + e2e tests; local full-test-flow (§5).

---

## 5. Local full-test-flow tie-in

1. In `sodax-sdks`: apply S1, build the SDK, `pnpm pack` the `@sodax/sdk` + `@sodax/types` tarballs.
2. In `sodax-backend`: install via name-based `pnpm.overrides` (or `file:` refs) pointing at the packed tarballs so `apps/bridge-api` + the demo consume the S1 config.
3. `make run-dev-mongo` then `make run-dev-bridge-api` (mongo/redis + bridge-api on 3009).
4. Point the demo `/bridge-api` page baseURL at `http://localhost:3009` (via `bridgeApiConfig.baseURL` override from S1).
5. Exercise create (`POST /bridge/intents` → `{tx, relayData}`) → sign/broadcast client-side → `POST /bridge/submit-tx` (full relayData) → poll `GET /bridge/submit-tx/status` until `executed` with `dstIntentTxHash`. Include a Solana/Bitcoin split-tx case to prove the stored `{address,payload}` envelope relays correctly.

---

## 6. Open questions for Robi

1. **Host/prefix:** confirmed standalone host on **3009** with `@Controller('bridge')` → SDK `DEFAULT_BRIDGE_API_ENDPOINT`? Is it `api.sodax.com/v1/bridge`, a separate subdomain, or does the app mount at root (drops the `/bridge` SDK suffix)? Blocks S1 + `BridgeApiService` suffixes.
2. **Terminal semantics:** is `status==='executed' && result.dstIntentTxHash` (packet-land) the authoritative completion, with no further reconciliation? Confirm `dstIntentTxHash = packet.dst_tx_hash`.
3. **Split-tx chain list + idempotency:** exact chains needing `{address,payload}` at relay submit (Solana + Bitcoin only?), and confirm idempotency stays `txHash+srcChainKey` (not including payload).
4. **Retry/abandon budgets + packet-poll bound:** reuse `MAX_SWAP_TX_RETRIES=3` / `SWAP_TX_RETRY_BACKOFF_MS=60000`, and set `DEFAULT_RELAY_TX_TIMEOUT` as the packet-poll ceiling? Recompute `ABANDON_GRACE` for the collapsed `submit(30s)+relay(~120s)` machine.
5. **Rate-limit tier:** same `@Throttle` bucket as swaps `submit-tx`, or a bridge-specific tier?
6. **Drainer shared-lease (#837):** confirm `STATEFUL_MONGO_*` points at the same server and `RUN_SUBMIT_BRIDGE_TXS_TASK` runs on exactly one deployment; is the bridge queue a persisted async drainer at all, or a synchronous passthrough (which collapses P2/P3)?
7. **Does bridge Sodax need any solver config?** Plan drops `SOLVER_CONFIG` entirely per SDK evidence — confirm no edge path needs it, and whether to add `RELAY_CONFIG` (relayer override) vs rely on the SDK default relayer.
8. **Admin surface scope:** ship `bridge-admin` (manual-relay + mark-addressed) in P3, or defer? Triage fields (`addressedAt/By/Reason`) on the schema now or later?
9. **SDK S1 ownership:** land the `apiConfig.ts`/`constants.ts` change in this PR, or a follow-up PR in `sodax-sdks` on `feat/bridge-api-v2`? It gates the demo/local flow.

---

## 7. SDK-verified resolution of §6 (feat/bridge-api-v2, read 2026-07-15)

The shipped SDK client **settles** several §6 items — no decision needed.

**SETTLED (SDK-fixed contract; backend has no freedom):**
- **Q2 terminal** — success = `status==='executed'` AND truthy `result.dstIntentTxHash`, set ATOMICALLY; `executed` alone is ignored (SDK keeps polling). Failure = `status==='failed'` OR `abandonedAt`. 5-state enum, no `posting_execution`/`intent_hash`. `pollBackendSubmitTx.ts:50-59`; `BridgeService.ts:527-528`; `backendBridgeApiV2.ts:178,181-186,207`.
- **Q3 split-tx + idempotency** — split-tx predicate = **Solana|Bitcoin ONLY** (`isSolanaChainKeyType||isBitcoinChainKeyType`, `IntentRelayApiService.ts:398`) — NOT the longer list in the DTO comment. Idempotency key = `(txHash, srcChainKey)`. Submit body = `{txHash, srcChainKey, walletAddress, relayData:{address,payload}}`, `walletAddress = params.srcAddress`. Responses valibot-validated → shape drift = `{ok:false}`. `BridgeApiService.ts:257,282`; `bridgeApiSchemas.ts:68`; `backendBridgeApiV2.ts:132,138-147,166-171`.
- **Q7 solver** — bridge result has no `intent_hash`; DROP `SOLVER_CONFIG` for the bridge path. `backendBridgeApiV2.ts:181-186`.
- **Q9 S1 ownership** — the S1 client already ships on `feat/bridge-api-v2` (BridgeApiService + pollBackendSubmitTx + schemas wired into `BridgeService.submitTx`), opt-in default OFF with idempotent client fallback → S1 is IN PR #261, not a follow-up. The only S1 remainder is the BACKEND-facing `resolveBridgeApiConfig` host (see Q1). `BridgeService.ts:150,399-408,498-534`.
- **Q1 paths** — 7 route suffixes fixed; only host/base-URL open. `BridgeApiService.ts:261-289`.

**CONSTRAINED:**
- **Q4** — SDK fixes ONE shared budget `DEFAULT_RELAY_TX_TIMEOUT=120000ms` for the whole post-createIntent bridge, split between backend poll (~100s; reserve=`min(ceil(remaining/3),20000)`, 1s interval) and client fallback → mirror ≤120s (~100s effective) as the packet-poll ceiling. Retry-count / abandon-threshold stay backend-authored (`processingAttempts`/`abandonedAt` SDK read-only). `constants.ts:5`; `BridgeService.ts:394,465`; `pollBackendSubmitTx.ts:44-46,60,62`.

**BACKEND-ONLY — recorded defaults (self-decided 2026-07-15, no Robi sign-off):**
- **Q1 host** → local: demo `baseURL=http://localhost:3009` (SDK appends `/bridge/*`); prod endpoint finalized at deploy.
- **Q4 budget** → MAX=3 retries, backoff 60000ms, packet-poll ceiling 120s.
- **Q5 rate-limit** → match swaps submit-tx `{ttl:60_000, limit:10}` (safe: idempotent).
- **Q6 processing model** → persisted async drainer (SDK poll lifecycle presumes it).
- **Q8 admin** → triage fields on the schema NOW (DTO-fixed names); `bridge-admin` controller deferred.

### Plan corrections forced by the SDK read (apply during coding)
1. **Split-tx family logic = Solana|Bitcoin ONLY** (runtime predicate) — do NOT size it from the DTO comment's longer list. `relayData` is still carried on the wire for ALL chains.
2. **Drainer must set `status='executed'` AND `result.dstIntentTxHash` ATOMICALLY** — `executed` alone is a no-op to the SDK.
3. **`walletAddress` (submit body) = `params.srcAddress`, NOT the relay/hub address.** The relay envelope address is `relayData.address` (`BridgeService.ts:516` vs `:637/:685`). Never rebuild the relay address from `walletAddress`; Bitcoin's derived trading wallet lives in `relayData.address`.
4. **Timeout is ONE shared 120s wall-clock** (backend poll + client fallback), not per-step. `BridgeService.test.ts:606-641`.
5. **`processingAttempts` REQUIRED on EVERY status response** (incl `pending`/`relaying`). If `packetData` is emitted, all its fields are required with a strict inner status picklist → omit `packetData` until fully formed. `bridgeApiSchemas.ts:74-108`.


---

## 8. Backend defaults — FINAL (Q5 / Q6 / Q8, decided 2026-07-15, no Robi sign-off)

Locked from the swaps-api precedents. With these, **all 9 questions are decided** — code-ready for P1/P2/P3.

### Q5 — Rate-limit + cache (mirror swaps EXACTLY)
Only `submit-tx` is throttled; only the two token GETs are cached; the other 4 get neither.

| Route | Throttle | Cache |
|---|---|---|
| `GET /bridge/tokens` | none | `CacheInterceptor` + `@CacheTTL(60_000)` |
| `GET /bridge/tokens/:chainKey` | none | `CacheInterceptor` + `@CacheTTL(60_000)` |
| `POST /bridge/allowance/check` | none | none (`@HttpCode(200)`) |
| `POST /bridge/approve` | none | none (`@HttpCode(200)`) |
| `POST /bridge/intents` | none | none (`@HttpCode(200)`) |
| `POST /bridge/submit-tx` | `@UseGuards(HaproxyThrottlerGuard)` + `@Throttle({default:{ttl:60_000,limit:10}})` | none |
| `GET /bridge/submit-tx/status` | none | none |

Global: `ThrottlerModule.forRoot({throttlers:[{ttl:60_000,limit:10}]})` + global `CacheModule` (`store:createKeyv(uri)`, no default ttl). Guard is **NOT** an `APP_GUARD` — attach `@UseGuards(HaproxyThrottlerGuard)` per-route on submit-tx only (else every route incl. reads would throttle). Copy `haproxy-throttler.guard.ts` verbatim (keys on `x-real-ip`, fallback `req.ip`). `swaps.controller.ts:66-68,87-89,519-522`; `app.module.ts:49-51,96-104`; `haproxy-throttler.guard.ts:20-25`.

### Q6 — Persisted ASYNC drainer + topology (mirror `SubmitSwapTxsTask` safety model)
Sync passthrough is wrong: worst-case single pickup ~submit(30s)+relay(~120s), a full tick blocks minutes + unsafe on crash + the SDK poll lifecycle presumes async.
- **Single collection-wide Mongo lease** keyed by the **BRIDGE** model (`tryAcquireModelLease(bridgeModel,TTL,holderId)`), NOT per-row — makes action-taker double-submit structurally impossible.
- Lease in the **shared stateful `locks`** (2nd `LockManagerService` on `STATEFUL_CONNECTION_NAME` under a bridge lock token).
- **`RUN_SUBMIT_BRIDGE_TXS_TASK` on EXACTLY ONE deployment** (default `false`); both-on = safe warm-standby HA (lease serializes + TTL failover), no extra throughput.
- Precondition: both deployments' `STATEFUL_MONGO_*` → same shared server, else lease+queue fall back to local → run on one deployment only.
- **Heartbeat on the LOCAL default connection** (#880). `holderId = bridge-api:submit-bridge-txs:${randomUUID()}`.
- Copy self-guards verbatim: `isProcessing`/`pendingKick`/`shuttingDown` 10s drain, crash-safe `claimForProcessing` (bump attempt before work), resume-step.
- **Knobs (rename env, KEEP values):** interval `SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS`=60_000; lease TTL 300_000 (renew between batches, early-bail on renew fail); batch 10, cap 100/tick; shutdown drain 10s; alerter 5min; abandon grace 5min. **Only the pipeline body (relay→confirm) is bridge-specific — never tune the safety model.** `docs/swaps-drainer-concurrency.md:9-76`; `submit-swap-txs.task.ts:166-241,331-341`; `submit-swap-txs.module.ts:28,40-44`; `constants.ts:2,5,86-98`; `CLAUDE.md:226`.

### Q8 — Admin v1 = SHIP (supersedes plan §2's "controller deferred")
Ship both in P3 (an alerter with no operator ack + no recovery lever is an incomplete ops loop; both are cheap):
- `POST /admin/bridge/relay` — relay-only manual re-relay. Outcomes `['executed','already_executed','not_abandoned','incomplete']` (drop solver/refund outcomes). Flow: `findByKey`→404; `executed`→`already_executed`; `!abandonedAt`→`not_abandoned`; else `relayBridgeTx` → packet ⇒ `updateStatus('executed',{dstIntentTxHash,packetData})` guarded `{$ne:'executed'}` (matched=`executed`, concurrent-unmatched=`already_executed`); no packet=`incomplete`. Drop swaps deadline/Situation-A/B/relay-for-refund/post-execution (~135 lines). Keep `MANUAL_RELAY_OBSERVE_TIMEOUT_MS=25s`.
- `POST /admin/bridge/mark-addressed` — near-verbatim rename. Outcomes `'addressed'|'unaddressed'|'not_abandoned'|'no_change'`.
- Controller `@Controller('admin/bridge')` `@ApiExcludeController()` `@UseGuards(AdminTokenGuard)`, `@Header('Cache-Control','no-store')` + `@HttpCode(200)`.
- **Triage fields on the schema at P2** (add now — DTO already exposes them, later needs migration): `failedAtStep?` (SDK-required), `failureReason?` (SDK-required), `addressedAt?`, `addressedBy?`, `addressedReason?` (maxlen 512). (`processingAttempts`/`abandonedAt`/`alertedAt` already kept per §2.) `swaps-admin.controller.ts:33,48`; `swaps-admin.service.ts:87-327`; `stateful-submit-swap-tx.schema.ts:114-127`; `bridgeApiSchemas.ts:98-108`.

### Net — all 9 decided
Q2/Q3/Q7/Q9 SDK-settled (§7), Q4 ceiling 120s (SDK), Q5/Q6/Q8 above. **Zero design blockers for P1/P2/P3.** Only deploy-time infra facts remain: which single deployment runs `RUN_SUBMIT_BRIDGE_TXS_TASK=true`, and confirming both deployments' `STATEFUL_MONGO_*` point at the same shared server. Neither blocks writing code.
