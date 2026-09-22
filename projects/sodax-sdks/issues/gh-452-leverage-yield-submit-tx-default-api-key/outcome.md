---
type: outcome
repo: sodax-sdks
github: 452
status: Pushed as PR 475, CI green — funded run outstanding
updated: 2026-09-22
---

# Outcome

- PR: https://github.com/icon-project/sodax-sdks/pull/475 — open, 30 files
- Branch: `feat/452-leverage-yield-submit-tx` off `main` @ `ae857f57`; worktree `sodax-sdks-452`
- Commits: 7, all signed —
  `c77d4202` demo · `525f6acf` apiKey + status router · `ec2b388d` the flip (breaking, droppable) ·
  `44e51f47` docs · `5dcd962d` rejected-key stop · `c98af612` getIntentStatus left on its old
  contract · `c1ffca21` drop the forwarding shim, key the whole status call
- Superseded and deleted: `feat/452-leverage-yield-submit-tx-default` (4 commits, based on #468
  pre-merge) — no PR, and each commit verified to have a counterpart on the new branch first
- Tests: 2894 sdk (84 files), 809 dapp-kit (36 files), all passing; three `checkTs` clean;
  `check:ai`, `check:doc-links`, `check:docs-nav`, `check:docs-pages` clean

## Summary

Leverage yield now behaves like swaps at the consumer surface: the backend submit-tx path is the
default, a per-action API key reaches both of its legs, a vault swap's status is readable from the
source tx through `getDetailedStatus`, and dapp-kit can poll it. The one thing not done is the funded
run that would prove the leverage-yield submit-tx body completes end to end; the flip was made on the
precedent that bridge shipped the same default three days after its path existed (`brief.md`
§ Settled 3), and is isolated in its own commit so it can be dropped alone.

## What Changed

**SDK**

- `shared/config/ConfigService.ts` — `leverageYieldUseBackendSubmitTx` returns `?? true`.
- `types/leverageYield/leverageYield.ts` — the option's JSDoc.
- `leverageYield/LeverageYieldService.ts` — `LeverageYieldExtras { apiKey? }` and the 4th type
  argument on `VaultSwapActionParams`; `overrideConfig` threaded into `runBackendSubmitTx`; private
  `resolveSolverStatus` (bounded + durable-intent reconcile) that `getIntentStatus` now routes
  through; `getDetailedStatus` + `resolveHubTxHash` + `detailedStatusLookupFailed`; two timeout
  constants; the four opt-in comments rewritten.
- `leverageYield/detailedStatus.ts` (new, 22 lines) — `DetailedLeverageYieldStatus` / `…Key`.
- `leverageYield/errors.ts` — `LeverageYieldDetailedStatusErrorCode` / `…Error`.
- `leverageYield/index.ts` — the two types, deliberately not `DETAILED_STATUS_NOT_DELIVERED`.

**dapp-kit**

- `hooks/shared/solverStatusPolicy.ts` (new) — `getSolverStatusRefetchInterval`, `isSolverNotFound`,
  `toNotFoundBudgetRead`, `getSolverDetailedStatusRefetchInterval`, with structurally-declared read
  types so both features satisfy them.
- `hooks/swap/getSwapStatusRefetchInterval.ts` — now a thin swap-named face over that module.
- `hooks/leverageYield/useLeverageYieldDetailedStatus.ts` (+ test, 5 cases).
- `hooks/leverageYield/useLeverageYieldVaultSwap.ts` — docstring corrected to the backend-default flow.

**Demo**

- `lib/sodaxSettings.ts`, `components/shared/SodaxSettingsModal.tsx`, `providers.tsx`,
  `constants.ts` — a Leverage Yield SDK submit-tx row, Auto keyed on the effective solver endpoint.
- `pages/leverage-yield/page.tsx` — deleted the local checkbox that POSTed a vault swap to the
  **swaps** submit-tx route without `operation` and with no relay fallback; `handleSwap` is now one
  `vaultSwap()` call.

**Tests** — 14 new SDK cases (default + wiring, `extras.apiKey` at spy and wire level, 10
`getDetailedStatus` routing cases) and 6 dapp-kit cases.

**Docs / skills** — `CONFIGURE_SDK.md`, `LEVERAGE_YIELD.md` (new `getDetailedStatus` /
`getIntentStatus` sections), `dapp-kit/README.md`, 5 skills files, 3 mirrored docs pages.

## How it was committed

Four commits, not the five first sketched: `extras.apiKey` and `getDetailedStatus` both live in
`LeverageYieldService.ts`, and `git add -p` is unavailable here, so splitting them would have needed
hand-built patches. They went in together.

The flip **was** isolated, which was the point of splitting at all. Done by saving the four
flip-touched files, reverse-applying just the flip edits, committing the feature work, then
restoring. Both states were run green before their commit, so `24b4d08a` reverts cleanly and the
rest of the branch stands.

Two edits fell out of that exercise and are improvements in their own right:

- The `extras.apiKey` call-through tests had been relying on the new default; they now set
  `useBackendSubmitTx: true` explicitly, like `sodaxBE` does, so they keep testing the backend legs
  whatever the default is.
- `useLeverageYieldVaultSwap`'s docstring asserted which way the default points. It now describes
  both transports and tells the reader to check `config.leverageYieldUseBackendSubmitTx`.

## Rebuilt after #468 merged

#468 squash-merged into `main` an hour after this branch was cut from it. The four commits were
cherry-picked onto the merged `main`; one conflict, in `getSwapStatusRefetchInterval.ts`, and it was
the useful kind — `main`'s copy had grown a rejected-key stop during #468's review that this work's
move to `hooks/shared/` would have dropped. Resolving it surfaced that `SwapService` had gained the
same arm, which is what `5dcd962d` adds for leverage yield.

## Safety audit (asked for explicitly, 2026-09-21)

**What of `main` this can break.** Outside leverage yield the diff touches exactly two library files.
`ConfigService.ts` is one behavioural line plus a comment, inside the leverage-yield getter — the
swap and bridge getters have no line in the diff. `hooks/swap/getSwapStatusRefetchInterval.ts` is
rewritten as a thin face, and the case for it being safe is three-layered: its only non-test
importers are `useDetailedStatus.ts` and `useStatus.ts`, **neither of which is in the diff**, so they
are byte-identical to `main`; the six symbols they import are all still exported; and the behaviour
is branch-for-branch identical, with swap's own cases passing unedited. Nothing touches bridge,
positions, money market, staking, dex or wallet-sdk. The one intended break is `new Sodax()`.

**The idempotency the default rests on**, checked rather than inherited from a comment:

| Leg | Status |
| --- | --- |
| Re-POST submit-tx | verified — `findOneAndUpdate` + `$setOnInsert`, no duplicate row, no overwrite |
| Re-relay an already-relayed tx | verified — relay answers `{ success: true, message: 'Transaction registered' }`, noted at the SDK call site |
| Solver re-affirming a seen intent | **no local evidence** — external service; the only support is that swaps and bridge have defaulted on against it since 2026-08-09 |

**A behaviour change that was caught and reverted.** Folding `getIntentStatus` into the reconciling
solver read added a round trip on every `NOT_FOUND` and turned a `NOT_FOUND` behind an unreadable
backend into an error. Nothing in the repo calls that method, so it would have surfaced on an
external consumer with nothing in the diff pointing at it. `c98af612` splits the plain read back out;
only `getDetailedStatus` reconciles. The PR was carrying two breaking changes where it should carry
one.

## Self-review, 2026-09-21

Asked to audit the branch against "doesn't break old logic / solves the issue / safe / best
approach / clean / not over-engineered". Three findings, all mine, all fixed in `c1ffca21`:

1. **The forwarding shim was ceremony.** `hooks/swap/getSwapStatusRefetchInterval.ts` was kept as a
   thin face over the shared policy so swap's files would stay out of the diff. It is exported
   through no barrel — four internal importers, nothing public — so it protected the audit story,
   not the codebase. Deleted; importers point at `shared/` directly and the policy test moved beside
   what it tests. Also removed two type aliases naming the same shape twice.
2. **`getDetailedStatus`'s `config.apiKey` reached only the backend read**, leaving the solver read
   on the instance key. It was documented, but documenting a wart does not fix it. Now reaches both
   legs, empty string falling back as it does on the backend legs.
3. **The two timeout constants restated `SwapService`'s reasoning verbatim.** Trimmed to a pointer.

Net 59 lines lighter. Measured rather than guessed: comments are 29% of the lines this branch adds,
against 35% in `SwapService.ts`, 30% in `BridgeService.ts`, 47% in `detailedStatusRouting.ts` — below
the house norm, so the density is not the over-engineering to look for. The shim was.

## Post-review commits, 2026-09-22

Three more on top of the review pass, all pushed, CI green on the middle one:

| Commit | What |
| ------ | ---- |
| `844535b8` | the reconcile leg carries the caller's `apiKey` — one line, JSDoc, `LEVERAGE_YIELD.md`, one test |
| `a27d9a14` | `LEVERAGE_YIELD_API.md` still called the backend path opt-in; dapp-kit recipe's hook table too |
| `d3b106d3` | demo leverage-yield order cards read `useLeverageYieldDetailedStatus` instead of polling the solver |
| `c02fe1e4` | re-baseline the SDK tarball gate — `main`'s own growth plus this branch's crossed the old ceiling |
| `8073ecf7` | demo settings: Leverage Yield API base URL row, and a per-action `extras.apiKey` row the page now passes |
| `75165b62` | the modal no longer seeds the key row from `VITE_SODAX_API_KEY`; `TextRow` gains a `secret` mode |

CI is green on this set: 18/18, with the tarball step reporting 999087 B under the refreshed
1050000 B ceiling. An independent review verified the branch line by line and requested no changes.

`d3b106d3` also threads an `OrderStatus` `feature` prop and makes `deriveSubmitTx` take the record
rather than the response envelope, so the backend arm of the router reuses it. The PR body was
corrected in the same pass: it still claimed the per-request key reached "both" legs.

Reasoning and the evidence behind each is in `process.md` § Session 4.

## Follow-ups

- The funded run (gh-450 tier 3 F07/F08).
- An LY counterpart of `detailedStatus.e2e.test.ts` — fixture-blocked, same gap as gh-453 Step 5.
  Defer in-source; no tracker issue.
