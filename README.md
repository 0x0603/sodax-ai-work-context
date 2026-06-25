# sodax-ai-work-context

Private, git-synced **AI work context** for the Sodax project — plans, decisions,
and research I produce while working with AI agents (Claude Code, Codex). Synced
between my machines via this repo's GitHub remote.

This repo lives alongside the actual work repos inside a `sodax/` workspace
folder. The absolute path can differ by machine:

```
sodax/
├── sodax-backend/        (icon-project)
├── sodax-frontend/       (icon-project)
├── sodax-sdks/           (icon-project)
├── intents-whitelabel/   (icon-project)
└── sodax-ai-work-context/  ← this repo (the synced "AI brain")
```

## Layout

```
INDEX.md                     ← repo map and search recipes
AGENTS.md                    ← canonical agent instructions
CLAUDE.md                    ← symlink → AGENTS.md
bootstrap.sh                 ← run once per machine to link workspace instructions
.claude/skills/sodax-relink/ ← `/sodax-relink` skill: re-run bootstrap on demand
scripts/                     ← small helpers and templates
projects/sodax-backend/      ← backend repo context
projects/sodax-frontend/     ← frontend repo context
projects/sodax-sdks/         ← SDK repo context
projects/intents-whitelabel/ ← whitelabel repo context
knowledge/                   ← reusable distilled knowledge
decisions/                   ← cross-cutting ADRs
plans/                       ← cross-repo initiative plans
research/                    ← spikes, comparisons, exploration notes
```

## Setup on a new machine

```bash
cd ~/Documents/GitHub/sodax        # or wherever your workspace folder is
git clone https://github.com/0x0603/sodax-ai-work-context.git
./sodax-ai-work-context/bootstrap.sh
```

Then launch your agent from the workspace root and it auto-loads the shared
instructions:

```bash
cd ~/Documents/GitHub/sodax  # or your local workspace path
claude .                    # or: codex
```

`bootstrap.sh` also installs a `/sodax-relink` skill. The workspace-root
`sodax/AGENTS.md` and `sodax/CLAUDE.md` are machine-local symlinks. The
workspace folder is not a git repo, so they are not synced by `git pull`. If they
ever go missing, break, or get changed, run `/sodax-relink` (or `./bootstrap.sh`)
to recreate them.

## Daily flow

1. `git pull` here at the start of a session.
2. Work in the relevant `icon-project` repo; let the agent read/write context in
   this repo.
3. Record lasting plans, decisions, and notes in this repo.
4. `git status`, then `git commit` + `git push` here at the end of a session.
