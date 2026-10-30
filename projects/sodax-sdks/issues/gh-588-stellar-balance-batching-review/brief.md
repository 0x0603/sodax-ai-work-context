---
type: brief
repo: sodax-sdks
github: 588
status: Reviewed
next: Preserve issuer balances before merging PR 590.
updated: 2026-10-30
---

# GH-588 Stellar balance batching review

## State

Read-only review of PR #590 at `032b3e8e3961ca1d4de326558191aac05f66725d` is complete. One P2 regression is confirmed: a listed classic asset's issuer is incorrectly reported as holding zero. No SDK changes or GitHub comments were made.

## Next action

Handle `assetIssuer === address` before the missing-trustline zero shortcut and add a regression test. See `outcome.md`.

## File map

| Question | File |
| --- | --- |
| Source issue and review boundary | `issue.md` |
| Review approach | `plan.md` |
| Reproduction and verification evidence | `process.md` |
| Finding and follow-up | `outcome.md` |
