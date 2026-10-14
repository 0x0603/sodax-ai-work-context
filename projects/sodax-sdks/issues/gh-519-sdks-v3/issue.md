---
type: issue
repo: sodax-sdks
github: 519
status: Active
tags: [v3, idea-capture, lightweight, bundle-size, architecture]
updated: 2026-10-14
related_decisions: [sodax-sdks/0003-progress-reporting-vocabulary]
related_issues: [gh-302, gh-456]
---

# GH-519 SDKs v3 (idea capture)

- Source: https://github.com/icon-project/sodax-sdks/issues/519
- Author: R0bi7 (Robi), opened 2026-10-13. Project "New World", status Backlog. No assignee.
- Started here: 2026-10-14
- Related PR: none

## Problem

Robi's issue is an **idea-capture board** for SDKs v3, not a spec. Its rules:

- Bullet points per package only, no details; they get converted into sub-tasks later.
- Prefix each input with your name.

Headings in the issue body: `@sodax/sdk`, `@sodax/dapp-kit`, `@sodax/wallet-sdk-core`,
`@sodax/wallet-sdk-react`, `@sodax/skills`, API packages (e.g. `@sodax/swaps-api`).

## Context

- The issue body is Robi's. We do not edit it or comment on it from an agent; the user posts their
  own input (see memory "Stay off others' issues and PRs").
- The user's own priority for v3: **lightweight** first, other improvements welcome, competitor
  references welcome.
- Published line at the time: `@sodax/*@2.2.0` (npm `latest`, 2026-10-12); `main` still carries
  `2.0.0-rc.17` in package.json (the release script bumps at publish time).

## Acceptance Criteria

- The user has a ranked, evidence-backed list of v3 ideas per package, ready to paste into #519.

## Related

- Measurements: `measurements.md`
- Prior art in this repo: decision `0003-progress-reporting-vocabulary` (progress events kept local to
  dapp-kit for v2, YAGNI), `gh-302-swap-lifecycle` (`useSwapLifecycle`, EIP-5792 batching),
  `gh-456-privy-wallet-source-sdk` (Privy behind `./privy` subpath).
