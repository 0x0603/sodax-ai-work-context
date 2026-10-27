---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active — #81 in PR #91, #82–#89 in draft PRs #92–#98 and #102 (stacked)
next: #89 is draft PR #102 (`feat/89-swap-docs` @ `33cffde`, on #98, Refs #89); its docs are gosodax/sodax-sdks#576 (sub-issue of #89) / draft PR #577, which needs a maintainer's `plan-approved` or `no-plan` and merges after the production release. Merge the SSE hotfix PR #100 (Closes #99, sub-issue of #79), then release it to master; rebase the stack on it. Then #88's live run (blockers 4 and 5), #85 contract tests, hub PR once #94 merges
updated: 2026-10-27
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- `plan.md` follows the ADR on PR #90 (synced 2026-10-26).
- ADR (#80) is draft PR #90 (base `development`), branch `feat/agent-executable-swaps` @ `3c9b00b` (D2: swap tools
  require a key, 2026-10-26; design review revision `f59edf0`). No reviewer requested; its one comment is the
  user's `@claude do PR review`, which produced no review.
- #81 is PR #91 into `development`, branch `feat/81-forward-api-key` @ `0930893` (refactor on top of `f27de38`; off `development` @ `02ba5df`):
  key forwarding via `requestContext`, `SODAX_ENV`, relay on `api.sodax.com/v1/relay`, README and `.env.example`.
  A code review (2026-10-26) found the key reaching the relay and more; 9 fixes pushed as `f27de38`
  (`plan.md` row 81 has the result). On canary the gateway routes the relay to the testnet relay. Checks green locally (105 tests, lint, build, `docker build` 353 MB); smoke-tested against
  production and canary. No reviewer requested.
- #84 (`sodax_swap_quote`) is draft PR #94 into `development`, branch `feat/84-swap-quote` @ `6339278` (off
  `feat/83-resolve-token` @ `2997dd8`), all pushed: `a5fc108` (commits 1–5), `a802484` / `1eba6c1` (reviews),
  `c639939` (SDK), `c045e28` (the SDK rebuilds the swap tx and it must match byte for byte; creator = the user's hub
  wallet; native HBAR open). 347 unit tests, 13 contract tests on both hosts. ADR amendment `21d9017` (balances via
  the SDK) pushed to PR #90. Hub branch `docs/builders-mcp-swap-sdk` @ `eb1f30d` is pushed (no PR yet).
  Details: `plan-84-swap-quote.md` §Commit 6 and §/simplify on the SDK commit.
- All of #79–#89 are assigned to the user (`0x0603`) as of 2026-10-26. "@0xmatterhorn" is the user's Discord handle.
- Discord 2026-10-23 (see `process.md`): R0bi7 says the epic is a core draft and the user may adjust decisions.
  Signing: the agent holds the key, signs and broadcasts, then passes the tx hash to MCP (D1 holds).
- Code lives in the hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server`. The standalone
  clone `sodax/builders-sodax-mcp-server/` (local signing key and noreply identity set) is legacy.
- `improvement-ideas.md` predates the ADR revision and has not been re-mapped.

## Blocked on

1. R0bi7's review of PR #90.
2. ~~A BE wallet-balance route~~ No longer blocks: #86 reads balances through the SDK (ADR `21d9017`).
3. Open with Paul: double counting (inbound + outbound), per-IP write cap and jail on the MCP IP. The HAProxy move
   itself is settled (R0bi7, Slack 2026-10-23).
4. A funded test wallet and a canary API key.
5. A gosodax admin for the E2E secrets and the staging `SODAX_ENV=canary` setting.

## Next action

Fix round 2026-10-27 done: every finding of `review-2026-10-27-stack.md` fixed, a second review per PR and its fixes,
stack rebased in order and force-pushed (with lease); PR bodies updated. Tips: #91 `bab68bf`, #92 `5a78943`, #93
`86a3e52`, #94 `27b86ac`, #95 `d671ce5`, #96 `a2f308c`, #97 `94a2638`, #98 `ee662f7` (764 tests; canary dry run green).
`fix/sse-start-once` (`66c80da`) is pushed without a PR: it needs an issue to link (public repo, security finding).
ADR updated on PR #90 (`cd0d643`). History of the round: `restack-notes-2026-10-27.md`.
Stack review 2026-10-27 (`review-2026-10-27-stack.md`, all fixed): 5 must-fix (pre-existing `GET /sse` crash on
`master`/`development`; #94 intent chains unchecked; #95 cancel payload not rebuilt; #96 unfunded Stellar reads as
an outage; #98 send-error classification), mediums per PR, and two settled decisions out of date (4: Sonic source;
11: the quote reads the hub chain; both updated).

On another machine: in the hub submodule `git fetch` and check out `feat/84-swap-quote`, then `pnpm install --frozen-lockfile` (the SDK came in with #84). First the fewer-calls commit on PR #94 (`plan-84-swap-quote.md` §Follow-up commit) is pushed as `6339278`; branch #85 off it. #85 per `plan-85-swap-track.md` (receipts through the SDK). Open the hub PR from `docs/builders-mcp-swap-sdk` once #94
merges. Reviews of PR #90–#94 are still open (no reviewer requested). Follow-up PR: pnpm 10 + `minimumReleaseAge`
instead of the hand pins — spec in `plan-84-swap-quote.md` §Follow-up PR. ADR on PR #90: D5 needs "env, else the
SDK default" on its RPC line, and D6 and §Quote must drop "the quote's balance check" / "checks the balance" (#86 cut); not done, push only on
the user's go-ahead. `plan-87-safety-analytics.md` is reviewed (open: keep the USD warning, its default level). #85 is draft PR #95 (`feat/85-swap-track` @ `33cb75a`, stacked on #94): commits 1–5 of plan-85 as one commit, after /simplify and /code-review (high); 435 tests. Contract tests (commit 6) are a follow-up. #85's quote contract test fixed in `9dd78e7` (cache read needs the key; Sonic refused). #86 is draft PR #96 (`feat/86-get-balance` @ `0ba4b59`): balances only, through the SDK; a missing Stellar/NEAR account reads as empty (`accountExists: false`); Bitcoin reads BTC only; 454 tests, 17 live contract tests. #87 is draft PR #97 (`feat/87-safety-analytics` @ `4cb8a02`): secret screening (template + 64-hex where the chain is known + an oversized-secret zod message), USD value + warning (default 10000, the open questions' recommendation), analytics outcome + swap whitelist, alerts for INTERNAL/SWAP_MISMATCH, URL-free logger serializer; 522 tests. #88 is draft PR #98 (`feat/88-e2e-canary` @ `6775283`, stacked on #97): `scripts/e2e/swapCanary.ts` (MCP over HTTP + viem signer, stage recorded to `$GITHUB_OUTPUT` on every change, node refusal fails at `send`, local nonce, 180 s arrival wait, `E2E_DRY_RUN`), `.github/workflows/e2e-canary.yml` (daily + dispatch with `amount`/`dry_run`, actions SHA-pinned, no cache, curl Discord alert), `checkTs` covers `scripts/`; verified locally (dry run green, unfunded wallet red at `balance_floor`). The live green and red runs wait on blockers 4 and 5. Follow-up for #85: at `solved` the track next step says the user "received" the funds, but `solved` is the hub fill; delivery is one more relay hop (plan-88 §Implementation).

Workflow the user asked for on each sub-issue: plan (agent) → review the plan → implement → `/simplify` →
`/code-review` → fix → wait for an explicit "commit push" → draft PR. Live probes and contract tests use
`0x…dEaD` and never sign or submit.

## Settled — do not re-litigate

1. Full SDK (`@sodax/sdk` + `@sodax/types`), chosen 2026-10-23 for later features, with overrides for `axios`,
   `toml`, `ws`; `bigint-buffer` is the one with no fix (corrected 2026-10-26, `plan-84-swap-quote.md` §Review).
   Only the NEAR/Stellar recipient check uses it in #84; the Swaps API stays REST. Chain reads (balances #86,
   source-tx receipts #85) go through the SDK from this server; SDK bugs are fixed in `sodax-sdks`, not worked
   around (user, 2026-10-26). That amends ADR D6 for phase 1; done on PR #90 in `21d9017`.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the EVM source tx on chain before calling `submit-tx`: the receipt succeeded and holds the `connection`
   contract's log carrying the cached relay payload. Matching the tx input is not enough.
4. Phase 1 sources are the EVM spoke chains; Sonic (the hub) is refused since #85: no `connection` log proves a
   deposit there (ADR D5 updated 2026-10-27). No per-call `rpcUrl`; RPC defaults come from the SDK's packaged
   `spokeChainConfig` (user, 2026-10-26), overrides from env only. A client-supplied RPC was asked for and dropped
   again on 2026-10-26 for security (SSRF; it could fake the receipt #85 checks), so ADR D5 holds.
5. Swap tools require an API key (user's call, 2026-10-26; presence check only, BE decides validity). Builder
   tools stay keyless; a key, when sent, is forwarded on every BE call. ADR D2 says so (`3c9b00b`).
8. #81 keeps `solver.ts` / `relay.ts` on REST: the SDK changes the builder tools' inputs and outputs
   (`plan.md` §Constraints). `@sodax/types` and `engines` land in #83, `@sodax/sdk` in #84.
6. Partner fee is set by the builder at connection level (header, URL query or stdio env), never as a tool input.
7. One PR per sub-issue (user's call, 2026-10-26), each on its own branch off `development`, in `plan.md` order;
   #90 is the ADR. A boot-time switch keeps the swap tools off in production until #85, #87 and #88 are in. The
   sodax-sdks docs and skill go in a separate PR with its own issue.
9. #85: an on-time deposit tracked after its deadline is relayed by the MCP so the backend canceller refunds it
   (user, 2026-10-26; `plan-85-swap-track.md` §Relay-for-refund).
10. #85: quote, track and cancel need the same API key; another key gets `QUOTE_KEY_MISMATCH`, never an alert or a
   "quote not found" (user, 2026-10-26; `plan-85-swap-track.md` design 5).
11. One job per tool (user, 2026-10-26): `sodax_get_balance` reads balances only (no allowance); the quote reads no
   balance. It does read the user's hub wallet (Sonic) and NEAR/Stellar recipient readiness, and asks the backend's
   `/allowance/check` (`plan-86-get-balance.md` §Scope cut; ADR D5/D6 updated 2026-10-27).
12. Fewer agent calls (user, 2026-10-26): the quote takes names and symbols directly, resolve only on
   `UNKNOWN_TOKEN`, the address on the first quote (`plan-84-swap-quote.md` §Follow-up commit, on PR #94). A missed
   track stays an agent risk: the ready quote returns `afterSend`; the fix is a BE deposit watcher (`plan.md`).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves | `issue.md` | 3.5k |
| Decisions, constraints, SDK fit, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 4.5k |
| #82 implementation plan (reviewed): profiles, swap key gate (403), rollout switch, snapshot test, 1 open question | `plan-82-tool-profiles.md` | 4k |
| #83 implementation plan (reviewed): live token list + chain config, resolver rules, action-tool template, restricted-token rule; no new dependency | `plan-83-resolve-token.md` | 4.5k |
| #84 implementation plan (reviewed): quote build path, partner fee, REST over `SwapsApiService`, errors, cache, SDK commit after the cooldown; §After implementation | `plan-84-swap-quote.md` | 4.5k |
| #85 implementation plan (reviewed): track state machine, deposit check from the `connection` Message log, RPC env, alerts, cancel flow, relay-for-refund on expired deposits, same-key rule (`QUOTE_KEY_MISMATCH`), 1 open question (backend asks, for the PR thread) | `plan-85-swap-track.md` | 9k |
| #86 implementation plan (reviewed, cut 2026-10-26): `sodax_get_balance` reads balances through the SDK (`getWalletBalance`), no allowance, quote reads no chain; error wrapping, SDK follow-ups | `plan-86-get-balance.md` | 3.5k |
| #87 implementation plan (reviewed 2026-10-26): secret screening, USD value + warning, analytics outcomes, Discord on unexpected and integrity errors, URL-free error logs, a test per ADR rule; 2 open questions (USD warning, its default), 2 deferred | `plan-87-safety-analytics.md` | 4k |
| #88 plan (reviewed 2026-10-26) and how the code differs (§Implementation, PR #98): built server in the runner over `/mcp?profile=swap`, viem EOA signer in `scripts/e2e/`, 5 USDC Arbitrum↔Base (richer side sends), `canary-e2e` environment, `curl` Discord alert with the stage, leak check on green and red runs; 4 open questions (reviewer agrees with each) | `plan-88-canary-e2e.md` | 6k |
| #89 plan (2026-10-27): drop the switch, README walkthrough, `server.json` (no `tools` field in the registry schema; profile header; drift test), Glama has only `maintainers`; sodax-sdks page + skill under their own issue, merging once production serves the swap tools | `plan-89-docs-registry.md` | 1.5k |
| Stack review 2026-10-27, PR #91–#98: must-fix, mediums per PR, low/nits, out-of-date decisions, what was verified fine | `review-2026-10-27-stack.md` | 4k |
| Discussion log: balance in BE, custom RPC, full SDK vs light, rate limit, API key, cancel, partner fee | `process.md` | 2k |
| Candidate changes from before the ADR revision, not re-mapped | `improvement-ideas.md` | 1.9k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- The intent canceller was seen disabled on canary (2026-10-20), so #85's relay-for-refund may not refund there.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Repo is public (hub `repos.yaml`): keep PR text free of internal detail.
- SDK / viem error text carries RPC URLs (paid ones embed keys) and request bodies: call the SDK only through the
  wrappers in `src/services/sodax.ts`, never log or return its errors.
- After pulling #84, run `pnpm install`: the pre-commit hook runs the whole test suite, which needs the SDK.
