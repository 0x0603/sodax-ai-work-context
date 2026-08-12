---
type: process
repo: sodax-frontend
github: 1374
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Triage only. Re-derived the alert set against the live Dependabot API and
  the lockfile on `origin/main @ 9db18283`. No code written; reasoning in `plan.md`.

## Findings

### The sequencing gate is satisfied — this is unblocked

The ticket says "hold until the Next.js bump has baked in prod for one release cycle."
Sub-issues of #1365:

| # | title | state |
| --- | --- | --- |
| 1372 | Phase 1: Bump Next.js 15.5.9 to ^15.5.18 | **CLOSED** — PR #1388 merged **2026-06-09** |
| 1373 | Phase 2: Bump Vite and Turbo at root | **CLOSED** — PR #1456 merged |
| 1374 | Phase 3 (this) | OPEN |
| 1375 | Phase 4 | OPEN |
| 1376 | Phase 5 | CLOSED 2026-08-03, no PR |

The bump merged two months ago. Nothing holds this back but the work itself.

### The existing override is the blocker, not a missing one

Root `package.json` on `origin/main`:

```json
"pnpm": {
  "overrides": {
    "@hpke/core": ">=1.8.0",
    "valibot": ">=1.2.0",
    "axios": "1.13.2"
  }
}
```

`axios: "1.13.2"` came from #1042 ("pin axios to 1.13.2 to mitigate supply chain attack") — an
anti-supply-chain pin, not a Dependabot floor. The open axios advisories carry
`first_patched_version` of 1.13.5, 1.15.0, 1.15.1, 1.15.2, 1.16.0 and **1.18.0**; the lockfile
resolves `axios@1.13.2` in both places it appears. So the override is actively holding axios
below every advisory floor, and axios is **29 of the 116 open alerts** — by far the largest
single block.

#1621 spotted the same thing from the other direction and asked for a comment here.

### The ticket's twelve packages are not today's twelve

Live counts (`gh api .../dependabot/alerts?state=open`, 2026-08-12): **116 open — 2 critical,
51 high, 59 medium, 4 low**, 113 unique GHSAs. Dismissed: **0**. The ticket's "~30 alerts" is
stale, as is #1365's own "122 open / 90 unique".

| ticket's package | open alerts now | note |
| --- | --- | --- |
| axios | **29** | floor 1.18.0; pinned at 1.13.2 — see above |
| undici | 12 | floor 6.28.0; resolves 6.23.0 |
| h3 | 4 | floor 1.15.9; resolves 1.15.5 |
| **kysely** | **0** | all fixed 2026-08-06 via better-auth 1.4.18→1.6.22 (#1647) — drop |
| **qs** | **0** | all fixed — drop |
| **minimatch** | **0** | all fixed — drop |
| picomatch | 2 | **development** scope only |
| postcss | 4 | floor 8.5.23; Dependabot PR #1646 already open |
| ws | 3 | floors 7.5.11 / 8.21.0; lockfile has 8 distinct versions |
| yaml | 1 | **development** scope only |
| lodash | 2 | floor 4.18.0; resolves 4.17.23 |
| — | | |
| **protobufjs** | **11 + 1** | **missing from the ticket**, and holds the critical |
| **next** | 8 | cleared by a version bump, not an override (PR #1642 open) |
| **js-yaml** | 3 | missing from the ticket; development scope |

So: **three of the twelve are already fully fixed**, three more are dev-scope, and the package
carrying a critical is not on the list at all.

### `lodash@4.18.0` does exist — correcting an earlier read

An intermediate note in this session claimed 4.18.0 "does not exist on npm as a normal
release". That is wrong. Checked directly against the registry: `dist-tags.latest` is
**4.18.1**, and both 4.18.0 and 4.18.1 are published. The override is satisfiable. It is
still the one entry in the set that is a minor rather than a patch bump, so it deserves a real
smoke test.

### No guard exists yet

`git grep 'pnpm why'` over `origin/main` returns nothing, and root `scripts/` holds only
`build_news_gist.py` and `find_malicious_npm_packages.sh`. The guard the ticket asks for has
to be written from scratch.

### One structural note for whoever writes the PR

`packages/` no longer exists in this repo (deleted in `168bb93e`, #1308) — there are exactly
two `package.json` files, root and `apps/web`. The sibling ticket #1373's title still says
"apps/demo + apps/node", which no longer exist here either. Don't go looking for them.

## Changes During Work

None — no files touched in `sodax-frontend`.
