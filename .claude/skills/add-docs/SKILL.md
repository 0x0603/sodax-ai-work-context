---
name: add-docs
description: Write or update docs in sodax-sdks (packages/sdk/docs, docs/ site pages, package READMEs, packages/skills, .claude/skills, changesets) under the team's doc rules - code lives in tests, nothing is restated, every claim has a check. Use when a feature, chain or behavior change needs docs, or a PR needs its docs written.
---

# Add docs (sodax-sdks)

Follow the team's three rules, spelled out in the `docs-review` skill: code lives in a test, not
the page; don't restate what code, types or another doc already say; anything that can drift needs
a check. The repo's own rules come first: root `AGENTS.md`, `docs/AGENTS.md`, `docs/README.md`,
`packages/skills/AGENTS.md`.

## 1. Does it need a doc at all?

- If the code, a type or a JSDoc can say it, put it there and stop. Type-level doc comments may be
  long; inline comments stay at one or two lines.
- `rg` the topic across `packages/sdk/docs`, `packages/skills`, the READMEs and `docs/`. If it is
  already written, update that place in place or link it.
- What earns a doc: why it works this way, trade-offs, invariants that span repos (backend, relay,
  contracts), the order of a multi-step flow, gotchas the types don't show.

## 2. Pick the one place it goes

- Feature behavior for SDK users: `packages/sdk/docs/<FEATURE>.md`. It is published, so it needs its
  `scripts/docs-pages-map.json` entry and a `docs/docs.json` nav entry.
- Package overview: the package README (npm and the site).
- How partner agents call the public API: `packages/skills/skills/sodax-<pkg>/`, then `pnpm check:ai`.
- How contributors extend the SDK: the matching dev skill in `.claude/skills/` (`add-chain`,
  `add-feature`, ...), then `pnpm check:ai-dev-files`.
- A decision and its reasons: an ADR. Look for an ADR folder on main first
  (`git ls-tree -r --name-only origin/main | rg -i adr`); if there is none, ask where before making one.
- Site-only guides and network pages: `docs/`, per `docs/AGENTS.md`.
- Release notes: `.changeset/<name>.md`, every claim true at the head.

## 3. Code goes in a test

- Write the example as a test beside the code it calls (`packages/<pkg>/src/<feature>/<name>.test.ts`):
  `pnpm test` runs it and `checkTs` typechecks it.
- Link it as `https://github.com/gosodax/sodax-sdks/blob/main/<path>`, without a `#L` anchor. In a
  mapped doc `check:doc-links` fails when that file moves; it never checks lines.
- `docs/README.md` still says "lead with working code". When a site page must show code, show the
  shortest call and link the test that runs it.
- In partner skills a code block is compiled only as a snippet of a package listed in
  `packages/skills/scripts/check-ai-snippets.sh`, or as a `.tsx` file under `examples/`. Anywhere else
  only its imports are checked, so link a test instead.

## 4. Give every claim its check

- Chains, tokens and counts are never hand-written. Site pages use `data-sodax-config`; elsewhere point
  at `ChainKeys`, `ChainTypeArr` or the package exports.
- Generated pages: edit the source, then `pnpm docs:sync-pages`.
- A behavior claim names the test that proves it, or lives in the JSDoc beside the code.
- Words that expire ("not yet", "only", "staging only", "all") go, or point at the config that decides.
- A claim nothing can check stays out.

## 5. Finish

- Added a value to a list-like set (chain, provider, connector, config slot)? `rg` a sibling value and
  fix every list that names it, or replace the list with a pointer.
- Docs Drift accepts any mapped `packages/sdk/docs` page, so make the edit the one that documents the
  change, not a filler line.
- Run what you touched: `pnpm check:docs-pages`, `check:doc-links`, `check:docs-nav`, `check:ai`,
  `check:ai-dev-files`, `docs:validate`.
- Review the result with the `docs-review` skill.
