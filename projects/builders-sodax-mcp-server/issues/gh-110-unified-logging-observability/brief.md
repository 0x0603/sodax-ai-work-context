---
type: brief
repo: builders-sodax-mcp-server
github: 110
status: Merged — PR #111 into development as 6788b0f (2026-11-11); test server exports logs (heartbeat counts rising, failed 0)
next: Robi checks the records in Grafana (ClickHouse isn't reachable from here: no reader password); prod needs the OTEL_* env at the development → master release; merge development into #117 when the user asks. README key point done in #123 (#116)
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

- 2026-11-11 Robi's review (PR comment 6792449399): Part 1 (commit as service.version, blank HOSTNAME, trailing
  slash, stale body), Part 2 F1–F6, additions 1–7 all done in worktree `builders-sodax-mcp-server-wt-110` (this
  machine; uncommitted), 1060 tests. Two /simplify + two /code-review xhigh rounds (round 1: 10 of 15 fixed; round 2:
  12 of 14). Kept on purpose,
  say so in the reply: no error message on an unexpected swap-tool error or on upstream failures (Robi's own rule),
  data tools mark failures through a WeakMap (`toolFailure.ts`), SDK transport refusals (406/415) carry no
  `error.type`. Not ours: 8–9 (backend `X-Request-Id`), Coolify env, records-per-day after a week. Robi's Slack table
  says the dev token is for "local runs on operator machines (VPN on)": the 403 is likely no VPN, not a missing
  allowlist entry (inference, untested). Coolify "Include Source Commit in Build" makes `service.version` the commit
  (same pending toggle as sodax-backend#1436).

## Blocked on

1. Robi: the two missing Coolify variables on staging and prod; confirm `46.224.215.235/32` is on `otel-allowlist`;
   allowlist the user's IPv4 for the dev token. 2026-11-11 Slack: Robi says dev and prod already have the tokens, the
   MCP should read `OTEL_LOGS_TOKEN` and `DEPLOYMENT_ENV` (it does), and gave the gateway host without a scheme. Told
   him in the edited #111 reply (comment 6794054697, edit 2026-11-11, no notification): `OTEL_LOGS_ENABLED=true`, the
   endpoint with `https://`, `DEPLOYMENT_ENV` = `prod` / `staging` exactly; none of it acts until #111 merges.
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

- 2026-11-11: moved under the follow-up epic #119 ("Sodax MCP: agent-executable swaps (follow-up)"); #79 keeps phase 1 (#99, #103 stay there).
