---
type: plan
status: Active
updated: 2026-11-22
related_issues: []
related_decisions: []
tags: [claude-team-ui, agent-teams, codex, review, prompts, quality]
---

# Claude Team UI: review quality (layered prompts, code-first evidence, design check, Codex)

Parent plan: [claude-team-ui.md](claude-team-ui.md). Repo `~/code/claude-team-ui`.
Baseline checked 2026-11-22: team-ui `main` = `origin/main` = `2ad7791`, clean; the live console prompts under
`<project>/.claude/team-ui/prompts/` are identical to `team-ui/prompts/<repo>/` here.

## Status (2026-11-22)

- Parts 1, 2, 3 and 5 landed on team-ui `main` (`97b5978`, merged with the settings sheet redesign `a423ffb` as
  `fc352b9`): D67-D70, V18-V19, 435 smoke checks. Parts 1-3 went through /simplify and /code-review (13 findings, all
  fixed). The console on this Mac (Mac mini) was restarted on it.
- Prompts migrated here and in the live copies: the three `_rules.md` hold only their repo notes, `sodax-sdks/_checks.md`
  only its additions. Checked by rendering each project's review prompt with the console's code: default rules, notes,
  the Design check, `{{REPOS}}`, `/code-review`, no placeholder left.
- **Other machine:** run `scripts/setup-team-ui.sh` (pulls team-ui, then imports these prompts), then restart its
  console (`launchctl kickstart -k gui/$(id -u)/com.claude-team-ui`, or `./start.sh`). An old console process reading
  the cut files would run without the default rules.
- Part 4 (Codex) landed on team-ui `main` as `3153711` (D71, V20, 447 smoke checks), after /code-review (14 findings,
  all fixed; the guard bypasses it proved — launchers, a quoted `-s`, `cd` before `-o` — are closed). The review step
  runs Codex independently on `git diff --merge-base`, then one exchange over the lead's answers; `codex exec review`
  was dropped because `--base` covers only commits and `--uncommitted` only the rest. Console restarted: Codex on,
  logged in with ChatGPT. Other machine: install Codex (`brew install --cask codex`, `codex login`) as well.
- Next: a first real Quick run on a small sodax-sdks issue, to see the new steps end to end.

## Goal

Plans and reviews rest on code, not on docs or guesses; they judge whether the solution and its architecture are
right, not only whether it works; and a second model (Codex) checks Claude's plan and diff. Quality over quota.

## Part 1: layer `_rules.md` and `_checks.md` (do first; parts 2-3 depend on it)

Today a project file replaces the default whole (`lib/cartridges.js:668-671`). The sdks, backend and frontend
`_rules.md` are the default copied verbatim plus a "Repo notes" list (checked with `diff`), so every default change
must be made four times and a missed copy drifts silently. This supersedes the 2026-10-27 decision in the parent plan.

- `template()` for `_rules.md` and `_checks.md`: default + project additions (each part's leading comment stripped,
  `render()` at `lib/cartridges.js:696-697`). Compat: if a project file still starts with the default body, drop that
  prefix, so old copies do not double the rules.
- `_standards.md` keeps replace semantics: Retro edits and deletes rules in the project copy and Adopt writes the whole
  file (D60). `_summary.md`, `_pr.md` unchanged.
- No way for a project to remove a default line: no project needs it today.
- Editor (`GET/POST template`, `server.js:1337-1345`, and its sheet in `public/app.js`): edits only the additions and
  shows the default read-only above them.
- Migration here: cut the three `_rules.md` to their "Repo notes"; rewrite `sodax-sdks/_checks.md` as additions
  ("In this repo, check 4 also means …" + the repo-docs line). Same edit in the live copies.
- Rollout order: update team-ui on both machines before importing the cut files. An old console reading notes-only
  files runs without the default rules.

## Part 2: code is the source of truth

The default `_rules.md` has "every claim cites file:line" but says nothing about docs, comments or other repos.

Add to the default `_rules.md` (generic, no sodax names):
- Code is the source of truth. Docs, READMEs, code comments, issue text and earlier plans are leads, not evidence:
  check each claim a plan or review relies on in the code and cite file:line. A doc or comment that disagrees with the
  code loses, and the mismatch is a finding.
- When the change depends on another repository (a package, a service's API, a contract), read that repository's
  code; do not infer from names, types or docs. Read the version actually used: a package at its lockfile version
  (`node_modules`, or `git show <tag>:<path>` in its repo), a service at its deployed branch. Say which version you
  read. Repositories on this machine: `{{REPOS}}`. If you cannot read it, mark the claim unverified; never guess.

Code:
- New variable `{{REPOS}}`: the registered projects, name and path, one per line.
- `30-quick-plan.md` and `06-retro.md` do not carry `{{RULES}}` today: add it to the quick plan (retro stays).
- Guard: `hooks/guard.mjs:31-34` blocks writes only in the cartridge's own project and its worktrees; a write into
  another registered project is not blocked. Block Edit/Write inside every registered project except the cartridge
  folder (pass the paths in the cartridge `state.json`). Known gap left as is: Bash writes (`sed -i`, `>`) are not
  path-checked, the same as today for the own main checkout.
- If V1 shows reads outside the cartridge prompt: add the registered project paths to `permissions.additionalDirectories`
  in `applyMode()` (`lib/cartridges.js:384-418`), which teammates read too.
- sodax specifics stay out of the default. If V2 shows the hub `CLAUDE.md` is not loaded in a worktree session, add a
  line to each sodax project's notes: the hub card `sodax-command-center/docs/repos/<repo>.md` lists what the repo
  consumes and from where (e.g. builders-sodax-mcp-server consumes IF-24 from sodax-backend).

## Part 3: design check

The five checks (`prompts/_checks.md`) are logic, security, tests, docs, skills. None asks whether the solution is
the right one; Standards cleans the diff, but only after the build, when a wrong approach is expensive.

- `_checks.md` check 6, Design: solves the real problem at the right layer and repo; fits the existing architecture
  and patterns; reuses what the repo has; no abstraction with one user; the simplest approach that meets the criteria.
- Plan prompts (`30`, `40`, `01` for `final-plan.md`): a section "Approach": the chosen approach, where it sits
  (layer, module, repo), one or two alternatives considered and why not. Quick: two or three lines.
- Review prompts (`32`, `42`, `05`, `10`): a design finding is major only when it names the better option concretely,
  a repo pattern at file:line or a simpler approach that meets the criteria; otherwise minor, under Follow-ups. This
  keeps taste from bouncing work back to Build.
- "five" → "six": `prompts/30-quick-plan.md:15`, `32-quick-review.md:11,24`, `42-standard-review.md:27`,
  `05-review-qa.md:31`, `10-review.md:25`, `README.md:103,108`, `public/app.js:199`, `docs/design.md` D26.

## Part 4: Codex second opinion (needs Codex installed and logged in)

Not in team-ui today (`rg -i codex` finds nothing). Mechanism: the lead runs `codex exec` inside the existing plan and
review steps, no new step kind (D1: prompts, not orchestration code; autopilot, budget guard and transcripts keep
working; no state migration for running cartridges).

- Plan, all flows, on the final plan (quick: after the lead's plan; standard: after the critic; full: on
  `final-plan.md` after cross-review, before the plan checkpoint). Up to two rounds, through files (D9), each Codex
  call fresh:
  1. Codex → `plans/codex-plan-1.md`: approach first (check 6), then gaps; severity and file:line; parts 2 rules.
  2. Lead → `plans/codex-reply-1.md`: per finding, accepted (where the plan changed) or rejected (file:line evidence).
  3. Only if something was rejected: Codex reads the revised plan and the reply → `plans/codex-plan-2.md`, per
     finding withdrawn or held, with evidence.
  4. A held critical or major finding goes into the plan's open questions, which `openQuestions()`
     (`server.js:105`) picks up, so hands-off stops at the plan checkpoint (away timeout as for any question).
- Review, all flows, beside the Claude reviewers: Codex → `plans/codex-review.md`, one round. The lead checks each
  finding at file:line and merges it into `review.md` tagged `[codex]`; a rejected critical or major goes under
  "Disputed", shown at the merge checkpoint. Fix rounds: Codex reads only the diff since `{{SINCE}}` plus the earlier
  findings' status.
- Variables `{{CODEX_PLAN}}` / `{{CODEX_REVIEW}}`: empty unless `codex` is on PATH and logged in, so flows run as
  today without it. Settings shows Codex on or off and why.
- Done check: with Codex on, `PLAN DONE` counts only once `plans/codex-plan-1.md` exists; otherwise nudge.
- Guard: a Bash segment running `codex` is allowed only as `codex exec` with `--sandbox read-only` (or `-s
  read-only`) and none of the bypass flags (`--dangerously-bypass-approvals-and-sandbox`, `--full-auto`, `--yolo`,
  a `-c`/`--config` sandbox or approval override); every other subcommand (`apply`, `cloud`, `mcp`, …) blocked,
  `login status` allowed. Why: the guard sees only Claude's tool calls, and full auto allows permission prompts, so
  a writable Codex could push or call `gh` unseen.
- `applyMode()`: allow `Bash(codex exec:*)` so hands-off does not stop on a prompt.
- Billing: Codex on the ChatGPT login only, never `OPENAI_API_KEY` (like D2). V3 decides how.
- `scripts/install-launchagent.sh`: add the codex folder to the agent's PATH.

## Part 5: Claude Code's `/simplify` and `/code-review` inside the flows

No team prompt uses them today: Standards has a hand-written simplify line (`prompts/04-standards.md`), the reviews
use their own reviewer prompts.

- Standards step: after the standards fixes, run `/simplify` on the change (applies fixes; stage by name, never
  commit). It replaces the hand-written simplify line and adds the efficiency and altitude angles.
- Review step, all flows: the lead runs `/code-review` at `high` (read only, no `--fix`) beside the reviewer
  teammates, checks each finding at file:line and merges it into `review.md` tagged `[code-review]`. Fix rounds:
  only the diff since `{{SINCE}}`.
- V19 (verified): a team lead calls both skills; `/code-review` runs as a background agent (no tmux pane) and the
  lead waits for its findings; `/simplify` applies behaviour-keeping fixes and stages them. The lead runs both (D70).
- Cost: several extra agents per round; accepted, quality over quota.

## Verify first (real behaviour, then `docs/verify.md`)

- V1: in a cartridge session, does Read/Grep of a file in another registered project ask permission?
- V2: does a session started in `<project>/.claude/worktrees/<id>` load the hub `CLAUDE.md` above it?
- V3 (after `codex login`): `codex exec` flags as used above; `-o` writes under a read-only sandbox; the read-only
  sandbox can read sibling repos; how to force the ChatGPT login (`forced_login_method` in `~/.codex/config.toml`,
  or unset `OPENAI_API_KEY` in the session); how long a plan review takes against the 10 min Bash cap.

## Delivery

- One branch in claude-team-ui, `feat/review-quality`, a commit per part; the settings UI redesign is a separate
  branch (`feat/settings-ui`).
- Each part: `test/smoke.mjs` checks (layered render, `_standards.md` still replaces, guard blocks a write into another
  project and an unsafe `codex` call, prompts carry the Codex section only with `test/fakes/codex` on PATH, `PLAN DONE`
  without `codex-plan-1.md` not accepted); `npm test` and `npm run check` pass; `docs/design.md` decisions
  (layered prompts, code-first rule, design check, Codex) and README Workflow updated.
- Then /simplify and /code-review, fix, retest, and wait for "commit push".
- Context repo: the prompt migration (part 1) after the team-ui change is on both machines; then
  `scripts/setup-team-ui.sh --export` and commit here.
