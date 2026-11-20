---
type: issue
repo: builders-sodax-mcp-server
github: 129
status: Active
tags: [mcp, swap, agent-ux, structured-output]
updated: 2026-11-20
related_issues: [119, 126, 127, 130, 132, 125]
related_decisions: []
---

# GH-129 Swap tools: a machine-readable next action in every result

- Source: https://github.com/gosodax/builders-sodax-mcp-server/issues/129 (parent epic #119)
- Started: 2026-11-20
- Related PR: none yet

## Problem

The swap tools' decisions (confirm before signing, send steps in order, retry caps, when the workflow is over)
live only in `nextStep` prose. A runtime has to know every status and error code, or ask a model to read the
text. The goal is a `nextAction` object in every result, errors included, so a runtime needs three branches:
run `call_tool`, stop on `none`, hand anything else to a person.

## Acceptance Criteria (as filed, 2026-11-16)

- Every swap tool result, errors included, has `nextAction`; `terminal` true exactly when type is `none`, with
  `outcome` one of `succeeded`, `refunding`, `refunded`, `cancelled`, `failed`, `unknown`.
- `solved` terminal only once delivered (#127's `delivered`); `in_transit` keeps a `call_tool`.
- A ready quote returns `confirm` bound to `quoteId`/`expiresAt`, then `execute` (`waitFor: "receipt_success"`,
  steps in order); `afterSend` stays.
- Retries carry `until` when the server knows the time, else `maxAttempts` + `retryKey`.
- `nextStep` and `nextAction` come from one decision function; a test walks every status, reason and error code.
- Phase 2: `outputSchema` for the swap tools, with a test that every result passes it.
- README: the action types, what a runtime does with each, an unknown `type` goes to a person.

The filed text names `sodax_swap_quote`; since #134 it is `sodax_swap_price` + `sodax_swap_prepare`.
`plan.md` records where this plan departs from the AC and why.
