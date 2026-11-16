Closes #115. Refs #116.

Was stacked on #111 (both touch the swap records). #111 was squash-merged, so this branch is rebased onto `development`: only its own commits remain, and the one conflict (the `constants.js` imports, after #121's `RPC_CONFIG`) is resolved.

A swap can now start on Sonic, the hub. Until now `sodax_swap_quote` refused Sonic as the source while `sodax_check_chain_support` and `sodax_get_swap_tokens` listed it, and an agent using the server promised a user a swap the server then refused (#116).

Quote: Sonic is a source, with the intents contract from the SDK's packaged config. Nothing new to check: the Swaps API builds `createIntent` on the intents contract, the rebuild check already covered the hub, the approval goes to the intents contract, and the creator is the user's wallet router. A contract test quotes from Sonic on canary and passes the rebuild check.

Track: a swap from the hub has no `connection` log, so it is proven by the intents contract's `IntentCreated` log carrying the quoted intent's hash. Only then is it submitted, once; `submit-tx` takes a Sonic tx with no relay step. Another intent in the tx, two intents, or none: not submitted. The log names no sender, so another intent is reported as not this quote's swap, and a hub swap pages no operator: an unsubmitted hub intent is refunded once it expires. Track and cancel tell the user so (unless a solver fills it first) instead of sending them to SODAX support. Past the deadline nothing is relayed: track reports `expired_awaiting_refund` (spoke deposits this server relays for refund keep `expired_refunding`), and a refusal near the deadline waits for it. Without a quote it is reported, not submitted.

Cancel: the SDK builds it, and it must be exactly the packaged wallet router running `cancelIntent(intent)` from the intent's sender, with no value. The second call confirms it by the intents contract's `IntentCancelled` for the intent's hash, and reports `cancel_confirmed`; nothing is relayed. A quoted swap from Sonic is an intent on the hub as soon as its tx is mined, so cancel builds its cancel from the quote's intent right away, before or after the deadline, without waiting for the swap service to have a record. Once the cancel is confirmed, track reports the swap cancelled instead of submitting it, and a second cancel says it's already cancelled. For a Sonic tx with no quote and no record, cancel no longer says it was never submitted: its intent is on the hub already and is refunded once it expires, unless a solver fills it first.

The event topics are constants, checked against the SDK's intents ABI, as `MESSAGE_TOPIC` is, and a contract test reads the `IntentCreated` log of real hub txs and finds the SDK's hash of the intent the Swaps API reports for them. Another reads a real wallet's own `createIntent` on Sonic: the logged hash is of the intent in its calldata. `isSwapSource`, the quote and the chain support tool share one check of where a swap can start, so a misspelled source chain lists Sonic too.

Fewer RPC reads for a tx with no receipt yet (an agent tracked a made-up hash 30 times, two reads per poll, four polls a call):
- whether a node has seen it is remembered for 10 seconds per API key, chain and hash: while it's remembered unseen, track reads neither the chain nor the backend's status again, and a seen one is read only for its receipt. Only while the answer is to wait: a final answer reads the chain again.
- a tx no node has seen, with its quote, gets `pollUntil` (15 minutes after the first call, about as long as 30 polls) and `stopAfter` (the deadline plus the 5 minutes a late tx gets). The agent polls until `pollUntil`, then asks the user whether their wallet sent it instead of polling; only past `stopAfter` is it `source_not_found`, so a wallet that broadcasts late isn't told to quote again. A deposit this server already checked gets neither, and reports `seenOnChain: true`: a missing receipt there is a lagging node.
- track still waits within a call, since a tx just sent may not have reached this server's node yet.

Also from #116:
- `sodax_check_chain_support` says whether this server's swap tools can start a swap on the chain, asking the live catalog as the quote does, or that they're turned off on this server.
- The quote's nextStep says to track even after the quote expires, since track is what submits the swap or, from a spoke, starts its refund (from Sonic the canceller refunds it).
- `UNSUPPORTED_SOURCE` now names Sonic as a source.

Swaps from the non-EVM chains (NEAR, Stellar, Sui, Solana, Injective) are #118, after this merges. The README now says Bitcoin, Stacks and ICON aren't planned as sources, and why. The track comments on the `submit-tx` limit are corrected: it's per IP unless the key's org has its own limit.

The other #116 items stay open there. `sodax_get_swap_tokens` taking a chain name and `format: json` returning only JSON are builder-wide (every builder tool prefixes its JSON with a markdown header), so they get their own PR.

Tested: `checkTs`, lint, build, unit tests (1050; the new ones in `swapHub.test.ts`, `swapTrack.test.ts`, `sourceTx.test.ts` and `source.test.ts` fail on the previous code, the memo and stop-time ones checked by removing each change). Contract tests on canary: 29/29, including the Sonic quote, the hub `IntentCreated` logs and the wallet's own `createIntent`. Simplify (4 agents) and a high-effort code review ran before the second commit, whose fixes it holds. A review of this branch with #118 found the wording above; its fixes and tests (cancel without a quote from Sonic, the router cancel's sender) are in the third commit.

Retested on the last commit: 1051 unit tests (1099 after the rebase onto `development`), contract 29/29 on canary, and the Docker image on canary over HTTP the way an agent calls it (27 scenarios: quotes from Sonic for USDC, native S and hub to hub, track and cancel of real Sonic `createIntent` txs with and without a quote, a fill tx, an unknown hash, a quote for another source chain, a seed phrase as `txHash`). Real Sonic swaps from mainnet are matched to their intents by the `IntentCreated` check (4 of 4). The canary E2E dry run passes against the image. A live swap from Sonic wasn't run: the test wallet holds no S there.

Last commit: chain support no longer says a swap can start while `SODAX_SWAP_TOOLS_ENABLED` turns the swap tools off, and the README says to track a swap even after `expiresAt`. On it: 1099 unit tests, contract 29/29 on canary, the 27 Docker scenarios, and a server started with the swap tools off answers that they're off.

Last commit, from a review of this PR: the early cancel above, and `expired_awaiting_refund` for an expired Sonic swap, whose nextStep says the user can cancel it to get the funds back sooner. On it: 1101 unit tests (the new ones in `swapHub.test.ts`: cancel from the quote before and after the deadline, a cancel tx for another intent, track and a second cancel after the cancel), `checkTs`, lint, contract 29/29 on canary. The Docker scenarios weren't rerun on it.

Latest commit, from a second review: nothing assumes a hub intent is still open without reading the hub.
- A cancel is built only while the intents contract still holds the intent (`intentStates`, which it deletes on a full fill or a cancel, the canceller's refund included), so it no longer offers a cancel that reverts and then another. The read is made at a block no older than the tx that created the intent, so a node a block behind can't pass for a closed intent; a failed read keeps the old behaviour.
- Track reads it too before submitting a Sonic swap and when reporting one expired. A hub swap filled or cancelled elsewhere is `intent_closed`.
- A confirmed hub cancel is remembered over a lagging backend row, and the user's own cancel is still confirmed after track found the intent closed. A quoted Sonic swap is cancelled from its quote whatever the row says, unless the row has ended it.
- A tx that isn't the quote's swap (an approval, say) gets `not_this_swap`, from any source chain.
- `quote_used` no longer pages for a hub swap. A full quote cache evicts, in order, unused quotes, ended swaps, then hub swaps waiting for their refund.

On it: `checkTs`, lint, 1124 unit tests. Contract tests on canary: 30 of 31. The miss was the HBAR quote while Hedera's public RPC timed out (a bare `eth_blockNumber` timed out too); it passed on a later run. A new contract test reads `intentStates` for real hub intents: held at their own block, gone once solved. The Docker scenarios weren't rerun.

