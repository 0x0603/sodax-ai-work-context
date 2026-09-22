---
type: process
repo: sodax-sdks
github: 471
updated: 2026-09-18
---

# Process

## Log

- 2026-09-18 — Traced the error: not in `sodax-backend`; it is the solver's own
  body. swaps-api relays it as a 422 with the text intact (`error-mapper.ts`).
  Production web uses `useSwapsApiQuote` and only branches on `isError`.
- 2026-09-18 — Branch `feat/quote-too-small-refusal` off `origin/main`
  (`898b7e6a`). Implemented SDK predicate, tests, demo copy, docs. All gates green.
  Not committed — user to trigger.

## Findings

- Solver floor measured 2026-09-18 with free quotes against
  `https://api.sodax.com/v1/intent/quote`, USDC hub `0x2921…8894` → Solana USDC hub
  `0xC3f0…8a5e`: $0.10–$1.00 → `Input amount too low`; $1.01, $1.50, $2, $5 quoted.
  Floor is $1 (exactly $1.00 of USDC still refused).

- `docs/developers/**/swaps.md` and `solver-api-endpoints.md` are generated
  (`generatedFrom:` frontmatter, `scripts/docs-pages-map.json`). Editing the dest
  fails `check:docs-pages`; edit `packages/sdk/docs/*.md` and run
  `pnpm docs:sync-pages`.
- dapp-kit's `dist/index.d.ts` re-exports `@sodax/sdk`, so a new SDK export reaches
  the demo's typecheck after building only `@sodax/sdk`.
- `unwrapResult` in dapp-kit rethrows `SodaxError` as-is, so the swaps-api quote
  hook's `error` keeps the `cause` chain the predicate walks.

## Changes During Work

- Docs edits first landed on the generated pages; reverted and redone at source.
