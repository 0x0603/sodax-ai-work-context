---
type: plan
repo: builders-sodax-mcp-server
github: 87
related_issues: [79, 81, 84, 85, 86, 88]
tags: [mcp, safety, secrets, analytics, posthog, discord, usd]
updated: 2026-10-26
---

# #87 — Safety rules and analytics for the swap profile

Status: plan, reviewed (§Review); not started. Written against `feat/84-swap-quote` @ `6339278` plus #85's work in
progress on `feat/85-swap-track`. Branch `feat/87-safety-analytics` stacked on `feat/85-swap-track` (it extends #85's
`alerts.ts`); the PR targets `development` and is rebased after #85 merges, so #85's diff doesn't show in it.

## Context

Issue: input screening (private keys, mnemonics, API keys), slippage and deadline bounds, an oracle USD warning per
quote, the canary / production env switch, no secrets in logs, PostHog events (quoteId, chains, no full addresses),
a Discord alert on swap-path errors. Done when each rule has a test and analytics and alerts stay off when their env
vars are unset. The rules themselves are ADR §Safety rules (PR #90).

Most rules already hold; #87 adds the missing pieces and a test per rule.

| ADR rule | Where it lives | State |
|---|---|---|
| Never sign or broadcast | no signing code; tools return unsigned txs | done (#84); test in §Tests |
| Reject secrets, explain why; exempt tx hashes and values valid on the chain | design 1 | **new** |
| track / cancel trust only the quote cache and chain data | #85 design 1, 2 | #85's tests (named in the PR) |
| Slippage 1–500 bps, deadline 5–60 min, rejected not clamped | zod in `tools/swap.ts` | done (#84), `swapQuote.test.ts` "rejects %o instead of clamping it" |
| USD warning above a configurable value, never blocks | design 2 | **new** |
| `SODAX_ENV` once, at boot | `constants.ts:14-28` (#81) | done, tested (`constants.test.ts:4-17`) |
| No secrets in logs | design 5 | **new**: the template still logs raw errors |
| Analytics carry quoteId, chains, a USD bucket, never addresses | design 3 | **new** |
| No caller-supplied RPC URL | no such input (#85, #86) | test in §Tests |
| Partner fee from the connection, never a tool input | `partnerFee.ts` (#84) | test in §Tests |
| Discord alert on swap-path errors (issue) | design 4 | **new** |

Code facts (`6339278` + #85 work in progress; verified by the review):
- `registerActionTool` (`tools/actionTool.ts:26-47`) returns failures as `{status:"error", error:{code, message},
  nextStep}` with `isError`, never throws; it logs the raw error of any non-`ActionError` throw (`:30`).
- The MCP SDK runs the zod input check before the handler (`@modelcontextprotocol/sdk` `mcp.js:125-141`): a
  rejected input never reaches the template, analytics or logs. Field caps: chain 64, amount 96, token and
  address 128 (`tools/swap.ts`); `txHash` / `cancelTxHash` are `^0x[0-9a-fA-F]{64}$` and `quoteId` a UUID (#85).
- `withAnalytics` (`services/analytics.ts:93-117`) wraps `server.tool`: `tool_called` with name, group, duration,
  `success`, and `error_message` only for a thrown error. Builder tools return `isError` too
  (`solverRelay.ts:110-113`, `sodaxApi.ts`), so today every returned error counts as a success. Off when
  `POSTHOG_API_KEY` is unset, which is read at module load (`:17`). No `analytics.test.ts` exists.
- `postToDiscord` (`services/discord.ts:62-64`) is off without `DISCORD_WEBHOOK_URL`. #85's `swap/alerts.ts` has
  `alertOperator(kind, {chainKey, txHash, …})`, kinds `unknown_quote`, `quote_used`, `refund_relay_failed`, a
  24 h dedupe keyed on `kind:chainKey:txHash`.
- The Swaps API quote returns only `quotedAmount`. The solver oracle (`getSolverOracle`, `services/solver.ts`,
  cached 2 min, `fetchJson`'s 30 s default timeout) returns `{address (lowercase), chainId: "146" (a string),
  priceUsd, decimals (the hub asset's), updatedAt (ms)}`. Live 2026-10-26: 63 of the 66 hub assets in the
  swap-tokens fixture priced, one older than 60 min.
- A live config whose swap contract disagrees with the SDK's throws `UPSTREAM_UNAVAILABLE` (`quote.ts:158-167`),
  a transient code, though it is the same "broken or compromised upstream" class as `SWAP_MISMATCH`.
- SODAX keys match `^sodax_[A-Za-z0-9_-]+$` (`requestContext.ts`). Phase 1 has no `bound` input (Bitcoin sources
  are out), so the ADR's Bound-token exemption has nothing to exempt; it returns with Bitcoin sources.

## Scope

In: secret screening; the quote's USD value and warning; outcomes and error codes in analytics; Discord alerts for
unexpected and integrity errors; URL-free error logs; a test per ADR rule; README safety section and env rows.

Out: per-key analytics and Discord alerts for outages (deferred, open questions 3–4) · Bound-token handling
(Bitcoin sources) · funded E2E (#88) · `server.json`, walkthrough, dropping the switch (#89).

## Design

1. **Secret screening** (`swap/secrets.ts`, `findSecret(value) → kind | undefined`).
   - In the template, before `run`: every string argument. A hit → `SECRET_REJECTED` with `details: {field}`; the
     value is never echoed. Shapes that are never a legitimate input, so no chain context is needed: a SODAX key
     (`sodax_` plus at least 20 key characters, anywhere in the value, so `sodax_swap_quote` doesn't match); 12,
     15, 18, 21 or 24 lowercase words of 3–8 letters (BIP39 English); `xprv`/`yprv`/`zprv`/`tprv` keys; a Bitcoin
     WIF; a Solana secret key (base58, 86–88 chars); `suiprivkey1…`; a Stellar secret seed (`S` + 55 base32). No
     PEM rule: every PEM key is over the 128-char cap, so zod rejects it first.
   - Message: "That looks like a private key, seed phrase or API key; it wasn't used or stored." `nextStep`: "Tell
     the user to treat it as exposed and move their funds or rotate it, and never to paste it into a chat; ask for
     the wallet's public address instead." For a SODAX key: "send it as the x-api-key header, never as a tool input".
   - A bare 64-hex value (`0x` optional) is judged where the chain is known, in two places: `checkAddress` (quote,
     balance) when it isn't a valid address on that chain, and `resolveToken` (resolve tool and quote) just before
     the fuzzy match, when it isn't a token there. `resolveToken` matters most: its `not_found` / `ambiguous`
     results echo the query. A Sui or NEAR value that validates passes. Own wording, since it's as often a tx hash
     in the wrong field: "That's a 64-hex value, not an address or token on {chain}: if it was a private key, tell
     the user to treat it as exposed; if it was a transaction hash, pass it to sodax_swap_track."
   - Accepted: a phrase longer than a field's cap (most 24-word ones) is rejected by zod first, without the
     explanation; it's still never used. A key pasted as `txHash` reaches the status read and the RPC: it's shaped
     exactly like a tx hash, and the ADR exempts tx-hash fields.
2. **USD value and warning** (`swap/usd.ts`, quote only).
   - `usdValue(hubAsset, humanAmount)` = `Number(humanAmount) × priceUsd` of the oracle entry with `chainId ===
     "146"` and the lowercased address. No decimals involved (the oracle's are the hub asset's). A price with
     `Date.now() - updatedAt > 3_600_000`, a missing price, a failed oracle call, or no answer within 3 s → `null`.
     Read next to `getQuote` in stage 1; never blocks or fails the quote.
   - Both quote shapes gain `usdValue: string | null` (2 decimals). Above the warning level the `nextStep` adds:
     "This swap is worth about ${value}, above this server's warning level of ${limit}: confirm the amount with the
     user before anything is signed." Never blocks: the user's signature is the real check (ADR).
   - The level: `parseSwapUsdWarn(value)` in `constants.ts` on the `SODAX_ENV` pattern (exported value plus a
     `*_ERROR`, `main()` throws on the error); positive number, default 10000. Rows in `.env.example` and README.
3. **Analytics** (`analytics.ts`).
   - `success = !result.isError` for every tool, builder tools included (intended: their returned errors were
     counted as successes; the PR says the dashboards will shift). `error_code` from
     `structuredContent.error.code` when present; `error_message` stays for thrown errors only.
   - Swap tools add properties from one whitelist function, `pickSwapProps(structuredContent)`: `status`, `quote_id`
     (`quoteId`), `src_chain` (quote `from.chain.key`; track / cancel / resolve `chain.key`), `dst_chain` (quote
     `to.chain.key`), `usd_bucket` (`<100`, `100-1k`, `1k-10k`, `10k-100k`, `100k+`, `unknown`). Missing fields are
     omitted; never addresses, amounts, tx hashes or the echoed query. Zod rejections never reach the wrapper and
     aren't counted.
4. **Discord alerts on swap-path errors** (extends #85's `swap/alerts.ts`).
   - `alertOperator`'s fields become one flat optional record (`chainKey?`, `txHash?`, `quoteId?`, `deadline?`,
     `tool?`, `code?`), deduped on the kind plus the values present, one 24 h window (the log still records every
     occurrence). Module docstring widened beyond deposits. New kind `swap_error`.
   - Fired from the template's catch for `INTERNAL` (an unexpected throw) and `SWAP_MISMATCH` (the backend built
     something other than what was asked). The contract-disagreement throw in `quote.ts:158-167` becomes
     `SWAP_MISMATCH`, whose "don't retry" next step fits. Fields: tool, code, `SODAX_ENV`; never error text.
   - Not for user-correctable codes nor transient ones (`RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`,
     `CHAIN_UNAVAILABLE`): outages show in PostHog `error_code` counts (deferred, open question 3).
5. **No secrets in logs.** The template's catch logs `{tool, errName}` and the stack with every URL replaced
   (`/https?:\/\/\S+/g` → `<url>`), never the raw error: SDK and viem messages carry the RPC URL, and an
   `SODAX_RPC_URL_*` override can embed a paid key. #85's own reads already drop RPC text.
6. **Docs**: README "Safety" section listing the rules in plain words; `SWAP_INSTRUCTIONS` gains "Never pass private
   keys, seed phrases or API keys as tool inputs."

## Changes (commits)

1. `feat: reject secrets pasted into swap tool inputs` — `swap/secrets.ts`, template screening, `checkAddress`,
   `resolveToken`, `SECRET_REJECTED` in `errors.ts`, `SWAP_INSTRUCTIONS`.
2. `feat: show a swap's USD value and warn above a limit` — `swap/usd.ts`, `quote.ts`, `quoteNextStep`,
   `parseSwapUsdWarn` in `constants.ts` and `main()`, `.env.example` and README rows.
3. `feat: record tool outcomes in analytics` — `analytics.ts`, `pickSwapProps`.
4. `feat: alert on unexpected swap tool errors, without URLs in logs` — `actionTool.ts`, `swap/alerts.ts`, the
   `quote.ts` contract-disagreement code.
5. `test: one test per safety rule` — the matrix below, README "Safety" section.

## Tests

- Secrets: a `findSecret` table test per shape; one template test per tool with a shape that fits the field
  (`fetch` never called, value in no output and no `logger` call); a 64-hex value as an EVM address or token → the
  64-hex wording; a NEAR token by its 64-hex address resolves; a Sui address passes; `sodax_swap_quote` as text,
  "USD Coin" and a normal address pass. Test secrets are built at runtime (`"ab".repeat(32)`) or published test
  vectors (the BIP39 `abandon … about` phrase), never real-looking keys.
- USD: priced → `usdValue`; above the level → the warning sentence and the quote still ready; stale, missing,
  failing or slow (> 3 s) oracle → `null`, no warning; `parseSwapUsdWarn` table test (as `constants.test.ts`).
- Analytics (`analytics.test.ts`, new): `vi.mock("posthog-node")`, `vi.stubEnv` and `vi.resetModules` before a
  dynamic import; an `isError` result → `success:false` with `error_code`; `pickSwapProps` per tool shape, and the
  serialized capture holds no address, amount or tx hash; nothing captured without `POSTHOG_API_KEY`.
- Alerts: `INTERNAL`, `SWAP_MISMATCH` and the contract disagreement post once per 24 h per `(tool, code)`; user and
  transient codes don't post; nothing posted without `DISCORD_WEBHOOK_URL`; no error text in the payload.
- Logs: an `INTERNAL` throw whose message holds `https://rpc.example/KEY` never reaches the logger with `KEY`.
- Rules already in place: no swap tool input key matches `/rpc|url|fee|partner/i`; no `sendRawTransaction` or
  signer import under `src/`; bounds and `SODAX_ENV` (exist).
- `pnpm checkTs && pnpm lint && pnpm test && pnpm build`.

## Ship

Draft PR into `development`, `Closes #87`, after #85's PR; stacked on `feat/85-swap-track` until then. The PR names
#85's tests for the "trust only the cache and chain" rule, and says builder-tool success rates in PostHog will
drop (returned errors now count as failures). The swap switch stays off in production until #85, #87 and #88 are in.

## Open questions (recommendation first)

1. **USD warning**: keep it (an ADR rule; it catches an agent passing base units as human units, which shows as a
   seven-figure warning; one cached GET in parallel with the quote; warns only), or drop it as "the signature is
   the real check"? Reviewer agrees: keep.
2. **Default warning level**: $10,000, configurable by `SODAX_SWAP_USD_WARN` (matches the `10k-100k` bucket edge).
3. ~~**Discord for outages**~~ Deferred (user, 2026-10-26): #87 alerts only `INTERNAL` and `SWAP_MISMATCH`;
   transient codes are counted in PostHog. Revisit after launch.
4. ~~**Per-builder analytics**~~ Deferred (user, 2026-10-26): no hashed API key in PostHog for now; the IP hash
   counts clients.

## Review (2026-10-26, an independent agent; facts spot-checked)

No blockers. Applied: `alertOperator` needed a flat field record for `(tool, code)` alerts (design 4); the contract
disagreement in the quote now alerts as `SWAP_MISMATCH`; the USD maths uses the human amount (the oracle's decimals
are the hub asset's), a 60 min staleness check in ms and a 3 s cap on the oracle (30 s default otherwise); the
warning level is parsed on the `SODAX_ENV` pattern because `main()` can't hand values to the tools; a new design 5
for raw error logs, which can carry an RPC URL with a key; the 64-hex case gets its own wording (often a tx hash in
the wrong field) and lives in `resolveToken` and `checkAddress` only; the PEM rule and a wrong length claim dropped;
analytics now cover builder tools' returned errors and name each tool's fields; test-plan holes (zod rejects long
shapes first, PostHog is read at module load, no snapshot for the schema test, runtime-built test secrets); stale
facts (`SODAX_ENV` already tested, line refs, branch base). Not applied: nothing.
