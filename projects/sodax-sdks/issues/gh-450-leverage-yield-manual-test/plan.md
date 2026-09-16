---
type: plan
repo: sodax-sdks
github: 450
updated: 2026-09-16
tags: [leverage-yield, manual-test, demo, backend-api, test-cases]
related_issues: [gh-256, gh-452, gh-325]
---

# Plan — leverage yield manual test (test cases)

## Goal

Discharge #450: manually validate the leverage-yield feature through both demo flows —
`/leverage-yield` (SDK) and `/leverage-yield-api` (backend API v2). Scope is the two **vault**
pages only; `/leverage-positions` is out (see `brief.md` §Settled).

The issue body is one line. The real acceptance bar was written by the backend team in
`sodax-backend/docs/leverage-yield-api-sdk-mapping.md` §Open items:

> Empirical P0 validation of the deposit/withdraw submit-tx flow — the trace is static. This is
> the one substantive item still owed: an **EVM-spoke deposit**, an **EVM-spoke withdraw**, and a
> **split-tx (Solana/Bitcoin) withdraw**, each end-to-end through
> `submit-tx → relay → postExecution → getStatus → solved`.

So the deliverable is not "click around the demo" — it is proving those three paths carry a row
from submission to `solved`, plus the read/quote surface both pages render on the way there.

## Approach

Three tiers, cheapest first. Tier 1 and 2 need no funds and are already automated in
`probe.mjs`; tier 3 is the part that costs real money and must be run by hand.

| Tier | What | Cost | State |
| ---- | ---- | ---- | ----- |
| 1 | Read / quote / validation surface, API + SDK, cross-checked | free | **done** — 112/112 |
| 2 | Both demo pages in read mode, cross-page parity | free | **done** — see `process.md` |
| 3 | Funded deposit + withdraw, both pages, submit-tx to `solved` | mainnet | **not started** |

Tier 1 is not a substitute for tier 3, but it retires every failure mode that does not need a
signature — so a funded run starts from a known-good read surface instead of debugging a 400
with money already in flight.

## Test cases

Numbering: `A` API HTTP, `B` SDK service, `C` API↔SDK parity, `D` validation/negative,
`E` demo UI read mode, `F` funded write path. A–D are automated in `probe.mjs`; E–F are manual.

### Tier 1 — automated, zero cost (`node probe.mjs`)

Run per vault, all four (`lsodaWEETH`, `lsodaWSTETH`, `lsodaJITOSOL`, `lsodaSUSDS`).

| ID | Case | Expected |
| -- | ---- | -------- |
| A01–A03 | `GET /vaults` shape | 200, non-empty, every row has name/vault/asset/borrowToken/lsdSource |
| A04 | `GET /vaults/{name}` | 200, `vault` matches the registry row |
| A05 | `GET /asset` | 200, equals the registry `asset` |
| A06 | `GET /apr` | 200, `netAprRay` is a **signed** decimal string, `targetLtvBps` unsigned |
| A07 | `GET /apr/effective` | 200 |
| A08 | `GET /apr/lsd` | 200, `stale` present as a boolean — a DefiLlama miss must be *flagged*, never silently swapped for the fallback |
| A09 | `GET /total-assets` | 200, numeric string |
| A10 | `GET /position` | 200, LTV within 0..10000 bps |
| A11 | Vault solvency | any vault carrying debt has health factor > 1.0 (1e18) |
| A12–A14 | `GET /preview/{deposit,withdraw,redeem}` | 200, numeric string |
| A15 | ERC-4626 round trip | deposit X assets → shares → redeem those shares ≤ X. More would mint value from nothing |
| A16–A17 | `share-balance` / `max-withdraw`, unfunded owner | 200, exactly `"0"` |
| A18–A19 | `fees/partner`, `fees/solver` | 200, numeric |
| A20 | `GET /deadline` | 200, strictly in the future |
| A21 | `POST /quote/deposit` (spoke token → lsoda*) | 200, numeric `quotedAmount` |
| A22 | `POST /quote/withdraw` (lsoda* → spoke token) | 200, numeric `quotedAmount` |
| A23 | `POST /allowance/check`, unfunded owner | 200, `valid: false` |
| **A24** | **APR sign contract** | raw `netAprRay` is **negative**, `effectiveNetAprRay` is **positive**. A UI rendering the raw figure would show a negative APR on a product yielding ~8–14% |
| **A25** | **APR composition** | `effectiveSupplyAprRay === lsdApr.aprRay + supplyAprRay`, exactly. Catches a backend that drops one term |
| B01 | LY config default | `new Sodax({}).leverageYield.useBackendSubmitTx === false` |
| B02 | LY config opt-in | `{ leverageYield: { useBackendSubmitTx: true } }` → `true` |
| B03 | `listVaults()` | non-empty packaged registry |
| C01 | Registry count | `@sodax/types` count === API count |
| C02–C03 | Registry addresses | vault/asset/borrowToken identical both ways; no vault on one side only |
| C04 | `totalAssets` parity | SDK (on-chain) vs API within 1% |
| C05 | LTV parity | within 25 bps |
| C06 | `asset()` parity | identical |
| C07 | `previewDeposit(1e18)` parity | within 1% |
| C08 | `getLsdApr` staleness | `stale` is a boolean |
| D01–D08 | API negative paths | malformed vault → 400; missing vault → 400; unknown name → 404 (**not 500**); bare chain key `arbitrum` → 400; missing fields enumerated; `quoteType` ≠ `exact_input` → 400; zero amount → 400; base URL without `/v1` → 404 |
| D09–D11 | SDK negative paths | unregistered vault → error `Result`, never a throw; unknown name → `undefined`; `getVaultByAddress` case-insensitive |

C04–C07 are the point of the tier: both demo pages display the same four numbers from
**independent sources** (HTTP vs Sonic RPC). Neither page can detect drift on its own.

### Tier 2 — demo UI, read mode, zero cost

Prereq: `pnpm --filter sodax-demo-v2 dev`, no wallet connected.

| ID | Page | Case | Expected |
| -- | ---- | ---- | -------- |
| E01 | SDK | `/leverage-yield` loads | 0 console errors; vault preselected (`lsodaWEETH`) |
| E02 | SDK | Vault info panel | Net APR, LSD staking, AAVE supply/borrow, target leverage, AAVE-only net, TVL, share price, LTV (target), health factor, idle asset all render |
| E03 | SDK | APR labelling | headline "Net APR" is the **effective** figure; the negative raw figure appears only under the explicit label "AAVE-only net" |
| E04 | SDK | Vault switch | selecting each of the 4 vaults re-reads and repaints the panel |
| E05 | API | `/leverage-yield-api` loads | 0 console errors |
| E06 | API | Vault dropdown | lists exactly the 4 vaults served by `GET /vaults` |
| E07 | API | Vault info panel | **nothing renders until a vault is picked** — differs from the SDK page, which preselects |
| E08 | API | Live quote | token + amount → "Quoted shares" matches `POST /quote/deposit` for the same inputs |
| **E09** | **both** | **Cross-page parity** | with the same vault selected, both pages show the same effective APR / total assets / LTV / health factor, and both match `probe.mjs` |
| E10 | API | Slippage field, no wallet | non-numeric input does **not** crash — `depositIntentParams` short-circuits on a missing address |

### Tier 3 — funded, mainnet, by hand

Run on ONE EVM spoke chain, smallest viable amount. Withdraw is strictly serialised behind a
successful deposit **from the same chain** — the hub wallet is CREATE3-derived from
`(spoke chain, EOA)`, and there is no other way to obtain lsoda* shares.

Do **F00** first or F03/F07 are meaningless.

| ID | Page | Case | Expected |
| -- | ---- | ---- | -------- |
| F00 | — | Prereqs | comment out `VITE_SWAPS_API_BASE_URL` / `VITE_BRIDGE_API_BASE_URL` in `apps/demo/.env` (they point at dead localhost services) and restart Vite; add `leverageYield: { useBackendSubmitTx: true }` to `providers.tsx` if F07/F08 are in scope |
| F01 | SDK | Deposit, checkbox OFF (default) | quote → approve → deposit; `vaultSwap` runs create → verify → relay → notifySolver; shares land in the hub wallet |
| F02 | SDK | Deposit, "Submit tx to API" ON | posts to `sodax.api.swaps.submitTx`. **Note: the swaps route, not the leverage route** — record whether a leverage row is accepted there, and whether it reaches `solved` |
| F03 | SDK | Withdraw, same chain | `hubWalletSwap` branch; gas paid on the **spoke**, not Sonic |
| F04 | SDK | Withdraw, different "Receive on" chain | cross-chain withdraw — only the SDK page allows this; the API page hard-wires `dstChainKey === srcChainKey` |
| F05 | API | Deposit | checkAllowance → approve → createDepositIntent → sign+broadcast → `POST /leverage-yield/submit-tx` with `operation: 'deposit'` → poll `/submit-tx/status` to `solved` |
| F06 | API | Withdraw | same, `operation: 'withdraw'`, no approve step |
| F07 | SDK | Backend submit-tx path | with the flag opted in, `vaultSwap` posts to `/leverage-yield/submit-tx` and polls to `solved`. **The flow the backend team says is still owed** |
| F08 | SDK | Client-side relay fallback | kill the backend or supply a bad API key mid-flight → warn log `[leverageYield] backend submit-tx did not complete…` and a relayer call still lands. 8 distinct fallback triggers, none exercised live |
| F09 | either | Split-tx withdraw (Solana/Bitcoin) | the backend doc's third named case. API page's approve cannot serve non-EVM, so the withdraw half only |
| F10 | API | Reset-then-approve | a USDT-lineage token fires two signatures instead of one |
| F11 | API | Slippage with a wallet connected | **expected to throw** — see `outcome.md` §Defects. Confirm before/after any fix |

## Verification

- Tier 1: `node probe.mjs` exits 0. Re-run against canary with `LY_API=https://canary-api.sodax.com/v1`.
- Tier 2: screenshots in `evidence/`, console error count 0.
- Tier 3: for each of F01–F09, a tx hash plus the terminal status, recorded in `process.md`.
- Regression: `pnpm --filter @sodax/sdk test` and `--filter @sodax/dapp-kit test` stay green.

## Risks

1. **Mainnet only.** No testnet path anywhere in the repo; both pages default to the production
   solver. Every tier-3 case spends real money. Budget the solver fee (0.1% of notional per
   `/fees/solver`) plus two spoke gas payments, and size above whatever the solver's undocumented
   minimum is — that minimum is in neither repo and surfaces only as a generic error.
2. **Canary is not isolated.** `canary-api.sodax.com` returns the same 4 vault addresses and the
   same position data as production, so it appears to point at the same hub. There is no
   environment where a write is consequence-free. Confirm with the backend team before assuming.
3. **Withdraw is serialised behind deposit** on the same chain. A failed deposit blocks half the
   matrix.
4. **Leverage positions are not recoverable** through the demo's Recovery page. The withdraw tab
   is the only exit.
5. **The API page's order list is in-memory.** Touching the Staging/Production tabs or the
   Settings modal mid-flight remounts the page and wipes it. Copy the tx hash out before
   submitting; recover with `GET /submit-tx/status?txHash=…&srcChainKey=…`.
6. **`GET /intents/:txHash` and `/:txHash/fill` exceed the SDK's 30s default timeout.** Raise
   `timeout` via `RequestOverrideConfig` before using them, or prefer `/submit-tx/status`.
