---
type: process
repo: sodax-sdks
github: 374
status: Active
updated: 2026-09-12
tags: [leverage-positions, solver, mainnet, debugging, aave]
---

# Process log

One session, 2026-09-10 → 2026-09-12. Three strands: reviewing the PR, debugging three real mainnet
positions the user opened while testing, and auditing the AI-facing docs.

## Mainnet positions — what actually happened

The user opened three positions from **Solana** during testing. All three were traced on-chain.

| # | Position | Opened | Outcome |
| --- | --- | --- | --- |
| 1 | `0xA3EFD1Ff…1c6A` | 05:07:26Z | solver never filled; cancelled, funds returned |
| 2 | `0xCB92fc87…e9B0` | 05:21:17Z | same |
| 3 | `0x88b76DA3…c9A6` | later | **filled** — 2.01x, HF 1.59 |

Hub wallet (owner of all three): `0x5eDf7e9C…5648`. Factory `0xF8fB7F20…031C`, lending pool
`0x553434896D39F867761859D0FE7189d2Af70514E`.

### The full money trail of position #1

Traced by scanning 1400 blocks of `Transfer` logs on both the reserve and the aToken:

```
OPEN   tx 0x20808a82…c583   block 78968654
  mint        -> HUB_WALLET   0.001            SOL relayed from Solana, wrapped to sodaSOL
  HUB_WALLET  -> POSITION#1   0.001
  POSITION#1  -> Aave pool    0.001            supplied as collateral

CANCEL tx 0x1e380914…0977   block 78969831
  POSITION#1  -> burn         0.001
  Aave pool   -> HUB_WALLET   0.001000001546407107
```

**Deposited 0.001, returned 0.001000001546** — more than went in, the excess being Aave interest
accrued over ~20 minutes. No step lost funds. This mattered because the user believed 99.5% had been
lost; the `0.000005` they saw was Solana's flat 5,000-lamport transaction fee, and the returned funds
sat in the **hub wallet on Sonic**, which the demo has no screen for.

### Solver economics — the reusable finding

Why #1 and #2 failed and #3 succeeded, measured by quoting the same pair at eight sizes:

```
input sodaUSDC | haircut | solver keeps
0.051028       |  9.86%  | $0.00503
0.1            |  5.04%  | $0.00504
0.2            |  2.52%  | $0.00504
0.41           |  1.23%  | $0.00504
1              |  0.51%  | $0.00509
5              |  0.11%  | $0.00536
25             |  0.02%  | $0.00616
```

**The solver keeps a flat ~$0.005 per fill regardless of size.** Not a percentage. Everything follows:

- The solver never refused to *quote* the small legs — it quoted them fine.
- Failure came from the **floor**, not the size. Position #1's `minCollateralOut` left the solver
  `$0.004937` against a `$0.005` cost — a loss, so it walked.
- Back-solving the floor puts SOL at ~$100.84 when opened vs $102.00 later: **SOL rose 1.15%**, past
  the user's **1% slippage**, and the margin evaporated.
- Position #3 ($0.41 leg) survived because 1% slippage there is $0.0041 of cushion, not $0.0005.

Practical rule: legs under ~$1 give the flat fee more than 0.5% each way, and mid-single-digit
slippage is needed for small sizes to fill at all.

### Two UX defects this exposed

- `page.tsx` told users *"If nothing fills within 5 minutes the intent expires and the deposit returns
  to you."* It does not. 16 minutes past deadline the funds were still in the position with the
  pending slot occupied. Cancel is manual.
- `getPositionPendingState` reports `isLive: true` for an intent that expired 16 minutes earlier — it
  reads `hasPendingOperation()`, which means "not yet settled", not "still fillable". So the history
  panel said FAILED while the position panel said "in flight", on the same screen.

### Token layers, for reading any future trace

```
S (native, 0x0)  ->  wS 0x039e2fB6…  ->  sodaS 0x62ecc3Ee…  ->  aToken "Aave Local S"
   underlying          hub asset          reserve/collateral      receipt, grows with interest
```

`bnUSD` is the confusing case: `address === hubAsset === vault === 0xE801CA34…`, so nothing wraps and
withdraw appears to return "the same token you deposited". It does not — it returns the reserve token
every time; for bnUSD the two just happen to share a name. That is why a Discord report that
non-native tokens behaved differently was a false lead.

SODAX MM **is** an Aave v3 fork — `aToken.name()` literally returns `"Aave Local SOL"` — so "Aave pool"
and "sodax mm" name the same contract.

## The getQuote question

The demo's `useLegQuote.ts:15-19` claims `sodax.leverageYield.getQuote` rejects hub reserve pairs.
This was tested three times:

1. Directly, early: `isValidOriginalAssetAddress('sonic', sodaSUSDS|sodaUSSD)` → `true`.
2. By a workflow agent tasked to **run** it: the call returned
   `{ok: true, value: {quoted_amount: 4001464751917384n}}`, and interleaved SDK-vs-raw-fetch rounds
   landed byte-identical.
3. Directly again, at the end: `{ok: true, quoted_amount: "3996812234082113"}`.

Root cause of the false comment: `tokens.ts` registers the soda* reserves as **self-mapped sonic spoke
tokens** (`address === hubAsset === vault`), so `chainToSupportedTokenAddressMap` contains them and the
invariant never fires. It still fires correctly for a genuinely unregistered address.

A second fact fell out of the same probe, which nothing documented: **`getQuote` pre-deducts the
configured leverage-yield partner fee** before asking the solver.

```
no fee configured           sent 410000000000000000
leverageYield.partnerFee 1% sent 405900000000000000   <- under-quotes a position leg
partnerFee percentage 0     sent 410000000000000000
```

A position's hook intent carries no fee data, so a fee-configured dapp must pass
`partnerFee: { address, percentage: 0 }` explicitly. That is now in the skill.

**Method lesson worth keeping.** Two sub-agents that only *read* `SolverApiService.ts` both concluded
the opposite, and one proposed teaching partner agents to hand-roll HTTP. Reading the invariant is not
the same as knowing what the registry contains. For any load-bearing claim about SDK behaviour, run it.

## Docs + skills audit

Four gaps were claimed. A workflow ran an inventory agent, an empirical agent, a style agent and an
adversary tasked to refute, then an adjudicator. Result: **4 claimed → 1 real edit.**

- Dropped: the hooks-index rows (6 of 7 already covered), the querykey rows (file delegates by design).
- Kept and merged: the recipe's `(see the sizing section)` pointer had **no referent anywhere in the
  tree**, and nothing said how to obtain the `quotedCollateral` that `projectLeverageLeg` requires.

One `## Sizing the leg` block now closes both, carrying the three things an agent cannot derive: quote
`intentInput` not `borrowAmount`; quote both legs as hub reserves on `'sonic'`; pass the explicit zero
`partnerFee`. The derivation stays in `LEVERAGE_YIELD.md` and is cross-referenced by name — copying it
would create a second drifting copy, and `packages/sdk/docs` does not ship with `@sodax/skills`.

## Environment notes

- The pre-commit hook runs `checkTs && build && test` workspace-wide. At full concurrency it exhausts
  RAM and reports `Failed: @sodax/sdk#test` **with no failing test named** — while the same suite
  passes standalone (2812 tests). Re-commit with `TURBO_CONCURRENCY=2 git commit …`. Recorded in
  the `sdks-precommit-needs-fresh-install-and-build` memory.
- `bigint: Failed to load bindings, pure JS will be used` on every node run is a benign warning from a
  transitive dep.
