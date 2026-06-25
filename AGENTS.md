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

Before working on repo `X`:

1. Read `sodax-ai-work-context/projects/<repo-folder>/` for current context,
   plans, and open decisions. Use the exact repo folder name, such as
   `projects/sodax-frontend/`.
2. Skim `sodax-ai-work-context/decisions/` for cross-cutting ADRs that apply.

While / after working:

- Record significant decisions as ADRs — cross-cutting ones in `decisions/`,
  repo-scoped ones in `projects/<repo-folder>/`.
- Save implementation plans in `plans/` (or `projects/<repo-folder>/` if scoped
  to one repo).
- **Code changes go in the actual `icon-project` repo. Plans / decisions / notes
  go ONLY in this context repo.** Never commit personal notes into an
  `icon-project` repo.

## Sync (2 machines)

- This context repo syncs via git: `github.com/0x0603/sodax-ai-work-context`.
- **Session start:** `git pull` in `sodax-ai-work-context`.
- **Session end:** `git status`, then `git commit` + `git push` in
  `sodax-ai-work-context`.
- New machine: `git clone` the repo, then run `./bootstrap.sh` once to create the
  workspace-root symlinks.
- The `/sodax/AGENTS.md` and `/sodax/CLAUDE.md` symlinks live outside any repo, so
  they are not synced. If they break or change, run the `/sodax-relink` skill (or
  `./bootstrap.sh`) to recreate them.

## Conventions

- All committed artifacts (docs, comments, commit messages) in **English**.
- Filenames `kebab-case`. ADRs numbered `NNNN-title.md`.
- Commit messages: no AI/Codex/Claude attribution trailers.
