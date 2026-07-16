---
type: outcome
repo: sodax-backend
github: 268
related_issues: [255, 269]
tags: [bridge-api, backend, option-a, relay-only, drainer, tests, admin, infra]
status: Active
updated: 2026-07-16
---

# GH-268 Bridge API — outcome

> Result of the plan in [[plan]] (Option A — standalone `apps/bridge-api`, port 3009). Full
> chronology in [[process]]. **Code-complete for P1–P3, all gates green, on the single
> `feat/bridge-api` branch in `sodax-backend`. Awaiting the user's explicit commit/push.**

## What shipped

**P1 — stateless SDK-passthrough surface (5 routes).** `apps/bridge-api` scaffolded from the
`apps/swaps-api` shell, all solver config dropped (relay-only). `GET /bridge/tokens`,
`GET /bridge/tokens/:chainKey` (via `sodax.bridge.config.spokeChainConfig[k].supportedTokens`, 60s
cache, `'0x'`-placeholder filter, 404 on unknown key), `POST /bridge/{allowance/check,approve,intents}`.
Backend stays on published `@sodax/sdk@2.0.0-rc.18` — the backend and demo/SDK-client interoperate over
the `/bridge/*` HTTP JSON contract, NOT a shared SDK instance, so no local-SDK link is needed (link was
attempted and REVERTED — it broke swaps-api/api/task-executor checkTs).

**P2 — durable submit pipeline.** Collection `stateful_submit_bridge_tx_v2` on the SHARED stateful
connection; 5-state status `pending → relaying → relayed → executed | failed`. Slice 1 = HTTP side
(`POST /bridge/submit-tx` idempotent on `(txHash, srcChainKey)` + `@Throttle 10/60s`, `GET
/bridge/submit-tx/status`). Slice 2 = relay-only drainer (`SubmitBridgeTxsTask` — swaps concurrency
shell verbatim, pipeline collapsed to one relay step), alerter, `BRIDGE_SUBMIT_TX` heartbeat, and the
`STATEFUL_LOCK_MANAGER` lease keyed by the bridge model.

**P3 — Admin + Tests + Infra + Docs.**
- **Admin** `/admin/bridge/*` (bearer `AdminTokenGuard` only, NOT IPGuard) + 3 db methods `markAddressed`
  / `unmarkAddressed` / the guarded-terminal `markManuallyExecuted`. Outcome quartet `executed |
  already_executed | not_abandoned | incomplete`.
- **Infra** `Dockerfile` bridge-api stage, `docker-compose.yml` `sodax-bridge-api` (`3009:3009`,
  healthcheck `/healthz/live`, no `SOLVER_CONFIG`), `Makefile` `run-dev-bridge-api`, `.env-example`/
  `.env.dev` Bridge block (drainer flag `false`/`true` per file), `SERVICES_TO_MONITOR += ,sodax-bridge-api`.
- **Docs** `docs/bridge-api-sdk-mapping.md` + CLAUDE.md write-ownership/heartbeat/runtime-flags/apps-tree rows.
- **Tests** — see below.

## Test suite (ported from swaps analogs; independently re-verified 2026-07-16)

Files under `apps/bridge-api/test/**` (+ the e2e config):
- `test/fixtures/bridge-tx.fixtures.ts` — `MOCK_RELAY_DATA {address,payload}` (HEX_REGEX-valid) +
  `makeBridgeTxDoc(overrides)`. No `intent`; `relayData` is an OBJECT.
- `test/unit/relay-bridge-tx.spec.ts` — split-tx solana/bitcoin (chain_id + FULL stored envelope),
  single-tx ethereum, unmapped-chain error, raw relayer-error propagation. `...orig` spread; only
  `waitUntilIntentExecuted` stubbed.
- `test/unit/is-relay-timeout.spec.ts` — `isRelayTimeout` + drainer classify
  `isTransientSubmitError(e) && !isRelayTimeout(e)` (the load-bearing RELAY_TIMEOUT→CONSUME delta).
- `test/e2e/submit-bridge-tx.db.e2e-spec.ts` — dual-connection mongodb-memory-server DI spec; cases 1–8
  + admin `markAddressed`/`unmarkAddressed`/`markManuallyExecuted`.
- `test/e2e/submit-bridge-tx.task.e2e-spec.ts` — HAPPY→executed, SATURATE→ABANDON (CAS), + optional
  RELAY_POLLING_FAILED refund contrast.
- `vitest.e2e.config.ts` — removed `passWithNoTests` → byte-identical to `apps/swaps-api/vitest.e2e.config.ts`.

## Gates (final, 2026-07-16)

`pnpm --filter bridge-api exec tsc --noEmit` ✅ · `pnpm --filter bridge-api lint` ✅ (63 files) ·
**unit 27/27 ✅** · **e2e 52/52 ✅** · **admin boot-smoke ✅** (real mongodb-memory-server + redis: app
boots with `BridgeAdminModule`; admin routes 401 no-auth / 404 missing-row / 400 bad-body / 400 bad-chain;
`GET /bridge/tokens` 200). No source bug found while porting tests — every test matches current behavior.

## Design decisions locked

- **Relay-only, no solver/journal.** Terminal success = `status==='executed'` with
  `result.dstIntentTxHash` (destination packet landed). `relayed` is reserved/defensive — the atomic
  relay pipeline never writes it.
- **RELAY_TIMEOUT CONSUMES** the attempt (saturate → alerter abandons) while every other transient
  relayer-API error REFUNDS — bridge has no terminal authority, so a never-delivered packet must consume,
  not refund forever. Predicate: `isTransientSubmitError(err) && !isRelayTimeout(err)`.
- **Split-tx chains (Solana/Bitcoin)** carry the FULL stored `relayData {address,payload}` envelope +
  `chain_id` at relay submit (no `intent.creator` to rebuild from).
- **Topology:** collection on `STATEFUL_CONNECTION_NAME` (#826); drainer lease in the shared stateful
  `locks` keyed by the bridge model (#837, distinct doc from the swaps drainer); heartbeat on the LOCAL
  default connection (#880). `RUN_SUBMIT_BRIDGE_TXS_TASK` default false; enable on exactly ONE deployment.

## Remaining / not done

- **Commit + push** the `feat/bridge-api` branch — awaiting explicit user instruction. **Commit hygiene:**
  EXCLUDE pre-existing dirty files that are NOT ours — `apps/swaps-api/src/main.ts` (TEMP fetch spoof),
  `apps/swaps-api/package.json`, `pnpm-lock.yaml`, and the `docker-compose.yml` redis `6381:6379` hunk
  (stage the bridge-service hunk ONLY). `.env.dev` is gitignored.
- **Outside this repo:** HAProxy `/v1/bridge/*` external route; empirical P0 end-to-end validation
  (EVM-spoke + split-tx deposit, needs a real relayer round-trip — the one thing not smokeable locally).
- The user's "full test flow" acceptance (demo on local SDK → backend rc.18 over HTTP) is unblocked but
  not yet run end-to-end (needs a real relay).

## Pointers

- Blueprints: `reference-drainer-blueprint.md` (P2), `reference-p3-blueprint.md` (P3).
- Locked wire contract: `../../../sodax-sdks/issues/gh-255-bridge-api/reference/backend-contract/`.
- Precedent: `apps/swaps-api` (structural blueprint); milktea leverage-yield #269 (colocation pattern,
  reused for discovery/build only — bridge's relay-only drainer can't reuse the swaps collection).
