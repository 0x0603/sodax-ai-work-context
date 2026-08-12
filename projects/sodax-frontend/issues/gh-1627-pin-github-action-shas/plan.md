---
type: plan
repo: sodax-frontend
github: 1627
updated: 2026-08-12
---

# Plan

## Goal

Pin the 11 mutable action refs outside `security.yml` to commit SHAs, without changing
what CI actually runs.

## Approach

Resolve every distinct action tag to the commit it points at **today**, then pin to that.
This makes the change behaviour-neutral: CI runs exactly the same code before and after,
so the diff carries no risk beyond a typo'd SHA.

Two of the ticket's own instructions were obsolete by the time the work started, and the
plan departs from both on purpose:

**D1 — use `actions/checkout` v4.4.0, not the SHA the ticket names.**
The ticket says to reuse `34e114876b0b11c390a56381ad16ebd13914f8d5` "so the repo doesn't
end up with two different pins for the same version". That SHA is real and is in the v4
lineage — it is **v4.3.1** (2025-11-13). But `@v4` resolves to **v4.4.0**
(`11d5960a`, 2026-07-16), two commits ahead. Following the ticket literally would have
silently downgraded CI by two commits as a side effect of a pinning-only change, and the
consistency argument for it was conditional on PR #1565 landing first — which has not
happened. One-line flip if the reviewer prefers the ticket's letter.

**D2 — pin `anthropics/claude-code-action` after all.**
The ticket flags that pinning freezes a fast-moving action, and says to either wait for
PR #1608 or accept the staleness knowingly. #1608 has since merged: `.github/dependabot.yml`
is on `main` with a `github-actions` ecosystem block (weekly, 14-day cooldown), so the pins
get bumped automatically. The caveat is resolved and the ticket's unchecked box is stale.

## Steps

1. Inventory every `uses:` on `origin/main` and confirm the 11-outside-`security.yml` split.
2. Resolve each distinct tag → SHA → precise release tag (for the trailing comment).
3. Rewrite the 11 lines; leave `security.yml` alone.
4. Verify (below), commit on `chore/1627-pin-action-shas`. **Do not push.**

## Verification

- All 6 workflow files parse as YAML (js-yaml from the repo's own store).
- Every `uses:` in the 5 target files matches `@[0-9a-f]{40} # v`.
- `git diff --quiet -- .github/workflows/security.yml` — byte-identical to main.
- Each SHA resolves via `gh api repos/<owner>/<repo>/commits/<sha>`.

## Risks

A wrong or nonexistent SHA fails every affected workflow immediately with an unhelpful
error. Mitigated by resolving from the GitHub API and re-resolving each pin after writing.
