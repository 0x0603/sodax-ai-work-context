---
type: draft
repo: sodax-sdks
github: 519
status: Settled 2026-10-20; the @sodax/sdk section is in the #519 body, the rest is not posted yet
updated: 2026-10-20
---

# #519 v3 bullets, paste-ready

- **Source:** `research/f-deep/README.md` § One-line wording per ID. The long lines are shortened here,
  with nothing new added.
- **Order:** the same as the IDs within each package (sdk-1..8 and sdk-10, dk-1..7, wsc-1..4, wsr-1..5, sk-1..3,
  api-1..4, x-1..6).
- **Left out:** sk-4, dropped because its premise is incorrect, and sdk-9, see below.
- **Second review (2026-10-20), applied** to sdk-3, sdk-4, sdk-9 (since dropped), sdk-10, dk-5, wsc-2, wsr-1, wsr-5 and
  x-2. wsc-2 stays neutral on decision D4 rather than naming standalone chain clients.
- **Settled (2026-10-20):** a follow-up review took the neutral wsc-2 wording below and called the
  list final. D3, D4, D8, D12 and D17 stay with the team.
- **sdk-9 dropped (2026-10-20, the user):**
  - In SODAX's design everything goes through the SDK, so remote config can only re-serve what a
    released SDK already defines.
  - Remote config stays an opt-in 2.x feature inside #543, which settles its own version rule and
    trusted fields. Nothing turns it on by default in 3.0.
- **x-6 (2026-10-20):** added after the deep dive, from `research/g-chain-auto-tests.md`. It was not scored
  with the rubric.
- **Prefix:** `[Sang]:`, the user's choice on 2026-10-20 (R0bi7 asks for a name prefix).
- **Posted (2026-10-20):** the nine `@sodax/sdk` bullets replaced the user's six earlier `**[SANG]**` items
  in the #519 body. The body numbers each section's items, so number the next sections the same way.

**@sodax/sdk**

- [Sang]: Keep the Sonic hub and EVM chains in core. Every other chain type becomes an opt-in `@sodax/chain-<name>` plugin, with `@sodax/chains-all` for full-chain integrations
- [Sang]: Publish unbundled ESM with no import-time side effects, and `sideEffects: false` on `@sodax/types`, so bundlers can drop unused code
- [Sang]: Publish ESM-only packages, with Node 22.12+ `require()` compatibility covered by consumer tests; viem, wagmi and TanStack Query become peers where used, tested at the floor and latest versions in CI
- [Sang]: Replace the PancakeSwap SDKs with the CL math, codecs and encoders we use, sourced from verified MIT-licensed implementations or written independently from the contract specs, with golden equivalence tests
- [Sang]: Lighter chain libraries: ICON over plain JSON-RPC with typed receipts, Stellar `/minimal`, and Solana instructions without Anchor or runtime IDL fetching
- [Sang]: Per-feature entry points like `@sodax/sdk/swap`, next to the `Sodax` facade
- [Sang]: Core and EVM browser entries need no Node builtins or globals (Buffer, process, global, crypto, stream); chain packages document what they still need
- [Sang]: Standard API error metadata (status, body, retryable, aborted vs timeout), AbortSignal for requests and polling, and request IDs where the backend supports them
- [Sang]: Optional: a `@sodax/sdk/testing` entry with typed fake wallet providers, schema-checked API fixtures and a `fetch` option, with no test-runner dependency

**@sodax/dapp-kit**

- [Sang]: Ship dapp-kit as unbundled ESM with per-feature and per-chain subpaths, make the SDK a peer, and stop re-exporting the whole SDK
- [Sang]: Lifecycle hooks for money market, staking, migration and DEX on one shared core, with `srcTxHash` on every post-broadcast error and a public settlement-status read
- [Sang]: Export a query-key factory that keeps today's key shapes, plus `queryOptions` builders for every query
- [Sang]: Resolve wallets from a nestable wallet-source context by default (wallet-sdk-react or the app's own); an explicit `walletProvider` always wins
- [Sang]: Normalize SDK/API operation failures to `SodaxError`; query functions reject on failure instead of returning `Result` as data or swallowing errors
- [Sang]: Standard hook and parameter names (deprecated aliases until 3.0), and `SodaxProvider` accepts an existing `Sodax` or core instance, so apps don't import the full facade
- [Sang]: Named polling presets, with an override on `SodaxProvider`

**@sodax/wallet-sdk-core**

- [Sang]: Move private-key and mnemonic signers to server-only entries; browser classes never reference them
- [Sang]: Keep wallet interfaces focused on signing and submission, with a supported way for both SDK and API-only apps to wait for receipts, plus migration guidance for existing wallet receipt methods
- [Sang]: Move non-EVM signers into the chain packages and slim `@sodax/wallet-sdk-core` down to the shared base and EVM signers
- [Sang]: EIP-1193 and Solana Wallet Standard adapters (a viem `WalletClient` already works)

**@sodax/wallet-sdk-react**

- [Sang]: Opt-in chain adapters (`adapters={[evm(), solana()]}`), with only selected chains bundled, connect-time wallet SDKs loaded when needed, and state scoped to each provider
- [Sang]: Upgrade to wagmi v3 (viem ≥ 2.43) and make connector SDKs optional peers, installed only when their connector is used
- [Sang]: Reuse the app's `QueryClient` instead of creating a nested one
- [Sang]: Type `useXAccount`'s address by chain (narrowed for EVM and ICON), without adding a hook named `useAccount`
- [Sang]: If the team wants it: embedded and social wallets as wallet sources for the chain adapters, starting with social login on Privy, which loads only when used

**@sodax/skills**

- [Sang]: Pin every non-npm skills channel (skills CLI, sodax.com/skill.md, doc links) to the latest stable release, with a 2.x ref for 2.x users
- [Sang]: Serve docs.sodax.com, and the AI guidance built from it, from the latest stable release, with main as a preview and a hotfix path for docs-only fixes
- [Sang]: Generate the hook index and query-key reference from source, and fail `check:ai` when they drift

**API packages**

- [Sang]: One viem-free `@sodax/api` for swaps, bridge, leverage yield, backend and sponsoring: one transport, per-API subpaths, one raw-tx schema, and the old packages kept as shims
- [Sang]: `@sodax/api/react`: the API-lane hooks with an `ApiProvider` and no `Sodax` instance; dapp-kit re-exports the same hooks, so names, keys and errors stay one family
- [Sang]: Document API mode per flow and chain: which endpoints return unsigned transactions, how each chain signs and broadcasts them, and the sponsoring and Bitcoin exceptions
- [Sang]: Check the API clients' schemas against the live OpenAPI specs on a schedule and on API PRs, once the backend serves the bridge spec

**Cross-cutting**

- [Sang]: Mark `@sodax/types` side-effect-free, split it into chains, tokens and config subpaths, and stop inlining it into other packages
- [Sang]: Track install size, bundle size and consumer audit results in CI, with regression budgets and explicit approval for baseline changes
- [Sang]: A v2 → v3 migration guide covering every breaking change, plus a codemod for the mechanical import and rename changes
- [Sang]: Test the supported entry points on the Node engines floor, current Node, Deno, Bun and Workers (`nodejs_compat`), and publish the results as a support matrix
- [Sang]: A `release-2.x` maintenance line with its own npm dist-tag, so `latest` never moves back to 2.x
- [Sang]: Automatic per-chain checks: golden tx tests for every chain in CI, plus scheduled keyless live checks (RPCs, config vs on-chain state, simulated SDK-built transactions) that open an owned issue when a chain breaks
