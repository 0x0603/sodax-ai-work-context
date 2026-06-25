#!/usr/bin/env bash
# Wire up the machine-local symlinks that let Claude Code / Codex auto-load the
# shared Sodax workspace instructions. Run once per machine after cloning; safe
# to re-run (idempotent). Also exposed as the `/sodax-relink` skill.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WORKSPACE_DIR="$(cd "$REPO_DIR/.." && pwd -P)"
REPO_NAME="$(basename "$REPO_DIR")"
WORKSPACE_TARGET="$REPO_NAME/AGENTS.md"
SKILL_DIR="$REPO_DIR/.claude/skills/sodax-relink"

if [[ ! -f "$REPO_DIR/AGENTS.md" ]]; then
  echo "Missing AGENTS.md in $REPO_DIR" >&2
  exit 1
fi

if [[ ! -d "$SKILL_DIR" ]]; then
  echo "Missing skill directory: $SKILL_DIR" >&2
  exit 1
fi

link_one() {
  local target="$1"
  local dest="$2"

  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "Refusing to replace non-symlink: $dest" >&2
    echo "Move or remove it manually, then re-run this script." >&2
    exit 1
  fi

  ln -sfn "$target" "$dest"
}

# 1) Repo-internal CLAUDE.md -> AGENTS.md (also tracked in git; ensure it exists).
link_one AGENTS.md "$REPO_DIR/CLAUDE.md"

# 2) Workspace-root AGENTS.md / CLAUDE.md -> the repo's canonical AGENTS.md.
#    Relative targets so they survive the workspace living at any absolute path.
link_one "$WORKSPACE_TARGET" "$WORKSPACE_DIR/AGENTS.md"
link_one "$WORKSPACE_TARGET" "$WORKSPACE_DIR/CLAUDE.md"

# 3) Install the re-link skill globally so `/sodax-relink` works in any project.
mkdir -p "$HOME/.claude/skills"
link_one "$SKILL_DIR" "$HOME/.claude/skills/sodax-relink"

echo "Linked:"
echo "  $REPO_DIR/CLAUDE.md -> AGENTS.md"
echo "  $WORKSPACE_DIR/AGENTS.md -> $WORKSPACE_TARGET"
echo "  $WORKSPACE_DIR/CLAUDE.md -> $WORKSPACE_TARGET"
echo "  $HOME/.claude/skills/sodax-relink -> $SKILL_DIR"
