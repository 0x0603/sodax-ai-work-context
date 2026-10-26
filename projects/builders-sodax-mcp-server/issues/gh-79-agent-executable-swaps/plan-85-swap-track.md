---
type: plan
repo: builders-sodax-mcp-server
github: 85
related_issues: [79, 84, 86, 87, 88, 89]
tags: [mcp, swaps-api, submit-tx, track, cancel, evm-rpc]
updated: 2026-10-26
---

# #85 — `sodax_swap_track` and `sodax_swap_cancel`

Status: commits 1–5 shipped as one commit in draft PR #95 (`33cb75a`, 2026-10-26); commit 6 (contract tests) and 7 (Sonic) not started. Plan reviewed (§Review). Drafted by a planning agent on 2026-10-26 from `feat/84-swap-quote` with #84's
second-review fixes in the working tree (Sonic sources refused, `swapContract` in the catalog). Branch
`feat/85-swap-track` off the #84 commit that carries those fixes. Not started.

## Context

ADR / `plan.md` override the issue body: track = status first, then the EVM receipt check (the `connection` log
carrying the cached relay payload), then submit once (ADR §Track, decision 4); cancel = two calls (decision 5). The
issue's "per-chain-family receipt check" means EVM spokes only: #84 refuses Sonic sources until the SDK names the hub
Intents contract. The issue's `cancel(quoteId | txHash)` becomes "`txHash` required": submit-tx rows and hub intents
are keyed by tx hash, and a quote alone has nothing on chain to cancel.

Live facts (probed 2026-10-26; GETs, read-only RPC, `POST /intents` builds for `0x…dEaD` and `{}` validation probes
only — nothing submitted):

1. `GET /v1/swaps/submit-tx/status?txHash&srcChainKey` (keyless, both hosts): unknown hash → 404 `{"message":"Swap
   transaction not found",…}`; bad `srcChainKey` → 400. Production row `sonic` / `0x664669f1…bffa` → 200
   `{success, data:{txHash, srcChainKey, operation:"swap", status:"solved", processingAttempts:0,
   result:{dstIntentTxHash (= txHash), intent_hash, fillTxHash}}}`. The same row is 404 on canary (separate DBs). No
   rate-limit headers.
2. Deposits with no submit-tx row are normal: three recent Arbitrum SODAX deposits (blocks ~518.23M–518.32M) have no
   row on either host (the app has its own client-side relay path). A row-less deposit alone is no reason to alert.
3. `POST /v1/swaps/intents` (canary, build only): Arbitrum native ETH → `tx.to` = asset manager, selector
   `0xc6b4180b` (`transfer(address,bytes,uint256,bytes)`), `relayData.address == intent.creator`, `relayData.payload`
   inside `tx.data`. Sonic USDC → `tx.to` = `0x6382D6cc…96ef` (hub Intents contract), `relayData.payload == tx.data`.
   The intent always has exactly 14 keys (the IntentDto fields).
4. Arbitrum `connection` (`0x4555…88eD`) logs have one topic,
   `0x0fcc8c448c97c08d0304a9eb321a5ffb209618d28a85dbc8d7a7a592124538ef` =
   `keccak("Message(uint256,bytes,uint256,uint256,bytes,bytes)")` (re-checked with `cast keccak`), nothing indexed.
   Data = (`srcChainId` 23, `srcAddress` = asset manager, `connSn`, `dstChainId` 146, `dstAddress` = hub asset
   manager, `payload`). The payload is an RLP list `[token, from (= tx sender), to, amount, data]` (deposit
   `0xe60cd94d…a635`, whose receipt holds only that log).
5. Sonic: tx `0x7170cd5a…85fa7` holds `IntentCreated` (`0x29fecd55…6f`) from `0x6382…96ef`; `IntentCancelled(bytes32)`
   (`0xc08eb64d…dc`) appears 112× in the last 90k blocks.
6. Chain config (`/v1/be/config/spoke/all-chains-configs`): identical on both hosts for every EVM chain:
   `addresses.{assetManager, connection}` and an https `rpcUrl`. Sonic has `walletRouter`, `wrappedSonic`, no
   `connection`. Relay ids: Arbitrum 23, Base 30, Sonic 146.
7. `POST /intents/cancel {}` → 400 (`srcChainKey…; intent…`); `POST /intents/submit {}` → 400 (`chainId must be a
   number string; txHash…`). Both accept keyless requests today.
8. `GET /v1/swaps/intents/{hubTx}` → the 14-field intent; `…/fill` → 404 "not filled yet" for a solved intent, so the
   received amount isn't available anywhere.

Code facts (backend `origin/development` @ `612f67d9`, `apps/swaps-api/src/api/swaps` identical on `origin/main`; SDK
`@sdks@2.2.0`):

- Submit (`swaps.controller.ts:580-612`): `@RequireApiKey('swaps:write')`, `HaproxyThrottlerGuard`, 10 per 60 s per
  client IP. Body (`dto/submit-tx.dto.ts`): `txHash` (≤ 127), `srcChainKey` (in `CHAIN_KEYS`), `walletAddress`,
  `intent: IntentDto`, `relayData: Hex` — the payload only; the SDK sends `relayData.payload`
  (`SwapService.ts:863-870`). Response `{success, data:{status:'inserted'|'duplicate', message}}`.
- Idempotency (`swaps.service.ts:223-285`): Redis key, then Mongo unique `(txHash, srcChainKey)` → `duplicate`. A new
  row past `intent.deadline` → 400; an existing row → `duplicate`. Nothing checks the source tx or that a retry
  carries the same intent.
- Validation: the global `HttpValidationPipe` sets `whitelist` and `forbidNonWhitelisted`
  (`packages/shared-nest-http/src/pipes/validation.pipe.ts:9-10`), so an intent with any extra key is a 400. #84
  caches the intent with `.passthrough()` (`swapsApi.ts`).
- Drainer: EVM sources relay without `data` (only Solana / Bitcoin need it, `relay-swap-tx.ts:36-66`); a hub-source
  row skips the relay and sets `dstIntentTxHash = txHash` (`submit-swap-txs.task.ts:404-406`).
- Status (`swaps.controller.ts:614-631`; no key, no throttle): `pending → relaying → relayed → posting_execution →
  posted_execution → solved | failed`; a retrying failure shows its in-flight step, so `failed` is terminal
  (`submit-tx-db.service.ts:389-415`). `userMessage` is one of a few fixed strings (refund in progress, solver
  failed / never picked up "cancel to recover", abandoned, cancelled on chain, reverted; `:425-460`, `:1328-1395`).
  Also `intentCancelled`, `abandonedAt`, `relayedForRefundAt`, `result.{dstIntentTxHash, intent_hash?, fillTxHash?}`
  (`fillTxHash` may be missing on `solved`).
- Cancel: `POST intents/cancel` (`:386-402`, `swaps:write`) only builds `{tx}` (SDK `createCancelIntent`, raw). For an
  EVM spoke that tx is `connection.sendMessage(146, intent.creator, encodeContractCalls([cancelIntent(intent)]))`,
  value 0, from the intent's source address (`SwapService.ts:1431-1490`, `:1598-1602`; `EvmSpokeService.ts:287-301`).
  The SDK's `cancelIntent` relays spoke txs and returns early for the hub (`:1520`). `POST intents/submit`
  (`:339-361`, `swaps:write`) = one relay `submit` `{chainId: relay id string, txHash, data?}` → `{result}`.
- SDK limits: `connectionAbi` has no `Message` event; `EvmSolverService.getIntent` blocks on
  `waitForTransactionReceipt` (`EvmSolverService.ts:278-279`).
- This repo: `CachedQuote = IntentRequest & {quoteId, intent, relayData, expiresAt}`, shared by all callers;
  `HttpError` messages contain the URL; `/v1/swaps/*` carry the caller's key; the catalog keeps the asset manager as
  `swapContract` but not `connection` or `rpcUrl`; the temporary "can't submit" clause is in `quoteNextStep`
  (`tools/swap.ts`); `SWAP_INSTRUCTIONS` in `server.ts`.

## Scope

In: `sodax_swap_track`, `sodax_swap_cancel` (EVM spoke sources); Swaps API calls for submit-tx, status, hub intent,
cancel build and relay submit; a strict 14-field intent in the cache; an EVM JSON-RPC reader with
`SODAX_RPC_URL_<chainId>` overrides; Message / RLP log decoding; operator alerts; the `quoteNextStep` and
`SWAP_INSTRUCTIONS` changes, and the quote refusing chains the server can't track; landing page, README,
`.env.example`; unit and contract tests.

Out (owner): balance check (#86 — the swap profile has 4 tools after #85, 5 after #86; fix `plan.md` row 85) ·
secret screening, USD warning, analytics outcomes (#87) · funded canary E2E incl. the issue's "tracked to `solved`"
(#88, prerequisite 3) · `server.json` tools, walkthrough, dropping the switch (#89) · Sonic sources (after #84's SDK
commit; design 12, optional commit 7) · non-EVM sources. MCP-side relay-for-refund moved In (§Relay-for-refund).

## Design

1. **Track = status-first state machine; never blocks or polls.**
   - Source: `quoteId` → cached quote, bound to the caller's key (design 5); a quote made under another key →
     `QUOTE_KEY_MISMATCH` at once (no status read, RPC call, POST or alert); else `chain` via
     `resolveChainKey` against the catalog keys. Must be EVM and not Sonic (`UNSUPPORTED_SOURCE`). Lowercase `txHash`:
     the backend keys on exact strings, so a second spelling would make a second row.
   - Status read: 200 → report (design 3), never submit. 404 (`fetchJsonOrNull`) → continue. A false 404 costs at
     most one more idempotent submit.
   - No usable quote → `not_submitted_unknown_quote` (design 6 says when it alerts).
   - Quote already used by another tx (`submittedTxHash` set and different) → `not_submitted` / `quote_used` + alert:
     two deposits carry the same intentId, so the second can't become an intent.
   - Receipt (design 4): `null` → `eth_getTransactionByHash` → `awaiting_source_confirmation` with `seenOnChain`;
     `0x0` → `source_failed`; success → deposit check (design 2): no `Message` from the chain's `connection` →
     `not_submitted` / `not_a_deposit` (an approve, or a batch whose swap call failed); a non-matching `Message` →
     `not_submitted` / `deposit_mismatch`.
   - Matching deposit but `now ≥ intent.deadline` → no submit-tx (the backend refuses new expired rows); relay for
     refund instead, see §Relay-for-refund.
   - Submit: `POST /submit-tx` `{txHash, srcChainKey, walletAddress: quote.srcAddress, intent:
     toIntentDto(quote.intent), relayData: quote.relayData.payload}`. `success:false` → `UPSTREAM_UNAVAILABLE`;
     `inserted` / `duplicate` → `markSubmitted`, return `queued` (no second status read; keeps the worst case ~40 s);
     400 / 422 → `SWAP_REJECTED` (the deadline race lands here).
   - Why: the status read makes repeats idempotent (5 calls → 1 POST); the receipt check stops an approve hash, a
     reverted tx or a failed inner batch call from being queued and later abandoned (ADR §Track).

2. **Deposit check = exact fields, not substrings.** Receipt `0x1` and some log with `address` = catalog `connection`,
   `topics[0] == MESSAGE_TOPIC`, decoded `srcChainId == intent.srcChain`, `dstChainId == 146`, `srcAddress` = catalog
   asset manager (= the swap tx's `to`, which #84 checks), and an RLP payload of exactly 5 items with `item[4] ==
   relayData.payload` and `item[2] == relayData.address` (case-insensitive hex).
   - `item[2]` equality is inferred from the SDK (`SwapService.ts:1287`) and the live layout; the first funded run
     confirms it.
   - Token, amount and `from` aren't compared: the payload's `createIntent` already binds amounts and creator; Hedera
     scales native amounts (inferred), making an amount compare fragile.
   - No new dependency: constants `MESSAGE_TOPIC`, `INTENT_CREATED_TOPIC`, `INTENT_CANCELLED_TOPIC`,
     `SEND_MESSAGE_SELECTOR` `0x6ea9cec9` (computed with `cast`, matched to live logs; a contract test re-checks); a
     small ABI decoder for words and `bytes`; a minimal RLP list decoder (byte strings only; refuses nested lists,
     length fields > 4 bytes, trailing bytes).
   - Not the SDK or viem: the SDK isn't a dependency yet and its `getIntent` blocks until mined; viem transport errors
     include the RPC URL (paid URLs carry keys); one JSON-RPC call doesn't justify a dependency.

3. **Status mapping and output.** Every result: `{txHash, chain:{key,name}, quoteId?}`.

   | `status` | When | Extra fields |
   |---|---|---|
   | `awaiting_source_confirmation` | no receipt | `seenOnChain`, `retryAfterSec: 15` |
   | `source_failed` | receipt `0x0` | – |
   | `not_submitted` | mined, not this quote's deposit | `reason: not_a_deposit \| deposit_mismatch \| quote_used` |
   | `not_submitted_unknown_quote` | no row, no usable quote | `alerted` |
   | `expired_refunding` | matching deposit, deadline passed, no row, relayed (§Relay-for-refund) | – |
   | `expired_unsubmitted` | as above, but the relay failed | `alerted` |
   | `queued` | backend `pending` (also right after submitting) | `retryAfterSec: 15` |
   | `in_progress` | `relaying` … `posted_execution` | `stage`, `hubTxHash?`, `retryAfterSec: 15` |
   | `solved` | `solved` | `hubTxHash`, `fillTxHash?` |
   | `failed` | `failed` | `failedAtStep?`, `outcome`, `canCancel` |

   - `outcome` is ours, derived from the status flags, never upstream text: `cancelled` (`intentCancelled`),
     `refunding` (`relayedForRefundAt`), `abandoned` (`abandonedAt`), else `cancel_to_recover` when `canCancel`, else
     `unknown`. `userMessage` and `failureReason` are never passed on (#84 dropped upstream text after its second
     review).
   - `canCancel`: a `dstIntentTxHash`, no `intentCancelled`, no `relayedForRefundAt`. Cancel and fill exclude each
     other on chain, so offering it is always safe.
   - `stage` / `failedAtStep` must be one of the 7 statuses (an unknown string → `in_progress`, `stage: "unknown"`, a
     warn log). `hubTxHash` = `0x` + 64 hex. `fillTxHash` matches `^[A-Za-z0-9:_-]{1,128}$` (non-EVM destinations).

4. **RPC access.** URL = `SODAX_RPC_URL_<evmChainId>` (e.g. `SODAX_RPC_URL_42161`) when set, else the catalog
   `rpcUrl`. Env values parsed in `main()`: `https:` only, otherwise fatal at boot naming the variable, never the
   value. A non-https default marks the chain untrackable. Native `fetch` JSON-RPC POST, 8 s timeout,
   `redirect: "error"`, no retries, no `x-api-key`; zod-checked receipt `{status, logs:[{address, topics, data}]}` or
   `null`. JSON-RPC error / non-2xx / timeout / schema miss → `CHAIN_UNAVAILABLE`; logs carry the chain key and the
   JSON-RPC code, never the URL. Why: D5 / decision 8 (env only, no per-call `rpcUrl`); the catalog default needs no
   dependency and works on the stale catalog. The quote refuses (`UNSUPPORTED_SOURCE`) a source chain without a
   `connection` or a usable RPC, so the user never signs a swap the server can't submit.

5. **Quote cache contract.** Replace `.passthrough()` with a 14-field `intentSchema` (`intentId`, `inputAmount`,
   `minOutputAmount`, `deadline`, `srcChain`, `dstChain`: UINT strings; `creator`, `inputToken`, `outputToken`,
   `solver`: EVM addresses; `srcAddress`, `dstAddress`, `data`: hex; `allowPartialFill`: boolean) and store exactly
   those keys (the backend forbids unknown keys). `CachedQuote` gains `srcChainId`, a catalog-derived `summary`
   (`fromAmount, fromSymbol, toSymbol, toChainName, minimumAmount`), `keyHash` (SHA-256 of the API key, never the
   key), `submittedTxHash?`. New: `markSubmitted(quoteId, txHash)`; `getCachedQuote(quoteId, keyHash)` → the quote,
   `undefined` when missing, or `"key_mismatch"`. Why: the cache is shared; only the quote's creator may submit or
   alert on it, and a mismatch must not look like a lost quote (false alert, and the agent may deposit again). Same
   key for quote, track and cancel (user, 2026-10-26; open question 3).

6. **Alerts** (`swap/alerts.ts`): `unknown_quote` (a `quoteId` given but gone, not a key mismatch, no row, and the receipt has a
   `Message` from the connection whose `srcAddress` is the asset manager), `expired_unsubmitted`, `quote_used`. Not
   without a `quoteId` (fact 2) nor for `not_a_deposit` / `deposit_mismatch` (the agent fixes those). `logger.error`
   + `postToDiscord` (`discord.ts`) with kind, chain key, tx hash, quote id, deadline; no addresses. Dedupe per
   `(kind, txHash)` for 24 h, ≤ 1,000 entries, reset on restart. Why: ADR §Quote cache — an operator can relay a
   stranded deposit.

7. **Single-flight.** Concurrent calls for the same `(keyHash, chain, txHash)` share one promise: submit-tx allows 10
   per 60 s for the server's whole IP.

8. **Cancel flow** (the intent comes from the hub or the cache, never from model input).
   - Status first: 404 → `not_cancellable` / `not_submitted` ("call sodax_swap_track first; an unsubmitted deposit
     isn't an intent yet"); `solved` → `solved`; `intentCancelled` → `cancelled`; `relayedForRefundAt` →
     `refunding`; no `dstIntentTxHash` → `not_on_hub_yet`.
   - Intent: `GET /swaps/intents/{dstIntentTxHash}`; with a cached quote its `intentId` must match, else
     `UPSTREAM_UNAVAILABLE`. Works after a restart.
   - First call: `POST /intents/cancel {srcChainKey, intent}`; check `from` = the intent's source address (=
     `quote.srcAddress` when cached), `to` = catalog `connection`, `value` 0, `data` = `SEND_MESSAGE_SELECTOR` + ABI
     `(146, intent.creator, payload)`; a mismatch → `UPSTREAM_UNAVAILABLE` ("built a different cancel", don't retry).
     Keep the payload in a small map (1,000 entries, 2 h TTL, by chain + swap tx). Return `ready`, `steps:
     [{kind:"cancel", chainId, tx}]` (hex `value`, like #84).
   - Second call (with `cancelTxHash`; status and receipt in parallel): no receipt → `cancel_awaiting_confirmation`;
     `0x0` → `cancel_failed`; the receipt must hold a `Message` from `connection` with `srcAddress` = the intent's
     source address, `srcChainId == intent.srcChain`, `dstChainId == 146`, `dstAddress == intent.creator`, `payload`
     = the stored one (rebuild with `/intents/cancel` on a map miss; the build is deterministic), else
     `not_a_cancel_tx`. Then `POST /intents/submit {chainId: intent.srcChain, txHash: cancelTxHash}` (no `data` for
     EVM); `result.success === true` → `cancel_relayed`, else `UPSTREAM_UNAVAILABLE`. A repeat relays again; the
     relayer dedupes by tx hash (inferred from `relay-swap-tx.ts`).
   - After a cancel, track shows `failed` / `outcome: cancelled` (inferred from the hint code, not traced through the
     drainer).

9. **Tool surface** (`registerActionTool`).
   - `sodax_swap_track` — "Submit and track a swap once the user's wallet has sent its swap transaction. Call it right
     after sending, then again until it reports solved or failed; repeated calls never resubmit. It checks the
     transaction on chain before submitting. This server never signs or moves funds." Inputs: `txHash`
     (`^0x[0-9a-fA-F]{64}$`, trimmed; "the swap step's hash, not an approve; from a batch, the transaction hash from
     wallet_getCallsStatus, not the batch id"), `quoteId` (`z.string().trim().uuid().optional()`), `chain`
     (`chainArg.optional()`, "source chain key; needed only without quoteId"); one of `quoteId` / `chain` required
     (`QUOTE_NOT_FOUND`).
   - `sodax_swap_cancel` — same, plus `cancelTxHash?` (same regex).
   - Annotations: `{readOnlyHint:false, destructiveHint:false, idempotentHint:true, openWorldHint:true}`.

10. **Wording** (built only from enums, catalog names, the cached summary and validated hashes).
    - Track `nextStep`: awaiting → "…isn't confirmed on {chain} yet; call sodax_swap_track again in about 15 seconds,
      and don't resend it" (+ "if this keeps up, check the chain and that it's a transaction hash, not a batch id"
      when unseen); source_failed → "…failed on {chain}: nothing was swapped, only gas was spent; quote again if the
      user wants to retry"; not_a_deposit → "…isn't this quote's swap (it may be the approve, or the swap call failed
      inside a batch); ask for the swap transaction's hash"; deposit_mismatch → "…is a SODAX deposit for another
      quote; track it with the quoteId it was made from"; unknown / expired (alerted) → "…tell the user the deposit
      is on chain and safe, SODAX has been alerted to recover it, and they must not send it again" (no quoteId: "…no
      SODAX record; if it came from sodax_swap_quote, pass its quoteId; swaps made elsewhere are tracked where they
      were made"); queued / in_progress → "…being processed ({stage}); call again in about 15 seconds"; solved →
      "…complete: the user received at least {minimumAmount} {toSymbol} on {toChainName}{, fill tx …}"; failed → our
      sentence for `outcome`, then "they can cancel with sodax_swap_cancel" when `canCancel`, else "nothing to do".
    - Ready quote `nextStep`: drop the "can't submit / don't send" sentence; add "Once they confirm, have their wallet
      send the steps in order, each confirmed before the next (or the batch), before it expires, then call
      sodax_swap_track with the quoteId and the swap transaction's hash." Keep "Balances aren't checked here." and the
      defaulted-recipient warning.
    - `SWAP_INSTRUCTIONS` gains: "After the user's wallet sends the swap, call `sodax_swap_track` with the quoteId and
      the swap's tx hash: it submits the swap, so call it at least once, and again until solved or failed. Never
      resend a swap the tracker hasn't reported as failed at the source. To cancel a submitted swap, use
      `sodax_swap_cancel`."
    - Ready quote also returns `afterSend: {tool: "sodax_swap_track", args: {quoteId}, needs: "txHash"}` (decided
      2026-10-26): nothing submits the deposit unless track is called, and a field is harder for an agent to miss
      than a sentence. The `nextStep` sentence stays. The real fix is the backend watching for the deposit of an
      intent it built (`plan.md` §Follow-ups, BE); no MCP-side chain watcher (a background job, log scans for quotes
      that are mostly never signed, state lost on restart, duplicates across instances).

11. **Errors, rate limits, timeouts.** New codes: `QUOTE_NOT_FOUND` (no `quoteId`/`chain`, or an unknown `quoteId`
    without `chain`; "call again with chain set to the quote's source chain key"), `QUOTE_MISMATCH` (`quoteId` for
    another chain), `QUOTE_KEY_MISMATCH` (track and cancel; "use the same API key that created the quote", no alert;
    the tool descriptions say so too), `CHAIN_UNAVAILABLE` (RPC failure or no usable RPC). Reused: `UNSUPPORTED_SOURCE`,
    `API_KEY_REQUIRED`, `SWAP_REJECTED` (400/422), `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`. In track and cancel the
    transient codes (`RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `CHAIN_UNAVAILABLE`) override `nextStep` with "…call this
    tool again in {n} seconds with the same arguments; the deposit is safe and must not be sent again". `Retry-After`
    is parsed in `http.ts` (60 s default); that submit-tx's throttler sends it is inferred, not probed (11 submits).
    Timeouts: 15 s Swaps API (existing), 8 s per RPC call. Worst cases: track ~38 s with a submit (~31 s awaiting
    confirmation); cancel first call ~45 s; second call ~30 s (45 s on a payload-map miss).

12. **Sonic** (optional commit 7, after #84's SDK commit). Quote: Sonic's `swapContract` = SDK
    `solverConfig.intentsContract`. Track: the deposit check becomes an `IntentCreated` log from that contract whose
    decoded intent equals all 14 cached fields; no relay (the backend sets `dstIntentTxHash = txHash`). Cancel: check
    the built tx's `to` against the live `walletRouter`; on the second call look for `IntentCancelled` with the hash
    = `result.intent_hash` (or `POST /intents/hash` when missing) → `cancelled`, no relay (SDK `:1520`).

## Changes (commits)

1. `feat: Swaps API calls for submit, status and cancel` — `swapsApi.ts`: `intentSchema` + `toIntentDto`,
   `getSubmitTxStatus` (null on 404), `submitTx`, `getHubIntent`, `buildCancel`, `relaySpokeTx`
   (`POST /intents/submit`), zod response schemas; `errors.ts`: the four codes.
2. `feat: keep what track needs with each quote` — `tokens.ts`: catalog chains keep `connection` and `rpcUrl`;
   `quoteCache.ts`: design 5 fields, `markSubmitted`, key binding; `quote.ts` fills them and refuses untrackable
   chains; re-record `__fixtures__/chain-configs.json` with `connection`, `rpcUrl`, Sonic's `walletRouter`.
3. `feat: read EVM source transactions` — `swap/evmRpc.ts` (`rpcUrlFor`, `getReceipt`, `isTxKnown`,
   `parseRpcOverrides` wired into `main()`); `swap/sourceTx.ts` (constants, `decodeMessage`, `decodeRlpList`,
   `findDeposit`, `findCancelMessage`, `decodeSendMessage`); receipt fixtures from facts 4–5 (public chain data);
   README env table + data-sources row; `.env.example`.
4. `feat: add sodax_swap_track` — `swap/track.ts`, `swap/alerts.ts`, the tool and next steps in `tools/swap.ts`, the
   `quoteNextStep`, `afterSend` and `SWAP_INSTRUCTIONS` changes, landing page entry, the swap tools list test.
5. `feat: add sodax_swap_cancel` — `swap/cancel.ts`, the tool, landing page entry.
6. `test: live contract tests for track and cancel` — `src/tools/swapTrack.contract.test.ts`.
7. *(Optional, after #84's SDK commit)* `feat: open Sonic sources` (design 12).

Every commit passes `pnpm checkTs && pnpm lint && pnpm test && pnpm build`.

## Tests

Unit (fetch stubbed as in `swapQuote.test.ts`; the RPC URL stubbed by host):
- `sourceTx`: decode the real Arbitrum `Message` / RLP fixture; refuse truncated or odd-length data, nested RLP,
  trailing bytes, long-form overflow; the match flips on a 1-byte payload change, another connection, another
  `srcAddress` (the approve's case), another `dstChainId`; `decodeSendMessage` round-trips.
- `evmRpc`: null receipt, JSON-RPC error, non-2xx, timeout, redirect refused; the URL in no error message or log call;
  env parsing (https only; invalid → fatal, variable named without its value).
- `swapsApi`: status 200 / 404 → null / 400 / 429 + `Retry-After`; submit `inserted`, `duplicate`, `success:false`;
  the intent sent has exactly 14 keys; cancel-build and relay schemas.
- `quoteCache`: new fields, `markSubmitted`, missing → `undefined`, key mismatch → `"key_mismatch"`.
- Track state machine over the in-process MCP client: every status in design 3 (awaiting seen / unseen,
  `source_failed`, the three `not_submitted` reasons, `not_submitted_unknown_quote` with and without an alert,
  `expired_unsubmitted` with no POST, `queued` inserted / duplicate, each `in_progress` stage, `solved` with and
  without `fillTxHash`, `failed` × each `outcome`); an unknown backend status; `RATE_LIMITED`, `API_KEY_REQUIRED`,
  `CHAIN_UNAVAILABLE`, `QUOTE_NOT_FOUND`, `QUOTE_MISMATCH`, `QUOTE_KEY_MISMATCH` (no status read, RPC call, POST or
  alert; cancel too); a mixed-case hash normalized.
- Idempotency: 5 sequential calls → exactly 1 `POST /submit-tx` (the stub's status turns 200 after it); 2 concurrent
  → 1 POST; an alert fires once per tx.
- Cancel: each `not_cancellable` reason; a built tx with the wrong `to`, selector, `dstAddress` or `from` →
  `UPSTREAM_UNAVAILABLE`; hub intent vs cached quote mismatch; second call: awaiting, reverted, `not_a_cancel_tx`,
  `cancel_relayed` (body exactly `{chainId, txHash}`), rebuild on a map miss.
- Surface: 4 swap tools with the annotations above; the ready `nextStep` names `sodax_swap_track` and no longer
  forbids sending; `SWAP_INSTRUCTIONS` mentions track and cancel; no upstream text in any output.

Contract (`src/tools/swapTrack.contract.test.ts`, picked up by `vitest.contract.config.ts` / `pnpm test:contract`;
nothing signed, submitted or relayed):
- Production only (`describe.runIf(process.env.SODAX_ENV === "production")` inside the contract run): status of
  `sonic` / `0x664669f1…bffa` → `solved` with `hubTxHash` = the tx and a fill tx; 3 repeated calls, no POST.
- Both hosts: an unknown hash without `quoteId` → `not_submitted_unknown_quote`, no alert, no POST.
- Arbitrum receipt `0xe60cd94d…`: decodes against the live `connection` and asset manager, 5 RLP items, topic
  constant matches; under a fake cached quote with a different payload → `deposit_mismatch`, no POST.
- Arbitrum `0x05d2b5c0…` (a SODAX non-swap deposit) under a fake quote → `deposit_mismatch`, no POST.
- Every EVM chain in the live catalog has a `connection`, and an https RPC in the SDK's `spokeChainConfig`.
- Optional: the Sonic `IntentCreated` decode of `0x7170cd5a…` equals `GET /v1/be/intent/0x37686870…`.

Not testable without a funded wallet and a canary key (prerequisite 3, #88): a real `inserted` submit to `solved`;
the confirmation transition; a smart-wallet batch; a real cancel through relay → `intentCancelled`; the throttler's
429 + `Retry-After`; `expired_unsubmitted` with a real deposit; design 2's `item[2]` equality.

## Ship

Draft PR `feat: add sodax_swap_track and sodax_swap_cancel to the swap profile`, `Closes #85`, into `development`;
until #94 merges the branch stays stacked on `feat/84-swap-quote` (not a GitHub-native stack). Body: the departures
(EVM only, `txHash` required for cancel, the statuses, RPC env, alerts, 4 swap tools until #86); "keep
`SODAX_SWAP_TOOLS_ENABLED` off in production until #87 and #88"; the canary run to `solved` (AC 2) waits for
prerequisite 3. Public repo: observed public API behaviour only — no backend branch names, Discord channel names or
internal hosts. After: `plan.md` row 85 (4 tools), the brief.

## Open questions

1. ~~`expired_unsubmitted`: alert only, or relay for refund?~~ Resolved (user, 2026-10-26): the MCP relays, see
   §Relay-for-refund.
2. ~~RPC defaults~~ Resolved (user, 2026-10-26): the SDK's packaged `@sodax/types` `spokeChainConfig`, see §SDK reads.
3. ~~Key-bound quotes~~ Resolved (user, 2026-10-26): same key for quote, track and cancel; another key gets
   `QUOTE_KEY_MISMATCH` (design 5, design 11).
4. For the backend (raise in our PR thread): submit-tx refuses a deposit mined before its deadline but submitted
   after, so a slow agent strands an on-time deposit; submit-tx doesn't check that a duplicate carries the same
   intent; is the inferred post-cancel status (`failed` + `intentCancelled`) right; does the public relay dedupe a
   re-submitted cancel tx?

## Review (2026-10-26)

Verified in code: submit-tx guards (`@RequireApiKey('swaps:write')`, `HaproxyThrottlerGuard`, 10 / 60 s) and the
status GET (`swaps.controller.ts` on `origin/development`); `SubmitTxDto` fields and `txHash` / `walletAddress` ≤ 127;
the SDK sends `relayData: relayData.payload` (`SwapService.ts:858-870`); `forbidNonWhitelisted: true`
(`validation.pipe.ts:10`); `MESSAGE_TOPIC` re-computed with `cast keccak`. Corrected from the draft: `failed` carries
our own `outcome` enum instead of passing `userMessage` through `PLAIN_REASON` (#84's second review removed upstream
text from agent output); contract tests use `vitest.contract.config.ts`, not `runIf(SODAX_CONTRACT)`; the branch base
is the #84 commit with the second-review fixes, not `a5fc108`.

## SDK reads (decision 2026-10-26, supersedes design 2's "no SDK" and design 4's own reader)

The user decided chain reads go through `@sodax/sdk` and SDK bugs get fixed in `sodax-sdks` (same rule as #86,
`plan-86-get-balance.md`). For #85 that means:

- Receipts and tx lookups use the SDK's viem public client — `sodax.spoke.evm.getPublicClient(chainKey)` for EVM spokes
  (`EvmSpokeService.ts:70`), `sodax.spoke.sonic.publicClient` for the hub — with `getTransactionReceipt` /
  `getTransaction`, which don't block (unlike `EvmSolverService.getIntent`). No `swap/evmRpc.ts`.
- RPC URLs: default is the SDK's packaged `spokeChainConfig[chainKey].rpcUrl` (user, 2026-10-26; open question 2).
  `@sodax/types` 2.2.0 has an https one for every EVM spoke and Sonic (checked 2026-10-26). `SODAX_RPC_URL_<chainId>`
  (https, validated in `main()`) overrides it, passed into `initSodax()` as `chains.<key>.rpcUrl`; the catalog
  `rpcUrl` is no longer needed. No client-supplied RPC (re-confirmed 2026-10-26 for security: a client RPC could fake
  the receipt this check relies on).
- Error wrapping: catch everything from the SDK / viem and map to `CHAIN_UNAVAILABLE`; never pass on or log the error
  — viem messages carry the RPC URL and the request body. Log `{chainKey, op, kind}` only. Bound each read with a
  race (viem defaults to 10 s × 3 retries; the SDK doesn't expose transport options — SDK follow-up 1 in #86's plan).
- The `Message` log / RLP decode (design 2) stays in this repo until the SDK ships a `Message` event ABI and a helper
  (SDK follow-up 2); the deposit check itself is unchanged.
- Dependency: #85 now needs #84's SDK commit (6) instead of its own reader; commit 3 becomes "decode deposit
  messages" (`swap/sourceTx.ts` only) plus the SDK client wiring.

## Relay-for-refund (decision 2026-10-26, open question 1; supersedes design 1's expired branch)

The user chose to have the MCP relay an expired deposit itself, the same move as the backend's relay-for-refund
(`submit-swap-txs.task.ts:759-1010`, `sodax-backend` `development` @ `612f67d`).

Why a row-less relay still refunds (read in code 2026-10-26): relaying past the deadline creates the hub intent, and
the task-executor's `intent-canceller` takes expired intents from the orderbook (`orderbook-db.service.ts`
`getExpiredIntents`), which `data-transformator` builds from hub events, not from swaps-api rows
(`intent-canceller.service.ts:90-127`). It skips only `deadline = 0`; our quotes always carry one (brief, settled 2).

Design:

- Matching deposit, `now ≥ intent.deadline`, no backend row → `POST /intents/submit {chainId: <relay id of
  srcChain>, txHash}` (no `data` for EVM), the same call as cancel's second step. Success → flag the quote
  `relayedForRefundAt` in the cache and return a new status `expired_refunding` (no alert, info log).
- Relay fails → `expired_unsubmitted` + alert `refund_relay_failed` (kind, chain, tx hash, quote id, deadline). A
  later track call retries while the quote is cached; the operator backstop is `POST /admin/swaps/relay`.
- Once per quote: the cache flag plus single-flight (design 7) stop a second relay; track on a flagged quote returns
  `expired_refunding` without a POST. How track reports the refund landing (hub intent `intentCancelled`) is settled
  during implementation.
- Alerts (design 6): `expired_unsubmitted` alerts only on a failed relay; `refund_relay_failed` is the kind.
- Tests: expired + relay ok → `expired_refunding`, one POST, a second call makes none; relay 5xx / timeout →
  `expired_unsubmitted` + one alert, the next call retries. Contract tests probe `POST /intents/submit` validation
  only, never a real relay.

Risks: the intent has no swaps-api row, so the backend's status, dashboard and alerter never see it, and nothing in
the backend pages if the canceller misses it. The canceller was seen disabled on canary and on 4 of 6 prod
instances (gh-519 `research/g-chain-auto-tests.md`, 2026-10-20), so on canary a relayed deposit may sit until
someone cancels it by hand.
