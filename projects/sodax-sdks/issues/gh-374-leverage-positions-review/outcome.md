---
type: outcome
repo: sodax-sdks
github: 374
status: Active
updated: 2026-09-12
tags: [leverage-positions, review]
---

# Outcome

PR 374 is still **OPEN**. Review verdict was `request-changes`; most findings have since been fixed on
the branch itself rather than in a follow-up.

## Commits on `feat/leverage-positions` (newest first)

```
1fd72462  feat(leverage): read a position's own fee, and brand the calls that post an intent   [mine]
61b2f613  fix(demo): charge the position's own fee, and take the rest from the SDK
4f30f7c7  feat(dapp-kit): let a partner operate a leverage position, not just read one
509956ca  feat(sdk): one correct way to quote a position leg
24530593  feat(sdk): pair position writes with the step that must not be skipped
ab7075dd  fix(sdk): report the leverage an open position will actually show
f18498ab  fix(demo): stop rendering unloaded risk params as a 1.00x leverage ceiling
2c388b46  fix(demo): name the asset and the address a position pays out to
3cd11777  fix(demo): fund a native leverage position as native
184768ed  docs(skills): give the leverage-position recipe its sizing section                   [mine]
6b939d9d  fix(sdk): fail closed on unsupported leverage-position inputs                        [mine]
39cf4541  refactor(demo): rebuild the leverage positions page around what a reader acts on
10ff233e  fix(demo,types,docs): finish the integration the main merge left half-done
```

Merge base with `main` is `5e57a335`. Branch head `1fd72462`, pushed, tree clean, local == origin.

### What my three commits contain

- **`6b939d9d`** — two fail-closed guards. `resolvePositionFee` applies the bounds `getQuote` already
  asserted (AUDIT-1); `openPosition` / `openPositionFromDebtToken` / `operatePosition` refuse a Bitcoin
  source (Findings A, B). Both sit ahead of every other check so they reject before anything is signed.
  4 tests; the guards were verified by disabling them and confirming the tests fail.
- **`184768ed`** — the recipe's missing `## Sizing the leg` section (Finding H, reduced to its one real
  part).
- **`1fd72462`** — checkpoint carried across machines. `feeBps`/`feeReceiver` readable off the position
  (Finding D), demo consuming it (Finding E), branded `PositionIntentCall`/`PositionDirectCall` so the
  compiler refuses routing a leverage change through the path that never reports it, `getIntentStatus`
  passing the api key, position mutations invalidating `['leverageYield']`, and `apps/demo/…/constants.ts`.

Verified at `1fd72462`: `pnpm checkTs` 13/13, full suite **2812 tests / 84 files**,
`check:docs-pages`, `check:doc-links`, `check:ai` all green.

## Still open

### 1. `useLegQuote.ts` contradicts the shipped skill — most urgent

The demo hand-rolls `fetch(endpoint + '/quote')` and justifies it with a statement proven false three
times (`process.md` §The getQuote question). The skill now tells partner agents to use
`sodax.leverageYield.getQuote`. Two options:

- **Comment only** — zero risk, but leaves a raw fetch with no stated reason.
- **Switch to the SDK method** — also recovers the `x-api-key` header the raw path drops. Needs
  `partnerFee: { address, percentage: 0 }` or a fee-configured dapp under-quotes the leg.

### 2. AUDIT-2 — `minCollateralOut` has no sanity floor

`1n` still builds. Suggested: reject a floor wildly below oracle value and point at
`projectLeverageLeg`. `plan.md` §AUDIT-2.

### 3. AUDIT-3 — `operatePosition` arbitrary calldata

Either constrain `tx.to` to the position/factory, or document that this is arbitrary execution as the
hub wallet and must never take untrusted input. Branded types narrowed it but do not bound the target.

### 4. Finding C — `approvePositionFunding` receipt status

Reverted approve still returns `{ok: true}`. One `status` check plus a regression test.

### 5. Courtesy PR comment

Three commits were pushed straight onto AntonAndell's PR branch at the user's request. Nothing has been
said on the PR thread about it.

### 6. Nits I and J

Doc overstatement in `buildOpenPositionData`; a stale comment in `PendingOperationControl`.

## Notes for whoever picks this up

- Per repo convention, out-of-scope findings go in the **PR thread**, not new tracker issues.
- The branch is shared with its author — stage explicit paths, never `git add <dir>`; the working tree
  has repeatedly held someone else's WIP.
- Do not re-derive the solver economics or the getQuote question. Both are settled in `process.md` with
  the measurements.
