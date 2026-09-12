---
type: plan
repo: sodax-sdks
github: 374
status: Active
updated: 2026-09-12
tags: [leverage-positions, review, security-audit, partner-fee, bitcoin]
---

# Findings — review + security audit

Two passes over PR 374: a correctness/architecture review, then a security audit asking specifically
whether the change can be **hacked** or can **lose user funds**. Severity uses the review scale
(blocker / should-fix / nit).

## Index

- §Review findings — A–J, the original pass
- §Security audit — the fund-loss question, answered separately
- §What is fixed — mapping findings to commits
- §Deliberately dropped — claims that did not survive verification

---

## Review findings

### A · blocker · Bitcoin derives the hub wallet from the personal address — FIXED (guarded)

`LeverageYieldService.ts` `executePositionOpen` / `executePositionOperation` / `listPositionsForUser`
called `getUserHubWalletAddress(params.srcAddress, …)` directly.

`BitcoinSpokeService.getEffectiveWalletAddress` doc says: *"This must be used everywhere a wallet
address is needed for hub interaction."* In TRADING mode the deposit is pulled from the Bound trading
wallet, so the hub wallet must derive from **that** address. `MoneyMarketService.supply`,
`SwapService` and `BridgeService` all do it — and so does the **vault flow in the same file**
(`LeverageYieldService.ts:951-964`, which also calls `ensureRadfiAccessToken`). The position paths did
neither.

Reachability was proven, not assumed: `buildOpenPositionData({srcChainKey:'bitcoin', token:'0:0', …})`
built a 1536-byte payload successfully against the real config.

**Resolution: fail closed.** The user chose to refuse Bitcoin rather than implement it. Guard sits
ahead of every other check in both write paths.

To re-enable later: lift the block at `LeverageYieldService.ts:951-964` into the position paths, plus
`getOnDemandRelayIdentity` for the relay (Finding B), then remove the guard.

### B · should-fix · Bitcoin relay identity — FIXED (covered by A's guard)

`BitcoinSpokeService.sendMessage` returns `encodeWithdrawalData(params)` — a JSON-stringified signed
payload, **not** a tx hash. `settleHubWalletMessage` forwarded it as `srcTxHash` with generic
`RelayExtraData`. `relayTxAndWaitPacket` for Bitcoin needs `tx_hash: 'withdraw'`, the parsed
`OnDemandRelayData` as `data`, and a derived `od:<hash>` poll id — exactly what
`getOnDemandRelayIdentity` produces and `MoneyMarketService.buildRelayIdentity` already uses.

No funds move on this path (bare message), so it failed visibly rather than silently.

### C · should-fix · `approvePositionFunding` discards the receipt — OPEN

`await (walletProvider as IEvmWalletProvider).waitForTransactionReceipt(hash)` — result discarded.
`EvmRawTransactionReceipt.status` is `'0x1'`/`'0x0'` and the provider **resolves** on a revert. So a
reverted approve returns `{ok: true}`.

The same PR checks it in `settleHubWalletMessage` (`receipt.status !== 'success'`), and
`SpokeService.approve:409` checks it too. Only this one does not. Test at
`LeverageYieldService.test.ts` covers *that it waits*, not *that a reverted receipt fails*.

### D · should-fix · A position's `feeBps` could not be read — FIXED

`leveragePositionAbi` had no `feeBps()`/`feeReceiver()` and `LeveragePosition` had no fee field, while
`positionSizing.ts` documents `feeBps` as required to avoid Aave `'36'`. A client that did not create
the position could not recover it. Fixed in `1fd72462`: both reads added, sourced from the position
rather than config (config can change; the fee is fixed at creation).

### E · should-fix · Demo never accounted for the fee — FIXED

`CreatePositionCard` built `LeverageLegRequest` without `feeBps`; `AdjustLeverageControl` projected
`debtAfter` without it; `ClosePositionControl` sold the entire balance leaving no fee room. The demo's
own settings modal can set a global `fee`, and `ConfigService.leverageYieldPartnerFee` is
`leverageYield.partnerFee ?? fee`, so positions really could carry one.

Fixed by the user on top of D. `buildDecreaseLeverage` now documents the full-exit sizing:
`balance * 10_000 / (10_000 + feeBps)`.

### F · should-fix · `useLegQuote.ts` bypasses the SDK on a false premise — STILL OPEN

The demo hand-rolls `fetch(endpoint + '/quote')`, dropping the `x-api-key` header the SDK sends
(`SolverApiService` → `apiKeyHeader`), which the demo *does* configure (`providers.tsx`). Its stated
reason:

> *"WHY NOT `sodax.leverageYield.getQuote`: that wrapper asserts `isValidOriginalAssetAddress`, which
> only accepts tokens registered as spoke originals … the wrapper rejects the exact pair the intent
> uses"*

**This is false.** See `process.md` §The getQuote question for the three independent verifications.
Now worse than cosmetic: the shipped skill tells partner agents to use the SDK method, while the
reference implementation tells them it does not work.

### G · should-fix · `listPositionsForUser` doc signature — FIXED

`LEVERAGE_YIELD.md` documented `listPositionsForUser({ srcChainKey, address })`; the implementation is
positional `(srcChainKey, srcAddress)`.

### H · should-fix · Skills gaps — FIXED, but mostly by dropping the claim

Four gaps claimed, one real. See §Deliberately dropped.

### I · nit · `buildOpenPositionData` doc overstates safety

*"a stale prediction reverts both rather than stranding the tokens"* — true on the hub. Off-hub the
source deposit is already spent when the hub batch reverts, and the same owner opening concurrently
can advance `nextPositionIdFor`. Unrelated users cannot, which is what the doc actually establishes.

### J · nit · `PendingOperationControl` comment

Says settle is *"offered even when the viewer is not the owner"*, but the button is
`disabled={… || !owner}`.

---

## Security audit

Question asked: **can this be hacked, or lose user funds?**

**Hack (third party takes funds): no path found.** Verified safe:

| Vector | Why it holds |
| --- | --- |
| Front-run `predictPosition` | salt includes `creator`, and the factory enforces `cfg.owner == msg.sender` |
| Create a position for someone else to control the refund address | same constraint; code comments record this was once a real theft path, now closed |
| Unlimited / shared-contract approval | nothing is approved to the factory (funding is a plain transfer); `approvePositionFunding` approves the exact amount |
| `settle` being permissionless | anyone may call it, but funds always sweep to `owner` |
| Batch half-applying | transfer and create are one batch; create reverting takes the transfer with it |

**Fund loss through missing validation: two holes.**

### AUDIT-1 · Unbounded position fee — FIXED (`6b939d9d`)

`resolvePositionFee` checked only that the fee was the percentage variant. Measured by running
`buildOpenPositionData`:

```
percentage=   100  -> BUILD OK   (1%)
percentage=  5000  -> BUILD OK   (50%   <- lot)
percentage= 50000  -> BUILD OK   (500%  <- lot)
percentage=   0.5  -> viem throw (not an integer)
percentage= 70000  -> viem throw (uint16 range)
```

Only viem's `uint16` stopped anything, at **655%**. `getQuote` in the *same file* asserts
`Number.isInteger && >= 0 && <= FEE_PERCENTAGE_SCALE`. `PositionConfig.feeBps` is **fixed at
creation** and charged on every later operation.

Fix applies the identical bounds. Deliberately **not** tightened to the 100 bps that
`common.ts` docstrings claim: nothing in the SDK enforces that, and all three real validators
(`getQuote`, `EvmSolverService:168`, `shared-utils:120`) use 10000. Tightening only here would make one
`leverageYield.partnerFee` work for vaults and break positions.

Residual: `5000` (50%) still passes. The real mitigation for that is Finding D — a readable `feeBps`
surfaces the mistake before funds move.

### AUDIT-2 · `minCollateralOut` has no sanity floor — OPEN

`leverageYieldInvariant(params.minCollateralOut > 0n, …)` — `1n` builds fine, no warning. Intents use
`ANY_SOLVER_ADDRESS`, so any filler takes nearly the whole borrow and returns 1 wei. The user keeps the
debt. `projectLeverageLeg` computes the right floor but nothing requires calling it.

Suggested fix: `openPosition` already has `borrowToken`/`borrowAmount` and can read oracle prices from
the pool — enough to reject a floor wildly below oracle value and point at `projectLeverageLeg`.

### AUDIT-3 · `operatePosition` executes arbitrary calldata — OPEN (documentation)

`encodePositionCalls` does not constrain `tx.to`; `executePositionOperation` checks only
`calls.length > 0`. So it runs any call as the hub wallet, which holds *all* of the user's hub assets.
Rated should-fix rather than blocker because `spoke.sendMessage({dstAddress: hubWallet, payload})`
already offered the same primitive — this packages it more conveniently without a warning.

Partly mitigated since by the branded-call types in `1fd72462`, which constrain *which builder output*
may go down which path, though not the target address.

---

## What is fixed

| Finding | Commit |
| --- | --- |
| A, B (Bitcoin), AUDIT-1 (fee bounds) | `6b939d9d` (mine) |
| H (skills sizing section) | `184768ed` (mine) |
| D, E (feeBps readable + demo uses it) | `1fd72462` (mine, content the user's) |
| G (doc signature) | earlier branch commit |
| Various demo correctness | `3cd11777` … `61b2f613` (user's) |

Open: **C**, **F**, **AUDIT-2**, **AUDIT-3**, plus nits I and J.

---

## Deliberately dropped

Dropping a claim is a result. These did not survive verification:

- **"hooks-index.md is missing 7 hooks"** — 6 of 7 are already tabled in the recipe, and
  `leverage-yield/SKILL.md` routes agents there. Only `useEModes` was absent tree-wide, delivered as
  one clause rather than an index row.
- **"querykey-conventions.md is missing the position keys"** — the file *explicitly delegates*:
  *"See the source hook files … for current keys."* 51 of 168 key prefixes are undocumented by design
  and no lint enforces source→doc. The specific key asked for would have enshrined a violation of the
  file's own Rule 1.
- **"there is no supported quote path"** and **"document the raw fetch"** — both proposed by
  sub-agents that read code without running it. Both wrong; see `process.md`.
