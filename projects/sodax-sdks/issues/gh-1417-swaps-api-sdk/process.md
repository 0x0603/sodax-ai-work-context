---
type: process
repo: sodax-sdks
github: 1417
status: Active
tags: [swaps-api, sdk, context-migration]
updated: 2026-06-26
---

# Process

## Log

### 2026-06-26

- Reviewed `plan.md` against the current `sodax-sdks` codebase:
  - `packages/swaps-api` and `apps/swap-api-example` are not implemented yet.
  - `ISwapsApiV2` in `packages/types/src/backend/backendApiV2.ts` still matches
    the plan's 21-method throwing surface.
  - No local `sodax-backend` checkout exists in this workspace, so endpoint
    path verification is limited to the shared TypeScript contract and existing
    SDK docs/tests.
  - The plan direction is sound, but implementation should avoid a hand-written
    21-method tangle by using a small endpoint descriptor map for method/path,
    response schema, optional request schema, and serializer.
  - Guardrails to preserve minimalism/scalability: explicit type-only re-exports
    from `@sodax/types`, allowlisted retries only for idempotent/polling calls,
    response schemas that tolerate additive backend fields, and strict central
    serialization for known `IntentRequestV2` fields rather than a broad
    "any bigint anywhere" escape hatch.
- Verified `ISwapsApiV2` (`backendApiV2.ts:676`) is a **throwing** interface —
  every method returns `Promise<ResponseV2>`, not `Promise<Result<T>>`.
- Reviewed v1 `SolverApiService` coupling: it depends on `ConfigService` for
  client-side token validation and spoke→hub asset resolution. v2 moves that
  server-side, so the v2 client genuinely needs no such coupling.
- Resolved open questions against the literal issue goal ("super minimalistic",
  "only depends on the type", "solely request/response logic"):
  - Scope: swaps-only.
  - Deps: `@sodax/types` + `valibot` only.
  - Error model: throwing-only — **dropped** the earlier dual
    `Result<T>` client + throwing facade as over-engineering.
  - Validation: responses always, requests opt-in (off by default).
  - Standalone now; no `@sodax/sdk` migration in this issue.
  - Also dropped the speculative `SodaxLogger` injection idea.
- Deferred: confirm real staging/production base URLs (only needed for the e2e
  smoke test; `baseUrl` is injected, never hardcoded).
- Recorded the rationale as ADR
  `projects/sodax-sdks/decisions/0001-swaps-api-throwing-minimal.md`.
- Updated `issue.md` (Open Questions → Decisions) and `plan.md` (single
  throwing `SwapsApi`, `http.ts` throws, response-only validation default,
  removed `throwing-client.ts`).
- Reviewed docs / `packages/skills` / CI-CD coverage in `sodax-sdks`:
  - **CI/CD gap found.** The repo publishes each package with its own
    tag-triggered workflow (`.github/workflows/sodax-<pkg>-publish.yml`, trigger
    `@sodax/<pkg>@*.*.*`); there is no changesets setup (`.changeset/` unused,
    see `packages/RELEASE_INSTRUCTIONS.md`). The plan did not mention adding
    `sodax-swaps-api-publish.yml`, so a publishable package would have shipped
    with no release path. Added it to the wiring checklist, a new "Release &
    CI/CD" section, Implementation Steps, DoD, and issue Acceptance Criteria.
  - `ci.yml` auto-discovers packages/apps via turbo filters (`./apps/*`,
    `turbo run build/lint/test`) → expect no `ci.yml` edit; just confirm green.
  - `packages/skills` has one skill dir per consumer-facing package (5 today);
    `check:ai` / `check-skills.sh` validate existing skills only and do not
    require one per package. Decision: a `sodax-swaps-api` skill is **optional
    and deferred**; the example app is the proof-of-flows deliverable.
  - Top-level `docs/` only holds `ai-integration-guide.md` ("four skills"); it
    needs no change unless a swaps-api skill is later added.
- Independently verified an external plan review against the contract on `main`
  and accepted it. All 5 findings valid; all Contract Check claims confirmed
  (`SwapExtrasV2{partnerFee,srcPublicKey,bound}` :68; `QuoteRequestV2`/
  `CreateIntentParamsV2 extends SwapExtrasV2` :232/:291; `tx`/`gas`/`result`
  `unknown`; bigint only in `IntentRequestV2` :123–141; `PartnerFeeV2.amount`
  decimal string :52; `SwapExtrasV2` compile-time no-bigint guard :85).
- Folded the review into `plan.md` under the user's directive **"simple, OOP,
  not overkill, maintainable"** — which downgrades the "clever" suggestions:
  - Added a **Design Principles** section (one class, explicit thin methods, no
    descriptor-map dispatch engine, plain helpers, minimal public surface).
  - [P1] Dropped public `maxRetries`; retry is internal, idempotency-allowlist
    only (discriminator is idempotency, not HTTP verb — `getStatus` is a POST
    poll). Prevents double-submit of mutating intents.
  - [P1] `serialize.ts` is a narrow structured serializer over the 6 known bigint
    fields; **no broad `bigintReplacer`**; throws on stray bigint.
  - [P2] Kept explicit OOP methods (no descriptor engine); only a `PATHS` const
    to avoid drift. Table-driven *tests* are allowed (test ergonomics ≠ runtime).
  - [P2] `schemas` stay internal (semver surface); V2 types re-exported
    **type-only** (`export type`, not `export *`).
- Second review pass (same 5 findings, re-checked on `main`) confirmed.
  Findings #1/#2/#4/#5 were already folded in the prior commit. Finding #3
  ("make an endpoint descriptor map mandatory") conflicted with the user's
  simple-OOP directive; surfaced the tension and the user chose **explicit
  methods + `PATHS`** over a descriptor map. Recorded the rationale and the
  three anti-drift mechanisms (single `request()` helper, `v.InferOutput` drift
  guards, table-driven tests) in plan Design Principles so #3 is visibly
  addressed and not re-litigated.

- Deep pass on implementation-readiness ("is the plan the best yet?"). Verified
  against the contract and pinned the HTTP details the plan had left to
  improvise (would otherwise drift):
  - **A** `http.ts`/`errors.ts`: `HTTP_ERROR` captures `status` + best-effort
    parsed backend body (no v2 error type exists in the contract).
  - **B** query building: `boolean`/`number` serialization, omit `undefined`
    optionals (`QuoteQueryV2.includeTxData?`, `DeadlineQueryV2.offsetSeconds?`).
  - **C** `encodeURIComponent` for path params (`:chainKey`, `:txHash`).
  - **D** request body: default `Content-Type: application/json`, stringify only
    after `serialize.ts` so a raw bigint never reaches `JSON.stringify`.
  - Added matching tests to the Testing Strategy.
  - Recorded **E/F/G** as Open Implementation Decisions (AbortSignal pass-through;
    retry count/backoff; base-path/version prefix) with recommendations; E/F are
    code-time calls, G bundles with the deferred base-URL backend question.
  - Honest retraction: an earlier worry about void/204 responses is moot —
    `ApproveResponseV2`/`CancelIntentResponseV2` are `{ tx: unknown }` objects;
    every method returns a JSON object.

- Reviewed stage-1 `@sodax/swaps-api` scaffold on branch
  `feat/swaps-api-sdk`:
  - Package is present only as an untracked scaffold plus a
    `pnpm-workspace.yaml` catalog edit; nothing is staged.
  - Stage 1 currently re-exports only `ISwapsApiV2` type-only from
    `@sodax/types`, matching the small public-surface decision.
  - Blocking follow-up before merge/CI: update `pnpm-lock.yaml` for the new
    package importer and `valibot` catalog entry.
  - CI risk: the package has a `vitest run` script but no tests yet, so turbo
    test discovery may fail unless a smoke test is added or the script
    temporarily passes with no tests.
  - README currently advertises `SwapsApi` runtime usage before the runtime
    export exists; align docs with stage status or add the runtime before
    publishing.
- Addressed the stage-1 review (Codex) on `feat/swaps-api-sdk`:
  - [P1] vitest `passWithNoTests: true` (scaffold-only; no-op once Stage 2 tests
    land) so turbo's auto-discovered `test` task doesn't fail on an empty `src/`.
    Note: no sibling package uses this flag — it is a temporary scaffold measure.
  - [P2] README split into "Status" (type-only today) vs "Planned API" so the
    `new SwapsApi(...)` example is no longer presented as working.
  - [P3] Added `license: MIT` + `keywords` to match the other public packages.
  - [P1 lockfile] Cannot regenerate `pnpm-lock.yaml` here — this sandbox has no
    node/pnpm and network is blocked. It updates when the user runs the gate
    `pnpm install`. Not hand-edited.
  - [P2 publish workflow] Acknowledged; intentionally Stage 7 in the plan, not a
    stage-1 defect.

- Toolchain unblocked + Stage 1/2 gated GREEN:
  - This sandbox had no Node at all (Spotlight confirmed). Installed via Homebrew:
    `brew install node` (v26.4.0) + `brew install corepack` + `corepack prepare
    pnpm@10.32.1 --activate`. pnpm now runs here (sandbox disabled for network).
    Future sessions: node/pnpm available at /opt/homebrew/bin.
  - `pnpm install` succeeded → `pnpm-lock.yaml` now has the `packages/swaps-api`
    importer + `valibot` (resolved 1.4.0 via the security override). Fixes the
    Codex P1 lockfile finding.
  - Fixed a real `tsconfig` bug: added `include: ["src"]` so `tsc --noEmit`
    stops type-checking root config files (TS6059 on tsup/vitest configs).
  - Stage 2 (primitives) implemented + green: `errors.ts` (SwapsApiError),
    `config.ts` (SwapsApiConfig), `serialize.ts` (serializeIntentRequest over the
    6 bigint fields + `rejectBigint` body-boundary guard), with 8 passing tests.
    `index.ts` now also exports SwapsApiError + SwapsApiConfig (final public API).
  - Gates: build / checkTs / test (8/8) / check-exports / circular-deps / biome
    all green. knip shows only transient/quirk findings (valibot + Serialized-
    IntentRequest used from Stage 4/5; @sodax/types type-only; biome root binary)
    and is not a CI gate.
  - Not committed to the icon-project repo yet (commit on request).

- Stages 3 + 4 implemented, gated GREEN (35 tests):
  - Stage 3 `http.ts`: request() helper — buildUrl/buildQuery (boolean/number
    serialization, omit undefined), JSON body with Content-Type + rejectBigint
    guard, error mapping to throwing SwapsApiError, idempotency-allowlist retry
    (2, no backoff). 14 fake-fetch tests. Decision E resolved: no per-call
    AbortSignal (ISwapsApiV2 methods have no signal param) — cancel via
    config.fetch.
  - Stage 4 `schemas.ts`: valibot schemas for all 21 responses + a
    SchemaDriftGuards type asserting each schema's InferOutput matches the
    contract (strict, one-way for readonly arrays). checkTs passes => schemas
    are contract-correct. v.object tolerates additive fields. 13 schema tests.
  - Commits on feat/swaps-api-sdk: e6f383dd (scaffold+primitives),
    03e53a3f (http), d58b5ebe (schemas). Not pushed.
- API smoke test (decision G resolved). User gave the canary host. Verified live:
  - swaps mount under **/v1** — `https://canary-api.sodax.com/v1/swaps/...` = 200;
    every `/v2/...` = 404. The /v1 route returns the **V2-typed** shapes.
  - Live `v.parse()` of getTokens (20 chains), getDeadline, getSolverFee against
    the schemas all PASS — schemas match production data, not just the TS types.
  - => baseUrl = `https://canary-api.sodax.com/v1` for the example app; "V2" is
    the SDK contract version, the HTTP route is /v1. Confirm prod/staging URLs
    with Robi (same /v1 prefix expected).

- Found the existing planning note at:
- Found the existing planning note at:

  ```text
  /Users/sangnguyen/Documents/GitHub/sodax/sodax-sdks/.claude/docs/issue-1417/swaps-api-sdk-plan.md
  ```

- Moved the durable context into this synced context repo under:

  ```text
  projects/sodax-sdks/issues/gh-1417-swaps-api-sdk/
  ```

- Split the old monolithic note into the standard issue lifecycle files:
  - `issue.md`: raw GitHub issue, context, acceptance criteria, open questions.
  - `plan.md`: architecture, endpoint contract, implementation steps, testing,
    definition of done, and source references.
  - `process.md`: migration log and work history.
  - `outcome.md`: current outcome and follow-ups.

## Findings

- The GitHub source issue is in `icon-project/sodax-frontend`, but the work
  context belongs under `projects/sodax-sdks` because the deliverable is an SDK
  package and example app in `sodax-sdks`.
- The source document was in a gitignored `.claude/docs/` location, so it would
  not reliably sync between machines.
- The plan already identified the main implementation risks:
  - exact scope of `ISwapsApiV2` vs `IConfigApiV2`,
  - dependency interpretation of "only depends on backend swaps api type",
  - `Result<T>` vs throwing API,
  - bigint serialization boundary,
  - valibot schema drift.

## Changes During Work

- Preserved the original technical content but normalized it into the agreed
  issue-folder template.
- Kept `Source` pointing to the original GitHub issue:
  `https://github.com/icon-project/sodax-frontend/issues/1417`.
- Kept `repo: sodax-sdks` in frontmatter for context repo search and project
  routing.
