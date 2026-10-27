#!/usr/bin/env bash
# Set up Claude Team UI (the agent-team console) on this machine and load the shared
# project list. Run after ./bootstrap.sh and scripts/setup-hub.sh; safe to re-run.
#
#   scripts/setup-team-ui.sh            install or update, then import team-ui/projects.json
#   scripts/setup-team-ui.sh --export   save this machine's projects, settings and project prompts to team-ui/
#
# Steps:
#   1. clone github.com/0x0603/claude-team-ui into $TEAM_UI_DIR (default ~/code/claude-team-ui), or pull it
#   2. sign its commits with $SODAX_SIGNING_KEY, if that key exists
#   3. install tmux if missing (Homebrew)
#   4. install nvm and every Node version the manifest pins; shells keep their default Node
#   5. import team-ui/projects.json (paths relative to the workspace) into ~/.config/claude-team-ui, and copy
#      team-ui/prompts/<project>/ (rules, checks) into each project's .claude/team-ui/prompts (git-excluded there)
# The console's login token and plan usage stay per machine.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
WORKSPACE_DIR="$(cd "$REPO_DIR/.." && pwd -P)"
MANIFEST="$REPO_DIR/team-ui/projects.json"
TEAM_UI_DIR="${TEAM_UI_DIR:-$HOME/code/claude-team-ui}"
SIGNING_KEY="${SODAX_SIGNING_KEY:-$HOME/.ssh/id_ed25519_sodax_signing.pub}"
NVM_VERSION="v0.40.3"

command -v node >/dev/null || { echo "node is required (brew install node)" >&2; exit 1; }

if [[ "${1:-}" == "--export" ]]; then
  node "$TEAM_UI_DIR/bin/team-ui-config.js" export "$MANIFEST" --root "$WORKSPACE_DIR"
  echo "Commit team-ui/ (projects.json and prompts/) in $(basename "$REPO_DIR") to share it."
  exit 0
fi

# 1) Clone or update.
if [[ -d "$TEAM_UI_DIR/.git" ]]; then
  git -C "$TEAM_UI_DIR" pull --ff-only --quiet || echo "note  could not fast-forward $TEAM_UI_DIR; left as is"
else
  mkdir -p "$(dirname "$TEAM_UI_DIR")"
  gh repo clone 0x0603/claude-team-ui "$TEAM_UI_DIR"
fi

# 2) Commit signing, like the hub submodules.
if [[ -f "$SIGNING_KEY" ]]; then
  git -C "$TEAM_UI_DIR" config --local user.signingkey "$SIGNING_KEY"
  git -C "$TEAM_UI_DIR" config --local gpg.format ssh
  git -C "$TEAM_UI_DIR" config --local commit.gpgsign true
fi

# 3) tmux.
if ! command -v tmux >/dev/null; then
  if command -v brew >/dev/null; then brew install tmux; else echo "note  tmux is missing; install it" >&2; fi
fi

# 4) nvm and the Node versions projects pin (sodax-sdks needs 24 for its pre-commit hook).
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  git clone --quiet --depth 1 --branch "$NVM_VERSION" https://github.com/nvm-sh/nvm.git "$NVM_DIR"
fi
had_default=0
[[ -e "$NVM_DIR/alias/default" ]] && had_default=1
versions="$(node -e 'const m = require(process.argv[1]); console.log([...new Set((m.projects || []).map(p => p.node).filter(Boolean))].join(" "))' "$MANIFEST")"
set +eu  # nvm.sh is not strict-mode safe
. "$NVM_DIR/nvm.sh"
for v in $versions; do
  if ! nvm ls "$v" >/dev/null 2>&1; then nvm install "$v" >/dev/null && echo "ok    Node $v installed"; fi
  nvm exec "$v" corepack enable >/dev/null 2>&1   # pnpm then follows whichever Node is on PATH
done
# nvm makes its first install the default; keep the machine's own Node unless a default existed before
[[ $had_default == 1 ]] || nvm unalias default >/dev/null 2>&1
set -eu

# 5) Projects, Node pins, test commands, teammate models.
node "$TEAM_UI_DIR/bin/team-ui-config.js" import "$MANIFEST" --root "$WORKSPACE_DIR"

echo "Claude Team UI ready: cd $TEAM_UI_DIR && ./start.sh --lan"
