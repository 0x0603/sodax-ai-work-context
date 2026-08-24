---
type: issue
repo: sodax-sdks
github: 378
status: Active
tags: [typescript, tests, checkTs, ci]
updated: 2026-08-24
related_decisions: []
---

# GH-378 Typecheck Test Files

- Source: https://github.com/icon-project/sodax-sdks/issues/378
- Started: 2026-08-24
- Related PR: https://github.com/icon-project/sodax-sdks/pull/395

## Original issue body (verbatim)

Title: `tests(sdk): type check ".test" files`
Assignee: 0x0603 · State: OPEN · No labels, no comments (as of 2026-08-24).

> Problem:
> The SDK tsconfig excludes **/*.test.ts; checkTs uses that config, ordinary Vitest transpilation does not typecheck, and CI has no separate test-source typecheck pass. The same gap affects the new typed status fixtures.
> Goal: enable typechecked tests (fix any open typecheck related issue in tests (note that "as" casts to "never" and similar should only be allowed if purposely made, otherwise fix)

## Scope reading (confirmed with user in-session)

- Mandatory: remove the test exclude so `checkTs`/CI/pre-commit typecheck all `.test.ts` files, and fix the errors that surface.
- The "as never" parenthetical is a constraint on HOW to fix (no cast-to-silence; casts only when deliberate) — not a mandate to audit the ~395 pre-existing deliberate stub casts. Those stay unless found masking real drift in a file being touched.
