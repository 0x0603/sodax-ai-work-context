---
type: plan
repo: sodax-sdks
github: 534
tags: [tron, mpc-relay, settle, review]
updated: 2026-10-27
---

# PR 534 fixes · plan

User asked (2026-10-27): fix the found issues on #534, verify first, plan, then implement. Base: the
merge `c678c649` on `feat/tron-mpc-integration` (worktree `sodax/sodax-sdks-pr534-docs`). Every item
below was re-read at that head; "verified" cites the code. Commit/push only when the user says so.

## Fix now (verified, no outside input needed)

| # | Issue (source) | Verified at | Fix |
|---|---|---|---|
| A1 | DEX withdraw pays Tron the bare identity (robi 1, C2) | `AssetService.ts:405` | `encodeRecipient` |
| A2 | Partner auto-swap stores bare identity (1.2); `outputToken: Address` blocks base58 (C1) | `PartnerFeeClaimService.ts:379`, type :56 | `encodeRecipient`; `outputToken: OriginalAssetAddress`, hub dst still `isAddress` |
| A3 | Node harness borrow/withdraw use `tronIdentityBytes` (robi 4, 1.3) | `apps/node/src/tron.ts:122-123` | `encodeRecipient` |
| B1 | DEX deposit/withdraw wait on the intent relay for Tron (robi 2) | `AssetService.ts:502`, `:543` | MPC source → `spoke.settle` (inbound / outbound: default withdraw releases on Tron); other chains unchanged |
| B2 | CL supply/increase/decrease/claim from Tron (robi 2) | `ConcentratedLiquidityService.ts` execute*; all pay the hub wallet | refuse MPC sources before signing (no release, `settle` would hang) |
| B3 | LY positions + vault swaps from Tron (robi 2, C3) | `:4124` `settleHubWalletMessage`, `:1789` fallback | refuse MPC sources at entry AND exit (builders, `createVaultIntent`, position open/operate), like main's Bitcoin refusal. Refusing only exits (old C3) left a one-way door: deposit/open allowed, withdraw/operate refused |
| B4 | `cancelIntent` from Tron (robi 2, 2.4) | `SwapService.ts` cancel relays via intent relay; refund goes to `intent.srcAddress` (20-byte identity, 1.4) | refuse MPC sources in `createCancelIntent` until 1.4 is answered |
| B5 | Backend submit-tx gets Tron txs; backend has no MPC code (2.5) | `SwapService.ts:1089`, `BridgeService.ts:838`; backend `origin/main` 3f838948 has no MPC/Tron | skip backend for MPC sources |
| C1 | Bridge detailed status never reads the MPC deposit record (robi 3) | `BridgeService.ts:1327` | new arm `{ source: 'mpcRelay', data: DepositRecord }` via a shared minted-deposit helper in `detailedStatusRouting.ts` (swap reuses it) |
| D1 | `settle` reports the source id as the far-side hash (robi 5, 2.3) | `SpokeService.ts:1356/:1364`; `waitForDeposit` accepts minted/swept without `hubMint` | `waitForDeposit`/`waitForWithdrawal` resolve only with the far-side hash; `settle` returns an error instead of `?? tx` |
| D2 | MPC wait timeouts map to `RELAY_FAILED`/`UNKNOWN` | `relay-error-mapping.ts:58` matches `RELAY_TIMEOUT` by message | MPC timeouts use `RELAY_ERROR_CODES.RELAY_TIMEOUT` (detail in `cause`) |
| E1 | `getDeposit` parses a failed/reverted TRC-20 read as a balance | `TronSpokeService.ts:340-348` | require `result.result === true` + a 64-hex word |
| E2 | `estimateGas` reports 0 energy on a failed simulation; sequential calls | `:396-404`, `:383-388` | throw unless a clean result; `Promise.all` |
| E3 | `sendMessage` signs an unchecked `dstAddress` | `:421` | `isAddress` before signing |
| E4 | wallet-sdk-react `tronToHex` accepts bad base58 (`indexOf` -1); balance parses any word | `TronXService.ts:10-15`, `:67-69` | strict base58check like the SDK's `tronBase58ToHex`; guard the read; tests |
| E5 | `TronWalletProvider.getBalance` swallows every error to `0n` | `TronWalletProvider.ts:160-168` | let errors propagate (Solana provider does) |
| E6 | `types.ts` says injected `tronWeb` is reads-only; `signer()` signs with it | `types.ts:40`, `TronWalletProvider.ts:101-105` | fix the comment |
| E7 | TRX listed for money market, but sodaTRX is no hub MM reserve | `moneyMarket.ts:264-267`; on-chain `getReservesList()` on `0x5534…514E`: sodaTRX absent, Tron USDT vault present | drop TRX from `moneyMarketSupportedTokens[TRON]` |
| E8 | Comments: `RelayChainIdMap` Tron entry "only to keep the map total" (false: hub-wallet derivation `EvmHubProvider.ts:89`); `MpcRelayChainConfig` names nonexistent `isMpcRelayChainConfig`, "no hardcoded list" (routing is `MpcRelayChainMap`); `settle` JSDoc stacked on private `getMpcRelayService` | `chains.ts:60-62`, `:685-687`; `SpokeService.ts` | rewrite to 1–2 true lines; move the JSDoc |

Docs with the code: BRIDGE.md (status arm, backend skip), SWAPS.md (cancel, backend skip), LEVERAGE_YIELD.md
(MPC refused), changeset (MM tokens, refusals, encodeRecipient users), skills Tron row + bridge feature,
wallet-sdk-core tron feature (getBalance). Then `docs:sync-pages` and all gates.

## Not fixing (needs an owner's answer; say so in the report)

- 1.4/1.4b Tron-sourced intent `srcAddress` / position `originAddress` are 20-byte identities: refunds
  and surpluses may pay a dead address. Changing them may break solver identity matching.
- 2.1 hub → Tron legs and 2.2 Tron-sourced borrow/withdraw to another chain: the relay's state for a
  no-release message is unknown; the MPC relay source is not available.
- 4.5 re-notify past `pending`; reserve/memo/unchecked-RPC-bytes trust items (AuditMap route, not public).
- React Tron `signMessage` (feature gap), `Buffer` in the raw-key path (Node-only path).

## Order

wallet packages (E4–E6) delegated to one agent (disjoint files); SDK + types by me: A, B, C, D, E1–E3,
E7, E8; then tests per item (each must fail on the old code), docs, sync, full gates.
