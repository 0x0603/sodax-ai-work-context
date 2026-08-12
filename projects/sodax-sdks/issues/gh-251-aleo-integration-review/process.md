---
type: process
repo: sodax-sdks
github: 251
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — State check only. Confirmed still blocked; recorded what has accumulated on
  the PR since the block.

## Findings

### Still blocked, and Aleo has not landed by any other route

`git grep -icE "\baleo\b"` over `origin/main` → **0 files**. Nothing merged around the PR.

### PR #95 state

| field | value |
| --- | --- |
| state | OPEN, **not** draft |
| author | `Prabinbaral77`, fork branch `aleo-integration` |
| updated | 2026-07-27 (review activity only — no new commits) |
| size | **+3776 / −55 across 85 files** (issue body says +3678 / −47 across 82) |
| formal GitHub reviews | **none — zero, of any state** |
| vs `main` | `diverged`, **28 behind**, 880 ahead |

The 880-ahead figure is not real divergence: the fork carries unrelated history, and a prior
review noted `origin/main` has no common ancestor with it, so the merge-base is `1c91a223`.

### Two findings already on the record — do not rediscover them

**High, from the dual-agent review of 2026-07-27** (comment on the PR, not a formal review):

> **Aleo deposits fail default preflight simulation** — `packages/sdk/src/shared/services/spoke/SpokeService.ts:473`
> … `resolveSimulationEncoding` has no Aleo branch.

**Gate failures, from an earlier `@claude` run on 2026-06-10:**

- `pnpm build:packages` — `@sodax/wallet-sdk-core` DTS build fails
- `pnpm checkTs:packages` — `@sodax/wallet-sdk-react` type-check fails

So the feature is not merely un-deployed; as of the last review it did not pass the repo's own
gates. That is worth knowing before scheduling review time.

### Review history

All as issue comments, none as formal reviews: `@claude` runs triggered by 0x0603 on
2026-05-20 (×2, first errored), 2026-06-10 and 2026-07-21; a dual-agent review triggered by
R0bi7 on 2026-07-27. Author posted "refactored per review" on 2026-05-21 and 2026-06-17.

## Changes During Work

None.
