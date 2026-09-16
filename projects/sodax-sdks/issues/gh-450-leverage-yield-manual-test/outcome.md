---
type: outcome
repo: sodax-sdks
github: 450
status: Active
updated: 2026-09-16
tags: [leverage-yield, manual-test, defects]
---

# Outcome — tiers 1 & 2 done, tier 3 not started

Environment for every result below: branch `test/450-leverage-yield-manual` off `origin/main`
at `a10e50b4`, node v22.15.0, pnpm 10.32.1, `pnpm i && pnpm build:packages` clean,
API `https://api.sodax.com/v1`.

## Results

| Suite | Result |
| ----- | ------ |
| `@sodax/sdk` leverage-yield + LY API unit tests | **306/306 pass** (9 files, 2.9s) |
| `@sodax/dapp-kit` leverage hooks | **22/22 pass** |
| `probe.mjs` — tiers 1 & D (A01–A25, B, C, D) | **112/112 pass** |
| Tier 2 — demo read mode, both pages | **pass**, 0 console errors |
| Tier 3 — funded write paths | **not started** |

### Live facts established

- The Leverage Yield API v2 is **live on production and canary**. Every read endpoint, both
  quote endpoints and `allowance/check` answer 200. The API demo flow is testable today.
- **4 vaults**, addresses identical between `@sodax/types` and the live API:
  `lsodaWEETH` `0xD09d…701D`, `lsodaWSTETH` `0x136E…Ce7a`, `lsodaJITOSOL` `0xD7Ae…Bd78`,
  `lsodaSUSDS` `0x7585…A7cb`.
- **All four vaults quote on the production solver**, deposit and withdraw. Including
  `lsodaSUSDS`, whose underlying is flagged staging-only in the swap registry — the earlier
  assumption that it would be unfillable is wrong at quote level.
- **Cross-source parity is exact.** On-chain SDK reads and the HTTP API agree on `asset()`,
  LTV (0 bps delta on all four), `totalAssets` and `previewDeposit` — and both agree with what
  the two demo pages render.
- `leverageYield.useBackendSubmitTx` defaults to **`false`** (`ConfigService.ts:512`), unlike
  swaps and bridge which are `?? true`. #452 has not landed.

### The APR model (worth knowing before reading any APR on screen)

`GET /apr` is the on-chain-rates-only view and its `netAprRay` is **negative for every vault**
— Aave supply on the sodaXXX collateral is ~0 while the borrow leg costs real money. Only
`GET /apr/effective` folds in the off-chain LSD yield and turns positive:

| Vault | raw net | effective net | LSD source |
| ----- | ------: | ------------: | ---------- |
| lsodaWEETH | −4.37% | **8.53%** | EtherFi (weETH) |
| lsodaWSTETH | −4.37% | **8.40%** | Lido (stETH) |
| lsodaJITOSOL | −17.03% | **9.91%** | Jito (JitoSOL) |
| lsodaSUSDS | −3.71% | **14.29%** | Sky (sUSDS) |

Composition, verified exactly: `effectiveSupplyAprRay === lsdApr.aprRay + supplyAprRay`.

Both demo pages render the **effective** figure as the headline, correctly. The SDK page also
shows the raw negative number but only under the explicit label "AAVE-only net", which is the
right call — pinned as A24/A25 so a refactor cannot quietly swap the two.

## Defects found

### 1. `applySlippageMinOut` has no input validation — three distinct failures

`apps/demo/src/components/leverage-yield-api/LeverageCard.tsx:64-68`

```js
const bps = BigInt(Math.round(Math.max(0, 100 - Number(slippagePct)) * 100));
```

`Math.max(0, …)` clamps the lower bound and nothing else. The field is a bare
`<Input id="slippage">` (`:493`) with no `type="number"`, no `min`/`max`, no validation — the
SDK page uses a `spinbutton` for the same control. Measured against a real quote of
`10866002227255203`:

| Input | `minOutputAmount` | Consequence |
| ----- | ----------------- | ----------- |
| `"0.5"` | 10811672216118926 | correct |
| `""` | 10866002227255203 | slippage silently 0 — intent likely unfillable |
| `"abc"` | **throws `RangeError`** | render-phase crash, no error boundary → white screen |
| `"-5"` | 11409302338617963 | **minOut ABOVE the quote** — unfillable by construction |
| `"1e9"` | **0** | **all slippage protection removed** — fillable at any price |

The `"1e9"` row is the dangerous one: it is accepted silently and produces an intent a solver
may fill at an arbitrarily bad rate.

**Reachability:** all five need a connected wallet. `depositIntentParams`
(`LeverageCard.tsx:209-210`) short-circuits on a missing `depositAccount.address`, so in read
mode the field is inert — I typed `"abc"` and cleared the field entirely against the live page
and it did not crash. An earlier analysis called the white-screen "confirmed end-to-end"; that
is **overstated** — the throw is real (verified directly against the extracted function) but
wallet-gated.

Fix shape: clamp to `[0, 100]` and reject non-finite input at the boundary, not inside the memo.

### 2. `pnpm dev:demo` is broken

`package.json:13` filters `--filter=demo`; the package is `sodax-demo-v2`. Verified:
`npx turbo run dev --filter=demo` → `x No package found with name 'demo' in workspace`.
`README.md:51` sends a tester straight into it. Use `pnpm --filter sodax-demo-v2 dev`.

### 3. The leverage-yield backend submit-tx path is unreachable from the demo

`useBackendSubmitTx` defaults false and `providers.tsx` passes only `swaps` and `bridge` keys —
there is no `leverageYield` key and no Settings-modal row. So the one flow the backend team
names as still owed cannot be exercised without editing `providers.tsx`. This overlaps #452.

Worse, the SDK page's "Submit tx to API" checkbox posts to **`sodax.api.swaps.submitTx`**, not
the leverage route — so even when checked it never touches `/leverage-yield/submit-tx`.

### 4. Local `.env` points two services at dead localhost ports

`apps/demo/.env` sets `VITE_SWAPS_API_BASE_URL=http://localhost:3108` and
`VITE_BRIDGE_API_BASE_URL=http://localhost:3109`. Both are **down** (verified, along with 3008).
Because the SDK page's "Submit tx to API" checkbox routes through the swaps API, that path is
broken on this machine — and it has no relay fallback. Must be fixed before any funded run.

### 5. Stale cross-repo claim: partner fees are *not* deposit-only

`sodax-backend/docs/leverage-yield-api-sdk-mapping.md` §Known limitation states the SDK's
`LeverageYieldSwapWithdrawParams` has no `partnerFee`. It does —
`LeverageYieldService.ts:334-344`, with a doc block explaining the fee is taken in lsoda* shares.
Issue #325 is stale for the same reason. The backend DTOs may now be able to expose it.

### 6. Minor

- `GET /leverage-yield/intents/:txHash` and `/:txHash/fill` hang past the SDK's 30s
  `DEFAULT_BACKEND_API_TIMEOUT` and end in 504 for an unknown hash.
- The gateway 403s non-browser User-Agents (python-urllib); curl and fetch are fine.
- The API page never preselects a vault, so it opens with an empty panel while the SDK page
  opens populated. Cosmetic, but it reads as "no data" on first load.
- 22 of 44 dapp-kit leverage hooks are not wired into the demo and cannot be tested via UI.

## Still open

1. **Tier 3 in full** — the three cases the backend doc names (EVM deposit, EVM withdraw,
   split-tx withdraw), plus F07/F08 which need the `providers.tsx` edit.
2. **Solver minimum size** — not in either repo. Probe empirically with free quotes before
   sizing a funded position.
3. **Does the production submit-tx worker drain leverage rows to `solved`?** Accepting a row
   (`inserted`) is not the same as carrying it. Only a funded write answers this.
4. **Is canary genuinely isolated?** Evidence says no. Needs a backend-team answer.
