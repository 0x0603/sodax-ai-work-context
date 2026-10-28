---
type: review
github: 79
repo: builders-sodax-mcp-server
status: Open
created: 2026-10-28
updated: 2026-10-28
related_issues: [81, 82, 83, 84, 85, 86, 87, 88, 89, 99]
tags: [mcp, swap, review, security, agent-ux, structure]
---

# GH-79 whole-project review, 2026-10-28

Four independent agents on `feat/89-swap-docs` @ `33cffde` (the whole stack on `development` @ `02ba5df`): agent UX
(live on canary, `0x…dEaD`, ~50 calls, nothing signed), security (server + backend exposure), swap-flow correctness,
structure and quality. Merged and de-duplicated here; IDs in brackets are the source report (U = UX, S = security,
C = correctness, Q = structure). Spot-checked by hand: S1 (batch handling in MCP SDK 1.26.0), S4 (raw `txHash` in
URL paths), C2 (`chainId` only on the step, not in `tx`), U2/C7 (no alert on `deposit_mismatch`), U3 (cancel's
"call track first"), Q1 (all PRs based on `development`). C3, C4, C5 have proof tests in the session scratchpad
(not kept). Gates at the tip: 749 tests, lint clean.

**Public repo:** S1–S6 and S9 go through AuditMap or a private channel, never a public issue or PR text.

## Tier 1: funds safety, before production serves the swap tools

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | [C2] Steps carry `chainId` beside `tx`, not in it, and nextStep never says to switch network. Arbitrum, Base, Optimism, Polygon share asset manager and `connection` addresses, so a wallet on the wrong network deposits there; track reads the quoted chain and says nothing was swapped | `quote.ts:73-78,354-362`, `swap.ts:306` | `chainId` (hex) inside every `tx`; "switch to chain N" in nextStep |
| 2 | [C1] `source_not_found` ("nothing was swapped, quote again") after looking up one hash: a sped-up / replaced tx, or a deposit on another chain, is never submitted or refunded and nobody is alerted; the advice invites a second deposit | `track.ts:99-106`, `swap.ts:336-337` | Scan the chain's `connection` logs from a block stored at quote time and `checkDeposit` each; else softer wording + alert when a quoteId was given |
| 3 | [C3] A tx holding two deposits: the backend row (keyed on txHash + chain) is trusted for both quotes; B is reported as A's status and never posted | `track.ts:87-90,127`, `swapsApi.ts:174-178` | Refuse + alert on more than one deposit Message, or compare the row's intent hash with the cached intent |
| 4 | [C4] Track/cancel need the live catalog to list the source chain; a chain delisted after a deposit gets `UNSUPPORTED_SOURCE`, not retryable, no alert, no refund relay | `source.ts:38-46,56-77` | With a cached quote, take chain id / connection / asset manager from the pinned SDK config |
| 5 | [S3, C5] Quote cache: the per-key cap counts only until the deadline, entries live to deadline + 30 min, a full cache evicts the oldest entry even when claimed or relayed for refund; any `sodax_…` string is a key | `quoteCache.ts:31-34,45-73` | Count to `expiresAt`; never evict claimed entries; evict unclaimed past-deadline first; refuse new quotes when full; cap per client IP |
| 6 | [U2, C7] `deposit_mismatch` covers three cases (another quote's deposit; this intent from another `from`; a 4337 bundle with someone else's deposit) and never alerts; the agent has no other quoteId and loops | `track.ts:116-117`, `sourceTx.ts:63-74`, `swap.ts:315-316` | Alert when items 2 and 4 match but 1 differs; word the bundle case like `not_a_deposit`; nextStep for "no other quoteId" |
| 7 | [U3, S9, C9] Cancel: on a never-submitted swap it says "call sodax_swap_track first", which submits the swap the user wants to cancel; without a quote it trusts the hub intent's `creator`; it compares an unclaimed quote with any public tx, so anyone can raise a false SWAP_MISMATCH that mutes the real alert for 24 h | `cancel.ts:45-79,109-122`, `swap.ts:379`, `alerts.ts:56-60` | Read the receipt (never sent vs mined-not-submitted, ask the user first); check `creator` = user's hub wallet and `srcChain`; compare only when `depositTxHash === txHash` |
| 8 | [C6] An early `SWAP_REJECTED` ends tracking with "SODAX has been alerted" and no retry, so the server's own refund relay never runs; server/backend clock skew (SDK tolerates 300 s) moves the refusal outside the last-minute window | `track.ts:37-39,150-155` | Return a state with `retryAfterSec` = time to deadline + margin; widen the window by the tolerated skew |
| 9 | [U1] The quote never touches the source RPC (allowance is the backend's), so a chain whose RPC is dead quotes `ready`, then track and balance fail forever. Seen live on Ethereum (SDK default `eth.merkle.io` answered 429); track's retry text never gives up | `source.ts:96`, `quote.ts:196-198` | Set `SODAX_RPC_URL_<id>` for every EVM source in production; probe the source RPC (cached) before `ready`; give track's retry a stop point |
| 10 | [S5] The user's minimum is whatever `/v1/swaps/quote` says: `findMismatch` checks the intent against the backend's own quote only; `packagedToken` doesn't compare the symbol | `quote.ts:144,268-271` | Compare oracle USD of the minimum output with the input's; refuse past a bound, warn when unpriced; compare the symbol |
| 11 | [C8] An unknown backend status maps to `in_progress` with a retry, so a new final status keeps agents polling forever | `track.ts:219-228` | Stop polling after the quote's life with a non-polling `unknown` state |

## Tier 1: security and backend exposure (private channel)

| # | Finding | Where | Fix |
|---|---|---|---|
| S1 | JSON-RPC batch bypasses the 60/min limiter: SDK 1.26.0 stateless transport runs every message of an array body; `express.json` takes 100 kb, ~350 tool calls per request. **Pre-existing on `development`, live in production now** | `index.ts:165-171,255-266` | 400 on array bodies at `/mcp`, or count messages; a global cap on concurrent outbound calls |
| S2 | Every backend call leaves from the MCP's one IP; the edge doesn't split by key, so a couple of looping callers make every user's quote/track `RATE_LIMITED` (deposits miss deadlines) or get the IP jailed; keyless `sodax_relay_submit_tx` / `sodax_get_solver_quote` now count against the same IP | `http.ts:125-133`, `relay.ts:54` | Before swap production: edge keys limits on `x-api-key` or trusts the MCP's XFF and exempts `submit-tx` (Paul); meanwhile per-key and global outbound caps; key-gate `sodax_relay_submit_tx` |
| S4 | Builder tools put raw input into URL paths (`txHash: "../../../<route>"` → any GET on api.sodax.com from the MCP's IP; `?limit=` injection). **Pre-existing** | `sodaxApi.ts:229,258,410,612,625,643,656,676` | Validate each param and `encodeURIComponent` |
| S6 | No limit on long-lived connections: GET `/mcp` with `text/event-stream` holds a stream and a server forever; `sseSessions` has no cap or idle timeout; a keyless POST to `/messages` runs a keyed session's swap tools under `sha256("")`, shared by every keyless caller | `index.ts:255-300` | 405 on GET `/mcp`; cap SSE sessions per IP and globally with idle timeout; refuse swap calls whose key differs from the session's |
| S7 | `trust proxy 1` + compose publishes the port on all interfaces: XFF spoofable if the port is reachable directly | `index.ts:136`, `docker-compose.yml:9-10` | Bind to 127.0.0.1 / don't publish; trust the proxy's address. Check Coolify |
| S8 | `docs_refresh` lets anyone drop the docs cache and its back-off; during a docs outage every builder/all request blocks up to ~60 s in `createServer` | `tools/docsProxy.ts:218`, `services/docsProxy.ts:308` | One refresh per minute globally; keep stale tools |
| S10 | Mintlify-controlled docs descriptions and results sit next to tx-building tools in `all` (prompt injection could steer `toAddress`); builder tools echo backend error text with URLs | `tools/docsProxy.ts:108,144`, `http.ts:142` | Instructions say docs output is untrusted; don't mix docs and swap by default |
| S11 | PostHog id = SHA-256(IP + public salt): reversible for IPv4 | `analytics.ts:53-55` | HMAC with an env secret |
| S12 | `release-please.yml`, `sync-to-development.yml` run unpinned actions holding the App private key; `ci.yml`, `drift-check.yml` have no `permissions:`; `cat server.log` lands in public Actions logs; check `canary-e2e` is branch-restricted | `.github/workflows/*` | Pin by SHA; add `permissions:` |
| S13 | No final error handler: Express may return stack traces when `NODE_ENV` is unset | `index.ts` | JSON-RPC error handler |

Sound (S): key forwarding allowlist after normalisation, no redirect with a key, SDK never gets a key; per-request key
isolation; backend-built tx checks (exact approve, byte-for-byte swap rebuild, recipient, chains, creator, fee,
chainId); track submits only on its own proven deposit, claim can't race, key-bound quotes; alerts deduped and
budgeted; secret screening never echoes; partner fee connection-only; URL-free logs; `--ignore-scripts`, non-root
container, exact overrides.

## Tier 2: agent UX

- [U4] Polling assumes the agent can wait; most hosts can't sleep. Optional `waitSec` (≤ 30–45 s) long-poll on track,
  or MCP tasks.
- [U5] A ready ERC-20 quote is ~2.1k tokens; the ~3.3k-char swap calldata appears twice (steps and batch). Let the
  batch reference step indexes; consider a resource link for tx data.
- [U6] No fees, gas, time estimate or price impact; `expiresAt` absolute only. Canary `/v1/intent/oracle` answered
  502 so `usdValue` is always null and every quote carries the "confirm a large amount" sentence. Add `fees`,
  `estimatedSeconds`, USD in/out, `expiresInSec`.
- [U7] In `all` (the default), `sodax_relay_submit_tx`, `sodax_get_transaction`, `sodax_get_solver_quote` compete
  with the swap tools. One sentence in their descriptions and the instructions: "for a user's swap use sodax_swap_*".
- [U8] `SOL` on Arbitrum suggests `SODA`; `otherChains` matches by address only. Add exact-symbol matches on other chains.
- [U9] A chain typo dumps all 22 chains (~450 tokens). "Did you mean" with the existing `editDistance`; list only
  source-capable chains for `fromChain`.
- [U10] Schema errors are plain text without `code`/`nextStep`; error `field` vs `side` inconsistent; no field on
  `INVALID_ADDRESS`; `amount: 5` (number) refused; `"1,000"` gets a decimals message.
- [U11] "Use the same API key" advice: the model can't set connection headers. Say the key changed, tell the user.
- Still open from 2026-10-27: `UNKNOWN_TOKEN` without candidates; `AMOUNT_TOO_LOW` without the minimum.
- Numbers: swap `tools/list` ~1.7k tokens, `all` ~10.7k (45 tools); typical swap 3–6 MCP calls, ~3–4k tokens of
  output; worst case ~80 polls (a never-sent hash with a live quote).

## Tier 3: structure and process

- [Q1] **Every PR targets `development`**, so #94 shows +10.3k and #102 +15.6k; real per-PR sizes are 445 / 814 /
  1894 / 2855 / 2727 / 797 / 1251 / 799 / 273. Base each PR on the branch below (GitHub retargets on merge); squash
  review-fix commits; split #84's dependency part (SDK pins, overrides, lockfile, Dockerfile, CI) into its own PR;
  move the logger URL stripping from #87 down to #81. Conflicts with plan.md's "never a GitHub native stack": user's call.
- [Q3] `index.ts` is untestable (`main()` on import, app built in `runHTTP`): add `src/app.ts` `createApp()`; tests via
  `app.listen(0)`; land with #100 (which ships without a test).
- [Q9] Contract tests never run in CI: add `pnpm test:contract` to the daily drift-check job (keyless production).
  ~5 lines, in #88.
- [Q4] Error models: builder services rethrow "Failed to fetch" for 401/403/429 since #81 forwards keys; `tokens.ts`
  fetches `/swaps/tokens` outside `swapsApi.call()` so a 429 is `UPSTREAM_UNAVAILABLE` (fix in #83); builder
  `sodax_get_swap_tokens` reads `/v1/be/config/swap/tokens` while swap tools use `/v1/swaps/tokens`. One
  `classifyHttpError()` in `http.ts` after the stack.
- [Q2, Q12] The action-tool template is swap-bound (module `"swap"`, swap error codes, analytics whitelist by group,
  steps in `quote.ts`). Move generic parts to `services/action/` and name the internal toolset after the gate, before
  phase 2; profile names become public API once #101 publishes `server.json`.
- [Q5] Builder files: `tools/sodaxApi.ts` 1279 lines with 29 identical catch blocks → `dataTool()` wrapper + split by
  module; `services/sodaxApi.ts` ~20 copies of cache/fetch → `TtlCache.getOrLoad`; move `resolveChainKey`/`CHAINS` to
  `services/chains.ts`; `apiDriftCheck.ts` data out. Add output tests first. After the stack.
- [Q6] Env/config handled four ways; `checksumValid` passes silently before the SDK loads. `src/config.ts`
  `readBootConfig(env, argv)`; fail closed. After the stack.
- [Q7, Q8] `sodax.ts` mixes SDK access with swap builders and duplicates the 14-field intent type; `source.ts` is a
  grab-bag; `usd.ts` depends on `sourceTx.ts`; rename `sodax.ts` → `sdk.ts`, `sodaxApi.ts` → `dataApi.ts`; split
  `tools/swap.ts` nextStep builders and `quote.ts` `findMismatch`.
- [Q10, Q11] Tests reset 4–6 module caches by hand (one `resetSwapState()`); ~55 tests pin exact nextStep prose (keep
  exact only for safety sentences).
- [Q13] Long docblocks to trim (`server.ts:98-110`, `toolRegistry.ts:1-15`, `swapCanary.ts` header, `/health` in
  `index.ts`); dead exports (`trackNextStep`, `cancelNextStep`, `connectionMessages`, `TrackState`, `CancelState`,
  `SourceChain`, `QuoteInput`, `SwapBatch`; old `BRAND_COLORS`, `FilledIntent`, `RelayPacketData`,
  `formatAsMarkdown`); move the pnpm 10 `minimumReleaseAge` PR up.

Well structured (Q): per-request key isolation and the URL allowlist; pure `profiles.ts`; one registrar table for
server, counts and `server.json`; services return structure and only the tool layer writes `nextStep` from enum and
catalog values; `sodax.ts` the only SDK caller; zod at the Swaps API boundary; small bounds-checked `sourceTx.ts`
decoders; SHA-pinned canary workflow.
