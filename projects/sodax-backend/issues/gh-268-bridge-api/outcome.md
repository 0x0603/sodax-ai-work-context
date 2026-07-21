---
type: outcome
repo: sodax-backend
github: 268
related_issues: [255, 269]
tags: [bridge-api, backend, option-a, relay-only, drainer, per-row-claim, discovery-endpoints, tests, admin, infra]
status: In Review (PR #975)
updated: 2026-07-21
---

# GH-268 Bridge API — outcome

> Result of the plan in [[plan]] (Option A — standalone `apps/bridge-api`, port 3009). Full
> chronology in [[process]]. **Committed + pushed on `feat/bridge-api`; PR
> [#975](https://github.com/icon-project/sodax-backend/pull/975) OPEN (base `development`).
> ⚠️ The "What shipped" / "Design decisions" below describe the ORIGINAL P1–P3 (2026-07-16). The
> [2026-07-21 superseding update](#2026-07-21--superseding-update-full-parity-drainer--discovery-endpoints--pr-975)
> right below replaces the P2 drainer with the swaps-parity 2-lane per-row-claim mechanism, flips the
> RELAY_TIMEOUT rule, renames the collection, and adds fee/bridgeable discovery endpoints — read it first.**

## 2026-07-21 — Superseding update (full-parity drainer + discovery endpoints + PR #975)

Everything below "What shipped" was the 2026-07-16 state (code-complete P1–P3, single-step drainer with a
`STATEFUL_LOCK_MANAGER` lease, collection `stateful_submit_bridge_tx_v2`, "RELAY_TIMEOUT consumes"). Between
07-16 and 07-21 the drainer was rebuilt to full swaps parity (user: *"chung cơ chế với swap"* → Full parity),
discovery endpoints were added, the branch was committed + reviewed + merged up-to-date, and **PR #975** was
opened. Commits on `feat/bridge-api` (bottom-up):

- `088af9fb` — **2-lane per-row-claim drainer (swaps parity)** — SUPERSEDES the P2 lease drainer.
- `4ea80020` — scope-conformance: **collection rename** + **fee/bridgeable discovery endpoints** + docs.
- `074a8228` — **PR-review fixes**: never-abandon relay bug (HIGH) + discovery filter + doc accuracy.
- `4eeec3c8` — merged `origin/development` (up-to-date; swaps-api tsc still 0 — merge didn't break swaps).

**1. Drainer replaced (`088af9fb`).** The P2 single-relay-step drainer + `STATEFUL_LOCK_MANAGER` lease are
GONE. Now the ACTUAL swaps 2-lane per-row-claim mechanism (ported verbatim in shape):
- Fast lane (`runDriver`, insert-driven, `activeDrivers`/`inFlightDrivers` semaphore, ≤ `FAST_LANE_CONCURRENCY`)
  + sweeper worker-pool (`runSweeper`, `SUBMIT_BRIDGE_TXS_CONCURRENCY` workers, continuous `while{claimNext→step}`).
- Mutual exclusion = atomic per-row `claimNext`/`claimSpecific` (`findOneAndUpdate` on a claimable filter) +
  `nextEligibleAt` visibility timeout (`BRIDGE_TX_CLAIM_TTL_MS`; a leaked claim reappears after the TTL).
  **NO collection-wide lease** → both prod deployments drain the shared queue CONCURRENTLY (≈2× bandwidth),
  correctness by idempotency of each bounded step.

**2. RELAY_TIMEOUT rule flipped — SUPERSEDES "RELAY_TIMEOUT consumes".** Relay is split into an idempotent
notify + a single bounded packet poll. A poll timeout now means "packet not landed *yet*" → **REFUND-while-
awaiting** (`keepAwaitingRelay`: net-zero the claim's `+1`, stay `relaying`, re-poll on the short cadence) —
a slow-but-healthy delivery never burns the cap. Give-up is now the **relay-age gate**
(`classifyTerminallyUnprocessable`): a spoke-origin row whose packet hasn't landed within
`BRIDGE_TX_MAX_RELAY_AGE_MS` of its FIRST relay attempt (anchored on `relayStartedAt`, NOT `createdAt`;
hub-origin exempt) is retired via a permanent-failure cap-jump → the alerter abandons + pages.

**3. Collection renamed (`4ea80020`).** `stateful_submit_bridge_tx_v2` → **`stateful_submit_bridge_tx`** (no
legacy predecessor — clean). Terminal `executed` = **hub-settled** (source→hub relay packet landed ON THE HUB,
`result.dstIntentTxHash` set) — NOT a destination-chain delivery confirmation for hub→spoke / spoke→spoke
(corrects the earlier "destination packet landed" wording). `relayed` reserved / never-written.

**4. Discovery endpoints added (`4ea80020`).** `POST /bridge/fee` (delegates to SDK core
`sodax.bridge.getFee(amount)` — config-driven partner fee), `POST /bridge/bridgeable-amount`,
`POST /bridge/bridgeable/check`. `/bridge/tokens` now EXCLUDES leverage-yield vault tokens (`lsoda*`),
matching `RecoveryService` (`isAddress(hubAsset) && !leverageVaultAddresses.has(hubAsset.toLowerCase())`).
These 3 endpoints are exactly what the SDK client + dapp-kit hooks mirror — see [[gh-255 outcome|../../sodax-sdks/issues/gh-255-bridge-api/outcome]].

**5. PR-review fixes (`074a8228`).** Adversarial review (workflow); I hand-verified + fixed the real ones:
- **HIGH never-abandon bug**: `handleRelay` gate `=== 'pending'` → `!== 'relaying'`. A row that failed BEFORE
  stamping `relayStartedAt` never re-stamped it → the age-gate never fired → the row could never be abandoned.
  Now every non-`relaying` relay attempt stamps `relayStartedAt` (via `$ifNull`) and recovers a transient
  `failed` back to `relaying` while the packet is still in flight.
- Leverage-token exclusion in discovery (`projectBridgeTokens` filter, above).
- `resolveXToken` dead-branch (scan `supportedTokens` by address — it is keyed by SYMBOL, not address).
- Doc accuracy (from-hub, CLAUDE.md wording, `getToProcess` comments).
- **Refuted 1 false finding**: reviewer claimed the swaps-parity comment was "inverted" — the PR does NOT touch
  `apps/swaps-api` (merge-base..feat diff empty there); reviewer misread a 2-dot diff of the 32 development
  commits the branch was behind. See [[dont-edit-others-issue-bodies]] / [[workflow-verify-stale-checkout]].

**Status:** PR **#975** OPEN (base `development`). SDK re-linked LOCALLY for demo testing only — the backend
still runs published `@sodax/sdk@rc.18` over the `/bridge/*` HTTP contract; the link is dev-only, not committed.

**Remaining (unchanged):** HAProxy `/v1/bridge/*` external route; empirical P0 end-to-end (EVM-spoke + split-tx
deposit — needs a real relayer round-trip, the one thing not smokeable locally).

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
