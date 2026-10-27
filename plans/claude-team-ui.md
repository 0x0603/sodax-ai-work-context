---
type: plan
status: Active
updated: 2026-10-27
related_issues: []
related_decisions: []
tags: [claude-team-ui, agent-teams, tooling, phone, security, cross-repo]
---

# Claude Team UI — my agent-team console for sodax

`github.com/0x0603/claude-team-ui` (private), checked out at `~/code/claude-team-ui`. A browser console, phone
first, that runs Claude Code agent teams on the sodax repos: one cartridge per issue (worktree + branch + tmux
session), a quick or full flow with my approval gates, plan usage (5h/7d) and cost per cartridge, Open PR.
How to use: its `README.md`. Decisions and API: `docs/design.md`. Facts checked on Claude Code 2.1.311: `docs/verify.md`.

Setup on a machine: `scripts/setup-team-ui.sh` (this repo) clones or updates it, installs nvm and pinned Node
(sodax-sdks needs Node 24 for its pre-commit hook), and imports `team-ui/projects.json`. After changing projects in
the console: `scripts/setup-team-ui.sh --export`, then commit here.

## Goal

Control the teams from my phone, also away from home, without a leaked link giving anyone control.

## Done (2026-10-27)

- v1.0 pushed (`b47dc58`, README images `114e73b`). 9 sodax repos registered; sodax-sdks pinned to Node 24.
- Checked on real Claude: planning lock for lead and teammates, plan usage, agent messages, cost, clean stop,
  Node 24 inside agent shells, and a full quick flow (plan → build with 2 commits → review READY TO MERGE).

## Next

1. **Commit + push** (not done yet):
   - `claude-team-ui`: Quick / Standard / Full flows (each checks logic, security, tests, docs, skills; Standard and
     Full have Simplify), fix loop back to Build, `bin/team-ui-config.js`, docs.
   - this repo: `scripts/setup-team-ui.sh`, `scripts/README.md`, `team-ui/projects.json`, the sync bullet in
     `AGENTS.md`, this file. Leave other sessions' uncommitted files alone.
2. **Other machine** (the one that will run the console): ask Claude there to run `scripts/setup-team-ui.sh`.
   By hand: `gh auth login` if needed, copy `~/.ssh/id_ed25519_sodax_signing` (secret), install Tailscale
   (`brew install --cask tailscale-app` asks for the admin password, or the App Store app), log in, allow the VPN.
   Phone: Tailscale app with the same account; ntfy app if I want "needs you" pushes.
3. **Phone control, secure** (build on the machine with Tailscale, so it can be tested for real):
   - `--tailscale`: listen only on the Tailscale address, and allow only devices logged in as my Tailscale user
     (`tailscale whois <peer ip>` on each connection). A leaked link is then useless outside my tailnet.
   - One-time login links that expire after 10 minutes; the typed token still works as a fallback (keep it in a
     password manager). Sliding 30-day cookie, a device list, "Sign out all devices", ntfy alert on a new login.
   - LaunchAgent so the console starts when the Mac boots (today it only runs after `./start.sh`).
   - Optional: HTTPS through `tailscale serve`.
4. **First real run**: a small sodax-sdks issue with the quick flow, then a medium one with the standard flow, then a big one with full. Tune the
   prompts per repo with "Edit this project's template". The full flow's 5-agent planning has not run for real yet.
5. Later: Retro copies spec / plan / review / retro into `projects/<repo>/issues/gh-<n>-*/` here.

## Decisions

- 2026-10-27: three flows by task size; every flow builds and reviews logic, security, tests, docs and skills
  (`prompts/_checks.md`, editable per project). Standard keeps a Simplify step.

## Open decisions

- Bilingual UI (EN/VI toggle, Vietnamese strings in one dictionary file): an exception to the English-only rule
  for committed files. Not decided.
- `origin` of the sodax-sdks submodule still points at `icon-project/sodax-sdks` (moved to `gosodax`). GitHub
  redirects should keep push and PR working; untested. Switch the remote if it fails.
