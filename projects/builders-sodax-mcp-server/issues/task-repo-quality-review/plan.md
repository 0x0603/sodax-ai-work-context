---
type: plan
repo: builders-sodax-mcp-server
github:
updated: 2026-11-26
---

# Plan

## Goal

Turn `review.md` into small PRs, cheapest and safest first. Proposal only: no order was agreed with the user.

## Suggested order

1. **Guard rails** (one small PR): typecheck tests (A1), pin deps exactly and fix `@types/express` (B7), SHA-pin CI
   actions (B8), pin the two selectors (D2), contract-vs-schema test (C5).
2. **Agent docs** (one PR, plus a hub card PR): `CLAUDE.md`, `docs/kb/invariants.md` seeded from header comments,
   add-a-tool / toolset / family checklists (A2).
3. **Operational safety**: `/health` off the upstream call (B1), close the listener on shutdown (B2), stop sending
   raw error text and unkeyed IP hashes to PostHog (B3, B4).
4. **Agent-facing data tools**: failure reasons (C1), no silent empties (C2), output cap (C3), input bounds (C7).
5. **Structure, after #147 merges**: shared `services/action/`, `errorDecision` out of `swapDecisions.ts`, typed
   wording instead of the regex reword, toolset table (A4), per-family Record (A5, A6), `dataTool` helper (C4),
   split `index.ts` (B5), `loadConfig` (B6).
6. **Multi-instance** with #125: one store interface for quotes and bridges, dedupe and alert budget behind it (A3).
7. **Tests**: shared mock factory and reset (D5), structural assertions instead of prose (D4), split big files (D6).

## Open

- Each step needs an issue before a PR (hub rule: every PR links an issue).
- A3: decide between "assert single-instance and document it" and the shared store.
