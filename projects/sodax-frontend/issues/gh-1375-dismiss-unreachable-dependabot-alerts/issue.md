---
type: issue
repo: sodax-frontend
github: 1375
status: Blocked
tags: [dependabot, security, triage, phase-4, needs-human]
updated: 2026-08-12
related_issues: [gh-1374-pnpm-overrides-dependabot]
related_decisions: []
---

# GH-1375 Dismiss Unreachable Dependabot Alerts

- Source: https://github.com/icon-project/sodax-frontend/issues/1375
- Started: 2026-08-12 (worksheet only — nothing dismissed, on purpose)
- Related PR: none (no code change by design)
- Parent: #1365, Phase 4 of 5

## Problem

Dismiss ~30 Dependabot alerts as **"Vulnerable code not in execution path"** via the GitHub UI,
then post the per-advisory list as a comment on #1365 before closing.

Categories the ticket names:

- **protobufjs critical** — Trezor connect uses fixed build-time `.proto` schemas; no
  attacker-controlled schema loading.
- **Next.js features we don't use** — Pages Router, i18n, CSP nonce, `beforeInteractive`,
  WebSocket upgrade, Cache Components.
- **lodash / axios prototype-pollution gadgets** — no untrusted merge sites in our code.
- **kysely SQL injection** — we use the MongoDB adapter, not kysely.
- **bn.js v4 polyfill** — unused path.

Stated risk: none, dismissals are reversible.

## Context

Sequenced **after** the Next.js bump so the dismissed list matches post-bump state.

## Acceptance Criteria

- [ ] Per-advisory dismissal with a justification that is actually true today.
- [ ] Post the final list as a comment on #1365.

## Related

- Knowledge:
- Decisions:
