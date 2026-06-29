#!/usr/bin/env bash
# SessionStart hook: fast-forward the sodax-ai-work-context repo to latest main.
# Always exits 0 so it can never block a session. Resolves the repo path from the
# bootstrap-installed sodax-relink skill symlink, so it works on any machine.

link="$HOME/.claude/skills/sodax-relink"
if [ ! -L "$link" ]; then
  echo "ai-context sync: skipped (sodax-relink symlink missing — run bootstrap.sh)"
  exit 0
fi

target="$(readlink "$link")"                                   # <repo>/.claude/skills/sodax-relink
repo="$(cd "$(dirname "$target")/../.." 2>/dev/null && pwd -P)"
if [ -z "$repo" ] || [ ! -d "$repo/.git" ]; then
  echo "ai-context sync: skipped (repo not found)"
  exit 0
fi

if out="$(git -C "$repo" pull --ff-only 2>&1)"; then
  echo "ai-context sync: ${out##*$'\n'}"
else
  echo "ai-context sync: skipped (offline / diverged / dirty tree) — pull manually if needed"
fi
exit 0
