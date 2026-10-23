---
type: plan
repo: builders-sodax-mcp-server
github: 79
status: Proposed — not adopted
tags: [mcp, swaps-api, agents, ideas]
updated: 2026-10-22
related_issues: [gh-1372-per-org-edge-rate-limit]
---

# GH-79 improvement ideas (not adopted)

These are candidate changes to `plan.md`, and none of them is adopted yet.

- Each one waits for the user's decision.
- Ideas that change epic scope also need R0bi7's agreement in the ADR review.
- Code references are as of 2026-10-22: MCP `development` @ `02ba5df`, production v1.6.0.

## Plan changes (high impact)

### 1. Lift the shared submit throttle with an MCP service key

- **Problem:** every MCP user shares one egress IP, and `submit-tx` allows 10 calls per 60 s per IP. The plan therefore
  caps the whole server at about 8 submits per minute (decision 6).
- **Idea:** sodax-backend #1380 (`OrgLimitAwareThrottlerGuard`) skips that throttle for a key whose org has a limit.
  - Give the MCP its own SODAX key: org `builders-mcp`, with a limit set.
  - Use that key when the caller sends none; forward the caller's key when present.
  - Keep `guardedFetch` as the safety net.
- **Gain:** throughput follows the org limit instead of ~8/min. Keyless MCP swaps are attributed to one org, so MCP usage
  becomes measurable.
- **Depends on:**
  - sodax-backend #1380 (open);
  - sodax-unified-api #136;
  - an org limit set for `builders-mcp`.
- **Caveat:** a caller key whose org has no limit still falls under the per-IP throttle, which means the MCP's own IP.
- **Touches:** decisions 6 and 7; the "Throughput" risk.

### 2. Recover the intent from the mined EVM tx; keep the cache as a fallback

- **Problem:** every deploy restarts the server and drops the in-process quote cache. A swap that was broadcast but not
  yet submitted then needs an operator relay.
- **Facts:**
  - An EVM swap tx that calls `assetManager` directly carries `relayData.payload` verbatim in its calldata.
    `spokeAssetManagerAbi` decodes it.
  - The intent is encoded inside that payload. A full decode into `IntentRequestV2` is not verified.
- **Idea:** when `track` finds no cache entry, it decodes the payload and the intent from the mined tx and builds the
  `submit-tx` body from them. For an EOA, `walletAddress` is the tx `from`.
- **Gain:**
  - `track` needs only `txHash` and `srcChainKey`.
  - Restarts and multiple instances no longer matter for direct EVM calls.
  - The submitted intent is exactly what is on chain, so there is nothing to mismatch.
- **Limits:** smart-wallet batches (EIP-5792, EIP-7702, ERC-4337) and non-EVM sources still need the cache.
- **Needs:**
  - a spike that decodes the intent fully;
  - one copied ABI fragment, because the full SDK is not a dependency.
- **Touches:** decisions 4 and 10; the "Restarts" risk. Backend follow-up (c) becomes less urgent.

### 3. Verify backend-built txs before returning them

- **Swap tx:** `to` must equal `spokeChainConfig[chain].addresses.assetManager`. Check EVM first, then each family
  whose config carries the target address.
- **Approve tx:** the token is the input token, the spender is `assetManager`, and the amount is the input amount.
- **On a mismatch:** refuse with an error and an operator alert, and never return the tx.
- **Why:** the tool moves real funds. A cheap check against `@sodax/types` catches a backend bug or config drift
  before the user signs.
- **Touches:** #84; decision 12.

### 4. Drop Bitcoin as a source chain in phase 1

- **Why:**
  - A Bitcoin source needs a Bound access token minted in a browser, which lives about 10 minutes. Agents rarely have one.
  - Bitcoin-sourced swaps cannot be cancelled through the API.
- **Gain:** dropping it removes the Bound token path and its secret-screening exemption (`bound.accessToken`).
- **Scope:** Bitcoin stays supported as a destination.
- **Touches:** #84, #85; decision 12. Needs R0bi7's agreement, because it narrows epic scope.

## Small additions

### 5. Tool annotations on the five swap tools

- **Annotations:**

  | Tools | Annotations |
  |---|---|
  | resolve, balance, quote | `readOnlyHint: true` |
  | track | `readOnlyHint: false`, `idempotentHint: true` |
  | cancel | `destructiveHint: true` |
  | all five | `openWorldHint: true` |

- **Why:** clients use annotations to auto-run read-only tools and to ask before running tools with side effects.
  The MCP SDK's `registerTool` accepts `annotations`.
- **Scope:** builder tools stay untouched.

### 6. Disambiguate overlapping tools in the default `all` profile

- **Problem:** `all` lists two pairs that an agent could confuse:
  - `sodax_get_solver_quote` (price only) next to `sodax_swap_quote`;
  - `sodax_relay_submit_tx` next to `sodax_swap_track`.
- **Fix:** state in the new tools' descriptions and in the swap instructions which tool to use:
  - execute with `sodax_swap_quote`;
  - after broadcasting, call only `sodax_swap_track`.
- **Scope:** builder tools stay unchanged.

### 7. Gas check at quote time

- **Check:** warn when the source wallet holds no native token for gas, or too little.
- **Why:** this is the common failure for a fresh wallet. Decision 11 checks only the input token.

### 8. Warn when the recipient differs from the sender

- **Check:** a same-family swap whose `dstAddress` differs from `srcAddress` gets a prominent warning in the quote.
- **Why:** it guards against a prompt injection that swaps in an attacker's recipient address.

### 9. Kill switch

- **Switch:** one env var that disables the swap tools, or limits them to price-only quotes.
- **Why:** it handles an incident without reverting code.

### 10. Reuse `submitRelayTx` for the cancel relay

- **Reuse:** `src/services/relay.ts:72` already posts the relay `submit` action, so decision 5's relay step calls it
  instead of adding a new client.
- **Note:** the relay host still moves to `api.sodax.com/v1/relay` in #81.

### 11. Verify with a real third-party wallet MCP

- **Test:** besides the scratch viem signer, run S1–S3 through at least one third-party wallet MCP.
- **Why:** it confirms the `wireTx` format matches what agents actually sign with.

## Phase 2

### 12. Elicitation for quote confirmation

- **Idea:** the server asks the user to confirm the quote directly in the client UI, bypassing the model. This is the
  strongest defense against prompt injection.
- **Blocker:** it likely needs session state, because the client's reply arrives as a separate request, and the server
  is stateless today. Unverified.

## Outside the epic

### 13. The production docs proxy is down

- **State:** production `/health` (v1.6.0) reports `sdkDocsProxy healthy: false, toolCount: 0`.
- **Cause:** the proxy still calls the GitBook endpoint, which has returned 405 since the docs moved to Mintlify.
- **Fix:**
  - the fix is on `development` (#74);
  - release PR #76 (development → master, opened 2026-10-01) awaits approval.
- **Action:** ask the maintainers to merge #76.

### 14. Coordinate with PR #71 before branching

- **PR:** 0xrpj's security-audit remediation, PR #71. Opened 2026-07-22; touches 28 files.
- **Overlap:** it changes files the epic also changes:
  - `src/index.ts`
  - `src/services/http.ts`
  - `src/services/relay.ts`
  - `src/services/analytics.ts`
  - `package.json`
- **Action:**
  - ask whether #71 lands first;
  - if so, branch after it and re-check `plan.md`'s reuse list against the new code.
