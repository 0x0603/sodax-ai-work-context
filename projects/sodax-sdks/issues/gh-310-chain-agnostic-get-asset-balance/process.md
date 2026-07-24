---
type: process
repo: sodax-sdks
github: 310
updated: 2026-07-24
---

# Process

## Log

- Explored the balance surface with 3 parallel readers: core SDK balance logic, wallet-sdk `xBalance`
  + demo usage, dapp-kit hook patterns. No existing PR/branch for #310; fresh task.
- Confirmed the key files are identical between `origin/main` and the current `feat/bridge-api-package`
  checkout, so branched the feature from `main` (`feat/chain-agnostic-get-asset-balance`).
- Implemented SDK layer: types + router + EVM + Sonic by hand (established the SDK pattern), then
  fanned out the 5 clean non-EVM chains (Sui, ICON, Injective, Near, Stacks) to a Workflow, and did
  Stellar + Bitcoin by hand (they had name collisions — see below).
- Added SDK tests (EVM native/erc20/multicall + Hedera scale, Bitcoin native/non-native, router
  dispatch + Result wrapping), dapp-kit `useBalances` + test, migrated the 9 demo call-sites (Workflow),
  updated skills docs (subagent, `check:ai` green).

## Findings

### The "xBalance thing"
- `IXServiceBase` (`@sodax/types` `wallet/wallet.ts`) declares `getBalance`/`getBalances`.
- Base `XService` (`wallet-sdk-react/src/core/XService.ts`) + per-chain `xchains/<chain>/*XService.ts`
  do the actual RPC. Demo uses `useXService({ xChainType })` → `useXBalances({ params: { xService, ... }})`
  → `xService.getBalances`.
- The core SDK's only balance concept was `SpokeService.getDeposit` (asset-manager holding), NOT the
  user's wallet balance. `sodax.spoke` is already `public readonly` (`Sodax.ts:42`), so the new methods
  are exported automatically.

### Naming pivot: `getBalance` -> `getWalletBalance` (IMPORTANT)
The plan proposed `getBalance`/`getBalances`, but two spoke services already have a public, TESTED
`getBalance`:
- `StellarSpokeService.getBalance(GetDepositParams): Promise<number>` (asset-manager deposit read).
- `BitcoinSpokeService.getBalance(tokenAddress, walletAddress): Promise<bigint>` (native BTC; throws for tokens).

Renaming those existing methods would be a breaking change and would touch their existing tests. So the
NEW user-wallet reader is named **`getWalletBalance` / `getWalletBalances`** everywhere (router + all 10
chains). This is non-breaking, avoids all collisions (incl. Solana's `static getBalance`), and is more
precise: "wallet balance" (user holdings) vs "deposit" (asset-manager). Public API is
`sodax.spoke.getWalletBalances(...)`. Had to stop + restart the first non-EVM workflow after realizing
this, reverting the 5 chain files it touched and renaming the hand-written EVM/Sonic/Solana methods.

### Per-chain implementation map (SDK target <- xService source; client reused; quirks)
| Chain | SDK client reused | Native | Token | Notes |
|---|---|---|---|---|
| EVM | `getPublicClient` (viem) | `getBalance` | erc20 `balanceOf` | multicall3 batch; Hedera down-scale 10^10 |
| Sonic (hub) | `this.publicClient` | `getBalance` | erc20 `balanceOf` | EVM-family; multicall3 |
| Solana | `this.connection` | static `getBalance` | ATA over TOKEN + TOKEN_2022 (`getMultipleAccountsInfo`+`unpackAccount`) | fan-out plural |
| Sui | `this.publicClient` | `0x2::sui::SUI` | `client.getBalance({owner,coinType})` | legacy bnUSD coinType remap ported |
| Stellar | `this.server` (Horizon) / `this.sorobanServer` | XLM min-reserve math | Soroban token contract `balance` | discriminated-union narrowing (no cast) |
| ICON | `this.iconService` | `getBalance` | aggregate `tryAggregate` multicall (`cxa4aa..bf741`, hardcoded in xService too) | requireSuccess=0 → 0n on fail |
| Injective | `indexerGrpcAccountPortfolioApi` (new field, same endpoints) | `bankBalancesList` by denom | same | single portfolio fetch for plural (optimized vs xService fan-out) |
| Near | `this.rpcProvider` | `viewAccount().amount` | `ft_balance_of` | fan-out plural |
| Stacks | network/api config | `getSTXBalance` | `readTokenBalance` (SIP-010) | errors swallowed → 0n |
| Bitcoin | `fetchUTXOs` | UTXO sum | 0n (no supported token standard) | matches replaced xService behavior |

`isNativeToken(srcChainKey, token)` (two-arg, `@sodax/types`) — NOT the single-arg wallet-sdk-react one.

### Verification
- `biome check` (lint+format) is NOT the repo gate; the repo runs `biome lint`/`biome format` separately
  (both `--write`). `origin/main` already fails `biome check` on some files and carries the same lint
  WARNINGS. My changes add **0 new lint errors** — verified by diffing lint output against an
  `origin/main` worktree. Format-clean on my files.

## Changes During Work

- Method naming `getBalance` -> `getWalletBalance` / `getWalletBalances` (vs the plan). Reason above.
- Injective `getWalletBalances` optimized to a single portfolio fetch (the xService fanned out).
- Added a `SpokeService.test.ts` (router-level test) that didn't exist before.
- Tooling: used Workflow twice (5 non-EVM chains; 9 demo migrations) + a subagent for skills docs.

## Multi-agent notes (self-review of delegated work)

Reviewed every delegated diff by hand. Confirmed: ICON's hardcoded multicall address is FAITHFUL to
`IconXService.ts:63` (not invented). Injective correctly needed a new indexer client (WASM api can't read
bank balances). Sui bnUSD remap ported verbatim. Near/Stacks reuse the spoke services' own helpers.
- 2026-07-24 (machine 2): opened PR #311 from the pushed branch (base main, `Closes #310`); body from
  the commit message. Vercel preview deployed. Issue/PR had no human follow-up on GitHub; the real
  follow-up lived in this repo (outcome.md + review.md), pulled in via HTTPS fetch because SSH auth
  (publickey) fails on this machine — the SessionStart sync hook could not pull/push here.
