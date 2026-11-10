---
type: plan
repo: builders-sodax-mcp-server
github: 110
related_issues: [79, 87, 104, 108]
tags: [mcp, observability, logging, otlp, pino, sodax-observability]
updated: 2026-11-10
---

# GH-110 plan: stream the MCP's logs to unified logging

Issue body (`issue.md`) holds the decisions M1–M11; this is how they land in the code. Branch `feat/110-unified-logging`
off `development` (worktree `.claude/worktrees/110-unified-logging`), one PR, `Closes #110`.

## Decisions (facts checked 2026-11-10)

- **D1 In-process SDK, own destination.** `@opentelemetry/sdk-logs 3.0.0`, `@opentelemetry/exporter-logs-otlp-proto
  0.300.0`, `@opentelemetry/resources 3.0.0`, `@opentelemetry/api 1.10.0` (all released 2026-10-20, past the 14-day
  cooldown; `exporter 0.300.0` depends on `sdk-logs 3.0.0` exactly; `api-logs` has no 0.300, the 3.0 SDK carries the
  logs API). Not `pino-opentelemetry-transport 4.0.2`: its mapper (`lib/opentelemetry-mapper.js:41-59`) spreads the
  record's top-level fields as attributes without flattening, so `err` (an object) is dropped by the SDK's attribute
  sanitizer and the stack never arrives; it runs in a worker thread, where a flush before `process.exit` is best effort;
  it also pulls the gRPC exporters. Our destination is a second pino stream that parses each JSON line (volume is
  small) and emits a `LogRecord`.
- **D2 Activation.** `OTEL_LOGS_ENABLED=true` → dynamic `import("./otel.js")`; anything else loads no OTel module.
  Required when enabled: `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (the full `/v1/logs` URL, the standard variable's meaning;
  `https` unless `DEPLOYMENT_ENV=dev`), `OTEL_LOGS_TOKEN`, `DEPLOYMENT_ENV` ∈ {`prod`, `canary`, `staging`, `dev`}.
  Missing or invalid → one `warn` naming the variable, destination off, boot continues. The token is sent only as the
  exporter's `Authorization: Bearer` header to that URL.
- **D3 Resource.** `service.name=builders-mcp`, `service.namespace=builders-sodax-mcp-server`,
  `deployment.environment=$DEPLOYMENT_ENV`, `service.version=SERVER_VERSION` (package version, as `/health` reports),
  `service.instance.id=os.hostname()`, `sodax.origin=$ORIGIN` when set.
- **D4 Record mapping.** pino `time` (isoTime) → timestamp; `level` → severity (trace 1, debug 5, info 9, warn 13,
  error 17, fatal 21); `msg` → body; `err` (already through `redactErr`) → `exception.type`, `exception.message`,
  `exception.stacktrace`; every other field flattened to dotted lowercase keys with primitive leaves (arrays of
  primitives kept, anything else JSON-stringified, strings cut at 4 KB). Redaction stays where it is: the OTLP stream
  sees exactly the line stderr sees.
- **D5 Request id.** `RequestContext.requestId`. HTTP: set per request in `index.ts` where `runWithRequestContext`
  wraps `/mcp` and `/messages` (`{ ...connection.context, requestId: randomUUID() }`). stdio: the tool-call wrapper
  runs the handler inside a context with a fresh id when none is set. pino `mixin` adds `"request.id"` when present.
- **D6 Step records** (`info`, dotted attributes, message fixed per step):
  - every tool call, in `withAnalytics` (`analytics.ts:141-160`, already wraps all tools): `Tool call` with
    `tool.name`, `duration.ms`, `tool.outcome` (`ok`/`error`), `error.code` when the result is an action error;
  - swap tool results, in `registerActionTool` (`actionTool.ts:32-60`): `Swap tool result` with `tool.name`,
    `swap.status`, `quote.id`, `tx.hash`, `intent.hash` when the result carries them (the chain to follow a swap);
  - upstream calls, in `http.ts request()` (line 122): `Upstream call` with `upstream.service` (data, solver, swaps,
    relay, oracle, from the base URL), `http.method`, `url.path` (path only: the query can carry a user address),
    `http.status`, `duration.ms`; a failure logs at `warn` with `error.code`;
  - chain reads, in `sodax.ts bounded()` (line 199): a `label` argument, `Chain read` with `sdk.call`, `duration.ms`,
    `tool.outcome`; every caller passes its label (hub wallet, receipt, balance, NEAR storage, Stellar trustline…).
  The Discord alerts already log `alert: <kind>`.
- **D7 Failure isolation.** `BatchLogRecordProcessor` (queue 4096, batch 512, 5 s, export timeout 10 s); OTel `diag`
  routed to our logger at `warn`, through `redact`, one line per distinct message per 5 minutes. An export error never
  throws into a tool call.
- **D8 Flush.** `gracefulShutdown` (`index.ts:470`) awaits `shutdown()` after `shutdownAnalytics()`, capped at 2 s;
  `fatalExit` (`index.ts:451`) calls `forceFlush()` inside its 1 s window. Boot failures exit before the logger has
  an OTLP stream.
- **D9 Level.** Both streams follow `LOG_LEVEL`; tests run `silent` (vitest env), so the OTLP stream is tested through
  a built logger with an in-memory exporter, not the singleton.
- **D10 stdio installs** change nothing: the variables aren't set there.
- **D11 Engines.** `engines.node` `>=22.15.0` (the 3.0 SDK's requirement; the image is `node:22-alpine`, CI node 22).

## Changes

| File | Change |
|---|---|
| `package.json` | 4 deps pinned exactly (D1), `engines.node` (D11) |
| `src/services/otel.ts` (new) | `initOtelLogs(env, { exporter?, hostname? })` → `{ stream, forceFlush, shutdown } \| null`; config validation (D2); resource (D3); processor (D7); the line → `LogRecord` mapping (D4); diag throttle |
| `src/services/logger.ts` | `buildLogger(env, extraStream?)`; `mixin` for `request.id` (D5); `pino.multistream` when a second stream exists; `attachOtelStream()` so the singleton gets the stream at boot |
| `src/services/requestContext.ts` | `requestId?: string` |
| `src/index.ts` | request id per HTTP request (D5); `await enableOtel()` at boot (D2); flush paths (D8) |
| `src/services/analytics.ts` | `Tool call` record, stdio request id (D5, D6) |
| `src/tools/actionTool.ts` | `Swap tool result` record (D6) |
| `src/services/http.ts` | `Upstream call` record (D6) |
| `src/services/sodax.ts` | `bounded(call, timeoutMs, label)` + `Chain read` record (D6) |
| `README.md`, `.env.example` | env table rows for the five variables, a line in *Deployment notes* |
| hub `docs/repos/builders-sodax-mcp-server.md` | after merge, hub PR: logs ship over OTLP, which variables |

## Tests (each new one fails on the old code)

- `otel.test.ts` with `InMemoryLogRecordExporter`: disabled → `null` and no module loaded (`vi.resetModules` + spy on
  the import); enabled → resource attributes, severity per level, body, flattened attributes, `exception.*` from a
  viem-like error whose URL and body are redacted, `request.id` present; misconfiguration (no token, bad
  `DEPLOYMENT_ENV`, `http` endpoint in `staging`) → one `warn`, `null`; overflow past the queue drops without throwing;
  `shutdown()` flushes what the exporter holds.
- `logger.test.ts`: the mixin adds `request.id` inside `runWithRequestContext` and nothing outside.
- `analytics.test.ts`, `http.test.ts`, `sodax.test.ts`: the step records and their attributes (spy on the logger).
- `index.test.ts`: two concurrent `/mcp` requests get different `request.id`s.

## Verification

`pnpm checkTs`, lint, tests; `/simplify`; `/code-review`. Local: boot with the five variables against a fake endpoint
that answers 500 → the server serves, one throttled warn; against `http://127.0.0.1:4318/v1/logs` of a local
collector with the debug exporter when Docker is up (optional). Staging after the token and allowlist: the hub skill's
connect check, then one quote + track visible in Grafana under one `request.id`.

## Open points (PR thread)

- `url.path` keeps tx and intent hashes but drops the query (user addresses). The backend logs addresses; ask R0bi7
  which he wants.
- Full-URL endpoint (standard) vs base URL (backend convention): the README says which.

## Review of the plan (2026-11-10, one agent against the code) and what changed

Taken:
- **D5 → one `request.id` per tool call, set in `withAnalytics` for every transport.** `/mcp` is stateless (no
  `mcp-session-id`), a JSON-RPC batch would have shared one id, and the wrapper already surrounds every tool
  handler; index.ts keeps no request-id code. Records outside a tool call (boot, shutdown, drift check) carry none.
- **D7:** the OTLP `write` is wrapped whole (parse, map, emit) so nothing reaches a tool call; the SDK's
  diagnostics are logged with `otel.diag: true` and skipped by the OTLP stream, so a failing export can't feed
  itself; `diag.setLogger` with `suppressOverrideMessage` (a second init would otherwise log).
- **D8:** with a custom destination, `logger.flush(cb)` calls back at once, so the flush paths race
  `forceFlush()`/`shutdown()` against a timer instead of relying on it; the tee delegates `flush`/`flushSync` to
  stderr's sonic-boom.
- **D6 coverage:** `relay.ts` has its own `fetch`, so it logs through the same exported `logUpstreamCall`;
  `docsProxy.ts` stays out (M10). `rebuildSwapTx`'s `spoke.evm.deposit` (raw) encodes a tx without an RPC
  read (its test runs offline), so it is not a "Chain read" and stays outside `bounded`.
- **Tool call record** also carries `api_key.hash` (first 16 hex of `callerKeyHash()`) when a key is present:
  who did what, never the key. No `profile` (not in the request context) and nothing from the arguments.
- README's Node line → 22.15; the hub card's Node line is a hub PR after merge.

Noted, not changed:
- `NODE_ENV=development` (`pnpm dev`, `pino-pretty` transport) ships nothing: pino replaces the destination
  when a `transport` is set. Local verification runs the built server (`pnpm build && node dist/index.js`).
- stdio's stderr gains the `Tool call` records and `request.id` (M2 "ships nothing" still holds).
- `ORIGIN` is optional (`sodax.origin`), as the gateway skill says; the issue's AC lists it, so the PR says
  "when set".
- The exporter also reads `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`/`_HEADERS` from env on its own; the explicit
  `url`/`headers` are kept for clarity. The lockfile gains sdk-trace/sdk-metrics 3.0.0 through otlp-transformer.

## /simplify (2026-11-10, 4 agents) and what changed

- **pino `hooks.streamWrite`** replaces the hand-rolled tee destination: it receives the serialized line before
  the destination writes it, so stderr stays `pino.destination(2)` untouched, no flush delegation is needed, and
  the `pino-pretty` development path ships too (verified: 2 POSTs under `NODE_ENV=development`).
- **The SDK does the exception mapping**: `LogRecord.exception = { name, message, stack }` becomes
  `exception.type/message/stacktrace`; pino's other `err` fields flatten under `exception.*`.
  `logRecordLimits.attributeValueLengthLimit: 4096` replaces the manual cut; `defaultResource().merge(...)` keeps
  `telemetry.sdk.*`.
- **One record per tool call**: the swap ids (`swap.status`, `quote.id`, `tx.hash`, `intent.hash`, `chain.key`)
  join the analytics wrapper's "Tool call" record; actionTool.ts is back to development's version.
- **`timedFetch(url, init, ok)`** in http.ts does fetch + the "Upstream call" record for both `request()` and the
  relay client (which keeps its own body handling). `error.code` is the error's name everywhere (`errorName` in
  logger.ts); `bounded`'s timeout is a `TimeoutError`, like `AbortSignal.timeout`'s.
- `startOtelLogs(env, options)` in otel.ts owns config → warn → init → attach and logs the SDK's diagnostics itself
  (tagged `otel.diag`, redacted, throttled with a map that forgets entries older than 5 minutes and keys on the
  message's first 200 chars). index.ts keeps the `OTEL_LOGS_ENABLED` gate, the dynamic import and one handle for
  the flush paths; `sleep` is `node:timers/promises`.
- `bounded({ label, chainKey, timeoutMs }, call)`: options first, so call-site bodies keep their indentation.
  `isHttpsUrl` in constants.ts serves `parseRpcOverrides` and the OTLP endpoint check.
- Efficiency: everything measured in µs per record; the only fix was the diag map's eviction.
- Follow-ups noted, not done: `rebuildSwapTx`'s `deposit` outside `bounded`; older records' camelCase fields
  (`chainKey`, `quoteId`, `route`, `status` in source.ts / swapsApi.ts / track.ts) → dotted keys later.

## /code-review (2026-11-10, medium, 10 findings, all taken)

- `gracefulShutdown` awaited `provider.shutdown()` bare: a failing export rejects it, the `await` threw and `fatalExit`
  returned early on `exiting`, so the process hung until SIGKILL → `.catch(() => {})` on both exit paths, the
  shutdown timer unref'd.
- `url.path` carried user addresses on the address-keyed routes (`/intent/user/<addr>`, `/moneymarket/position/<addr>`)
  → `routeOf()` masks every id-shaped segment (`0x…` hex, or 24+ chars) with `*`; tx hashes in paths go too (the
  tool record has them).
- `OTEL_LOGS_TOKEN` with a space or non-ASCII made the exporter log the whole header value and send none →
  refused at config time (`/^[\x21-\x7e]+$/`).
- `request.id`: hybrid. index.ts sets one per HTTP request (`/mcp`, `/messages`) so transport-level records
  (auth refusals, limits, transport errors) carry it; the wrapper keeps an existing id and mints one only for
  stdio. A JSON-RPC batch shares the request's id, which is what it is.
- An `err` with no name and no message made the SDK warn "Failed to record an exception" → `exception` only when
  one of them is a non-empty string, else the whole `err` flattens under `exception.*`.
- `intent.hash` was never set (no swap tool emits `intentHash`; track emits `hubTxHash`) → `hub_tx.hash`.
- No detach: after `shutdown()` the hook kept parsing and emitting into a dead provider → `startOtelLogs`'s
  handle detaches on shutdown.
- `attributeCountLimit` 256 made explicit; `body` cut at 4 KB (the SDK's value limit doesn't cover it).
- `error.code` for a failed `fetch` was always `TypeError` → `errorName` reads `cause.code` first
  (ECONNREFUSED, ENOTFOUND, UND_ERR_CONNECT_TIMEOUT).
- README attributed the Node 22.15 floor to the SODAX SDK → the OpenTelemetry SDK.

## /code-review, second pass (2026-11-10, high, 9 findings, all taken) + own audit

- `routeOf` masked only hex / 24+ char segments, so NEAR account names and numeric ids leaked → every segment from
  the fifth on is `*` (the SODAX APIs' parameters live there), plus the id-shaped rule before that. Tested on real
  routes (`/v1/be/intent/user/alice.near`, `/v1/be/config/spoke/0xa4b1.arbitrum`, `/v1/swaps/quote` untouched).
- No test of the real hook path (`options.hooks.streamWrite` → attached destination) nor of the detach → the
  startOtelLogs test now logs through `buildLogger` (same options, the singleton is `silent` under vitest), sees the
  record arrive, shuts down, logs again, sees nothing new; also asserts a second `startOtelLogs` returns the first
  handle (double-start guard added).
- No test of the per-HTTP-request id → index.test spies `runWithRequestContext` (partial `vi.mock`), two `/mcp`
  requests get two distinct UUIDs.
- `flatten` bounded in depth but not width → a budget of 256 attributes (the SDK's `attributeCountLimit`); a
  1000-key object costs 256 leaves, not 1000.
- A string/number `err` was dropped → passed as the SDK exception (becomes `exception.message`).
- A throwing tool's record had no `error.code` → `errorName(err)` (class name, never text).
- The exporter also merges `OTEL_EXPORTER_OTLP_HEADERS` / `_LOGS_HEADERS` from env and prints a bad value whole
  → `otelLogsConfig` refuses to start shipping while either is set; README says so.
- Tests left global state (diag logger, attached destination) → `afterEach` detaches, `diag.disable()`, shuts
  every handle down.
- Own audit: AC1 "no OTel module loaded when unset" had no test → a source-shape test: logger.ts imports only a
  type from otel.js, index.ts imports it only via `await import()` after the `OTEL_LOGS_ENABLED === "true"` gate.
  AC5 "drops past the queue without throwing" → 5000 writes into an exporter that never answers, no throw.
  README: `DEPLOYMENT_ENV` is independent of `SODAX_ENV` (the test server runs canary + staging).
- Deploy artifacts checked: docker-compose (local only), nixpacks, Dockerfile, server.json (no env section),
  workflows: nothing to add. The five variables are in code, README table, deployment notes and `.env.example`.

## Security review (2026-11-10, /security-review agent, after PR #111 was opened)

No HIGH or MEDIUM finding. Checked and holding: the bearer token is a static header on `http.request` (no redirect
following; 3xx not retried; the generic `OTEL_EXPORTER_OTLP_ENDPOINT` can't override the explicit `url`;
`*_HEADERS` refused; token header-safe so the one SDK message that prints a value can't fire); every diag message
goes through `redact` and is dropped from the OTLP stream; the new records carry only whitelisted codes, a 16-hex
key hash, the documented swap ids, host + masked route (user addresses sit at segment ≥ 5 or are hex; the one
index-4 case is a partner receiver); pino escapes keys and values, so tool arguments can't forge `level` or
`request.id`; `flattener` leaves are primitives, so `__proto__` keys are inert; the hook can't throw, exits are
timer-bounded. Below the bar, fixed anyway (uncommitted in the worktree): `errorName` took any string `cause.code`
(viem puts the raw RPC error there), now only a code-shaped one (`/^[A-Z][A-Z0-9_]{1,63}$/`), with a test.

## Residual risks closed (2026-11-10, user: "fix được không")

- The "parameters from segment 5" convention is now a test: every data-API route in the drift check's
  `TOOL_CONTRACT` with a `:param` gets a sample value (hex for hash/address/receiver, a short plain `x1` otherwise)
  and `routeOf` must hide it; a new route with a param in an unmasked spot fails the suite.
- `flattener` stops one short of the attribute limit and sets `log.attributes_truncated: true`, so a cut record
  says so in unified logging (stderr keeps the whole line).
- The exporter is wrapped to count records accepted and lost (`exported`, `failed`, `lastFailureAt`);
  `/health` reports `unifiedLogging: { on, exported, failed, lastFailureAt }` or `{ on: false }`, so a token or
  allowlist problem shows there before Grafana. README `/health` row + deployment notes updated.
- Plus the security review's below-the-bar item: `errorName` takes `cause.code` only when code-shaped.
- All four uncommitted in the worktree (992 tests, checkTs, lint, build green); they go into PR #111 on the
  user's commit + push.

## /simplify on the residual-risk fixes (2026-11-10, 4 agents)

Taken: `stats` lives in `initOtelLogs`'s closure and `counting(inner, stats)` is a plain exporter wrapper;
`@opentelemetry/core` 3.0.0 (already in the lockfile, 2026-10-20) is a direct dep so `ExportResultCode` replaces
the literal; a `written` counter next to `exported`/`failed` so `/health` also shows records the queue dropped
(the SDK's `queue_full` drop is invisible to an exporter wrapper); `lastFailureAt: string | null` like
`openUntil`; `errorName`'s rule is `/^[A-Z0-9_]+$/`; one `stubExporter` helper in otel.test.
Kept: the `log.attributes_truncated` marker (the SDK's `droppedAttributesCount` never fires, the flattener stops
first, and the gateway's columns don't show it); the hex sampler in the contract test (`/intent/:intentHash` sits
at index 4 and is hex on the wire; dropping the sampler would fail it for the wrong reason).
Deferred, proposed as a follow-up PR after #111: log the route template from the call site (`fetchJson(url,
{ route })`, ~28 sites in sodaxApi.ts behind `apiUrl()`/`pathParam()`, plus swapsApi's private `routeOf`), so
logs keep `/moneymarket/asset/all` apart from `/moneymarket/asset/:reserveAddress` instead of both becoming `*`.
The heuristic hides every parameter today (contract test); the cost is precision, not exposure.

## /code-review on the residual-risk fixes (2026-11-10, medium, 9 findings: 8 fixed, 1 documented)

- The flattener filled all 256 slots, so on a wide error record the SDK dropped `exception.*` (it sets them after
  ours) → budget 252 leaves: 3 for the exception, 1 for the marker; test: a 1000-key error record keeps
  `exception.type/message/stacktrace` and the marker.
- A hung gateway timed out in the processor (10 s), bypassing the counting exporter → exporter timeout 8 s, so
  the failure is counted and `lastFailureAt` set.
- `@opentelemetry/core` as a direct dep: an enum compared across two copies of the package would stop
  type-checking on a lopsided bump → dependency removed again, literal `0` with the comment.
- The marker fired on an empty or all-null object past the budget → only when something would have become an
  attribute; test for 252 leaves + `{}` + `{ a: null }`.
- `written` counted after `emit` even when the queue dropped → semantics documented (`written` = handed to the
  SDK, queue 4096), no code change beyond the doc.
- `errorName` read only `cause.code` → the error's own `code` first (ECONNRESET), then the cause's, both
  code-shaped.
- `inner.forceFlush?.()` guarded a required method → plain call.
- The /health test did a real fetch to the production API and cleaned the cache inline → fetch stubbed for the
  non-local call, `clearCache()` in the file's `afterEach`.
- Documented only: a 2xx with `partialSuccess.rejectedLogRecords` is SUCCESS to the exporter (it only
  diag-warns), so `exported` counts those records; README and the stats doc say so.
Gates after: 993 tests, checkTs, lint, build; live: sink 200 → written/exported climb together, sink 500 →
failed + lastFailureAt, clean exit.

## End-to-end against the real stack (2026-11-10, local sodax-observability via Colima)

`repos/infra/sodax-observability` has a local mode (`docker-compose.yml` + `docker-compose.ci.yml`, `.env.example`
CI tokens, `scripts/smoke-test.sh`). Its own smoke test: 23/23. Then the built MCP (PR tip) with
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=http://localhost:4318/v1/logs`, `OTEL_LOGS_TOKEN=ci-token-backend-dev`,
`DEPLOYMENT_ENV=dev`, real tool calls through the MCP SDK client (`sodax_get_supported_chains`,
`sodax_get_intent` with a bogus hash):
- rows in `otel.otel_logs` for `ServiceName='builders-mcp'`: written = exported (50 boot records, +3 per call
  pair); the collector's `filter/invalid_resource` counter unchanged, so our resource passes the ingest contract;
  `ServiceNamespace`, `DeploymentEnvironment=dev`, `service.version=1.6.0`, `service.instance.id`,
  `sodax.origin` stored.
- one call's chain by `request.id`: `Upstream call` (`/v1/be/intent/*`, 404, 315 ms) → `Tool call`
  (`sodax_get_intent`, ok, 316 ms), same id; step records without an id are only the boot/health-time
  `docs-json` and `config/spoke` reads (drift check, network count), as designed.
- no key-shaped secret in Body or attributes; 0 diag warns; SIGTERM: "Shutting down" lands (50 → 51 rows).
- Found and fixed: the collector's `redaction` processor masks values under keys matching `api[._-]?key`, so
  `api_key.hash` would have arrived as `****` → renamed `caller.key_hash` (+ test), commit 606156d.
- Also visible: static segments past index 4 are masked too (`/v1/be/config/spoke/chains` → `.../spoke/*`),
  the precision cost the route-template follow-up would remove.
- Hedera contract tests: the HBAR quote fails identically on `development` (live canary `SWAP_REJECTED`); the
  balance read passed on a rerun (public RPC timeout).
Stack torn down (`down -v`, `.env`/`.data` removed), Colima stopped.
- Pre-commit then caught a flake of my own making: `clearCache()` in index.test's afterEach sent the global-limit
  test's 100 parallel `/health` calls to the real data API (no in-flight dedup in the TtlCache) → timeout. One
  `beforeEach` fetch stub for the whole suite (f351e5f). Test report posted on #110 (2026-11-10).

## Coverage review of the step records (2026-11-10, after the user asked "quote rồi submit, sao biết là một luồng")

Robi's ask is "log every step from request to response". Checked against the code, not the PR text:
- Every tool, `docs_*` included, goes through the `server.tool` wrapper (no `registerTool` anywhere) → "Tool call".
- Every swap-side network call (data API, solver, Swaps API, relay) goes through `fetchJson`/`timedFetch` → "Upstream call".
- 8 `bounded()` sites (hub wallet, receipt, block number, tx known, balance, NEAR storage, Stellar trustline, oracle) → "Chain read".
- Swap failures: `actionTool` logs unexpected errors with the stack; `ActionError` → `error.code`; operator alerts → `error`
  records with `alert`; quote cache full → `warn`. HTTP 500 → "Unhandled HTTP error" with stack.
- Cross-request linking: `request.id` is per HTTP request, so quote → track → cancel link through `quote.id` and `tx.hash`
  on the "Tool call" records. The first track call must carry `quoteId` (the server submits only with the quote), so its
  record holds both ids; later track-by-hash calls carry `tx.hash` only, which is enough.

Gaps found and fixed (commits after f351e5f):
1. No record for a request a guard refused (429, 413, batch cap, invalid JSON) nor for initialize / tools/list →
   `logMcpRequests` in index.ts, mounted `app.all(["/mcp","/messages","/sse"], …)` before the limiters (routed, so
   `/MCP/` counts like the handlers do; a `Set` on `req.path` missed those). It mints the id, opens the request context
   with `runWithRequestContext({ requestId }, next)`, and on the response's `close` logs one "HTTP request" record
   (`http.method`, `http.route` lowercased without trailing slash, `http.status`, `duration.ms`, `mcp.method`
   whitelisted / "batch" / "other", `client.ip_hash`, `http.aborted`); `error` for 5xx, else `info` (the status is the
   attribute; a 4xx-minus-exceptions rule would accrete: 405/406/415 are the SDK's protocol answers). The handlers
   extend the context (`{ ...getRequestContext(), ...connection.context }`), so every record from the middleware on
   shares the id: the simplify altitude agent probed ALS through express-rate-limit + express.json on Node 22/24/26
   with the repo's Express (bodies split across TCP writes too) and it holds; my first version carried the id in
   `res.locals` on the wrong premise that ALS is lost in body-parser, and left createServer's records and `/sse`
   without an id. `/health` and the pages are not logged (noise). On GET /sse the record is the session's.
2. A non-swap tool that threw logged at `info` with the class name only → `logToolCall` takes the thrown error, logs at
   `error` with `err` (stack, redacted). Swap tools never throw (actionTool), so no double record.
3. The docs MCP POST (`docsProxy.ts`) bypassed `timedFetch` → routed through it, so `docs_*` calls have an upstream record.
Dropped: "quote.id on track-by-hash from the claimed quote" — wrong premise. `resolveSource` finds a quote only by
`quoteId` (no deposit-tx index in quoteCache), so without `quoteId` the server has no quote at all; nothing to log.
Cross-service join, resolved without asking (the user: "sao hỏi sao không sửa?"): the backend has shipped no logging
attributes yet (no `intent.hash` strings, no OTel deps), its spec only lists `intent.hash`/`tx.hash`/`chain.id` as naming
examples, and its own code looks an intent up by the hub tx (`GET /intent/tx/{dstIntentTxHash}`). The data API's key is
`intentHash` = keccak256 of the `createIntent` struct (IF-11); the SDK has `EvmSolverService.getIntentHash(intent)`, pure,
and the server holds the struct in the cached quote → `intentHash()` in sodax.ts (strings → bigint), exposed on the quote,
track and cancel results and logged as `intent.hash`. Verified: 3/3 real intents of the test wallet from
`/intent/user/<addr>` hash to the API's `intentHash`. The hub card's caveat (intentHash not unique over time) is fine for
logs: `tx.hash` sits beside it.
Noted, not changed: "Tool call" is `info` even on `tool.outcome=error` (Grafana filters on attributes; crashes are `error`);
data tools' `isError` results carry no `error.code` (the "Upstream call" status under the same id explains them).

### Simplify + code-review round on the sweep (2026-11-10, evening)

/simplify (4 agents): moved the id to the AsyncLocalStorage context opened by the middleware (the altitude agent
probed ALS through express-rate-limit + express.json on Node 22/24/26: it holds), routed mount `app.all([...])`
instead of a `Set` on `req.path` (`/MCP/` was missed), `mcpMethod()` helper, no try/catch in the close listener,
handler-failure tests via a spied `createServer` instead of `hashClientIp` throwing (that throw had moved into the
middleware), one `httpRequestRecord(spy, match)` test helper (matched, because an SSE stream aborted in afterEach
writes its record during the next test).
/code-review: 10 findings, 8 fixed:
- `mcp.method` unbounded (probe: a 60 KB letter string logged verbatim) → whitelist derived from the SDK's own
  `ClientRequestSchema.options` + `ClientNotificationSchema.options` (22 methods), else "other"; "batch" for arrays;
  undefined only when nothing was parsed (body-parser leaves `{}` after a failed parse → "other").
- `err` on a thrown tool error carried the message (may echo agent input) → `whereThrown()`: class + stack frames only;
  test "never its text" restored.
- 429 records unbounded by the limiter (flood → OTel queue churn evicts real records) → request record at `debug`
  for 429; `rateLimitHandler` on both limiters logs one `warn` "Rate limited" per client per window
  (`used === limit + 1`), with `rate_limit.limit`, `rate_limit.window_ms`.
- `client.ip_hash` reversible without `POSTHOG_CLIENT_ID_SECRET` (2^32 sha256) → only when keyed (`CLIENT_ID_KEYED`).
- `http.aborted` meaningless on /sse and status 200 on an early abort → dropped; `http.status` only when headers sent.
- 500 logged twice at error → request record always `info`/`debug`; the error handler's record carries the stack.
- `hashClientIp` twice per request → once, in the context as `clientId`; handlers read it.
- Tests for 500, /messages, batch, "other", exactly one record, keyed flag, once-per-window.
Not done: moving `logMcpRequests` into httpGuards.ts (relocation only); `{ result, thrown }` arg object (churn).
Smoke on the build: 62 pings → 7×429 at debug, one "Rate limited"; 3000-char method → "other"; keyed hash present with
the secret; an aborted tools/call → record without `http.status` (see the probe note below).

### Independent review's six findings (other machine, 2026-11-10, at 05d4b5c) → fixed in e973996

1. SDK-refused calls (unknown tool, invalid args) had no record: `withAnalytics` now also wraps the protocol layer's
   `tools/call` handler (`server.server.setRequestHandler`, installed by McpServer after our hook) and logs a "Tool call"
   with `TOOL_NOT_FOUND` / `INVALID_ARGUMENTS` / `TOOL_DISABLED` when the result is `isError` and no handler ran (WeakSet
   of `extra`); the name is logged only if registered on that server, else "other". McpError text comes prefixed
   "MCP error -32602: ", stripped before classifying.
2. `timedFetch` logged at headers: now `timedFetch(url, init, ok, read)` returns `{ response, body }` and logs after the
   body is read (status + `error.code` on a body failure). `request()`, relay and docsProxy pass their readers.
3. Keyless shared reads (oracle, catalog) dropped `request.id`: `withoutCredentials()` keeps `requestId`/`clientId`;
   a caller joining an in-flight catalog refresh logs `refresh.request.id`.
4. "Rate limited" named a client-typed path: `knownRoute()` → one of /mcp,/messages,/sse,/health,/api or "other".
5. Batch crossing the limit skipped the warning: `logRateLimited()` shared by the limiter handler and `countBatch`.
6. Boot: OTel start moved before the SODAX_ENV / SODAX_SWAP_USD_WARN checks; verified with a loopback sink (one batch
   each before exit 1).
Tests: 1005. Smoke: both fatal boots exported a batch.

