---
type: brief
repo: builders-sodax-mcp-server
github: 80
updated: 2026-10-23
status: Active — draft reviewed
next: Correct the three review findings, then seek owner review of the proposed epic amendments
related_issues: [gh-79-agent-executable-swaps]
---

# GH-80 SODAX MCP execution model · brief

## State

- The user wrote a 159-line proposed ADR in the MCP repo and linked it from README.
- The ADR is untracked; README is modified on `feat/agent-executable-swaps`.
- Review only: neither upstream file was edited, committed or pushed during this review.
- All six decisions have context, decision and consequences. The README link resolves.
- Three corrections remain: prove source execution, preserve valid Sui/NEAR addresses, and qualify cache-loss alert guarantees.

## Next action

Use `process.md` to revise the ADR when requested. Keep the in-process cache decision; clarify its observable failure path.
Issue #80 additionally requires a merge, so local draft coverage does not close it.

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
