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
