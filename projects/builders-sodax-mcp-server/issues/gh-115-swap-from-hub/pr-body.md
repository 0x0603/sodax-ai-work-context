---
type: draft
repo: builders-sodax-mcp-server
github: 115
status: Posted as the PR for #115
updated: 2026-11-11
---

Closes #115. Refs #116.

Stacked on #111 (both touch the swap records); this PR targets `feat/110-unified-logging` until #111 merges.

A swap can now start on Sonic, the hub. Until now `sodax_swap_quote` refused Sonic as the source while `sodax_check_chain_support` and `sodax_get_swap_tokens` listed it, and an agent using the server promised a user a swap the server then refused (#116).

Quote: Sonic is a source, with the intents contract from the SDK's packaged config. Nothing new to check: the Swaps API builds `createIntent` on the intents contract, the rebuild check already covered the hub, the approval goes to the intents contract, and the creator is the user's wallet router. A contract test quotes from Sonic on canary and passes the rebuild check.

Track: a swap from the hub has no `connection` log, so it is proven by the intents contract's `IntentCreated` log carrying the quoted intent's hash. Only then is it submitted, once; `submit-tx` takes a Sonic tx with no relay step. Another intent in the tx, two intents, or none: not submitted. The log names no sender, so another intent is reported as not this quote's swap, and a hub swap pages no operator: an unsubmitted hub intent is refunded once it expires. Past the deadline nothing is relayed, and a refusal near the deadline waits for it. Without a quote it is reported, not submitted.

Cancel: the SDK builds it, and it must be exactly the packaged wallet router running `cancelIntent(intent)` from the intent's sender, with no value. The second call confirms it by the intents contract's `IntentCancelled` for the intent's hash, and reports `cancel_confirmed`; nothing is relayed.

The event topics are constants, checked against the SDK's intents ABI, as `MESSAGE_TOPIC` is, and a contract test reads the `IntentCreated` log of real hub txs and finds the SDK's hash of the intent the Swaps API reports for them. `isSwapSource`, the quote and the chain support tool share one check of where a swap can start, so a misspelled source chain lists Sonic too.

Fewer RPC reads for a tx with no receipt yet (an agent tracked a made-up hash 30 times, two reads per poll, four polls a call):
- whether a node has seen it is remembered for 10 seconds per chain and hash, whoever tracks it: an unseen tx isn't read again in that time, a seen one only for its receipt. Only while the answer is to wait: a final answer reads the chain again.
- a tx no node has seen, with its quote, gets `stopAfter` (the deadline plus the 5 minutes a late tx gets), and the nextStep says to track until then rather than 30 times. A deposit this server already checked gets none: a missing receipt there is a lagging node.
- track still waits within a call, since a tx just sent may not have reached this server's node yet.

Also from #116:
- `sodax_check_chain_support` says whether this server's swap tools can start a swap on the chain.
- The quote's nextStep says to track even after the quote expires, since track is what submits the swap or starts its refund.
- `UNSUPPORTED_SOURCE` now names Sonic as a source.

Follow-up, not here: a hub swap's intent exists once its tx is mined, so it could be cancelled before the backend has a row for it; cancel still waits for that row.

The other #116 items stay open there. `sodax_get_swap_tokens` taking a chain name and `format: json` returning only JSON are builder-wide (every builder tool prefixes its JSON with a markdown header), so they get their own PR.

Tested: `checkTs`, lint, build, unit tests (1046; the new ones in `swapHub.test.ts`, `swapTrack.test.ts`, `sourceTx.test.ts` and `source.test.ts` fail on the previous code, the memo and stop-time ones checked by removing each change). Contract tests on canary: 22/22, including the Sonic quote and the hub `IntentCreated` logs. Simplify (4 agents) and a high-effort code review ran before this push; their fixes are in the second commit.
