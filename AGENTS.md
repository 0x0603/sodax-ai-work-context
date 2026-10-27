# Sodax — AI Work Context (Workspace Instructions)

Shared instruction set for AI agents (Claude Code, Codex, …) working in the
`sodax/` workspace. **This file is the single canonical source of truth.**
`CLAUDE.md` is a symlink to this file, and the workspace-root `AGENTS.md` /
`CLAUDE.md` are symlinks to it too (created by `bootstrap.sh`).

## Workspace layout

`sodax/` is a plain folder (not a git repo) holding several independent repos.
Its absolute path can differ by machine:

| Path                       | Owner          | Purpose                                  |
| -------------------------- | -------------- | ---------------------------------------- |
| `sodax-command-center/`    | icon-project   | **Team hub — new code work starts here.** Core repos as submodules under `repos/<layer>/<name>` |
| `intents-whitelabel/`      | icon-project   | Not in the hub; work in this clone       |
| `sodax-document/`          | icon-project   | Not in the hub; docs sync target         |
| `sodax-backend/`, `sodax-frontend/`, `sodax-sdks/`, `builders-sodax-mcp-server/`, `sodax-sdks-<n>/` | upstream | Legacy standalone clones, kept only to finish in-flight branches. Delete once clean |
| `sodax-ai-work-context/`   | 0x0603 (mine)  | **This repo** — private, synced AI memory |

The `icon-project/*` repos are upstream work repos. `sodax-ai-work-context` is a
**separate private repo** for my own AI work context (plans, decisions,
research). Keep the two worlds separate.

## Working in `sodax-command-center/`

The hub's own `CLAUDE.md` is the router for code: repo cards
(`docs/repos/<name>.md`), cross-repo interfaces, `onchain find`, and skills such
as `create-issue`. This file stays the router for my context only; from the hub
it lives at `../sodax-ai-work-context/`.

- Branch, commit and open PRs inside `repos/<layer>/<name>`, never in the hub.
  Don't commit the submodule pointer changes `scripts/bootstrap.sh` leaves behind.
- `bootstrap.sh` moves clean submodules back to their default branch: check the
  feature branch out again afterwards, and never commit on the default branch.
- Parallel work in one repo: `git worktree` inside the submodule, not a new clone.
- Addresses come from the hub registry (`PYTHONPATH=tools .venv/bin/python -m
  onchain find <query>`); cite the command in notes instead of copying addresses.
- `create-issue` breaks for `sodax-sdks` (now `gosodax/sodax-sdks`): it creates the
  issue, then fails setting the type because it reads types from `icon-project`.
  Never re-run the create. Set the type from `gosodax`'s `issueTypes` by name and
  the parent with `addSubIssue`. sdks issues live on the `gosodax` board #1, not
  New World #12, so don't add them there.

## How to use this memory

Orient before searching deeply (paths below are relative to `sodax-ai-work-context/`):

1. Read `INDEX.md` (the repo map + search recipes).
2. For what a repo is and how to build it, read the hub card
   `sodax-command-center/docs/repos/<name>.md`. `projects/<repo>/README.md` only
   holds my notes on top of it.
3. If there's a GitHub issue, open `projects/<repo>/issues/gh-<number>-*/` and
   read **`brief.md`** — state, blockers, next action, and a map of which file
   answers which question. This is how you resume a task after pulling context.
   **Then open one file from that map**, not the folder: `issue.md` (source),
   `plan.md` (intent), `process.md` / `process/` (history), `outcome.md` (result).
4. Find related context by searching the frontmatter on issue / knowledge /
   decision files:

   ```bash
   rg "^github: <number>"     # everything about one issue
   rg "^tags:.*<keyword>"     # by topic
   rg "^type: knowledge"      # all distilled knowledge
   rg "^status: Active"       # work in progress
   ```

### Reading rules — load the minimum, then drill

This repo is written to be read selectively. Whole dossiers run past 70k tokens;
the `gh-1024` one is ~295 KB across 15 files. Reading it all is not thoroughness,
it is just expensive, and it buries the part that mattered.

- **Start at `brief.md`.** It is the router. Open the one file its map points at.
- **Before opening anything over ~10 KB**, get the shape first:
  `rg -n "^## " <file>` — then `Read` with `offset`/`limit` on the section you
  need. Do not read a whole `plan-*.md` to answer one question.
- **Never read a `process/` folder end to end.** `process.md` is a session index;
  open the one session that matters.
- **Prefer `rg` over reading.** A frontmatter search across all 194 files costs
  less than one large file.
- **Delegate the wide reads.** If a question genuinely needs several big files,
  send a subagent and keep the conclusion, not the file dumps.
- Cost of a file, when you need to decide: `wc -c` ÷ 3800 ≈ tokens.

Work is tracked per GitHub issue (or ad-hoc `task-*`) as a folder under
`projects/<repo>/issues/`. Scaffold one with `scripts/new-issue.sh` (see
`projects/README.md`).

While working:

- Append discoveries, dead-ends, and debug notes to `process.md`; keep intent in
  `plan.md` and the final result in `outcome.md`. Bump `updated:` when you edit.
- **Update `brief.md` in the same edit** whenever state, blockers, the next
  action, or the set of files changes. A stale router is worse than no router.
- Split when a file gets fat: `process.md` at ~20 KB into `process/`, `plan.md`
  when a section outgrows a skim into `plan-<topic>.md`. See `projects/README.md`
  §"Keep a folder cheap to load".

Where things go:

- Issue-scoped plan → the issue's `plan.md`. A cross-repo feature → the hub's
  *Cross-repo feature* issue, dossier under `projects/sodax-command-center/issues/`.
  Top-level `plans/` is for my own cross-repo plans with no hub issue (triage,
  trackers).
- Repo-scoped decision → `projects/<repo>/decisions/`; cross-cutting → top-level
  `decisions/`.
- Reusable synthesized knowledge → top-level `knowledge/` (see its `README.md`).
- Link related items by id in frontmatter (`related_issues`, `related_decisions`)
  so `rg` can traverse both ways.
- **Code changes go in the actual `icon-project` repo. Plans / decisions / notes
  go ONLY in this context repo.** Never commit personal notes into an
  `icon-project` repo. One exception, because the hub asks for it: a
  non-obvious fact about a repo that helps the whole team (a gotcha, a build
  quirk) goes into that repo's hub card through a hub PR.

## Sync (2 machines)

- This context repo syncs via git: `github.com/0x0603/sodax-ai-work-context`.
- **Session start:** `git pull` in `sodax-ai-work-context` — enforced
  automatically per machine by a SessionStart hook (`sync-ai-context.sh`).
- **Session end:** `git status`, then `git commit` + `git push` in
  `sodax-ai-work-context`.
- New machine: `git clone` the repo, then run `./bootstrap.sh` once to create the
  workspace-root symlinks, then `scripts/setup-hub.sh` to clone and configure the
  hub (skips repos you can't read, hides submodule pointer changes, commit
  signing, `.venv`, shared Claude memory). Re-run it after being granted access
  to more repos. Then `scripts/setup-team-ui.sh` for the agent-team console
  (`github.com/0x0603/claude-team-ui` in `~/code/claude-team-ui`, nvm + pinned
  Node versions, projects from `team-ui/projects.json`).
- Console projects and settings sync through `team-ui/projects.json` (paths
  relative to the workspace). After changing them in the console, run
  `scripts/setup-team-ui.sh --export` and commit; the other machine re-runs
  `scripts/setup-team-ui.sh`. Its login token stays per machine.
- Personal skills live in `.claude/skills/`; `bootstrap.sh` links each into
  `~/.claude/skills`, so a new skill needs one bootstrap run per machine after `git pull`.
- Not synced, per machine: the hub clone and its local git config, Claude Code's
  memory (`~/.claude/projects/*/memory`), and the signing key file.
- The `sodax/AGENTS.md` and `sodax/CLAUDE.md` symlinks live outside any repo, so
  they are not synced. If they break or change, run the `/sodax-relink` skill (or
  `./bootstrap.sh`) to recreate them.

## Conventions

- All committed artifacts (docs, comments, commit messages) in **English**.
- Filenames `kebab-case`. ADRs numbered `NNNN-title.md`.
- Commit messages: no AI/Codex/Claude attribution trailers.
