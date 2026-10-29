---
type: issue
repo: sodax-sdks
github: 583
status: Active
tags: [docs, skills, initialize, tokens, swaps-api, bridge-api, leverage-yield-api]
updated: 2026-10-29
related_issues: [543, 170, 210]
related_decisions: []
---

# GH-583 docs(skills): initialize() does not load new tokens, and the API path that does is undocumented

- Source: https://github.com/gosodax/sodax-sdks/issues/583 (spec is the issue body; plan is its `<!-- sodax:plan -->` comment)
- Started: 2026-10-29
- Related PR: https://github.com/gosodax/sodax-sdks/pull/584

## Problem

Partners on an older `@sodax/sdk` (2.2.0) and their coding agents cannot use tokens the backend lists after
their release. Docs and skills say `initialize()` loads new tokens (it is a no-op), route swap / bridge / vault
work to the feature services (which reject unbundled tokens), and leave the backend API path (which accepts
them) without signing, intent-conversion, polling and version guidance.

## Acceptance Criteria

See the issue body, AC1-AC6.
