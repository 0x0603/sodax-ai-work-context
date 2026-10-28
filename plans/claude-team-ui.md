---
type: plan
status: Active
updated: 2026-10-28
related_issues: []
related_decisions: []
tags: [claude-team-ui, agent-teams, tooling, phone, security, cross-repo]
---

# Claude Team UI — my agent-team console for sodax

`github.com/0x0603/claude-team-ui` (private), checked out at `~/code/claude-team-ui`. A browser console, phone
first, that runs Claude Code agent teams on the sodax repos: one cartridge per issue (worktree + branch + tmux
session), a quick, standard or full flow with my approval gates, plan usage (5h/7d) and cost per cartridge, Open PR.
How to use: its `README.md`. Decisions and API: `docs/design.md`. Facts checked on Claude Code 2.1.311: `docs/verify.md`.

Setup on a machine: `scripts/setup-team-ui.sh` (this repo) clones or updates it, installs nvm and the pinned Node
versions, and imports `team-ui/projects.json` (projects, Node pins, setup and test commands) plus
`team-ui/prompts/<repo>/` (per-repo rules and checks). After changing any of it in the console:
`scripts/setup-team-ui.sh --export`, then commit here.

## Goal

Control the teams from my phone, also away from home, without a leaked link giving anyone control. Ask the console
things while I am out and get an answer I can paste back; plan and create issues from the same chat.

## Done (2026-10-27)

- v1.0 pushed (`b47dc58`, README images `114e73b`). 9 sodax repos registered; sodax-sdks pinned to Node 24.
- Console at `57b617b`: quick / standard / full flows with the five checks, config sync (`bin/team-ui-config.js`),
  full auto, live status, step timeline, hand-over from any step, PR follow-up, `--tailscale`.
- Second machine (`sangs-mac-mini`) set up with `scripts/setup-team-ui.sh` (tmux, nvm, Node 24). Tailscale installed
  on the Mac and the iPhone, same account; the console answers at the Mac's tailnet address with the token. It still
  runs with `--lan` today.
- Checked on real Claude: planning lock for lead and teammates, plan usage, agent messages, cost, clean stop, Node 24
  inside agent shells, a full quick flow (plan → build with 2 commits → review READY TO MERGE). New on 2026-10-27:
  `claude -p --resume <id>` keeps the conversation between calls, and `--output-format stream-json
  --include-partial-messages` streams text deltas, tool events and a `rate_limit_event`.
- This repo: `team-ui/projects.json` now carries `setupCommand` and `testCommand` for all 9 projects (verified against
  each repo's package.json, hooks and CLAUDE.md), Node 22.23.4 for sodax-backend (its `engines`), Node 24 for
  sodax-frontend (its CI), and per-repo rules in `team-ui/prompts/{sodax-sdks,sodax-backend,sodax-frontend}/_rules.md`.
- Console at `97bfb15` (evening of 2026-10-27, four merges, 240 smoke checks): the **assistant** (a chat per question with
  Conclusion, Evidence and a reply draft, plus: the chat keeps the scope it was opened with, a model per chat, a draggable button, Summary /
  Copy / Share on notebook files; tool allowlist narrowed to `gh issue view|list`, `gh pr view|list|diff|checks`,
  `gh search`, `git log|show`, `rg` after a review found `Bash(gh issue:*)` also allowed `create`); **flow ops +
  picker** (chips with assignee / author / label / state / sort, `setupCommand` per project with its log,
  Risks split from Open questions, quick build by the lead alone, fix-round reviews with `{{SINCE}}`); **chat +
  digest + away mode**: a Chat tab per cartridge from the lead's transcript with quick replies by state, a
  fixed-format `plans/summary.md` section per step (`{{SUMMARY}}`) shown as a verdict card with tickable findings
  and code excerpts, a verdict line on the home ticket, "Decided for you" after `questionTimeoutMin` (15) of
  waiting, PR comments checked on request (no timer, to save calls). The console runs detached from the terminal
  now, still with `--lan`.

## Done (2026-10-28)

- E1 + E2 (console `5982b96`, docs `1efb4d3`): Tidy up (sizes, eject finished, hibernate, orphans, post-eject branch
  clean-up, `ejected.json`), RAM line, idle power-off, dismiss idle agents, `projects[].env`, cost guard (`budgetUSD`,
  `quotaPausePct`), `scripts/install-launchagent.sh`; assistant chips, pasted issue/PR links, Post review to the PR,
  unreachable bar. `pnpm store prune` is unticked by default (shared store).
- Console `44eb0f3` (331 smoke checks): plan usage refreshed from claude.ai's usage endpoint with the login Claude
  Code saved, no model call (D54, verify V15); the Flow digest shows the report's own summary, scrolled inside, and
  the Flow tab is compact on phones; the chat shows sending / sent and the lead's activity until it answers; **Push
  fixes to the PR** for review cartridges (D55, agents still never push); **Save to context** copies notebook files
  into `projects/<repo>/issues/<folder>/` here, with frontmatter and `brief.md` rows (D56, `contextDir` in
  `team-ui/projects.json`); Tidy up offers local branches whose commits are all on GitHub and refuses a prune that
  would drop a commit (D57).
- Runs at login: LaunchAgent `com.claude-team-ui` with `--tailscale`, logs in `~/Library/Logs/claude-team-ui/`. LAN
  addresses get 403; my own tailnet devices need no token. It needed two fixes: the Tailscale app's binary acts as the
  CLI under launchd only with `TAILSCALE_BE_CLI=1` (verify V16), and without the shell profile's
  `COREPACK_ENABLE_AUTO_PIN=0` corepack's pnpm wrote `packageManager` into package.json, so the server sets it.
- Workspace branch clean-up: 192 local branches deleted across the clones and hub submodules (every commit on GitHub,
  on a remote branch or inside a merged PR head) and 18 worktree records pruned whose `/tmp` scratchpad folders macOS
  had emptied. Restore list on this Mac: `~/.config/claude-team-ui/deleted-branches-2026-10-28.tsv`.

## Next

1. **First real standard and full runs**: a medium sodax-sdks issue with standard, then a big one with full. The full
   flow's 5-agent planning has not run for real yet; neither have the `{{SUMMARY}}` prompts outside quick. (A quick
   flow ran for real on 2026-10-27, a review of PR 578 on 2026-10-28.)
2. **Legacy clones**: `sodax-sdks/` and `sodax-frontend/` stay only for 7 branches never pushed (`feat/solana-page`
   65 commits, `feat/leverage-positions` 24, `feat/support-p2sh`, `feat/bridge-api-package`,
   `fix/swap-speed-tier-vault-lookup`, `test/ci-skip`, `apply-ai-export-improvements`). Back them up on my fork or
   drop them, then delete both clones. `sodax-backend/` stays for the parked bridge alerter stash.
3. Optional: HTTPS through `tailscale serve`.
4. Later: Retro copies spec / plan / review / retro here on its own (Save to context does it by tap now); the
   assistant may scaffold a dossier with `scripts/new-issue.sh` (v2, it is read-only in v1).

## Team-operation findings (2026-10-27, console `57b617b`)

1. **Hands-off stops at every quick and standard plan gate.** `openQuestions()` (server.js:71–88) takes every numbered
   item under a heading that mentions "question"; `prompts/30-quick-plan.md` item 6 and `40-standard-plan.md` item 7
   are "Risks and open questions for me (numbered)", so every risk counts as a question and `continueAfter`
   (server.js:126) pushes "N questions for you" instead of approving. Fix: separate "Risks" and "Open questions"
   sections, "None" when empty (the parser drops it). `01-planning.md` and `00-spec.md` already separate them.
2. **No setup step for a new worktree.** `Cartridge.prepare()` (lib/cartridges.js:259–263) only creates `plans/`,
   writes the exclude list and applies the mode, so sodax-sdks, sodax-backend and sodax-frontend cartridges start
   without `node_modules` or built packages and the first commit fails in the hook (see the memory notes on those
   hooks). Fix: `projects[].setupCommand`, run after `git worktree add` with the project's Node first on PATH, with a
   "Preparing" state and a log; `bin/team-ui-config.js` must carry the field (today export writes only `node` and
   `testCommand`, lines 36–37, and import passes only those two to `updateProject`, line 56).
3. **`testCommand` was empty for all 9 projects**, so `{{TEST}}` fell back to "the test command documented in
   CLAUDE.md or the README" (lib/cartridges.js:367) and every team had to work it out. Filled in this session.
4. **The quick flow pays for a developer it does not need.** `31-quick-build.md` has the lead spawn "dev" and forbids
   the lead to code, so the plan the lead just wrote with the code in context is re-read by a fresh agent. For a
   one-page plan the lead should code itself; the independent reviewer in `32-quick-review.md` stays.
5. **Fix rounds re-review everything and lose the earlier report.** `sendBack` (server.js:135–158) returns to Build,
   then the review step is re-sent unchanged (`32-quick-review.md`, `42-standard-review.md`, `05-review-qa.md`): a new
   reviewer reads the whole diff again and overwrites `plans/review.md`, the list the fix was based on. Fix: a
   `{{SINCE}}` commit recorded when a review completes; round N moves the old report aside, checks each earlier finding
   and reviews only `git diff {{SINCE}}...HEAD`. `MAX_AUTO_FIXES = 2` (server.js:65) stays.
6. **No cheap tier.** `models.fast` is `opus` (config.json and `team-ui/projects.json`), so `{{FAST}}` developers and
   the tests-docs reviewer cost the same as `{{STRONG}}`; the 7-day window sat at 83 % on 2026-10-27 with overage
   disabled at org level. Open decision below.
7. **sodax-sdks hook in linked worktrees.** Committing from a worktree on an old base wrote `core.bare=true` and
   `commit.gpgsign=false` into the shared `.git/config` (hook leaked `GIT_DIR`). Main's `.husky/pre-commit` has had
   `unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE` since 2026-09-14 (#301), verified again at `a93a886`. The console
   creates worktrees from the fetched base, so only cartridges left on an old base are at risk; the per-repo rules say
   to merge main first when the line is missing.
8. **Husky is not wired in two main checkouts.** sodax-frontend and sodax-backend have `core.hooksPath` unset and no
   `.husky/_` (their `prepare` never ran), so commits there run no hooks; sodax-sdks and builders-sodax-mcp-server are
   wired. A worktree gets hooks only when the setup command runs `pnpm install` without `--ignore-scripts`.
9. **sodax-backend requires Node 22.23.x** (`engines` and `.nvmrc`); the machine default is 22.15, which pnpm refuses.
   Pinned in `projects.json`; `setup-team-ui.sh` installs it.
10. Other verified details: sodax-frontend now has a small `node --test` suite under `apps/web/scripts/` (the old
    "no tests at all" note is outdated); the backend's incident-manager index flake was fixed in the test itself
    (`beforeAll` awaits `syncIndexes()`), so the "retry the commit" advice is dropped; sodax-scan only has tests in
    `explorer/` (yarn v1 + vitest; `indexer/` needs bun, which this Mac lacks); sodax-data-backend's pytest needs a
    local Postgres + TimescaleDB (its `tests/conftest.py`), and the brew `postgresql@14` service is not running here;
    sodax-unified-api's only check is the Dockerised `haproxy -c` from its CLAUDE.md, and Docker was not running here.

## Decisions

- 2026-10-27: three flows by task size; every flow builds and reviews logic, security, tests, docs and skills
  (`prompts/_checks.md`, editable per project). Standard keeps a Simplify step.
- 2026-10-27: the assistant is a `claude -p --resume` conversation, not a tmux cartridge: read-only tools, action cards
  that run only on tap through the existing routes (D3, D13 and D16 hold), reply drafts in English, everything else in
  the language I write.
- 2026-10-27: per-project setup and test commands live in `team-ui/projects.json`; repo gotchas live in
  `team-ui/prompts/<repo>/_rules.md` as a copy of the default rules plus a "Repo notes" list, because a per-project
  file replaces the default.
- 2026-10-27: quick flow: the lead codes itself, one reviewer stays. Review rounds keep earlier reports and review the
  diff since `{{SINCE}}`. Plan prompts separate Risks from Open questions.

## Open decisions

- `models.fast`: keep `opus` for quality or move developers and the tests-docs reviewer to `sonnet` while the 7-day
  quota is tight. Decide after the first real runs show where quality actually drops.
- Bilingual UI (EN/VI toggle, Vietnamese strings in one dictionary file): an exception to the English-only rule
  for committed files. Not decided.
- `origin` of the sodax-sdks submodule still points at `icon-project/sodax-sdks` (moved to `gosodax`). GitHub
  redirects should keep push and PR working; untested. Switch the remote if it fails.
- sodax-unified-api's test command copies the repo's documented placeholder host (`*.iconblockchain.xyz`) for the
  config parse; it is a stub for `haproxy -c`, not an API host, but it could be swapped for `api.sodax.com`.
