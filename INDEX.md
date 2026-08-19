# Context Index

The map of this repo. **Read this first**, then drill into the specific area.

## Start here

1. `projects/<repo>/README.md` for the repo you're working on.
2. If there's a GitHub issue: `projects/<repo>/issues/gh-<number>-*/**brief.md**`
   — state, blockers, next action, and a map of which file answers which
   question. **Read the brief, then open one file from its map.** Only fall back
   to `issue.md` if a folder predates the brief convention.
3. Search by frontmatter (recipes below) instead of guessing paths.

## Load only what you need

These files are written to be read selectively; several dossiers exceed 70k
tokens if read whole. See "Reading rules" in `AGENTS.md` — the short version:
brief first, `rg "^## "` before opening anything over 10 KB, `Read` with
`offset`/`limit`, and never read a `process/` folder end to end.

## Main areas

| Area | Path | Purpose |
| ---- | ---- | ------- |
| Project issues | `projects/*/issues/` | One folder per GitHub issue / task |
| Project decisions | `projects/*/decisions/` | Repo-scoped decisions |
| Cross-repo decisions | `decisions/` | Decisions spanning multiple repos |
| Knowledge | `knowledge/` | Reusable distilled knowledge |
| Plans | `plans/` | Cross-repo implementation plans |
| Research | `research/` | Temporary investigation notes |

## Knowledge map

Top-level buckets (subareas created on demand):

| Area | Path | Holds |
| ---- | ---- | ----- |
| Domain | `knowledge/domain/` | Concepts, intent flows, product behavior |
| Architecture | `knowledge/architecture/` | How systems are structured |
| Engineering | `knowledge/engineering/` | Implementation know-how (frontend, sdk, debugging) |
| Operations | `knowledge/operations/` | Deploy, env, runbooks |
| External | `knowledge/external/` | Third-party / upstream notes |

## Search recipes

Every issue, knowledge, and decision file carries YAML frontmatter:

```bash
rg "^status: Active"              # work in progress
rg "^status: Blocked"            # blocked work
rg "^github: 1234"               # everything about one issue
rg "^tags:.*wallet"              # by topic
rg "^type: knowledge"            # all distilled knowledge
rg "^type: decision"             # all decisions
rg "^related_issues:.*gh-1234"   # what links back to an issue
```

(The `^` anchor matches only frontmatter lines, not these example commands.)

## Conventions

- Naming: issues `gh-<number>-<kebab>/` or `task-<kebab>/`; decisions
  `NNNN-kebab.md`; knowledge `kebab.md` with a searchable keyword name.
- Link related items by **id** in frontmatter (`related_issues`,
  `related_decisions`) so search traverses both directions.
- Full conventions: `projects/README.md` (issues) and `knowledge/README.md`.
