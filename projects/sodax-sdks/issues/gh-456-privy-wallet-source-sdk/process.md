---
type: process
repo: sodax-sdks
github: 456
updated: 2026-09-18
---

# Process

## Log

### 2026-09-17 — session 1: read issue, verify the repo, research Privy, design

Context repo had no dossier for #456. Prior context that matters: decision 0001 (2026-08-18)
chose to *build* an in-house email/keystore login; the issue records the 14 Sep product call that
Privy replaces it. gh-1069 (frontend) is superseded for implementation.

Verified the repo first-hand (origin/main `9a3ff4881`, 2026-09-17), then ran a research/design
workflow (6 research topics → digest → 3 architectures → 3 judges → synthesis → 2 refuters per
load-bearing claim → completeness critic). First-hand checks below; the workflow's conclusions
are folded into `plan.md`.

## Findings

### F1. How the SDK wires EVM wallets today (source, not docs)

- `EvmProvider.tsx` builds `connectors = []`, pushes `walletConnect(...)` when
  `config.walletConnect.projectId` is set (else warns and skips), then
  `createWagmiConfig(config.chains, { reconnectOnMount, ssr, connectors, persistKey })` and renders
  wagmi's own `WagmiProvider` with a package-private `QueryClient`.
- `createWagmiConfig` (`src/xchains/evm/EvmXService.ts`) calls wagmi `createConfig` with 14 chains
  (incl. hand-defined `hyper` 999 and `robinhoodChain` 4663), `cookieStorage`, and leaves
  `multiInjectedProviderDiscovery` at its default `true` — EIP-6963 wallets are discovered *inside*
  `createConfig` via `mipd` (`@wagmi/core` `createConfig.js:18-45, 222-245`), independent of which
  React provider wraps the config.
- `EvmHydrator.tsx` mirrors `useConnectors()` into the store as `EvmXConnector` instances (id =
  wagmi connector id, `isInstalled` defaults to `true` for provider-managed chains) and builds
  `EvmWalletProvider({ walletClient, publicClient, defaults })` from wagmi's `useWalletClient`.
  Any wagmi connector whose wallet client resolves therefore signs SODAX intents with no
  feature-layer change (AC4 is structural, not something to build).
- `EvmActions.tsx` connects by `wagmiConfig.connectors.find(c => c.id === xConnectorId)` then
  `connectAsync({ connector })`; disconnect clears the store first, then `disconnectAsync()`.
- wagmi 2.16.9 `createConnector` contract (`@wagmi/core` `createConnector.d.ts`): `id`, `name`,
  `type`, `icon?`, `connect`, `disconnect`, `getAccounts`, `getChainId`, `getProvider`,
  `isAuthorized`, `switchChain?`, `onAccountsChanged`, `onChainChanged`, `onDisconnect`.
  `config._internal.connectors.setState/setup` exist (`createConfig.js:357-400`) but are internal.

### F2. What `@privy-io/wagmi@4.0.17` actually does (read the published ESM, 2026-08-31)

Fetched `dist/esm/*.mjs` from unpkg (copies under the session scratchpad `privy-wagmi-src/`).

- `createConfig` = wagmi `createConfig({ ssr: true, ...cfg, connectors: cfg.connectors?.filter(c =>
  c.type === 'mock'), multiInjectedProviderDiscovery: false })`. **It drops every user connector
  except mocks and disables EIP-6963 discovery.** Our `walletConnect()` connector would be removed.
- `WagmiProvider` = wagmi's `WagmiProvider` with `reconnectOnMount: false` pre-set, wrapping
  `PrivyWagmiConnector`, which runs `useSyncPrivyWallets`.
- `useSyncPrivyWallets`: for every Privy wallet from `useWallets()` it builds
  `injected({ target: { provider: await wallet.getEthereumProvider(), id, name, icon } })`, runs
  `config._internal.connectors.setup(c)`, then **`config._internal.connectors.setState(list)` —
  it REPLACES the wagmi connector list** with the Privy-derived list. External wallets are meant
  to be connected *through Privy* (`useConnectWallet`, Privy's own WalletConnect) and mirrored in.
  Embedded connector id = `io.privy.wallet.<address>` (`toWalletConnectorId`).
- Consequence: the issue's assumed design ("mount PrivyProvider + Privy's WagmiProvider, keep our
  wagmi config") is not a supported combination. With Privy's `createConfig` we lose WalletConnect
  and EIP-6963; with our `createConfig` under Privy's `WagmiProvider`, the first wallet sync wipes
  our connector list anyway. AC5 fails either way unless the whole wallet list becomes
  Privy-owned. This is the decisive fact behind the chosen design in `plan.md`.

### F3. Packaging facts from the registry (2026-09-17)

- `@privy-io/react-auth`: latest 3.43.0 (2026-09-15). Newest version older than the 14-day
  cooldown: **3.39.0 (2026-08-31)**; 3.40.0 is 2026-09-03 (borderline). Apache-2.0. 6.8 MB
  unpacked, ~40 direct deps incl. `viem: 2.56.0` (exact, as a *dependency*), `zustand ^5`,
  `@walletconnect/ethereum-provider 2.22.4`, `@coinbase/wallet-sdk 4.3.2`, `mipd`,
  `styled-components`, `react-device-detect`, `jose ^4.15.5`, `@privy-io/js-sdk-core 0.72.1`.
  CJS + ESM, `sideEffects: false`, sub-path exports (`./hooks`, `./ui`, `./solana`, …).
  Exports confirmed in `dist/dts/index.d.mts`: `PrivyProvider`, `PrivyClientConfig`, `useLogin`,
  `useLoginWithEmail`, `useLogout`, `usePrivy`, `useWallets`, `useCreateWallet`,
  `useSetWalletRecovery` (`setWalletRecovery(): Promise<Wallet>`, opens Privy's password modal),
  `getEmbeddedConnectedWallet(wallets)`, `ConnectedWallet`.
- `@privy-io/wagmi`: latest 4.0.17 (2026-08-31), 48 KB, peers `@privy-io/react-auth ^3`,
  `wagmi >=2`, **`viem 2.56.0` exact** (every 4.0.x pins the exact viem of its react-auth).
- SODAX catalog: `viem 2.29.2` (2025-05-10), `wagmi 2.16.9`, `@tanstack/react-query 5.87.4`
  (also forced via overrides). wagmi 2.16.9 accepts `viem 2.x`. So `@privy-io/wagmi` cannot be
  installed without a peer mismatch or a catalog-wide viem bump; `@privy-io/react-auth` alone
  brings its *own* viem 2.56.0 copy (fine at the EIP-1193 boundary, ~+1 viem in partner bundles).
- Probe install in an isolated scratch project with the repo's exact pnpm gates
  (`minimumReleaseAge 20160`, `trustPolicy no-downgrade`, `blockExoticSubdeps`):
  `trustPolicy` blocks `jose@4.15.9` (via react-auth) and `ua-parser-js@1.0.41` (via
  `react-device-detect@2.2.3`). Both are legacy-line releases published after the package's
  current major moved to provenance — the exact category the repo already excludes with exact
  versions (`semver@6.3.1`, `undici-types@6.19.8`, …). Full blocker list: see F5 once the
  iterative probe finishes.

### F4. Repo gates the change must pass

knip (entries `src/index.ts`, `src/xchains/*/index`; `src/providers/**` ignored), attw
`--profile esm-only`, checkTs (test files included; `as unknown as` in tests needs a why-comment),
Docs Drift (`packages/wallet-sdk-react/docs/` or README must change with `src/`), check:ai
(`packages/skills` structural checks), check:doc-links (README links into `docs/` must be absolute
GitHub URLs), OSV scanner + dependency-review on new deps, `blockExoticSubdeps`, single react-query
copy. Changesets are gone since PR #407 — the issue's "changeset" item maps to a clean
`feat(wallet-sdk-react): …` commit subject.

### F5. Iterative probe — full trust-policy blocker list (done)

Scratch project with `@privy-io/react-auth@3.39.0`, `@privy-io/wagmi@4.0.17`, `wagmi 2.16.9`,
`viem 2.29.2`, `react-query 5.87.4`, React 19.1.4 and the repo's exact pnpm gates + existing
`trustPolicyExclude` list. Loop: install → read the blocked package → add its exact version →
repeat.

- Resolves after exactly **two** additional exact-version exclusions: `jose@4.15.9`
  (2024-07-03, 4.x line; 5.0.0 with provenance is 2023-10-25) and `ua-parser-js@1.0.41`
  (1.x line backport; 2.x has provenance). Same category and same style as the existing
  "legacy-line backports" group in `pnpm-workspace.yaml`. Same maintainers, npm-signed.
- `blockExoticSubdeps`: **0** git/tarball specs in the resulting lockfile. 817 packages.
- `pnpm peers check`: one real issue — `@privy-io/wagmi@4.0.17` wants `viem 2.56.0`, installed
  root viem is 2.29.2 (unmet). `@privy-io/react-auth` alone has no unmet peer (its optional
  peers — `@abstract-foundation/agw-client`, `@farcaster/mini-app-solana`, `@solana/*`,
  `permissionless` — are optional). A second warning (`use-sync-external-store@1.2.0` vs React 19)
  is a deep transitive nit.
- Duplicate copies Privy pulls in: `viem@2.56.0` (react-auth, `@base-org/account`),
  `viem@2.36.0` (via `@reown/appkit` ← `@walletconnect/ethereum-provider@2.22.4`),
  `zustand@5.0.15` (react-auth) and `5.0.3` (coinbase sdk), a second
  `@walletconnect/ethereum-provider` (2.22.4 next to wagmi's 2.21.1), `@coinbase/wallet-sdk`
  4.3.2/4.3.6/3.9.3, `@solana/kit` + `@solana-program/*`. This is the cost partners pay only when
  they opt in — it must never enter the default `@sodax/wallet-sdk-react` bundle.
- Deprecated subdeps warning (12) all come from the WalletConnect/MetaMask SDK lines Privy pins;
  none is an OSV finding (OSV scan is a PR-time gate — re-run on the real lockfile).

### F6. Adversarial verification of the ten load-bearing claims (2026-09-18)

Two refuters per claim (docs lens, code lens). Seven refuter/critic agents were cut off by a
usage limit; the run was then paused by the user. Verdicts that arrived:

| Id | Claim (short) | Verdict | What changes |
| -- | ------------- | ------- | ------------ |
| C1 | pnpm isolated layout resolves react-auth's nested viem 2.56.0 (no `tempoModerato` crash); no catalog bump needed | survived (2/2, high) | 3.40.0 pulls js-sdk-core 0.73.0 (not 0.76.0) |
| C2 | wagmi `useWalletClient()` works for a custom connector whose provider comes from another viem copy | survived (2/2) | only `provider.request` crosses the boundary; wagmi wraps it with its own `custom()` |
| C3 | wagmi `reconnect()` ordering / skip / module flag | survived (2/2) | **`isAuthorized()` is not caught** — must never throw, must be self-timed; provider must be a distinct object; ordering = recentConnectorId → hydrated connections → insertion order |
| C4 | `useLogin` completes only via callbacks; `onComplete` fires at mount if already authed | **refuted** (2/2, high) | already-authenticated `login()` only warns, no callback; `wasAlreadyAuthenticated` is a one-shot broadcast, not replayed; `onError` fires for recoverable in-modal errors — reject only on `exited_auth_flow`; pass a ref-stable callbacks object |
| C5 | Privy provider: 4901 on unsupported chain, no `wallet_addEthereumChain`, only `chainChanged` | survived (1 vote) | provider mutates `chainId` before throwing 4901 → validate against wagmi chains first; after logout signing throws 4900 → logout→disconnect translation is required |
| C6 | 3.40.0 is the newest cooldown-eligible version; exactly two trust excludes; 0 exotic deps | survived (2/2) | origin/main moved to 898b7e6a (PR #467 touched the lockfile) — re-run on PR day |
| C7 | tsup keeps `@privy-io` only in `dist/privy/index.mjs`; `'use client'` survives | **refuted on the directive** (2/2) | isolation holds; rollup tree-shake strips module-level directives → post-build restore step; main entry ships without it today |
| C8 | Privy session storage keys / HttpOnly-cookie mode | no votes | covered by spike item 5 (session probe) |
| C9 | same email → same address within one appId; different across appIds | survived (1 vote) | AC3 wording: "as long as the user has not been deleted/unlinked" |
| C10 | TEE default has no password recovery factor | no votes | product question Q1; the digest cites Privy's architecture + cloud-recovery pages directly |

The corrections are folded into `plan.md` (lifecycle, `isAuthorized`, `'use client'`, chain
switch, disconnect) and summarised at the top of `plan-architecture.md` and `research.md`.

### Session close (2026-09-18)

User paused the work ("tạm thời pause sẽ làm sau"). Workflow run `wf_9eac3d91-095` stopped with
7 agents outstanding (C5/C8/C9/C10 second refuters, critic). Resume recipe in `brief.md`.

## Changes During Work

- Created this dossier (`issue.md`, `brief.md`, `plan.md`, `plan-architecture.md`, `research.md`, `process.md`, `outcome.md`).
- Pending in the context repo: decision 0003 (Privy supersedes 0001) and the 0001 status flip.
- No code changes in `sodax-sdks`. Local checkout was on `fix/sui-asset-manager-live-package-id`;
  implementation must branch from `main`.
