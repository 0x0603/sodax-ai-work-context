---
type: outcome
repo: sodax-frontend
github: 1627
status: Implemented locally — not pushed, no PR
updated: 2026-08-12
---

# Outcome

- PR: none. Branch `chore/1627-pin-action-shas`, local commit `791acc31`.
- Commits: 1 — `chore(ci): pin the remaining 11 GitHub Action refs to commit SHAs`
- Tests: n/a (this repo has no test suite; `pnpm test` is a no-op). Verified structurally.

## Summary

All 11 mutable action refs outside `security.yml` are pinned to full commit SHAs with the
precise release in a trailing comment. Behaviour-neutral: every SHA is what its tag
resolved to at the time of writing.

## What Changed

`.github/workflows/{ci,claude,lint-pr,news-gist,request-code-review}.y*ml` — 11 lines.
`security.yml` untouched.

## Verification run

- 6/6 workflow files parse as YAML.
- Every `uses:` in the 5 target files matches `@[0-9a-f]{40} # v`.
- `security.yml` byte-identical to `origin/main`.
- All 7 distinct SHAs resolve upstream (dates: checkout 2026-07-16, github-script
  2025-06-06, setup-node 2025-04-02, setup-python 2025-04-24, semantic-pull-request
  2023-02-10, claude-code-action 2026-08-10, pnpm/action-setup 2026-03-11).

## Follow-ups

- **Two ticket instructions were deliberately not followed** (D1 checkout pin, D2
  claude-code-action). Both are one-line reversals and both are argued in `plan.md`; raise
  them in the PR description so the reviewer sees the reasoning rather than a silent
  deviation.
- The ticket body still carries the stale "#1608 is still open" warning and the stale
  16/5/11 arithmetic. **Not edited** — the correction belongs in a comment, drafted below.
- `security.yml`'s own 9 refs remain on mutable tags. That is #1583 / #1571's scope, and
  #1621 records that someone still has to pick between those two competing approaches.

## Draft comment for the issue — NOT POSTED

> Picked this up. Two notes where the ticket has drifted since it was written:
>
> **`.github/dependabot.yml` is on `main` now** — #1608 merged, `github-actions` ecosystem
> included. So the "pins go stale until #1608 merges" warning no longer applies, and I
> pinned `anthropics/claude-code-action` rather than leaving it out.
>
> **I pinned `actions/checkout` to `11d5960a…` (v4.4.0), not the `34e11487…` the ticket
> names.** That one is real, and it is in the v4 lineage — it's v4.3.1. But `@v4` resolves
> to v4.4.0, two commits ahead, so taking the ticket literally would downgrade CI as a side
> effect of a pinning-only change. The consistency argument for `34e11487` was conditional
> on #1565 landing first and #1565 is still open. Happy to flip it if you'd rather match.
>
> Also for the record: the counts moved. There are 20 `uses:` sites now, `security.yml`
> holds 9 (#1608 grew it), and **none** of the 20 were pinned — so #1565 hasn't landed
> either. The 11-outside-`security.yml` figure still holds.
