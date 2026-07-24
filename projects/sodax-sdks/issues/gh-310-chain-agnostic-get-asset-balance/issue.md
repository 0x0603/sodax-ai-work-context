---
type: issue
repo: sodax-sdks
github: 310
status: Active
tags: [balance, dapp-kit, spoke-service, chain-agnostic, sdk]
updated: 2026-07-24
related_decisions: []
---

# GH-310 Chain Agnostic Get Asset Balance

- Source: https://github.com/icon-project/sodax-sdks/issues/310
- Started: 2026-07-24
- Related PR: https://github.com/icon-project/sodax-sdks/pull/311 (branch `feat/chain-agnostic-get-asset-balance`)
- Author: R0bi7 · Assignee: 0x0603 · Labels: enhancement · Milestone: New World (In progress)

## Problem

Implement a general get balance/asset method so dapps have an easier time querying native or
general token-standard per-chain balances (e.g. EVM -> erc20, etc.).

Verbatim issue body:

> Implement general get balance/asset method so that dapps have easier time querying native or
> general token standard per chain balances (e.g. EVM -> erc20, etc..).
>
> Core SDK contains logic
> Dapp-kit wraps provides hook
> demo update to not use wallet sdk xbalance thing anymore, but the sdk balance util through dapp-kit

## Context

Before this change, reading a user's **wallet balance** (native coin or a token standard such as
EVM erc20 / Solana SPL) forced the app through the wallet layer:

`useXService({ xChainType })` (`@sodax/wallet-sdk-react`) → feed the resulting `xService` into
`useXBalances({ params: { xService, xChainId, xTokens, address } })` (`@sodax/dapp-kit`) →
`xService.getBalances(address, xTokens)`.

All per-chain balance-read logic lived in `wallet-sdk-react` (`XService` + `src/xchains/*`), tightly
coupled to the React wallet-state layer. The core `@sodax/sdk` had **no** chain-agnostic wallet-balance
reader — only `SpokeService.getDeposit`, which reads the protocol asset-manager holding, not the user's
wallet. Reading a balance is a pure RPC read (no signer), and the SDK spoke services already own read
clients (they back `getDeposit`), so the reader belongs in the core SDK.

## Acceptance Criteria

- Core SDK exposes a chain-agnostic user-wallet balance reader (all chain families xService supports).
- dapp-kit provides a hook wrapping that SDK util (no wallet `xService`).
- demo stops using the wallet-SDK balance path and reads through the new dapp-kit hook.

## Related

- Knowledge:
- Decisions: naming pivot `getBalance` -> `getWalletBalance` (see process.md); scope decisions in plan.md
