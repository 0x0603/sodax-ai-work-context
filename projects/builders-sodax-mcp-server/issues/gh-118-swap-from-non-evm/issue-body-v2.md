Follows #115, which adds Sonic as a swap source. This adds the non-EVM families: NEAR, Stellar, Sui, Solana and Injective. One PR for all five.

Out of scope for now:
- Bitcoin: swaps run through a Bound trading wallet (a 2-of-2 that Bound co-signs and broadcasts, behind a login token that expires in minutes). An agent's wallet can't drive that.
- Stacks: the swap needs the sender's public key and post-conditions the wallet adds itself, and SDK 2.2.0 can't build a Stacks cancel (it passes the address where the public key goes).
- ICON: being retired.

What holds for every family (SDK 2.2.0, swaps-api, intent-relay):
- `/intents` and `/intents/cancel` return the SDK's raw tx for every chain.
- `submit-tx` doesn't check the source tx. For every family here except Solana, the relay gets only the tx hash and reads the deposit from chain. Solana's tx commits only the keccak of the payload: the relay takes the payload from the submit and checks it against that hash, and a mismatch sends the funds to the hub wallet with no intent.
- The SDK has no helper that decodes a spoke's deposit, and `verifyTxHash` only checks success (for Solana it returns ok on a failed tx).

Approach (as built):
- Quote: the Swaps API still gives the intent and relay data (#79 D2), checked as for EVM: the sender as the SDK encodes it, and the relay payload equal to the SDK's `createIntentPayload(intent)`. The swap tx is then built by the SDK in the server (`sodax.spoke.deposit`, raw) from that checked intent. The Swaps API's own tx isn't used: blockhash, sequence and fees make it differ from any rebuild, so it can't be compared byte for byte. The step is the SDK's raw tx as JSON.
- Track: a tx is submitted only once it ran, calls the chain's asset manager and carries the quote's relay payload (from Solana, its keccak). Checked on a real mainnet deposit of each family. A deposit without this quote's payload is another quote's (`deposit_mismatch`, alerted).
- Refund and cancel relays from Solana send the relay data with the tx; the backend passes it to the relay.
- Cancel: the SDK builds it from the hub intent; it's relayed once its tx carries the intent's cancel payload.
- Tx hashes go as the wallet shows them: base58 kept as is, Stellar's hex lowercase, Injective's uppercase. A Solana or NEAR secret key passed as a hash is refused before any call.
- EVM sources keep their deposit check.

Per family, the server only needs a tx reader and its hash format; building, the steps and the payload check go through the SDK or are family-blind.

| Family | What the wallet signs (SDK raw) | Where the payload is in the sent tx |
|---|---|---|
| NEAR | function call (`signerId`, `params`) | `data` in the call's args (`msg` for `ft_transfer_call`) |
| Stellar | envelope XDR | the envelope's bytes |
| Sui | transaction JSON | the transaction BCS |
| Solana | v0 transaction (base64), blockhash valid about a minute | its keccak, in the instruction |
| Injective | direct-mode sign doc | `data` in the contract call |

Done when:
- Each family's tx reader and payload check pass on recorded mainnet deposits, and the readers read an unknown hash as not found on live nodes.
- A swap from Solana quotes on canary, and the SDK builds each family's swap on mainnet.
- Track, refund and cancel are tested per path, with Solana's relay data.

Not covered:
- A non-EVM tx holding two deposits isn't detected, and the sender isn't checked: the payload carries the intent, and the relay reads the chain.
- No real-funds E2E per family: it needs a funded wallet on each chain.

Would help, from the SDK: a `spoke.getDepositMessages(chainKey, txHash)` (or a one-read `getTransaction`), so the server can drop its readers and check the sender too.
