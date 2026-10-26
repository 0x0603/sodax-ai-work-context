---
type: process
repo: builders-sodax-mcp-server
github: 79
updated: 2026-10-26
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
