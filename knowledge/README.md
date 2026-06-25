# Knowledge

Synthesized, reusable knowledge that outlives any single issue — how a subsystem
works, recurring gotchas, conventions, "how to do X in sodax".

Distinct from `research/` (exploratory spikes) and an issue's `process.md` (notes
tied to one task). When a lesson is worth keeping long-term, lift it here.

## Areas

| Area | Path | Holds |
| ---- | ---- | ----- |
| Domain | `domain/` | Concepts, intent flows, product behavior |
| Architecture | `architecture/` | How systems are structured |
| Engineering | `engineering/` | Implementation know-how (frontend, sdk, debugging) |
| Operations | `operations/` | Deploy, env, runbooks |
| External | `external/` | Third-party / upstream notes |

Create subareas on demand (e.g. `engineering/frontend/`); don't pre-create empty
folders.

## File format

One file per topic, `kebab-title.md`, starting with frontmatter (template:
`scripts/templates/knowledge.md`):

```yaml
---
type: knowledge
area: engineering
status: Draft        # Draft | Stable
tags: [wallet, state]
updated: 2026-06-25
related_issues: [gh-1234]
related_decisions: [0001-wallet-state-ownership]
---
```

The source of truth for discovery is search, not the per-folder index tables:
`rg "type: knowledge"`, `rg "tags: .*<keyword>"`.
