---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — align the paste-ready input with the scope

- #519 checked: no comments, body still the template, no sub-issues, last update 2026-10-13.
- `ideas.md` §1 predated the verified scope and still carried dropped ideas (unsigned-tx first,
  ABI fragments, bigint, Injective trim, viem-style actions, OpenAPI client, one hook family,
  tsup → tsdown, retiring `@sodax/libs`). At the user's request it is now one table (package · what ·
  when), every row mapped to a `plan-v3-scope.md` item. Unscoped ideas were removed too (`@sodax/widget`,
  agent-framework adapters, snippet typecheck for all packages, env id in query keys).
- PR 504 merged (`5ee56ff8`, 2026-10-15). The user's 2.x issues #505 / #507 / #529 / #531 / #532 cover
  part of E5.1 / E5.4; the lifecycle and batching rows say so. `plan-v3-scope.md` updated to match.
- Then, at the user's request, rows numbered and ranked by an importance score /10 (weight impact first,
  then correctness / security, then DX; breaking items nudged up because 3.0 is their window).
