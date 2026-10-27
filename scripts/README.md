# Scripts

Small helpers for maintaining this context repo.

## `new-issue.sh`

Scaffolds one issue/task workspace under `projects/<repo>/issues/` from the
templates in `scripts/templates/issue/`.

```bash
scripts/new-issue.sh <repo> <issue-number> <kebab title...>
scripts/new-issue.sh <repo> task <kebab title...>
```

Examples:

```bash
scripts/new-issue.sh sodax-frontend 1234 wallet connect flow
scripts/new-issue.sh sodax-sdks task refactor signing util
```

## `setup-hub.sh`

Clones and configures the `sodax-command-center` hub next to this repo. Run after
`./bootstrap.sh` on every machine; safe to re-run.

## `setup-team-ui.sh`

Installs or updates Claude Team UI (`github.com/0x0603/claude-team-ui`, the
agent-team console) in `~/code/claude-team-ui`, installs nvm and the Node versions
the projects pin, and imports `team-ui/projects.json` into
`~/.config/claude-team-ui`. Each project's own console prompts (rules, checks) in
`team-ui/prompts/<project>/` are copied into that project's `.claude/team-ui/prompts`,
which git excludes there. Run after `setup-hub.sh`; safe to re-run.

```bash
scripts/setup-team-ui.sh            # install or update, then import the shared project list
scripts/setup-team-ui.sh --export   # save this machine's console projects, settings and project prompts to team-ui/
```
