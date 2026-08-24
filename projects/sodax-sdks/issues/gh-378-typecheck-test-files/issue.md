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

## Scope reading (evolved in-session)

- Mandatory: remove the test exclude so `checkTs`/CI/pre-commit typecheck all `.test.ts` files, and fix the errors that surface.
- The "as never" parenthetical: initially read as a constraint on HOW to fix. The user then directed ("PR must complete ALL issue requirements") that the pre-existing casts be reviewed too — done as a compiler-refereed sweep (see `process.md` §Session 1b): dead casts deleted, remaining ones proven load-bearing, i.e. "purposely made" is now mechanically enforced.
