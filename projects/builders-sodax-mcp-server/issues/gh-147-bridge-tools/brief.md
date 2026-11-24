---
type: brief
repo: builders-sodax-mcp-server
github: 147
status: Active
next: write plan.md using the 2026-11-24 review — trusted rebuild, bridge packet matching, recovery evidence, units and retention
updated: 2026-11-24
---

# GH-147 Bridge tools · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Issue #147 created 2026-11-23 (Feature, parent #119, Sodax board Backlog, stream Builders MCP, assignee 0x0603).
- Branch `feat/147-bridge-tools` off `origin/feat/129-next-action` @ `33e9e24` (PR #138), local only, no commits,
  no upstream. Worktree `sodax-command-center/repos/client/builders-sodax-mcp-server-wt-147`, deps installed.
- No plan yet; no code.
- Reviewed 2026-11-24: #138 and #145 remain open; branch/worktree verified clean at `33e9e24`.
  GitHub now redirects the repository to `gosodax/sodax-mcp`; local paths are unchanged.

## Blocked on

1. Bridge PR targets `feat/129-next-action` until #138 merges, then retarget to `development`.
2. Spoke→spoke delivery tracking needs #145 merged (or merged into this branch), plus a bridge-specific
   packet matcher: #145's current matcher requires the swap intents contract as sender.

## Next action

Write `plan.md` from `process.md` §2026-11-24 review: trusted inputs and full source-tx/approval verification
(separate Sonic path), packet matching per route, evidence-based recovery/handoff, amount units, and build
retention/resume. Define tool inputs/outputs and `nextAction` per status. No implementation yet.

## Settled — do not re-litigate

- Base on #138 (user, 2026-11-23). Not on #137 (conflicting) or #145 (merge in when tracking).
- Scope: EVM spokes + Sonic sources; non-EVM later; Bitcoin refused.
- No story points until (a) and (b) have a worked-out approach.

## Open

- Rename profile `swap` → `actions` before release #76 (recommended; not decided).
- Destination scope: clarify whether non-EVM destinations remain supported. #145 proves only `sent` on
  Bitcoin/Injective, whereas #147 currently promises final delivery.
- Recovery scope: explicit SDK/UI/operator handoff within the two tools, or an additional recovery action.
  A polling timeout cannot promise a refund or establish the current token location.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the backend/SDK give, with file:line | `issue.md` | 0.6k |
| Review findings and decisions needed before planning | `process.md` | 2.0k |
