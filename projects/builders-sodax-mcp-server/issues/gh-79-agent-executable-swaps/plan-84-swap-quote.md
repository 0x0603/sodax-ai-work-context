---
type: plan
repo: builders-sodax-mcp-server
github: 84
related_issues: [79, 83, 85, 86, 87]
tags: [mcp, swaps-api, quote, partner-fee, sodax-sdk]
updated: 2026-10-26
---

# #84 — `sodax_swap_quote`

Status: commits 1–5 shipped as one commit in draft PR #94 (`a5fc108`); commit 6 waits for the cooldown. Drafted by a planning agent on 2026-10-26 from `feat/83-resolve-token`
@ `2997dd8`; reviewed the same day (see §Review). Branch `feat/84-swap-quote` off `2997dd8`.

## Context

ADR (`3c9b00b`) overrides the issue body: `createIntent` with explicit min output and deadline (not `includeTxData`);
EVM + Sonic sources only (the issue's non-EVM contract test becomes "a non-EVM source returns `UNSUPPORTED_SOURCE`");
no speed tier; no Stacks/Bitcoin extras; cache TTL = deadline + 30 min. Track/cancel are #85 (#84 exports the cache
reader).

Live facts (probed 2026-10-26, `api` and `canary-api`, keyless): `POST /v1/swaps/quote` → `{quotedAmount}`; 1 base unit
→ 422 `{message:"…Input amount too low", code:-23}`; `partnerFee:{address, percentage}` (1–100) is deducted by the
quote itself; `GET /deadline?offsetSeconds=` → `{deadline}`; `GET /fees/solver?amount=` → `{fee}`; `POST /intents` →
`{tx:{from,to,value,data}, intent, relayData:{address,payload}}` and echoes our `minOutputAmount` / `deadline`;
`POST /allowance/check` → `{valid}`; a `withdrawOnly` source (Arbitrum tBTC) is **not** refused upstream; chain
`type` / `chainId` come from `/v1/be/config/spoke/all-chains-configs`.

## Scope

In: `sodax_swap_quote`, strict `units.ts`, partner fee from the connection, a Swaps API REST client, the quote cache,
the NEAR / Stellar recipient check via the SDK, `@sodax/sdk` + `@sodax/types` (exact) + overrides + `engines` +
`sodax-deps.yaml`, the hub PR, image size recorded.

Out (owner): balance check + `INSUFFICIENT_FUNDS` (#86, needs the backend route) · track/cancel, EVM RPC overrides,
reading the cache (#85) · secret screening, USD warning, analytics outcomes (#87) · funded E2E (#88) · walkthrough,
`server.json` tools, dropping the switch (#89).

## Design

1. **SDK only for the recipient check** (`sodax.spoke.near.isStorageRegistered`, `sodax.spoke.stellar.hasSufficientTrustline`;
   ADR D5). Lands in the last commit, loaded by dynamic `import()` only when `SODAX_SWAP_TOOLS_ENABLED=true`.
2. **Swaps API over REST, not `SwapsApiService`**: its client retries a 429 at once (`RETRYABLE_STATUS` includes 429,
   "no backoff") and `SwapsApiError` keeps status + body but no headers, so D2's "wait out `Retry-After`" and
   `retryAfterSec` are impossible. `http.ts` already sends the per-request key and refuses keyed redirects; zod
   response schemas catch drift. `tokens.ts` stays on REST too.
3. **Build path**: quote ‖ `/fees/solver` → `minOut = ⌊quoted·(10000−slippageBps)/10000⌋` (0 → `AMOUNT_TOO_LOW`) →
   `/deadline` → recipient check → `/intents` ‖ `/allowance/check` (same body) → `/approve` if `valid:false`. Assert
   the returned `intent.minOutputAmount` / `deadline` equal what we sent, else `UPSTREAM_UNAVAILABLE`.
4. **Partner fee** (decision 7): query pair (`partnerAddress`, `partnerFeeBps`) if either is set, else header pair;
   stdio `SODAX_PARTNER_FEE_*`. Both or neither; EVM address; integer 1–100; repeated query refused; else
   `ConnectionError(400)` (HTTP) / fatal at boot (stdio); messages never echo values; validated on any profile; warn
   if the env is set over HTTP. Sent as `partnerFee:{address, percentage}` on quote and intents; shown as
   `⌊gross·bps/10000⌋`; cached with the quote.
5. **No balance check** (no backend route; D6 forbids own reads): `checks.balance: "not_checked"`, said in `nextStep`.
6. **Restricted tokens fail closed**: `withdrawOnly` source / `depositOnly` destination → `RESTRICTED_TOKEN` before any
   Swaps API call.
7. **Chains / addresses**: source `chain.type === "EVM"` else `UNSUPPORTED_SOURCE`; `fromAddress` EVM; `toAddress`
   defaults to `fromAddress` for EVM destinations, required otherwise; NEAR and Stellar formats checked locally;
   other families left to the API (400 → `SWAP_REJECTED`).
8. **Steps / batch**: `[reset_approve?, approve?, swap]`, each `{kind, chainId, tx}`, in order, each mined first.
   `batch` = EIP-5792 `wallet_sendCalls` params (`version "2.0.0"`, hex chainId, `atomicRequired: true`, hex values)
   for approve + swap only, omitted for a single call; a reset goes alone first.
9. **Quote cache**: Map keyed by `randomUUID()`, expires `deadline·1000 + 30 min`, max 10k (expired first, then oldest,
   with a warning), only quotes with `fromAddress`; no Bound field; exports `getCachedQuote` for #85.
10. **Errors** (each with a default next step): `INVALID_AMOUNT`, `UNKNOWN_TOKEN` (a side not `resolved` → call
    `sodax_resolve_token`), `UNSUPPORTED_SOURCE`, `RESTRICTED_TOKEN`, `INVALID_ADDRESS`, `DESTINATION_NOT_READY`,
    `AMOUNT_TOO_LOW` (422/-23 or minOut 0), `SWAP_REJECTED` (other 4xx; details: status + upstream message ≤ 200
    chars), `API_KEY_REQUIRED` (401/403, links `API_KEYS_DOCS_URL`), `RATE_LIMITED` (429, `retryAfterSec` from
    `Retry-After` seconds or HTTP date, 60 if absent), `UPSTREAM_UNAVAILABLE`.
11. **Timeouts**: 15 s per Swaps API call; 15 s cap on the recipient check.
12. **`nextStep` (ready)**: "Show the user the expected and minimum amounts and the expiry; once they confirm, have
    their wallet sign and send the steps in order (each mined before the next, or the batch) before {expiry}, then
    call sodax_swap_track with the quoteId and the swap tx hash. This server can't check balances yet, and if it
    doesn't list sodax_swap_track, don't send the swap step: nothing would submit it." (#85 drops the last clause.)
13. **`Sodax` instance**: `initSodax()` in `main()` when the switch is on; `new Sodax({ api: { baseURL:
    \`${SODAX_API_ORIGIN}/v1\` }, logger })`, no `apiKey`; `ConfigService.initialize()` is a no-op in 2.2.0, so NEAR /
    Stellar settings are packaged (a contract test checks them against live).
14. **Dependencies**: exact `@sodax/sdk` / `@sodax/types` `2.2.0`; `engines.node >=22.12.0`; overrides `axios 1.19.0`,
    `toml 4.1.2`, `ws@7 7.5.13`, `ws@8 8.21.3` (sodax-sdks' patched pins); `bigint-buffer` has no fix (1.1.5, 2022) —
    the advisory to track, not `ws`; final list = what `pnpm audit --prod` clears; `--ignore-scripts` on the
    Dockerfile builder, `nixpacks.toml` and CI installs.

## Changes (commits)

1. `src/services/swap/units.ts`: `parseUnits(amount, decimals): bigint` (trim, `^\d+(\.\d+)?$`, ≤ decimals fraction,
   > 0, ≤ 2^256−1, else `INVALID_AMOUNT`), `formatUnits(base, decimals)`.
2. Partner fee: `src/services/partnerFee.ts` (`partnerFeeFromRequest`, `partnerFeeFromEnv`, `ConnectionError(400)`);
   `requestContext` gains `partnerFee?`; `resolveConnection` returns it (into `/mcp` context, SSE session, `/messages`,
   stdio fallback); `profiles.ts` exports `API_KEYS_DOCS_URL`; README, `.env.example`, `server.json` (two optional
   headers).
3. Swaps API client: `http.ts` exports `HttpError {status, body, retryAfterSec}` (same message);
   `swap/chains.ts` `getSwapChain(key) → {type, chainId}`; `swap/swapsApi.ts` (`getQuote`, `getSolverFee`,
   `getDeadline`, `checkAllowance`, `buildApprove`, `buildIntent`, zod schemas, `toActionError`); `errors.ts` codes.
4. `swap/quoteCache.ts`: `putQuote`, `getCachedQuote`.
5. The tool: `swap/quote.ts` `quoteSwap(input, partnerFee)` (structure only); `swap/destination.ts` (this commit: a
   NEAR / Stellar recipient with `fromAddress` → refused "can't check that recipient yet"); `tools/swap.ts` registers
   `sodax_swap_quote` (inputs `fromChain fromToken toChain toToken amount fromAddress? toAddress? slippageBps
   deadlineMinutes`), `quoteNextStep`, `USE_RESOLVED` points at `sodax_swap_quote`; `SWAP_INSTRUCTIONS` gains a
   sentence; fixtures gain `chain:{chainId,type}`, plus Base / NEAR / Stellar; `vitest.config.ts` `SODAX_ENV` from
   `SODAX_CONTRACT`; script `test:contract`.
6. **After 2026-10-26 11:16 UTC** (`@sodax/bridge-api@2.2.0` published 11:15:18): deps, overrides, `engines`,
   `src/services/sodax.ts` (`initSodax`, `getSodax`), SDK-backed `destination.ts`, `--ignore-scripts`, `sodax-deps.yaml`.
   Check every new lockfile `name@version` is ≥ 14 days old. If blocked, ship 1–5 and move 6 + hub PR to a follow-up.

## Tests

Unit: units (incl. 2^256−1 ok, 2^256 / `1,000` / `1e6` / `.5` / `5.` / `-1` / `0` / extra fraction digits fail);
partnerFee (pairs, precedence, every invalid case 400, env); `HttpError` (`Retry-After` seconds / date / absent);
swapsApi error mapping and `partnerFee` wire shape; quoteCache (expiry, 10k cap order). In-process MCP: tools list,
price-only, ready with approve + swap, native source without approve, reset alone and out of the batch, minimum
rounding, intent mismatch, tBTC / Sui sources refused without a Swaps API fetch, bounds, partner fee in both bodies
and the output, NEAR / Stellar recipient handling. Contract (`describe.runIf(SODAX_CONTRACT)`, `fromAddress
0x…dEaD`, nothing signed or submitted): Arbitrum USDC → Base USDC (approve + swap, chainId 42161, `swap.tx.to` =
live asset manager, minimum = `intent.minOutputAmount`, deadline 14–16 min); Sonic USDC → Arbitrum; Arbitrum ETH
(no approve); price-only; dust → `AMOUNT_TOO_LOW`; 100 bps fee; tBTC → `RESTRICTED_TOKEN`; Solana →
`UNSUPPORTED_SOURCE`; commit 6: NEAR / Stellar not-ready recipients, packaged Stellar trustline config vs live.

## Ship

Draft PR `feat: add sodax_swap_quote to the swap profile`, `Closes #84`; body lists departures (ADR overrides, REST
client, no balance check, bigint-buffer vs ws), image size and audit before / after, the deploy Node check. Public
repo: observed public API behaviour only. Hub PR with commit 6 (`repos.yaml` `depends_on` + `sodax-sdks`, card Node
≥22.12 and the SDK note, IF-25 consumer `swapsApi.ts`, `gen-doc-index.py`); merge after the bump bot pins #84.

## Review (2026-10-26)

Checked: SDK `@sdks@2.2.0` `packages/swaps-api/src/http.ts` (429 in `RETRYABLE_STATUS`, "no backoff"),
`errors.ts` (status + body, no headers), `ConfigService.initialize()` no-op, `NearSpokeService.ts:271`,
`StellarSpokeService.ts:605`; live probes of quote / deadline / intents / allowance (shapes as in §Context, our
`minOutputAmount` and `deadline` echoed); `bigint-buffer` latest 1.1.5 (2022). Decisions on the planner's open
questions:
1. **REST over `SwapsApiService`: accepted** (D2 needs `Retry-After`). Amend D3's wording in PR #90.
2. **Deploy path**: `ci.yml` says Coolify builds the Dockerfile (`node:22-alpine`, ≥ 22.12); README's nixpacks note
   looks stale. Confirm on the staging build log before merging commit 6.
3. **Track `bigint-buffer`, not `ws`**: accepted; correct ADR D3 and `plan.md` decision 1 with the D3 amendment.

## After implementation (2026-10-26)

Departures from the design above, all verified live:

- **No solver fee.** `/fees/solver` ignores the token (0.1% of any amount) and the quote doesn't visibly deduct it;
  the output shows the net quote only.
- **Chain family and id come from the swap catalog** (`SwapCatalog = { tokens, chains }`), not a second chain-config
  read, so quotes keep working on the stale catalog when the data API is down. `chains.ts` was dropped.
- **`/deadline` runs alongside `/quote`** on the ready path.
- **The intent's `inputAmount` is checked too**: the API nets the partner fee out of it (5,000,000 at 100 bps →
  4,950,000) while the tx still moves the full amount, so the check confirms the fee shown to the user.
- **Price-only asks only for what's missing**: `fromAddress`, plus `toAddress` for a non-EVM destination.
- Until #85, `nextStep` tells the agent not to send the swap step or the batch; the rollout switch is the real gate.
  The PR must say: don't turn `SODAX_SWAP_TOOLS_ENABLED` on anywhere before #85.
- **What the API builds is checked against the quote** (code review): the intent's input (net of fee), minimum,
  deadline, input/output tokens as the catalog's `hubAsset`, a hex recipient (EVM, Sui; base58 and names are
  encoded per chain, so not compared), `tx.from`, `tx.value` (amount for native, else 0), and each approval as
  `approve(swap tx.to, exact amount)` on the source token (a reset with 0). Verified live on Arbitrum, Sonic,
  native ETH, Sui and Solana destinations; the approve amount is the gross amount even with a fee.
- Step `tx.value` is a hex quantity, like the batch. The ready `nextStep` names the recipient.
- `/deadline` must be within 5 min of now + offset. `SWAP_REJECTED` is 400/422 only (other 4xx →
  `UPSTREAM_UNAVAILABLE`); its `reason` is passed only as one plain line. `HttpError` keeps `apiMessage`,
  `apiCode`, `retryAfterSec`, not the raw body (logs stay small).
- Partner address `0x0…0` is refused. EIP-55 checksums aren't checked: Node has `sha3-256` but not
  keccak-256; revisit with viem in commit 6.
- Quote cache: sweeps expired quotes every minute and whenever full, so a live quote is dropped only when nothing
  expired is left; the "full" warning is once a minute. No per-key cap yet (one key could crowd the 10k cache).
- `destination.ts` refuses a NEAR / Stellar recipient on a ready quote until commit 6. It stays after the quote:
  the Stellar trustline check needs the quoted amount.
- Tests: `pnpm test:contract` (own `vitest.contract.config.ts`, kept out of `pnpm test`; canary default,
  `SODAX_ENV=production`), 9 cases including the fee on the ready path and Sui / Solana recipients.
