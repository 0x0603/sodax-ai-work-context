---
type: brief
repo: sodax-sdks
github: 378
status: Active
next: await human review on PR #395 (CI fully green); on merge fill outcome.md and set status Done
updated: 2026-08-26
---

# GH-378 Typecheck Test Files · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

- **PR open: https://github.com/icon-project/sodax-sdks/pull/395** — now 6 commits: head **d6eb127b9** extends the guard to wallet-sdk-core (17 casts tightened, no baseline), pushed by the user's own account from the second machine (author name "0xILTW", login 0x0603, verified).
- **Conflict resolved and pushed** (2026-08-25): merge commit `bbc4d6c70` + review fixes `d41cf0fb7` pushed; PR is MERGEABLE (BLOCKED = awaiting review/CI). The `gh378-merge` scratch worktree no longer holds unique state and is disposable.
- Merged-tree probe (2026-08-25): **26 tsc errors** in main's new tests — swaps-api 13 (client.test.ts 10, http.test.ts 3), dapp-kit 12 (_apiKeyWire 8, SodaxProvider 4), sdk 1 (BridgeService.test.ts:1159) — plus **6 undocumented `as unknown as`** the cast-comment guard will reject (PartnerFeeClaimService.apiKeyWire ×4, http.test.ts ×2).
- Guard now wired in all 6 test-bearing packages (sdk 76 / dapp-kit 22 / wallet-sdk-react 15 / types 8 / swaps-api 6 / wallet-sdk-core 10 test files); libs has 0 tests; apps out of scope. Unswept never/any casts remain only in dapp-kit (4) and wallet-sdk-react (21).
- Claude-bot PR review (user-triggered): no blockers, 3 cosmetic notes, no action needed. Human review still pending (REVIEW_REQUIRED).
- Dual-agent bot review (comment 5406493167): 3 low findings, all verified true. #1 (cast-scanner gaps) and #2 (Turbo cache missing guard script) **fixed, unstaged in the worktree** (see process.md Session 3); #3 (`GetAddressType` NEAR/Solana/Stellar mismatch) is pre-existing public-API scope — left as follow-up.

## Next action

Merge + review fixes pushed (`bbc4d6c70`, `d41cf0fb7`); **CI fully green on head `d41cf0fb7`** — including the first-ever ai-drift-check run (pass, 2m47s) and Build and Test (pass, 7m59s); E2E and changeset skipped as designed. Only human review remains (REVIEW_REQUIRED). On merge: fill `outcome.md`, set `status: Done`. Follow-up candidate (not tracked as an issue per convention): `GetAddressType` NEAR/Solana/Stellar mismatch, see process.md Session 3.

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
