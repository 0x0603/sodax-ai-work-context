---
type: process
repo: builders-sodax-mcp-server
github: 147
status: Active
tags: [bridge, action-tools, builders-mcp, review, recovery]
updated: 2026-11-26
related_issues: [79, 119, 127, 129, 125]
---

# GH-147 process

## 2026-11-24 review

Review of the issue and proposed approach before `plan.md`; no implementation or signing.
The feature worktree is clean at `33e9e24`, with no bridge commits or upstream branch. GitHub PRs #138
and #145 remain open at `33e9e24` and `e0a5156`. The GitHub connector failed authentication; `gh` supplied
the live issue/PR bodies. GitHub redirects the repository to `gosodax/sodax-mcp`.

### Payload verification: feasible, but define the whole trust boundary

The installed `@sodax/sdk@2.3.0-rc.3` exposes `buildBridgeData` in `dist/index.d.ts:15485`; its runtime
implementation is at `dist/index.mjs:38729`. This confirms that local relay-payload reconstruction is
available without changing the SDK.

Rebuild using the canonical request, locally trusted token descriptors, and the configured fee. Validate
live discovery's `hubAsset`, `vault`, `decimals`, chain/address, and access direction against trusted config
before treating the descriptors as rebuild inputs. Rebuilding with unchecked backend-supplied descriptors
would only compare two values controlled by the same upstream. Derive `relayData.address` independently
from source chain/address; compare payload bytes, then verify the complete source transaction and every
approval. The byte comparison does not by itself cover source chain, signer, token, value or spender.

EVM spokes use `assetManager.transfer(token, hubWallet, amount, payload)`; Sonic uses
`walletRouter.route(calls)` with an added ERC-20 `transferFrom` or native-S wrap call. Sonic's approval
spender is the derived wallet, not the swap intents contract. Its bridge receipt also does not create
the swap `IntentCreated` event, so the existing HUB swap adapter cannot be reused unchanged.

Evidence (paths below are relative to the SDK repo unless stated otherwise):
- `packages/sdk/src/shared/services/spoke/EvmSpokeService.ts:157-174`
- `packages/sdk/src/shared/services/spoke/SonicSpokeService.ts:209-271`
- `packages/sdk/src/bridge/BridgeService.ts:1080-1102`, `:410-419`
- MCP #138 `src/services/swap/sources/evm.ts:78-90`

Tests should mutate both payload/envelope and tx/approval fields independently, including a consistent
malicious discovery descriptor plus payload, Sonic's funding prefix, native value, and an extra route call.

### Delivery: #145 is infrastructure, not a bridge matcher

In #145 `src/services/swap/delivery.ts:86-93`, `isDelivery` requires decoded `transfer.from` to equal
`solverConfig.intentsContract`. Bridge executes its asset-manager transfer from the user's hub wallet
(`BridgeService.ts:1260-1266`); the unchanged matcher will reject its valid delivery packet.

Plan a bridge matcher bound to the checked hub execution tx (source tx for Sonic, first-hop destination tx
for spoke sources), hub asset manager, expected sender wallet, destination chain, encoded recipient,
output hub asset, amount and expected data. Accept exactly one matching packet; preserve a confirmed
delivery across later transient reads. Where packet metadata cannot uniquely identify a batched operation,
require additional receipt evidence or report ambiguity rather than choose the first packet.

Route matrix: spoke→Sonic finishes after verified first-hop execution; spoke→spoke additionally follows
the hub's outgoing packet; Sonic→spoke starts from the source receipt's outgoing packet. The backend
already follows that outgoing packet for Sonic sources (`submit-bridge-txs.task.ts:299-309`).

Clarify destination scope. EVM/Sonic **sources** do not imply EVM-only destinations. #145's
`deliveryProof` (`delivery.ts:72-78`) reports only `sent` for Bitcoin and Injective; the current #147
acceptance criterion promises arrival. Either restrict destinations, add their confirmation evidence, or
make the weaker proof explicit without calling it delivered. Source Bitcoin refusal is already settled.

### Recovery: split source failure, hub balance, and outgoing relay failure

Do not turn a polling timeout or backend `failed` into "funds are in the hub wallet". Backend abandonment
ends automatic processing, not the possibility of late on-chain delivery. The status DTO's hint says
funds **may** be recoverable; it provides no balance/location proof. The backend source also allows a
late executed packet to supersede abandonment (`submit-bridge-tx-db.service.ts:178-180`).

Required cases for the plan:
- Source receipt reverted: the bridge did not move funds; report the checked source result and gas cost
  separately from token loss. A pending/unreadable receipt remains unknown.
- Source succeeded but hub execution/delivery is uncertain: inspect packet evidence and the derived
  wallet's relevant hub balances. A positive wallet balance is recovery evidence, not attribution of the
  entire balance to this bridge. Exclude unrelated pre-existing funds from any claimed refund amount.
- Confirmed recoverable hub balance: `RecoveryService.fetchHubAssetBalances` and
  `withdrawHubAsset({ raw: true, ... })` exist. Withdrawal uses the original source identity/chain, original
  token mapping and hub-asset precision, and requires user signing. Define a concrete SDK/UI handoff or
  expand the action scope; the two proposed tools do not currently build a recovery transaction.
- Hub already emitted the destination transfer: do not promise that `withdrawHubAsset` can undo that
  packet. A wallet balance may already be absent. Reconcile late delivery and hand off the exact packet/
  transaction identifiers for relay retry or operator review when no user recovery is proven.

Evidence: SDK `packages/sdk/src/recovery/RecoveryService.ts:95-157`, `:175-223`; backend
`apps/bridge-api/src/api/bridge/dto/submit-bridge-tx-status.dto.ts:88-94`. Bridge has no swap-intent expiry
refund or swap cancel path; do not carry those assumptions into bridge decisions.

### Amounts and persistence need explicit contracts

`BridgeLimit` carries its own `decimals` and `DEPOSIT_LIMIT`/`WITHDRAWAL_LIMIT`; it may be expressed in the
destination token's units. Compare normalized quantities with integer arithmetic, never raw amounts
from different precisions. Confirm-summary fee and receive amounts must follow the same pipeline as
the payload: source precision → 18-dp vault shares → fee → destination precision/rounding. A fixed bridge
partner fee is in vault units, unlike a source-token amount (`BridgeService.ts:1153-1180`).

The current quote cache is specifically a swap `IntentRequest` plus built `intent`; its retention is
`deadline + GRACE_MS` (`src/services/swap/quoteCache.ts:16-24`, `:157-159`). Bridge has no such deadline.
Define a distinct bridge record or discriminated action record, preparation expiry, post-broadcast
retention, API-key binding, one-build/one-deposit claim and idempotent submit. Specify recovery/resume
after expiry/restart without rebuilding a second transfer. #125's Redis work does not by itself settle
these semantics.

### Review result

Base-branch choice and SDK helper availability are sound. Before implementation, resolve the recovery
handoff and destination proof, then write `plan.md` with the full verifier, route/status decision table,
unit conversions and record lifecycle. The profile rename remains optional for this implementation;
decide it in release coordination before changing a public profile name.

Validation in this session was read-only source/API inspection. No tests or canary bridge were run;
there is no bridge implementation to exercise yet. Code worktrees and GitHub issue/PR contents unchanged.


## 2026-11-26 uncommitted batch delta review

Scope: the eight uncommitted files on top of `47a885c`, adding EIP-5792 approve+bridge batches and
sharing swap batch guidance. Review only; no production code fixes or GitHub comments were made.

### P2: generic wallet batches can contain ambiguous source deposits

`src/services/bridge/build.ts:84-87` offers a batch on every EVM spoke needing an approval. An ERC-4337
bundler can put unrelated user operations in the same source transaction; EIP-5792 explicitly distinguishes
the wallet's filtered operation logs from the full transaction receipt. Bridge tracking fetches the full
receipt and accepts any matching Message (`track.ts:206-213`), without the swap path's
`swapsIn(...) > 1` / `multiple_deposits` check (`swap/track.ts:349-358`).

The backend bridge API keeps one row per `(srcChainKey, txHash)`
(`submit-bridge-tx-db.service.ts:findOrUpsertSubmitBridgeTx`) and `relay-poll.ts:pollBridgePacket` selects
the first packet for that hash. If another deposit's packet is first, the stored hub hash is that other
deposit's, and the user's bridge is followed against the wrong hub receipt. A valid batch can therefore
remain in transit even after its own packet has delivered.

Reproduced through the real MCP tool harness with a prepared approval+bridge batch and a receipt containing
another sender's Message before the expected one. A temporary regression assertion that an ambiguous
source must not be submitted failed: tracking returned `relaying` and submitted the shared transaction hash.
The temporary test was removed after the run. Supporting specification:
https://eips.ethereum.org/EIPS/eip-5792#wallet_getcallsstatus .

Minimum follow-up: reject and hand off multiple-deposit receipts consistently with swaps. Full support
requires identifying the intended message/packet throughout backend storage, relay polling and MCP tracking;
limiting the offered batch capability is an alternative until that exists.

### Validation

- Focused bridge/build/track, source receipt and swap-decision tests: 5 files, 899 tests passed.
- `pnpm checkTs`, `pnpm lint`, and `git diff --check` passed.
- The temporary bundled-deposit regression failed as described above (one test; remaining copied harness
  cases skipped). No live bridge, signing, broadcast or mainnet transaction was performed.


## 2026-11-26 batch guard follow-up review

Scope: the updated eleven-file uncommitted delta on `47a885c`. The original two-deposit case is now
rejected with `multiple_deposits`, an operator alert, no build claim and no backend submit. That fix and
its regression test are correct for two asset-manager deposits.

### P2: a non-deposit connection Message still bypasses the guard

`bridge/track.ts:222` calls `swapsIn(source, sourceTx) > 1`. For spokes, that helper counts only
Messages whose `srcAddress` is the asset manager (`swap/source.ts:142-144`, `sourceTx.ts:48-49`).
A bundled transaction can contain another user's cancel or direct `connection.sendMessage` call before
the valid bridge deposit. The receipt then has two relay Messages but only one deposit, so tracking
claims and submits the shared transaction hash. Backend `relay-poll.ts:pollBridgePacket` selects the
first packet by source chain and transaction hash, with no sender, payload or message-type filter.
The original wrong-hub-transaction failure therefore remains for that variant.

A temporary test appended to a copy of the bridge tool harness prepared a normal bridge and supplied
a receipt containing a non-asset-manager Message before its expected deposit. The assertion that this
ambiguous receipt must return `not_submitted` failed: actual status was `relaying`. The temporary file
was removed. This finding concerns a known build, not the accepted no-build resume limitation.

Follow-up: count every relay Message that competes in backend packet selection, or select and persist
the expected message identity throughout the bridge pipeline. Preserve the one-deposit happy path and
add a deposit-plus-cancel/direct-Message regression test. No production code was changed by this review.

Validation: six focused test files, 914 tests passed; `pnpm checkTs`, `pnpm lint`, and `git diff --check`
passed. One temporary regression failed as described (36 copied harness cases skipped). No live bridge,
signing, broadcast or mainnet transaction was performed.


## 2026-11-26 complete bridge agent decisions and runtime

User direction: complete all four identified agent-flow gaps in the existing new bridge PR (#150).
Implemented, committed and pushed as signed `83f411c` on `feat/147-bridge-tools`. The PR remains draft,
with its existing base `feat/129-next-action`; the base was not merged or rebased during this work.

The swap hash correction helper now takes canonical continuation arguments and also serves bridge track.
A wrong bridge hash asks for a replacement with the resolved chain and bridge id, bounded by the same
three-retry workflow budget regardless of corrected hash/chain. Exhaustion hands off to the help desk.
`bridge_tokens` now gives canonical pair choices, then requests the amount, then calls preview. Repeated
symbol pairs are distinguished by their addresses. The tool output-schema test exercises the new action.

Added permanent `bridgeDecisions.test.ts`: discovery/preview/prepare variants, all source track statuses
and refusal reasons on spoke and hub, every error code for each bridge tool, and special bridge error
branches all run the shared contract and loop checks. Forward preview/prepare transitions and terminal
balance reads retain their intentional one-way behavior.

Extracted the scripted nextAction host for swap and bridge tests. It throws if a runtime reads nextStep.
`bridgeNextActionRuntime.test.ts` follows pair selection through a completed bridge; tests declines,
post-broadcast interruptions, batches awaiting hashes, corrected hashes saved before failed calls,
retry budgets across sessions, each poll stage, upstream failure bounds, terminal held/failed outcomes,
and non-EVM sends. The reference runtime now also recognizes bridge track calls when saving corrected
hashes, while preserving its existing saved-state format. Its README code snippet stays synchronized.

Validation:
- Focused decisions/runtime/tool tests: 5 files, 1,479 tests passed.
- Full suite (including the commit hook): 66 files, 2,967 tests passed.
- `pnpm checkTs`, `pnpm lint`, `pnpm build`, `git diff --check` passed.
- Direct strict TypeScript checking of the new tests and shared host passed.
- Reintroducing unbounded bridge hash correction failed the regression's runaway guard; removing bridge
  hash persistence failed its corrected-hash resume assertion. Both mutations were restored.
- PR #150 description updated to the final behavior and validation. No real bridge, signing or broadcast.

The previous bundled-message review findings are resolved by `7077dba`; removed the stale unresolved
follow-up from the brief. Remaining release gates are the real-bridge canary and SDK documentation page.


## 2026-11-26 first-time bridge agent walkthrough

User requested feedback as an unfamiliar agent. Used an isolated `83f411c` worktree because the active
feature worktree initially had a merge conflict; its merge and later edits were left untouched. Fourteen
MCP calls exercised discovery, common input mistakes, live API/RPC preview, balance read, unsigned prepare,
non-EVM address requirements, invalid hash input and an unseen hash. No signing/broadcast or real delivery.

`agent-feedback.md` contains the observations, five prioritized UX recommendations and scope limitations;
`artifacts/agent-onboarding-2026-11-26.json` records every call with explicit sampling/omissions. The MCP
initialization instructions were inspected as well as tool schemas/results. This was not a separate blind
model evaluation, hosted transport/API-key onboarding test, or completed funded bridge. No implementation
changes were made. Temporary worktree removed after preserving the evidence.


## 2026-11-26 API-key and resource-abuse assessment

User asked whether callers can spam MCP and whether bridge requires an API key. Read-only assessment
of feature head `a78690e` and backend auth source; no production flood, fake-key probe, signing or relay submit.

At the HTTP/stdio profile gate, missing/malformed keys are rejected for bridge; `all` hides bridge tools
without a key-shaped value. Local pure-function check: a synthetic nonexistent but correctly shaped key
produces `apiKeyStatus: valid` and enables bridge. This is format validation, not a principal lookup.
Preview then performs hub RPC reads directly; prepare also performs local SDK/RPC work in addition to
key-forwarded backend calls. No additional edge authentication configuration was inspected.

Backend bridge routes declare `bridge:read` / `bridge:write`; ApiKeyGuard rejects failed checks only in
enforce mode with its keyset enabled. Configuration defaults mode to off; monitor also allows failures.
Three single unauthenticated GET probes (no credentials, 12-second timeout) observed production MCP
`/api` and `/health` at 200, version 2.0.0, with no bridge profile listed; Bridge API `/tokens` also returned
200. These observations do not prove the mode/configuration of all write routes. The earlier in-process
walkthrough deliberately bypassed MCP HTTP profile selection and did not test hosted authentication.

Protections in app code: 100 HTTP requests/minute/IP, 60 MCP messages/minute/IP, maximum 10-message
batches counted per message, 100 KB request bodies, SSE caps 10/IP and 200/process with 1-hour idle TTL,
and bridge store caps 1,000 open/key and 10,000 total with 10+30 minute retention. Store checks precede
upstream preparation work. Rate counters are in process memory; no verified-principal/tool-cost quota or
global active bridge-call semaphore was found. nextAction retry budgets are client behavior, not an
adversarial server-side limit.

Recommended order: verify real key/scopes before expensive RPC work, authenticated per-org/per-tool
budgets, bounded per-principal/global concurrency with short queues, shared counters if scaling replicas,
and ingress/proxy protections. Cache/coalesce safe read calls where useful. Do not declare the service
DoS-proof from these app limits. Any formal security finding should be triaged privately through AuditMap;
no public issue/PR comment was posted from this assessment.


## 2026-11-26 five-minute expiry and tracking-pin review

User requested assessment of the uncommitted policy. `expiry-review.md` records two reproduced P2
findings: invalid track requests create long-lived pins; global swap eviction ignores a tracking pin
past the intent deadline. Existing focused checks: 55 passed. Two temporary regressions failed and
were removed. No product fix, commit/push, signing/broadcast, production load or public issue/comment.
