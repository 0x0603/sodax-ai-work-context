---
type: plan
repo: builders-sodax-mcp-server
github: 86
related_issues: [79, 84, 85, 87, 89]
tags: [mcp, balance, allowance, sodax-sdk, quote]
updated: 2026-10-26
---

# #86 — `sodax_get_balance`

Status: plan, reviewed; not started. Reads balances and allowances through `@sodax/sdk` (user's call, 2026-10-26:
"depend on the SDK; fix bugs in the SDK"). Depends on #84's SDK commit (6), not on #85. Branch
`feat/86-get-balance` off the #84 branch once commit 6 is in.

## Context

Agents must check funds and allowance before asking a user to sign. Today the ready quote returns
`checks.balance: "not_checked"` and says "Balances aren't checked here." The issue asks for a caller `rpcUrl`; the
ADR overrides it (decision 8 / D5: env overrides only). Phase 1 sources = EVM spokes + Sonic.

**Decision (2026-10-26):** the MCP server reads balances through the SDK, which calls chain RPCs itself. This amends
ADR D6 / decision 11 ("balances come from a backend route") for phase 1 — no such route exists, live or in backend
code (`origin/development` @ `612f67d9`; only vault `share-balance` and `POST /swaps/allowance/check`). The ADR text
on PR #90 needs the matching edit. SDK shortcomings are fixed in `sodax-sdks`, not worked around here; note an SDK
fix reaches this server only after its release clears the 14-day package cooldown.

SDK facts (`@sdks@2.2.0`, verified):
- `sodax.spoke.getWalletBalance({srcChainKey, srcAddress, token})` → `Result<bigint>`, chain-agnostic (EVM, Sonic,
  Solana, Sui, Stellar, NEAR, ICON, Injective, Bitcoin, Stacks; `SpokeService.ts:896-930`). A failed read is
  `{ok:false}`, not `0n`. Do **not** use `getWalletBalances`: its collector reports a failed read as `0n`
  (`shared/services/spoke/balance-utils.ts:14-48`).
- Hedera native balances are scaled back to 8 decimals (`EvmSpokeService.ts:40-55`, `scaleNativeBalance`).
- Allowance: `Erc20Service.getAllowance({token, owner, spender, publicClient})` (`Erc20Service.ts:110`, exported);
  the client is `sodax.spoke.evm.getPublicClient(chainKey)` (EVM spokes) or `sodax.spoke.sonic.publicClient` (hub).
- RPC URLs: `new Sodax({ chains: { [chainKey]: { rpcUrl } } })` (`SodaxOptions = DeepPartial<SodaxDefaultConfig>`,
  `chains: Record<SpokeChainKey, SpokeChainConfig>` with `rpcUrl`). Defaults are the packaged URLs.
- The transport is `http(rpcUrl)` with viem defaults: 10 s timeout, 3 retries (`EvmSpokeService.ts:80`); not
  configurable through the SDK.
- viem request errors carry `URL: …` and `Request body: …` (the address) in their message
  (`viem/_esm/errors/request.js`).

Live facts (2026-10-26): direct reads on the default Arbitrum RPC take ~0.35 s; `/allowance/check` takes 1.1–7.9 s;
the default Polygon RPC is dead (401) and Ethereum's is intermittently rate-limited (429 at times, `0x1` at others).

## Design

1. **`swap/balance.ts`** — one narrow module over the SDK, so the tool and the quote never touch the SDK directly:
   - `readFunds({chainKey, address, token, spender?})` → `{native, token?, allowance?}` in base units: native and
     token via `sodax.spoke.getWalletBalance` (per token, in parallel); allowance via `Erc20Service.getAllowance`
     toward `spender`. Any `{ok:false}` or throw fails the whole call — never reported as 0.
   - `swapSpender(chainKey, config)`: spokes → the catalog `swapContract` (the contract #84 checks as `tx.to` and
     approve spender); hub → the SDK's `solverConfig.intentsContract` (#84 commit 6 pins it).
   - **Error wrapping (security, not a workaround):** catch everything from the SDK / viem and map to our codes
     (`CHAIN_UNAVAILABLE`, `UPSTREAM_UNAVAILABLE`). Never pass the error or its message on, never log `err` — viem
     messages carry the RPC URL (paid URLs embed keys) and the address. Log `{chainKey, op, kind}` only.
2. **RPC config**: `SODAX_RPC_URL_<chainId>` (https only, validated in `main()`, fatal naming the variable, never the
   value) is passed into `initSodax()` as `chains.<key>.rpcUrl`. One config for #85's receipts too.
3. **Tool `sodax_get_balance`** (swap profile, `registerActionTool`, `{readOnlyHint:true, destructiveHint:false,
   idempotentHint:true, openWorldHint:true}`): inputs `chain` (`chainArg`), `address` (validated per family like
   `checkAddress`; zero / burn refused; never echoed), `token?` (`tokenArg`, symbol / address / `native`). Resolve with
   `resolveToken(catalog, chain, token ?? "native")`; all validation before any RPC call. Output `{status:"ok", chain,
   address, native:{symbol, amount, baseUnits}, token?, allowance?:{spender, amount, baseUnits, unlimited} | null,
   nextStep}`; `allowance` only for a non-native EVM / Sonic token, `null` when the token can't be sent
   (`!canUseAs(token,"from")`) or the spender is unknown. Families: everything the SDK reads; allowance on EVM and
   Sonic only.
4. **Quote wiring** (ready path only; price-only makes no RPC calls): stage 1 = `quote ‖ deadline ‖ readFunds`, the
   read bounded by a 4 s race (viem's own 10 s × 3 retries can't be shortened through the SDK); a failed or slow
   read → `checks.balance: "unavailable"`, never blocks. Token balance < gross amount → `INSUFFICIENT_FUNDS` before
   `/intents` and `/approve`. `checks.nativeAfterSwap` warns at zero; no gas estimate.
5. **Allowance from the read, not `/allowance/check`**: stage 2 = `buildIntent` alone; allowance ≥ amount (or a native
   token) → no approve, else `/approve` (still decides `resetTx`); if the read failed, fall back to `checkAllowance`.
   One fewer keyed backend call per ready quote.
6. **Errors**: new `INSUFFICIENT_FUNDS` (`details {symbol, balance, required}`, human amounts); reuse
   `CHAIN_UNAVAILABLE` (added here if #85 hasn't), `UNSUPPORTED_CHAIN`, `UNKNOWN_TOKEN`, `INVALID_ADDRESS`,
   `UPSTREAM_UNAVAILABLE`. No balance cache (must be fresh after an approve or a top-up).
7. **Wording**: balance `nextStep` from catalog names and formatted numbers (holdings, allowance or "any amount",
   withdraw-only note, no-gas warning); the ready quote drops "Balances aren't checked here." and says what to check
   when `unavailable`; `SWAP_INSTRUCTIONS` gains: "`sodax_get_balance` reads a wallet's balance and swap allowance;
   you don't need it before quoting — `sodax_swap_quote` checks both itself."

**#85 follows the same rule**: read receipts through the SDK's public client (`getPublicClient(chainKey)
.getTransactionReceipt`, non-blocking) instead of its own JSON-RPC reader, with the same error wrapping and RPC
config. The `Message` log decode stays in this repo until the SDK ships a `Message` event ABI (an SDK follow-up).
See `plan-85-swap-track.md` §SDK reads.

## Commits

1. `feat: read balances and allowances through the SDK` — `swap/balance.ts`, RPC env → `initSodax()` config,
   `INSUFFICIENT_FUNDS`, Hedera in the fixtures (HBAR, 8 decimals).
2. `feat: add sodax_get_balance` — tool, `balanceNextStep`, `SWAP_INSTRUCTIONS`, landing page, README env and tool rows.
3. `feat: check the balance and allowance before building a swap` — `quote.ts` (4, 5), `quoteNextStep`.
4. `test: live contract tests for balances`.

## Tests

- Unit (`readFunds` behind a stubbed SDK module, so tests don't hit RPCs): per-token reads in parallel; `{ok:false}` /
  throw → error, never 0; Hedera scaling comes from the SDK (assert the value is passed through); error wrapping —
  the RPC URL and the address appear in no output and no `logger` call (spy, serialized args); spender rules; the
  tool's validation before any read; every `nextStep` variant; quote: `INSUFFICIENT_FUNDS` with no `/intents`,
  `/approve`, `/allowance/check`; allowance ≥ amount → no approve; read failed or > 4 s → `unavailable` + fallback;
  price-only → no reads. Mutation-check each new check, as in #84.
- Contract (`pnpm test:contract`, both hosts, nothing signed): Arbitrum `0x…dEaD` ETH and USDC > 0, allowance to the
  live asset manager `0`; Hedera native has ≤ 8 decimals; a Solana / Sui address reads through the SDK; quote of
  dEaD's USDC balance + 1 → `INSUFFICIENT_FUNDS` with no `/intents` call.
- `pnpm checkTs && pnpm lint && pnpm test && pnpm build`; HTTP smoke with `SODAX_SWAP_TOOLS_ENABLED=true`.

## SDK follow-ups (raise in `sodax-sdks` when they bite; fixes land here after the cooldown)

1. Per-chain transport options (timeout, retry count): today viem's 10 s × 3 retries apply, so a dead RPC holds a
   read for up to ~40 s; this server can only race it.
2. A `Message` event ABI on `connectionAbi` and a "find the deposit message in a receipt" helper (for #85).
3. Optional: an allowance read on `SpokeService` (today it needs `Erc20Service` + the chain's public client).

## Open questions (recommendation first)

1. ~~**Dead default RPCs**~~ Resolved (user, 2026-10-26): env `SODAX_RPC_URL_<chainId>` first, else the SDK default;
   no client-supplied RPC (security, ADR D5). Polygon's default is dead and Ethereum's flaky, so staging and
   production set `SODAX_RPC_URL_137` / `_1` before the switch turns on.
2. ~~**ADR**~~ Done: D6 on PR #90 says phase-1 balances are read through the SDK (`21d9017`, 2026-10-26).
3. **Gas**: warn at zero native only, no estimate. **Shape**: `INSUFFICIENT_FUNDS` as an error, one token per call.

## Review (2026-10-26)

Verified in `@sdks@2.2.0`: `SpokeService.getWalletBalance` returns `Result<bigint>` for every family;
`getWalletBalances` maps failures to `0n`; Hedera scaling; `Erc20Service.getAllowance` exported; per-chain `rpcUrl`
in `SodaxOptions`; `http(rpcUrl)` with viem defaults; viem error messages include the URL and request body. Backend:
no balance route (`git grep` on `origin/development`). Live: Polygon default RPC 401, Ethereum's intermittent.
