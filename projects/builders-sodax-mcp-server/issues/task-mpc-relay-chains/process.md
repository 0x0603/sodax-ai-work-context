---
type: process
repo: builders-sodax-mcp-server
github:
updated: 2026-11-25
tags: [mpc-relay, tron, hub-proof, backend, recovery]
related_issues: [gh-147, gh-118]
related_decisions: [0001-mpc-settlement-ownership-and-launch-gate]
---

# MPC integration verification — 2026-11-25

The user requested a final decision prioritizing safety and low maintenance. Research and context
edits only; no implementation, transfer, relay notification or external message was sent.

## SDK and backend ownership

SDK tag `@sdks@2.4.0-rc.1`, commit `684962d5faa9e5adfea39e9364de6caee3c4d25e`:

- `shared/services/spoke/TronSpokeService.ts:199-211,278-296`: raw deposits already validate hub
  wallet, memo, owner, reserve, token, amount and fee cap, then attach the memo.
- `shared/services/spoke/XrpSpokeService.ts:222-224,339-352`: raw mode skips the signer check;
  other modes require an account-owning ed25519 key for the current withdraw scheme. This is
  an XRP restriction, not a TRON restriction. Reusable raw-mode capability validation is needed.
- `TronSpokeService.ts:425-439`: notify retry is a timer inside the wait, cleared on exit.
- `swap/SwapService.ts:1114-1123,1155-1191`: MPC source bypasses backend submit-tx, settles through
  the SDK, then posts the hub transaction to the solver. `:1897-1902` refuses MPC-source cancel.
- `bridge/BridgeService.ts:197-202`: either MPC endpoint bypasses backend bridge submission.
- npm registry read-only check: `latest=2.3.0`, `rc=2.4.0-rc.1`. Availability is not readiness.

Backend `origin/development` fetched, still `dc00438a9c08785bed077c4be30d70020e7c79f2`.
A delegated read of the large backend/SDK routing files confirmed:

- `apps/swaps-api/src/shared/mpc-chain-gate.ts:5-14` and
  `packages/shared-nest-http/src/interceptors/mpc-chain-gate.interceptor.ts:40-53`: org gate,
  request refusal and catalog filtering, not MPC settlement.
- `apps/swaps-api/src/api/swaps/relay-swap-tx.ts:83-100` calls `sodax.swaps.submitIntent`;
  `relay-poll.ts:37-55` reads intent-relay packets. Worker call sites are
  `apps/swaps-api/src/tasks/submit-swap-txs/submit-swap-txs.task.ts:464-474`.
- `apps/bridge-api/src/api/bridge/relay-bridge-tx.ts:67-84` uses the same intent transport.
- Durable ownership already exists for that transport: swaps
  `submit-tx-db.service.ts:319-364` upserts by transaction/source chain, and
  `swaps.service.ts:314-319` persists then kicks the worker. Bridge
  `bridge.service.ts:282-304` follows the same pattern. Extend it instead of adding an MCP worker.
- SDK `SwapService.ts:2220-2224,2252-2256` describes solver notification of MPC destination fills
  and also provides SDK notification. Deployed solver behavior was not checked. TRON to Arbitrum
  does not require MPC destination-release handling.

## Real hub receipt

Addresses were resolved from the hub registry:

```sh
PYTHONPATH=tools .venv/bin/python -m onchain find 'sonic asset manager'
PYTHONPATH=tools .venv/bin/python -m onchain find 'sonic intents'
PYTHONPATH=tools .venv/bin/python -m onchain find TRX --tokens
```

Existing registry conflict C-01 concerns the scan's AssetManager copy. The selected registry
address matches SDK hub config and the observed mint's receiver.

Read Sonic RPC `eth_getLogs` on the registry TRX vault, filtering zero-address `Transfer` sender.
Recovered the full T1 hash from the earlier note:
`0x6124231a45d017051d84ebcceae119862d27bd0ba21631c7acdb815a5b5c6b41`.
Read transaction, receipt and historical `eth_call` at block `81962828`:

- Successful direct `recvMessage(uint256,bytes32,bytes,bytes)` to the hub AssetManager, source
  relay chain ID `728126428`. Calldata includes deposit ID hash and RLP transfer.
- RLP amount `10,000,000` source units (10 TRX, source decimals 6) matches raw mint log 0, to
  the RLP's hub wallet. Historical `assets(srcChainId, token)` matches the emitter and
  `processedDeposits(depositId)` is true. Those reads alone do not prove a swap.
- Hook transfers underlying into the vault (log 3), mints `10^19` share units (log 4), then sends
  shares to the recipient (log 5). Intermediate asset `decimals()` is 0: do not infer source
  units or expected vault shares from that field alone.
- No `IntentCreated`: this is a bridge mint, not a swap/USDT fixture. The earlier note contains
  only a truncated TRON hash, so source-hash-to-deposit-ID correlation was not recomputed.

## Deployed ABI mismatch

Read verified source at
[SonicScan](https://sonicscan.org/address/0xe2Cac39dC98b690e96AA0926eD48DbC8933b427B#code).
ERC-1967 implementation storage at T1's block and at latest matches that implementation. A private
source-file API read returned 404; it was not used as evidence.

- Verified `AssetManager` source lines 31,190-202,232-255 declares `HookFailed(address,string)`,
  replay-protected MPC receive, raw mint and caught hook failures.
- SDK `shared/abis/asset-manager.abi.ts:398-412` instead declares `HookFailed(address,bytes)`;
  its ABI also lacks the MPC receive overload. MCP `src/services/swap/sourceTx.ts:24-27` in
  `9ef5d54` uses the bytes event topic.
- Topics differ. Align the shared upstream ABI and add compatibility fixtures before reusing
  the failure detector. Positive evidence of the exact expected intent is required; absence of
  a failure log must never imply success.

## Final direction and limits

[ADR 0001](../../decisions/0001-mpc-settlement-ownership-and-launch-gate.md): SDK owns chain rules
and shared hub proof; backend owns durable progression; MCP binds the quote and exposes results.
Keep new MPC source deposits disabled until those contracts and supported recovery are ready.

The hub evidence question is substantially answered. Real USDT swap, canonical source/deposit
correlation, negative and recovery fixtures are still required. Backend MPC ownership is a required
change, not an existing API. Capability rules beyond the inspected TRON/XRP paths and the deployed
solver remain unverified. No end-to-end swap was executed in this pass.
