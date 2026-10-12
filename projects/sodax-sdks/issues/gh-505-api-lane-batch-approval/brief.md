---
type: brief
repo: sodax-sdks
github: 505
status: Draft — PR #511 (base feat/302-swap-lifecycle), commits 67bd317a + f5c1fb85
next: Mainnet rows on the playground preview (PR #511 body); retarget to main after #504 merges (merge, never rebase)
updated: 2026-10-12
tags: [eip-5792, atomic-batch, swaps-api, dapp-kit, playground]
related_issues: [gh-507, gh-302, gh-506]
---

# GH-505 API-lane batch approval · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

PR A is **PR #511**, one commit `67bd317a` on `feat/505-api-lane-batch-approval` (from #504 head `ab1ec388`): shared `approvalBatch.ts` in the SDK (SwapService refactored onto it, swap tests
byte-identical), dapp-kit `useSwapsApiBroadcastWithApproval`, playground batch path with an
unconfirmed-batch hold, docs + skills. Every local gate green except `docs:validate` (no `mint` CLI).
Detail: process.md § Session 2.

## Blocked on

1. **Merge** waits on #504 (mainnet matrix) like everything stacked on it.

## Next action

User runs the #505 mainnet rows on the playground preview (checklist in PR #511). PR B (gh-507) is
stacked on this branch as its own PR.

## Settled — do not re-litigate

1. Order: #505 first, #507 stacked on it (#505 = higher value + the public consumer of the helper).
2. Hook stops at the broadcast; caller still calls `/submit-tx` (playground persists the broadcast first).
3. Hook only for "allowance short"; caller passes `intentTx`; non-batch wallets keep today's path.
4. No `useSwapsApiApprovalStrategy` read hook until a UI needs the label.
5. Same rules as #504: Sonic sequential, no fallback after the wallet got the batch, no new global codes.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Context, decisions, steps A1–A5, verification, merge order | `plan.md` (use `rg -n "^#" plan.md`) | 2.8k |
| The issue body | `issue.md` | 0.5k |
| What was built, gates, deviations | `process.md` § Session 2 | 1.3k |

## Landmines

- The local checkout moves under you (it went feat/506 → main mid-session). Read #504 with
  `git show origin/feat/302-swap-lifecycle:<path>` and stamp the commit on every claim.
- madge counts type imports: the shared helper must not import `SpokeService`.
- `_apiKeyWire.test.ts` needs the hook's first step to be the API call (Sonic body, `walletProvider: {}`).

- #504's batch code is still in review; a fix landing on `feat/302-swap-lifecycle` must be merged into
  this branch (merge, never rebase) and re-applied to the moved helper.
- The issue's "`value` is a string" note is stale — the swaps-api client parses it to bigint
  (`rawTxSchemas.ts:22,38-43`, test `schemas.test.ts:158`). No conversion.
- Playground invariants (`apps/playground/AGENTS.md` § Execution invariants): re-quote around approval,
  sender check, persist before `submitTx`.
