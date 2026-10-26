---
type: plan
repo: builders-sodax-mcp-server
github: 87
related_issues: [79, 81, 84, 85, 86, 88]
tags: [mcp, safety, secrets, analytics, posthog, discord, usd]
updated: 2026-10-26
---

# #87 — Safety rules and analytics for the swap profile

Status: draft plan (2026-10-26), not reviewed, not started. Written against `feat/84-swap-quote` @ `c045e28` and
`plan-85-swap-track.md`. Branch `feat/87-safety-analytics` off `feat/85-swap-track` (plan order: #85 → #87 → #88).

## Context

Issue: input screening (private keys, mnemonics, API keys), slippage and deadline bounds, an oracle USD warning per
quote, the canary / production env switch, no secrets in logs, PostHog events (quoteId, chains, no full addresses),
a Discord alert on swap-path errors. Done when each rule has a test and analytics and alerts stay off when their env
vars are unset. The rules themselves are ADR §Safety rules (PR #90).

Most rules already hold; #87 adds the four missing pieces and a test per rule.

| ADR rule | Where it lives | State |
|---|---|---|
| Never sign or broadcast | no signing code; tools return unsigned txs | done (#84); test in §Tests |
| Reject secrets, explain why; exempt tx hashes and values valid on the chain | design 1 | **new** |
| track / cancel trust only the quote cache and chain data | #85 design 1, 2 | #85's tests |
| Slippage 1–500 bps, deadline 5–60 min, rejected not clamped | zod in `tools/swap.ts` | done (#84), `swapQuote.test.ts:365` |
| USD warning above a configurable value, never blocks | design 2 | **new** |
| `SODAX_ENV` once, at boot | `constants.ts:14-28` (#81) | done; unit test missing |
| No secrets in logs; analytics carry quoteId, chains, a USD bucket, never addresses | design 3 | **new** |
| No caller-supplied RPC URL | no such input (#85, #86) | test in §Tests |
| Partner fee from the connection, never a tool input | `partnerFee.ts` (#84) | test in §Tests |
| Discord alert on swap-path errors (issue) | design 4 | **new** |

Code facts (`feat/84-swap-quote` @ `c045e28`):
- `registerActionTool` (`tools/actionTool.ts`) returns failures as `{status:"error", error:{code, message},
  nextStep}` with `isError`, never throws; it logs only non-`ActionError` throws.
- `withAnalytics` (`services/analytics.ts`) wraps `server.tool`: `tool_called` with tool name, group, duration and
  `success`, plus `error_message` only for a thrown error. A returned `isError` counts as success today (noted in
  #83's review). Off when `POSTHOG_API_KEY` is unset. Never sends arguments.
- `postToDiscord` (`services/discord.ts`) is off when `DISCORD_WEBHOOK_URL` is unset, 5 s timeout, never throws. #85
  adds `swap/alerts.ts` (logger + Discord, dedupe per `(kind, txHash)`).
- The Swaps API quote returns only `quotedAmount`, no USD. The solver oracle (`getSolverOracle`, `services/solver.ts`,
  `GET /v1/intent/oracle`, cached 2 min) prices hub assets by `address` on chain 146 with `priceUsd` and `updatedAt`.
  Live 2026-10-26: 868 entries; 63 of the 66 hub assets in the swap-tokens fixture are priced; most prices are
  seconds old, the oldest ~40 days.
- SODAX keys match `^sodax_[A-Za-z0-9_-]+$` (`requestContext.ts:35`).
- Phase 1 has no `bound` input (Bitcoin sources are out), so the ADR's Bound-token exemption has nothing to exempt;
  it returns with Bitcoin sources.

## Scope

In: secret screening; the quote's USD value and warning; swap outcomes and error codes in analytics; Discord alerts
for unexpected swap errors; a test per ADR rule; README safety section and env rows.

Out: per-key analytics and Discord alerts for outages (deferred, open questions 3–4) · Bound-token handling (Bitcoin sources) · funded E2E (#88) · `server.json`,
walkthrough, dropping the switch (#89).

## Design

1. **Secret screening** (`swap/secrets.ts`, `findSecret(value) → kind | undefined`).
   - In the template: every string argument is screened before `run` (after the MCP SDK's zod check), so a secret
     never reaches the handler's own validation, an upstream call or a log. A hit → `SECRET_REJECTED` with `details: {field}`; the value is never echoed.
   - Shapes that are never a legitimate input, so no chain context is needed: a SODAX key (the `requestContext`
     pattern, anywhere in the value); 12, 15, 18, 21 or 24 lowercase words of 3–8 letters (BIP39 English);
     `xprv`/`yprv`/`zprv`/`tprv` extended keys; a Bitcoin WIF; a Solana secret key (base58, 86–88 chars); `suiprivkey1…`;
     a Stellar secret seed (`S` + 55 base32); a PEM `PRIVATE KEY` block.
   - A bare 64-hex value (`0x` optional) is an EVM private key or a legitimate value depending on the chain, so it is
     judged where the chain is known, per the ADR exemption: `checkAddress` returns `SECRET_REJECTED` instead of
     `INVALID_ADDRESS` when a 64-hex value isn't a valid address on that chain (so a Sui or NEAR implicit address
     still passes); `resolveSide` and `sodax_resolve_token` do the same for a 64-hex token query that doesn't
     resolve. Tx-hash fields (`txHash`, `cancelTxHash`) are never judged: they look exactly like keys (ADR).
   - Message: "That looks like a private key, seed phrase or API key; it wasn't used or stored." `nextStep`: "Tell the
     user to treat it as exposed and move their funds or rotate it, and never to paste it into a chat; ask for the
     wallet's public address instead." For a SODAX key: "send it as the x-api-key header, never as a tool input".
   - Accepted: a 24-word phrase is longer than the 128-char input cap, so zod rejects it first, without the
     explanation; it is still never used.
2. **USD value and warning** (`swap/usd.ts`, used by the quote only).
   - `usdValue(hubAsset, amount, decimals)` from `getSolverOracle()`: a price older than 60 min, a missing price or a
     failed oracle call → `null`. Read in stage 1 next to `getQuote` (`Promise.all`); it never blocks or fails the
     quote.
   - Both quote shapes gain `usdValue: string | null` (2 decimals). Above `SODAX_SWAP_USD_WARN` (default 10000;
     parsed in `main()`, a positive number, else fatal naming the variable) the `nextStep` adds: "This swap is worth
     about ${value}, above this server's warning level of ${limit}: confirm the amount with the user before anything
     is signed." Never blocks: the user's signature is the real check (ADR).
3. **Analytics** (`analytics.ts`).
   - `success = !result.isError`, and `error_code` = `structuredContent.error.code` (an enum) for action tools.
     `error_message` stays for thrown errors only (builder tools).
   - Swap-group tools add a whitelist picked from `structuredContent`: `status`, `quote_id`, `src_chain`, `dst_chain`
     (chain keys), `usd_bucket` (`<100`, `100-1k`, `1k-10k`, `10k-100k`, `100k+`, `unknown`). A whitelist, so a new
     output field never leaks: no addresses, amounts or tx hashes. A tool whose output lacks a field omits it (track
     links to its quote by `quote_id`).
   - Off when `POSTHOG_API_KEY` is unset (unchanged).
4. **Discord alerts on swap-path errors** (`swap/alerts.ts` from #85, new kind `swap_error`).
   - Fired from the template's catch for `INTERNAL` (an unexpected throw) and `SWAP_MISMATCH` (the backend built a
     different swap: a bug or a compromised upstream). Fields: tool, code, `SODAX_ENV`; no addresses and no error
     text (SDK and viem messages carry RPC URLs). Dedupe per `(tool, code)` for 10 min.
   - Not for user-correctable codes (the agent fixes those) nor transient ones (`RATE_LIMITED`,
     `UPSTREAM_UNAVAILABLE`, `CHAIN_UNAVAILABLE`): an outage shows in PostHog `error_code` counts (open question 3).
   - Off when `DISCORD_WEBHOOK_URL` is unset (`postToDiscord`, unchanged).
5. **Docs**: README "Safety" section listing the rules in plain words; env rows for `SODAX_SWAP_USD_WARN`;
   `SWAP_INSTRUCTIONS` gains "Never pass private keys, seed phrases or API keys as tool inputs."

## Changes (commits)

1. `feat: reject secrets pasted into swap tool inputs` — `swap/secrets.ts`, template screening, `checkAddress`,
   `resolveSide`, `sodax_resolve_token`, `SECRET_REJECTED` in `errors.ts`, `SWAP_INSTRUCTIONS`.
2. `feat: show a swap's USD value and warn above a limit` — `swap/usd.ts`, `quote.ts`, `quoteNextStep`, env parsing in
   `main()`, README env row.
3. `feat: record swap tool outcomes in analytics` — `analytics.ts`.
4. `feat: alert on unexpected swap tool errors` — `actionTool.ts`, `swap/alerts.ts`.
5. `test: one test per safety rule` — the matrix below, README "Safety" section.

## Tests

- Secrets: each shape → `SECRET_REJECTED` in every swap tool's string inputs, before any fetch (stubbed `fetch` never
  called) and with the value in no output and no `logger` call; a tx hash in `txHash` passes; a 64-hex value as an
  EVM address or token → `SECRET_REJECTED`, as a Sui address → passes; "USD Coin" and a normal address pass.
- USD: priced → `usdValue`; above the limit → the warning sentence and the quote still ready; stale (> 60 min),
  missing or failing oracle → `null`, no warning, quote unaffected; invalid `SODAX_SWAP_USD_WARN` → fatal at boot.
- Analytics: an `isError` result → `success:false` with `error_code`; swap events carry only the whitelisted keys
  (serialize the capture call, assert no address, amount or tx hash); nothing captured without `POSTHOG_API_KEY`.
- Alerts: `INTERNAL` and `SWAP_MISMATCH` post once per 10 min per `(tool, code)`; user and transient codes don't post;
  nothing posted without `DISCORD_WEBHOOK_URL`; no error text in the payload.
- Rules already in place, one test each if missing: `SODAX_ENV` invalid → fatal, read once (no per-request input); no
  swap tool schema has an RPC URL or partner-fee field (schema snapshot); no tool takes a signed tx or broadcasts
  (no `sendRawTransaction` / signer import in `src/`); slippage and deadline bounds (exists).
- `pnpm checkTs && pnpm lint && pnpm test && pnpm build`.

## Ship

Draft PR into `development`, `Closes #87`, after #85's PR. The swap switch stays off in production until #85, #87 and
#88 are in (plan.md decision on rollout).

## Open questions (recommendation first)

1. **USD warning**: keep it (an ADR rule; it catches an agent's unit mistakes, costs one cached GET in parallel with
   the quote, and only warns), or drop it as "the signature is the real check"?
2. **Default warning level**: $10,000, configurable by `SODAX_SWAP_USD_WARN`.
3. ~~**Discord for outages**~~ Deferred (user, 2026-10-26): #87 alerts only `INTERNAL` and `SWAP_MISMATCH`;
   transient codes are counted in PostHog. Revisit after launch.
4. ~~**Per-builder analytics**~~ Deferred (user, 2026-10-26): no hashed API key in PostHog for now; the IP hash
   counts clients.
