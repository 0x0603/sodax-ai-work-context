---
type: brief
repo: builders-sodax-mcp-server
github: 80
updated: 2026-10-23
status: Active — in draft PR #90, awaiting review
next: R0bi7 reviews draft PR #90 (incl. the epic amendments); merge closes #80
related_issues: [gh-79-agent-executable-swaps]
---

# GH-80 SODAX MCP execution model · brief

## State

- The ADR (173 lines) and README link are committed as `4ed6726` on `feat/agent-executable-swaps`, in draft PR #90
  (base `development`, CI green, no reviews yet).
- All six decisions have context, decision and consequences. The README link resolves.
- The three review findings in `process.md` are fixed in `4ed6726`: EVM receipt plus `connection` log check,
  Sui/NEAR address exemption, and the `not_submitted_unknown_quote` alert that fires only when `track` is called again.

## Next action

Wait for R0bi7's review on PR #90. Issue #80 closes only on merge.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Upstream request and acceptance criteria | `issue.md` | 0.2k |
| Review scope | `plan.md` | 0.1k |
| Findings and evidence | `process.md` | 1k |
| Review result | `outcome.md` | 0.2k |

## Landmines

The parent plan already proposes calldata containment and a cache-loss alert. This review challenges their guarantees,
not the lightweight-client or in-process-cache choices. D2 is an interim amendment to the epic's gateway decision.
