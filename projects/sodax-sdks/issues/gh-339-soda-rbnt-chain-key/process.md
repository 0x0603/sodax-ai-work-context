---
type: process
repo: sodax-sdks
github: 339
updated: 2026-08-04
---

# Process

## Log

1. Resolved the reported permalink — line 250 at `f5b04e88` is the `sodaRBNT`
   entry; `origin/main` is that exact commit, so no drift to reconcile.
2. Confirmed the anomaly is isolated: `grep REDBELLY_MAINNET tokens.ts` returns
   line 255 (inside `SodaTokens`) plus the whole `redbellySupportedTokens` block
   — nothing else in a Sonic-side map.
3. Proved the home chain over RPC rather than by inference (see Findings).
4. Branch `fix/soda-rbnt-chain-key` off `origin/main`, one-line fix, invariant
   test, changeset.
5. Guard proof: temporarily reverted the fix, ran the new test, saw it fail with
   `sodaRBNT -> redbelly`, restored.
6. Filed issue #339, then PR #340.

## Findings

- On Sonic (`eth_chainId` `0x92`), `eth_call symbol()` on
  `0x4B207114F9118dEAC56436e1aE3c45648783c7Ac` returns `sodaRBNT`; `name()`
  returns `SODA RBNT`. On Redbelly (`0x97`), `eth_getCode` on the same address
  returns `0x` — no contract.
- Redbelly's RPC only answers on the bare host
  `https://governors.mainnet.redbelly.network`; appending `/rpc` yields a 403
  HTML page.
- Sonic RPC used: `https://rpc.soniclabs.com`.
- The invariant "token.chainKey equals the chain it is filed under" already held
  everywhere else — 84 assertions across four registry tables, one failure.

## Changes During Work

- The pre-commit hook runs the whole workspace `checkTs` + `test`. It failed
  twice for reasons unrelated to the diff, both local-environment only:
  1. `@sodax/dapp-kit` typechecks against `@sodax/sdk`'s built `dist`, which was
     stale and missing the Stellar sponsoring exports → fixed by
     `pnpm build:packages`.
  2. `apps/stellar-sponsor-example` (and the other example apps) had no
     `node_modules` → fixed by `pnpm i`.
  Worth remembering: after pulling `main`, run `pnpm i && pnpm build:packages`
  before the first commit or the hook fails on unrelated packages.
