---
type: brief
repo: sodax-sdks
github: 378
status: Active
next: await review on PR #395; on merge fill outcome.md and set status Done
updated: 2026-08-24
---

# GH-378 Typecheck Test Files · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- **PR open: https://github.com/icon-project/sodax-sdks/pull/395** (`no-changeset` label) — commit adc100c97 on `test/sdk-typecheck-tests`, 29 files, +169/−110; pre-commit gate (checkTs+build+test) passed.
- `packages/sdk/tsconfig.json` no longer excludes `**/*.test.ts`; sdk `checkTs` = **0 errors** with all 76 test files typechecked (was 138 errors in 29 files).
- Unit suite green: 71 files / 2297 tests pass. Root `pnpm checkTs` 13/13, `pnpm build:packages` 7/7. Biome clean on changed files (2 pre-existing warnings on main).
- No production `src` changes; 0 new `as never`/`as any`/`@ts-*`; 14 documented deliberate `as unknown as` casts.
- Found (NOT fixed, out of scope): `GetAddressType` in `@sodax/types` declares Hex/Address for Stellar/Solana/Near whose real addresses are strkey/base58/named — flag in PR body.

## Next action

Await review on PR #395. On merge: fill `outcome.md`, set `status: Done` here. The PR body already carries the two out-of-scope notes (GetAddressType wart, sibling packages' exclude-gap).

## Map

| Question | File |
| --- | --- |
| What does the issue ask / what's in scope? | `issue.md` |
| How were the 138 errors clustered and fixed? | `plan.md` (plan) + `process.md` (root causes found) |
| What happened during the session, incidents included? | `process.md` |
| Final result | `outcome.md` (fill when PR lands) |

## Constraints that bite

- No `any` / `@ts-ignore` / `!` / cast-to-silence (AGENTS.md). Never run repo-wide biome/pretty. Never run `test:e2e` (live mainnet).
- Commit only when user asks; no `#378` in the commit message; no AI attribution.
