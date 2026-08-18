---
type: knowledge
repo: sodax-backend
github: 268
related_issues: [831]
tags: [bridge-api, swaps-api, duplication, shared-packages, refactor, backlog]
status: Draft
updated: 2026-08-13
---

# What apps/bridge-api could share with apps/swaps-api

Inventory taken while reviewing PR #975 and re-measured after the 10 cleanup commits landed.
Nothing here was extracted in that PR — see [[#why-none-of-this-shipped-in-pr-975]].

Measured against `apps/swaps-api/src` at the same relative path, on branch `feat/bridge-api`.

## Headline

`apps/bridge-api/src` is 4,890 LOC. **626 LOC across 16 files are byte-identical** (`cmp`) to
swaps-api. A further ~200 LOC differ by exactly one string (a service name), so roughly **17% of
the app is swaps-api verbatim modulo a literal**. Only two files in the whole app have no
swaps ancestor at all.

## Tier 1 — byte-identical, zero parameterization needed

These 16 files are `cmp`-identical. Nothing distinguishes them; a shared package could export them
as-is.

| File | LOC | Copies across apps/ |
| --- | --- | --- |
| `api/health/health.controller.ts` | 127 | 2 |
| `api/health/health.dto.ts` | 48 | 2 |
| `api/health/health.module.ts` | 11 | 2 |
| `api/prometheus/prometheus.controller.ts` | 49 | 3 |
| `api/prometheus/prometheus.module.ts` | 44 | 3 |
| `api/prometheus/prometheus.service.ts` | 18 | 3 |
| `app.controller.ts` | 14 | 3 |
| `config/config.module.ts` | 17 | 2 |
| `shared/guards/haproxy-throttler.guard.ts` | 25 | 3 |
| `shared/guards/ip-allow.guard.ts` | 33 | 3 |
| `shared/interceptors/big-int-guard.interceptor.ts` | 66 | 2 |
| `shared/middleware/logging.middleware.ts` | 16 | **4** |
| `shared/middleware/prometheus.middleware.ts` | 68 | 3 |
| `shared/pipes/validation.pipe.ts` | 41 | **4** |
| `shared/validation/decimal-string.ts` | 27 | 2 |
| `shared/validation/strict-boolean.ts` | 22 | 2 |

Wider than swaps: `logger/logger.ts` (8 LOC) exists in **9 apps**, differing only in the
`serviceName` literal on line 5. `nest-cli.json` and `tsconfig.build.json` are byte-identical
across all 9 apps.

Two near-misses worth knowing before extracting:

- `shared/pipes/validation.pipe.ts` — identical in api / bridge-api / swaps-api, but
  **sponsoring-api deliberately diverges** (49 LOC): it adds
  `validationError: { target: false, value: false }` and logs only property + constraint NAMES,
  never the rejected payload. A shared version must keep that hardening available, not flatten it.
- `shared/guards/bearer.guard.ts` — bridge vs swaps is +1/-1 (one word in a doc comment); bridge
  vs apps/api differs only by a 6-line JSDoc block. Functionally one file in three apps.

## Tier 2 — one string apart

Same file, one literal different. A shared version needs a single injected value.

| File | The only difference |
| --- | --- |
| `api/health/health.service.ts` (91 LOC) | `service: 'swaps-api'` vs `'bridge-api'` |
| `app.service.ts` (17 LOC) | `name: 'SODAX Swaps API'` vs `'SODAX Bridge API'` |
| `logger/logger.ts` (8 LOC, 9 apps) | the `serviceName` literal |

## Tier 3 — duplicated functions inside otherwise-different files

`shared/utils/bridge-mappers.ts` vs `shared/utils/swap-mappers.ts`, function by function:

- `walk()` — byte-identical
- `stringifyBigInts()` — byte-identical
- `toSdkPartnerFee()` — byte-identical **body**; only the parameter type differs (bridge takes a
  structural type to avoid an api→shared import, swaps takes `PartnerFeeDto`). The bridge file's
  own comment says "Mirrors the swaps-api `toSdkPartnerFee`".

`shared/utils/utils.ts` — was 225 lines byte-identical before PR #975's cleanup commit dropped the
swap-only dead code. What remains shared and genuinely domain-neutral: `withTimeout` and
`formatResultError`. `isTransientSubmitError` has now diverged (bridge's solver branches are gone)
and should NOT be re-merged.

Note the test asymmetry: swaps-api has 368 LOC of unit tests covering the symbols in that block
(`is-transient-submit-error.spec.ts` 259L, `is-intent-deadline-expired.spec.ts` 66L,
`with-timeout.spec.ts` 43L). Extraction should carry those tests to the shared package.

## Tier 4 — already exists in packages/, and bridge-api still has its own copy

This is the cheapest win: no new package, just consume what is already there.

| bridge-api local | Already in packages/ |
| --- | --- |
| `api/bridge/schemas/packet-data.schema.ts` | `packages/shared-schemas/src/schemas/commons/packet-data.schema.ts` — differs only by import + formatting; already consumed by `intent-journal.schema.ts` |
| `IPacketDataDomain` / `PacketDataStatus` in `types/submit-bridge-tx.ts` | `PacketDataDomain` / `PacketDataStatus` in `packages/shared-types/src/domains/intents-events.ts` — field-for-field the same |

swaps-api has the same duplicate copies, so this is a 3-way duplication, not a bridge mistake.

Precedent already set: `packages/shared-utils/src/constants.ts` **already hoists swaps drainer
constants** (`MAX_SWAP_TX_RETRIES`, `SWAP_TX_RETRY_BACKOFF_MS`). PR #975 stopped bridge-api
importing those, because a shared constant with a domain name in it is worse than a local one —
tuning swaps silently retuned bridge. If the drainer machinery is ever genuinely shared, the
constants need domain-neutral names, not just a shared home.

What is NOT already shared, despite feeling like it should be: `packages/shared-utils` has
`withBackoff`, `delay` and `safeStringifyWithBigInt`, but **no** `withTimeout` and no
transient-error classifier.

## Why none of this shipped in PR #975

A hard mechanical blocker, not taste. Turbo's graph makes `@repo/incident-manager#test` depend on
`@repo/shared-utils#build` / `@repo/shared-schemas#build` / `@repo/shared-types#build`. That test
(`incident-manager.service.test.ts`, `unique_active_per_target`) **fails deterministically today** —
it races an async mongoose partial-unique-index build — and is green in the commit gate only
because turbo replays a cached success from before the race was introduced.

So the first commit touching `packages/**` invalidates that cache, the test runs for real, it
fails, and **every subsequent `git commit` in the repo is blocked** until someone passes
`--no-verify`.

Extraction therefore needs one of:

1. fix the incident-manager flake first (add the missing `await waitForIndexes(...)` in its
   `beforeAll`, mirroring `apps/data-transformator`), then extract; or
2. an explicit decision to commit the extraction with `--no-verify`.

Option 1 is the honest one — the flake is real and is currently hidden by a cache, which will bite
whoever next touches `packages/`.

## Suggested order if this is picked up

1. **Fix the incident-manager index race.** Unblocks everything else and removes a landmine.
2. **Tier 4** — delete bridge-api's packet-data schema + type copies, import from
   `@repo/shared-schemas` / `@repo/shared-types`. Needs `@repo/shared-types` added to
   `apps/bridge-api/package.json` + a lockfile change. Use `import type` — that package is pure
   ESM and bridge-api compiles to CJS, so a value import is a runtime hazard under vitest+swc.
3. **Tier 1** — a `@repo/nest-app-kit` for the health/prometheus/guards/middleware/pipe scaffolding.
   Biggest LOC win, touches the most apps, so do it when nothing else is in flight.
4. **Tier 2/3** — fold in once the kit exists; they need injected values rather than plain moves.

## Related latent difference (not a bug today)

`SubmitBridgeTxHeartbeatService.refreshMeta` unconditionally `$set`s `enabled`, where swaps'
equivalent uses `$setOnInsert` when disabled and documents at length that a standby must NEVER
`$set enabled: false` — it would mask a live drainer, because both `/healthz/status` staleness and
the dashboard's stale-heartbeat query gate on `enabled: true`.

**This is currently harmless for bridge**: its `BRIDGE_SUBMIT_TX` heartbeat lives on the LOCAL
connection, so each deployment owns its own row and a disabled standby masks nobody. It becomes a
real bug the moment that heartbeat moves to the shared stateful connection (as swaps' did). Copy
the swaps branch at the same time as that move.
