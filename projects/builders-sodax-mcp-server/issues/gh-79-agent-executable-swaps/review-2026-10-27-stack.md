---
type: review
repo: builders-sodax-mcp-server
github: 79
related_issues: [81, 82, 83, 84, 85, 86, 87, 88]
tags: [mcp, swaps-api, review, security]
updated: 2026-10-27
---

# Stack review, PR #91–#98 (2026-10-27)

One reviewer agent per PR on its own increment (security, correctness in every case, approach, reuse, tests), plus
one agent playing a swap agent against a local canary server built from `feat/88-e2e-canary` @ `6775283`
(placeholder key, `0x…dEaD`, nothing signed). Findings marked **(v)** were re-checked against the code by hand.
"Top" = still present at `feat/88-e2e-canary` unless noted. Nothing is fixed yet.

## Must fix

1. **(v) Pre-existing, production: one `GET /sse` kills the server.** `src/index.ts` (top :313-314; also
   `master` :294 and `development` :326) calls `sseServer.connect(transport)` then `transport.start()`. SDK 1.26.0's
   `connect()` already starts it, so the second start throws "already started"; express 4.22.1 doesn't catch async
   rejections, `unhandledRejection` → `fatalExit` → exit 1. Unauthenticated. Fix: drop `await transport.start()`, add
   an HTTP-level SSE test. Separate small PR off `development`, then release to `master`. Security-sensitive: keep
   the PR text neutral; baseline says security findings go through AuditMap.
2. **(v) #94: the intent's `srcChain` / `dstChain` are never checked.** `quote.ts` `findMismatch` (top :267-307).
   The rebuild re-encodes the API's intent, so a wrong `dstChain` (where the output is delivered) passes and the
   quote is `ready`. Fix: compare with `getIntentRelayChainId(srcChainKey|dstChainKey)` (SDK export, runtime check:
   Arbitrum 23n, Sonic 146n).
3. **(v) #95: the cancel payload the user's hub wallet runs is not rebuilt.** `cancel.ts` `buildCheckedCancel`
   checks from/to/value/dstChainId/dstAddress, returns `message.payload` as is; `holdsCancel` compares against that
   same payload. A broken or compromised API can hand the user a "cancel" that runs other calls on their hub wallet.
   Fix: rebuild via the SDK (`encodeContractCalls([EvmSolverService.encodeCancelIntent(intent, intentsContract)])`)
   behind a `sodax.ts` wrapper, require equality; with a cached quote compare every intent field, not only `intentId`.
4. **(v) #96: an unfunded Stellar account reads as `CHAIN_UNAVAILABLE`.** `sodax.ts` `MISSING_ACCOUNT_ERRORS` matches
   `error.name`; stellar-sdk 15.1.0's `NotFoundError` has `name === "Error"` (checked at runtime). NEAR works. The
   unit test mocks the wrapper on Arbitrum. Fix: Stellar → `error.response?.status === 404` (as the SDK's
   `isHorizonNotFound`), scope each check to its chain family, live contract test with a random G address.
5. **(v) #98: a send error with a JSON-RPC body is taken as "the node refused".** viem 2.57.4 `utils/rpc/http.ts`
   returns a non-2xx JSON-RPC error body into the RPC error path, so a gateway 5xx and `-32000 already known` become
   `RpcRequestError`. The swap may have landed, is never tracked, and the README tells the operator nothing was taken.
   Fix: on any swap send error, look the hash up (`getTransaction`, a few tries over ~30 s); track if found, fail at
   `send` only if not; README `send` text: "check the logged swap hash".

## Should fix (medium)

- #91: on canary the relay base is the testnet relay while data and swaps are mainnet; `sodax_get_relay_packets` /
  `get_packet` say "not found" for real txs, `sodax_submit_relay_tx` sends mainnet txs to testnet. Keep the relay on
  the production origin, or label it. (Canary `/v1/intent/oracle` was 502 during the review: environment.)
- #91/#92: a sent but malformed key (`Bearer sodax_…`, duplicated header, `sodax_` alone) gets 403 "API key
  required…send it"; on `all` the swap tools vanish silently. No length cap (real keys are 49 chars). Split
  "missing" from "malformed"; cap length.
- #93: chains resolve by name/alias/key only; `42161` / `0xa4b1` → `UNSUPPORTED_CHAIN` "SODAX swaps don't support
  that chain". Match EVM ids; say "unknown chain".
- #94: steps' and batch `chainId` come from the live chain config; the asset manager is the same on 5 EVM chains, so
  a wrong live chainId gives a ready quote on the wrong chain. Take it from `spokeChainConfig[key].chain.chainId`
  and refuse a differing live value.
- #94: Sonic-side tokens: the SDK puts the raw Sonic address in the intent, not `hubAsset`; only native S differs
  (`0x0…0` vs wS), so a swap to S gives `SWAP_MISMATCH` (seen offline with SDK 2.2.0, not live). Expect
  `isHubChain(key) ? token.address : token.hubAsset`; build the `/intents` test stub with the SDK, not by hand.
- #94: one global 10k quote cache cap, oldest evicted, no per-key cap: a key can push out others' live quotes, and
  their track then says `QUOTE_NOT_FOUND` after the deposit. Per-key cap.
- #95: alert flood: any `sodax_…`-shaped key + random `quoteId` + any public asset-manager deposit without a
  submit-tx row posts a "relay it by hand" alert; dedupe is per tx. Global alert budget + "suppressed N".
- #95: `track(txHash of an older swap, quoteId Q)` reports that row's status under Q ("complete") while Q's deposit
  is never submitted; also a submit-tx timeout after the backend inserted the row clears the claim. When a row
  exists and the hash isn't Q's submitted one, run `checkDeposit` once.
- #95: any `SWAP_REJECTED` from submit-tx triggers relay-for-refund, including DTO-validation 400s at minute 2. Only
  when `now >= deadline - skew`; otherwise surface and alert.
- #95: `solved` = hub fill. Wording: hub destination "complete … on Sonic"; else "filled … arrives after one more
  cross-chain hop … don't send again" (store the destination key in `minimumReceived`).
- #95 (agent run): a hash the chain doesn't know stays `awaiting_source_confirmation` past the quote deadline until
  the 30 min grace. `track {chain}` alone returns `not_submitted_unknown_quote` without reading the chain and says
  "call again with its quoteId", so after a restart a stranded deposit loops without an alert.
- #96: Stellar account without a trustline → `CHAIN_UNAVAILABLE` (Soroban simulation fails). Use `recipientReady`;
  return 0 with `trustline: false`.
- #97: nothing tests that the logger, `notifyError` and `sdkLogger` actually strip URLs: removing each passed all
  522 tests. Test through the real logger/stream and the fetch bodies.

## Low / nits (grouped)

- #91: SSE `sessionId` (in the URL) acts as a bearer for the GET's key on keyless POSTs; Discord "Server started"
  shows `NODE_ENV`, not `SODAX_ENV`; `check:drift` ignores `SODAX_ENV_ERROR`; relay POSTs now share the edge budget.
- #92: `MCP_PROFILE` silently ignored over HTTP; the 400 lists `swap` while the switch is off; profile descriptions
  in four places; no HTTP-level `resolveConnection` test.
- #93: catalog fetched with the first caller's key (one bad key could fail cold loads for all); upstream token
  `name` goes into `nextStep` (use an address prefix); per-chain native-mark check; `0xEeee…` native placeholder;
  address match should name what it found.
- #94: decimals trusted from the live list only (cross-check `spokeChainConfig` when listed); Sui recipient accepts
  a 20-byte EVM address; partner address regex-only (use viem `isAddress` strict); `SWAP_REJECTED` without reason
  ("No path was found", apiCode -4, unmapped; raw `status: 422` leaks); `deadlineMinutes: 5` floor checked before
  ~45 s of building.
- #95: single-flight key lacks `quoteId`; RLP `from` not compared (defence in depth); a cancel after an MCP
  relay-for-refund says "call track first"; terminal `failed` without hub tx says "nothing to do"; no `final` flag;
  cancel with `cancelTxHash` reads the receipt before checking the swap was submitted.
- #96: `null` (missing account) accepted from token reads too; free RPC proxy on the operator's paid RPC (no cache);
  gas hint only at exactly 0; Stacks `ST…`/burn and Injective zero addresses pass; Bitcoin guard code; Solana
  lamports > 2^53 lose precision (SDK: web3.js number; fix in sodax-sdks).
- #97: "treat as exposed" only on `textArg` fields (amount, txHash, quoteId give plain validation errors); mnemonic
  false negatives (trailing period, prefix, 13/25 words; use the BIP39 list via `@scure/bip39`); `textArg` reuse
  makes `$ref` in the quote schema (`toChain`, `toToken`, `toAddress`), which some clients don't resolve; base58
  86–88 chars = a Solana signature (skip tx-hash fields); `ws(s)://` not stripped; config-mismatch alert lacks the
  chain; USD warning silently absent when the oracle is down (say so in `nextStep`).
- #98: thrown `callTool` (60 s client timeout, 429) not retried in `track`; gas estimate on a lagging node after
  the approve; the "never loads the SDK" isolation doesn't hold on the runner (same user, `/proc/<pid>/environ`;
  run the server from the Docker image or reword; `persist-credentials: false`); the canary doesn't assert the tx
  shape (approve exact amount and spender, `value 0`, `to` = asset manager); `retryAfterSec` not capped at the
  deadline; no `uncaughtException` handler; `Server log` only on `failure()`; `setup` stage undefined in the README.
  SHA pins verified against tags; the runtime import loads only `constants.ts` and `errors.ts`.
- Builder tool (pre-existing): `sodax_get_solver_oracle` error text carries the backend host.
- Agent UX: "Wrapped Bitcoin" / "Bitcoin" → `not_found` with no suggestions; `UNKNOWN_TOKEN` carries no candidates;
  `AMOUNT_TOO_LOW` gives no minimum; Stellar `DESTINATION_NOT_READY` doesn't name the issuer; `get_balance` doesn't
  return the token address/decimals; ready-quote text says "(or the batch)" for one step, never says to switch the
  wallet to `chainId` or which of batch/steps to prefer; `txHash` description doesn't say EVM only.

## Decisions out of date (need the user)

- Settled 4 says phase 1 sources are EVM **and Sonic**; since #85 the hub is refused (`source.ts` `sourceChainFor`:
  no `connection` log on the hub), and `UNSUPPORTED_SOURCE` text says "only from an EVM chain", which Sonic is.
- Settled 11 says "the quote reads no chain"; it reads the hub (user hub wallet via the SDK) and NEAR/Stellar
  recipient readiness, and asks the backend `/allowance/check`. The ADR line on chain reads needs the same update.

## Verified fine

Per-request key isolation (AsyncLocalStorage, concurrent keys), keyed routes only, no redirect with a key, relay
keyless; profiles/gate/rollout switch fail closed, builder snapshot byte-identical and guarding; amount parsing
strict; minimum floored, deadline checked, `includeTxData` absent, approve exact with pinned spender, native value
from the rebuild, zod strips extra tx fields; source-tx check (other contract, reverted, wrong chain, other
payload); quote claim without an await gap; `QUOTE_KEY_MISMATCH` before any read; `parseRpcOverrides` https only;
secrets never echoed (outputs, logs); analytics whitelist; stage reporting and Discord payload in #98.
