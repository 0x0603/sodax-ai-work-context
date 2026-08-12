---
type: issue
repo: sodax-frontend
github: 1374
status: Active
tags: [dependabot, supply-chain, pnpm-overrides, security, phase-3]
updated: 2026-08-12
related_issues: [gh-1375-dismiss-unreachable-dependabot-alerts]
related_decisions: []
---

# GH-1374 Pnpm Overrides Dependabot

- Source: https://github.com/icon-project/sodax-frontend/issues/1374
- Started: 2026-08-12 (triage only — no code written, on purpose)
- Related PR: none
- Parent: #1365 (Dependabot alert reduction), Phase 3 of 5

## Problem

Add a `pnpm.overrides` block in the root `package.json` for ~12 transitive deps flagged by
Dependabot (the ticket names axios, undici, h3, kysely, qs, minimatch, picomatch, postcss, ws,
yaml, lodash), plus a CI guard so a future `pnpm install` that breaks an override breaks CI
rather than security posture.

## Context

Robi's warning, quoted in the ticket: *"pnpm override is lost once pnpm lockfile changes."*
The `overrides` block persists, but its **effect** can shift silently when transitive
resolution moves.

Two mitigations the ticket says must ship with the PR:

- a CI step (or root script) running `pnpm why <pkg>` per override that **fails** when the
  resolved version is below the asserted floor;
- where the patched version is already a direct dep, **bump the direct dep instead** —
  overrides only for genuinely transitive cases.

Stated risk: **Medium**. Changes resolution under Trezor connect, Injective SDK, Stellar SDK,
WalletConnect and Vercel Blob. *"Needs testing of all wallet flows + RPC calls before merge."*

Sequencing in the ticket: *"Hold until the Next.js bump (separate sub-issue) has baked in prod
for one release cycle."*

## Acceptance Criteria

- [ ] `pnpm.overrides` block covering the (re-derived) transitive set.
- [ ] `pnpm why` floor guard wired into CI.
- [ ] Direct deps bumped rather than overridden where applicable.
- [ ] Wallet flows + RPC calls tested before merge.

## Related

- Knowledge:
- Decisions:
