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
| `sodax-backend/`           | icon-project   | TODO: describe                           |
| `sodax-frontend/`          | icon-project   | TODO: describe                           |
| `sodax-sdks/`              | icon-project   | TODO: describe                           |
| `intents-whitelabel/`      | icon-project   | TODO: describe                           |
| `sodax-ai-work-context/`   | 0x0603 (mine)  | **This repo** — private, synced AI memory |

The `icon-project/*` repos are upstream work repos. `sodax-ai-work-context` is a
**separate private repo** for my own AI work context (plans, decisions,
research). Keep the two worlds separate.

## How to use this memory

Orient before searching deeply:

1. Read `INDEX.md` (the repo map + search recipes).
2. Read `projects/<repo>/README.md` for the repo you're working on.
3. If there's a GitHub issue, open `projects/<repo>/issues/gh-<number>-*/` and
   read `issue.md` (goal), `plan.md` (intent), `process.md` (history),
   `outcome.md` (result) — this is how you resume a task after pulling context.
4. Find related context by searching the frontmatter on issue / knowledge /
   decision files:

   ```bash
   rg "^github: <number>"     # everything about one issue
   rg "^tags:.*<keyword>"     # by topic
   rg "^type: knowledge"      # all distilled knowledge
   rg "^status: Active"       # work in progress
   ```

Work is tracked per GitHub issue (or ad-hoc `task-*`) as a folder under
`projects/<repo>/issues/`. Scaffold one with `scripts/new-issue.sh` (see
`projects/README.md`).

While working:

- Append discoveries, dead-ends, and debug notes to `process.md`; keep intent in
  `plan.md` and the final result in `outcome.md`. Bump `updated:` when you edit.

Where things go:

- Issue-scoped plan → the issue's `plan.md`; cross-repo plan → top-level `plans/`.
- Repo-scoped decision → `projects/<repo>/decisions/`; cross-cutting → top-level
  `decisions/`.
- Reusable synthesized knowledge → top-level `knowledge/` (see its `README.md`).
- Link related items by id in frontmatter (`related_issues`, `related_decisions`)
  so `rg` can traverse both ways.
- **Code changes go in the actual `icon-project` repo. Plans / decisions / notes
  go ONLY in this context repo.** Never commit personal notes into an
  `icon-project` repo.

## Sync (2 machines)

- This context repo syncs via git: `github.com/0x0603/sodax-ai-work-context`.
- **Session start:** `git pull` in `sodax-ai-work-context` — enforced
  automatically per machine by a SessionStart hook (`sync-ai-context.sh`).
- **Session end:** `git status`, then `git commit` + `git push` in
  `sodax-ai-work-context`.
- New machine: `git clone` the repo, then run `./bootstrap.sh` once to create the
  workspace-root symlinks.
- The `sodax/AGENTS.md` and `sodax/CLAUDE.md` symlinks live outside any repo, so
  they are not synced. If they break or change, run the `/sodax-relink` skill (or
  `./bootstrap.sh`) to recreate them.

## Conventions

- All committed artifacts (docs, comments, commit messages) in **English**.
- Filenames `kebab-case`. ADRs numbered `NNNN-title.md`.
- Commit messages: no AI/Codex/Claude attribution trailers.
