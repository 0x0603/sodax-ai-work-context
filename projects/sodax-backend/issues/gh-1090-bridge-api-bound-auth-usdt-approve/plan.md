---
type: plan
repo: sodax-backend
github: 1090
updated: 2026-09-04
---

# Plan

## Goal

Land both halves of #1090 on `development`: RadFi/Bound backend HMAC auth (without which
Bitcoin-source bridging cannot work at all), and the allowance-reset transaction from
`POST /bridge/approve` for 2017-TetherToken-lineage tokens.

## Approach

The PR was written 2026-08-17 against `apps/swaps-api` as it stood then, and sat until 2026-09-04.
Three things moved underneath it, and the plan is mostly about absorbing them:

1. **#975 landed** (squash-merged 2026-09-01), so the base branch died and `main == development`.
2. **The SDK blocker dissolved** — `buildApproveTxs` ships in published `@sodax/sdk@2.1.0`, and
   `development` bumped the monorepo to `2.2.0-rc.2` (#1198).
3. **The design was overturned upstream.** [#1069](https://github.com/icon-project/sodax-backend/pull/1069)
   removed the fail-fast from swaps-api after it caused an outage. This PR shipped exactly that
   fail-fast, and bridge-api runs under the same `restart: on-failure`.

So: merge onto `development`, then port #1069's degrade model, then close the parity gaps that port
implies.

## Steps

1. Two merges (see `process.md` for why, and why not a rebase).
2. Port #1069: `buildRadfiConfig` returns `undefined`; `INVALID_OVERRIDE` + `radfiEndpointOverride`
   for a malformed `RADFI_*`; boot WARN in the provider; `assertBoundSignerForBitcoin` → 503 ahead of
   the existing 400. Rewrite the specs the inverted contract breaks, split the signer suite into its
   own `sodax.provider.spec.ts`, and correct the "refuses to boot" prose in five places.
3. Parity gaps the port implies: RadFi triage in `error-mapper.ts` (an expired user Bound token must
   not page), the README approve mapping, the partnerFee contract, and a WARN on the 504 path.
4. Audit + fix what the audit found (three tests that could not fail, one wrong comment).

## Verification

`pnpm --filter bridge-api checkTs | lint | vitest run | test:e2e`, then repo-wide `pnpm checkTs`
and `pnpm test` (what the husky pre-commit gate runs).

Every new assertion was checked against the defect it exists for, by deleting the code and confirming
the test goes red. That is the only reason the audit's findings were real rather than stylistic.

## Risks

- **"One guard call site is enough"** rests on a trace of `BridgeService` in `@sodax/sdk@2.2.0-rc.2`:
  only `createBridgeIntent` reaches `radfi`/`getTradingWallet`. A later SDK could add a second
  Bound-reaching path and the guard would thin out silently. There is a comment, but no test.
- **The 15s build deadline is inherited, not measured.** A bitcoin `createBridgeIntent` makes 3+
  sequential Bound HTTP calls plus a hub read inside that budget. Unmeasured on staging.
- **Bound not exercised end to end on this branch** with a real credential.
