---
type: issue
repo: builders-sodax-mcp-server
github: 118
status: Active
tags: []
updated: 2026-11-11
related_decisions: []
---

# GH-118 Swap From Non Evm

- Source: https://github.com/gosodax/builders-sodax-mcp-server/issues/118

Follows #115, which adds Sonic as a swap source. This adds the non-EVM families: NEAR, Stellar, Sui, Solana and Injective. One PR for all five.

Out of scope for now:
- Bitcoin: swaps run through a Bound trading wallet (a 2-of-2 that Bound co-signs and broadcasts, behind a login token that expires in minutes). An agent's wallet can't drive that.
- Stacks: the swap needs the sender's public key and post-conditions the wallet adds itself, and SDK 2.2.0 can't build a Stacks cancel (it passes the address where the public key goes).
- ICON: being retired.

What holds for every family (SDK 2.2.0, swaps-api, intent-relay):
- `/intents` and `/intents/cancel` return the SDK's raw tx for every chain. The Swaps API stays the builder (#79 D2/D3).
- `submit-tx` doesn't check the source tx. For every family here except Solana, the relay gets only the tx hash and reads the message from chain, so the funds always follow what the user signed. Solana is different: the relay takes the payload from the submit, and a payload that doesn't hash to the on-chain value sends the funds to the hub wallet with no intent.
- The SDK has no helper that decodes a spoke's deposit message, and `verifyTxHash` only checks success (for Solana it returns ok on a failed tx).

Proposed approach:
- Quote: check the Swaps API's build before the user signs, per family. This is the gate against signing the wrong thing, so it stays.
- Track, before the submit: the tx exists and succeeded. For Solana, also that the asset manager call carries keccak256 of the quoted relay data.
- Track, after the relay: prove the swap on the hub instead of decoding each source chain. The quote is held by the submitted tx until the backend reports the hub tx, whose `IntentCreated` must carry the quoted intent's hash (the hub check from #115). No match, or a failed row with no hub tx (an approve hash, say), releases the quote so the right hash can be submitted.
- EVM sources keep their current deposit check.

This differs from #79 D5, which opens other families once the backend checks source txs in `submit-tx`. The cost: confirming the right swap waits for the relay, and a wrong hash costs one `submit-tx` on the caller's key and leaves a failed row.

Shared work:
- A source type per family, and a step shape that carries the family's raw tx as the SDK returns it (EVM steps keep `to`, `data`, `value`, `chainId`).
- One tx hash rule: 1 to 127 characters, EVM lowercased. A bare 64 hex hash (Stellar, Injective) is only taken when the source chain uses that format, and isn't logged or sent anywhere before the chain confirms the tx.
- The held quote and the hub check after the relay.

Per family:

| Family | What the wallet signs | Quote check | Before submit |
|---|---|---|---|
| NEAR | JSON function call, deterministic | deep equal with the SDK's build | tx final, every receipt ok |
| Stellar | envelope XDR (sequence and fee set) | decode: one operation, the sender as source, no fee bump, fee cap | tx SUCCESS |
| Sui | unbuilt PTB JSON | only the expected commands | tx success |
| Solana | v0 tx, blockhash valid 60 to 90 s | decode the instructions: program, amount, recipient, keccak of the payload | no error, keccak of the relay data in the asset manager call |
| Injective | direct-mode sign doc | decode: one message, contract, funds, no memo or fee granter, fee cap | tx code 0 |

Cancel per family: the SDK's raw cancel through `/intents/cancel`, checked like the swap, then relayed. Track shows whether it took, as for EVM spokes today. Solana's relay also needs the cancel payload, which the MCP doesn't send yet, and the cancel tx must carry its keccak before it's relayed: a mismatch on a deposit tx would send the funds to the hub wallet.

Done when:
- Each family quotes on canary and its build passes the check.
- Track submits each family's deposit and confirms it on the hub; a wrong hash releases the quote.
- Cancel works for each family.
- The decoders are tested on recorded mainnet txs, and the README and tool descriptions list no chain by hand.

Open:
- Whether the hub's `IntentCreated` hash equals the quote's `intentHash` for a non-EVM source, as it does for Arbitrum and Base. Check on one real swap per family.
- The wire shape of Injective's `/intents` response.
- A swap with real funds per family needs a funded wallet on each chain.
