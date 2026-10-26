---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-19
updated: 2026-10-19
---

# 2026-10-19 — how R0bi7 files issues; epic #535

- Read `.github/issue-workflow.md`, the spec, bug and epic templates, `add-to-project.yml` and the
  PR template on `main`, plus R0bi7's 2026-10-18 issues #539 to #543.
- **Board auto-status:** Ready needs these sections filled:
  - spec: Goal, Requirements, Acceptance criteria;
  - bug: Observed, Expected, Acceptance criteria;
  - epic: Goal, Exit criteria.
- **Plan check:** trusts plan comments from members, collaborators and the `claude` /
  `chatgpt-codex-connector` apps.
- **R0bi7's specs:**
  - public API names appear in Requirements when the shape is the requirement;
  - code pointers sit in Context;
  - open questions go in a comment (#543);
  - #541 was written after its PR (#534).
- **Overlaps with this plan:** #540 ↔ T31.1 and #512; #543 ↔ T20.1 and decision 6. Details in
  `brief.md`.
- **Probe:** `https://api.sodax.com/v2/be/config/all` → 200 (version 2020008, 22 chains);
  `/v2/config/all` → 404.
