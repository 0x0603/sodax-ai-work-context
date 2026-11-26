---
type: brief
repo: builders-sodax-mcp-server
github: 147
status: Active
next: merge feat/129-next-action (01b6187) in on the user's word, resolving swapDecisions.ts; docs page; kill switch off until a real bridge is tracked end to end
updated: 2026-11-26
---

# GH-147 Bridge tools · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Steps 1-7 pushed to `feat/147-bridge-tools` (`001d6a4`..`d85bf5c`, signed); draft PR #150 (base
  `feat/129-next-action`, `Closes #147`). Worktree `sodax-command-center/repos/client/builders-sodax-mcp-server-wt-147`.
- `/simplify` + `/code-review` fixes pushed as `9ef5d54` on top of `d85bf5c`. `BridgeRequest` takes the SDK's
  field names and the wire body comes from `toCreateBridgeIntentParamsV2`. The swap helpers are reused (approve
  checks, `resolveSide`, `addressesNeeded`, `depositTerms`). Swap wording is reworded once at the tool boundary
  (`actionTool` `reword`). Track proves each step past the source on the hub or the relay: from Sonic, the user's
  own tx's packet; to Sonic, the delivery Transfer/Withdrawal in the hub receipt. A reverted hub tx is not a success.
  HookFailed counts only for this bridge's wallet. Alerts without a build spend the public budget. SDK `VALIDATION_FAILED` maps to AMOUNT_TOO_LOW / BRIDGE_REJECTED.
  Relay packets are zod-validated. The store checks room before upstream calls; `/health` has `openBridges`.
  Gates: lint, checkTs, 2321 tests, live contract 55 green; each fix mutation-checked.
- PR #150 review (2026-11-26, at `997f768`): fixes pushed as `47a885c` (signed), gates green (lint, checkTs, 2333
  tests, each fix mutation-checked). A `failed`/abandoned row is stale, not a verdict (SDK `getDetailedStatus`,
  backend `getSubmitTxStatus`): track asks the relay for the source tx's packet and follows its hub tx; only one the
  relay hasn't carried is `relay_failed` (from Sonic: the hub's outgoing packet). A non-retryable submit-tx refusal
  alerts `bridge_submit_rejected` and returns `not_submitted`/`submit_refused` (swap parity; key refusals excluded).
  `dst_tx_hash` passed verbatim (relay writes base58 / bare txids) and regex-checked. Sonic receipt-before-tx waits.
  Store `retryAfterSec` = oldest holding build's expiry. Past the claim a 401/403 is rewritten to a retryable
  UPSTREAM_UNAVAILABLE (a new key can't track the bridgeId; swap parity). Token tools default `for` to the module and reword bridge
  failures. README `bridge` profile. Rejected: claimed-build TTL (settled 10'+30', agent polls end inside it); 409 on
  build routes (only `submitTx` throws ConflictError, bridge.service.ts:300).
- Pushed as `7077dba` (signed): bridge `batch` (EIP-5792 approve+bridge, EVM spokes only: from Sonic track checks
  the deposit as the tx itself, which a 7702/4337 batch tx isn't), `batchAt`, shared `SEND_BATCH` wording; README
  says steps carry no nonce/gas/fees and the server neither signs nor broadcasts. Wallet MCPs checked 2026-11-26:
  Coinbase `send_calls` takes chain name + `{to,value,data}` (no Sonic; hash return undocumented), Phantom `evm_send`
  takes `{chainId,to,value,data}` (no Arbitrum/BSC, no batch). Signer-only broadcast: gosodax/sodax-mcp#151 (Feature,
  sub-issue of #119, Backlog; per-step fill, own broadcast tool, shared swap+bridge), not in #150.
- User asked to complete all four bridge agent-flow gaps in PR #150 (2026-11-26). Implemented and pushed as
  `83f411c` (signed): shared three-retry hash correction and help-desk handoff; `bridge_tokens` now offers
  `choose` pair -> `provide` amount -> preview; permanent decision-contract tests; a shared runtime host plus
  full bridge workflow, interruption, pending batch, corrected-hash persistence, poll and error-bound tests.
  README runtime snippet and PR description updated. Gates: lint, checkTs, build, 66 files / 2,967 tests passed;
  new tests also typechecked directly. Both the unbounded retry and missing bridge hash persistence were
  reintroduced temporarily and caught by regression tests, then restored. No live bridge was signed or broadcast.
- Contract-only first-time agent walkthrough (2026-11-26) on isolated `83f411c`: 14 MCP calls, real
  production API/public RPC preview and unsigned prepare succeeded; no signing/broadcast. Discovery and bounded
  domain-error recovery worked. Five UX recommendations (wallet requirements, discoverable action protocol,
  fee/check status, earlier unseen-hash verification, protocol-error fallback) are recorded in `agent-feedback.md`,
  with sampled evidence in `artifacts/agent-onboarding-2026-11-26.json`. Recommendations were not implemented.
- #138 and #145 still open. GitHub redirects the repository to `gosodax/sodax-mcp`; local paths are unchanged.

## Blocked on

1. Bridge PR targets `feat/129-next-action` until #138 merges, then retarget to `development`.

## Next action

The base `feat/129-next-action` moved to `57f1996` after `9ef5d54`: merge it in (never rebase) on the user's word.

## Settled — do not re-litigate

- Base on #138 (user, 2026-11-23). Not on #137 (conflicting) or #145 (merge in when tracking).
- Scope (user, 2026-11-26): every source the swap tools start from (EVM, Sonic, NEAR, Stellar, Sui, Solana,
  Injective), reusing their source adapters (`plan.md` D3b); not Bitcoin, Stacks, ICON. Destinations: any chain.
- No story points until (a) and (b) have a worked-out approach.
- SDK first (user, 2026-11-25): types, chains, tokens, ABIs come from the SDK; no chain/token list in bridge code.
- Backend builds, MCP rebuilds with `sodax.bridge.createBridgeIntent` raw and compares byte for byte (ADR 0001
  D3/D5; bridge-api simulates every build on the hub). "MCP builds itself" was tried and dropped 2026-11-25.
- Own `bridge` profile + `SODAX_BRIDGE_TOOLS_ENABLED` (ADR D4); the connection's partner fee applies; no recovery
  tool; record 5' sign-by + 30' grace (user, 2026-11-26; was 10'), resume from the source tx is a main path
  (`plan.md`). A build or swap quote with no deposit, past its 5' sign-by and not held, gives way when a new one
  needs room (per key, per client IP, or server-wide, swap's deadline ranks too); a track or cancel call with a
  well-formed hash holds it 5' from that call (polls renew it), a claimed deposit keeps it for good. Swap's on-chain
  deadline is unchanged: its 5' sign-by is a separate `expiresAt` the agent sees.

## Open

- Architecture discussion (2026-11-26, proposal only): share an action-store/lifecycle engine, admission
  quotas/concurrency and invariant tests, with typed swap/bridge payloads and separate retention/domain policies.
  Keep swap solver/deadline/cancel/refund logic and bridge vault/delivery logic separate. No refactor authorized
  or implemented; first extraction should address the two pinning/eviction findings consistently.

- /simplify + /code-review round (2026-11-26), in `3a06fb4`, 3391 tests, each fix mutation-checked: shared
  `src/services/signWindow.ts` (sign window, hold, releasable, open counts) for both stores; `resolveSentTx` holds a
  quote once its hash checks; batch-id hint only on EVM; schema fails to compile on a missing variant, runtime tests
  parse every action; prepare descriptions state the 5' window + wallet; shared signing rules said once. Code review:
  claimed builds kept 24h apart from unsent ones, `handedOver` counted in `/health` and stop/crash alerts; submit-tx
  404 retryable (route never answers 404, checked in bridge-api); stale-row relay read error retried, not `held`;
  `bridge_used` / `bridge_submitted_differently` alert from the checked budget; token tools offer `for: bridge` only
  with bridge tools on, and fail in a bridge's words for one; non-EVM bridge CHAIN_UNAVAILABLE bounded; ADR refs
  dropped from public code. Skipped by design: eviction of an unsent build past 5' (user's call).
- Claimed-build retention (2026-11-26): kept 24h (Sonic delivery proof and resubmit need the build; hand relays take
  hours), now capped at 10k: past it the oldest handed-over build gives way, one not handed over is never dropped.
  Note: swap keeps 24h only for quotes with no backend row; a submitted swap quote lives deadline + 30' (<= 90').
- Pushed `3a06fb4` to `feat/147-bridge-tools` (PR 150), 3392 tests. Next: PR review.
- Five-minute expiry/pinning review (2026-11-26): both P2s fixed, in `3a06fb4`. The pin became a 5' hold set only
  after the hash is checked; swap's past-deadline eviction skips a held quote. Regression tests added and
  mutation-checked. See `expiry-review.md`.

- **Committed in `3a06fb4` on top of `a78690e` (2026-11-26), gates green (lint, checkTs, build, 3302 tests, mutation-checked):**
  agent feedback round + MCP-side abuse limits. (1) Swap and bridge instructions and price/preview `nextStep` say a
  wallet tool must sign, send and report receipts before preparing. (2) `src/public/next-action.md` is the contract
  (README links it), served as `sodax://next-action`; the full zod `nextActionSchema` (typed as `NextAction`, every
  decision tested against it) is served as `sodax://next-action/schema`; `tools/list` keeps a light `type` enum
  (~4 KB for the bridge profile vs ~87 KB inlined). (3) Bridge preview/prepare carry `networkFee {paidIn, estimated:
  false}`; bridge-api has no fee of its own (`getFee` 0 without a partner fee). (4) `seenOnChain` is tri-state; a tx
  its node definitely doesn't know is polled 8× then the hash asked again (bounded). (5) `txHash` is checked in the
  handler: INVALID_TX_HASH with a nextAction, and the batch-id hint. Abuse: open builds/quotes capped per client IP
  (100); at any cap the oldest build/quote unsent and unheld past its 5' sign-by gives way, else a refusal with
  its own nextStep and retryAfterSec ≤ 5'. 3304 tests. Key enforcement is the backend's
  (bridge-api read routes and swaps-api not enforcing, probed 2026-11-26).

- Read-only auth/resource assessment (2026-11-26): bridge profile requires a key-shaped header, but MCP
  validates format only. A synthetic nonexistent key passed the local profile gate. Preview performs hub RPC
  work without backend key verification. Existing per-IP limits and store/SSE caps do not supply authenticated
  per-org quotas or a global bridge-work concurrency budget. Backend scopes exist but enforcement is deployment
  dependent. Production `/api` did not list bridge; keyless Bridge API tokens GET returned 200. See the process
  entry; no load testing, public issue, or implementation change. Formal security triage belongs in AuditMap.

- Bridge nextAction gaps (found 2026-11-26 at `7077dba`): **fixed in `83f411c`** (pushed by another agent; verified:
  lint, checkTs, build, 2967 tests; reverting each of the bounded hash ask, the pairs `choose` and the kept
  `bridgeId` fails 6-7 tests). `askTxHash` is shared with swap (bounded by `MAX_ASKS` 3), bridge decisions have the
  contract and loop tests, a bridge reference-runtime test drives tokens → preview → prepare → send → delivered.
- PR #150 is `CONFLICTING`: base `feat/129-next-action` moved to `01b6187` (2 commits); a merge conflicts in
  `src/tools/swapDecisions.ts` only. Merge in (never rebase) on the user's word.

- Batch review P2s (2026-11-26): **resolved in `7077dba`.** Bridge `checkSource` refuses a matched spoke deposit whose
  tx carries any other connection Message (`sourceTx.messages.length > 1`: another deposit, a cancel, a direct
  message): `not_submitted` / `multiple_messages`, alert `bridge_multiple_messages`, no claim, no submit. Verified:
  the relay's EVM verifier signs a packet per connection log with the chain's NID, no sender filter
  (`intent-relay` `verifiers/evm/src/index.ts:141`), and bridge-api `pollBridgePacket` takes the first packet by tx
  hash + chain. Not batch-specific (any 4337 deposit rides a bundler). Real txs from sodax-sdks PR #504, decoded:
  Ethereum `0x6130…f3ae` (MetaMask 7702, from = to = EOA `0xb924…`), Base `0xa289…1775` (relayer EOA `0xc066…` →
  contract `0xdb9b…`, user EOA delegated `0xef0100…63c0…`): the user appears only as the message's `transfer.from`,
  one Message each. Swap had the same gap (swaps-api `relay-poll.ts` also takes the first packet by tx hash):
  fixed in the same change, user's call: `checkQuoteDeposit` counts every message, reason stays `multiple_deposits`
  (released API), wording says "another deposit or a cancel". The 5 real non-EVM mainnet deposits in
  `non-evm-txs.json` each carry exactly one connection Message (now asserted), so a lone deposit never trips it. Residual, as swap: without a build a
  backend row is followed with no message count.

- **Bug in `9ef5d54`:** the deployed hub asset manager emits `HookFailed(address,string)` (topic `0xfc062a14…`;
  7 logs, 0 of the bytes topic, blocks 79.1M–83.1M, checked 2026-11-25). `src/services/swap/sourceTx.ts:27` and
  the SDK ABI use `HookFailed(address,bytes)`, so track never reports `held_on_hub` (safe: in_transit, then a
  person). Fixed in `997f768` (pushed 2026-11-25): the string topic, tested against that signature; a real log's
  emitter is the configured asset manager and its data word 0 the wallet. Gates green. SDK ABI still wrong upstream.
- Kill switch stays off until one real bridge is tracked end to end (needs funds).
- Docs page in sodax-sdks.
- Without the build, a spoke→Sonic bridge can't be shown delivered (stays in_transit, then a person): accepted,
  never a false "delivered". No unsent deposit is submitted without its build (any source); resume deferred.
- Optional before the switch: evict unsent builds past the sign window when the store is full (swap's `makeRoom`).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the backend/SDK give, with file:line | `issue.md` | 0.6k |
| Review findings and decisions needed before planning | `process.md` | 2.0k |
| Five-minute eviction and tracking-hold review, and its fix | `expiry-review.md` | 1.1k |
| First-time agent feedback and sampled MCP evidence | `agent-feedback.md` | 1.9k |
| Design decisions with code refs, route/failure tables, build order | `plan.md` | 3.3k |

## Landmines

- `HookFailed` rests on the hub asset manager ABI only (`sodax-contracts` unreadable); 0 events on chain in ~56 days.
