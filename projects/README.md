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
│       ├── brief.md     # entry point: state, blockers, next action, file map
│       ├── issue.md     # source issue: link, problem, context, acceptance
│       ├── plan.md      # intent: goal, approach, steps, verification, risks
│       ├── process.md   # history: log, findings, changes during work
│       ├── process/     # optional: one file per session, once process.md >20 KB
│       ├── outcome.md   # result: PR, commits, tests, follow-ups
│       └── artifacts/   # optional: screenshots, logs, samples
└── decisions/           # repo-scoped ADRs (NNNN-title.md)
```

## Conventions

- Every GitHub issue is a folder `gh-<number>-<kebab-title>/`. Issue-less work
  (spike, refactor) is `task-<kebab-title>/`. Same five files either way.
- **`brief.md` is the entry point**; the other four split the lifecycle: **issue =
  source, plan = intent, process = history, outcome = result.**
- Files may be terse — a stub beats nothing. Append to `process.md` as you work.
- `artifacts/` is created only when needed.

## Keep a folder cheap to load

A dossier that costs 78k tokens to read is a dossier nobody reads correctly.
Three rules, in order of payoff:

1. **`brief.md` stays under ~80 lines and stays current.** It is a router, not a
   summary. Every time a plan file is added, split, or superseded, its row in the
   brief's file map changes in the same edit. A stale router is worse than none.
2. **Split `process.md` at ~20 KB** into `process/NN-YYYY-MM-DD-slug.md`, one file
   per session, each with the same frontmatter plus `session:`. `process.md` then
   holds a one-row-per-session table and nothing else. Append-only logs only grow;
   splitting late means rewriting more.
3. **Split `plan.md` when a section outgrows a skim** into
   `plan-<topic>.md` siblings, and leave an index section behind — the way
   `gh-1024-bound-auth-email-provider` does. Topic-per-file means an agent
   answering a security question never loads the durability file.

Reference layout: `projects/sodax-backend/issues/gh-1024-bound-auth-email-provider/`.

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
