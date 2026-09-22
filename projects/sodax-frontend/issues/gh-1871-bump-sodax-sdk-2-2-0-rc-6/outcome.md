---
type: outcome
repo: sodax-frontend
github: 1871
status: In review
updated: 2026-09-18
---

# Outcome

- PR: icon-project/sodax-frontend#1872
- Commits: `b117e337` chore(deps): bump @sodax/* to 2.2.0-rc.6
- Tests: none in repo; checkTs / lint / build green

## Summary

Pins rc.6 with zero call-site changes; log entry written; oldest log entry retired
with its two lessons moved into guide §3 and §7.

## What Changed

`apps/web/package.json`, `pnpm-lock.yaml`, `CLAUDE.md`, `docs/sdk-upgrade-guide.md`.

## Follow-ups

- Step 8 smoke matrix on staging, Sui deposit first.
- Watch `/swap` for `sUSDS` when the backend feed syncs; no local logo.
