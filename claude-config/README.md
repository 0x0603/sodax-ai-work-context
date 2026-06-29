# claude-config — personal global Claude Code config (synced)

**Global, machine-level** Claude Code settings (not sodax-specific) kept identical
across machines. `bootstrap.sh` installs them into `~/.claude`, so a new machine
only needs `git clone` + `./bootstrap.sh`.

| File | Installed to | How |
| ---- | ------------ | --- |
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | symlink (any existing file is backed up to `*.local-backup`) |
| `hooks/sync-ai-context.sh` | `~/.claude/hooks/sync-ai-context.sh` | symlink |
| `settings.fragment.json` | `~/.claude/settings.json` | jq-merged (`attribution` + `permissions` + `hooks` only; all other settings preserved) |

The settings fragment carries only the keys managed globally here:

- `attribution` — empty, so commits/PRs carry no Claude attribution.
- `permissions.allow` — `git add` / `commit` / `push` run without a permission
  prompt, so an explicit "push" just pushes. Not pushing autonomously is a
  behavioral rule (see `CLAUDE.md`), no longer a hard gate.
- `hooks.PreToolUse` — blocks any `git commit` containing Claude attribution
  (attribution only; it no longer asks for confirmation).
- `hooks.SessionStart` — pulls latest `main` of this repo on session start.

Notes:

- Requires `jq`. Re-running `bootstrap.sh` is idempotent.
- The fragment **replaces** the `PreToolUse` / `SessionStart` hook arrays on merge,
  so it is the single source of truth for those hooks. Edit them here, not in
  `~/.claude/settings.json` directly.
- This folder is global config that happens to live in this repo for convenient
  syncing; it is intentionally separate from the sodax work context.
