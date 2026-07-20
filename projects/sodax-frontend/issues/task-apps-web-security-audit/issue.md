---
type: issue
repo: sodax-frontend
github:
status: Active
tags: [security-audit, web3-frontend, apps-web, auth, xss, csp, wallet, re-audit]
updated: 2026-07-17
related_decisions: []
related_issues: [700, 1555, 1556, 1557, 1559, 1560, 1197]
---

# Task — apps/web independent re-audit (Security audit · epic #700)

- Source: ad-hoc user request — "audit the whole source, focus on apps/web"
- Started: 2026-07-17
- Related PR: none of my own (findings map onto existing issues/PRs — see `outcome.md`)

## Problem

User-requested Web3 frontend audit of **`apps/web`**, run **blind** — without
first reading `plans/security-audit-tracker.md` or the Codex report. Brief: four
axes (wallet integration · blockchain state & reactivity · security & UX ·
readability), a vulnerability/code-smell/UX-friction summary, refactors for the
top 3, plus fresh web research on current FE attack vectors.

Because it ran blind, its real value is **independent corroboration**, not novelty:
it rediscovered the epic's P0 from scratch and — critically — **confirmed by hand
that the P0 is still live on `origin/main`**, matching the tracker's warning that
PR #1568 is open but unmerged.

## Context

Scope: `apps/web` (600 TS/TSX, ~73k LOC, 28 API routes). Next.js 15.5.18, React 19,
wagmi + viem, @sodax/* 2.0.0-rc.21, better-auth 1.4.18, MongoDB, TipTap CMS.

**This task is NOT a new phase.** Epic #700's phases are already numbered and
owned (#1555 P0 · #1556 XSS/CSP · #1557 endpoint abuse · #1559 financial-flow UX ·
#1560 SDK/wallet · #1561 node tooling · #1558 auth/CMS). Every finding here maps
onto one of those — see the mapping table in `outcome.md`.
`plans/security-audit-tracker.md` stays the single pane of glass; this folder only
holds the re-audit's evidence.

Method caveat: the multi-agent workflow **died mid-run** (340/461 agents hit the
session limit), taking out most of the verify phase plus gap-hunt, synthesis and
refactor. Its returned "13 confirmed / 132 refuted" tally is **not trustworthy** —
dead verifiers scored as "refuted", and the severe findings landed in that bucket.
Everything asserted here was re-verified by hand. See `process.md`.

## Acceptance Criteria

- Findings mapped onto the existing epic issues rather than re-raised as new ones.
- Independent evidence that SEC-01 is live on `main` recorded where it helps push
  #1568 to merge.
- Anything genuinely *not* covered by the Codex report identified as such.
- Unverified finder output labelled unverified, never reported as confirmed.

## Related

- Plan: `plans/security-audit-tracker.md` — **read this first**; it is canonical.
- Knowledge: candidates — better-auth `additionalFields` `input: false` footgun;
  "never `JSON.stringify` into an inline `<script>`".
- Issues: #1555 (SEC-01 P0, PR #1568 unmerged), #1556 (XSS & CSP, not started),
  #1557 (endpoint abuse), #1559 (financial-flow UX), gh-1560 (Phase 2 dispositions),
  #1197 (CSP `script-src` rollout)
