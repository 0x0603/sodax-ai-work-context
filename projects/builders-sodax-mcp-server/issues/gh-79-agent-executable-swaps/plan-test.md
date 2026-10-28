---
type: plan
github: 79
repo: builders-sodax-mcp-server
status: Active
created: 2026-10-28
updated: 2026-10-28
related_issues: [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 99]
tags: [mcp, swap, testing, canary, e2e]
---

# GH-79 test plan, per sub-issue

Hands-on testing of the stack before asking for review and before production serves the swap tools. Unit tests
already exist on every PR; this plan covers what they can't: the built server over real transports, the live APIs,
and real funds on canary. Branch tips as of 2026-10-28 are in `brief.md` §Next action (unchanged since the restack).

## Levels

| Level | What | Funds | Where |
|---|---|---|---|
| A | Gates: `pnpm checkTs && pnpm lint && pnpm test && pnpm build` | none | each PR tip |
| B | Smoke: the built server over HTTP and stdio, driven by MCP Inspector or curl | none | each PR tip, that PR's delta only |
| C | Contract: `pnpm test:contract` (canary), then `SODAX_ENV=production pnpm test:contract`; `0x…dEaD`, nothing signed | none | #94, #96 tips; #95 once its contract tests exist |
| D | Live: real swaps on canary (mainnet chains, real funds) | ~20 USDC + gas on Arbitrum and Base | once, at the top of the stack |
| E | Agent role-play: Claude Code connected to the local server, the user's wallet signs | same as D | once, at the top of the stack |

Rules: the stack is cumulative, so B at tip N tests only what N adds. Tips #92–#98 still have the rollout switch:
start them with `SODAX_SWAP_TOOLS_ENABLED=true`. #102 has no switch. Before #100 merges, every tip below it still
crashes on `GET /sse`; test SSE only on `fix/sse-start-once` and after the rebase.

Server for B/D/E: `pnpm build && TRANSPORT=http PORT=3100 LOG_LEVEL=debug node dist/index.js` (add
`SODAX_ENV=canary` for D/E). Inspector: `npx @modelcontextprotocol/inspector`, Streamable HTTP,
`http://localhost:3100/mcp?profile=swap`, header `x-api-key`. A fake `sodax_smoke` key is enough for A–C; D/E need a
real canary key.

## Per sub-issue

### #80 ADR (PR #90): read-through, no code

- Each of D1–D6 matches the code at #102's tip. Known gaps to fix on the PR (user's go-ahead first): D5 RPC line
  ("env, else the SDK default"), D6 and §Quote still mention the quote's balance check (cut in #86), D5 sources
  (EVM spokes; Sonic refused since #85), the rollout switch and its removal in #89.

### #81 forward the API key (PR #91, `feat/81-forward-api-key`)

- B: `tools/list` keyless and keyed equals `development`'s list (diff the JSON).
- B: `SODAX_ENV=foo` exits 1 with a message; `SODAX_ENV=canary` serves canary data (a chain/token tool answers).
- B: a relay tool with a known packet answers through `api.sodax.com/v1/relay`.
- B: stdio with `SODAX_API_KEY=sodax_smoke` and with `SODAX_API_KEY=notakey` (dropped) both start; builder tools work.
- Key isolation (key only to `/v1/be/` and `/v1/intent/`, never the relay, no redirect when keyed) is covered by
  unit tests; spot-check `src/services/http.ts` once rather than intercepting traffic.

### #82 profiles (PR #92)

Use `plan-82-tool-profiles.md` §Verification as the checklist: query, header and stdio selection; `?profile=bogus`
→ 400 `-32602`; keyless `swap` → 403 "API key required"; switch off → no swap tools, card hidden; `yes` → exit 1;
`server.json` plain URL; `--foo` still starts.

### #83 resolver (PR #93)

`plan-83-resolve-token.md` §Verification 2: Arbitrum/WETH → not_found with ETH first; Arbitrum/tBTC → withdraw-only;
Sonic/ETH → ambiguous without USDT; hyper/USDC → 6 decimals; ICON/bnUSD → ambiguous; Fantom → `UNSUPPORTED_CHAIN`;
chain aliases (`arb`, `Arbitrum One`, `hype`). Repeat with `SODAX_ENV=canary`.

### #84 quote (PR #94)

- C: both hosts green.
- B, keyed, `fromAddress` = a funded-looking address (`0x…dEaD`):
  - price-only (no `fromAddress`): min output, fees, expiry, no txs;
  - Arbitrum USDC → Base USDC: approve + swap, `swap.tx.to` = asset manager, deadline ~15 min, `quoteId` present;
  - Arbitrum ETH → Base: no approve;
  - slippage 0 / 501 and deadline 4 / 61 → rejected, not clamped;
  - dust → `AMOUNT_TOO_LOW`; tBTC → `RESTRICTED_TOKEN`; Solana / Sui source → `UNSUPPORTED_SOURCE`;
  - NEAR / Stellar destination with a not-ready recipient → `DESTINATION_NOT_READY`;
  - partner fee by header and by query shows in the quote; bad address or 101 bps → 400 at connect;
  - names instead of addresses (`USDC`, `arbitrum`) quote directly (fewer-calls commit).
- Decode the swap tx data once by hand (`cast 4byte-decode` or viem `decodeFunctionData`): amount and token match.

### #85 track and cancel (PR #95)

- Gap first: write `src/tools/swapTrack.contract.test.ts` per `plan-85-swap-track.md` §Tests "Contract" (solved
  production hash; unknown hash → `not_submitted_unknown_quote`; real Arbitrum deposit under a fake quote →
  `deposit_mismatch`; every EVM chain has a `connection` and an https RPC). Then C.
- B: unknown hash without `quoteId` → `not_submitted_unknown_quote`, no POST in the log; a `quoteId` from key A
  tracked with key B → `QUOTE_KEY_MISMATCH`; Sonic source quote → refused; mixed-case hash accepted.
- D/E cover the rest (below).

### #86 balance (PR #96)

- C: both hosts green.
- B: Arbitrum `0x…dEaD` ETH and USDC; a Solana, Sui, NEAR, Stellar and Bitcoin address each read; an unfunded
  Stellar account → `accountExists: false`, not an outage; a malformed address → validation error before any read;
  `SODAX_RPC_URL_42161=https://rpc.invalid.example` → an error, never a 0 balance, and the URL appears in no output
  or log line.

### #87 safety and analytics (PR #97)

- B: a 64-hex key in `fromAddress`, `toAddress` and `token`, the `abandon … about` mnemonic, and a `sodax_…` key as
  an input → each rejected, value not echoed, not in the server log; a real tx hash in `txHash` passes.
- B: `SODAX_SWAP_USD_WARN=1` and a 5 USDC quote → warning sentence, quote still ready; unset → none.
- B: `DISCORD_WEBHOOK_URL` pointed at a private test webhook and `POSTHOG_API_KEY` at a test project: a normal error
  (dust) posts nothing to Discord; PostHog events carry `quoteId` and chains, no address, amount or tx hash.
  Unset both → no outbound calls.
- Decide the two open questions while here: keep the USD warning, default 10000.

### #88 canary E2E (PR #98)

- Local dry run: `E2E_DRY_RUN=1 MCP_URL='http://localhost:3100/mcp?profile=swap' SODAX_API_KEY=… E2E_WALLET_PRIVATE_KEY=…
  pnpm e2e:canary`.
- Local live run, once per direction (Arbitrum → Base, then Base → Arbitrum, `AMOUNT=5`): reaches `solved`, funds
  arrive; note the gas used for the balance floor.
- CI, after the admin creates `canary-e2e` and its secrets: dispatch `dry_run`; dispatch `amount: 1000` → red at
  `balance_floor`, one Discord message; first scheduled run green.
- Leak check on the green and the red run: `gh run view <id> --log | rg -i '<key fragment>|<pk fragment>|https://'`.

### #89 docs and registry (PR #102, sodax-sdks #577)

- B: no switch: keyless `all` = builder snapshot; keyed `all` = builder + 5 swap tools; stdio builder starts without
  loading the SDK.
- README test: give a fresh Claude Code session only the README's swap walkthrough and the local server; it should
  run resolve → balance → quote → (sign) → track without other help.
- Before the master release: production `SODAX_RPC_URL_*` values parse (fatal at boot otherwise), Coolify memory
  limit covers ~230 MB more RSS, staging boots, `SODAX_ENV=production pnpm test:contract` green.
- sodax-sdks #577: docs gates green; every claim on `docs/builders-mcp.mdx` matches the server at #102.

### #99 SSE hotfix (PR #100)

- On `development`: `curl -N localhost:3100/sse` → process exits. On `fix/sse-start-once`: the stream stays open, a
  `POST /messages?sessionId=…` `tools/list` answers. Repeat after the stack is rebased onto it.

## Live run (levels D and E), at the top of the stack

Prerequisites: a canary API key; a fresh wallet with ~20 USDC and gas on Arbitrum and Base (key never in a browser
wallet); a signer outside the server (`cast send` or a small viem script). Canary is mainnet: real money, and the
intent canceller was seen disabled there (2026-10-20), so a cancel may not refund.

Agent setup: `claude mcp add --transport http sodax-local 'http://localhost:3100/mcp?profile=swap' --header
'x-api-key: <canary key>'`.

| # | Scenario | Expect | Risk |
|---|---|---|---|
| 1 | Arbitrum USDC → Base USDC, 5 USDC, first time | approve + swap; track: awaiting → queued → in progress → solved; funds arrive on Base | low |
| 2 | Same again | approve again (approvals are for the exact amount), no reset for USDC | low |
| 3 | Arbitrum ETH → Base, native | no approve | low |
| 4 | Track the same hash 5 times, and 2 at once | one submit in the log | low |
| 5 | Restart the server after `queued`, track by `txHash` + `srcChainKey` | status still read | low |
| 6 | Restart before the first track | `not_submitted_unknown_quote` + alert; deposit stranded until a manual relay | high, skip or 1 USDC |
| 7 | Cancel: 1 USDC, slippage 1 bps, cancel right after the deposit | unsigned cancel tx; second call relays; `intentCancelled` | medium (may fill first, may not refund on canary) |
| 8 | Insufficient funds, dust, ambiguous token, pasted secret, wrong tx hash, Solana source | clear error and next step each | none |
| 9 | Partner fee by header and by query | fee in the quote and in the intent | low |
| 10 | Base → Arbitrum (the other spoke) | as 1 | low |
| 11 | After `solved`, compare the next step's wording with the destination balance | "received" only once delivered (known follow-up) | none |

## Order

1. B and C per tip, bottom up (#91 → #102), no funds. Fix findings on the PR they belong to, then restack.
2. Write #85's contract tests; C on #95.
3. Get the canary key and fund the wallet (blocker 4), then D at #98's tip (switch on) and E.
4. CI runs for #88 once the admin has done blocker 5.
5. Post each PR's results as one new comment with a results table (no internal hosts or backend state, public repo).
