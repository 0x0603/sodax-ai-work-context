---
type: research
repo: sodax-sdks
github: 519
updated: 2026-10-14
tags: [v3, competitors, lightweight, sdk-design, lifi, relay, wormhole, solana-kit, wagmi, mcp]
---

# GH-519 · Peer SDK designs (as of 2026-10-14)

Distilled from a research agent (web + npm). **✓** = re-checked by hand this session (`npm view`,
raw GitHub files); the rest are the agent's findings with sources, not re-checked.

## The closest precedent: LI.FI SDK v4 (2026-06)

- ✓ `@lifi/sdk` 4.12.1 depends only on `@lifi/types`, `sideEffects: false`. Chain support moved to
  `@lifi/sdk-provider-{ethereum,solana,bitcoin,sui,tron,stellar}` ✓ — registered with
  `client.setProviders([EthereumProvider({ getWalletClient, switchChain })])`.
- ✓ Provider packages hold chain libs as regular deps (`sdk-provider-ethereum` → `viem ^2.57.4`).
- Global config → `createClient()`; every action takes the client first (`getQuote(client, …)`),
  `actions(client)` for bound methods.
- Agent-measured install: v3.16 = 185 MB / 110 pkgs → v4 core = 3 MB / 2 pkgs; core + EVM provider =
  83 MB (viem 56 MB).
- ✓ CI size budgets (`.size-limit.json`): `{ createClient, getQuote }` ≤ 6 kB, all core exports ≤ 20 kB,
  EVM provider ≤ 115 kB, Solana ≤ 34 kB, Bitcoin ≤ 82 kB.
- Execution: `executeRoute` with `updateRouteHook`, resumable (`resumeRoute`, `stopRouteExecution`),
  progress in `route.steps[].execution.actions[]`; manual mode = `getStepTransaction` + `getStatus`.
- Widget v4 split wallet stacks into `@lifi/widget-provider-*`.
- Typed thrown errors with numeric `LiFiErrorCode`.
- → Same problem SODAX has (monolithic core with every chain lib), solved one major ago.

## Adapter-per-VM: Relay

- ✓ `@relayprotocol/relay-sdk` 8.0.4: dep `axios`, peer `viem >=2.26.0`. ✓ Separate VM adapters, e.g.
  `relay-svm-wallet-adapter` (peer `@solana/web3.js ~1.98.2`); also bitcoin, tron, ton.
- `AdaptedWallet`: `vmType, getChainId, address, switchChain, handleSignMessageStep,
  handleSendTransactionStep, handleConfirmTransactionStep` (+ optional batch / balance).
- `execute({ quote, wallet, onProgress })` — SDK owns the step state machine; adapter only signs /
  sends / confirms. Downside: global `createClient` singleton.
- → Template for a SODAX signer-only wallet interface.

## Lazy platforms: Wormhole TS SDK

- ✓ `@wormhole-foundation/sdk` 6.1.5 (`type: module`; v5 went ESM-only with the Sui v2 migration).
- `await wormhole('Mainnet', [evm, solana])`; each platform / protocol is a dynamic `import()`.
- Bundle skips unused chains, install does not: meta package 372 MB / 339 pkgs vs
  `sdk-connect + sdk-evm + sdk-evm-tokenbridge` 38 MB (agent-measured).
- → Offer an "all chains" convenience entry via loaders, never as the default install.

## Solana Kit (replacement for web3.js v1 + anchor)

- ✓ Kit README: library 81 KB → 57.5 KB (−29%); app doing a lamport transfer 111 KB → 23.9 KB (−78%);
  Solana Explorer first load 311 KB → 228 KB (−26%).
- ✓ web3.js README: "Version 1.x is no longer actively maintained and receives critical fixes only."
- ✓ `@coral-xyz/anchor` stops at 0.32.1; continues as `@anchor-lang/core` (latest 1.2.1, `next`
  2.0.0-rc.2 built on Kit, per agent). Codama generates Kit clients from Anchor IDLs.
- → SODAX's Solana spoke is on web3.js 1.98 + anchor 0.30.1 + spl-token (and `bigint-buffer`
  advisory). Move to Kit + a Codama client; LI.FI v4 already did.

## Tree-shakeable function APIs: viem / wagmi / thirdweb

- viem: `createClient` + actions from `viem/actions` (tree-shakeable) vs `createPublicClient`
  (decorated). Budgets: `{ createClient, http }` ≤ 6.6 kB. `publint --strict` + `attw --pack` + knip.
- Library pattern on viem (agent's inference): accept a viem `Client`, call actions through
  `getAction`, export `xActions(client)` for `.extend()`, keep viem as a peer.
- ✓ wagmi 3.7.7 (`type: module`); ✓ `@wagmi/connectors` 8.x lists every wallet SDK
  (`@metamask/connect-evm`, `@coinbase/wallet-sdk`, `@walletconnect/ethereum-provider`, …) as an
  **optional peer**, while 5.x (wagmi v2) has them as hard deps. SODAX pins wagmi `2.16.9`.
- `@wagmi/core/query` exports framework-agnostic `get*QueryOptions(config, opts)` factories.
- thirdweb v5: "function based rather than class based for better tree shaking"; claims min app
  766 KB (v4) → 104 KB (v5); budgets ≤ 7.5 kB for the minimal import. Still one 55 MB package with
  subpaths — small bundles, big install.

## Modular umbrella: CoW Protocol

- `@cowprotocol/cow-sdk` 9.x re-exports 7 core packages; bridging, composable, flash-loans, etc. are
  separate installs. v7 added EVM-library adapters (viem / ethers v5 / v6), "99% backward compatible".
- → A thin `@sodax/sdk` umbrella re-exporting core only, advanced features as separate installs.

## Money markets: Aave, Morpho

- Aave `@aave/client` 6.7.0: viem-style actions, neverthrow `ResultAsync`
  (`action(client).andThen(sendWith(wallet)).andThen(client.waitForTransaction)`), typed errors
  (`SigningError`, `TimeoutError`, `TransactionError`, …). ✓ viem / ethers / thirdweb / privy are
  peers, with `@aave/client/{viem,ethers,thirdweb,privy}` subpaths.
- Morpho: `blue-sdk` (entities + math, depends only on `@noble/hashes`), `blue-sdk-viem` (fetchers via
  opt-in side-effect imports). ✓ `blue-sdk-wagmi` deprecated: "First-party Wagmi hooks are no longer a
  supported public SDK surface."
- → Aave's `ResultAsync` + `sendWith(wallet)` maps onto SODAX's `Result<T>`; Morpho dropping hooks is
  a data point for how thick dapp-kit should be.

## Intent / bridge peers (quick)

| Project | Weight | Flow |
| --- | --- | --- |
| Across `app-sdk` | zod + viem peer | `getSwapQuote` → `executeSwapQuote({ onProgress })`, typed `{ step, status }` |
| Rango basic SDK | axios + types | `swap()` returns a tx for the dapp's own wallet; poll status |
| NEAR Intents 1Click | OpenAPI-generated client | quote (dry run) → user transfers to a deposit address → `getExecutionStatus` |
| Chainflip | ethers, bignumber.js | deposit channels or `encodeVaultSwapData` (unsigned data) |
| Mayan | heavy | both signing path and payload builders |
| deBridge DLN, Squid, 1inch Fusion+ | heavy SDKs | docs push the HTTP API first (deBridge, Squid) |

→ The light pattern is a **prepare layer that returns unsigned txs / deposit addresses with no chain
libs**; signing is an add-on. SODAX's `@sodax/swaps-api` already returns raw txs per chain.

## AI / agent surface

- ✓ LI.FI MCP docs: read-only tools, "does not sign or broadcast transactions", quotes include an
  unsigned tx. Also an agent-skills repo.
- Aave: hosted `mcp.aave.com` returning unsigned txs; skills via `npx skills add aave/skills` and a
  Claude Code plugin marketplace. Relay, deBridge, Across ship MCP servers; Across also an `AGENTS.md`
  template.
- `llms.txt` served by LI.FI, Relay, viem, wagmi, CoW, Aave, Wormhole, thirdweb, Across, deBridge,
  NEAR Intents, Morpho, Squid (agent checked HTTP 200).
- Agent kits (Coinbase AgentKit, Solana Agent Kit) define tools with zod; GOAT looks dormant (last
  publish May 2025).
- → valibot schemas → JSON Schema (`@valibot/to-json-schema`) → MCP tool schemas.

## Hygiene

- ESM-only: wagmi, `@wagmi/core`, ox, ✓ `@mysten/sui` v2 (`type: module`, `node >=22`), Wormhole v5.
  `require(esm)` is unflagged in Node 22.12.0 and 20.19.0; Node 20 is EOL.
- ✓ Chain libs are raising the Node floor: `@stellar/stellar-sdk` 17.2.1 needs `>=22.12.0`,
  `near-api-js` 7.3.1 needs `>=22.22.2` (SODAX engines say `>=22.12.0`).
- tsup README: "not actively maintained anymore. Please consider using tsdown" ✓.
- Checks others run: size-limit (viem, LI.FI, thirdweb), publint + attw (viem, wagmi), agadoo (Kit),
  knip. Kit strips error messages in production builds (`__DEV__`).

## Top transferable patterns (ranked: weight first)

1. Chain-agnostic core + one provider package per VM (LI.FI v4).
2. Chain libs never in core deps; peers where possible (Relay, wagmi v3, Aave).
3. Client-first standalone functions instead of an eager class (viem, LI.FI v4, Aave, thirdweb).
4. Solana on Kit + Codama client.
5. Per-entry, per-provider size budgets in CI.
6. ESM-only, correct `sideEffects`.
7. Optional all-chains package via dynamic-import loaders (Wormhole), never the default.
8. Prepare layer returning unsigned txs with zero chain libs (Rango, 1Click, Chainflip, deBridge).
9. One small signer interface per VM (Relay `AdaptedWallet`, LI.FI `SDKProvider`).
10. Resumable execution + typed progress + stable error codes (LI.FI, Across, Kit, Aave).
11. Thin React layer on query-option factories (wagmi); per-ecosystem wallet packages.
12. Read-only MCP returning unsigned txs + skills + `llms.txt` + JSON Schema from validators.
