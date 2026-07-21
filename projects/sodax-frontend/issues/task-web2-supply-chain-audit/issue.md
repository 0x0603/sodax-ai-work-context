---
type: issue
repo: sodax-frontend
github:
status: Complete
tags: [security-audit, web2-frontend, supply-chain, csp, ci-cd, wallet-drainer, re-audit]
updated: 2026-07-21
related_decisions: []
related_issues: [700, 1556]
---

# Task — apps/web Web2 / supply-chain audit (epic #700, non-overlapping surface)

- Source: ad-hoc user request — audit the frontend against modern Web2 / supply-chain
  attack vectors (domain/DNS, hosting/CI, dependencies, third-party JS, wallet-signing UX),
  the class that has out-damaged smart-contract bugs in 2024–2026.
- Deliberately targets the surface #700 did NOT cover (its findings are app-code / API-layer).
  De-duped against the #700 inventory — see `plans/security-audit-tracker.md`.

## Problem

#700 focused on app-code (XSS, auth, CMS, SDK/wallet). The higher-damage 2024–2026 vectors —
registrar/DNS hijack, hosting/CI compromise, dependency supply-chain, third-party JS drainers,
blind wallet signing — were unassessed.

## Scope

apps/web + repo infra config: `next.config.js` (CSP/headers), `.github/workflows/*`,
`.npmrc`/`package.json`, wallet-signing flows. Domain/DNS/Vercel = advisory (not in code).

## Result

33 findings verified · 31 new (not in #700) · 3 overlap #1556. See `outcome.md`.
