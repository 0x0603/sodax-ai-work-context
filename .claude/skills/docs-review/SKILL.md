---
name: docs-review
description: Review the docs a sodax-sdks PR or diff adds or changes (packages/sdk/docs, docs/ site pages, package READMEs, packages/skills, .claude/skills, AGENTS.md, changesets) against the team's doc rules, and find the docs the change made false or left incomplete. Use for "review the docs", "are the docs/skills enough", or the docs pass of a PR review.
---

# Docs review (sodax-sdks)

## The rules

From the team (2026-10), for everyone adding docs to sodax-sdks:

1. **No hand-written code in docs.** It drifts fastest. Put the code in a properly located `.ts`
   test so CI runs it, and reference it from the page: the claim gets tested and cannot drift.
2. **Don't restate.** Repeating the SDK docs (core md files, ADRs) or what the code, its types and
   comments already say only grows the context agents load. A doc (or ADR) holds what code cannot
   carry: why, trade-offs, invariants across repos, how the pieces fit.
3. **Anything that can drift will drift.** Every doc needs a way to stay true: a test, a gate, a
   generated copy, a live config placeholder, or a link to the source instead of a copy.

The repo's own rules come first; read them instead of re-deriving: root `AGENTS.md` (Working
Rules, AI File Maintenance), `docs/AGENTS.md` (site), `packages/skills/AGENTS.md` (partner
skills). Gate mechanics are in `.claude/skills/review-core-sdk/SKILL.md`.

## Setup

- Review the PR head: `gh pr view <n> --json headRefOid`, check that SHA out in a worktree. Hub
  submodules are shallow, so check ancestry with `gh api repos/<o>/<r>/compare/<a>...<b>`.
- Doc files: `gh api repos/<o>/<r>/pulls/<n>/files --paginate -q '.[].filename'`, keep `*.md`,
  `*.mdx`, `packages/skills/**`, `.claude/skills/**`, `.changeset/**`.

## Pass 1: every changed hunk

1. **True at the head?** Name the `file:line` that proves it. A claim about a backend, relay,
   contract or wallet that is not checked out is an open question, not a finding.
2. **Code?** A fenced block is a finding unless a gate compiles it. Only skill snippets of the
   packages listed in `packages/skills/scripts/check-ai-snippets.sh` and the `.tsx` files under
   `examples/` are typechecked; `check-ai-imports` checks import lines only. Fix: move it to a test
   beside the feature and link it as `https://github.com/gosodax/sodax-sdks/blob/main/<path>`.
3. **Restates?** Compare with the JSDoc or type it describes, and `rg` its key term across
   `packages/sdk/docs`, `packages/skills` and the READMEs. Fix: cut it, link the one source.
4. **What fails when it goes stale?** Lists of chains, tokens, providers or slots, counts,
   current-state words ("not yet", "only", "all", "automatically"), signatures, URLs. No check and
   no pointer to the source of truth (`ChainKeys`, `ChainTypeArr`, exports, `data-sodax-config`,
   the hub's `onchain` registry) is a finding.

## Pass 2: what the change made false or left out

Docs drift mostly where the diff does not touch.

- For each new value of an enum-like set (chain type, chain key, provider, connector, config
  slot), `rg` the docs for a sibling value. A list naming the siblings but not the new one is now
  incomplete; a count or an "every other X" rule beside it may now be false.
- `rg` the old wording of whatever the change reverses ("not yet", "not reachable", "no entry in")
  across `docs/`, `packages/*/README.md`, `packages/sdk/docs/`, `packages/skills/`, `.claude/skills/`.
- A new feature or chain family is introduced in `.claude/skills/` (e.g. `add-chain`) plus
  `packages/sdk/docs/`; `packages/skills` follows for partners. Check each holds only what code
  cannot say.
- Changesets ship as release notes: check every "all", "automatically" and "X uses Y" list.

## Gates: green is not proof

- Docs Drift passing proves some mapped doc changed, not a related one: any mapped
  `packages/sdk/docs` page counts for every package. Read what the edit says.
- The AI drift check is advisory and can pass without auditing: read its annotations
  (`gh api repos/<o>/<r>/check-runs/<id>/annotations`).
- Run what the change touches: `pnpm check:docs-pages`, `check:doc-links`, `check:docs-nav`,
  `check:ai` (skills), `check:ai-dev-files` (AGENTS.md, `.claude/skills`), `docs:validate` (site).
  A PR conflicting with main on a mapped doc must re-run `pnpm docs:sync-pages` after merging.

## Report

- Ranked: false after the change, then lists that claim to be complete but are not, then
  restated content, then unchecked code and claims. Each: `file:line`, rule, cheapest fix
  (delete, link, move to a test, add a check), one or two lines.
- Keep what the PR introduced apart from what it inherited; inherited drift is a follow-up.
- Open questions last. Report to the user; post on a PR only when asked. sodax-sdks is public:
  no internal hosts, registry details or AuditMap findings in PR text.
