<!-- sodax-backend coding standards. The console writes them to plans/coding-standards.md before each step; the Standards step
fixes the diff to them, reviews check against them, and the retro proposes changes you adopt at "You approve the
standards change". Mined from review comments (people, Codex, Copilot) on merged PRs, 2026-11-02. Edit from the console
(⋯ → Edit coding standards); run scripts/setup-team-ui.sh --export after, to sync. -->
# Coding standards: sodax-backend

First apply `AGENTS.md` § Review guidelines (P0/P1, swaps-api wire surface, Do NOT flag), § Collection Write Ownership, § Intent Identity, § Architecture Invariants; `docs/PATTERNS.md` env/config entries; `docs/TEAM_CONVENTIONS.md`. Below adds only what those miss. `#N` = icon-project/sodax-backend PR.

## Rules

1. New env var: `.env-example` entry, `KEY: ${KEY}` in the service's `docker-compose*.yml` block, config-DTO field validated by format (not bare `@IsOptional()`). Why: 12 PRs (#516, #723, #975), PATTERNS.md:410-455. Spot: `process.env`/config field, no compose hunk.
2. Shared-row state change = one conditional write (expected state in the filter, or Postgres `FOR UPDATE`/constraint); check `matchedCount`/null before claiming success. Why: 22 PRs (#489, #974, #1048, #1373). Spot: `findOne` then `updateOne({_id})`, count-then-insert.
3. Multi-collection writes must complete on retry after a crash: dedup marker last, or retry redoes the dependent step. Why: 11 PRs (#532, #1146, #1274). Spot: "already exists" return skipping a later `$inc`.
4. Abandon/retire/fail/cap-jump only on evidence about that row; timeout, "unavailable" or a 404 from a lagging source = retry. Why: 8 PRs, 26 comments, none declined (#1075, #1322). Spot: terminal status set in a `catch` in `apps/{swaps,bridge}-api/src/tasks/**`, intent-delivery.
5. A failure must not become the same `null`/`[]` as a real miss when the result is persisted, alerts, or moves a cursor. Degrade-to-null + warn is fine for response-only reads (#1266, #1274). Why: 12 PRs (#1274, #1340). Spot: `catch { return null }` before a write.
6. `error` pages on-call: client/expected cases log warn/debug, once per batch. Object-form logs carry a string `message` (else `[object Object]`). Why: 7 PRs (#561, #1123, #1340), #1046, `apps/swaps-api/src/api/swaps/error-mapper.ts:125`.
7. No secrets, keyed RPC/Redis/webhook URLs, or upstream (SDK, Bound, relayer, fetch) error text in logs or responses; redact config dumps. Why: #975, #1422, `error-mapper.ts:133`. Spot: logging `config`/`uri`, `new BadRequestError(err.message)` around SDK calls.
8. Token/contract identity = `(chainId|chainKey, address)`, never address alone or symbol; lowercase on write. Why: #1282, #561, #1348, #1310; `packages/hub-assets/src/hub-asset-registry.ts:21-33`. Spot: `{ address }` filter, `Map<address>`, symbol compare.
9. New query on a growing collection ships with an index that serves it; no case-insensitive regex on an indexed key. Why: 5 PRs (#465, #974, #1293). Spot: new filter/sort field, no `schema.index` change.
10. Renamed status/enum/key format handles stored rows (read both or migrate). Why: 4 PRs (#873, #1327, #1378). Spot: enum edits in schemas/shared-enums.
11. Bad client input = 4xx: addresses validated as addresses, `@ValidateNested` + `@IsDefined` + `@Type`, `runValidators` on updates that rely on schema rules, controllers map via `handleErrorAsHttpException`. Why: 9 PRs (#738, #975, #1048).
12. Cached GETs key on normalized, clamped params and bucket `now`-relative windows; no accidental `@CacheTTL(0)`. Why: 6 PRs (#1312, #1340, #1361).
13. Two prod stacks, own Mongo each: on-chain-derived collections must not read per-deployment state; in-memory state is per replica; single-owner jobs gated to one. Why: 6 PRs (#891, #1075, #1274, #1340).
14. Behaviour change updates the comment, docstring, runbook or `.md` describing it; keep rationale comments; new ones say why in 1-2 lines. Why: ~29 PRs, top theme (#873, #1274, #1301).
15. One source of truth: `@sodax/*` only via the `pnpm-workspace.yaml` catalog; reuse shared helpers instead of a swaps-api/bridge-api copy; no hand-copied unions. Why: #975, #1274, #452.

Never "fix": AGENTS.md Do NOT flag; dashboard tests (no runner, #1423); Nest `Logger` swaps (#483, #516); guards in `providers` (#974); degrade-over-crash startup reads (#1266).

## Tests

- Test the public boundary: HTTP via `supertest` with the app's real global pipes/interceptors/filters; DB services and drainer ticks on `mongodb-memory-server` with real schemas + `syncIndexes()`; api-auth on real Postgres. Fake only RPC, relay, SDK, Bound.
- Tautological: asserting a literal the code sets (`apps/api/test/unit/app.service.spec.ts:19-24`, `apps/swaps-api/test/unit/openapi.spec.ts:63-66`).
- Structure-sensitive: `(svc as any).private`, "method exists", exact pipeline arrays (`apps/data-aggregator/test/integration/sync-up-to-recent-block.test.ts:51-66`, `apps/monitoring-service/src/monitoring.service.spec.ts:38-126`, `apps/api/test/unit/moneymarket.service.spec.ts:217-234`).
- Unfailable: mocked model echoing its return (`apps/swaps-api/test/unit/submit-tx-db.service.spec.ts:85-91`); harness unlike prod (`packages/shared-test-utils/src/utils/test-utils.ts:84` adds a BigInt interceptor; stateful-api tests skip `main.ts:102-113`). Model: `apps/swaps-api/test/e2e/submit-swap-tx.db.e2e-spec.ts`.
- Mutation check (AGENTS.md P1). No `.skip`, `*.exclude.ts` or `--passWithNoTests` to go green; `skipIf` env vars go in `turbo.json` `test.env`.
- `*.e2e-spec.ts` runs in CI only for api, swaps-api, bridge-api.

## Merge danger

One-way (read closely):
- `packages/shared-schemas/**`, `apps/*/src/**/*.schema.ts`: shared DB; `autoIndex` builds at boot; unique index fails on dupes.
- `apps/api-auth/src/db/**`: Postgres DDL + backfills. `apps/*/src/scripts/**`: backfills, seeders.
- `apps/data-transformator/src/transform/**`, `pnpm-workspace.yaml` catalog: persisted volumes/USD, both prod DBs must match.
- `apps/data-aggregator/src/**`: cursors, missed events.
- Funds: `apps/sponsoring-api/**`, `apps/task-executor/src/{modules/blockchain,tasks/intent-canceller,tasks/mm-liquidator,tasks/mm-tick-keeper}/**`, `apps/{swaps,bridge}-api/src/tasks/**`.
- Contracts: `apps/{swaps,bridge}-api/src/api/**/dto/**`, `apps/api/src/api/**`, `apps/api/package.json` v1 pin, `apps/stateful-api/src/{auth,portal}/**`, `apps/api-auth/src/**`, `packages/api-auth-client/**`.
- Alerts: `apps/monitoring-service/**`, `packages/incident-manager/**`.
- Deploy: `docker-compose*.yml`, `Dockerfile`, `Caddyfile.api-auth`, `Makefile`, `.github/**`, `.env-example`, `turbo.json`, root `tsconfig.json`/`biome.json`; ownership tables in `AGENTS.md`/`CLAUDE.md`.

Two-way (skim): `docs/**`, `claude-agents/**`, test-only diffs (check lying tests), dashboard UI, refactors behind unchanged DTOs, log wording.
