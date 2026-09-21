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

### 2026-09-18 — session 2: decision record, and two findings that change the plan

ADR written: `decisions/0003-adopt-privy-as-the-email-wallet-provider.md` (Accepted, supersedes
0001, which now carries a banner). Then, while a second workflow (research on the five remaining
open questions + a five-lens review of `plan.md`) ran, I verified four things first-hand.

#### F7. `'use client'` is absent from the published dists — both ours and Privy's

`https://unpkg.com/@sodax/wallet-sdk-react@2.0.0-rc.17/dist/index.mjs` starts with a plain
`import … from './chunk-OFHQ3WFM.mjs'` — **zero** occurrences of `use client`, confirming that
tsup's rollup pass strips the directive that `SodaxWalletProvider.tsx:1` carries in source.
`@privy-io/react-auth@3.40.0/dist/esm/index.mjs` also has **zero**. So no library in this stack
ships the directive and App Router consumers already wrap providers in their own `'use client'`
module. → rev 2 must decide whether `restore-use-client.mjs` is worth owning at all, or whether the
docs simply state the wrapper requirement.

#### F8. Privy's RPC override is the answer to the chain-coverage risk

`@privy-io/chains@0.5.2` (what react-auth 3.39/3.40 depend on) exports 61 chains including
**sonic 146, hyperEVMMainnet 999, kaia 8217** but **not Hedera 295, LightLink 1890, Redbelly 151 or
Robinhood 4663**. That is survivable: reading `react-auth@3.40.0/dist/esm/getPublicClient-*.mjs`,
the embedded provider resolves its RPC as
`chain.rpcUrls.privyWalletOverride → app-config rpcUrls[chainId] → chain.rpcUrls.privy (+?privyAppId) →
chain.rpcUrls.public/default`, and throws `Unsupported chainId` **4901 only when the id is missing
from the `supportedChains` array we pass**. A chain Privy has never heard of therefore works
client-side as long as we pass it and it carries an RPC URL.
→ rev 2: pass `supportedChains` built from the SDK's chain tuple **with the partner's
`EVM.chains[key].rpcUrl` injected as `rpcUrls.privyWalletOverride`**, so Privy broadcasts through the
same endpoint wagmi reads from. Drop "addRpcUrlOverrideToChain as a follow-up" from the risk list.
Server-side acceptance of an unknown chain id during signing is still unverified.

#### F9. PR #163 already opened the seam this plan was going to invent

`feat/wallet-hw` (open 2026-05-27, updated 2026-09-07, 0xmilktea, 30 files, REVIEW_REQUIRED, no
reviews) adds **`EVM.wagmiConnectors?: CreateConnectorFn[]`** to `EvmAdapterFields` — "the supported
way to add custom EVM wallets" — pushed in the same `EvmProvider` `useMemo` our plan edits, and
ships a separate opt-in package `@sodax/wallet-hw` with peer-only deps and `./ledger` / `./trezor`
sub-paths. It independently confirms the direction ("signing flows through wagmi's wallet client, so
`useWalletProvider` returns the usual `EvmWalletProvider`") and its connectors deliberately return
`isAuthorized() === false`, which is the opposite of what AC3 needs here.

Consequences, all for rev 2: the two PRs conflict on the same `useMemo` and the same
`EvmAdapterFields` block (and #163 predates #443, so it needs a rebase regardless); if #163 lands
first the Privy connector can ride `wagmiConnectors` and only the React **host** needs a core seam;
and the "separate package" option is more live than the plan assumed. Against it: verified that
`scripts/release.mjs` discovers publishable packages from `packages/*` (non-private `@sodax/*`) and
`packageListErrors()` fails unless `scripts/bump-versions.sh:7` and
`.github/workflows/sdks-publish.yml:30,72` list the same set — `@sodax/wallet-hw` is
`"private": false` at `0.0.1-test` and #163 edits none of those, so **#163 as it stands would fail
`pnpm release` preflight**. That is a note for their PR thread (not a new issue), and it is the
concrete reason a sub-path still beats a new package here.

#### Draft comment for PR #163 — NOT POSTED (ask the user first)

> Heads-up from #456 (Privy email login as an opt-in EVM wallet source): `EVM.wagmiConnectors` is the
> right seam and we'll append next to it rather than replace it — Privy additionally needs a React host
> inside `EvmProvider` (it has to read the partner's per-chain `rpcUrl` map, which only exists there), so
> it keeps its own typed `EVM.privy` slot and both fields feed the same `connectors` array. Two mechanical
> conflicts to expect on a rebase: `EvmProvider.tsx`'s `useMemo` gained `persistKey` in #443, and
> `src/providers/evm/EvmProvider.test.tsx` has existed on main since #247, so the new file here becomes an
> add/add. Separately, `packages/wallet-hw/package.json` is `"private": false` at version `0.0.1-test`,
> which will fail CI on merge: `scripts/release.mjs` discovers every non-private `@sodax/*` manifest under
> `packages/`, rejects any version that isn't `X.Y.Z[-rc.N]` (`scripts/config-version.mjs:15`), and
> `scripts/release.test.mjs:306-311` asserts this against the real repo root inside `pnpm test`
> (`.github/workflows/ci.yml:234`). The fix is either `"private": true` until you're ready to publish, or
> aligning the version to the `2.0.0-rc` line and adding `wallet-hw` to `scripts/bump-versions.sh:7` and
> `.github/workflows/sdks-publish.yml:30` and `:72`. That gate landed in #407 on 2026-08-30, after this
> branch's last CI run, so it has never been exercised here.


#### F10. Nothing moved on the issue itself

#456 still has zero comments and one assignee (2026-09-15). No other Privy/email work is open in
either repo except sodax-frontend#1069.

### Round 2 close (2026-09-18)

Second workflow finished clean (39/39 agents): five research topics and a five-lens review of rev 1,
with every non-minor finding put through two independent refuters. It invalidated **five** things rev 1
called settled — `setWalletRecovery()` throws on TEE rather than merely being unnecessary;
`supportedChains` needs `privyWalletOverride` decoration and Privy's registry maps id 999 to Zora Goerli
Testnet; AC5's "reconnects are never delayed" is false because wagmi's reconnect loop has no `break`;
the single 300 s `connectTimeoutMs` is the wrong shape; and `loginMethods: ['email']` does not stop Privy
standing up its own WalletConnect, Coinbase and Base Account stacks. Below those: the reconnect flag
would have gone into a **session cookie** and died on browser quit, `getChainId`/`getAccounts` were never
specified although `getConnectorClient` throws on disagreement, `isAuthorized` compared a Promise to
`true`, and the chain-switch sequence was a guaranteed race.

`plan.md` is now rev 2 with all 53 edits plus the PR #163 memo folded in. The spike shrank from 8 items
to 5 and gained a Turbopack prerender go/no-go that needs no Privy app. Estimate moved to 9-10 days.
Full delta and the 38 primary-source facts: `plan-revision-2.md`.

### Session close (2026-09-18, first pause)

User paused the work. Workflow run `wf_9eac3d91-095` stopped with 7 agents outstanding
(C5/C8/C9/C10 second refuters, critic). Resume recipe in `brief.md`. Work resumed the same day —
see session 2 above.

## Changes During Work

- Created this dossier (`issue.md`, `brief.md`, `plan.md`, `plan-architecture.md`, `research.md`, `process.md`, `outcome.md`).
- Pending in the context repo: decision 0003 (Privy supersedes 0001) and the 0001 status flip.
- No code changes in `sodax-sdks`. Local checkout was on `fix/sui-asset-manager-live-package-id`;
  implementation must branch from `main`.
