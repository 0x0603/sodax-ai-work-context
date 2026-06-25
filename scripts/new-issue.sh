#!/usr/bin/env bash
# Scaffold an issue/task work folder under projects/<repo>/issues/ from the
# shared templates. Plain shell so it works for both Claude Code and Codex.
#
# Usage:
#   scripts/new-issue.sh <repo> <issue-number> <kebab title...>
#   scripts/new-issue.sh <repo> task <kebab title...>
#
# Examples:
#   scripts/new-issue.sh sodax-frontend 1234 wallet connect flow
#   scripts/new-issue.sh sodax-sdks task refactor signing util
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
TPL_DIR="$SCRIPT_DIR/templates/issue"
GH_ORG="icon-project"

usage() {
  echo "Usage: $0 <repo> <issue-number|task> <kebab title...>" >&2
  exit 1
}

[ "$#" -ge 3 ] || usage
repo="$1"; ref="$2"; shift 2

# Build a kebab slug from the remaining args (lowercase, non-alnum -> single dash).
slug="$(printf '%s' "$*" \
  | tr '[:upper:] ' '[:lower:]-' \
  | tr -cs 'a-z0-9-' '-' \
  | sed 's/^-*//; s/-*$//')"
[ -n "$slug" ] || usage

projects_dir="$REPO_ROOT/projects/$repo"
[ -d "$projects_dir" ] || { echo "Unknown repo: $repo (no $projects_dir)" >&2; exit 1; }
[ -d "$TPL_DIR" ] || { echo "Missing templates dir: $TPL_DIR" >&2; exit 1; }

# Display title: kebab -> Title Case.
title="$(printf '%s' "$slug" | tr '-' ' ' \
  | awk '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1')"

if [ "$ref" = "task" ]; then
  folder="task-$slug"
  github=""
  source="(no GitHub issue)"
  heading="$title"
elif printf '%s' "$ref" | grep -Eq '^[0-9]+$'; then
  folder="gh-$ref-$slug"
  github="$ref"
  source="https://github.com/$GH_ORG/$repo/issues/$ref"
  heading="GH-$ref $title"
else
  usage
fi

dest="$projects_dir/issues/$folder"
[ -e "$dest" ] && { echo "Already exists: $dest" >&2; exit 1; }

today="$(date +%Y-%m-%d)"
mkdir -p "$dest"

# All four files carry frontmatter; substitute the metadata into each.
for f in issue plan process outcome; do
  sed -e "s|__HEADING__|$heading|g" \
      -e "s|__SOURCE__|$source|g" \
      -e "s|__REPO__|$repo|g" \
      -e "s|__GITHUB__|$github|g" \
      -e "s|__DATE__|$today|g" \
      "$TPL_DIR/$f.md" > "$dest/$f.md"
done

echo "Created $dest"
ls -1 "$dest"
