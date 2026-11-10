---
type: brief
repo: builders-sodax-mcp-server
github: 110
status: Active, in review — PR #111 open, CI green (2026-11-10)
next: R0bi7 review of PR #111 (tip f351e5f, test report on #110); staging token + allowlist from infra; then test server env, connect check, one quote + track in Grafana; hub card after merge
updated: 2026-11-09
---

# GH-110 Unified Logging Observability · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Keep it under ~80 lines. It is a router plus the current state — not a summary of
the other files. If a section here starts explaining something, that explanation
belongs in `plan.md` or a knowledge note, and this file should link to it.

## State in five lines

<!-- Where the work actually stands. What exists in the real repo, what doesn't. -->

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

## Blocked on

<!-- Numbered. Each one: what is blocked, who/what unblocks it. Delete if nothing is. -->

## Next action

<!-- One concrete thing. Name the file that already holds the material for it. -->

## Settled — do not re-litigate

<!-- Decisions that are closed, so a fresh agent does not reopen them. -->

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
|  | `plan.md` |  |
|  | `process.md` (index) |  |
|  | `outcome.md` |  |

<!-- ~tok ≈ bytes / 3800. Refresh with:
     for f in *.md; do printf "%5.1fk  %s\n" \
       "$(echo "scale=2; $(wc -c <"$f")/3800" | bc)" "$f"; done -->

## Landmines

<!-- Things that already burned someone: stale claims, branches not on default,
     notes that were wrong. Delete if none yet. -->

## State

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

## Blocked on

1. Infra (R0bi7): an OTLP token per environment (staging, prod) through the secret channel; the test server's and
   production's egress IPv4 on the ingest allowlist (`otel-allowlist`, Coolify proxy config, not in Git).
2. Sequencing: the swap stack is on the test server since 2026-11-09 but its env (SODAX_ENV=canary, RPC, webhook) is
   unset and the canary tests haven't run; do those first (gh-79 brief).

## Next action

1. `plan.md`: transport choice after `npm view` on both candidates (14-day cooldown), the pino mixin for `request.id`,
   where each step record is emitted (tool wrapper in `actionTool.ts`/`toolRegistry.ts`, upstream clients in
   `src/services/*.ts`, SDK wrappers in `sodax.ts`), tests with an in-memory exporter, README/.env.example rows.
2. Ask R0bi7 for the staging token + allowlist when the PR is near.

## Which file answers what

| Question | File |
|---|---|
| The task as filed (decisions, env, record mapping, rollout, AC) | `issue.md` |
| How it lands in code: D1–D11 (in-process sdk-logs, not the pino transport, and why), file-by-file changes, tests, verification, the plan review and the /simplify outcome | `plan.md` |
| The PR body to post once the branch is pushed | `pr-body.md` |
| How to connect a producer (gateway contract, required attributes, connect check, error codes) | hub skill `sodax-command-center/.claude/skills/unified-logging-connect/SKILL.md` |
| The backend spec this mirrors | `sodax-command-center/repos/infra/sodax-observability/docs/specs/unified-logging-backend.md` (24 KB: read §3 Decisions and §5 Record mapping only) |
| Epic context, test server, merge state | `../gh-79-agent-executable-swaps/brief.md` |
