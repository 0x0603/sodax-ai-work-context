---
type: issue
repo: builders-sodax-mcp-server
github: 110
status: Active
tags: [mcp, observability, logging, otlp, sodax-observability]
updated: 2026-11-09
related_decisions: []
---

# GH-110 Unified Logging Observability

- Source: https://github.com/gosodax/builders-sodax-mcp-server/issues/110
- Started: 2026-11-09
- Related PR:

## Problem

## Context

## Acceptance Criteria

## Related

- Knowledge:
- Decisions:

## Body as filed (2026-11-09)

### What needs to be done

Ship the MCP server's logs to SODAX unified logging (`sodax-observability`: OTel Collector gateway in front of ClickHouse, read through Grafana) over OTLP, and make every tool call traceable from the request to the response, so that alerts (Grafana → Slack) can be built on the swap tools. The producer contract follows `icon-project/sodax-observability` `docs/specs/unified-logging-backend.md`, adapted from winston/NestJS to this server's pino logger. Asked by R0bi7 on 2026-11-09; this is the observability part of the Sodax MCP (#79).

**Today.** `src/services/logger.ts` writes pino JSON to stderr (fd 2, never stdout: the stdio transport owns it), redacts RPC URLs, request bodies and SODAX keys (`redact`, `redactErr`), and Coolify keeps the container output. Nothing leaves the host. A tool call is logged only when it fails (`actionTool.ts`), the `tool_called` analytics event goes to PostHog, and operator alerts go to Discord (`src/services/swap/alerts.ts`). There is no request id: `RequestContext` (AsyncLocalStorage) carries the caller's key and partner fee only.

**Decisions** (M1–M11, mirroring the backend spec's B1–B13):

| # | Decision | Why |
|---|---|---|
| M1 | **One logger, one more destination.** `logger.ts` gains an OTLP destination next to stderr; call sites don't change. Candidate: `pino-opentelemetry-transport` (worker thread, standard `OTEL_*` variables, `BatchLogRecordProcessor`); fallback if its pins fail the supply-chain cooldown: `@opentelemetry/sdk-logs` + `@opentelemetry/exporter-logs-otlp-proto` behind a small pino destination. Decided in the PR, pinned exactly. | Same shape as the backend's `shared-logger`; stderr stays the local record. |
| M2 | **Activation by env only.** `OTEL_LOGS_ENABLED=true` creates the destination; unset or anything else loads no OTel code (dynamic import). stdio installs on users' machines never set it, so nothing is shipped from there. | Rollback is an env change and a restart; no code revert. |
| M3 | **Resource attributes from env.** `service.name=builders-mcp`, `service.namespace=builders-sodax-mcp-server`, `deployment.environment=$DEPLOYMENT_ENV` (`staging` on the development test server, `prod` on production, `dev` locally), `sodax.origin=$ORIGIN` (the host), `service.version` (package version, as `/health` reports it), `service.instance.id` (hostname). A record missing a required attribute is dropped silently by the gateway, so misconfiguration logs one `warn` at boot and the destination stays off. | The gateway's contract (see the spec and the hub skill `unified-logging-connect`). |
| M4 | **Failure isolation.** Export is asynchronous and bounded (queue, batch, drop on overflow); a wrong token or an unreachable gateway produces diagnostic errors only and never slows a tool call, blocks boot or crashes the server. The SIGTERM path (which already posts the stop message) and the boot-failure `process.exit(1)` flush first. | Logging must never cost a swap. |
| M5 | **Redaction stays in the producer, and is a hard requirement.** Everything exported goes through the existing `redact` / `redactErr`: no RPC URL (paid ones embed keys), no request body, no SODAX API key (the caller is identified by `callerKeyHash()`), no private key. Wallet addresses, tx hashes, quote ids and intent hashes are fine. Differs from the backend's B7 because SDK and viem errors carry URLs and bodies. | Same rule the Discord alerts already follow. |
| M6 | **A request id on every record.** Each MCP call gets `request.id` (HTTP: `mcp-session-id` + a per-call id; stdio: a per-call id), stored in `RequestContext` and added to every pino record through a mixin, so one call's records can be pulled together in ClickHouse. | "Every step from request to response" needs a key to join on. |
| M7 | **One `info` record per step**, with attributes in dotted lowercase keys (`tool.name`, `chain.key`, `quote.id`, `intent.hash`, `tx.hash`, `swap.status`, `error.code`, `duration.ms`, `upstream.service`, `upstream.status`): the tool call received (tool, profile, key hash, argument shape without values that could be secrets); each upstream call (data API, solver, Swaps API, relay, RPC by chain) with status and duration, never the body; each SDK chain read; the result (outcome or error code). Track and cancel add `swap.status`. | These are the fields Grafana alerts filter on. |
| M8 | **Level.** The OTLP destination follows `LOG_LEVEL` like stderr; `info` ships from day one, no separate knob. | One level to reason about (backend B12). |
| M9 | **The analytics event and the Discord alerts stay.** PostHog `tool_called` is product analytics; Discord is the paging channel until Grafana alerts exist. Neither is a log and neither replaces unified logging. | Different readers. |
| M10 | **Out of scope.** Traces and metrics; auto-instrumentation that patches modules; log shipping from users' stdio installs; the `/health` endpoint's shape; the docs MCP proxy's own logs. | Phase 1 is logs. |
| M11 | **Infra prerequisites are tracked here, done by infra.** A token per environment (staging, prod) delivered through the secret channel and set in Coolify env only; the test server's and production's egress IPv4 on the ingest allowlist. | The producer can't connect without them. |

**Env** (the server's own, documented in the README table and `.env.example` with empty values):

| Variable | When | Meaning |
|---|---|---|
| `OTEL_LOGS_ENABLED` | optional | `true` turns the OTLP destination on; anything else, off. |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | when enabled | The gateway's `/v1/logs` URL (from the sodax-observability README). |
| `OTEL_LOGS_TOKEN` | when enabled | Bearer token per environment. Secret: Coolify env only, never in the repo, the PR or this issue. |
| `DEPLOYMENT_ENV` | when enabled | `prod`, `canary`, `staging` or `dev`; becomes `deployment.environment`. |
| `ORIGIN` | when enabled | The host, becomes `sodax.origin`. |

**Record mapping** (what lands in ClickHouse): `Timestamp` = pino `time`; `SeverityText`/`SeverityNumber` from the pino level (`fatal` 21, `error` 17, `warn` 13, `info` 9, `debug` 5, `trace` 1); `Body` = `msg`; `ServiceName` and the resource attributes from M3; `LogAttributes` = every other field, `err` serialized as `exception.type` / `exception.message` / `exception.stacktrace` after `redactErr`.

**Rollout**

1. PR: destination, request id, step records, tests, README and `.env.example`; `OTEL_LOGS_ENABLED` unset, so nothing changes for anyone.
2. Development test server: token and allowlist from infra, `DEPLOYMENT_ENV=staging`, `OTEL_LOGS_ENABLED=true`, redeploy; the connect check from the hub skill, then one swap quote and track visible in Grafana with their `request.id`.
3. Production, after the stack's release: `DEPLOYMENT_ENV=prod` and the prod token.
4. Grafana alerts to Slack on `swap.status` / `error.code` / severity (R0bi7, reader side, its own task in sodax-observability).

### Why it needs to be done

The swap tools move real funds through an agent, and today the only records are the container's stderr on one host and a capped Discord channel. Unified logging gives one queryable store per environment, the same one the backend already ships to, so a failed swap can be followed from the agent's call through every backend and chain call to the answer, and alerts can be built on it instead of on Discord posts.

### Acceptance Criteria

- [ ] With `OTEL_LOGS_ENABLED` unset, the server's logging is unchanged: stderr only, no OTel module loaded, no new dependency at boot.
- [ ] With it set and the endpoint, token and `DEPLOYMENT_ENV` present, records reach the gateway with `service.name=builders-mcp`, `service.namespace=builders-sodax-mcp-server`, `deployment.environment`, `sodax.origin`, `service.version` and `service.instance.id`; with any of the three missing, one `warn` at boot and no destination.
- [ ] Every record of one MCP call carries the same `request.id`; a swap quote followed by its track shows the tool call, each upstream call with status and duration, and the result, as separate records.
- [ ] No exported record contains an RPC URL, a request body, a SODAX API key or a private key (tests feed viem/SDK-style errors with URLs and keys through the destination and assert on the exported payload).
- [ ] A wrong token or an unreachable gateway leaves tool latency and `/health` unaffected (compared on the test server), produces diagnostic errors only, and drops records past the bounded queue without throwing; shutdown flushes.
- [ ] Dependencies pinned exactly, at least 14 days old, with the version and the reason in the PR.
- [ ] README env table and `.env.example` document the five variables; the hub card `docs/repos/builders-sodax-mcp-server.md` notes that logs ship over OTLP and which variables control it.
- [ ] Development test server connected (`deployment.environment=staging`) and one real tool call visible in Grafana; production connected after the release.
- [ ] No token value in the repo, the PR or this issue.

### Additional Information

- Spec to mirror: `icon-project/sodax-observability` `docs/specs/unified-logging-backend.md` (decisions B1–B13, record mapping, rollout). Producer how-to: hub skill `unified-logging-connect`.
- Depends on infra: a token per environment and the allowlist entries (M11). Blocks: Grafana alerts for the swap tools.
- Related: #79 (epic), #87 (analytics and Discord alerts), #104 (request limits; the same request path), #108 (dropping SSE removes one transport to instrument).
