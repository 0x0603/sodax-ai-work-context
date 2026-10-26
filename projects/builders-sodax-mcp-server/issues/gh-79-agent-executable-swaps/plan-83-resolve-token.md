---
type: plan
repo: builders-sodax-mcp-server
github: 83
related_issues: [79, 82, 84, 87]
tags: [mcp, swaps-api, resolver]
updated: 2026-10-26
---

# #83 — Token and chain resolver + `sodax_resolve_token`

Status: plan, reviewed, not started. Drafted by a planning agent on 2026-10-26, then reviewed against the code at
`feat/82-tool-profiles` @ `a816105` and the live API (see §Review). Base for the branch: `a816105`.

## Context

ADR D5, D6, §Quote; `plan.md` decisions 2, 11, 12 and row 83. The first swap tool. An agent says "USDC on Arbitrum"
and gets the address, decimals and hub asset, or a short list to ask the user from. It sits behind
`SODAX_SWAP_TOOLS_ENABLED` and the #82 key gate, so production sees nothing yet.

**Departs from the issue and `plan.md`** (verified reasons in §Review):
- **No `@sodax/types` in #83.** Native tokens come from the live chain config the server already fetches. The
  dependency, the `engines` bump, `sodax-deps.yaml` and the hub PR move to #84 with `@sodax/sdk`.
- **`units.ts` moves to #84**, where the quote is its first caller.
- Chains come from the keys of the Swaps API token list (same 22 keys as the chain config).
- No token alias table: token names from the live list act as aliases.

## Scope

In: `src/services/swap/{errors,tokens,resolver}.ts`, `src/tools/{actionTool,swap}.ts`, the swap registrar in
`src/server.ts`, `/v1/swaps/` in the keyed routes, tests.

Out (owner): `@sodax/sdk` / `@sodax/types`, `engines >=22.12.0`, `sodax-deps.yaml` + hub PR, `units.ts`,
`SwapsApiService`, `RATE_LIMITED` / "API key required" mapping, swap-profile server instructions (#84) · balances
(#86) · secret screening, analytics outcome codes (#87) · `server.json` tool entries, README walkthrough (#89).

## Design

1. **Data: two live lists, cached 2 min, fetched together.**
   - Tokens: `GET {origin}/v1/swaps/tokens` — the Swaps API's own list, the one #84 quotes against. Each entry has
     `symbol name decimals address chainKey hubAsset vault`, optional `access`, `isRwa`.
   - Native tokens: `getAllChainsConfigs()` (sodaxApi.ts:523, already cached) → `[chainKey].nativeToken`.
   - Both through `Promise.all`, one in-flight promise shared by concurrent first calls. Either failing →
     `UPSTREAM_UNAVAILABLE`.
   - Rejected: `/v1/be/config/swap/tokens` (no `hubAsset`); the bundled SDK list (a release snapshot: new tokens
     appear live first, and a fallback could offer tokens the API won't route).
2. **Keyed.** Add `/v1/swaps/` to `KEYED_BASE_URLS` in `http.ts`: the SDK docs list the Swaps API as carrying the key,
   and the swap tools always have one. When `/v1/swaps` enforces keys, the token call keeps working.
3. **Chain lookup** reuses `resolveChainKey(chain, Object.keys(map))` (sodaxApi.ts:180). No match →
   `UNSUPPORTED_CHAIN` with the supported list.
4. **Token lookup, first rule wins:**
   - a. **Address**: `0x` + 40 hex compared case-insensitively; other formats exactly (base58, `cx…`, Sui coin types,
     Stellar contract ids). No match → `not_found`, no suggestions.
   - b. **`native`** (any case) → the chain's native token; else **exact symbol**, case-insensitive. Two exact →
     `ambiguous`.
   - c. **Fuzzy, always `ambiguous`** (even one candidate: USDT0 ≠ USDT, `bnUSD (legacy)` ≠ bnUSD): normalized symbol
     (lowercase, `[^a-z0-9]` removed) contains the normalized query (2+ chars), or the query starts a word of the
     name — "ETH" hits "Wrapped Ether", not "Tether USD". Sort by symbol length, then list order; max 10.
   - d. **`not_found`** with up to 5 suggestions: for `w` + native symbol, the native token first (WETH on Arbitrum →
     ETH); then symbols within edit distance 2.
5. **Restricted tokens get a direction in `nextStep`.** A swap deposits the source token into its hub vault and
   withdraws the destination token. `withdrawOnly` (SDK: "kept for users to withdraw positions from a deprecated hub
   vault") can only be received; `depositOnly` only sent. Live today: Arbitrum tBTC and Base cbBTC, `withdrawOnly`,
   both on the deprecated vault `0x7A1A5555…`. The resolver keeps `access` in the output and the `nextStep` says
   which side it may be used on. Whether the Swaps API itself rejects one as a source is #84's question.
6. **`registerActionTool` lands here** (D6: the five swap tools share it; #84 extends it). It wraps
   `registerAppTool(server, "swap", …)`, so the registry, analytics wrapper and `seedToolRegistry` keep working.
   #83's part: the zod input shape (the SDK validates before the handler and returns its own `isError` text — accepted);
   an `ActionError` → `isError` result `{ error: { code, message, ...details }, nextStep }`; anything else →
   `INTERNAL`, generic message, logged with `err` and the tool name only; output `{ content: [{ type: "text", text:
   JSON.stringify(out, null, 2) }], structuredContent: out }`. Errors are returned, never thrown, so nothing reaches
   PostHog (`trackToolCall` sends the thrown message only). No `outputSchema` (needs `registerTool`, which the
   analytics wrapper and the seed fake don't handle).
7. **Outcomes.** `resolved` / `ambiguous` / `not_found` are answers (`isError` false); only `UNSUPPORTED_CHAIN`,
   `UPSTREAM_UNAVAILABLE`, `INTERNAL` are errors (issue AC: "candidates, not an error dump").
8. **Tool output is data, not instructions.**
   - Token entries are validated with zod and dropped (one `logger.warn` with the count) unless `symbol` matches
     `^[A-Za-z0-9 ._()+\-]{1,32}$`, `name` is 1–64 printable characters, `decimals` is an integer 0–255, addresses are
     non-empty and ≤ 128 characters, `access` is one of the two values.
   - `nextStep` is built only from validated symbols and chain names, never from the caller's `query` (it's already
     in the `query` field).
   - `nextStep` never names a builder tool (a `swap` connection doesn't have them) or an unmerged tool.
   - No caller input reaches a URL (the whole list is fetched) or a log.

**What the agent sees** (`structuredContent`, and the same object as JSON text):
```ts
type Token = { symbol: string; name: string; address: string; decimals: number; chainKey: string;
               hubAsset: string; isNative: boolean; access?: "withdrawOnly" | "depositOnly" };
type Chain = { key: string; name: string };
| { status: "resolved"; chain: Chain; matchedBy: "address" | "symbol" | "native"; token: Token; nextStep: string }
| { status: "ambiguous"; chain: Chain; query: string; candidates: Token[]; nextStep: string }
| { status: "not_found"; chain: Chain; query: string; suggestions: Token[]; nextStep: string }
| { error: { code: "UNSUPPORTED_CHAIN"; message: string; supportedChains: Chain[] }
         | { code: "UPSTREAM_UNAVAILABLE" | "INTERNAL"; message: string }; nextStep: string } // isError: true
```

| Outcome | `nextStep` |
|---|---|
| resolved | `Use chain.key and token.address for this side of the swap; amounts stay in human units.` |
| resolved, `withdrawOnly` | `<symbol> on <chain> is withdraw-only: use it only as the token the user receives.` |
| resolved, `depositOnly` | `<symbol> on <chain> is deposit-only: use it only as the token the user sends.` |
| ambiguous | `Ask the user which of <symbols> on <chain> they mean, then call sodax_resolve_token again with its address.` |
| not_found + suggestions | `No swap token matches on <chain>; ask the user whether they mean <first>[ (the native token)] or another suggestion.` |
| not_found, none | `No swap token matches on <chain>; confirm the chain and token with the user.` |
| `UNSUPPORTED_CHAIN` | `Ask the user which supported chain they mean and pass its key.` |
| `UPSTREAM_UNAVAILABLE` / `INTERNAL` | `Retry in a minute; if it still fails, tell the user the SODAX swap service is unavailable.` |

## Changes

- `src/constants.ts`: `` SODAX_SWAPS_BASE_URL = `${SODAX_API_ORIGIN}/v1/swaps` ``.
- `src/services/http.ts`: `KEYED_BASE_URLS` gains `SODAX_SWAPS_BASE_URL` (design 2); `http.test.ts` gains the case.
- `src/services/swap/errors.ts`: `ActionErrorCode = "UNSUPPORTED_CHAIN" | "UPSTREAM_UNAVAILABLE" | "INTERNAL"`;
  `class ActionError extends Error { code; nextStep; details? }`.
- `src/services/swap/tokens.ts`: `getSwapCatalog(): Promise<{ tokens: Record<string, SwapToken[]>; native:
  Record<string, string> }>` — `fetchJson` of `${SODAX_SWAPS_BASE_URL}/tokens` and `getAllChainsConfigs()` in
  parallel, zod per entry (design 8), cache with in-flight dedupe; failure → `ActionError("UPSTREAM_UNAVAILABLE")`.
  `SwapToken` is local (`chainKey: string`, `access?: "withdrawOnly" | "depositOnly"`).
- `src/services/swap/resolver.ts`: pure `resolveToken(catalog, chain, query)` (designs 3–5) + a small `editDistance`.
- `src/tools/actionTool.ts`:
  ```ts
  export function registerActionTool<Args extends ZodRawShapeCompat>(server: McpServer, name: string, description: string,
    input: Args, annotations: ToolAnnotations,
    run: (args: Parameters<ToolCallback<Args>>[0]) => Promise<Record<string, unknown> & { nextStep: string }>): void
  ```
- `src/tools/swap.ts`: `registerSwapTools(server)` registers `sodax_resolve_token`; input `chain:
  z.string().trim().min(1).max(64)`, `query: z.string().trim().min(1).max(128)`; annotations read-only, idempotent,
  open-world; description: *"Resolve a token on a chain to the address, decimals and hub asset the swap tools need.
  chain: name, ticker or key ("Arbitrum", "arb", "0xa4b1.arbitrum"). query: symbol ("USDC"), contract address, or
  "native" for the gas token. Returns resolved, ambiguous (ask the user to pick; never guess) or not_found (with
  suggestions)."*
- `src/server.ts`: `swap: [registerSwapTools]` in `STATIC_REGISTRARS`.

## Tests

- Fixtures `src/services/swap/__fixtures__/`: `swap-tokens.json` (`/v1/swaps/tokens`, 2026-10-26, trimmed to `sonic`,
  `hyper`, `0x1.icon`, `0xa4b1.arbitrum`, `0xa86a.avax`) and `chain-configs.json` (the matching `nativeToken` values),
  plus one bad token entry (a symbol with a newline) to prove it's dropped.
- `resolver.test.ts` (table):

  | Chain | Query | Expected |
  |---|---|---|
  | Sonic | `WETH` / `sodaETH` | resolved WETH / resolved sodaETH |
  | Sonic | `ETH` | ambiguous: WETH, sodaETH, **not USDT** |
  | Sonic | `USDC` / `usdc` / `sodausdc` | USDC (6) / USDC / sodaUSDC (18) |
  | Sonic | `native` | S |
  | Hyper | `USDC` / `USDT` / `USDT0` | resolved (6) / ambiguous [USDT0] / resolved |
  | ICON | `bnUSD` / `bnUSD (legacy)` / `native` / legacy `cx…` | ambiguous / resolved / ICX / resolved |
  | Arbitrum | `WETH` | not_found; `suggestions[0]` ETH, `isNative` |
  | Arbitrum | `native` / `eth` / lowercase USDC address / unknown `0x…` | ETH / ETH / resolved / not_found, none |
  | Arbitrum | `tBTC` | resolved, `access: "withdrawOnly"`, withdraw-only `nextStep` |
  | Avalanche | `WETH` | ambiguous [WETH.e] |
  | `arb`, `Arbitrum One`, `ARBITRUM`, `hype` | — | chain keys resolve |
  | `Fantom` | — | `UNSUPPORTED_CHAIN` with the list |
  | any | a query with instructions in it | `nextStep` doesn't contain it |
- `tokens.test.ts` (`fetch` spy): both URLs; two concurrent calls → one fetch each; the bad entry dropped; either
  failing → `UPSTREAM_UNAVAILABLE`; the swaps call carries the caller's key.
- `src/tools/swap.test.ts`: `Client` ↔ `createServer({ builder: false, swap: true })` over `InMemoryTransport`, `fetch`
  serving both fixtures: `listTools` = only `sodax_resolve_token`; Arbitrum/WETH → `not_found` with ETH first, text =
  JSON of `structuredContent`; Fantom → `isError` `UNSUPPORTED_CHAIN`; failing fetch → `UPSTREAM_UNAVAILABLE`.
- `actionTool.test.ts`: a throwing `run` → `INTERNAL`, message without the thrown text.
- `server.test.ts`: the swap-only disjointness test stays; add keyed `all` = builder list + `sodax_resolve_token`.
  `__snapshots__/builder-tools.json` must not change.
- `toolRegistry.test.ts`: remove the `swap` skip in "at least one tool per module"; flip the Swaps card test to the
  visible card (`swap` count is 1).

## Verification

1. `pnpm checkTs && pnpm lint && pnpm build && pnpm test`; `git diff a816105 -- src/__snapshots__/builder-tools.json`
   empty; `git diff a816105 -- package.json pnpm-lock.yaml` empty (no new dependency).
2. HTTP smoke (`SODAX_SWAP_TOOLS_ENABLED=true TRANSPORT=http PORT=3100 node dist/index.js`; `POST /mcp?profile=swap`,
   `x-api-key: sodax_smoke`): `tools/list` = `sodax_resolve_token`; `/health` `tools.swap: 1`; landing card visible;
   Arbitrum/WETH → not_found ETH first; Arbitrum/tBTC → withdraw-only `nextStep`; Sonic/ETH → ambiguous, no USDT;
   hyper/USDC → 6 decimals; ICON/bnUSD → ambiguous; Fantom/USDC → `UNSUPPORTED_CHAIN`. Switch off → `/health` swap 0,
   card hidden, keyless default = builder list. Repeat with `SODAX_ENV=canary`.
3. stdio: `--profile swap`, `SODAX_API_KEY=sodax_smoke`, switch on → `tools/list` = `sodax_resolve_token`.

## Ship

- Branch `feat/83-resolve-token` off `feat/82-tool-profiles` (`a816105`). When #92 squash-merges, merge
  `origin/development` in (never rebase). Draft PR into `development` now, ready once #92 merges.
- Commits: `feat: add the swap token resolver` · `feat: add sodax_resolve_token to the swap profile`.
- PR `feat: add sodax_resolve_token to the swap profile`; body `Closes #83`, outcome shapes, the restricted-token
  rule, departures (no SDK dependency yet, units in #84). Public repo: no internal hosts or backend internals.
- No hub change in #83 (no new dependency). After merge: `plan.md` rows 83–84, `brief.md`.

## Open questions

1. **Restricted tokens as a source.** #83 tells the agent (design 5); #84 asks the backend whether the Swaps API
   rejects a `withdrawOnly` source itself, and blocks it in the quote if not.

## Notes for #84

- It now carries what #83 dropped: `@sodax/sdk` + `@sodax/types` (`2.2.0` cleared its 14-day cooldown on 2026-10-26
  11:10 UTC; don't take `2.3.0-rc.1`), `engines >=22.12.0` (check whether staging builds with nixpacks, whose
  `nodejs_22` follows a nixpkgs pin), `sodax-deps.yaml` + the hub PR (`repos.yaml` `depends_on`, the card's Node line,
  IF-25 consumers; merge order vs the bump bot, since only `submodule-audit` and `ci` are required checks), and
  `units.ts` (strict: `^\d+(\.\d+)?$`, ≤ `decimals` fraction digits, never rounded, ≤ 2^256−1; `1,000` and `1e6`
  fail).
- Move `getSwapCatalog`'s token fetch onto `SwapsApiService.getTokens()` with the per-call key.
- The backend serves config 2020008 (rc.8) while we'd pin 2.2.0; the SDK's `ConfigService` keeps its packaged
  defaults when the backend's config is older, so test that a live-resolved token passes any SDK-side check.
- Point the `resolved` `nextStep` at `sodax_swap_quote`.

## Review (2026-10-26)

Checked against the code at `a816105` and the live API (05:31–05:50 UTC):
- `GET /v1/swaps/tokens`: 200 keyless; 22 chains, 382 tokens; fields as in design 1. Arbitrum has no WETH (ETH is
  native), so "WETH on Arbitrum" → not_found with ETH is real.
- `GET /v1/be/config/spoke/all-chains-configs` (what `getAllChainsConfigs()` fetches): the same 22 keys, each with a
  `nativeToken` that matches exactly one token in the swap list on every chain (ICON `cx000…`, Sui `0x…2::sui::SUI`,
  Stellar, NEAR, Stacks, Injective included). That makes `@sodax/types` unnecessary in #83.
- `access`: only Arbitrum tBTC and Base cbBTC, both `withdrawOnly`, both on vault `0x7A1A5555…`; no two entries
  share an address on a chain. SDK `packages/types/src/chains/tokens.ts:11-21` defines the two values.
- Analytics: `withAnalytics` sends the tool name, duration, success and, only when a handler throws, the error
  string — never arguments. Returning errors keeps queries out of PostHog.
- `resolveChainKey` is at `sodaxApi.ts:180`; `getAllChainsConfigs` at `sodaxApi.ts:523` (cached).
- Changed in review: dropped `@sodax/types`, the Node bump, the hub PR and `units.ts` (→ #84); added `/v1/swaps/` to
  the keyed routes; added the restricted-token `nextStep`; validated token strings and kept the caller's query out
  of `nextStep`; fetched both lists in parallel with in-flight dedupe.
