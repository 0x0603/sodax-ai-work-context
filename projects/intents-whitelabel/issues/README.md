# intents-whitelabel — issues

One folder per GitHub issue or ad-hoc task:

- `gh-<number>-<kebab-title>/` — a GitHub issue
- `task-<kebab-title>/` — issue-less work (spike, refactor)

Each holds `issue.md` (source), `plan.md` (intent), `process.md` (history),
`outcome.md` (result), and optional `artifacts/`.

Scaffold one (from the context-repo root):

```bash
scripts/new-issue.sh intents-whitelabel <issue-number> <kebab title...>
scripts/new-issue.sh intents-whitelabel task <kebab title...>
```

Find active work: `rg "status: Active" .`
