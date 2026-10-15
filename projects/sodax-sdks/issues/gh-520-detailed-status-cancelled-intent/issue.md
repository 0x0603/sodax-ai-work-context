---
type: issue
repo: sodax-sdks
github: 520
status: Active
tags: [swap, leverage-yield, detailed-status, dapp-kit, polling, solver, intent-journal]
updated: 2026-10-15
related_decisions: []
related_issues: [371, 504]
---

# GH-520 useDetailedStatus never stops polling a cancelled intent

- Source: https://github.com/icon-project/sodax-sdks/issues/520 (filed by me, 2026-10-14)
- Started: 2026-10-15
- Related PR: https://github.com/icon-project/sodax-sdks/pull/523

## Problem

After an intent is cancelled on the hub, `useDetailedStatus` polls forever. `getDetailedStatus`
routes every failed/abandoned submit-tx record to the solver, and the solver kept answering
`status: 2` for the cancelled intent, so every 3s the hook hits backend + relay
(`get_transaction_packets`) + solver again. Restarts after a reload.

Seen on Base: src tx `0x6c891b31…5715635c1e57baa5d` expired, USDC refunded, solver still `2` after
15+ min. Hub `intentStates(0x82cd…3240)` = `exists: false, receivedOutput: 0`.

Bug is on main since #371; the demo only shows it with #504. Repro: localStorage snippet in the issue
body, on the #504 demo preview Swap SDK page.

## Context

Issue's proposed fix: keep asking both, add a stop; don't key on the submit-tx record's
`intentCancelled` (it disappeared once `abandonedAt` was set); use hub intent state. See `plan.md`
for why the hub signal was swapped for the intent journal.

## Acceptance Criteria

- An intent cancelled with nothing filled reads terminal (`FAILED`) from `getDetailedStatus`,
  whatever state the submit-tx record is in, so the hook stops on the first tick that sees the cancel.
- Same for leverage-yield `getDetailedStatus`.
- A swap the client-side fallback completed never reads failed.
- No extra requests while the backend record is in play; public `getStatus` unchanged.
- Cancel after a partial fill: unchanged (out of scope).

## Related

- Knowledge:
- Decisions:
- #371 `feat(sdk,dapp-kit): make swap status readable from any hash` (introduced the routing)
- #504 `feat/302-swap-lifecycle` (demo that surfaces it)
