<!-- sodax-sdks quality checks: the default five, with the team's doc rules applied through the add-docs and docs-review skills. Edit from the console (⋯ → Checks). -->
Quality checks. Every change is built for, and reviewed against, all five:
1. Logic: it does what the plan and the acceptance criteria say; edge cases, error handling, no regressions.
2. Security: input validation, auth and permissions, secrets, injection, risky dependencies.
3. Tests: new or changed behaviour has tests, edge cases included, and the full test command ({{TEST}}) passes.
4. Docs, under the sodax-sdks doc rules (the add-docs and docs-review skills spell them out):
   - No hand-written code in docs. Code goes in a properly located .ts test or example that is type-checked or run,
     and the page references it, so the claim is tested and cannot drift.
   - Do not restate what the code, its types, ADRs or other docs already say. ADRs hold only knowledge the code cannot explain.
   - Anything that can drift will drift: every doc claim that can go stale has a check (test, type-check, link check) that fails when it does.
   Planning: list each doc to add or change with the check that guards it; use the add-docs skill to decide.
   Building: whoever writes docs invokes the add-docs skill first.
   Reviewing: one reviewer invokes the docs-review skill on the diff (git diff {{BASE}}...HEAD) and reports its findings with the others.
5. Skills: agent skills and instructions that describe the changed behaviour (packages/skills, .claude/skills, AGENTS.md,
   CLAUDE.md) are updated, or confirmed still true; the docs-review skill covers them too.
The repo's own rules come first: AGENTS.md, docs/AGENTS.md, docs/README.md, packages/skills/AGENTS.md.
Teammates do not see this conversation: name the skill in the spawn prompt of every teammate who writes or reviews docs.
