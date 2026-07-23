---
id: gh-305-bridge-api-package
type: outcome
repo: sodax-sdks
github: 305
status: Active
created: 2026-07-23
updated: 2026-07-23
tags: [bridge, bridge-api, standalone-package]
---

# Outcome — PR #308 open

**PR: https://github.com/icon-project/sodax-sdks/pull/308** (`feat/bridge-api-package`
→ `feat/bridge-api-v2`, stacked on PR #261). Pushed 2026-07-23. 3 commits, each with a
consistent lockfile (frozen-lockfile verified):

1. `eebe5aaf` feat(bridge-api): add standalone @sodax/bridge-api wire client package
2. `b8560f6d` refactor(sdk): make BridgeApiService a thin adapter over @sodax/bridge-api
3. `621c6126` docs(sdk,skills): document the standalone @sodax/bridge-api client

## Pre-existing bug fixes — RESOLVED on feat/bridge-api-v2 (PR #261), 2026-07-23

User chose "fix trên feat/bridge-api-v2". Landed there and merged up into
`feat/bridge-api-package` (merge commit `2c4b1990`; PR #308 updated, MERGEABLE):

- `dd8bf349` fix(dapp-kit): stop swaps submit-tx status polling on abandonedAt
  (the BRIDGE hook fix had already landed in parallel as `b4e80e6a` — only the
  swaps analog remained; parallel work also added `63e7bf01` relay-timeout fix).
- `0121934a` fix(sdk): compute the BTC post-fee dust check in hub units —
  mirrors buildBridgeData exactly (translate-in guard on `isSodaVaultHubAsset`,
  fee at 18dp, translate-out before the 546-sat compare) + getFee JSDoc unit
  clarification + 4 new tests (percentage/fixed × pass/reject).
  Mutation-verified: reverting the fix fails exactly the 2 fixed-amount tests.

Gotchas hit: stale sdk dist from the #308 branch broke dapp-kit test collection
on the base branch (`Cannot find package '@sodax/bridge-api'`) → `pnpm i` +
`build:packages --force` after every branch switch. Commitlint rejects custom
merge-commit subjects AND `--no-edit` reuse of a rejected MERGE_MSG — use the
standard `Merge branch '...'` wording (defaultIgnores).

## PR description material — declared behavior deltas (improvements, not silent)

1. Idempotent bridge calls retry (2× on 408/429/5xx/network); mutations
   (approve/createBridgeIntent/submitTx) never retry — pinned by a per-method test table.
2. `error.cause` is now a typed `BridgeApiError`; `context.code`/`context.status`
   newly populated (matches swaps). `Result.error.message` therefore changed from the
   old sentinels (`HTTP_REQUEST_FAILED`/`REQUEST_TIMEOUT`) to the wire-client messages —
   discriminate on `context.code`, not message strings.
3. Hardened raw-tx schemas (bigint `^\d+$` gate; Injective 0–255 byte validation).
4. `rejectBigint` request-body guard replaces silent bigint stringify.
5. Cosmetic: `getSubmitTxStatus` `context.endpoint` is the static path;
   `getTokensByChain` path param URI-escaped.
6. Known shared limitations inherited from the SwapsApiService pattern (joint
   follow-up candidates, deliberately NOT diverged): unguarded `logger.error` in the
   Result catch; forced `Content-Type: application/json` on body-carrying calls.
7. `RELEASE_INSTRUCTIONS.md` was stale (said "all 5 packages", omitted
   swaps-api/skills) — fixed while adding bridge-api.

## Second audit round (2026-07-23) — Group A hardening, pending commit

38-agent adversarial audit: zero runtime findings (contract/consumers dimensions clean);
8 confirmed test-guard/doc findings → 7 applied on `feat/bridge-api-package`
(approve happy-path, non-EVM wiring, per-route body pins, network-retry pair,
request-side VALIDATION_ERROR guard test, Extends→Equal factory drift guards,
types/backendApiV2.ts comment). All 5 targeted mutants killed; full gates green.
See process.md for the finding list and the critic follow-ups.

## Follow-ups (create issues; link in PR description)

- **Extract shared raw-tx schemas** into a private `packages/raw-tx-schemas` bundled
  via tsup `noExternal` — dedupes the two verbatim hardened copies
  (`packages/swaps-api/src/rawTxSchemas.ts`, `packages/bridge-api/src/rawTxSchemas.ts`).
  Full investigation already done AND implemented once this session before the scope
  revision (see process.md): ESM-only emitting-`tsc` build modeled on `@sodax/types`
  (root `checkTs` chains `^checkTs`), consumers reference it from devDependencies
  (a private pkg must not appear in published dependency metadata) + `noExternal`,
  omit `check-exports` script (`packages/assets` precedent), keep out of publish
  workflows / bump script. Until then the identical colocated test file in both
  packages is the drift fence, and each package's `SchemaDriftGuards` catches
  contract drift at `tsc` time.
- `apps/bridge-api-example` (analog of `apps/swap-api-example`) — deferred by user.
- Joint SwapsApiService+BridgeApiService hardening: guard `logger.error`, honor
  caller-supplied Content-Type (case-insensitive) in both wire clients' http.ts.
- Backport bridge-api's retry-status matrix tests (transient it.each + never-retry
  it.each) to `packages/swaps-api/src/http.test.ts` (identical http.ts, only bridge's
  copy is fenced).
- dapp-kit bridgeApi hooks: decide on RQ `retry: 3` × wire-client retry stacking
  (up to 12 requests per poll on persistent 429/503); swaps hooks identical — joint fix.
- skills `swaps-api.md` error-handling section still documents pre-extraction
  sentinels (HTTP_REQUEST_FAILED/REQUEST_TIMEOUT) — align with bridge-api.md wording.
