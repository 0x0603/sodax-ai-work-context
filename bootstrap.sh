#!/usr/bin/env bash
# Wire up the machine-local glue that lets Claude Code / Codex auto-load the
# shared Sodax workspace instructions and personal Claude config. Run once per
# machine after cloning; safe to re-run (idempotent). Also exposed as the
# `/sodax-relink` skill.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WORKSPACE_DIR="$(cd "$REPO_DIR/.." && pwd -P)"
REPO_NAME="$(basename "$REPO_DIR")"
WORKSPACE_TARGET="$REPO_NAME/AGENTS.md"
SKILL_DIR="$REPO_DIR/.claude/skills/sodax-relink"
CFG_DIR="$REPO_DIR/claude-config"

if [[ ! -f "$REPO_DIR/AGENTS.md" ]]; then
  echo "Missing AGENTS.md in $REPO_DIR" >&2
  exit 1
fi

if [[ ! -d "$SKILL_DIR" ]]; then
  echo "Missing skill directory: $SKILL_DIR" >&2
  exit 1
fi

# Link a target, refusing to clobber a real (non-symlink) file.
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

# Like link_one, but ADOPTS an existing real file: back it up once to
# <dest>.local-backup, then replace it with a symlink to the repo copy.
adopt_link() {
  local target="$1"
  local dest="$2"

  if [[ -L "$dest" ]]; then
    ln -sfn "$target" "$dest"
  elif [[ -e "$dest" ]]; then
    if [[ ! -e "$dest.local-backup" ]]; then
      mv "$dest" "$dest.local-backup"
      echo "  backed up $dest -> $dest.local-backup"
    else
      rm -f "$dest"
    fi
    ln -sfn "$target" "$dest"
  else
    ln -sfn "$target" "$dest"
  fi
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

# 4) Personal global Claude config (claude-config/) -> ~/.claude.
#    Adopts existing real files (one-time backup), making the repo the single
#    source of truth synced across machines.
if [[ -d "$CFG_DIR" ]]; then
  mkdir -p "$HOME/.claude/hooks"
  adopt_link "$CFG_DIR/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
  for h in "$CFG_DIR"/hooks/*.sh; do
    [[ -e "$h" ]] || continue
    adopt_link "$h" "$HOME/.claude/hooks/$(basename "$h")"
  done

  # Merge attribution + hooks into ~/.claude/settings.json, preserving every
  # other (machine-specific) setting. Requires jq.
  SETTINGS="$HOME/.claude/settings.json"
  FRAGMENT="$CFG_DIR/settings.fragment.json"
  if [[ -f "$FRAGMENT" ]] && command -v jq >/dev/null 2>&1; then
    if [[ -f "$SETTINGS" ]]; then
      tmp="$(mktemp)"
      if jq -s '.[0] * .[1]' "$SETTINGS" "$FRAGMENT" >"$tmp" 2>/dev/null && jq -e . "$tmp" >/dev/null 2>&1; then
        mv "$tmp" "$SETTINGS"
        echo "  merged attribution + hooks into $SETTINGS"
      else
        rm -f "$tmp"
        echo "  WARN: could not merge settings fragment; left $SETTINGS unchanged" >&2
      fi
    else
      mkdir -p "$(dirname "$SETTINGS")"
      cp "$FRAGMENT" "$SETTINGS"
      echo "  created $SETTINGS from fragment"
    fi
  fi
fi

echo "Linked:"
echo "  $REPO_DIR/CLAUDE.md -> AGENTS.md"
echo "  $WORKSPACE_DIR/AGENTS.md -> $WORKSPACE_TARGET"
echo "  $WORKSPACE_DIR/CLAUDE.md -> $WORKSPACE_TARGET"
echo "  $HOME/.claude/skills/sodax-relink -> $SKILL_DIR"
if [[ -d "$CFG_DIR" ]]; then
  echo "  $HOME/.claude/CLAUDE.md -> $CFG_DIR/CLAUDE.md"
  echo "  $HOME/.claude/hooks/*.sh -> $CFG_DIR/hooks/ (sync-ai-context, git-guard)"
fi
