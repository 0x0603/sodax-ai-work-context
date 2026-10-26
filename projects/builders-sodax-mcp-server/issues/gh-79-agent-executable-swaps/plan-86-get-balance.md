---
type: plan
repo: builders-sodax-mcp-server
github: 86
related_issues: [79, 84, 85, 87, 89]
tags: [mcp, balance, sodax-sdk]
updated: 2026-10-26
---

# #86 — `sodax_get_balance`

Status: plan, reviewed, then cut down on 2026-10-26 (§Scope cut); not started. Reads balances through `@sodax/sdk`
(user's call, 2026-10-26: "depend on the SDK; fix bugs in the SDK"). Depends on #84's SDK commit (6), not on #85.
Branch `feat/86-get-balance` off the #84 branch once commit 6 is in.

## Scope cut (user, 2026-10-26)

One job per tool. `sodax_get_balance` reads balances and nothing else; `sodax_swap_quote` builds the swap and reads no
chain. Dropped from the reviewed plan:

- The quote's own balance read (old designs 4 and 5: the 4 s race, `checks.balance: "unavailable" | "insufficient"`,
  allowance from the read instead of `/allowance/check`) and its commit. The quote keeps #84's behavior:
  `checks.balance: "not_checked"`, approval decided by the backend (`/allowance/check`, then `/approve`). Cost: one
  backend call per ready quote that a read would have saved, and no warning when the wallet is short; the wallet's
  own estimate fails before a short swap is sent, at worst after one approve.
- Allowance in `sodax_get_balance` (`Erc20Service.getAllowance`, the `swapSpender` rules, `allowance: null` cases):
  the quote already returns the approve step when one is needed, so no swap step needs it, and a separate allowance
  tool would only add a choice for the agent.
- `INSUFFICIENT_FUNDS`: nothing returns it now.

## Context

Agents may want to check funds before asking a user to sign. Today the ready quote returns
`checks.balance: "not_checked"` and says "Balances aren't checked here." The issue asks for a caller `rpcUrl`; the
ADR overrides it (decision 8 / D5: env overrides only). Phase 1 sources = EVM spokes + Sonic.

**Decision (2026-10-26):** the MCP server reads balances through the SDK, which calls chain RPCs itself. This amends
ADR D6 / decision 11 ("balances come from a backend route") for phase 1 — no such route exists, live or in backend
code (`origin/development` @ `612f67d9`; only vault `share-balance` and `POST /swaps/allowance/check`). SDK
shortcomings are fixed in `sodax-sdks`, not worked around here; note an SDK fix reaches this server only after its
release clears the 14-day package cooldown.

SDK facts (`@sdks@2.2.0`, verified):
- `sodax.spoke.getWalletBalance({srcChainKey, srcAddress, token})` → `Result<bigint>`, chain-agnostic (EVM, Sonic,
  Solana, Sui, Stellar, NEAR, ICON, Injective, Bitcoin, Stacks; `SpokeService.ts:896-930`). A failed read is
  `{ok:false}`, not `0n`. Do **not** use `getWalletBalances`: its collector reports a failed read as `0n`
  (`shared/services/spoke/balance-utils.ts:14-48`).
- Hedera native balances are scaled back to 8 decimals (`EvmSpokeService.ts:40-55`, `scaleNativeBalance`).
- RPC URLs: `new Sodax({ chains: { [chainKey]: { rpcUrl } } })` (`SodaxOptions = DeepPartial<SodaxDefaultConfig>`,
  `chains: Record<SpokeChainKey, SpokeChainConfig>` with `rpcUrl`). Defaults are the packaged URLs.
- The transport is `http(rpcUrl)` with viem defaults: 10 s timeout, 3 retries (`EvmSpokeService.ts:80`); not
  configurable through the SDK.
- viem request errors carry `URL: …` and `Request body: …` (the address) in their message
  (`viem/_esm/errors/request.js`).

Live facts (2026-10-26): direct reads on the default Arbitrum RPC take ~0.35 s; the default Polygon RPC is dead (401)
and Ethereum's is intermittently rate-limited (429 at times, `0x1` at others).

## Design

1. **`swap/balance.ts`** — one narrow module over the SDK, so the tool never touches the SDK directly:
   - `readBalances({chainKey, address, token})` → `{native, token?}` in base units via `sodax.spoke.getWalletBalance`
     (both in parallel). Any `{ok:false}` or throw fails the whole call — never reported as 0.
   - **Error wrapping (security, not a workaround):** catch everything from the SDK / viem and map to our codes
     (`CHAIN_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`). Never pass the error or its message on, never log `err` — viem
     messages carry the RPC URL (paid URLs embed keys) and the address. Log `{chainKey, op, kind}` only.
2. **RPC config**: `SODAX_RPC_URL_<chainId>` (https only, validated in `main()`, fatal naming the variable, never the
   value) is passed into `initSodax()` as `chains.<key>.rpcUrl`; without it the SDK's packaged default. One config
   for #85's receipts too.
3. **Tool `sodax_get_balance`** (swap profile, `registerActionTool`, `{readOnlyHint:true, destructiveHint:false,
   idempotentHint:true, openWorldHint:true}`): inputs `chain` (`chainArg`), `address` (validated per family like
   `checkAddress`; zero / burn refused; never echoed), `token?` (`tokenArg`, symbol / address / `native`). Resolve with
   `resolveToken(catalog, chain, token ?? "native")`; all validation before any RPC call. Output `{status:"ok", chain,
   address, native:{symbol, amount, baseUnits}, token?, nextStep}`. Families: everything the SDK reads. One token
   per call; no gas estimate, the `nextStep` warns when native is zero.
4. **Errors**: reuse `CHAIN_UNAVAILABLE` (added here if #85 hasn't), `UNSUPPORTED_CHAIN`, `UNKNOWN_TOKEN`,
   `INVALID_ADDRESS`, `UPSTREAM_UNAVAILABLE`. No balance cache (must be fresh after a top-up).
5. **Wording**: balance `nextStep` from catalog names and formatted numbers (holdings, withdraw-only note, no-gas
   warning). The ready quote's "Balances aren't checked here." gains "call sodax_get_balance to check";
   `SWAP_INSTRUCTIONS` gains: "`sodax_get_balance` reads a wallet's balance; the quote doesn't check it."

**#85 follows the same rule**: read receipts through the SDK's public client (`getPublicClient(chainKey)
.getTransactionReceipt`, non-blocking) instead of its own JSON-RPC reader, with the same error wrapping and RPC
config. The `Message` log decode stays in this repo until the SDK ships a `Message` event ABI (an SDK follow-up).
See `plan-85-swap-track.md` §SDK reads.

## Commits

1. `feat: read balances through the SDK` — `swap/balance.ts`, RPC env → `initSodax()` config, Hedera in the
   fixtures (HBAR, 8 decimals).
2. `feat: add sodax_get_balance` — tool, `balanceNextStep`, `SWAP_INSTRUCTIONS`, the quote's balance line, landing
   page, README env and tool rows.
3. `test: live contract tests for balances`.

## Tests

- Unit (`readBalances` behind a stubbed SDK module, so tests don't hit RPCs): reads in parallel; `{ok:false}` / throw →
  error, never 0; Hedera scaling comes from the SDK (assert the value is passed through); error wrapping — the RPC
  URL and the address appear in no output and no `logger` call (spy, serialized args); the tool's validation before
  any read; every `nextStep` variant. Mutation-check each new check, as in #84.
- Contract (`pnpm test:contract`, both hosts, nothing signed): Arbitrum `0x…dEaD` ETH and USDC > 0; Hedera native has
  ≤ 8 decimals; a Solana / Sui address reads through the SDK.
- `pnpm checkTs && pnpm lint && pnpm test && pnpm build`; HTTP smoke with `SODAX_SWAP_TOOLS_ENABLED=true`.

## SDK follow-ups (raise in `sodax-sdks` when they bite; fixes land here after the cooldown)

1. Per-chain transport options (timeout, retry count): today viem's 10 s × 3 retries apply, so a dead RPC holds a
   read for up to ~40 s; this server can only race it.
2. A `Message` event ABI on `connectionAbi` and a "find the deposit message in a receipt" helper (for #85).

## Open questions

1. ~~**Dead default RPCs**~~ Resolved (user, 2026-10-26): env `SODAX_RPC_URL_<chainId>` first, else the SDK default;
   no client-supplied RPC (security, ADR D5). Polygon's default is dead and Ethereum's flaky, so staging and
   production set `SODAX_RPC_URL_137` / `_1` before the switch turns on.
2. ~~**ADR**~~ Done: D6 on PR #90 says phase-1 balances are read through the SDK (`21d9017`, 2026-10-26). Its line
   about "the quote's balance check" is now wrong (§Scope cut); edit it with D5 on the user's go-ahead.
3. ~~**Gas** / **Shape**~~ Resolved 2026-10-26 (user): no gas estimate, a short-of-gas tx fails when the agent
   broadcasts it; the quote doesn't check balances at all (§Scope cut); one token per call.

## Review (2026-10-26)

Verified in `@sdks@2.2.0`: `SpokeService.getWalletBalance` returns `Result<bigint>` for every family;
`getWalletBalances` maps failures to `0n`; Hedera scaling; `Erc20Service.getAllowance` exported (no longer used);
per-chain `rpcUrl` in `SodaxOptions`; `http(rpcUrl)` with viem defaults; viem error messages include the URL and
request body. Backend: no balance route (`git grep` on `origin/development`). Live: Polygon default RPC 401,
Ethereum's intermittent.
