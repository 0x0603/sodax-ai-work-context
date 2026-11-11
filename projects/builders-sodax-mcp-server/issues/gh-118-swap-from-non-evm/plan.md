---
type: plan
repo: builders-sodax-mcp-server
github: 118
status: Active
updated: 2026-11-11
---

# Plan (implementation, 2026-11-11)

Changed from the issue body after reading the code and real txs; the issue gets updated to match.

## Quote
- `/intents` still gives the intent and relay data (#79 D2). Its `tx` is ignored for non-EVM sources.
- The intent is checked as for EVM (`findMismatch`); `srcAddress` against the SDK's encoding of the sender.
- The relay payload must equal the SDK's `createIntentPayload(intent)`.
- The swap tx the user signs is built here by the SDK (`sodax.spoke.deposit`, raw, skipSimulation), from that
  payload and the user's hub wallet. Nothing to decode: blockhash/sequence/fees make a byte compare impossible,
  and a local build is what the SDK's own clients do. Costs the build's RPC reads per ready quote.
- Stellar: `/allowance/check` false (trustline headroom) is refused, no changeTrust step.

## Track: evidence before submit (no hub check, no held quote)
Verified on real mainnet deposits (scan + archival reads):
- Solana: the tx message carries keccak256(payload) (relay needs the payload; mismatch = revert mode).
- Stellar: the envelope XDR carries the payload bytes.
- Sui: the tx BCS carries the payload bytes.
- NEAR: FunctionCall args `data` (native `transfer`) or `msg.data` (`ft_transfer_call`) equals the payload bytes.
- Injective: REST tx body `msg.transfer.data` equals the payload bytes.
Plus the tx succeeded. Readers: Soroban getTransaction (envelopeXdr is base64 here), Solana connection.getTransaction
(message.serialize()), Sui gRPC core.getTransaction({bcs, effects}) (NOT_FOUND RpcError), NEAR rpcProvider
viewTransactionStatus(waitUntil NONE, sender = quote's address; UnknownTransactionError), Injective REST
`/cosmos/tx/v1beta1/txs/{hash}` (SDK endpoints.rest). Public nodes prune: old txs come back not found.

## Cancel
SDK `createCancelIntent` raw from the source chain; confirmed by the cancel tx carrying the cancel payload (keccak on
Solana) and succeeding, then relayed (`data` for Solana only, per the backend DTO).

## Hashes
EVM lowercase 0x+64; Stellar 64 hex lowercase; Injective 64 hex uppercase (0x stripped); NEAR/Sui base58 32 bytes;
Solana base58 64 bytes. No lowercasing for base58.

## Review round (2026-11-11, two independent agents)

Applied:
- SDK calls typed (no `as never`): a renamed `deposit`/`createCancelIntent` param fails tsc.
- Parsers moved to spokeSource.ts (NEAR, Injective, Sui with zod); sodax.ts only reaches the SDK. Sui/Stellar
  shapes they don't know throw (retry), never read as "failed". Injective uses the public `endpoints.rest`.
- Hash rules and asset-manager markers are Records per family, so tsc forces a new family's entries.
- One chain per non-EVM family enforced in `pinnedSourceOf` (readers use the SDK's one service per family) + test.
- Non-EVM deposit match also needs the asset manager call; a deposit without the payload is `deposit_mismatch`
  (alerts), as EVM.
- A Solana/NEAR secret key (ed25519 seed + its public key, base58) as `txHash` is SECRET_REJECTED before any call
  (node:crypto check, no dep).
- NEAR: in-flight tx (stage only) is pending; failed only if the tx or its first call failed (no cross-receipt
  rollback, later failures are the relay's to judge); meta-transactions (Delegate) read.
- Build errors (swap and cancel) say what to check; Stellar trustline text only for Stellar; cancel nextStep carries
  the family's signing hint.
- Contract test: each family reader reads a well-formed unknown hash as not found (catches moved SDK clients).
- Verified backend `/intents/submit` forwards `data` to the relay (swaps.service.ts submitIntent).

Not done (residual, in the PR body):
- No multiple-deposit guard for non-EVM (needs decoding each family's messages).
- No sender check for non-EVM (payload carries the intent, the relay reads the chain).
- Injective authz MsgExec not read.

Ask the SDK team: `spoke.getDepositMessages(chainKey, txHash)` (or a one-read `spoke.getTransaction`) so the MCP can
drop its readers and get sender/multiple-deposit checks; export the relay's split-tx rule (`relayNeedsData` copies it).
