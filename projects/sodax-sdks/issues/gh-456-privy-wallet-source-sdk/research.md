---
type: research
repo: sodax-sdks
github: 456
status: Active
tags: [privy, wagmi, embedded-wallet, email-login, packaging, security, ssr]
updated: 2026-09-18
---

# Research digest — Privy as an opt-in EVM wallet source

Synthesized on 2026-09-18 from six parallel research passes (Privy wagmi package, react-auth API,
custom-connector alternative, packaging/supply chain, security/custody, SSR/precedents). Facts are
labelled **verified** / **likely** / **unverified**. Read `plan.md` first; open this file only for
the evidence behind a specific claim (`rg -n "^## |^### " research.md`, then read one section).

**Round 2 (2026-09-18) superseded parts of this digest.** The 38 primary-source facts the plan now
relies on — including everything about recovery on TEE, Privy's chain registry and RPC resolution,
session storage keys, the eager auth iframe, and the wagmi reconnect/storage semantics — are listed in
`plan-revision-2.md` § 4 with file:line citations. Read that section before quoting anything below.

Corrections found by the first adversarial pass AFTER this digest was written (they win over the text
below): (1) §1.3 `useLogin` — `onComplete` with `wasAlreadyAuthenticated: true` is a one-shot
broadcast from `PrivyProvider`'s init effect, never replayed to a hook that mounts later, and
`login()` only `console.warn`s (no callback at all) when the user is already authenticated;
`onError` also fires for recoverable in-modal errors (bad OTP) while the modal stays open — only
`exited_auth_flow` is terminal. (2) §4.4 / §6.1 — with the package's `treeshake: true`, tsup's
rollup pass strips module-level `'use client'` from every emitted entry, so the directive must be
re-added by a post-build step; the main entry already ships without it today. (3) §3.1 — wagmi's
`reconnect()` does not catch `isAuthorized()`: a throw there rejects the loop and leaves the
module-level `isReconnecting` flag stuck for the page lifetime, so the connector's `isAuthorized`
must be total. Details in `process.md` § F6.


Synthesized 2026-09-18 from six research agents (privy-wagmi, privy-react-auth, custom-connector, packaging-supply-chain, security-custody, ssr-precedents) plus the verified repo facts in `repo-facts.md`. Research was performed 2026-09-17 (some registry reads spilled into 09-18 UTC). Versions read: `@privy-io/react-auth` 3.43.0 (latest, 2026-09-15) with types from 3.43.0 and dist from 3.39.0/3.40.0; `@privy-io/wagmi` 4.0.17 (2026-08-31); `@privy-io/js-sdk-core` 0.76.0; wagmi 2.16.9 / `@wagmi/core` 2.20.3 / `@wagmi/connectors` 5.9.9 as installed in the repo. Privy ships roughly weekly, so re-check anything version-bound at PR time.

Confidence labels: **verified** = read in a primary source (Privy docs page, published package dist/types/package.json, registry document, wagmi source, or a local experiment); **likely** = secondary source or inference from verified facts; **unverified** = asserted by an agent without a primary source.

Raw artifacts are under `scratchpad/gh-456/` (de-minified `@privy-io/wagmi` in `privy-wagmi-4.0.17/`, Privy types in `privy-types/`, doc pages in `privy-docs/` and `*.md`, resolve/bundle experiments in `resolve-*/`, `tsexp/`, `viteexp/`, `wpexp/`, `knipexp/`).

---

## 1. Privy API facts we can rely on (verified only)

### 1.1 Packages and versions

| Fact | Source |
|---|---|
| `@privy-io/react-auth` latest 3.43.0 (2026-09-15T18:19Z). 3.39.0 (08-31), 3.40.0 (09-03T16:33Z), 3.41.0/3.42.0 (09-09). Apache-2.0, ~6.99 MB unpacked / 837 files, `type: commonjs` with dual CJS/ESM, sub-paths `./ui`, `./cards`, `./solana`, `./extended-chains`, `./smart-wallets`, `./hooks`. | https://registry.npmjs.org/@privy-io/react-auth |
| `@privy-io/react-auth` 3.39–3.43 declare `viem: "2.56.0"` as an **exact regular dependency**, plus `zustand ^5`, `@walletconnect/ethereum-provider 2.22.4`, `@coinbase/wallet-sdk 4.3.2`, `mipd`, `styled-components ^6`, `jose ^4.15.5`, `x402`; peers `react`/`react-dom` `^18 \|\| ^19` plus optional Solana peers. No peer on wagmi, viem or react-query. | https://cdn.jsdelivr.net/npm/@privy-io/react-auth@3.39.0/package.json |
| `@privy-io/wagmi` latest 4.0.17 (2026-08-31). ESM-only, no dependencies, peers `@privy-io/react-auth ^3`, `react >=18`, `viem 2.56.0` (**exact**), `wagmi >=2`. No `license` field in package.json (LICENSE file is Apache-2.0). No `repository` field; `github.com/privy-io/wagmi` is 404; source must be read from the npm dist. | https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/package.json, https://api.github.com/repos/privy-io/wagmi |
| The `@privy-io/wagmi` viem peer has been an exact pin since 4.0.3 (2026-03-19) and moves every release (4.0.14→2.52.0, 4.0.15→2.55.5, 4.0.16→2.55.10, 4.0.17→2.56.0), tracking the viem bundled by the matching react-auth. | https://registry.npmjs.org/@privy-io/wagmi |
| Privy React SDK requires React 18+ and TypeScript 5+. | https://docs.privy.io/basics/react/installation |

### 1.2 Provider and config (`PrivyProvider`, `PrivyClientConfig`)

Types read from `@privy-io/react-auth@3.43.0/dist/dts/index.d.mts` and `types-ChU9ocPQ.d.mts` (https://unpkg.com/@privy-io/react-auth@3.43.0/dist/dts/).

- `PrivyProvider` props: `appId: string` (required), `clientId?: string`, `config?: PrivyClientConfig` ("Values here will override their server-configuration counterparts"), `apiUrl?` (experimental), `children`. `clientId` is optional for the React SDK; app clients carry their own allowed origins (not inherited), cookie domain and session duration. https://docs.privy.io/basics/get-started/dashboard/app-clients
- `config.loginMethods`: array of `'wallet' | 'email' | 'sms' | 'google' | … | 'passkey' | privy:${string}`; cannot be empty; each method must also be enabled in the dashboard; `loginMethodsAndOrder` is deprecated. There is **no `'password'` login method** anywhere in the `LoginMethod` union. Email login is OTP-only. https://docs.privy.io/authentication/user-authentication/login-methods/email
- `config.embeddedWallets.ethereum.createOnLogin`: `'users-without-wallets' | 'all-users' | 'off'` (default `'off'`). Top-level `embeddedWallets.createOnLogin` and `requireUserPasswordOnCreate` were **removed in v3**. https://docs.privy.io/basics/react/advanced/migrating-to-3.0 — note the current wagmi integration page still shows `requireUserPasswordOnCreate: true` in its example (line 181 of the saved page), which is stale.
- **`createOnLogin` fires only for Privy-modal logins**, not headless `loginWithCode` / `useLoginWithOAuth`; headless flows must call `useCreateWallet().createWallet()` (which throws if a wallet already exists). https://docs.privy.io/basics/react/advanced/automatic-wallet-creation
- `config.embeddedWallets.showWalletUIs?: boolean` overrides the dashboard default for signing/tx prompts. https://docs.privy.io/wallets/using-wallets/whitelabel
- `config.appearance` (`theme`, `accentColor`, `logo`, `walletList`, `walletChainType`), `config.walletConnectCloudProjectId?`, and `config.legal.termsAndConditionsUrl / privacyPolicyUrl` (modal footer) all exist in the types.
- `config.supportedChains?: Chain[]` / `config.defaultChain?: Chain` take viem chain objects (incl. `defineChain`). PrivyProvider throws if `supportedChains` is `[]` or `defaultChain` is not in it; embedded-wallet `sendTransaction`/`switchChain` outside the list throws. Privy's default list lacks Sonic 146, HyperEVM 999, Kaia, Hedera, LightLink, Redbelly and Robinhood 4663, so the SDK must pass its full wagmi chain list. RPC: Privy's `*.rpc.privy.systems` for some chains, else the chain's viem default; override via `addRpcUrlOverrideToChain` from `@privy-io/chains`. https://docs.privy.io/basics/react/advanced/configuring-evm-networks

### 1.3 Hooks

- `usePrivy()` → `{ ready, authenticated, user, login, logout, … }`; every read must be gated on `ready`. https://docs.privy.io/basics/react/setup
- `useLogin(callbacks?)` → `login(options?: LoginModalOptions) => void` (**no promise**); completion only via `onComplete({ user, isNewUser, wasAlreadyAuthenticated, loginMethod, loginAccount })` / `onError`. If already authenticated at mount, `onComplete` fires immediately with `wasAlreadyAuthenticated: true`. `LoginModalOptions = { loginMethods?, prefill?, disableSignup?, … }`. https://docs.privy.io/authentication/user-authentication/ui-component
- `useLoginWithEmail(callbacks?)` → `sendCode({ email, disableSignup? })`, `loginWithCode({ code })` (max 5 attempts per OTP), `state: OtpFlowState` (`initial | error | sending-code | awaiting-code-input | submitting-code | done`). Marked `@experimental` in the 3.43.0 types although documented as the standard whitelabel flow.
- `useLogout()` → `logout(): Promise<void>`.
- `useWallets()` → `{ wallets: ConnectedWallet[], ready }`; `ready` is false until Privy has settled the wallet set (external via EIP-6963 + WalletConnect, embedded by loading the Privy iframe). `ConnectedWallet`: `address`, `chainId` (CAIP-2 `'eip155:N'`), `walletClientType` (`'privy'` = embedded), `connectorType` (`'embedded'`), `meta { name, id, icon }`, `getEthereumProvider(): Promise<EIP1193Provider>` (Privy's own `{ request, on, removeListener }` interface), `switchChain(id)` ("will not update any existing provider instances, re-request `wallet.getEthereumProvider`"), `sign(message)`. Helper `getEmbeddedConnectedWallet(wallets)` is exported. https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet
- `useCreateWallet()` → `createWallet()`; no UI by default; errors if a wallet already exists. https://docs.privy.io/wallets/wallets/create/create-a-wallet
- `useSetWalletRecovery()` → `setWalletRecovery(o?: {})` opens a Privy modal offering the dashboard-enabled factors; `onSuccess({ method: 'user-passcode' | 'google-drive' | 'icloud' })`. The React SDK cannot pre-select the password method; `useSetWalletPassword` was removed in v3. The only headless recovery is `useRecoverEmbeddedWallet().recover({ recoveryMethod: 'recovery-encryption-key' })`. https://docs.privy.io/wallets/advanced-topics/new-devices/enroll

### 1.4 Embedded provider behaviour (from `@privy-io/js-sdk-core@0.76.0` dist)

- `getEthereumProvider` throws `"Embedded wallet proxy not initialized"` / `"User must be logged in to create an embedded wallet"` before login → a connector's `getProvider()` cannot return the real provider before authentication. https://unpkg.com/@privy-io/js-sdk-core@0.76.0/dist/esm/index.mjs
- `wallet_switchEthereumChain` is local state: rebuilds the viem client for the target chain and emits `chainChanged`; throws `connector_error` code 4901 `"Unsupported chainId <id>"` if the id is not in the provider's chains array. No `wallet_addEthereumChain` handling. `eth_sendTransaction` with `tx.chainId` switches implicitly.
- `eth_accounts` / `eth_requestAccounts` return `[address]` locally; signing methods go through the iframe.

### 1.5 Wallet identity and scoping

- Wallet entropy is 128-bit CSPRNG generated at creation (in the TEE); the address is **not** derived from the email. An email can be linked to only one Privy user per app. Deleting a user soft-deletes the wallet; re-login yields a new DID and address. https://docs.privy.io/security/wallet-infrastructure/architecture, https://docs.privy.io/user-management/users/managing-users/deleting-users
- Cross-app wallet reuse is the gated **Global Wallets** feature. https://docs.privy.io/wallets/global-wallets/overview
- "Same email → same address across apps" is therefore false; **AC3 holds only within one appId** (this composite conclusion is *likely*; no single Privy sentence states "wallets are scoped per app id").

### 1.6 Test accounts

Dashboard toggle "Enable test accounts" yields `test-XXXX@privy.io` / OTP `XXXXXX`; dev-app rate limit 10 req/10 s; `getTestAccessToken()` in `@privy-io/node`. `@privy-io/testing` is not published (registry 404). https://docs.privy.io/recipes/using-test-accounts

---

## 2. How `@privy-io/wagmi` works internally, and what it means for an SDK that owns its wagmi config

All claims here are **verified** from the 4.0.17 dist (de-minified transcription at `privy-wagmi-4.0.17/README-deminified.md`) and `@wagmi/core` 2.20.3 source in `node_modules`.

### 2.1 What the package does

- `createConfig(args)` = wagmi `createConfig({ ssr: true, ...args, connectors: args.connectors?.filter(c => c.type === 'mock'), multiInjectedProviderDiscovery: false })`. It **drops every non-mock connector** the caller passes (the SDK's `walletConnect()` would vanish) and **disables EIP-6963 discovery**. `storage`, `transports`, `chains` pass through unchanged. https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/dist/esm/createConfig.mjs
- `WagmiProvider` renders wagmi's `WagmiProvider` with `reconnectOnMount: false` (props spread after, so technically overridable) wrapping `PrivyWagmiConnector`, whose only job is `useSyncPrivyWallets()`. https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/dist/esm/WagmiProvider.mjs
- `useSyncPrivyWallets` (not a `createConnector`): for each Privy `ConnectedWallet` it awaits `getEthereumProvider()`, wraps it in wagmi's built-in `injected({ target: { provider, id, name, icon } })`, registers it with `config._internal.connectors.setup()` and **replaces the whole list** via `config._internal.connectors.setState(list)` (empty when Privy has no wallets). It calls wagmi `reconnect()` itself once `useWallets().ready`, skipping if `recentConnectorId` has a persisted `<id>.disconnected` flag; the `useLogin`/`useConnectWallet`/`useConnectOrCreateWallet` callbacks clear that flag, set `recentConnectorId` and call `reconnect()`. https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/dist/esm/useSyncPrivyWallets.mjs
- Connector ids: embedded wallet → `io.privy.wallet.<address>`; external wallets → `wallet.meta.id` (rdns). https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/dist/esm/toWalletConnectorId.mjs
- `useSetActiveWallet(wallet)` finds the connector by id, removes `<id>.disconnected`, then `switchAccount` if already connected else `connect`. `useEmbeddedSmartAccountConnector` (experimental) searches for id exactly `'io.privy.wallet'`, which cannot match the ids the same package produces (irrelevant to V1).
- `index.mjs` statically imports `@privy-io/react-auth`; any static import of `@privy-io/wagmi` pulls the whole Privy runtime.
- Docs (verbatim): createConfig "allows Privy to drive wagmi's connectors state"; WagmiProvider "ensures that the `reconnectOnMount` prop is set to false, which is required for handling the embedded wallet. Wallets will still be automatically reconnected on mount"; "Privy does not currently support programmatically disconnecting a wallet via wagmi's `useDisconnect` hook. This hook 'shims' a disconnection". https://docs.privy.io/wallets/connectors/ethereum/integrations/wagmi

### 2.2 Add vs replace — the decisive fact

`@privy-io/wagmi` **replaces**, never adds: statically (connector filter + mipd off) and at runtime (`setState(list)` on every change of Privy's `wallets`). wagmi's `walletConnect()`, `injected()` and EIP-6963 connectors do not survive; external wallets appear in wagmi only after being connected through Privy's own flow (Privy runs its own EIP-6963 + WalletConnect discovery). All four agents that read the source agree: the vendor package is structurally incompatible with "Email (Privy)" sitting beside MetaMask/Hana/WalletConnect in the SDK's existing wagmi list (**verified** mechanism; the judgement also rests on `repo-facts.md` §EvmProvider).

### 2.3 `reconnectOnMount`

- Docs give no mechanism beyond "required for handling the embedded wallet" (**verified**).
- From `@wagmi/core` 2.20.3 `hydrate.ts` (**verified**): with `reconnectOnMount=false`, cookie `initialState.connections` is replaced by `new Map()` and status set to `'disconnected'`; `onMount` resets connections again. Reload restore is therefore entirely Privy-session → `useWallets().ready` → Privy's own `reconnect()`; a cookie-hydrated "connected" first paint is impossible for Privy connectors.
- Why `true` would break (**likely**, inferred): Privy's connectors do not exist at mount, so wagmi's mount-time `reconnect()` iterates an empty list and settles `'disconnected'`; a later Privy `reconnect()` can be no-op'd by wagmi's `isReconnecting` guard; hydrated uids would reference connectors never created. Not tested.
- GMX documents a related bug (**verified** in their repo; applicability to wagmi 2.16.9 **unverified**): with wagmi 2.19 and the `ssr: true` that `@privy-io/wagmi` forces, the persist middleware writes empty state back before hydration, wiping `current`; they pre-read `wagmi.store` and pass it as `initialState`. https://github.com/gmx-io/gmx-interface/blob/release/src/lib/wallets/walletConfig.spec.ts

### 2.4 SSR/storage under the vendor package

`ssr`, `storage: createStorage({ storage: cookieStorage })` and `initialState` pass through; Privy's `recentConnectorId` / `<id>.disconnected` keys land in whatever storage wagmi was given, so cookie storage works — with the caveat in §2.3. Privy's official example (`examples/privy-next-wagmi`, 2026-07-15) uses neither cookies nor `initialState`, and its package.json still declares `@privy-io/wagmi ^2.0.0` (**verified**). https://github.com/privy-io/examples/tree/main/examples/privy-next-wagmi

### 2.5 Known issues (third-party, **likely**, mechanism confirmed in code)

- After a wagmi `disconnect()`, `<id>.disconnected` stays set and Privy skips auto-reconnect on every future visit until a Privy connect/login callback clears it (blue-agent PR 412, 2026-09-06, on 4.0.16). https://github.com/madebyshun/blue-agent/pull/412
- sushiswap replaced `@privy-io/wagmi` with a standard connector + provider bridge that lazy-loads Privy (merged 2026-09-04). https://github.com/sushi-labs/sushiswap/pull/2267
- react-auth changelog 1.92.2 "Fix infinite reconnecting bug in @privy-io/wagmi" (summarised fetch). No relevant issues exist on Privy's public repos (`wagmi-demo` archived 2026-01-07) (**verified**).

### 2.6 What the vendor package implicitly validates for an ADD design

Wrapping the embedded wallet's EIP-1193 provider in wagmi's `injected({ target })` and registering it via `config._internal.connectors.setup` + `setState(prev => [...prev, c])` is exactly what Privy itself does, so the technique is proven — but `_internal` is annotated "Not part of versioned API, proceed with caution. @internal" in `@wagmi/core` (**verified**). Privy, Dynamic and Web3Auth all depend on it in production.

---

## 3. The custom-connector alternative

### 3.1 wagmi contract (**verified**, `@wagmi/core` 2.20.3 `createConnector.ts`, `reconnect.ts`, `connect.ts`)

- Required: `id`, `name`, `type`, `connect`, `disconnect`, `getAccounts`, `getChainId`, `getProvider`, `isAuthorized`, `onAccountsChanged`, `onChainChanged`, `onDisconnect`; optional `setup`, `switchChain`, `getClient`, `icon`, `rdns`. Events: `change`, `connect`, `disconnect`, `error`, `message`. Addresses checksummed via viem `getAddress`.
- `reconnect()`: sorts by `recentConnectorId` → already-connected → others, then per connector `getProvider().catch(() => undefined)` (skip if undefined), `isAuthorized()` (skip if false), `connect({ isReconnecting: true })`; first success becomes `current`; a module-level `isReconnecting` flag no-ops concurrent calls. **Implication:** `getProvider()` must return a stable object before Privy is loaded (a deferred provider), and `isAuthorized()` must be answerable from storage.
- `connect()` writes `recentConnectorId`; throws `ConnectorAlreadyConnectedError` if already current (EvmActions swallows this per repo-facts).
- `config._internal.connectors.{setup,setState,subscribe}` exist and `useConnectors()` subscribes to them, so a dynamically added connector reaches `EvmHydrator`, but `_internal` is `@internal`. Static registration in `createWagmiConfig`'s `connectors` array (Sushi) avoids it, and `EvmProvider` knows `config.EVM.privy` at config-build time (config frozen on first render, repo-facts).

### 3.2 Lifecycle bridge options

Privy's react-auth is not imperative: `login()` returns void, completion arrives via hook callbacks, and Privy hooks throw outside `PrivyProvider`. Options, with prior art:

1. **Framework-free runtime store + lazily mounted React host** (sushiswap, **verified** at commit 7fbb578): `privyEvmConnector()` (id `'io.privy.wallet'`, name `'Email'`, type `'privy'`) placed first in the static `createConfig({ connectors, storage, ssr: true })`; a deferred EIP-1193 provider keeping one identity while the host swaps the real provider behind it (requests are never queued while disconnected); a `PrivyRuntime` host inside `PrivyProvider` that publishes `{ authenticated, evmWallet, walletsReady, operations }` and resolves pending promises from `useLogin`/`useConnectOrCreateWallet` callbacks; `connect()` waits on the store with timeouts (60 s connect, 30 s reconnect; interactive OTP phases only cancellable); `isAuthorized()` reads its own `io.privy.wallet.connected`/`.disconnected` flags; `disconnect()` sets the shim without Privy logout; Privy logout → `emit('disconnect')`; the runtime loads only on request or when `hasStoredPrivySession()`. 22 vitest cases with `@wagmi/core` + `mock` connector. https://github.com/sushi-labs/sushiswap/blob/7fbb578ceb713e2e15ad8540ab5f8b84845cdaff/apps/web/src/lib/wallet/privy/privy-evm-connector.ts
2. **Module-level refs + sync hook** (pinto-org/interface, **verified**): connector reads `getEmbeddedWallet()`; `usePrivySync` updates refs from `useWallets()` and calls `connectAsync`; `disconnect()` = Privy logout; `isAuthorized()` = `!!embeddedWallet`, so cold-load reconnect depends on the hook. https://github.com/pinto-org/interface/blob/60f611d5bd5b6b700fa0122277c7c4e7247d0524/src/utils/wagmi/connectors/privy.ts
3. **Two WagmiProviders + bridge connector** (show-karma/gap-app-v2, **verified**): still pulls `@privy-io/wagmi`; notes `wallet.switchChain` can fail with "Unable to determine current chainId." https://github.com/show-karma/gap-app-v2/blob/e8e348614753949c11689984767184c03fe0d271/utilities/wagmi/privy-bridge-connector.ts
4. **Imperative SDK** (`@privy-io/js-sdk-core`, **verified**): exists, but the app must mount the iframe and wire postMessage itself, and Privy says "Please do not attempt to use this library without first reaching out to the Privy team". https://docs.privy.io/recipes/core-js
5. **Privy's own plain connector** (`@privy-io/cross-app-connect` 0.6.3, **verified**): a real `createConnector`, but only for gated Global Wallets, popup-based on Privy's domain, viem 2.56.0 peer. https://unpkg.com/@privy-io/cross-app-connect@0.6.3/dist/esm/rainbow-kit.mjs

Other ecosystems (**verified** from dist): Coinbase, Magic and thirdweb log in inside `connect()` because their SDKs are imperative; Dynamic and Web3Auth do what Privy does (React sidecar + `_internal.connectors`, `reconnectOnMount: false`).

### 3.3 Things the connector must handle (**verified** unless noted)

- Chain support: mirror the SDK's 14 wagmi chains (including `defineChain`'d hyper 999 and robinhood 4663) into `supportedChains`, or switching throws 4901. Whether embedded-wallet sends actually work on Sonic/Kaia/Hedera/LightLink/Redbelly/HyperEVM/Robinhood is **unverified**.
- Disconnect: the embedded provider emits only `chainChanged` (grep of the provider class body; **likely**); no `disconnect`/`accountsChanged` on logout, so the host must translate `authenticated → false` into `emit('disconnect')`.
- Wallet creation for headless OTP: call `createWallet()` after login (see §1.2).
- `ConnectedWallet.switchChain` vs `wallet_switchEthereumChain` on the provider: Sushi does both; which path updates `useWallets().chainId` is **unverified**.

Feasibility: high, with production precedent; cost is a few hundred lines of lifecycle code plus tests, and two product decisions (disconnect semantics; a "connecting" state while the Privy modal is open, same caveat the docs already give for WalletConnect).

---

## 4. Packaging

### 4.1 Versions eligible under the 14-day cooldown (`minimumReleaseAge: 20160`, confirmed in `pnpm-workspace.yaml` line 7)

| Package | Eligible now (2026-09-18) | Not yet |
|---|---|---|
| `@privy-io/react-auth` | 3.39.0 (08-31), **3.40.0** (09-03T16:33Z, eligible since 09-17T16:33Z) | 3.41.0/3.42.0 until 09-23; 3.43.0 until 09-29 |
| `@privy-io/wagmi` | 4.0.17 (08-31) | — |
| `@privy-io/cross-app-connect` | 0.6.3 (08-31) | — |

The privy-wagmi agent's "3.40.0 on the boundary" and the packaging agent's "eligible from 09-17T16:33Z" are the same fact at different hours; as of 09-18 it is eligible. The packaging agent's gated resolve (pnpm 10.32.1 at ~09-17T17:33Z) resolved 3.40.0 and confirmed none of the 113 new pkg@ver was younger than 14 d, so no silent `minimumReleaseAgeStrict=false` fallback occurred (**verified**). Privy ships weekly, so the repo's exact devDependency will always trail `latest` by 2–3 minors; the gate applies to what the SDK repo installs, not to partner apps.

### 4.2 Peer ranges vs the catalog (catalog confirmed: viem 2.29.2, wagmi 2.16.9, react 19.1.1, react-query 5.87.4)

- react-auth peers (`react ^18 || ^19`) are satisfied; no react-auth peer on wagmi/viem/react-query (**verified**).
- `@privy-io/wagmi`'s exact `viem 2.56.0` peer is **not** satisfied → pnpm prints `✕ unmet peer viem@2.56.0: found 2.29.2` as a WARN (strictPeerDependencies defaults false) (**verified** in the scratch resolve); it never imports viem at runtime, so the mismatch is type-level.
- Because react-auth hard-depends on viem 2.56.0, a second viem copy is unavoidable. The lockfile already carries six viem versions (confirmed), so the pattern is not new; Privy adds 2.56.0 plus a second WalletConnect stack (2.22.4 beside wagmi's 2.21.x), `zustand` 5 beside the SDK's 4.5.2, and `x402` (peers on wagmi `^2.15.6`). react-query stays single-copy (**verified**).
- **Hoisting hazard (verified with npm):** `@privy-io/js-sdk-core` imports `tempoModerato` from `viem/chains` (viem ≥2.44.0). With npm hoisting viem 2.29.2 to the top, importing react-auth throws `SyntaxError: … does not provide an export named 'tempoModerato'`; strict npm ERESOLVEs on the `@privy-io/wagmi` peer. With viem 2.56.0 at top level everything installs and wagmi 2.16.9 accepts it (peer `2.x`). Under pnpm's isolated layout js-sdk-core should resolve the nested 2.56.0 (**likely**, not run). Partner apps on npm/yarn hoisting are the exposed case.

### 4.3 Supply-chain gates (**verified**, pnpm 10.32.1 in scratch)

- `blockExoticSubdeps`: pass. Neither Privy package is in the lockfile today (confirmed).
- `trustPolicy: no-downgrade`: **fails twice** — `jose@4.15.9` (react-auth dep; unattested 2024-07-03 after jose 5.2.0 carried provenance, same maintainer panva) and `ua-parser-js@1.0.41` (via `react-device-detect`; unattested 2025-08-19 after 2.0.0 had provenance, same maintainer faisalman). Both fit the existing "Legacy-line backports published after the current major had moved to provenance" category in `trustPolicyExclude` (confirmed at `pnpm-workspace.yaml` lines 14–25). With those two exact entries the tree resolves.
- Delta vs current lockfile: +113 pkg@ver / +53 new names (`@privy-io/*` ×12, styled-components, libphonenumber-js, x402, @base-ui/react, react-aria, pino-pretty, @stripe/*, hcaptcha/turnstile, …); list at `privy-delta-vs-repo.txt`.
- OSV: 0 advisories on the delta once the repo's `ws@8: 8.21.3` override applies (without it two `ws` GHSAs); none on either Privy package.

### 4.4 Optional-peer mechanics (**verified** by experiment unless noted)

- tsup 8.5.0 auto-externalizes peers; with Privy as an optional peer, dist keeps `await import('@privy-io/react-auth')` verbatim with zero Privy code. Unlisted → tsup tries to bundle it and fails on `@solana-program/system`.
- `import type` is **retained in .d.ts**; a consumer without Privy passes with `skipLibCheck: true`, gets TS2307 with `false`. Annotate public return types explicitly (tsup dts emitted TS2742/TS4058 on leaked `@privy-io/wagmi` types).
- attw `--pack --profile esm-only` passes (external imports not analysed). knip 5.30.5 reports a dynamically imported optional peer as "Referenced optional peerDependencies" (exit 1) → needs `rules.optionalPeerDependencies: "warn"` in `wallet-sdk-react/knip.json`.
- **Decisive bundler fact:** a string-literal `import('@privy-io/react-auth')` from the SDK's **main entry** breaks non-Privy partners on webpack 5 ("Module not found") unless they add `externals`; Vite 5.4/7 tolerate it only via a `peerDependenciesMeta.optional` stub that throws when executed. Turbopack **not tested** (Privy says externals can be skipped).
- Cleanest shape (**likely**): a sub-path entry `@sodax/wallet-sdk-react/privy` that statically imports Privy (external optional peer); the main entry then has zero Privy references. Repo precedent: `./xchains/*` sub-paths (exports map confirmed at package.json lines 35–43; tsup glob, typesVersions, knip entry, `verify-dist-exports.mjs`) and `@sodax/libs`' optional peer `libsodium-wrappers-sumo` (confirmed, libs/package.json line 96). A separate package is heavier: `release.mjs` requires aligned versions and hard-coded lists in `bump-versions.sh` / `sdks-publish.yml` (**verified**). Either way the docs-drift and AI-drift gates require README/docs and `packages/skills` updates in the same PR.

### 4.5 Bundle, polyfills, CSP (**verified**)

- esbuild (browser, minified, ESM splitting): wagmi-only 3.99 MB / 1.19 MB gz; + Privy 8.05 MB / 2.33 MB gz → **+4.06 MB min / +1.15 MB gz** across mostly lazy chunks (react-auth 1.14 MB, duplicate WalletConnect ~0.6 MB, second viem 464 KB, phosphor icons 169 KB, libphonenumber 161 KB). Entry chunks stay ~30–40 KB because react-auth is code-split (196 chunks, `sideEffects: false`). Partner-visible number in `apps/wallet-modal-example` not measured.
- Polyfills: Privy's docs still recommend `vite-plugin-node-polyfills` (Coinbase SDK "process is not defined"); the repo's Vite apps already ship one. Next.js-with-webpack users must add Privy's optional Solana peers to `config.externals`; Turbopack does not (Privy statement). No `'use client'` in react-auth's dist; a consumer-side wrapper is required for App Router.
- CSP: `script-src 'self' https://challenges.cloudflare.com; frame-src/child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org (+ challenges.cloudflare.com); connect-src 'self' https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com; style-src 'unsafe-inline'`. With a verified cookie domain the iframe origin becomes `https://privy.<your-domain>`. "Whenever upgrading the Privy SDK, always test your CSP again." https://docs.privy.io/security/implementation-guide/content-security-policy

---

## 5. Security, custody and ops facts, and what the docs must say

### 5.1 Architecture (**verified**)

- Default execution is **TEE** (AWS Nitro Enclaves): 128-bit CSPRNG entropy generated in the enclave, Shamir-split 2-of-2 into an enclave share and an auth share (held by Privy, released only against a valid user credential). No device share; the key exists only transiently in enclave memory; Privy cannot reconstruct it unilaterally. https://docs.privy.io/security/wallet-infrastructure/architecture, https://docs.privy.io/security/security-faqs
- On-device execution (device share + auth share + recovery share secured by password / iCloud / Google Drive) still exists but "is an advanced configuration. Please reach out to enable this setting." Migration on-device → TEE is one-way and disables user-managed recovery. https://docs.privy.io/security/wallet-infrastructure/advanced/user-device, https://docs.privy.io/recipes/tee-wallet-migration-guide
- **Consequence for the issue's premise ("password = wallet recovery factor"):** the password/cloud recovery factor exists only for on-device apps. For TEE apps, "your users can access their accounts on other devices using their login method." https://docs.privy.io/wallets/advanced-topics/new-devices/cloud-recovery — Privy "do[es] not support regular password-based verification" at all. https://docs.privy.io/security/authentication/user-authentication — The TEE-era equivalent gate is **wallet MFA** (passkey/TOTP/SMS; 15-minute cache; gates signing, export, new-device recovery, password changes). https://docs.privy.io/authentication/user-authentication/mfa/verify/overview
- The user's Privy session is the effective root of trust for a TEE wallet ("Account access is wallet access"); Privy's checklist recommends MFA for any app using email OTP as primary auth. https://docs.privy.io/security/implementation-guide/security-checklist

### 5.2 Export, deletion, sessions (**verified**)

- Key export is available to every user by default and cannot be disabled client-side: "users can send transactions or export their keys using their access token with the Privy API, even if an application does not implement Privy's `exportWallet` method"; only a 2-of-2 key quorum (user + app authorization key) or a DENY policy restricts it. EVM export format is hex. https://docs.privy.io/wallets/wallets/export
- Deleting a user soft-deletes the wallet; re-login gives a new DID and address; recovery has "no guarantee". https://docs.privy.io/user-management/users/managing-users/deleting-users
- Tokens: access = ES256 JWT, 1 h default, `aud = appId`; refresh = opaque, 30 d, single-use, rotated. Default storage is localStorage (`privy:token`, `privy:refresh_token`, prefixed `privy:<clientId>:…` when a clientId is set — confirmed in js-sdk-core dist); HttpOnly cookies require a verified production base domain and lock the appId to that domain. https://docs.privy.io/authentication/user-authentication/tokens, https://docs.privy.io/recipes/react/cookies
- XSS on a partner page (**likely**, composite of verified facts): an attacker holding the localStorage tokens can drive the iframe/API, request signatures, and — absent wallet MFA or a 2-of-2 quorum — export the key via REST. Browser extensions can bypass CSP. Mitigations Privy names: HttpOnly cookies, strict CSP, MFA, token revocation/kill switches.
- Allowed origins are enforced via `frame-ancestors` and in-code checks only once configured ("permissive default to bootstrap"); wildcards like `https://*.vercel.app` are refused; https required except localhost. https://docs.privy.io/recipes/dashboard/allowed-domains

### 5.3 Availability, lock-in, pricing, compliance

- Every signature is a round trip to Privy's API + TEE, so no signing while Privy is down; Developer ToS disclaims uninterrupted service; Enterprise adds "Premium SLAs" (**likely**; ToS/pricing text via extraction). https://status.privy.io
- Exit path = key export (standard secp256k1); no documented Privy-to-Privy app migration; cross-app reuse = gated Global Wallets (**verified**). https://docs.privy.io/wallets/global-wallets/overview
- Pricing (page dated 2026-09-16, **verified**): Free 0–499 MAU; Core $299/mo 500–2,499; Scale $499/mo 2,500–9,999; each with 50K signatures/month; beyond 10K MAU or 50K signatures: $2,000 PAYG base + $0.05/MAU + $0.01/signature. A signature = any embedded-wallet signing request. https://privy.io/pricing
- SOC 2 Type II renewed April 2026; Cure53/Zellic/SwordBytes/Doyensec audits; HackerOne; no ISO 27001 claim found; no KYC for embedded wallets (**verified**). https://www.privy.io/security
- Developer ToS (2025-12-16) and User ToS (2025-01-14): self-custodial; developer obtains user consents; Privy "DOES NOT GUARANTEE THAT ANY USER WILL BE ABLE TO RECOVER ANY WALLET" (**likely**; via extraction). Modal shows the developer's T&C/privacy URLs plus a "Protected by Privy" footer (**verified**). https://docs.privy.io/recipes/dashboard/customization

### 5.4 App scoping trade-off (**likely**, inference from verified facts)

- **Partner-owned appId:** partner controls users, allowed origins, cookies, MFA/session policy, legal URLs and billing; addresses differ from any SODAX-app Privy wallet.
- **SODAX-provided appId:** one wallet across integrations, but SODAX must allow-list every partner origin (one app client per partner domain if cookies are wanted), pay all MAU/signature fees, hold the app secret, and every partner site shares one trust boundary (any allowed origin can log users in; SODAX admins can delete users / see emails).

### 5.5 What the SDK docs must say

1. `EVM.privy` is opt-in; the partner supplies its **own** `appId` (+ optional `clientId`) and owns the Privy dashboard: allowed origins, MFA, session length, legal URLs, billing (pending the §7 product decision).
2. Same email = same address **only within that appId**.
3. Wallets are 2-of-2 TEE-sharded and non-custodial; Privy cannot sign alone, but the Privy login session is the root of trust → recommend wallet MFA (passkey/TOTP) and HttpOnly cookies in production.
4. **There is no password.** Recovery = the login method (email OTP); if the login method is lost the wallet is lost. (Rewrite the issue's "password = recovery factor" line unless the SODAX app is on-device — see §7.)
5. Key export is always available to the user; only a 2-of-2 quorum can restrict it.
6. Required CSP block (§4.5), https-only, allowed origins set before production; re-test CSP after every Privy upgrade.
7. Signing requires Privy online; every signature is metered; no SLA below Enterprise. Never delete Privy users casually (new address on re-login).
8. Privy User ToS/privacy apply to end users; the partner must display its own legal links.
9. A second viem copy (2.56.0) ships; `minimumReleaseAge` blocks Privy versions <14 days old in this repo; `useLoginWithEmail` is `@experimental` in the types.
10. The WalletConnect "render null while `state.kind === 'connecting'`" caveat applies to the Privy connector too (Privy's modal is an HTML `<dialog>`).
11. Dashboard prerequisites: Email login, Ethereum embedded wallets, `createOnLogin` or manual `createWallet`, `showWalletUIs`, allowed origins, test accounts for QA.

---

## 6. SSR/Next.js and multi-wallet behaviour

### 6.1 SSR (**verified**)

- Privy's only App Router guidance: `PrivyProvider` is client-only; wrap it in a `'use client'` Providers component rendered from `RootLayout`; gate on `usePrivy().ready` and `useWallets().ready`. It renders a `<dialog>` and a hidden iframe (`https://auth.privy.io`) even when only headless hooks are used. Whether the iframe mounts for unauthenticated visitors at page load is **unverified**. https://docs.privy.io/basics/troubleshooting/react-frameworks
- Local probe (react-auth 3.39.0 + viem 2.56.0 in Node): `import('@privy-io/react-auth')` succeeds and `renderToString(<PrivyProvider appId>child</PrivyProvider>)` returns exactly the child markup — server-side import/render is safe; the wallet is client-only.
- No Privy doc or example uses wagmi cookie storage / `cookieToInitialState`. Under `@privy-io/wagmi` a cookie-hydrated connected first paint is impossible (§2.3). Under a custom connector with the SDK's own `reconnectOnMount`/`ssr`/`initialState` (repo-facts: `reconnectOnMount` default false, `ssr` default true), wagmi's normal hydrate path applies: a persisted Privy connection hydrates as `'reconnecting'` and resolves only once deferred provider + `isAuthorized()` + `connect({ isReconnecting: true })` complete (**likely**, not run against SODAX code). Privy cookie mode needs separate dev/prod app IDs and a verified base domain. https://docs.privy.io/recipes/react/cookies

### 6.2 Multi-wallet (**verified** for wagmi/Privy mechanics; SODAX mapping **likely**)

- wagmi keeps a `Map` of connections plus one `current`; `connect()` sets `current` to the new connector and writes `recentConnectorId`; `disconnect()` moves `current` to the next remaining connection.
- Under `@privy-io/wagmi`, `current` after Privy's `reconnect()` = first in sort order (`recentConnectorId` → already-connected → `wallets` order); Privy's own example force-calls `setActiveWallet(wallets[0])` when `useAccount` has no address. The "embedded wallet is the default active wallet, otherwise most recent external" statement is **unverified**: seen only in a search-result summary, and the reference page `reference/sdk/wagmi/functions/useSetActiveWallet.md` is a 404 (confirmed from the saved copy).
- SODAX fit (**likely**): `EvmHydrator` derives `xConnections.EVM` from `useAccount()` (`current`), so a plain wagmi Privy connector maps 1:1 onto the single-EVM-connection model. Under the vendor package, Privy's callbacks would call `reconnect()` and rewrite `recentConnectorId` behind `EvmHydrator`'s `userDisconnected`/retry logic, and `EvmActions.disconnect → disconnectAsync` becomes the documented "shim".
- EIP-6963 duplicates: not a concern for the custom connector as long as `loginMethods: ['email']` and no `connectWallet` calls — Privy's own wallet list (and its separate WalletConnect 2.22.4 stack) never appears. The risk exists only if mipd stays on **and** Privy also connects external wallets (a Privy-created `io.metamask` connector sets no `rdns`, so wagmi's dedupe would miss it) (**likely**).

### 6.3 Packaging precedents (**verified**)

Sub-path: Abstract `@abstract-foundation/agw-react/privy` (required peer `@privy-io/react-auth ^2.21.2 || ^3`). Separate package: Orderly `@orderly.network/wallet-connector-privy` (hard dep), Alchemy `@account-kit/privy-integration` (optional peer). Env-gated provider + `useMaybe*` hook wrappers with `vi.mock('@privy-io/react-auth')` tests: Uniswap. Connector tests with `@wagmi/core` + the `mock` connector: Sushi, Karma.

---

## 7. Contradictions and unresolved open questions

### 7.1 Contradictions between agents (resolved where possible)

| Topic | Agent A | Agent B | Resolution |
|---|---|---|---|
| react-auth 3.40.0 eligibility | privy-wagmi: "on the boundary" | packaging: eligible from 2026-09-17T16:33Z; resolve picked 3.40.0 | Same fact, different hour; eligible as of 09-18. Prefer packaging (registry `time` + real resolve). |
| Default active wallet | privy-wagmi: "embedded is default" not on current pages | ssr: "embedded first, else most recent external" (**likely**, search summary) | Reference page is a 404 (confirmed). **Unverified**; only `recentConnectorId` ordering is verifiable in code. |
| pnpm viem resolution | privy-wagmi: **likely** warns and links workspace viem | packaging: **verified** WARN + resolve; ssr: **verified** npm-hoisted import crashes | Consistent: pnpm isolated layout warns and resolves; hoisted npm/yarn crashes. pnpm runtime untested. |
| `requireUserPasswordOnCreate` | ssr: in the current Privy wagmi doc example | react-auth: removed in v3 (types, migration guide) | Doc example is stale (confirmed line 181 of the saved page). Prefer the types. |
| Connector id | security: `'io.privy.wallet'` by grep (**likely**) | privy-wagmi: `io.privy.wallet.<address>` (**verified**) | Prefix vs full id; the verified full id wins. |
| Vite and optional peers | Privy docs: optional packages "must be installed for builds to pass" | packaging experiment: Vite stubs a declared optional peer | Not a contradiction: Privy's note concerns its Solana peers; the stub needs `peerDependenciesMeta.optional`. |
| Password recovery | Issue #456: "password = wallet recovery factor" | react-auth + security: on-device apps only; TEE (default) has none | **Contradiction with the issue, not between agents.** Both cite primary pages. Must be settled before AC/docs. |
| js-sdk-core version | custom-connector: 3.43.0 → 0.76.0 | packaging: 3.40.0 → 0.73.0; ssr: 0.72.1 (3.39.0) | Version-dependent, consistent. Provider behaviour read from 0.76.0, not re-traced through react-auth's bundle (**likely** same path). |

### 7.2 Contradictions with repo facts

- `EvmProvider` leaves `multiInjectedProviderDiscovery` at wagmi's default (true) and always builds its own `connectors` array; `@privy-io/wagmi` would silently discard both. This is the root reason every agent recommends the custom connector.
- `reconnectOnMount` defaults to **false** in the SDK but `apps/demo` and `wallet-modal-example` set it true; a custom connector must work under both, whereas the vendor package assumes false.
- The package has **no** optional peers today and knip ignores `src/providers/**`, but knip still reports an optional peer at package.json level wherever the import lives.
- `walletProviders.EVM` stays undefined until wagmi's `walletClient` resolves; whether it resolves for a Privy-backed connector across two viem copies is untested.
- The context-repo note "MPC providers scope key derivation to the app id" describes derivation; Privy's docs say random entropy bound to the app-scoped user. Same practical outcome (AC3 holds per appId).

### 7.3 Open questions (explicit)

**Product / dashboard (block AC and docs wording)**
1. Is the SODAX Privy app on TEE (default) or on-device execution (Dashboard > Wallets > Advanced)? On TEE the "password = recovery factor" requirement has no mechanism; the equivalent is wallet MFA. What does `useSetWalletRecovery` do on a TEE app?
2. Whose appId do partners use — partner-owned or SODAX-provided? Determines AC3 address scoping, origin allow-listing, billing, trust boundary and who holds the app secret.
3. Disconnect semantics: wagmi `disconnect()` = Privy logout (Pinto) or shim only while the Privy session persists (Sushi)?
4. Modal vs headless: modal `login({ loginMethods: ['email'] })` gets `createOnLogin`; headless `useLoginWithEmail` (`@experimental`) needs manual `createWallet()`. Which is V1 UX?
5. Dashboard prerequisites not verifiable from docs: Email login, Ethereum embedded wallets, MFA/recovery settings, `showWalletUIs` default, allowed origins per partner domain.

**Technical (need a spike, not more reading)**
6. Under pnpm 10.32.1's isolated layout, does `@privy-io/js-sdk-core` resolve react-auth's nested viem 2.56.0 (works) or the workspace 2.29.2 (crashes on `tempoModerato`)? Needs a real `pnpm add` in a scratch worktree from main.
7. Do `checkTs`/attw/tsup dts pass with two viem copies, and does `useWalletClient()` resolve for a Privy-backed connector so `EvmWalletProvider` gets built?
8. Do embedded-wallet `switchChain`/`eth_sendTransaction` work on the SDK's non-default chains (Sonic, HyperEVM, Kaia, Hedera, LightLink, Redbelly, Robinhood) once in `supportedChains`, and via which RPC?
9. Which path (`ConnectedWallet.switchChain` vs provider `wallet_switchEthereumChain`) updates `useWallets().chainId`; does the provider emit anything on logout?
10. Does `useWallets()` include an injected wallet connected only through wagmi, outside Privy's flow?
11. Does forcing `reconnectOnMount={true}` on `@privy-io/wagmi`'s provider actually break, and how? (Only if the vendor package is reconsidered.)
12. Turbopack behaviour for a main-entry dynamic import of a non-installed optional peer (Next 16 example) — moot under the sub-path design.
13. Cold-load latency when Privy was the last connector (wagmi `reconnect()` awaits it first): acceptable timeout, and whether to gate on a stored-session check.
14. Does `PrivyProvider` mount the auth iframe for unauthenticated visitors, and can the SDK defer mounting until "Email (Privy)" is selected or a stored session exists?

**Packaging / policy**
15. Reviewer sign-off on two new `trustPolicyExclude` entries (`jose@4.15.9`, `ua-parser-js@1.0.41`) with per-entry evidence per the workspace comment convention.
16. Peer-range policy: react-auth `^3` with the viem mismatch documented; whether the weekly viem re-pin plus the 14-day cooldown is acceptable; whether the catalog viem should move to ≥2.44 (`tempoModerato` floor) or 2.56.0.
17. Sub-path vs separate package: which gates (docs-drift, AI-drift, knip rule, `verify-dist-exports`, `release.mjs`) each touches — scoped only at the level of §4.4.
18. Partner-visible bundle cost in `apps/wallet-modal-example` (only esbuild numbers exist). `@privy-io/wagmi` lacks a `license` field — harmless today.

**Documentation hygiene**
19. `Wallet.recoveryMethod` union not located verbatim (JSDoc: `'privy' | 'user-passcode'`; Expo docs add cloud/encryption-key values).
20. Privy's architecture page still says "decrypts the encrypted device share" in the TEE signing walkthrough; treat as a doc typo. Changelog quotes came from a summarised fetch — re-read before citing. trust.privy.io could not be read.
