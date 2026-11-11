---
type: research
repo: builders-sodax-mcp-server
github: 118
status: Done 2026-11-11 (4 agents, SDK 2.2.0, sodax-backend c69b50be, intent-relay be15404)
updated: 2026-11-11
---

# Non-EVM swap sources: what each family needs

The user wants every chain as a source, in PR #117 with Sonic ("không nên làm từng họ, gộp chung với phần sonic").

## Shared
- `/intents` and `/intents/cancel` return the SDK's raw tx unchanged (swaps.service.ts:224-232, 394-405). Robi's #79
  D2/D3 route everything through the Swaps API; keep it as the builder and check its build.
- `submit-tx` never verifies the source tx; the relay gets `{chain_id, tx_hash}` and reads the chain itself, except
  Solana and Bitcoin ("split-tx": the backend sends `relayData`; relay-swap-tx.ts:36-69). Solana: a payload that doesn't
  hash to the on-chain keccak puts the relay in revert mode, funds reach the hub wallet with no intent. So track must
  check the on-chain hash against keccak(quote relayData).
- `submit-tx` rate limit: 10/60 s per IP unless the key's org has `rateLimitPerMinute` (then exempt, limited at the
  HAProxy edge per org). Every swap call carries the user's own key. track.ts's "10 a minute for this server's whole IP"
  comment is stale.
- SDK `verifyTxHash` checks success only (Solana even returns ok on failure/timeout); `waitForTransactionReceipt` polls.
  No SDK helper decodes any spoke's deposit message: one extractor per family returning a `ConnectionMessage`, then the
  existing RLP `[token, from, to, amount, data]` check (`checkDeposit`).
- MCP blockers: `pinnedSourceOf`/`sourceChainFor` (EVM only), `evmTxSchema` (quote, approve, cancel), `findMismatch` and
  `toSteps` (EVM calldata, EIP-5792 batch), the 0x+64 hex tx hash pattern, `relaySpokeTx` sends no `data` (Solana cancel
  needs it). Shared refactor ~2-3 days: per-family source type, tx union schema, step format, hash patterns, readers.

## Per family (effort is the agents' estimate)
| Family | Swap tx (raw) | Quote check | Deposit proof | Cancel | Days |
|---|---|---|---|---|---|
| NEAR | JSON FunctionCall (`transfer` or `ft_transfer_call`), deterministic | deep-equal vs SDK | connection `EVENT_JSON` in `receipts_outcome` (executor = connection, all receipts ok) | `send_message`, function-call key ok | ~4 |
| Stellar | base64 envelope XDR (sequence, fee from simulation) | decode XDR: one op vs `buildDepositCall`, source = sender, no fee bump, fee cap | Soroban `getTransaction` contract events `("Message",)` from connection, SUCCESS only | XDR `send_message`; SDK labels `to` wrong | ~6 |
| Stacks | `{payload: hex}` contract call, needs `srcPublicKey` | byte compare | Hiro `/extended/v1/tx` `smart_contract_log` of `connection-v3` (Clarity tuple) | broken in SDK 2.2.0 (passes SP address as public key): build locally | ~4-5 |
| Sui | V1 JSON of an unbuilt PTB; package id read live on chain | parse, only the expected commands | `connectionv3::Message` event (bcs); src_address encoding to confirm on a real tx | `send_message_ua` JSON | ~5-6 |
| Solana | base64 v0 tx, blockhash (60-90 s) | decode instructions: program, amount, to, keccak(payload) | Anchor `SendMessage` in `Program data:` logs of the connection's CPI frame; hash = keccak(relayData) | connection `send_message`; relay needs `data` | ~6-8 |
| Injective | direct-mode sign doc (protobuf, sequence and fee set) | decode protobuf: one msg, contract, funds, no memo/granter, fee cap | CometBFT `/tx` `wasm-Message` from connection | sign doc `send_message` | ~5-6 |
| ICON | JSON-RPC v3 call tx, timestamp fixed | field compare | `icx_getTransactionResult` eventLog `Message` from connection | `sendMessage`; decimal int param untested | ~3-4 (being wound down: skip?) |
| Bitcoin | TRADING mode only in raw: Bound builds a PSBT from a 2-of-2 wallet | decode outputs | asset manager output + OP_RETURN keccak | off-chain signed message; `/intents/cancel` lacks srcAddress | 8-12 + SDK/backend + Bound HMAC creds: not agent-ready |

Unknowns to settle on real mainnet txs: RLP token/from encoding on Stellar, NEAR, Sui; Sui `src_address`; Injective
`/intents` wire shape and relay hash spelling; ICON cancel param; Stellar RPC event/history support.
