---
type: draft
repo: sodax-sdks
github: 519
status: Superseded by research/e-519-bullet-feasibility.md § Revised wording (2026-10-19)
updated: 2026-10-19
tags: [v3, idea-capture, draft]
---

# #519 input · bullets per package

Replaces `ideas.md` §1 as the thing to post. #519 asks for bullets per package, no details, each
prefixed with the author. Detail stays in this dossier until the team turns bullets into sub-tasks.

```markdown
0x0603: My main theme is a lighter SDK. An EVM-only app should not pay for every chain. Numbers and details later.

## `@sodax/sdk`

- 0x0603: Core is hub + EVM. Every other chain becomes an opt-in `@sodax/chain-<name>` package, plus `@sodax/chains-all`
- 0x0603: Unbundled ESM build with no import-time side effects, so tree-shaking works
- 0x0603: ESM-only, with viem, wagmi and react-query as peers
- 0x0603: Drop the PancakeSwap SDKs and keep only the math we use
- 0x0603: Lighter chain libs: ICON over plain JSON-RPC, Stellar `/minimal`, Solana without Anchor
- 0x0603: Per-feature entries like `@sodax/sdk/swap`, next to the `Sodax` facade
- 0x0603: No Buffer or crypto polyfills needed
- 0x0603: One error shape for API failures, AbortSignal and request ids
- 0x0603: Remote config for token and chain lists (needs a product call)
- 0x0603: A `testing` entry with fake wallets and API mocks

## `@sodax/dapp-kit`

- 0x0603: Per-feature subpaths, sdk as a peer, no `export *`
- 0x0603: Lifecycle hooks for every multi-step flow, not just swap, bridge and leverage yield
- 0x0603: Exported query keys and `queryOptions` builders
- 0x0603: Hooks get the wallet from context instead of a `walletProvider` argument
- 0x0603: One error style across hooks
- 0x0603: Consistent hook and param names; `SodaxProvider` accepts a sodax instance
- 0x0603: Polling presets and a `transport` option (SDK or API)

## `@sodax/wallet-sdk-core`

- 0x0603: Private-key signers move to a server-only entry
- 0x0603: Wallet interface is just sign and send, no RPC reads
- 0x0603: Per-chain signers move into the chain packages; the rest folds into `@sodax/sdk/wallet`
- 0x0603: Adapters over EIP-1193, viem WalletClient and Wallet Standard

## `@sodax/wallet-sdk-react`

- 0x0603: Chain adapters (`adapters={[evm(), solana()]}`), loaded lazily, no global singletons
- 0x0603: wagmi v3, so the wallet SDKs become optional
- 0x0603: Reuse the app's QueryClient (`EvmProvider` creates its own today)
- 0x0603: Typed per-chain account hooks
- 0x0603: Embedded and social wallets as adapters, not just Privy

## `@sodax/skills`

- 0x0603: Skills for v3, while 2.x users keep getting 2.x guidance
- 0x0603: Docs and AI channels follow the released version, not `main`
- 0x0603: Generated hook index and query-key table
- 0x0603: MCP-ready tool schemas for the existing MCP servers

## API packages

- 0x0603: One `@sodax/api` package (swaps, bridge, backend), no viem; the old packages become shims
- 0x0603: `@sodax/api/react` hooks that work without the sdk
- 0x0603: Docs for API mode: the server builds the tx, the client only signs
- 0x0603: OpenAPI drift check in CI

## Cross-cutting

- 0x0603: Split `@sodax/types` into light entries and stop inlining it into other packages
- 0x0603: CI checks for install size, bundle size and consumer `npm audit`
- 0x0603: A codemod for v2 → v3
- 0x0603: Runtime matrix in CI: Node, Bun, Deno, Workers
- 0x0603: Release tooling for a `release-2.x` maintenance line
```
