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

### 2026-06-25

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
