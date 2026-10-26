#!/usr/bin/env bash
# Set up the sodax-command-center hub next to this repo, with the machine-local
# tweaks the hub's own bootstrap doesn't cover. Run after ./bootstrap.sh on every
# machine; safe to re-run (also picks up repos you were granted access to later).
#
#   scripts/setup-hub.sh
#
# Steps:
#   1. clone the hub if missing
#   2. skip submodules this GitHub account can't read (else the hub bootstrap aborts)
#   3. run the hub's scripts/bootstrap.sh (every readable repo on its branch tip)
#   4. hide submodule pointer changes from the hub's git status (we never commit them)
#   5. sign commits in every submodule with $SODAX_SIGNING_KEY, if that key exists
#   6. create the hub's .venv for its Python tooling (needs python >= 3.11)
#   7. share this machine's Claude memory for the workspace with the hub
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd -P)"
HUB_DIR="$WORKSPACE_DIR/sodax-command-center"
HUB_URL="https://github.com/icon-project/sodax-command-center.git"
SIGNING_KEY="${SODAX_SIGNING_KEY:-$HOME/.ssh/id_ed25519_sodax_signing.pub}"

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
gh auth setup-git

# 1) Clone.
if [[ ! -d "$HUB_DIR/.git" ]]; then
  git clone "$HUB_URL" "$HUB_DIR"
fi
cd "$HUB_DIR"
git submodule sync --quiet

# 2) Skip unreadable submodules via local config only.
while read -r key url; do
  name="${key#submodule.}"; name="${name%.url}"
  slug="${url#https://github.com/}"; slug="${slug%.git}"
  if gh api "repos/$slug" --silent 2>/dev/null; then
    git config --unset "submodule.$name.update" || true
  else
    git config "submodule.$name.update" none
    echo "skip  $name (no read access to $slug)"
  fi
done < <(git config -f .gitmodules --get-regexp '\.url$')

# 3) Hub bootstrap.
scripts/bootstrap.sh

# 4) + 5) Per-submodule local config.
while read -r key path; do
  name="${key#submodule.}"; name="${name%.path}"
  git config "submodule.$name.ignore" all
  if [[ -f "$SIGNING_KEY" && -e "$path/.git" ]]; then
    git -C "$path" config --local user.signingkey "$SIGNING_KEY"
    git -C "$path" config --local gpg.format ssh
    git -C "$path" config --local commit.gpgsign true
  fi
done < <(git config -f .gitmodules --get-regexp '\.path$')
[[ -f "$SIGNING_KEY" ]] || echo "note  $SIGNING_KEY not found; commits use the global git signing config"

# 6) Python tooling.
if [[ ! -x .venv/bin/python ]]; then
  py=""
  for c in python3.13 python3.12 python3.11; do
    if command -v "$c" >/dev/null; then py="$c"; break; fi
  done
  if [[ -n "$py" ]]; then
    "$py" -m venv .venv
    .venv/bin/pip install -q pyyaml pytest ruff
  else
    echo "note  no python >= 3.11 found; skipped .venv (brew install python@3.12)"
  fi
fi

# 7) Claude Code keys project dirs by path with non-alphanumerics replaced by '-'.
projects="$HOME/.claude/projects"
ws_mem="$projects/$(printf '%s' "$WORKSPACE_DIR" | sed 's/[^A-Za-z0-9]/-/g')/memory"
hub_proj="$projects/$(printf '%s' "$HUB_DIR" | sed 's/[^A-Za-z0-9]/-/g')"
if [[ -d "$ws_mem" && ! -e "$hub_proj/memory" ]]; then
  mkdir -p "$hub_proj"
  ln -s "$ws_mem" "$hub_proj/memory"
  echo "ok    hub shares Claude memory with $ws_mem"
fi

echo "Hub ready: $HUB_DIR (start Claude Code at its root)"
