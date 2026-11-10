---
type: draft
repo: builders-sodax-mcp-server
github: 110
status: Posted as PR #111 (2026-11-10)
updated: 2026-11-10
---

Title: `feat: ship the logs to unified logging over OTLP`

Closes #110.

With `OTEL_LOGS_ENABLED=true`, every log record the server writes to stderr also goes to SODAX unified logging over OTLP (protobuf, bearer token), with the resource attributes the gateway requires. Nothing changes without the variable: the OpenTelemetry modules load only when it is set.

What a record carries:

- `request.id`: one per HTTP request (or per tool call over stdio), on every record it produces, transport-level ones included, so a swap can be followed from the agent's call through each backend and chain call to the answer.
- One `HTTP request` record per `/mcp`, `/messages` and `/sse` request, the ones a guard refuses included: `http.method`, `http.route`, `http.status` (absent when the client left before the answer), `duration.ms`, `mcp.method` (the SDK's own method list, anything else `other`), and `client.ip_hash` when `POSTHOG_CLIENT_ID_SECRET` makes it an HMAC. The request context opens in that middleware, so this record and every other one of the request share the id. A limiter logs `Rate limited` once per client per window; its 429 request records stay at debug, so a flood can't write the log.
- One record per step, with dotted attributes: the tool call (`tool.name`, `tool.outcome`, `error.code`, `duration.ms`, `caller.key_hash`, and for the swap tools `swap.status`, `quote.id`, `tx.hash`, `hub_tx.hash`, `intent.hash`, `chain.key`), each upstream call (`http.method`, `url.host`, `url.path` with its parameters masked (everything from the fifth segment on, and any hex or long id before it), `http.status`, `duration.ms`; the relay included), each chain read (`sdk.call`, `chain.key`, `duration.ms`).
- The same redaction stderr gets: no RPC URL, request body, API key or private key leaves the process. Errors arrive as `exception.type/message/stacktrace`; a tool that throws (tools return their failures as `isError`, so a throw is a bug) logs its class and stack frames at `error` level, never its message.

How it is built: pino's `streamWrite` hook hands each serialized line to an OTLP destination (`src/services/otel.ts`) that parses it once more and emits it through a bounded `BatchLogRecordProcessor` (queue 4096, batch 512, 5 s). A gateway outage drops records and never slows a tool call; the SDK's own complaints are logged once per message per five minutes and never shipped. A stop flushes what the batch holds; a crash tries within its one-second window. `GET /health` reports `unifiedLogging` (on, records written, exported and failed, the last failure time), so a token or allowlist problem shows there before Grafana (a batch the gateway accepted but partly rejected counts as exported and is logged as a warning). A record cut at the attribute limit carries `log.attributes_truncated` and keeps room for the exception's attributes. The route masking is checked against every data API route the drift check knows, so a new route with a parameter in an unmasked spot fails the suite; `error.code` takes only code-shaped values, from the error or its cause.

Env (README table, `.env.example`): `OTEL_LOGS_ENABLED`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (the `/v1/logs` URL, https unless `DEPLOYMENT_ENV=dev`), `OTEL_LOGS_TOKEN` (secret, deployment env only), `DEPLOYMENT_ENV` (`prod`, `canary`, `staging`, `dev`), `ORIGIN` (optional). A missing or bad one warns once at boot and leaves shipping off; so does an `OTEL_EXPORTER_OTLP_HEADERS` / `_LOGS_HEADERS` in the env, since the server sends only its own Authorization header. `DEPLOYMENT_ENV` is independent of `SODAX_ENV`: the test server runs canary with `staging`.

Dependencies, pinned: `@opentelemetry/api` 1.10.0, `@opentelemetry/sdk-logs` 3.0.0, `@opentelemetry/exporter-logs-otlp-proto` 0.300.0, `@opentelemetry/resources` 3.0.0 (released 2026-10-20). They need Node 22.15, so `engines.node` and the README say so; the image is `node:22-alpine`.

`intent.hash` is the hub's id of the intent (keccak256 of the `createIntent` struct, what `GET /intent/:intentHash` and the solver use), computed from the struct the server already holds with the SDK's `getIntentHash` and checked against the data API's own hashes; the quote, track and cancel results expose it as `intentHash` too.

Differences from the issue, on purpose: `request.id` is the HTTP request's (a JSON-RPC batch shares it; the `/mcp` transport is stateless, so there is no session id) and a stdio tool call mints its own; `http.status`/`url.host` follow the OTel semantic conventions instead of `upstream.service`/`upstream.status`; the swap's hub transaction is `hub_tx.hash` (no tool emits an intent hash); nothing from the tool arguments is logged, and ids in upstream paths are masked; `ORIGIN` is optional, as the gateway's guide says; Injective and the docs proxy stay out.

Tested: `checkTs`, lint, build, unit tests (999; the new ones in `otel.test.ts` and the extended `logger`, `http`, `analytics`, `sodax` and `index` tests all fail on the previous code). Live, with the built server against the sodax-observability stack run locally in Docker (its own smoke test green): records land in ClickHouse with the required resource attributes and pass the ingest filter, one call's records share a `request.id`, no key-shaped text is stored, and the stop flush lands; that run found the collector redacts `api*key`-named attributes, hence `caller.key_hash`. Full report: https://github.com/gosodax/builders-sodax-mcp-server/issues/110#issuecomment-6763412786. Against a local sink: records arrive as protobuf with the bearer header at boot, after a request and on SIGTERM; a sink answering 500 produces one warning and `/health` stays 200; a wrong `DEPLOYMENT_ENV` warns once and ships nothing; the `pino-pretty` development path ships too.

Before this reaches the test server: a token for `staging` and the server's egress IPv4 on the gateway's allowlist (infra). Then `DEPLOYMENT_ENV=staging`, `OTEL_LOGS_ENABLED=true`, the endpoint and the token in its env, and a quote + track visible in Grafana under one `request.id`.


