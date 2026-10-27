# Restack notes (old origin tips: 81 0930893, 82 a816105, 83 2997dd8, 84 6339278, 85 9dd78e7, 86 0ba4b59, 87 4cb8a02, 88 6775283)
Procedure: in wt-fix-NN, `git rebase --onto feat/<lower> <old lower tip>`; then checkTs/lint/test/build; fix; next.
Hotfix fix/sse-start-once 66c80da pushed (no PR yet: ask user where to link).
ADR worktree wt-adr: D5/D6/Quote/Track/Cancel edits uncommitted; add per-key cache cap after #85 report.

## #81 (5 commits 183a01c..a4ad9e9, 118 tests)
- notifyServerStarted requires sodaxEnv. New export sseMessageApiKey (requestContext.ts).
- index.ts SSE session = {transport, server, clientId, apiKey?}. #82 rewrites sseSessions.set; #84 switches to
  context: RequestContext and `apiKey: callerApiKey(req) ?? session.context.apiKey` -> must become
  sseMessageApiKey({clientId: session.clientId, apiKey: session.context.apiKey}, post); keep clientId in session.
- constants.ts: #83 adds SODAX_SWAPS_BASE_URL after relay const (conflict); keep on SODAX_API_ORIGIN; add swaps canary
  url to the new canary test.
- constants.test.ts: #87 import line + appended block (trivial).
- README SODAX_ENV row / .env.example reworded.

## #83 (5 commits 343de03..aa421e3, 226 tests)
- SwapCatalog now {tokens, chains} with SwapChain={type, chainId} (copied from #84's shape minus swapContract).
  Conflicts in tokens.ts (chainSchema, parseCatalog, loadCatalog else{} block: #84's asset-manager check goes next to
  the native warning), __fixtures__/chain-configs.json chain blocks, tests catalog.tokens.*, #84's duplicated
  parseCatalog chain tests. Prefer #84's superset.
- #85+ resolveSwapChain must call findChainKey + the new message (else chain-id support lost).
- #86+ nativeToken() replaces tokens.find(isNative) in the native/placeholder branch.
- Strings: "which of USDT0 on HyperEVM" -> "whether they mean USDT0 on HyperEVM"; twins "USDC (0x29219dd4…), ...";
  UNSUPPORTED_CHAIN default nextStep "Ask the user which chain in error.supportedChains they mean and pass its key.";
  message "No SODAX swap chain matches that name, key or chain id."; address match starts "That address is … on …. ".
- New optional otherChains on not_found. Chain param descriptions could add "or EVM chain id" (left for upper).

## #82 (4 commits 79776fc..954457f, 158 tests)
- apiKeyStatus(raw) "valid|malformed|missing"; selectToolsets({apiKey: ApiKeyStatus, swapToolsEnabled}) returns
  ToolSelection (Toolsets + optional swapKeyHint). createServer(toolsets: ToolSelection, clientId?).
- resolveConnection + callerApiKey moved from index.ts closure to NEW src/connection.ts
  (resolveConnection(req,res,swapToolsEnabled)). #84's resolveConnection change (returns {context: RequestContext;
  toolsets} with partner fee) must move into connection.ts: partnerFeeFromRequest(req) inside the try; the
  malformed-key warning after every throw. #81's callerApiKey edits (if any) conflict there.
- server.ts (#83+): `[...enabled(toolsets, INSTRUCTIONS), toolsets.swapKeyHint].filter(Boolean).join("\n\n")`.
- server.test.ts (#83+): both add describe("instructions") + same helper; keep one, type param ToolSelection.
- profiles.ts (#84): keep both imports (parseApiKey from requestContext, API_KEYS_DOCS_URL from constants).
- index.ts (#87): MCP_PROFILE warn sits before SODAX_API_KEY warn.
- describeProfiles(swapToolsEnabled) in profiles.ts used by /api.

## Done
- #92 rebased onto new #81: tip 51b7a63, 165 tests green.
- #93 rebased onto new #92: tip cc0658e, 255 tests green. (Fixed my own re.sub "\n" bug via fixup+autosquash into
  85704bb. ALWAYS use a lambda replacement with re.sub.) server.test.ts instructions helpers merged.
- Next: #84 onto feat/83 (old base 2997dd8) once the #84 agent finishes.

## #87 (4 commits a34eeac..c2d19bd, 559 tests)
- Removed OVERSIZED_SECRET. chainArg/tokenArg/addressArg/txHashArg are now functions; new quoteIdArg(), amountArg(),
  screened(). secrets.ts exports secretRefusalText, SecretField; findSecret(value, opts?). units.ts AMOUNT_PATTERN
  (was private AMOUNT; touches 2 lines from #84). discord.ts exports truncate.
- Oversized refusal text starts "SECRET_REJECTED:"; SWAP_MISMATCH errors include error.chainKey; USD note when price
  missing: " Its USD value couldn't be checked, so confirm a large amount with the user before anything is signed."
- @scure/bip39 pinned 1.6.0 (lockfile: 3 importer lines; ox re-resolution hand-reverted).
- Conflicts: src/tools/swap.ts with #88 afterSend; pnpm-lock.yaml/package.json with #88 viem.
- If #85/#86 fixes add args using the old const builders (chainArg etc.), they become function calls here.

## #88 (4 commits 3db020a..622bde2, 549 tests with --maxWorkers=4)
- No src/ changes. swapCanary.ts exports wallets/sendSteps/track/stepMismatch; track(…, call?) ; entry runs only when
  !process.env.VITEST. scripts/tsconfig.json declaration/declarationMap false. vitest.config.ts include scripts/**.
- Conflicts: vitest.config.ts include line; README canary paragraph.
- REVIEW POINT: send failure + not found after 30 s now fails at `send` even for timeout/plain-502 (used to track).
  Safer: fail at send only if the error was an RPC answer AND the lookup misses; on unknown (timeout/HTTP) track anyway.
- Load: run tests with --maxWorkers=4 while agents run.

## #84 (5 commits 231125e..d4eb4a8, 364 tests; contract 16/16 both hosts)
- sodax.ts new exports evmChainIdFor, packagedToken, intentChainId, checksumValid; @sodax/types import multi-line
  (conflict w/ #86 import block). swapsApi.ts leavesTimeToSend. partnerFee.ts imports sodax.js.
- #85 replaces quote.ts pin block with sourceChainFor (reads live chainId): move the pin into sourceChainFor
  (evmChainIdFor, refuse when live differs).
- Strings: config refusal "The SODAX config doesn't agree with the SDK's."; log "The live SODAX config differs from
  the SDK's"; mismatch names srcChain/dstChain. SWAP_REJECTED no status; -4 "No route was found for this pair at this
  amount."; deadline re-check -> UPSTREAM_UNAVAILABLE "Call sodax_swap_quote again with a longer deadlineMinutes, e.g. 15."
  (REVIEW: code choice).
- swapQuote.test.ts: /intents stub rewritten (sdkIntent, test-side new Sodax()); catalog/findToken/fixtureCatalog
  removed; stub options tokens, buildSec; {code:"SWAP_REJECTED",status:400} -> {code,message}.
- #85: drop/flip "builds a swap from native S" unit test + contract case "from native S"; #85 removes solverConfig
  import which sdkIntent's Sonic branch uses (keep import or drop branch).
- Conflicts: quote.ts, swapsApi.ts (toActionError), sodax.ts, swapQuote.test.ts, sodax.test.ts, contract test.

## #86 (4 commits ba91f6e..aa61ce4, 466 tests)
- Holding += address, decimals; BalanceResult += trustline?: false; token present when native asked.
- TtlCache(ttl, maxEntries?) ; set() moves re-stored key to end. clearBalanceCache() export (balance.ts): upper
  get_balance tests must call it in beforeEach.
- walletBalance null only for missing account on native read (isMissingAccount per family). encodeRecipient refuses
  Stacks ST/SN (quote affected).
- swap.ts imports ChainKeys from @sodax/types; balanceNextStep strings changed (gas/spendable/trustline).
- Conflicts: balance.ts (rewritten), balanceNextStep/imports in swap.ts, swapBalance.test.ts, sodax.ts walletBalance &
  encodeRecipient + sodax.test.ts, ttlCache.ts. #87 textArg builders became functions (chainArg() etc).

## #85 (6 commits 2dcceda..47fd65d, 458 tests)
- quoteCache: submittedTxHash -> depositTxHash; relayedForRefund -> handedOver "submitted"|"relayed_for_refund";
  claimDeposit(quoteId, txHash): boolean; markSubmitted(quoteId); markRelayedForRefund(quoteId); releaseSubmitted gone.
  Per-key cap 1000 open quotes -> RATE_LIMITED retryAfterSec = soonest expiry.
- DEPOSIT_SAFE exported from track.ts (removed from tools/swap.ts); cancelPayload in sodax.ts (+ toSdkIntent helper
  from rebuildSwapTx). AlertKind += submit_rejected; alerts capped 20/h + summary; keyHash (12 hex) on alerts.
- Track results: solved.delivery "complete"|"in_transit"; expired_unsubmitted.retryAfterSec 60.
- __fixtures__/deposit.ts USER = recorded deposit's real sender 0x67ef…be0b.
- Strings: solved/unseen/unknown-quote/expired_unsubmitted/failed nextSteps; track description; SWAP_INSTRUCTIONS
  line; UNSUPPORTED_SOURCE text; txHash regex error "Must be an EVM transaction hash: 0x and 64 hex characters."
- Conflicts: alerts.ts w/ #87; errors.ts w/ #87 (UNSUPPORTED_SOURCE above UNKNOWN_TOKEN); tools/swap.ts txHashArg
  below #87 textArg changes; server.ts SWAP_INSTRUCTIONS; sodax.ts toSdkIntent.
- Also from #84: move the chainId pin into sourceChainFor (evmChainIdFor); drop/flip "from native S" tests.
- REVIEW POINT: track without quoteId now ALERTS on a deposit -> plan said no (app deposits have no row; spam
  vector). Change: no alert without quoteId; report deposit status + clear next step.

## Done: #94 rebased onto new #93: tip bc7011d, 418 tests, every commit typechecks.
For #95 from that restack:
- connection/SSE changes go in src/connection.ts; SSE session {transport, server, clientId, context}; POST runs
  under {...session.context, apiKey: sseMessageApiKey(...)}; connection.test.ts expects {context:{apiKey}, toolsets}.
- swap.ts conflicts near shortAddress/quoteNextStep ("Until sodax_swap_track lands" text); ambiguous next step ends
  with "then pass its address to sodax_swap_quote."; swap.test.ts asserts exact strings.
- tokens.ts loadCatalog else-block: native warning + asset-manager check.
- resolveSwapChain / chain lookup must use findChainKey + "No SODAX swap chain matches that name, key or chain id."
- 0xEeee handled inline (EVM_NATIVE_PLACEHOLDER in resolveToken); there is no nativeToken() function.
- quote fromChain/toChain descriptions could add "or EVM chain id".
Helper: scratchpad/restack84-tools/check-commit.sh typechecks a commit in a throwaway tree.

## Done: #95 rebased onto new #94: tip a0a16dc, 532 tests, each commit typechecks.
- chainId pin moved into sourceChainFor (source.ts) via evmChainIdFor; configDisagrees moved to source.ts (exported).
- resolveSwapChain uses findChainKey; native branch takes 0xEeee and reads catalog.chains[chain.key].
- quote.ts imports configDisagrees/sourceChainFor from source.js; intentChainId/packagedToken/isHubChain from sodax.js.
- Sonic sources expect UNSUPPORTED_SOURCE (it.each USDC + native S); dest native S kept; contract "from native S" dropped.
- SWAP_INSTRUCTIONS track line: "again after retryAfterSec seconds while the result has one".
For #96: resolver (checkAddress/resolveExactly around the findChainKey-based resolveSwapChain), quote.ts resolveSide
keeps packagedToken after resolveExactly; source.ts export chainRead + header; errors.ts/server.ts context conflicts;
swap.ts DEPOSIT_SAFE in track.ts, merge ChainKeys import + balanceNextStep; #96 "to the tool that asked for this
token" vs "then pass its address to sodax_swap_quote."; sodax.ts multi-line @sodax/types import; swapBackend.ts
callTool/ToolOut move to swapClient.ts.

## Review decisions so far
- #91: drop the SSE GET-key fallback entirely (POST uses its own key; GET key only selects toolsets). Removes
  sseMessageApiKey + clientId in session. README/PR: SSE clients send x-api-key on every request.
- #93 lows: otherChains skip isNative + "and N more" + reword; twins grouped by lower-cased symbol, head+tail labels;
  test for type==="EVM" guard; chain description add "or EVM chain id"; log chain keys dropped by chainSchema.
- #85: no alert on track without quoteId.
- #88: on send error + not found: fail at send only if error was an RPC answer; unknown (timeout/HTTP) -> track.
- #94 lows: new non-retryable code DEADLINE_TOO_SHORT (default nextStep: quote again with longer deadlineMinutes)
  used in the re-check AND getDeadline's !leavesTimeToSend path (keep "unusable deadline" for skew > 300 s); log
  token address in configDisagrees; partner-fee refusal mentions "EIP-55 checksummed or all lowercase"; map -14 and
  -5/-8 to the "try a smaller amount" reason (and -1 no path) if cheap.
- #92 lows: malformed-key warning per request -> debug (or once per clientId, bounded) + malformed-key line in the
  instructions on every profile; stdio uses apiKeyStatus (whitespace = missing), connection.ts parses the raw header
  once; /api `all` text depends on the switch; messages "(a sodax_… key alone, at most 128 characters)" and 403 starts
  "A SODAX API key is required for the swap profile."; warn on --profile over HTTP too; tests with the switch off in
  connection.test.ts.

## Plan from here
Review fixes applied per branch in parallel (no rebase) -> final sequential bottom-up rebase pass over all 8.

## Done: #96 rebased onto new #95: tip fe79d9e (5 commits, c868dfc original), 563 tests, each commit typechecks.
- ASKING_TOOL = "the tool that asked for this token (sodax_swap_quote if none did)" used in resolved/ambiguous next steps.
- #96 README row still says "chain reads uncached" (wrong since the 5 s cache) -> fix in #96 review round.
For #97 (rebase --onto feat/86-get-balance 0ba4b59): checkAddress/resolveExactly get `field` param (before details);
rejectHex64 after byAddress in resolveToken around findChainKey/0xEeee nativeToken branch; quote resolveSide ->
resolveExactly(..., `${side}Token`, {side}) then packagedToken; balance.ts readBalances resolveExactly(..., "token");
swap.ts builders functions, addressText gone (address: textArg(128,1)), txHashArg() keeps #95 regex msg inside
screened(...), swapArgs.txHash description from #95; imports merge ChainKeys, DEPOSIT_SAFE from track.js, secrets,
AMOUNT_PATTERN; usdWarning in current quoteNextStep; errors.ts SECRET_REJECTED + ALERTED_CODES next to new texts;
sodax.ts withoutUrls + export bounded; tests expect ASKING_TOOL text (#97 swap.test.ts:72 old text); clearBalanceCache.

## #91 review-fix: bab68bf fix: take each SSE message's key from that message only (117 tests)
- Removed sseMessageApiKey + SseCaller (requestContext.ts), session map back to {transport, server}; POST /messages
  runs with {apiKey: callerApiKey(req)}. README "API Key (Optional)": SSE clients send x-api-key on GET and every POST.
- Upper adaptation (#94+ where session holds context with partnerFee): POST context =
  `{ ...session.context, apiKey: callerApiKey(req) }` (key only from the POST; partner fee from the GET connection).
  Session may store {transport, server, context} but never use the GET key for messages.
- PR #91 body: replace "the legacy SSE transport also takes it from GET /sse" with "SSE clients send it on GET /sse
  and on every POST /messages; each message runs only with the key it carries."

## #93 review-fix: 8996b18, 36945ac, 4cbbf2f (261 tests)
- otherChains: no native tokens, no cap; text "...then call sodax_resolve_token again with the chain the user confirms."
- Twin labels head+tail "USDC (0x2921…038894)", full address if head+tail collide; grouped by lower-cased symbol;
  helper twinAddress(token, twins) in swap.ts (not exported); shortAddress now head+tail. #94's twin/ambiguous next
  step should reuse twinAddress + lower-cased grouping.
- resolve_token chain description: 'Chain name, ticker or key, e.g. "Arbitrum", "arb" or "0xa4b1.arbitrum", or EVM
  chain id (e.g. "42161").' -> quote's chain inputs should add the same phrase.
- Log "No valid chain config for these swap chains" in loadCatalog else-block after the native-mark warning.

## #92 review-fix: 055ba9c, 3ac9b11, 943dbaa (177 tests)
- ToolSelection.swapKeyHint RENAMED keyHint (goes to builder too) -> server.ts line becomes
  `[...enabled(toolsets, INSTRUCTIONS), toolsets.keyHint]`; server/profiles/connection tests in #83+ use swapKeyHint.
- keyHintFor in profiles.ts; MAX_API_KEY_LENGTH exported from requestContext.ts; SelectOptions (not exported).
- connection.ts: single rawKey read + debug log; keep when merging #84's partnerFee/context.
- #84+ test "refuses a bad partner fee with 400, before warning about the key" must spy logger.debug, not warn.
- Malformed 403: "A SODAX API key is required for the swap profile. The x-api-key value (SODAX_API_KEY on stdio)
  isn't a SODAX API key (a sodax_… key alone, at most 128 characters): URL". New instructions line for malformed key.
  /api all off: "The builder tools; swap tools aren't enabled yet". HTTP boot warn "--profile and MCP_PROFILE are
  ignored over HTTP: ...".
- index.ts runStdio keyStatus lines next to #84 partner fee may conflict.

## #94 review-fix: b7f9b01, 94d3026, a95eb4b (423 tests)
- DEADLINE_TOO_SHORT added (after AMOUNT_TOO_LOW), default nextStep "Call sodax_swap_quote again with a longer
  deadlineMinutes, e.g. 15."; must stay OUT of RETRYABLE_CODES and ALERTED_CODES (#97). getDeadline: skew>300 s
  UPSTREAM_UNAVAILABLE "The swap service returned an unusable deadline." first, then DEADLINE_TOO_SHORT "That deadline
  leaves too little time to send the swap."; quote re-check DEADLINE_TOO_SHORT "Preparing the swap left too little
  time to send it."
- configDisagrees(chainKey, field, token?) logs {chainKey, field, token}: when #95+ moves it to source.ts keep the
  token param; quote.ts calls configDisagrees(resolution.chain.key, `${side}Token`, address).
- REFUSALS: Refusal interface + tryOther, NO_ROUTE, NO_LIQUIDITY; -1/-4 no route, -5/-8 liquidity, -14 too large.
- Partner fee message: "A partner fee needs both an EVM partner address (EIP-55 checksummed or all lowercase) and a
  whole number of basis points from 1 to 100."

## Done: #97 rebased onto new #96: tip e13c186 (5 commits, e8f3fff original), 669 tests.
- configDisagrees (source.ts) now SWAP_MISMATCH (alerted, non-retryable) with details {chainKey}; cancel SWAP_MISMATCH
  carry chainKey. swap_error counts toward #95's hourly cap.
For #98: AfterSend change in swap.ts quote handler (builders now function calls); lockfile viem vs @scure/bip39
different spots; #98's @noble/curves 1.9.1->1.9.7 for @scure/bip32 came with adding viem (keep what
--frozen-lockfile accepts). Canary: config disagreement fails fast; nextStep has USD sentence; usdValue in quotes.

## Done: #98 rebased onto new #97: tip 771626c, 696 tests, dry run green.
STATE when the usage limit hit (2026-10-27):
- Local branches feat/81..88 have all fixes + first restack; review-fix round 2 committed on 81 (bab68bf), 82 (3
  commits), 83 (3), 84 (3); #95 round-2 fix agent was running; #96/#97 round-2 reviews were running (results lost if
  not received). NOTHING of 81..88 pushed yet. Hotfix fix/sse-start-once pushed (no PR). ADR cd0d643 pushed.
- Remaining: (1) #95 round-2 fixes (check wt-fix-85 log), #96/#97/#98 round-2 reviews + fixes (#88 point: on send
  error + miss, track anyway unless the error was an RPC answer); (2) final bottom-up rebase pass 82..88 over the
  round-2 commits (notes above: keyHint rename, sseMessageApiKey removed -> POST ctx {...session.context, apiKey:
  callerApiKey(req)}, twinAddress, DEADLINE_TOO_SHORT not retryable, configDisagrees token param); (3) checks per
  branch; (4) force-push-with-lease 82..88 (old origin tips listed at top), push 81; update PR bodies (#91 SSE line).

## #96 round-2 review (received; NOT fixed yet)
1. sodax.ts:74 /^S[TN]/ is case-sensitive; c32 decode uppercases after S -> "St…" passes. Refuse by encoded version
   byte /^0x0[56](1a|15)/ (or `i` flag); tests St…, Sn…, quote with Stacks toAddress. Stacks burn + Injective zero
   addresses still pass (open low).
2. Say "figures can be up to 5 seconds old; follow a sent swap with sodax_swap_track" in the get_balance description.
3. balance cache: cache the pending promise (delete on rejection) to dedupe parallel reads.
4. ASKING_TOOL text -> "Pass chain.key and token.address to the call that returned UNKNOWN_TOKEN (sodax_swap_quote if
   there was none); amounts stay in token units."
5. Stellar wording "(after the account's reserve and open offers)".
Docs: README:202 "balance reads kept 5 s; other chain reads uncached"; ADR line 107 vs 3 workarounds (open sodax-sdks
issues and cite, or soften); PR #96 body stale; ttlCache.ts header half true.

## #97 round-2 review (received; NOT fixed yet)
1. MEDIUM (fix in #95): sourceChainFor (used by track/cancel) refuses a live chainId disagreement; with #97 that is a
   non-retryable SWAP_MISMATCH after the deposit is on chain -> stranded. Track/cancel read with pinned values, so:
   sourceChainFor returns the pinned id without refusing; the live-vs-pinned chainId check runs only in the quote.
   Cancel SWAP_MISMATCH text "couldn't be prepared" wrong for cancel (low).
2. MEDIUM (#97): withoutUrls regex quadratic + misses "key_https://" -> use /[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'\\<>]+/gi,
   add a 1 MB long-input test.
3. low (#97): amountArg pattern moves <=96-char secrets in amount to text-only refusal; use default check for amount
   and do the 64-hex "not an amount" check in handler screening.
4. low: configDisagrees token param (from #94 round-2) must survive the final rebase of #95 (source.ts).
5. optional (#97): other Latin BIP39 wordlists after NFKD + accent strip.

## Final pass progress
- #92 final: 5a78943 (176 tests, every commit typechecks) on #91 bab68bf.
- #93 final: 86a3e52 (272 tests, every commit typechecks).
- #94 final: 27b86ac (440 tests, every commit typechecks). SSE session {transport, server, context}; POST ctx
  {...session.context, apiKey: callerApiKey(req)}; connection.ts returns {context:{apiKey, partnerFee}, toolsets}.
- #95: round-2 fix agent running (+ the #97-review item: sourceChainFor must not refuse; chain-id check only in quote).
  Then rebase --onto feat/84 bc7011d... careful: #95's base at its restack was bc7011d (old #94 tip before round 2).
- #95 round-2 done: a236cdf, dbaff00, ef71686, bdde5b0, 0b31fc7 (545 tests). New final status source_not_found;
  not_submitted_unknown_quote.isDeposit; claimDeposit "claimed|taken|gone"; checkQuoteRoom; unknown_quote budget 5/h;
  live chain-id check in quoteSwap right after sourceChainFor; cancel used-quote -> QUOTE_MISMATCH.
- #95 final: d671ce5 (567 tests). configDisagrees(chainKey, field, token?) in source.ts.
- #96 round-2 done: 18cb26b, d59a530, 0edbd59 (567 tests). UNKNOWN_TOKEN_CALL text; Stacks mainnet-only by encoded
  version /^0x0[56]1[46]/; TtlCache.delete; balance description 5 s sentence; Stellar "(after the account's reserve
  and open offers)".
- #96 final: a2f308c (602 tests, every commit typechecks).
- #98 round-2 review received: send-failure rule (fail at send only on a validation refusal message + lookup miss),
  empty steps, retry only ExecutionRevertedError, lookup transport retryCount 0 ~4 s, decode swap calldata
  (token=USDC, amount), step timeout 30 min. Fix agent running in wt-fix-88.
- Next: #97 final rebase --onto feat/86-get-balance fe79d9e (after its round-2 agent), then #98 --onto feat/87 e13c186.
- #97 round-2 done + final: 94a2638 (722 tests, every commit typechecks). Added "fix: say every swap chain input
  takes an EVM chain id" (restores the resolve_token text lost in a take-theirs resolution and covers quote/balance/
  track inputs). alerts: unknown_quote budget 5 + checked 20, FIELD_VALUE_MAX 256; configDisagrees SWAP_MISMATCH +
  token + details.chainKey.
- Next: #98 --onto feat/87-safety-analytics e13c186 after its round-2 agent.
