---
type: process
repo: builders-sodax-mcp-server
github: 110
updated: 2026-11-11
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

- 2026-11-11, after `1aab810`: compared with the backend producer (sodax-backend origin c69b50be) and the solver spec (repo
  not readable, 404). Backend: same transport, batching, env, lowercase severity, endpoint rule; but no request id at
  all (nothing reads X-Request-Id; ApiKeyGuard copies it only into Mongo usage rows) and no swap ids as attributes
  (tx hash, intent hash, chain only inside the message text), so no cross-service join works today except a Body LIKE on
  the tx hash. For Robi: shared-logger reads/creates X-Request-Id as `request.id`; swaps-api swap lines get `tx.hash`,
  `chain.key`, `hub_tx.hash`, `intent.hash`; solver maps `intent_hash`/`intent_tx_hash`. MCP side, `99f83c1`: every
  remaining camelCase log key to the dotted names (swap records, alerts through a typed LOG_NAMES map with
  `callerKeyTag()` shared with analytics, boot/drift counts); a GIT_SHA service.version was tried and dropped (user:
  nothing sets it). /code-review xhigh before the push: 15 findings, fixed all but HttpError's own camelCase fields
  under `exception.*` (pre-existing) and chain.key on the NEAR/Stellar recipient reads (would change a signature for
  little).

- 2026-11-11 (user: "robi chưa review … cứ làm", then "simplify và code review thật kĩ"): added to #111, uncommitted:
  `X-Request-Id` response header (logMcpRequests) and outbound on SODAX API origins (timedFetch; key rule unchanged);
  drift check as one warn record (`DriftReport.details`, CLI prints it with `writeSync`). Dashboard id filter was built,
  tested against local ClickHouse, then dropped and its local branch deleted (user: "tôi chỉ muốn sửa PR này thôi").
  /simplify (4 agents): shared test `connect()`, pino's level labels, `urlTemplate`, header table tests. /code-review
  xhigh (13 findings): fixed the endpoint rule (append only to a bare origin), `server.address` without port, README
  429 level and SSE header note, CLI write; reverted the oracle change (lost the timeout warning) and `withTimeout`.
  Dismissed: 4096-char cut of `details` (report ~2 KB, stderr full), id to relay or across a redirect (random per
  request), registry seeding in tests (already seeded by other tests), unknown pino levels, untested guarded start
  (`main` not exported). 1021 tests, tsc, lint, build; `check:drift` prints 25 issue lines.

- 2026-11-11 (user: "review tổng hết PR 111 … architect, solution"): one independent agent review (code, the ask, the
  backend spec and shared-logger to compare; not my conclusions). Verdict: sound approach, merge after the record
  contract is fixed; no data leak. Verified each point, then changed (uncommitted, 1014 tests, tsc, lint, build):
  severity text lowercase like the backend's winston levels (the explorer's filter lists DISTINCT SeverityText);
  attributes renamed to OTel conventions (`http.request.method`, `http.response.status_code`, `server.address`,
  `url.template`, `error.type`, `mcp.method.name`, `gen_ai.tool.name`) while nothing queries them; the endpoint takes
  the base URL too (backend's `logsUrl`); a failure to start OTel warns and keeps serving; a test that a tool's own
  isError gets one record (fails if `handled` breaks); README record catalog table. Kept as follow-ups: `service.version`
  from `GIT_SHA` (backend) instead of the package version; move the wrapper off the deprecated `server.tool` (tests catch
  a migration); the oracle's duplicate `Chain read` next to its `Upstream call`; the lazily created alert-summary timer
  inherits the first request's id; `x-request-id` response header, outbound `traceparent`, `mcp.session.id`, the
  destination chain; stdio exit flush; `intentHash` guard. Dismissed: gating stdio (users have no token or allowlist);
  5xx `HTTP request` at info (the 500 path already logs `Unhandled HTTP error` at error).

- 2026-11-11 (user: "test 111 á"): the live gateway answers 403 from this machine's IPv4 (not allowlisted), so the run
  used sodax-observability main dce7f63 (#25) locally: smoke 23/23, `ci-token-buildersmcp-dev` 200, a bogus token 401.
  The built #111 tip `e7a7278`, `SODAX_ENV=canary`, `DEPLOYMENT_ENV=dev`: initialize, tools/list, two read tools, an
  unknown tool, invalid arguments, a canary quote (`swapCanary.ts` dry run, nothing signed) and a track of that quote
  with a fake tx hash. In ClickHouse: 111 rows = 111 stderr lines, `failed` 0, the ingest filter counter unchanged
  (2, the smoke test's); the quote request chains 11 step records (Upstream call, Chain read) to its Tool call and HTTP
  request by `request.id`; quote and track share `quote.id` and `intent.hash`; `url.path` values are routes; the API
  key appears nowhere; boot-time upstream reads carry no id (as designed); the heartbeat landed at +5 min with the
  counts; SIGTERM flushed "Shutting down"; the merged liveness query skips `builders-sodax-mcp-server/dev`.
  Found: a swap tool called on a keyless connection was logged as `other` (the per-connection server has no swap
  tools). Fixed, uncommitted: the refusal record also names a tool the registry knows (`getToolModule`), plus a test
  that fails without it; 1012 tests, tsc, lint green; rerun shows `sodax_swap_track` / `TOOL_NOT_FOUND`. Also seen,
  not changed: the boot drift check writes its report as ~45 one-line WARN/INFO records.
  Colima: a bind mount from `/private/tmp` is empty inside the VM (only $HOME is shared), so ClickHouse restarted
  silently; run the stack from under $HOME.

- 2026-11-11: #111 `e7a7278` pushed (route templates, heartbeat, Swaps API `url.path`, masked upstream ids), CI green, body refreshed. Robi merged icon-project/sodax-observability#25 (three tokens incl. dev, allowlist line, liveness exclusion for staging/dev) and set `OTEL_LOGS_TOKEN` + `DEPLOYMENT_ENV` in Coolify for staging and prod; `OTEL_LOGS_ENABLED` and the endpoint are missing (his Slack table lists only the token and env). Hub draft updated for #25.
- 2026-11-10: Reviewed [PR #111](https://github.com/gosodax/builders-sodax-mcp-server/pull/111) at `05d4b5c` against #110, the backend producer spec, and the collector's actual ingest configuration. GitHub Build and Test, API Drift Check, and Docker build were green. A detached worktree passed `checkTs`, `lint`, `build`, and all 998 tests under Node 22.15 with the frozen lockfile. Targeted checks used a local Express app, synthetic upstream responses, an in-memory OTel exporter, and a loopback protobuf receiver. No staging credentials or live swaps were used.

### History moved from brief.md (2026-11-11)

- Opened 2026-11-09 22:35 (local) at R0bi7's ask (Slack 22:29: log every step request → response, stream into unified
  logging, modelled on sodax-observability `docs/specs/unified-logging-backend.md`; "the observability part of the MCP";
  then Grafana alerts → Slack). Task, sub-issue of #79, board Sodax #1 (Backlog, Builders MCP), assignee: me.
- Issue body = decisions M1–M11, env table, record mapping, rollout, AC (`issue.md`). Key choices: pino OTLP destination
  (`pino-opentelemetry-transport` first candidate, `@opentelemetry/sdk-logs` fallback), env-only activation, resource
  attributes `service.name=builders-mcp` / `service.namespace=builders-sodax-mcp-server`, redaction kept as a hard rule
  (SDK/viem errors carry URLs), `request.id` via the existing `RequestContext`, one `info` record per step.
- Code facts (development @ #102): `src/services/logger.ts` pino → stderr fd 2, `redact`/`redactErr`; `RequestContext`
  has apiKey + partnerFee only; tool calls logged only on failure (`actionTool.ts`); PostHog `tool_called`; Discord alerts.
- Public repo: the issue names no gateway host, token or IP. The backend spec is in the private sodax-observability repo.

- Review at `05d4b5c`: CI and 998 local tests passed. Local reproductions show unsafe global rate-limit path logging and gaps in request correlation, SDK-level error outcomes, upstream body failures, batch refusals, and early boot flush. See `process.md` for the reproduction conditions and suggested fixes. Staging delivery remains unverified by this review.

- 2026-11-10 (implemented in `.claude/worktrees/110-unified-logging`, uncommitted): otel.ts (config → resource → BatchLogRecordProcessor
  4096/512/5 s → OTLPLogExporter proto with bearer; pino line → LogRecord: level→severity, `err`→`exception.*`, dotted flatten,
  `otel.diag` lines skipped; `write` never throws; diag throttled 5 min), logger.ts tee destination (`attachOtelLogs`, `flush`
  delegated, `buildLogger` for tests, mixin `request.id`), analytics.ts `Tool call` record + request id per tool call
  (+`api_key.hash`), http.ts `logUpstreamCall` used by request() and relay.ts, sodax.ts `bounded(call, {label, chainKey,
  timeoutMs})` → `Chain read`, actionTool.ts `Swap tool result`, index.ts `enableOtelLogs` + flush races. Deps pinned: api
  1.10.0, sdk-logs 3.0.0, exporter-logs-otlp-proto 0.300.0, resources 3.0.0; engines ≥22.15. Gates: 972 tests (17 new in
  otel.test.ts + 5 extended files, all red on the old code), checkTs, lint, build. Live: built server → local sink got 3
  protobuf POSTs with Authorization (boot, request, SIGTERM flush); sink 500 → one `otel.diag` warn, /health 200; bad
  DEPLOYMENT_ENV → one warn, off, no token in logs. Plan review (agent) findings folded in: see plan.md §Review.

- 2026-11-10 final state (uncommitted, 17 files +522/−62 plus otel.ts and otel.test.ts): /simplify and /code-review applied
  (plan.md §/simplify, §/code-review). Gates: 976 tests (otel.test.ts + 5 extended files red on the old code), checkTs, lint,
  build. Live with the built server: 2 protobuf POSTs with bearer and a clean exit on SIGTERM; gateway 500 → one tagged diag
  warn, /health 200, no token in logs, and the process still exits on SIGTERM with records queued (the hang the review
  found); bad DEPLOYMENT_ENV → one warn, off; NODE_ENV=development ships too (streamWrite hook).

- Plan posted on #110 as comment 6757883403 (2026-11-10): how it works, env, why not the pino transport, infra needs,
  rollout, out of scope, the two deviations (request id per HTTP request / stdio call; semconv names, `hub_tx.hash`).

- 2026-11-10: committed `4b2339d` (`feat: ship the logs to unified logging over OTLP`, Closes #110; commitlint caps body lines
  at 100 chars, took two tries) and pushed `feat/110-unified-logging`; PR #111 → development, reviewer R0bi7, body from
  `pr-body.md`; CI green (Drift Check, Build and Test, Docker build). #110 plan comment and the #79 pre-release line point
  at #111. Worktree `.claude/worktrees/110-unified-logging` kept for review fixes.

- 2026-11-10 (user: "push đi"): `cc5c321` `feat: show log shipping on /health and tighten the records` (Refs #110) pushed onto
  PR #111 after a second /simplify + /code-review round (plan.md); PR body refreshed (993 tests, /health field, marker,
  contract test, errorName). Worktree clean.

- 2026-11-10: end-to-end through the real sodax-observability stack run locally (plan.md §End-to-end): records land in
  ClickHouse with the right resource, pass the ingest filter, chain by `request.id`, flush on SIGTERM; found the gateway
  redacts `api*key`-named attributes → `caller.key_hash` (606156d); index.test off the network (f351e5f).
- 2026-11-10 evening: coverage review vs "log every step from request to response" → 05d4b5c: an "HTTP request" record per
  MCP request (refusals included, context opened in the middleware), "Rate limited" once per window, frames-only error on a
  thrown tool, docs MCP call instrumented; details plan.md §Coverage review and §Simplify + code-review round.

## Findings

- `httpGuards.ts:63`: The global limiter logs a caller-controlled path under `http.route` for its first 429, including on unmatched routes. A synthetic key in that path reached the exporter. The collector's key and bearer-pattern backstop does not mask it. Emit a fixed route label or omit it for unmatched routes.
- `swap/usd.ts:29` and `swap/tokens.ts:94`: The empty keyless context drops `request.id` for the quote's oracle fetch and both cold catalog calls. Keep correlation while removing credentials. For a shared refresh, retain a link for callers joining existing work if they also need to follow it.
- `analytics.ts:184`: SDK lookup and input validation run before the wrapped callback. Unknown and invalid tool calls returned HTTP 200 with `isError: true` but no tool outcome reached the exporter. Capture the sanitized result at the SDK or MCP transport boundary, including results returned over SSE.
- `http.ts:159`: `timedFetch` logs when headers arrive. A synthetic 200 with a body that times out logged a successful status and header latency with no upstream error code. Include response consumption in the measurement and record body failures without the payload.
- `httpGuards.ts:113`: A two-message batch after 59 requests bypassed the rate-limit warning, and the next rejected request was also silent at the default level. Share the first-crossing warning between single requests and batches.
- `index.ts:492`: Invalid `SODAX_ENV` or `SODAX_SWAP_USD_WARN` exits before OTLP attaches. The loopback receiver got no record for an invalid `SODAX_ENV`, while an invalid swap-tools flag after initialization shipped a fatal record. Initialize the exporter before those two startup checks so the existing fatal flush can send their records.

Addressed: all six in e973996 (plan.md §Independent review's six findings).

## Changes During Work
