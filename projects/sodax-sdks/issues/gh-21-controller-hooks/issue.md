---
type: issue
repo: sodax-sdks
github: 21
status: Active
tags: [dapp-kit, dx, controller-hooks, state-machine, design]
updated: 2026-08-12
related_issues: []
related_decisions: []
---

# GH-21 Controller Hooks

- Source: https://github.com/icon-project/sodax-sdks/issues/21
- Started: 2026-08-12 (design pass — no code)
- Related PR: none. Created 2026-05-05; one comment, FezBox 2026-06-09: "Look at this next week."

## Problem

Define a **controller hook pattern** that wraps the fragmented per-feature hooks (quote,
approve, submit, chain switch, …) into one hook per feature. Each controller should expose a
clear state machine, provide one main action, allow escape hatches, and return typed results.

Today every feature makes the consumer wire their own state machine, handle chain-specific
quirks (Bitcoin setup, Stellar trustline, EVM switch), and repeat that per feature — which
produces duplicated logic, inconsistent implementations and a high adoption cost for partners.

## Context

Expected output per the ticket: shared controller building blocks; one controller per feature
(`useSwapController`, `useBridgeController`, `useMmController`, `useStakingController`,
`useDexController`); a before/after in `apps/demo`; existing granular hooks kept (controllers
are additive).

Out of scope: refactoring existing hooks beyond controller needs, migrating `apps/web`, wallet
UI changes (controllers stay headless).

Success criteria: significantly less code to build a feature UI; the same pattern across
features; a new partner integrating in ~30 minutes.

## Acceptance Criteria

Design first. Nothing in the ticket is buildable without agreeing the controller shape, and the
ticket has sat untouched since 2026-06-09.

## Related

- Knowledge:
- Decisions:
