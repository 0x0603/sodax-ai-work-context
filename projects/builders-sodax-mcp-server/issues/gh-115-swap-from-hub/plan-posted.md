Plan

Branch `feat/115-swap-from-hub`, stacked on #111 because both touch the swap records. The PR targets `feat/110-unified-logging` until #111 merges.

Source (`src/services/swap/source.ts`)
- `SourceChain` becomes `{ chainId, swapContract, connection? }`, since the hub has no `connection`.
- `sourceChainFor` accepts Sonic, with the intents contract from the SDK's packaged config. `swapContractFor` already returns it.

Quote (`quote.ts`): no new check. These already cover the hub:
- the rebuild;
- the creator, the user's wallet router from `userHubWallet`;
- the approval to the intents contract;
- the native value.

Sonic's live config has no asset manager, so the live-contract check passes as before.

Track (`track.ts`, `sourceTx.ts`)
- A swap from the hub is proven by a log from the intents contract with the `IntentCreated` topic and the quoted intent's hash as its first data word. The topic is a constant, checked against the SDK's ABI in a test, as `MESSAGE_TOPIC` is.
- With a quote:
  - A match calls `submit-tx` once. `hub_tx.hash` is the tx itself.
  - An `IntentCreated` for another intent counts as a mismatch and is alerted, like a deposit for another quote.
  - No `IntentCreated` means it isn't a swap tx.
- Without a quote: reported, not submitted, as for a spoke deposit.
- Past the deadline: neither submitted nor relayed. The result says the hub intent is refunded once it expires.

Cancel (`cancel.ts`)
- First call: the SDK's raw cancel from Sonic, which is the user's wallet router running `cancelIntent`. It must call the packaged `walletRouter` with no value, and the packaged router must agree with the live config.
- Second call, with `cancelTxHash`: the receipt must hold `IntentCancelled` for the intent's hash from the intents contract. Then `cancel_confirmed`, with no relay.

Tests
- Unit tests for each branch: match, another intent, not a swap, expired, cancel built and confirmed, wrong router.
- The topic constants.
- A contract test quoting from Sonic on canary.

Docs
- README's swapping section.
- Tool descriptions and instructions where they say "EVM spoke".
- The Builders MCP pages in the open sodax-sdks docs PR, and the partner skill.

Also in this PR, from #116:
- `sodax_check_chain_support` says whether the swap tools can start a swap on that chain.
- `sodax_get_swap_tokens` takes a chain name.
- `format: json` returns JSON only.
- The quote's nextStep no longer says track must happen before expiry.
