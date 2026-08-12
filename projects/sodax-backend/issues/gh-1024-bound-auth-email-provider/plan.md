---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-12
---

# Plan

## Goal

Produce the research the ticket asks for, from primary sources rather than inference, and
surface the two facts that change what this ticket is: the constraint from PR #1048, and the
link to frontend #1069.

## Approach

Read the three named sources directly. Two of the three were reachable — see `process.md` for
what was and was not obtainable, stated plainly rather than guessed at.

Then map it against what `sodax-backend` actually has today, so "replicate it, pick out what we
need" has a concrete gap list rather than a vague one.

## Steps

1. Read `lydialabs/radfi-be` `docs/` and the auth-relevant source. **Accessible** (private,
   read-only, with the current token).
2. Read the public Bound Auth docs and reconcile with the private repo.
3. Map the existing auth surface in `sodax-backend`: what verifies signatures today, what
   issues sessions, what holds secrets.
4. Check where a new auth service could live — which turned up PR #1048.
5. Write it up. **No code.**

## Verification

Every claim traceable to a `file:line`, a doc quote, or an API response. Anything not
obtainable is recorded as not obtainable.

## Risks

The research is only useful if the build-vs-adopt call gets made. The biggest risk is that this
sits as a closed-tab research ticket while #1069 stays blocked on the same question.
