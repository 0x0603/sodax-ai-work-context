# Project Context

Repo-scoped context. Directory names match the real workspace repo folders so
agents navigate by convention:

| Context path | Workspace repo |
| ------------ | -------------- |
| `projects/sodax-backend/` | `sodax-backend/` |
| `projects/sodax-frontend/` | `sodax-frontend/` |
| `projects/sodax-sdks/` | `sodax-sdks/` |
| `projects/intents-whitelabel/` | `intents-whitelabel/` |

## Per-repo layout

```
projects/<repo>/
├── README.md            # repo overview
├── issues/              # one folder per GitHub issue or ad-hoc task
│   └── gh-1234-wallet-connect-flow/
│       ├── issue.md     # source issue: link, problem, context, acceptance
│       ├── plan.md      # intent: goal, approach, steps, verification, risks
│       ├── process.md   # history: log, findings, changes during work
│       ├── outcome.md   # result: PR, commits, tests, follow-ups
│       └── artifacts/   # optional: screenshots, logs, samples
└── decisions/           # repo-scoped ADRs (NNNN-title.md)
```

## Conventions

- Every GitHub issue is a folder `gh-<number>-<kebab-title>/`. Issue-less work
  (spike, refactor) is `task-<kebab-title>/`. Same four files either way.
- `issue.md` is the entry point; the four files split the lifecycle: **issue =
  source, plan = intent, process = history, outcome = result.**
- Files may be terse — a stub beats nothing. Append to `process.md` as you work.
- `artifacts/` is created only when needed.

## Scaffold a folder (Claude Code or Codex)

Run from the context-repo root:

```bash
scripts/new-issue.sh <repo> <issue-number> <kebab title...>
scripts/new-issue.sh <repo> task <kebab title...>
```

## Where things live

- Issue-scoped plan → the issue's `plan.md`; cross-repo plan → top-level `plans/`.
- Repo-scoped decision → `projects/<repo>/decisions/`; cross-cutting → top-level
  `decisions/`.
- Reusable synthesized knowledge (not tied to one issue) → top-level `knowledge/`.
