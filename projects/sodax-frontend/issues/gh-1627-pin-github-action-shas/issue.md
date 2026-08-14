---
type: issue
repo: sodax-frontend
github: 1627
status: Active
tags: [security, ci, github-actions, supply-chain, sha-pinning, audit-2026-07-28]
updated: 2026-08-14
related_issues: [gh-1622-email-guide-hardening, gh-1623-fence-scraped-content-llm-prompt]
related_decisions: []
---

# GH-1627 Pin Github Action Shas

- Source: https://github.com/icon-project/sodax-frontend/issues/1627
- Started: 2026-08-12
- Related PR: https://github.com/icon-project/sodax-frontend/pull/1684 (open 2026-08-14),
  branch `chore/1627-pin-action-shas`, commit `43721806`
- Parent: #1621 (2026-07-28 whole-repo security audit follow-up), ranked 5 of 5

## Problem

`A08:2021 · CWE-494`. Every `uses:` in the repo sat on a mutable tag. An upstream
compromise of any one of those action repos is code execution in CI. The highest-value
target named by the audit is `pnpm/action-setup@v4` in `claude.yml`, because that job
carries the org-wide PAT and a write-capable token (#1626).

## Context

The ticket scoped itself to the sites **outside `security.yml`**, deliberately, so it has
no file overlap with either of the two competing security-gate efforts (#1583 / PR #1565,
and #1571 / sodax-claude-standards#7) and can land at any time.

Its arithmetic was stale by the time it was picked up — see `process.md`. The conclusion
survived: 11 sites, 5 files.

## Acceptance Criteria

- [x] Each of the 11 `uses:` pinned to a full 40-char commit SHA with the version in a
      trailing comment.
- [x] `security.yml` untouched.
- [x] ~~Enable Dependabot's `github-actions` ecosystem~~ — already merged in #1608.

## Related

- Knowledge:
- Decisions: D1 (checkout pin), D2 (claude-code-action pin) — recorded in `plan.md`
