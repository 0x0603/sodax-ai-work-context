---
type: brief
repo: builders-sodax-mcp-server
github: 118
status: Active, in review — PR #124 head 5dedece, base development (52 files, mergeable), review requested from R0bi7 2026-11-18
next: wait for R0bi7's review of #124; real non-EVM swaps need funded wallets (user's call, #130)
related_issues: [79, 115, 117, 123]
updated: 2026-11-18
---

# GH-118 Swap from non-EVM chains · brief

## State in five lines

- 2026-11-18 (latest): catch-up merge of development (#117's squash `36ab701`) pushed as `5dedece`; #124 retargeted
  to development, body updated, R0bi7 requested.
  Routed through a signed intermediate `0a8e813` (development + #117's last tip `6716985`): 18 conflicts → 1
  (`cancel.ts` `hubCancelled`). #117's last fix (a hub cancel counts only if mined after the creating tx) ported
  onto #118's `SourceTx`: the hub variant now carries `blockNumber`/`txIndex`. One #118 test now expects the one extra
  read that order check makes. Unit 1269, contract 48/48, checkTs + lint green.
- 2026-11-16 (latest): /code-review of #124 @ `412d5ff` gave 15 findings; each re-checked in code and in SDK
  `@sdks@2.2.0`; fixes A-F implemented, then /simplify + /code-review; #10 and #12 reverted on review (accepted
  risk / no safety gain), #13 reverted (README contract); four review rounds in all. Pushed as `4b27407` on
  `feat/118-swap-from-non-evm` (signed, hook green): unit 1267, contract 48/48. Details: `plan-review-fixes.md`
  §Outcome.
- 2026-11-16 (latest): #117's review fixes (`827de4b`, see gh-115 brief) merged into #118 as `412d5ff`. Conflicts in 9
  files: #118's adapter structure kept (it already had `kind` on `SourceChain`), #117's behaviour ported onto it:
  `intentClosed` before any cancel build (non-EVM spokes too, read past the row's `dstIntentTxHash`), hub reads in
  track, `intent_closed`, `pollUntil`, per-key memo, `alertStranded`, `checkSwapTx` (keeps #118's prunes/failed/unreadable
  rules) with `not_this_swap`, live-catalog chain support (`sui` can start; wording "can't start a swap from it.").
  `hubIntentClosed` mocked in `swapNonEvm`/`swapTrack` tests (they called the real Sonic RPC via `initSodax`); new
  test: a non-EVM cancel isn't built once the intent is closed. tsc, biome, 1250 unit, contract 46/46. #124 diff now
  49 files (`chainSupport.test.ts` changed for non-EVM). PR body note added.
- 2026-11-16 (now): PR #124 (gosodax/builders-sodax-mcp-server) opened 2026-11-13 on #117, head `c3234ef`, CI green,
  no review yet (the "@claude make PR review" comment ran nothing: the repo has no Claude workflow). Commits since the
  log below, written on the other machine: `4ad0af7` proves non-EVM swaps by the connection's own messages (fixes both
  P2 findings, regression tests `sources.test.ts` "Noop", "two deposits", `swapNonEvm.test.ts` claim boundary and
  cancel without a message) and moves every source to an adapter in `src/services/swap/sources/` (plan-source-adapters
  steps 1-4); `210fde6` unreadable events answer once; `c3234ef` review fixes (unverified tx alerts, NEAR FINAL, Solana
  finalized, checked deposit not re-read). PR body validation (not rerun here): 1225 unit, contract 44, local E2E
  113/114, real third-party deposits matched; no real non-EVM swap sent (test wallet unfunded there).
- 2026-11-16: #117 was CONFLICTING with development since #123 (rename to `sodax_swap_submit_and_track`, UNSUPPORTED_SOURCE
  names the source chains, `sent` variant on track/cancel) merged on 2026-11-12. Merged development into both, no
  commit, worktrees `repos/client/builders-sodax-mcp-server-wt-117` / `-wt-118`. #118's resolution was made by applying
  its own diff 3-way onto #117's resolved tree, so a later merge of #117 into #118 is clean. Choices: #123's cancel
  `not_submitted` wording (reviewed fix), #117's "swap service hasn't processed" for not_on_hub_yet, #117's
  cancel_confirmed renamed; #118 keeps its adapter check in `sourceChainFor` and takes #123's `unsupportedSource`, with
  the SDK config's sources as the default list when there is no catalog. #123's "Sonic isn't a source" tests re-aimed:
  Sui in #117, ICON in #118.
- 2026-11-16 /code-review of both merges (8 findings, all wording/resolution, no mechanical fault). Fixed: (1) #118
  cancel of a quoted non-EVM tx its node doesn't have yet said not_submitted, whose #123 text claims track "won't
  submit anything here", but before the deadline track submits it once it lands: now `not_sent` before the deadline
  (`cancel.ts` unsubmittedDeposit, new test); (2) #118 dropped "yet" again (6eb9ab5 removed it: ICON/Bitcoin/Stacks
  aren't planned); (4) #118 pinnedSource refuses with the `sent` variant; (5) cancel_confirmed "won't submit it"
  (hub swap may never have been submitted), both; (6) #117 keeps its static UNSUPPORTED_SOURCE fallback; (8) README
  sentence order. Not fixed: sent-path still checks the live catalog (same on development, pre-existing); a shared
  "won't submit" helper (cleanup). Results: #117 tsc, biome, 1105 unit, build, contract 29/29; #118 tsc, biome, 1230
  unit, build, contract 44/44 (contract runs were before the review fixes, which touch wording and cancel only).

- Split out of #115 on 2026-11-11 (user): Sonic ships in PR #117 first; non-EVM follows in one PR for all five
  families (NEAR, Stellar, Sui, Solana, Injective). Not a sub-issue of #79 (user asked).
- Out: Bitcoin (Bound trading wallet), Stacks (public key, post-conditions, SDK cancel bug), ICON (retired).
- Approach in the issue body: keep the Swaps API as builder and check its build per family at quote; track proves the
  swap on the hub after the relay (held quote, `IntentCreated` = quoted intent hash), Solana checks keccak(relayData)
  in the tx before submit. Differs from #79 D5 (a draft the user may adjust); the issue says why, the PR body repeats it
  for review.
- 2026-11-11: implemented, uncommitted, in worktree `.claude/worktrees/118-swap-from-non-evm` (branch
  feat/118-swap-from-non-evm off feat/115-swap-from-hub). 1119 unit + 37 contract tests green after the review round (canary), incl. a live
  Solana quote and real-deposit fixtures for all five families. Design differs from the issue body: see plan.md
  (local SDK build of the swap tx; payload-in-tx check before submit; no hub check, no held quote).
- Bug caught by the live test and fixed: toAddress defaulted to a non-EVM sender's address on an EVM destination.

- 2026-11-11 review round, pushed as `d255d16` (+ merge `84794c2`): Injective swaps from EIP-712 wallets are
  `MsgExecuteContractCompat` (msg as JSON text), which the parser missed (real swap AC4D677E…, hub 0x4087b43a…, now
  the fixture; the old fixture was a non-swap deposit). Solana programs (from the IDL, read via RPC) pinned to config
  for deposit and cancel; Sui package (latest_package_id, read via RPC) must equal the Swaps API build's `to`
  (`callsPinnedTarget`). Sui raw tx gets `sender` (SDK leaves it unset). Injective/Sui not-found only from the node
  itself (Injective 404 + code 5; Sui NOT_FOUND message naming the digest). Missing marker → INTERNAL alert; unknown
  NEAR stage throws; secrets: `ed25519:` NEAR key, Solana keypair file. Renamed Spoke* → NonEvm*. 1140 unit,
  contract 39/39. Issue body updated.

- 2026-11-12 retest + senior review (agent + own), pushed as `b2fa4cd` + merge `16b9cb9` (carries 115's `1112c9d`): 1149 unit, contract 39/39, Docker on canary 58/59 (the miss was a test address that exists).
  Real mainnet swaps proven `match` by the MCP's own check: Solana 5, Stellar 4, NEAR 1 (archival RPC), Injective 1;
  no recent Sui swap exists (latest ~21 days, pruned), fixture only. Quote -> SDK build -> track check agrees for
  SOL/USDC, XLM/USDC, SUI, NEAR/USDC, INJ with real funded senders (signer, asset manager, payload, gross amount).
  Fixed: NEAR deposit the asset manager's own receipt rejected = failed (token refunds it; a later callback failure
  still isn't); base58 hashes must decode to 32/64 bytes (was CHAIN_UNAVAILABLE retry loop); Injective LCD asked 3x
  on NotFound (its nodes keep different history: a 17 h old swap read ~50% of the time); non-EVM `deposit_mismatch`
  text no longer calls someone else's deposit the user's; non-EVM `source_not_found` says the node may have dropped
  an old tx; asset-manager marker required in pinnedSourceOf (refused at quote, not after deposit); NEAR RPC read at
  quote; Solana/Sui build mismatch blamed on the local build, not the Swaps API; signing hints a full Record + Stellar
  sequence caveat; shared base58Bytes in constants.ts. Not done: non-EVM sender check and multiple-deposit count
  (residual), Sui reader's private SDK field, separate family tags in SourceTx/SwapSource, cancel without quote of a
  pruned old tx ends in 10 retries then "give support the hash", alert title "of its sender's" for non-EVM.

- 2026-11-12 sync + simplify + /code-review xhigh (user): #118's diff re-applied 3-way on the rebased #117 and squashed
  to one commit (the 3 old commits were written on the old #117). #121 conflicts: README RPC row (folded into
  RPC_CONFIG), sodax.ts imports, source.ts chainRead without its label. Simplify (4 agents): marker on NonEvmSource,
  SourceTx carries its source (dead family fallbacks gone), shared HEX_64, hexToBytes, isRecord, regex constants,
  EvmStep in the canary script. Code review (14 findings), fixed: SDK console.log on stdout in stdio (Solana IDL
  fetch) → console to stderr; markers SDK-free (Solana base58, Stellar StrKey base32), so chain support answers
  without the SDK; UNSUPPORTED_SOURCE lists sourceChains (swap profile has no chain support tool); Injective per-try
  timeout (AbortSignal needs an integer: caught by a test) and pruned-height 500 read as unknown; NEAR signer check
  (other_sender / not_a_deposit, cancel too) and "asset manager never ran" = failed; keccak only for Solana; Solana
  deposit must name the packaged connection program; non-EVM wording; alert title; cancel without quote of a pruned
  non-EVM deposit → QUOTE_NOT_FOUND with a final nextStep. Skipped: multiple-deposit count, Sui private field,
  per-family descriptor, @scure/base. 1206 unit, contract 39/39, Docker 58/59, real txs re-matched (NEAR via
  archival RPC_CONFIG; the Injective one is now pruned everywhere).

- 2026-11-12 final retest on the pushed commits (#117 4bfba30, #118 cb3b74e): unit 1099/1206, contract 29/29 + 39/39,
  Docker canary 27/27 + 59/59 (Stellar test now a fresh random account → SWAP_REJECTED), production container reads.
  Real canary swaps signed by the E2E wallet: Arbitrum→Base via the #118 image (swap 0x849c90ec…, solved, 1.493921
  USDC arrived) and Base→Arbitrum via the #117 image (swap 0x3f52749a…, solved, 1.48392 USDC); then track/cancel of
  both with and without quote, the approve tx, cross-container: all right. 4 real Sonic cancels: IntentCancelled
  check true, and the MCP's hub cancel rebuild holds the exact real cancelIntent calldata. stdio in Docker with a dead
  Solana RPC: stdout JSON only (the deposit path hits only getAssetManagerIdl's console.error; console.log is in the
  cancel build, not reproducible without a backend row). Fresh Solana swap 5vtqe7iEM6… matched; recent Injective and
  Sui swaps already pruned on public nodes. Found and fixed: "not a Injective transaction" wording, pushed as 19ad94e.

- 2026-11-12 chain coverage + quality review (agent): 22 SDK chains, 19 sources (all but bitcoin, stacks, 0x1.icon).
  Docker matrix per chain (support, resolve, balance, quote from, quote to): all sources quote `ready` with the right
  step; misses were outside the code (redbelly: no route on canary; polygon/ethereum: SDK public RPCs, fine with
  RPC_CONFIG; injective test wallet short of 1 INJ; ICON sample was the zero address; Bitcoin balance times out on
  development too). 26 real swaps on all 13 EVM spokes matched. Fixed and pushed as `597db5b` (the kill switch part
  and README step 1 expiresAt wording as #117's `8d00e27`, #118 rebased on it, same tree): chain support says "turned off"
  under the kill switch; UNSUPPORTED_SOURCE lists
  the live catalog's sources as ChainInfo; Ethereum-style (0x) NEAR senders refused at quote (relayer + account
  contract, track can't see it); Injective sender read as signer (EIP-712 wallets) + hint; mismatch wording only
  "can't tell who sent it" where no signer is read; non-EVM awaiting drops "batch id"; checkPinnedTarget shared;
  casts; comments trimmed; HEX_64 direct. Regression caught live and fixed: per-try Injective timeout failed a read
  on one slow node → a slow try is retried, unknown only if every try said so. 1211 unit, contract 39/39 + 29/29,
  Docker 27/27 + 59/59.

## Blocked on

1. Human review of #117 and #124 (none yet).
2. Real non-EVM swaps (quote, sign, submit_and_track, solved; and a non-EVM cancel, never run live) need a funded test
   wallet per family and the user's explicit test scope.
3. Production `RPC_CONFIG` for NEAR/Sui/Injective (nodes with enough history) is ops' (gh-120: Robi on Coolify; no
   `/health.rpcConfig` yet to check it). Public Sui/Injective nodes prune fast, so a late track reads not found.

## Next action

#117 merged 2026-11-17; #124 caught up (`5dedece`) and retargeted to development 2026-11-18. Next: R0bi7's review.
Merge, never rebase. Follow-up, not blocking: gosodax/sodax-sdks#628 (public reader of connection messages).

## Settled — do not re-litigate

- One PR for all five families, not one per family (user 2026-11-11).
- Bitcoin, Stacks, ICON out; README in #117 says so.
- Swaps API stays the builder (#79 D2/D3); the quote-time check of what the user signs stays.
- Decoders live in the MCP behind one interface per family, replaceable by an SDK helper later.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Scope, approach, per-family table, done-when | `issue.md` | 2k |
| What each family's tx, proof and cancel look like, with code refs; effort | `research.md` | 2k |
| Original implementation plan and current-plan link | `plan.md` | |
| Final review, proposed adapter design and acceptance criteria | `plan-source-adapters.md` | 2k |
| 2026-11-16 /code-review of #124: verdict per finding, fix plan A-F | `plan-review-fixes.md` | 3k |
| History | `process.md` | |

- 2026-11-11: moved under the follow-up epic #119 ("Sodax MCP: agent-executable swaps (follow-up)"); #79 keeps phase 1 (#99, #103 stay there).
