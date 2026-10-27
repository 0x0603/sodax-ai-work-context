---
type: process
repo: builders-sodax-mcp-server
github: 79
updated: 2026-10-27
---

# Process

## 2026-10-23 — design discussion, not yet in plan.md

- Balance: swaps-api has no wallet-balance route (only `POST /swaps/allowance/check`). swaps-api already runs the full
  SDK, whose `sodax.spoke.getWalletBalance(s)` covers every chain, and reads chains through `RPC_CONFIG` (paid RPCs;
  swaps-api README calls the public defaults unreliable). Proposal: a BE balance route that MCP calls, which removes
  MCP's chain readers and RPC config.
- Custom RPC: R0bi7's #86 has a per-call `rpcUrl`. The SDK has no per-call RPC, so either side must build a client per
  request. The user's leaning: no custom RPC for now, monitor usage, avoid SSRF. If added later: allowlist, https, no
  redirects, balance only, never for the source-tx check.
- Full SDK vs light: the 11 high advisories trace to `axios`, `bigint-buffer`, `toml`, `ws` (all but `ws` fixable via
  overrides). Bridge and leverage yield already have BE APIs; money market and staking do not. Undecided.
- Discord with R0bi7: the epic is "core draft and not final decision plan"; the user may adjust. Full SDK was chosen for
  its utilities. Swaps first, other features later. Vision: MCP is one integration beside API, SDK and a future CLI;
  "all integrations essentially hit API more or less, using API key". R0bi7's TLDR: "I want my agent to do swaps using
  MCP only, using my private key locally to sign tx" (ambiguous against D1, which rules out local signing).
- Signing, per the user: the agent holds the private key and signs. Plan keeps the agent broadcasting and handing MCP
  only the tx hash; MCP broadcasting a signed tx would break "never broadcast" and need paid RPCs in MCP again.
- Settled 2026-10-23, point 2 (intent): MCP calls `/swaps/quote`, computes minOut from `slippageBps`, gets
  `/swaps/deadline`, then `/swaps/intents`; never `includeTxData` (BE sets minOut = quote, deadline 0, verified on
  `development` swaps.service.ts:133-141). Follow-up: BE could accept `slippageBps`/`deadline` on `includeTxData`.
- Settled 2026-10-23, point 3 (source-tx check): the right home is BE `submit-tx` (it checks only dedup and deadline
  today). Interim: MCP checks EVM with viem on a paid RPC from env; non-EVM sources wait for BE.
- Rate limit (point 4), 2026-10-23: `builders.sodax.com` has no gateway today (only the app's `express-rate-limit`,
  100/60s); BE `submit-tx` is 10/60s per IP (`HaproxyThrottlerGuard`). The user asked Paul and R0bi7 on Slack;
  R0bi7: "We will set it to go through haproxy". API key forwarding to BE is mandatory. Consequences: D2 back to the
  epic, decision 6 shrinks to honouring 429/Retry-After, decision 7 drops keyless swaps. Raise with Paul: one key
  counted on the MCP hop and again on each MCP->BE call (a quote is 3-6 BE calls); gh-1372 keeps the per-IP write cap
  (120/min) and jail (1500/10s), so MCP->BE traffic shares one IP unless HAProxy trusts X-Forwarded-For from the MCP
  or exempts it; the MCP limiter sees HAProxy's IP behind the proxy, so drop it or set `trust proxy`.
- API key, settled 2026-10-23: MCP is a pure forwarder. It sends the client's key when present and calls BE keyless
  otherwise; BE (`API_KEY_ENFORCEMENT` off/monitor/enforce, default off) and HAProxy decide. MCP maps 401/403 to
  "API key required" with a link and 429 to `RATE_LIMITED {retryAfterSec}`. Keyless traffic makes the
  X-Forwarded-For point for Paul more important. R0bi7's epic left keyless as an open item.
- Cancel (point 6), 2026-10-23: `/swaps/intents/cancel` returns only `tx`; relaying needs a separate
  `/swaps/intents/submit`, whose DTO requires `relayData` for Solana/Bitcoin sources, which cancel never returns.
  BE task-executor `intent-canceller` auto-cancels expired intents but skips deadline=0 ones (only the creator can
  cancel; `intent-canceller.service.ts:120-127`), another reason never to use `includeTxData`. Proposal: keep the
  two-call EVM cancel (decision 5); other sources rely on deadline expiry plus the BE canceller; `track` reports it.
- Partner fee (point 7), settled 2026-10-23: the user rates it very important; phase 1 adopts builder-set fees
  (model 2). BE `partnerFee` is per request `{address (EVM hub), percentage <= 100 bps | amount}`, not tied to org or
  key. Config at connection level only, like the profile: headers `x-sodax-partner-address` +
  `x-sodax-partner-fee-bps`, or URL query `partnerAddress` + `partnerFeeBps` (clients that only take a URL), stdio env
  `SODAX_PARTNER_FEE_ADDRESS` + `SODAX_PARTNER_FEE_BPS`. Never a tool input (prompt injection could redirect the fee).
  Invalid config: HTTP 400. Same fee on `/swaps/quote` and `/swaps/intents`, cached with `quoteId`, shown in the quote
  output. Replaces plan decision 7's "No partner fee". Later: BE org-level fee (model 3).
- Speed tier dropped (no such field in swaps-api). `glama.json` unchanged (schema has only `maintainers`).
- ADR revised and pushed as `f59edf0` on PR #90 (2026-10-23): D2 behind HAProxy and pure key forwarder; D3 full SDK with overrides; D5 phase 1 sources
  EVM only until BE verifies non-EVM; quote partner fee and BE balance; track check moves to BE (MCP interim EVM);
  cancel plus BE auto-cancel; safety rule on partner fee; new open questions. Do not name teammates in the ADR.
  Destination check: MCP via SDK helpers now, BE `/swaps/intents` later.

## 2026-10-26 — #85 / #86 open questions settled

- RPC source: `SODAX_RPC_URL_<chainId>` from env when set, else the SDK's packaged `spokeChainConfig` default.
- Client-supplied RPC: asked for, then dropped again for security, so ADR D5 ("No `rpcUrl` input") holds. Reasons:
  SSRF from a public server; a client RPC could fake the source receipt #85 checks before `submit-tx`; paid RPC URLs
  embed keys; the SDK has no per-call RPC. Revisit only for balance reads, under the 2026-10-23 conditions above.
- Polygon's SDK default is dead and Ethereum's flaky, so staging and production set `SODAX_RPC_URL_137` / `_1`
  before the swap switch turns on.
- Expired on-time deposits: the MCP relays them so the backend canceller refunds (`plan-85-swap-track.md`
  §Relay-for-refund). Verified the canceller reads the orderbook built from hub events, not swaps-api rows.
- Key-bound quotes: same key for quote, track and cancel. A mismatch used to read as a missing quote, which alerts
  the operator and can lead the agent to deposit again; it now returns `QUOTE_KEY_MISMATCH` with no alert. Status
  reads need no key, so a submitted swap is readable with any key.
- #86 gas: no gas estimate, only the zero-native warning; a short-of-gas tx fails at broadcast and the agent sees it.
  #86 cut to one job per tool: `sodax_get_balance` reads balances only (no allowance: the quote already returns
  the approve step), and the quote reads no chain (keeps #84's `not_checked` and backend approval). No
  `INSUFFICIENT_FUNDS`. `plan-86-get-balance.md` §Scope cut; no open questions left.
- Agent flow review: resolve ran twice (tool + inside the quote) and price-only is rarely needed when the agent holds
  the key; both cut in a commit on PR #94 (`plan-84-swap-quote.md` §Follow-up commit). A missed `sodax_swap_track`
  strands the deposit: the ready quote returns `afterSend`, and a BE deposit watcher is the real fix (`plan.md`
  §Follow-ups). No MCP-side chain watcher.
- #85 implemented in the working tree (commits 1–5 of plan-85) by a forked agent; departures: no in-memory cancel
  payload map (the second call rebuilds the cancel, the build is deterministic), cancel integrity failures are
  `SWAP_MISMATCH`, the quote refuses Sonic sources (hub path unreachable until plan-85 commit 7).
- #87 plan reviewed by an independent agent: no blockers; 9 should-fix items applied (see plan-87 §Review).
- #85 /simplify (4 agents): applied the shared `source.ts`, one cancellability rule for track and cancel, hub and
  fill hashes validated in the status schema, `sameHex` / `EVM_TX_HASH_PATTERN` in `constants.ts`, the relay id from
  `getIntentRelayChainId`, retry advice moved into `registerActionTool` (covers `INTERNAL` too), cancel reads the
  receipt before any backend call and rebuilds once, track won't resubmit its own submitted tx, `minimumReceived`
  stored as returned, a shared deposit fixture. Skipped: viem transport limits (SDK follow-up), parallel receipt and
  tx reads, skipping the catalog for cached quotes, merging the two quote flags, a generic Swaps API test stub.
- #88 plan drafted and reviewed by separate agents; 10 should-fix items applied (see plan-88 §Review).
- #85 /code-review (high), 10 findings. Fixed: a checked deposit the backend refuses (`SWAP_REJECTED`, e.g. its
  clock already past the deadline) goes to relay-for-refund instead of "check and try again"; the one-deposit claim is
  made before any await (two txs for one quote at once submitted both; mutation-checked); a backend row only gets the
  quote's `minimumReceived` when this server submitted that tx for it; a pending tx with a lost quote waits instead
  of "not a SODAX deposit"; retry advice no longer claims the deposit is safe; relay rate limits and outages retry
  instead of alerting; a relayed quote is kept 24 h so a later track doesn't page for a refund in progress. Skipped:
  Sonic sources refused (by plan, commit 7), viem decoders (no new dependency), the cancel rebuild (no state).
- #86 built (stacked on #85; RPC config already there), then /simplify (shared `resolveExactly` and `nativeToken`,
  no duplicate native holding, no `access` field, table tests, shared `callTool`), /code-review (high) and a
  double-check agent (live RPC probes). Fixed: unfunded Stellar/NEAR accounts read as empty instead of
  CHAIN_UNAVAILABLE (SDK error names `NotFoundError` / `AccountDoesNotExistError`), tool-neutral resolve wording,
  "balance" wording and a softer gas note (Stellar returns spendable XLM), Bitcoin reads BTC only, a meaningful
  Hedera contract test (treasury account), README rows. Also found #85's quote contract test broken (tests are
  outside tsc): fixed on #95 in `9dd78e7`. Draft PR #96.
- #87 built, /simplify (logger-level URL redaction instead of the template, per-kind alert dedupe, a 30 s oracle
  backoff, shared `bounded`/`sameHex`/`CHAIN_KEY_PATTERN`, simpler analytics and secret shapes, real field names in
  64-hex refusals), /code-review (high) and a double-check agent with probes. Fixed: the error serializer threw on
  bigints and cycles (pino calls serializers unguarded; a regression that hid errors and crash alerts), non-Error
  values kept URLs, uppercase URLs, malformed oracle entries failed the quote, alert dedupe hid a second
  SWAP_MISMATCH reason, seed phrases in other cases/formats, oversized secrets (zod refuses before the handler; a
  custom issue now says "treat it as exposed"), "not a token" wording. Kept SWAP_MISMATCH for config drift (the SDK
  side is packaged; retrying can't help). Live: HBAR had no route for a while on both hosts (upstream), canary's
  oracle returns 502 (quotes there have no USD value). Draft PR #97.
- #88 built off #87 (`scripts/e2e/swapCanary.ts`, `scripts/tsconfig.json`, `.github/workflows/e2e-canary.yml`, viem
  2.57.4 exact dev dep, README), then /simplify (2 agents: SDK-config USDC, one wallet client, stage in one place,
  stage functions, typed tool output, `AfterSend` exported, dry-run dispatch input), /code-review (high) and a
  double-check agent (viem source + local mock RPC, public RPC lag probe, no tx sent). Fixed: a node refusal of the
  swap fails at `send` instead of a 20 min false `track`; local nonce; arrival 180 s (`solved` = hub fill); stage
  written on every change; actions SHA-pinned and no cache in the key job; `RETRYABLE_CODES` imported; clearer
  failure text. Verified with a local canary server: dry run green, unfunded red at `balance_floor`, missing env at
  `setup`; 522 tests. commitlint rejected a >100-char body line once (the push still ran and opened the PR on the
  #87 head; recommitted). Draft PR #98 @ `6775283`.

## 2026-10-27 — stack review of PR #91–#98

- One reviewer agent per PR increment plus one agent driving a local canary server as a swap agent (placeholder
  key, nothing signed). Results in `review-2026-10-27-stack.md`; the five must-fix items re-checked by hand (SDK
  1.26.0 `connect()` starts the SSE transport; stellar-sdk `NotFoundError.name` is `Error`; viem 2.57.4 maps a
  non-2xx JSON-RPC body to an RPC error; `getIntentRelayChainId` exists at runtime).
- `plan-83-resolve-token.md` was found spliced (3 copies): a `$`` in the replacement text of the "After
  implementation" insert expanded to the preceding text. Rebuilt from the pieces (613 → 235 lines).
- Fix round (same day): one fix agent per PR in its own worktree, then the stack rebased bottom-up (#92 onto
  #91 … #98 onto #97), a second review of each PR's fix commits (simplify + correctness + rebase range-diff), its
  fixes, and a final rebase pass; every commit typechecks, 764 tests at the top, canary dry run green. Second-round
  changes worth remembering: SSE messages take only their own key; DEADLINE_TOO_SHORT; no alert without a quoteId;
  track/cancel don't refuse a live chain-id disagreement (quote only); canary tracks unless the node refused.
  Lesson: never `re.sub` with a backslash replacement string; a take-theirs conflict script dropped one line once
  (restored), so diff the lower branch's strings after any blanket resolution.

## 2026-10-27: SSE hotfix PR opened

- Opened #100 (`fix/sse-start-once` -> `development`, Closes #99). #99 is a Bug, sub-issue of #79, worded neutrally
  (stream drops after `endpoint`); the process exit is not mentioned in public text.
- Verified locally: on `development` one `GET /sse` makes the process exit (`SSEServerTransport already started!`,
  `unhandledRejection` -> `fatalExit`); with the fix the stream stays open. checkTs, lint, 90 tests, build pass.
- `create-issue.sh` reads types and board from icon-project, so for this gosodax repo the issue was made with gh +
  GraphQL (`updateIssue` type, `addSubIssue`). It auto-landed on gosodax board #1 as In progress; Stream and Status
  were not set because the gh token lacks the `project` scope.

## 2026-10-27: #89 implemented (uncommitted)

- plan-89 written; MCP part on `feat/89-swap-docs`, sodax-sdks part by a forked agent in `sodax/sodax-sdks-89-docs`.
  Findings: registry schema has no `tools` field and Glama's only `maintainers`; sodax-sdks already had
  `docs/builders-mcp.mdx` with hardcoded tool counts.
- Review agent on Part A: README missed `reset_approve`, the batch's `replaces`, the batch tx hash and `toAddress`;
  a keyed default connection had lost its `resolveConnection` test; stale "swap tools on" comments; boot risk from
  always-parsed RPC overrides. All fixed; stdio builder sessions skip the SDK. Details in plan-89 §Implementation.

## 2026-10-27: #89 committed and pushed

- MCP: 4 commits on `feat/89-swap-docs` (`e71ec58` switch, `6b4f3aa` next step, `1b03b6b` README, `33cffde`
  server.json), each through the hooks; the final tree equals the reviewed diff. Draft PR #102 into `development`.
- sodax-sdks: issue #576 (Task, sub-issue of builders-sodax-mcp-server#89, auto-added to the Sodax board), commit
  `50b9587c` under Node 24, draft PR #577. sodax-sdks AGENTS.md says an agent implements only once the issue has
  `plan-approved` or `no-plan`; the user had been told and said "commit push", so the PR is a draft waiting on the label.
- Not done: the kill-switch question (`SODAX_SWAP_TOOLS_DISABLED`) is open with the user.
