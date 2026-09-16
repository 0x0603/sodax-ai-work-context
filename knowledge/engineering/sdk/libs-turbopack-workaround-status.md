---
type: knowledge
area: engineering/sdk
tags: [libs, turbopack, nextjs, stacks, injective, supply-chain]
status: Active
created: 2026-08-27
updated: 2026-08-27
related_issues: [sodax-frontend#1070]
---

# @sodax/libs Turbopack workaround — upstream fix status (2026-08-27)

`packages/libs` exists to work around Next.js 16 Turbopack build crashes
(sodax-frontend#1070, closed 2026-06-05 BY the workaround, not upstream).
Checked all three revert conditions against upstream via a 4-agent survey.

## Verdicts

| Barrel | Root cause | Upstream status | Revert? |
| --- | --- | --- | --- |
| `stacks/core` + `stacks/connect` | 25-file circular-import SCC inside `@stacks/transactions` dist/esm × Turbopack scope-hoisting bug | stacks.js **NOT fixed**: SCC analysis of npm tarballs shows the identical 25-file cycle in 7.3.1 and 7.6.0; no ESM restructure in any 7.4–7.6 changelog; zero Turbopack issues in stx-labs/stacks.js. Turbopack **partially fixed**: re-entrant scope-hoisting registration fix (vercel/next.js#96697, backport #97308) ships in **Next 16.3.1+** — NOT in any 16.2.x (line ended at 16.2.12); canonical circular-import crash vercel/next.js#82827 still OPEN | **No** |
| `injective/wallet-strategy` | naked `await import('@injectivelabs/wallet-ledger')` + wallet-ledger bundles CryptoJS 4.2.0 UMD with dead AMD `define` branches | **NOT fixed** at latest 1.20.41 (2026-08-24): both the unguarded dynamic import (dist/esm/index.js:25) and the CryptoJS UMD branches are byte-identical in behavior to 1.18.14; changelogs stale at 1.16.0; no upstream issue/PR exists | **No** |

## Practical consequences

- Keep `@sodax/libs`; the Injective front alone justifies it regardless of Next version.
- Upgrading `@stacks/*` 7.3.1→7.6.0 or `@injectivelabs/*` 1.18→1.20 does NOT help the
  Turbopack problem (and is otherwise only routine maintenance — no OSV advisories).
- When the frontend moves to Next **16.3.1+**: re-run the repro
  (`apps/example-next-js-16`) with the workaround off — one sub-class of the crash is
  fixed there, but #82827 is still open, so expect libs to stay.
- Full survey data: gh-741 session workflow `wf_c4beaa4c-947` journal.
