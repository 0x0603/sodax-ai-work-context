---
type: plan
repo: builders-sodax-mcp-server
github: 88
related_issues: [79, 82, 84, 85, 86, 87]
tags: [mcp, e2e, ci, canary, github-actions, viem, discord]
updated: 2026-10-27
---

# #88 — E2E swap on canary in CI

Status: implemented, draft PR #98 (`feat/88-e2e-canary` @ `6775283`, stacked on #97); see §Implementation. Live runs wait on prerequisites 3 and 4. Originally: Written against `feat/84-swap-quote` @ `6339278` plus the #85 work in
the working tree of `feat/85-swap-track` (complete, uncommitted). Branch `feat/88-e2e-canary` stacked on the #87
branch, or off `development` once #85 and #87 merge (plan order #85 → #87 → #88). Blocked on prerequisite 3 (a
funded wallet and a canary key) and prerequisite 4 (an admin for the environment and secrets).

## Context

The issue asks for a scheduled workflow, never run per PR. It runs a real EVM→EVM swap through `sodax_swap_quote`,
signs with viem from a funded wallet held in a secret, and tracks it to `solved` with `sodax_swap_track`. Done when
the workflow is green on schedule, failures alert Discord, and no secrets appear in logs. `plan.md` row 88 adds
`scripts/e2e/swapCanary.ts`, 5 USDC, alternating direction, `e2e-canary.yml` (daily + dispatch, balance floor), and a
second done-when: one green scheduled run and one deliberate red run.

Verified (code at `6339278` + working tree; GitHub on 2026-10-26):
- **Repo and access.** Public, default branch `development`. The user has push, not admin, so an admin creates the
  environment and secrets. Actions secrets today: `RELEASE_BOT_APP_ID`, `RELEASE_BOT_PRIVATE_KEY`; no
  `DISCORD_WEBHOOK_URL`; the only environment is `copilot`. The `development` ruleset needs one approval but has
  `require_last_push_approval: false`.
- **No workflow alerts.** Nothing posts to Discord from CI. The last five scheduled `drift-check.yml` runs (cron
  `0 9 * * *`) failed unnoticed, starting 4–7 h after their cron time.
- **The server under test stays quiet without env.** With no webhook it posts nothing (no start message, drift
  summary, fatal exit or operator alert: `index.ts:381-393`, `alerts.ts`); PostHog is off without a key
  (`analytics.ts:37`). The logger writes to stderr (`logger.ts:36`).
- **Boot.** Swap tools exist only with `SODAX_SWAP_TOOLS_ENABLED=true`, which also loads the SDK with
  `parseRpcOverrides(env)`; an empty `SODAX_RPC_URL_<id>` is skipped. The docs warm-up runs before the server
  listens: up to 3 attempts × 30 s timeout plus 2 × 5 s waits, about 100 s worst case (`index.ts:52-95`,
  `docsProxy.ts:19`).
- **Key and profile over HTTP.** The key comes only from `x-api-key` (`index.ts:121-128`); `?profile=swap` without a
  key is 403, with the switch off 400 (`profiles.ts:57-63`). The server is stateless per request (`index.ts:287-290`).
- **Quote cache.** In the process, bound to a hash of the API key, kept for the deadline plus 30 min
  (`quoteCache.ts`), so quote and track must reach the same process with the same key; a 20 min track window fits.
- **Quote output (working tree).** A `ready` quote returns `quoteId`, `expiresAt`, `steps[{kind: reset_approve |
  approve | swap, chainId, tx}]`, an optional EIP-5792 `batch`, and, added in the tool handler (`tools/swap.ts`, not
  the `SwapQuote` type), `afterSend: {tool: "sodax_swap_track", args: {quoteId}, needs: "txHash"}`. Its `nextStep`
  says to send the steps in order, then call track.
- **Track statuses (working tree).** Non-terminal, with `retryAfterSec` (`RETRY_AFTER_SEC` = 15, `source.ts`):
  `awaiting_source_confirmation`, `queued`, `in_progress`. Terminal: `solved`, `failed`, `source_failed`,
  `not_submitted`, `not_submitted_unknown_quote`, `expired_refunding`, `expired_unsubmitted`. `CHAIN_UNAVAILABLE`
  carries no `retryAfterSec`.
- **Contract tests** quote Arbitrum USDC → Base USDC for `0x…dEaD` by chain key and token address
  (`swapQuote.contract.test.ts:14-16`), through the in-process client (`src/tools/__fixtures__/swapClient.ts`).
- **`scripts/` today.** `tsconfig.json:17` includes only `src/**`, vitest picks up only `src/**/*.test.ts`, and the
  image copies only `dist/` (`Dockerfile:39`): a file under `scripts/` is not type-checked, tested or shipped.
- **viem.** 2.57.4 is in the lockfile through the SDK (2.29.2 and 2.37.13 too), not a direct dependency, and there is
  no top-level `node_modules/viem`. viem errors carry the RPC URL and request body in `metaMessages`; `shortMessage`
  holds neither (`viem/_esm/errors/base.js:26-31`, `errors/request.js:11-12`).
- **Staging** is internal-only (`README.md:280`), so a public workflow can't name it.
- **#87** adds a test that `src/` holds no signer import, so the signer lives outside `src/`.

## Scope

In: `scripts/e2e/swapCanary.ts` (an MCP client over HTTP plus a viem signer); `.github/workflows/e2e-canary.yml`;
`viem` as an exact dev dependency; type-checking for `scripts/`; README rows; the environment and its secrets (by an
admin).

Out: cancel with real funds, relay-for-refund, smart-wallet batches · Sonic, native and non-EVM sources · production
and the deployed servers · automatic recovery of a failed swap · alerts for the drift check (open question 3).

## Design

1. **Test the built server over HTTP, started in the runner.**
   - The workflow runs `pnpm build`, then `node dist/index.js > server.log 2>&1 &` with `SODAX_ENV=canary`,
     `SODAX_SWAP_TOOLS_ENABLED=true`, `LOG_LEVEL=info` and the optional RPC overrides only: no webhook, PostHog key
     or API key. It waits for `/health` with `curl --retry 60 --retry-delay 2 --retry-connrefused -sf`.
   - The script opens one MCP client per tool call (as `callQuote` does) with the SDK's
     `StreamableHTTPClientTransport` to `MCP_URL=http://127.0.0.1:3000/mcp?profile=swap`, sending `x-api-key`. No
     long-lived SSE stream over a 20 min track.
   - Why: this is the path agents use, and it exercises what the in-process fixture skips: `main()` with the switch
     and RPC overrides, the key header, the profile gate, and `dist/`. Staging is internal and deploys on its own
     schedule; a server in the runner tests the exact `development` commit, keeps hosts out of the repo, and holds the
     quote cache and the key in one process.

2. **Secrets live in one GitHub environment, `canary-e2e`, open to `development` only.**
   - Required: `E2E_WALLET_PRIVATE_KEY` (a dedicated test wallet), `E2E_SODAX_API_KEY` (the canary key, `sodax_…`),
     `DISCORD_WEBHOOK_URL`. Optional: `SODAX_RPC_URL_42161`, `SODAX_RPC_URL_8453` (empty → the SDK default for the
     server and viem's chain default for the signer). No required reviewers: the scheduled run is unattended.
   - Each step gets only what it needs: the server the RPCs; the script the wallet key, the API key (as
     `SODAX_API_KEY`, the contract tests' name) and the RPCs; the notify step only the webhook.
   - Why: an environment with a branch rule hands secrets only to workflow code already merged into `development`;
     repo secrets reach any workflow on any pushed branch. Fork PRs get none either way. The admin also turns on
     `require_last_push_approval` for `development`, so a push after approval can't merge unreviewed and inherit a
     hot wallet key.

3. **Pair, amount and direction: 5 USDC between Arbitrum and Base, sent from whichever side holds more.**
   - Tokens by chain key and address, the contract tests' constants (`0xa4b1.arbitrum`, `0x2105.base`, the two USDC
     addresses): the floor and arrival checks read exactly the token the swap approves. The symbol path stays covered
     by the resolver and quote unit tests.
   - Why this pair: stable to stable, so the wallet's value doesn't move with prices; L2 gas is cheap; an ERC-20
     source runs the approve step every time (the quote approves the exact amount).
   - Why "the richer side sends": it flips direction on its own once balances are even, covers both spokes (asset
     manager, `connection`, default RPC) every two days, and recovers by itself after a failed or refunded run.
   - Why 5: the contract tests quote 5; well above dust and cheap to lose if a swap strands. That it clears the
     minimum on both chains is inferred.

4. **The run, step by step.** One function per stage; any failure throws `{stage, reason}`.
   1. `readWallet`: viem public clients on both chains read USDC `balanceOf` and native balance.
   2. `pickRoute`: the source is the chain with more USDC.
   3. `checkFloor`: the source needs USDC ≥ amount and ETH ≥ `GAS_FLOOR`, else fail at `balance_floor` naming the chain
      and asset to top up, before any transaction.
   4. `quote`: `sodax_swap_quote` with the keys and addresses above, `amount`, `fromAddress` (recipient defaults to the
      sender). Must be `ready`. The script types the result as `SwapQuote & {afterSend; nextStep}`.
   5. `sendSteps`: each step in order with the wallet for `step.chainId` (`{to, data, value}`); every step before the
      last must be mined with `success`. The swap step is prepared and signed first (`prepareTransactionRequest` →
      `signTransaction`), its hash computed (`keccak256(serialized)`) and logged, then sent with
      `sendRawTransaction`. A send error still goes on to `track` with that hash: the node may have taken it. `batch`
      is ignored (the signer is an EOA).
   6. `track`: `afterSend.tool` with `{...afterSend.args, txHash}` right away. While `awaiting_source_confirmation`,
      `queued` or `in_progress`, call again after `retryAfterSec`. `solved` passes; any other status fails with it.
      Tool errors: `RATE_LIMITED` waits `retryAfterSec`; `CHAIN_UNAVAILABLE` and `UPSTREAM_UNAVAILABLE` retry after
      `retryAfterSec`, else 15 s; any other code fails. Timeout: 20 min after the swap is sent (the 15 min default
      deadline plus 5).
   7. `checkArrival`: destination USDC rises by at least the quote's `to.minimumAmount`, polled for up to 60 s.
   - Why: the agent's flow (quote → wallet sends → track through `afterSend`), driven only by tool output. Track checks
     the receipt, so the script doesn't wait for it. The arrival check is the one check nothing else makes: `solved`
     is the backend's word, funds landing is what end to end means.

5. **What happens to the funds.**
   - Each run moves 5 USDC to the other chain; the next run is the swap back. A swap back within the run would double
     the cost, the run time and the `submit-tx` calls without adding coverage.
   - Cost per run: the solver spread plus approve + swap gas on one L2 (the #84 fixture quotes 4.991887 for 5, about
     0.16%; inferred about $0.01 plus well under $0.05 of gas). Funding: about 10 USDC and 0.002 ETH per chain
     (prerequisite 3's ~20 USDC).
   - `GAS_FLOOR` ≈ 10× one run's gas, measured in the first local run (inferred around 0.0002 ETH): the job goes red
     with about 10 runs' worth left, never mid-swap.
   - What can strand: a run that dies after the swap is sent but before track submits (the cache dies with the runner),
     or a send error whose tx landed after the 20 min window. Both are alerted with the logged quoteId and tx hash;
     see §Ship for recovery. A stranded run may lose its 5 USDC.

6. **What fails the job, and what gets logged.**
   - Failures: missing env; server not healthy; `balance_floor`; quote not `ready`; a step that can't be sent or an
     earlier step not `success`; a terminal status other than `solved`; a non-retryable tool error; no `solved`
     within 20 min; funds not arriving within 60 s; the step timeout.
   - One line per stage: route, balances, quoteId, tx hashes, each track status. On failure: `E2E failed at <stage>:
     <reason>`, the stage written to `$GITHUB_OUTPUT` (a fixed set of names), exit 1.
   - It never prints an error object, `message` or `details`; viem errors print only `name: shortMessage`. A top-level
     catch and an `unhandledRejection` handler print the same sanitized line: Node's default would print viem's
     `metaMessages` (URL and request body).
   - Why: Actions logs on a public repo are public. GitHub masks secret values but not derived forms (a key without
     `0x`, a URL inside an error), so the script prints only text it builds. The wallet address and tx hashes are
     public on chain.

7. **The workflow, `e2e-canary.yml`.**
   - Triggers: `schedule` (`cron: "17 2 * * *"`) and `workflow_dispatch` with one input, `amount`. No `push`,
     `pull_request` or `pull_request_target`.
   - Job: `environment: canary-e2e`, `permissions: contents: read`, `concurrency: {group: e2e-canary,
     cancel-in-progress: false}`, `timeout-minutes: 30`. (A `github.repository` guard is optional: fork schedules are
     off by default and forks have no environment.)
   - Steps: checkout, pnpm and Node 22 (the same action tags as `ci.yml`); `pnpm install --frozen-lockfile
     --ignore-scripts`; `pnpm build`; start the server and wait for `/health`; `pnpm e2e:canary` with
     `timeout-minutes: 25` and `env: AMOUNT: ${{ inputs.amount || '5' }}` (input defaults don't apply on `schedule`;
     never `${{ }}` inside `run:`); print `server.log` on `if: failure()`; notify on `if: failure() || cancelled()`.
   - Why: schedules run only on the default branch, so the job tests what staging and the next release run; dispatch
     gives the red run and manual reruns; one concurrency group keeps two runs off the wallet's nonces; the step
     timeout makes a stuck track a plain failure that still alerts; an off-hour minute avoids the top-of-hour queue.

8. **Discord on failure: one `curl` step.**
   - `jq -n --arg u "$RUN_URL" --arg s "$STAGE" '{embeds:[{title:"Canary swap E2E failed",description:"\($s) ·
     \($u)",color:15158332}]}' | curl -fsS -m 10 -H 'Content-Type: application/json' -d @- "$DISCORD_WEBHOOK_URL"`,
     with `STAGE` from the script's output (`setup` when the script never ran).
   - Why: no new file, no `tsx`, no install needed, so it alerts even when install or build failed; `curl -f` fails
     visibly when Discord rejects the post (`postToDiscord` swallows errors). The stage tells the reader how urgent it
     is: `balance_floor` means top up, `track` means funds may be on chain. No error text goes to Discord.

9. **Where the script lives, and its checks.**
   - `scripts/e2e/` sits outside `src/`: never in `dist/` or the image, and #87's "no signer in `src/`" test holds.
   - `scripts/tsconfig.json` extends the root config with `rootDir: ".."`, `noEmit` and its own `"include":
     ["**/*.ts"]` (an inherited `include` would re-check `src/` and skip the script). `checkTs` becomes `tsc --noEmit
     && tsc --noEmit -p scripts`. Everything from `src/` is `import type`, so the process holding the key never loads
     the SDK, and a breaking change to a tool's output fails `checkTs` on the PR.
   - `viem` pinned at `2.57.4` in `devDependencies` (`pnpm add -D -E viem@2.57.4`; diff the lockfile for a new
     peer-suffixed entry): already in the tree, and direct because pnpm doesn't let `scripts/` import a transitive
     dependency.
   - Local run: `pnpm build && node dist/index.js` with explicit `SODAX_ENV=canary SODAX_SWAP_TOOLS_ENABLED=true` (not
     `pnpm start`, which loads `.env` and could carry a production webhook), then `pnpm e2e:canary` with `MCP_URL`,
     `SODAX_API_KEY`, `E2E_WALLET_PRIVATE_KEY`. Never while the workflow runs: same wallet, same nonces (README note).

## Changes (commits)

1. `test: add a canary swap E2E script` — `scripts/e2e/swapCanary.ts`, `scripts/tsconfig.json`, `package.json`
   (`e2e:canary`, `checkTs`, `viem` `2.57.4`) and the lockfile, README CI table row and local-run note.
2. `ci: run the canary swap E2E daily` — `.github/workflows/e2e-canary.yml`, a README line naming the environment and
   its secrets (names only) and the wallet's public address for top-ups.

## Tests

- **Every commit:** `pnpm checkTs && pnpm lint && pnpm test && pnpm build`. The script gets no unit tests: its logic
  is a straight line over tool outputs, and the runs below test it.
- **Before the PR:** one local run against canary in each direction, so both spokes are proven before the workflow
  gets secrets; it also measures gas for `GAS_FLOOR`.
- **After merge (the done-when):**
  - Green: the first scheduled run on `development` reaches `solved` and the funds arrive.
  - Red: a dispatch with `amount: 1000` fails at `balance_floor` before any transaction; Discord gets one message
    with the stage and run link.
  - Leak check on both runs (`gh run view --log`): the API key, the private key with and without `0x`, and any RPC
    URL show only as `***` or not at all. The green run matters most: it has the most log surface.
- **Covered here from plan-85's "not testable without a funded wallet":** a real `inserted` submit through to
  `solved`; design 2's inferred `item[2]` equality (a real deposit has to pass the check); the confirmation
  transition, best effort (on Arbitrum and Base the receipt often exists before the first track call).
- **Not tested, and why:** a real cancel through the relay (the solver usually fills first, an unfillable quote would
  strand funds, and the canceller's state on canary is unknown; covered by the pre-production role-play, `plan.md`
  Verification 3) · `expired_refunding` / `expired_unsubmitted` with a real deposit (waiting out a deadline, and the
  canceller) · a smart-wallet batch (EOA signer) · the throttler's 429 (one submit per run) · a restart mid-swap
  (would strand funds by design) · native, Sonic and non-EVM sides (phase 1 scope) · production, staging and edge
  key counting · whether the key is valid (the backend may accept any `sodax_…` key).

## Ship

- Draft PR `ci: run a real swap on canary every day`, `Closes #88`, into `development` after #87 (stacked on its
  branch if review lags). Body: what runs and when; cost per run; environment and secret names; "keep
  `SODAX_SWAP_TOOLS_ENABLED` off in production until this is green"; recovery:
  - The alert and the run log carry the stage, quoteId and tx hashes.
  - A swap that was submitted and `failed` with `canCancel`: run `sodax_swap_cancel` against a local server, and
    sign the returned step with the script's viem account (the server never signs).
  - A deposit never submitted (`not_submitted_unknown_quote` on a fresh server): the MCP can't submit it. Hand the tx
    hash to the backend team for a manual relay; the 5 USDC may be lost.
- Public repo: no internal hosts, Discord channel names, backend branch names or backend state (e.g. the canceller's
  status) in the PR.
- Before merge: prerequisites 3 and 4. The admin creates `canary-e2e` with the `development` branch rule and the
  secrets, and turns on `require_last_push_approval`.
- After merge: update `plan.md` row 88 and the brief. Production's swap switch can then turn on (`plan.md` rollout
  gate).

## Open questions (recommendation first; the reviewer agrees with each)

1. **Discord target**: the same webhook as production's runtime alerts (failures only, little noise); the admin adds
   it as an environment secret, since GitHub has none today.
2. **Read balances through `sodax_get_balance` once #86 merges?** No: the floor is the wallet's own check, and a
   get-balance bug shouldn't fail the swap canary; #86 has its own tests.
3. **Give the drift check the same alert?** Yes, in a separate small PR after #88: a copy of the `curl` step, gated
   to non-PR events.
4. **Wallet key custody**: the user generates a fresh key never imported into a browser wallet, keeps it in the team
   password manager, uses it only here, and rotates (moves the funds, replaces the secret) if any log ever shows it.

## Review (2026-10-26, an independent agent)

No blockers. Applied: the swap step is signed and its hash logged before it's sent, and a send error still tracks
(a timed-out send could otherwise strand an untracked deposit); a step timeout plus `failure() || cancelled()` so a
stuck track still alerts; `AMOUNT` defaults to 5 on `schedule` (input defaults apply only to dispatch); stale #85
facts (`afterSend` exists, the ready next step, `RETRY_AFTER_SEC` in `source.ts`); tokens by key and address, not
symbol; realistic recovery (the server never signs; an unsubmitted deposit needs a hand relay and may be lost); a
`curl` step instead of `notifyFailure.ts`, carrying the stage; `scripts/tsconfig.json` needs its own `include`; leak
check on the green run too, `server.log` printed only on failure and with stderr; `require_last_push_approval`;
nits (health-wait timing, best-effort confirmation transition, no `pnpm start` locally, a 15 s default retry, a
sanitized top-level catch, one client per call, line refs, lockfile diff, no backend state in the PR, nonce note).
Not applied: nothing.

## Implementation (2026-10-27)

Where the code differs from §Design, after /simplify (2 agents), /code-review (high) and a double-check agent:

- Stage: a global `stage` set by `enter()`, which also appends `stage=<name>` to `$GITHUB_OUTPUT` (last value wins), so
  a step timeout or cancel still alerts with the right stage. `Failure` carries only the reason.
- USDC address and decimals from `@sodax/types` `spokeChainConfig` (config package, not the SDK); RPC override env
  name built from the chain id. One wallet client per side, extended with `publicActions`.
- From `src/`: types (`SwapQuote`, `TrackResult`, `ActionErrorCode`, `AfterSend`, now exported from `tools/swap.ts`)
  and the value `RETRYABLE_CODES` (errors.ts loads only constants.ts), minus `INTERNAL`.
- Send: the pending nonce is read once and counted locally (a load-balanced public RPC may answer from a node that
  hasn't seen the approve). A swap send that throws `RpcError` / `RpcRequestError` (the node answered no) fails at
  `send` with the RPC code; any other error (timeout, HTTP) is tracked, since it may have landed.
- Track deadline: the quote's `expiresAt` + 5 min. A `failed` result logs outcome and `canCancel`.
- Arrival: 180 s. `solved` is set from the solver's fill tx, which is the hub fill (SDK `fill_tx_hash`); delivery to
  the destination is a relay hop the SDK waits up to 120 s for. Step timeout 28 min, job 35.
- Workflow: `dry_run` dispatch input (checks the environment and key before funding); actions pinned by commit
  (checkout v4.4.0, pnpm/action-setup v4.3.0, setup-node v4.4.0); no `cache: pnpm` in this job; the script owns the
  amount default.
- Kept: a fresh MCP client per call (about 4 requests per call, under the 60/min limiter; a reused one holds an idle
  stream for 20 min); the curl alert in the workflow; `server.log` on failure (only the RPC URLs are in the server
  step, and the logger strips URLs).
- Left: a late delivery from an earlier failed run counted as this run's arrival (needs three failures in a row; the
  earlier one already alerted).
- Found for #85: `trackNextStep` at `solved` says the user received at least the minimum; not true until delivery.
  Needs its own fix.
- Lockfile: adding viem moved `@scure/bip32`'s `@noble/curves` 1.9.1 → 1.9.7 (both already locked; said in the PR).

