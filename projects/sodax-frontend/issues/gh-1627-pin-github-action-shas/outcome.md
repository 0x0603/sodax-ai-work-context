---
type: outcome
repo: sodax-frontend
github: 1627
status: PR open — https://github.com/icon-project/sodax-frontend/pull/1684
updated: 2026-08-14
---

# Outcome

- PR: [#1684](https://github.com/icon-project/sodax-frontend/pull/1684), branch
  `chore/1627-pin-action-shas`, commit `43721806` (signed, `MERGEABLE` at open).
- Commits: 1 — `chore(ci): pin the remaining 11 GitHub Action refs to commit SHAs`
- Tests: n/a (this repo has no test suite; `pnpm test` is a no-op). Verified structurally.

## Summary

All 11 mutable action refs outside `security.yml` are pinned to full commit SHAs with the
precise release in a trailing comment. Every SHA is what its tag resolved to **at authoring
time** — the claim is deliberately scoped that way, see below.

## What Changed

`.github/workflows/{ci,claude,lint-pr,news-gist,request-code-review}.y*ml` — 11 lines.
`security.yml` untouched (byte-identical blob to `origin/main`).

## Verification run

- 6/6 workflow files parse as YAML; only `uses:` lines differ in the diff.
- Every `uses:` in the 5 target files matches `@[0-9a-f]{40} # v`.
- `security.yml` byte-identical to `origin/main`; zero file overlap with PR #1565.
- All 7 distinct SHAs re-resolved against the GitHub API on 2026-08-14, including correct
  dereferencing of the two **annotated** tags (`pnpm/action-setup` v4.3.0,
  `claude-code-action` v1.0.192) — a naive `git/ref/tags/<t>` read returns the tag object, not
  the commit, and reports a false mismatch.
- No composite actions, `action.yml`, `docker://`, `./` or reusable-workflow refs anywhere in
  the repo, so the 11 sites really are the whole surface.

## Corrected before push

The 2026-08-12 commit pinned `anthropics/claude-code-action` to v1.0.190, which `@v1` had
already moved past ~7 hours before that commit was authored. Fixed to `e63208cb` (v1.0.192) and
the commit message re-worded from "resolves to today" to "resolved at authoring time". Detail
and the lesson are in `process.md`.

## Deviations from the ticket — both argued in the PR body

- **D1** — pinned `actions/checkout` to `11d5960a` (v4.4.0), not the `34e11487` (v4.3.1) the
  ticket names; taking the ticket literally would have downgraded checkout two commits inside a
  pinning-only change. The consistency argument for it was conditional on PR #1565 landing, and
  #1565 is still open and conflicting.
- **D2** — pinned `claude-code-action` rather than leaving it out, but *without* the ticket's
  reasoning. "Dependabot resolves the staleness" does not survive the arithmetic: weekly runs +
  14-day cooldown against a ~1.2-day release cadence bounds drift, it does not remove it. No
  `cooldown` exception added for it on purpose — that job holds `CROSS_REPO_TOKEN`.

## Raised in the PR thread, not as new issues

- `.github/dependabot.yml`'s `github-actions` block has no `groups:`, so its 5 PR slots are all
  held by #1637–#1641 and `actions/setup-node` is starved. Three-line follow-up.
- Dependabot generates alerts only for semver refs, never SHA pins; version updates still work.
  Affects 4 actions / 6 sites.
- `sodax-sdks` has the same problem ~5× larger: 53 `uses:` sites, 0 pinned, no `dependabot.yml`
  at all, 9 npm-publish workflows carrying the publish token.

## Still open

- The ticket body carries stale arithmetic (16/5/11) and a stale "#1608 is still open" warning.
  **Not edited** — it is someone else's issue body; the correction lives in the PR description.
- `security.yml`'s own 9 refs remain on mutable tags — that is #1583 / #1571's scope, and #1621
  still records that someone has to pick between those two competing approaches.
