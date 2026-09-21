---
type: brief
repo: sodax-sdks
github: 450
status: Active
next: Run tier 3 (funded) — F00 prereqs first, then F01/F05 deposit on one EVM spoke, then F03/F06 withdraw on that same chain
updated: 2026-09-21
tags: [leverage-yield, manual-test, demo, backend-api]
related_issues: [gh-256, gh-452, gh-325]
---

# GH-450 Leverage Yield manual test · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Manual test of the leverage-yield feature through the two **vault** demo pages —
`/leverage-yield` (SDK) and `/leverage-yield-api` (API v2). Scope is those two only.
**Tiers 1 & 2 are done and green**: 306+22 unit tests pass, a purpose-built zero-cost harness
passes 112/112 against production, and both pages render correct, mutually consistent data with
no wallet. **Tier 3 — the funded write paths — has not started**, and that is the part the
backend team actually asked for. Six defects found along the way, all in `outcome.md`.

| Item | State |
| ---- | ----- |
| Scope + test-case matrix (A–F) | done — `plan.md` |
| Tier 1 automated read/quote/validation | done — 112/112, `probe.mjs` |
| Tier 2 demo UI read mode + parity | done — `evidence/` |
| Tier 3 funded deposit/withdraw/submit-tx | **not started** |

## Blocked on

1. **F00 prereqs, before any funded run.** `apps/demo/.env` points swaps at dead
   `localhost:3108` and bridge at `3109`; the SDK page's "Submit tx to API" checkbox routes
   through the swaps API and has **no relay fallback**. Comment both out, restart Vite.
2. **F07/F08 need the demo to reach `leverageYield.useBackendSubmitTx`.** Without it the leverage
   backend submit-tx path is unreachable from the demo. **Settled 2026-09-21: the edit belongs to
   #452**, as a full Sodax Settings row rather than a one-line `providers.tsx` override — it is
   Step 1 of `../gh-452-leverage-yield-submit-tx-default-api-key/plan.md`, deliberately scheduled
   before that issue's own gate so this run can happen. That plan also deletes the local
   `/leverage-yield` checkbox blocker #1 describes.
3. **Solver minimum position size is unknown** and is in neither repo. Probe with free quotes
   before committing funds.

## Next action

Run **F00**, then **F01** (SDK deposit, checkbox off) on one EVM spoke with the smallest amount
that clears the solver fee. Everything else in tier 3 is serialised behind a successful deposit,
because the hub wallet is CREATE3-derived from `(spoke chain, EOA)` and there is no other way to
obtain lsoda* shares. Case table: `plan.md` §Tier 3.

## Settled — do not re-litigate

1. **Scope is two pages.** `/leverage-positions` is out — it arrived with #374 (merged
   2026-09-15, *after* this issue was filed) and was already hand-tested during that review.
2. **The real acceptance bar is in the other repo**:
   `sodax-backend/docs/leverage-yield-api-sdk-mapping.md` §Open items — an EVM-spoke deposit, an
   EVM-spoke withdraw, and a split-tx (Solana/Bitcoin) withdraw, each through
   `submit-tx → relay → postExecution → getStatus → solved`. Do not re-derive the scope.
3. **The API is live** on production *and* canary; every read and both quote endpoints answer
   200. The API demo flow is testable today — this was an open question, it is now answered.
4. **All 4 vaults quote on the production solver**, `lsodaSUSDS` included. The earlier
   assumption that it was staging-only-and-unfillable is wrong at quote level.
5. **Test on `main`, not a feature branch.** Working branch is
   `test/450-leverage-yield-manual` off `origin/main` @ `a10e50b4`.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What are the test cases, and what does each tier cost? | `plan.md` | 2.8k |
| What passed, what broke, what is still open? | `outcome.md` | 1.9k |
| How did I get here, and what did the dead ends teach? | `process.md` | 1.4k |
| The zero-cost harness itself | `probe.mjs` | — |
| Read-mode screenshots of both pages | `evidence/` | — |

## Landmines

- **Chain keys are prefixed**: `0xa4b1.arbitrum`, not `arbitrum`. Only Sonic is bare. A bare key
  returns `400 unsupported token_src for src chain` and reads like a liquidity problem.
- **`pnpm dev:demo` is broken** (filters `demo`, package is `sodax-demo-v2`); `README.md:51`
  still points at it. Use `pnpm --filter sodax-demo-v2 dev`.
- **`netAprRay` is negative for every vault** and that is correct — it is the AAVE-only view.
  The headline number is `effectiveNetAprRay`. Do not "fix" the sign.
- **A prior analysis claimed the slippage white-screen was confirmed end-to-end. It is not**
  reproducible without a wallet — the memo short-circuits on a missing address. The throw is
  real, the reachability claim was inferred. Re-deriving it found two worse bugs (`-5` → minOut
  above quote; `1e9` → zero slippage protection).
- **Canary is not an isolated environment** — same vault addresses, same position data as
  production. There is no consequence-free place to write.
- The API page's order list is **in-memory**; the Staging/Production tabs remount the page and
  wipe it mid-flight. Copy the tx hash out before submitting.
- **Local `main` is stale** (`bdc5a0b8`, behind `origin/main`), and the checkout moved from the
  test branch to `main` mid-session without my doing it. Results were re-verified against
  `a10e50b4` afterwards — see `process.md` §The branch moved underneath the session. Confirm
  `git log --oneline -1` before trusting any run.
