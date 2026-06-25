---
name: Re-link Sodax workspace context
description: Re-create the machine-local AGENTS.md / CLAUDE.md symlinks at the sodax workspace root and re-install this skill, by running the sodax-ai-work-context bootstrap. For when the workspace-root links are missing, broken, or changed, or after cloning the context repo on a new machine.
disable-model-invocation: true
---

# Re-link Sodax workspace context

Re-runs the `sodax-ai-work-context` bootstrap to (re)create the machine-local
symlinks that let Claude Code and Codex auto-load the shared workspace
instructions:

- `sodax/AGENTS.md` → `sodax-ai-work-context/AGENTS.md`
- `sodax/CLAUDE.md` → `sodax-ai-work-context/AGENTS.md`
- repo-internal `CLAUDE.md` → `AGENTS.md`
- `~/.claude/skills/sodax-relink` → this skill

These root links live in the plain `sodax/` workspace folder (not a git repo), so
they are **not** synced by `git pull` — this skill is how you recreate them.

## Run

Locate `bootstrap.sh` (prefer this skill's own location; fall back to searching
up from the current directory), run it, then verify the root links resolve:

```bash
set -e
bs=""
if [ -n "${CLAUDE_SKILL_DIR:-}" ]; then
  cand="$(cd "$CLAUDE_SKILL_DIR" && pwd -P)/../../../bootstrap.sh"
  [ -f "$cand" ] && bs="$cand"
fi
if [ -z "$bs" ]; then
  d="$PWD"
  while [ "$d" != "/" ]; do
    if [ -f "$d/sodax-ai-work-context/bootstrap.sh" ]; then
      bs="$d/sodax-ai-work-context/bootstrap.sh"; break
    fi
    d="$(dirname "$d")"
  done
fi
[ -n "$bs" ] && [ -f "$bs" ] || {
  echo "bootstrap.sh not found — clone sodax-ai-work-context into the workspace folder first"
  exit 1
}

bash "$bs"

repo="$(cd "$(dirname "$bs")" && pwd -P)"
ws="$(cd "$repo/.." && pwd -P)"
echo "--- verify ---"
for f in AGENTS.md CLAUDE.md; do
  printf '%s -> %s\n' "$f" "$(readlink "$ws/$f" 2>/dev/null || echo MISSING)"
done
```

If anything reports `MISSING`, surface it to the user instead of reporting
success.
