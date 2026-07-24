---
type: review
repo: sodax-sdks
github: 310
updated: 2026-07-24
tags: [code-review, dry, error-handling, parity, balance]
---

# Quality Review — GH-310 chain-agnostic get asset balance

Expert self-review of the shipped change (commit `7e45a438`, branch
`feat/chain-agnostic-get-asset-balance`). Focus: simplicity, cleanliness, reuse, no
over-engineering, no overclaim.

Method: adversarial multi-agent review — 4 independent reviewers (DRY/simplicity, reuse,
behavior-parity, doc-overclaim), then per-finding refutation verifiers. **18 raw findings → 14
confirmed** (4 refuted). Severities below are the verifiers' (more conservative) ratings.

## Overall verdict

The code is clean and reuses existing infrastructure well (`isNativeToken` two-arg from
`@sodax/types`, each spoke service's own read client, Solana static helpers, `fetchUTXOs`, the
existing Soroban infra, `getEvmViemChain`, `scaleNativeMsgValue`). No over-engineering or
speculative abstraction. All tests / lint / build green. **No correctness bug.** Two clusters are
worth attention: a small amount of extractable duplication, and a set of deliberate-but-undocumented
error-handling divergences from the old wallet-SDK path (with one inconsistency). The earlier status
report was slightly over-optimistic in calling the change "fully clean" — these low-severity items
were not surfaced then.

## A. Duplication (DRY) — real, low/nit

| # | Finding | Location | Severity |
|---|---|---|---|
| A1 | Identical plural fan-out copy-pasted across **6** chain services (`Promise.all(tokens.map → getWalletBalance)) → Object.fromEntries`); only the generic type param differs | Solana:264, Sui:315, Stellar:220, Near:247, Stacks:217, Bitcoin:131 | low |
| A2 | EVM and Sonic `getWalletBalances` are ~40 identical lines (native fan-out + multicall3 + readContract fallback); sole difference is client source (`getPublicClient(srcChainKey)` vs `this.publicClient`) | Evm:227-276, Sonic:399-446 | low |
| A3 | Stellar `getWalletBalance` non-native branch duplicates the Soroban simulate-read boilerplate of the sibling `getBalance()` (getNetwork/getAccount → TransactionBuilder → simulate → isSimulationSuccess → scValToBigInt) | Stellar:194-212 (vs 133-162) | low |
| A4 | Bitcoin `getWalletBalance` native branch duplicates the UTXO-sum of sibling `getBalance()` | Bitcoin:118 (vs 101-103) | nit |
| — | Router `getWalletBalance`/`getWalletBalances` switch statements + singular per-chain readers | SpokeService:715 | nit — leave as-is (mirrors the existing `getDeposit` router convention) |

**Recommended win:** extract one free function `fanOutWalletBalances(params, getOne)` into
`shared/utils/shared-utils.ts`; the 6 A1 services call it with a bound `this.getWalletBalance`. Pure
refactor, no behavior change. A2/A3/A4 are optional — they follow the repo's deliberate standalone
per-chain-class convention (AGENTS.md "branch by case; don't over-generalize"), so consolidating is a
judgment call, not a defect.

## B. Behavior parity vs the old wallet-SDK path — error handling (most important)

The new SDK readers are mostly **fail-loud**: one failing per-token read rejects the whole
`getWalletBalances` (via `Promise.all`) → the dapp-kit hook surfaces an error and shows **no**
balances. The old `xService` path was more **resilient** (swallowed per-token errors to `0n`, or
returned a partial/empty map), so a single flaky token did not blank the whole list in the demo.

| # | Divergence | Location | Severity |
|---|---|---|---|
| B1 | Solana: old swallowed every per-token read error → 0n; new lets it throw | Solana:264 | low |
| B2 | Stellar: old swallowed Soroban token read errors → 0n; new throws | Stellar:220 | low |
| B3 | Sui: old caught all errors and returned `{}`; new rejects on a single failing coin read | Sui:315 | nit |
| B4 | Icon: old returned a partial result (native kept, non-native omitted) on multicall error; new throws | Icon:181 | low |
| B5 | NEAR: a nullish NEP-141 balance now throws instead of resolving to 0n | Near:234 | low |
| B6 | **Stacks is the ONLY new reader that still swallows per-token errors → 0n — inconsistent with its fail-loud siblings** | Stacks:198 | low/medium (inconsistency) |
| B7 | EVM includes zero-balance native tokens in the map (old omitted them) — harmless, demo reads `?? 0n` | Evm:234 | low |

This is a **design decision, not a clear bug**: fail-loud is arguably more honest (a fake `0n` on a
failed read can misrepresent a balance), but it is **less resilient** than the old UX and is currently
**inconsistent** (Stacks vs the rest). A policy should be chosen and applied uniformly.

- Option 1 — **resilient per-token** (`catch → 0n`), ideally baked into the A1 fan-out helper: matches
  old UX, kills the inconsistency, one change.
- Option 2 — **keep fail-loud** but remove the Stacks swallow so all chains behave the same.

## C. Docs — minor

| # | Finding | Location | Severity |
|---|---|---|---|
| C1 | "Default polling intervals" table omits `useBalances`/`useXBalances` (both 5s), so the "Most others → None" catch-all understates their polling | skills `.../features/auxiliary-services.md`:243 | low |

## D. Follow-up (not urgent)

- Icon `getWalletBalances` hardcodes the `tryAggregate` multicall address `cxa4aa…bf741` inline
  (Icon:170). **Faithful to the wallet-sdk-react source** (`IconXService.ts:63` hardcodes the same),
  but worth promoting into the ICON chain config later.

## Refuted findings (recorded for honesty)

- "Solana re-implements ATA instead of reusing static helpers" — refuted: `getAssociatedTokenAddressSync`
  is the correct sync call; the service's static `getAssociatedTokenAddress` is async/different.
- "Bitcoin `getWalletBalances` throws on non-OK RPC (old 0n)" — refuted: not a genuine defect;
  `fetchUTXOs` behavior, covered by B-cluster policy anyway.
- "Native detection changed from symbol-based to address/config-based (Stellar/Near/Stacks)" — refuted:
  accurate but correct/better (`isNativeToken(chainId, token)` compares against config nativeToken).
- Injective / Hedera-scaling / result-keying — verified **equivalent** to the old path (a positive
  coverage note, no divergence).

## Decision

Per the issue owner: record findings only for now (no code change this pass). Candidate cleanup if
revisited: A1 (fan-out helper) + a chosen B-policy (resilient-per-token recommended) + C1.
