---
type: brief
repo: builders-sodax-mcp-server
github: 110
status: Active, in review — PR #111 open at 99f83c1; gateway side merged (icon-project/sodax-observability#25)
next: Robi adds OTEL_LOGS_ENABLED=true and OTEL_EXPORTER_OTLP_LOGS_ENDPOINT to the staging and prod Coolify env, confirms the allowlist, allowlists the user's IPv4 for the dev token; then a local run with the dev token; then #111 review and merge
updated: 2026-11-11
---

# GH-110 Unified Logging Observability · brief

**The entry point. Read this, then open exactly one row from the map below.**

## State

- PR #111 (branch `feat/110-unified-logging`, MCP worktree `.claude/worktrees/110-unified-logging`) open at `99f83c1`
  (pushed 2026-11-11, body synced, CI green), 1021 tests, reviewer R0bi7. Body: `pr-body.md`. Verified end to end against the sodax-observability
  stack run locally (plan.md §End-to-end; rerun on `e7a7278` with #25's config 2026-11-11, process.md), never yet
  against the live gateway (this IPv4 gets 403). `91a72ce` and `1aab810` hold the 2026-11-11 review fixes (process.md): OTel
  names, lowercase severity, bare-origin endpoint, guarded start, keyless swap tool named, X-Request-Id in and out,
  one drift record, README record catalog.
- Gateway: Robi opened and merged icon-project/sodax-observability#25 on 2026-11-10: tokens
  `SERVICE_HEX_64_TOKENBUILDERSMCP{PROD,STAGING,DEV}`, `46.224.215.235/32` in the runbook's allowlist listing, the
  liveness alert excludes this namespace's `staging` and `dev`. My draft (`pr-body-observability.md`, worktree
  `sodax-command-center.worktrees/observability-builders-mcp-producer`) is superseded.
- Coolify (Robi, Slack 2026-11-10 22:31): `OTEL_LOGS_TOKEN` and `DEPLOYMENT_ENV` set for the development (staging) and
  production (prod) deployments. Missing: `OTEL_LOGS_ENABLED=true` and `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` (the IF-37
  URL), so nothing ships even after #111 deploys. Reply drafted for the user to send.
- Dev token: handed over in Slack; since 2026-11-11 in the 110 worktree's gitignored `.env` (mode 600) with
  `OTEL_LOGS_ENABLED=true`, `DEPLOYMENT_ENV=dev`, `ORIGIN=local-0x0603`. The gateway still answers 403 to this IPv4;
  a background check retries every minute and runs the live test once it is allowlisted.
- Hub PR icon-project/sodax-command-center#115 (branch `docs/mcp-unified-logging-card`, opened 2026-11-11), to merge
  after #111. Body: `pr-body-hub.md`. The superseded observability draft worktree was removed. Follow-on work: #117
  (swap from Sonic, stacked on #111), dossier `../gh-115-swap-from-hub/`.

## Blocked on

1. Robi: the two missing Coolify variables on staging and prod; confirm `46.224.215.235/32` is on `otel-allowlist`;
   allowlist the user's IPv4 for the dev token. 2026-11-11 Slack: Robi says dev and prod already have the tokens, the
   MCP should read `OTEL_LOGS_TOKEN` and `DEPLOYMENT_ENV` (it does), and gave the gateway host without a scheme. Still
   to tell him: `OTEL_LOGS_ENABLED=true`, the endpoint with `https://`, and `DEPLOYMENT_ENV` = `prod` / `staging`
   (not `production` / `development`); none of it acts until #111 merges.
2. Robi: review and merge #111. Staging ships only after that; prod after the next development → production release.

## Next action

1. Once the IPv4 is allowlisted: run the #111 build locally with `OTEL_LOGS_ENABLED=true`, the IF-37 endpoint,
   `DEPLOYMENT_ENV=dev` and the dev token in `.env`; `/health` `unifiedLogging`, then one quote + track in Grafana by
   `request.id`.
2. After #111 merges: `/health` on the test server, the same Grafana check with `staging`; then open the hub PR.

## Settled — do not re-litigate

- In-process `@opentelemetry/sdk-logs`, not the pino transport (plan.md D1).
- `OTEL_LOGS_ENABLED` is the switch, as in sodax-backend's shared-logger; rollback is an env change (issue.md M2).
- `caller.key_hash`, not `api_key.*`: the gateway masks values under api-key-named keys.
- `client.ip_hash` only with `POSTHOG_CLIENT_ID_SECRET` set: the plain hash can be reversed to the IP.
- The gateway host and IPs go in no public-repo text (issue, PR, README).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The task as filed (M1–M11, env, record mapping, rollout, AC) | `issue.md` | 2.6k |
| How it lands in code: D1–D11, review rounds, end-to-end on the local stack (`rg -n "^## "` first) | `plan.md` | 8.9k |
| Independent review findings at `05d4b5c`, dated log, older state history | `process.md` | 1.5k |
| PR #111 body / hub PR body | `pr-body.md` / `pr-body-hub.md` | 1.9k / 0.3k |
| What an agent using the MCP stumbled on (tool UX, outside #111) | `agent-roleplay-findings.md` | 0.8k |
| Connect a producer: gateway contract, attributes, connect check | hub skill `.claude/skills/unified-logging-connect/SKILL.md` | |
| Epic context, test server | `../gh-79-agent-executable-swaps/brief.md` | |

## Landmines

- A token without `OTEL_LOGS_ENABLED=true` logs no warning: the server stays stderr-only and `/health` shows
  `unifiedLogging: {"on": false}`. Check `/health` after every env change.
- The dev token was posted in Slack: it goes only into the gitignored `.env`, never into notes, issues or chat replies.
- The 110 worktree's `.env` turns shipping on: any `pnpm dev` / `pnpm start` there sends to the real gateway as `dev`.
