---
type: process
repo: sodax-frontend
github: 1871
updated: 2026-09-18
---

# Process

## Log

- 2026-09-18 — npm has rc.6 for all six `@sodax/*` packages. First `pnpm install`
  on the branch only synced node_modules from a stale rc.3 to main's rc.5 (macOS
  `sed` did not apply the `\|` alternation); redone with `sed -E`. rc.6 installed.
- 2026-09-18 — `checkTs` green (11.9 s), `biome lint apps/web` reports only the
  pre-existing errors, `pnpm build` green in 1m36s with the usual env noise.
- 2026-09-18 — Committed `b117e337`, pushed, PR 1872 opened; issue 1871 created
  before the PR.

## Findings

- The `isRealWorldAsset` checkTs error seen earlier in the day was a stale install,
  not a main breakage.
- Live `/swaps/tokens` had 0 `sUSDS` entries at 2026-09-18 ~16:00 +07.

## Changes During Work

- None to app code.
