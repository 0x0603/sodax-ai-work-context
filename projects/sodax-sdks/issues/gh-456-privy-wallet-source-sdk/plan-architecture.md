---
type: plan
repo: sodax-sdks
github: 456
updated: 2026-09-18
status: Historical — rev 1 design record
---

# Plan — architecture detail (rev 1 design record; `plan.md` rev 2 wins on every conflict)

**Read `plan.md` first.** This file is the rev-1 long-form design, kept for the parts rev 2 does not
repeat: the full mount trees, the file-by-file table, the 15-row QA matrix (§ 7.4, which rev 2 extends
with rows 16-22) and the packaging/bundle-isolation proof. **Where it disagrees with `plan.md` rev 2,
rev 2 wins** — rev 2 corrected five things this file states as settled: `setWalletRecovery()` throws on
TEE (this file's recovery framing), `supportedChains` needs `privyWalletOverride` decoration, the AC5
"reconnects are never delayed" sentence, the single 300 s `connectTimeoutMs`, and
`loginMethods: ['email']` being enough to keep Privy from standing up its own WalletConnect stack. The
full delta is `plan-revision-2.md`.

## 1. Decision and rationale

**Decision.** Privy enters the SDK as a plain wagmi connector (`id: 'privy'`, `name: 'Email (Privy)'`) that `EvmProvider` appends to the same `connectors` array it already fills with `walletConnect()`, plus a React host (`PrivyProvider` + a bridge) mounted inside `WagmiProvider` around `{children}` but *not* around `EvmHydrator`/`EvmActions`, behind a small error boundary. Both are produced by `privy({ appId })` from a new sub-path `@sodax/wallet-sdk-react/privy`. The main entry and every `./xchains/*` entry contain zero `@privy-io/*` references; `@privy-io/react-auth` is an optional peer; `@privy-io/wagmi` is not used.

**Why not A (vendor `@privy-io/wagmi`).** The vendor package *replaces* wagmi's connector list: its `createConfig` keeps only `type === 'mock'` connectors and sets `multiInjectedProviderDiscovery: false`; `useSyncPrivyWallets` calls `config._internal.connectors.setState(list)` on every `useWallets` change (including `[]` at mount); its `WagmiProvider` forces `reconnectOnMount: false` (**verified**, https://cdn.jsdelivr.net/npm/@privy-io/wagmi@4.0.17/dist/esm/createConfig.mjs, `useSyncPrivyWallets.mjs`, `WagmiProvider.mjs`). Coexistence would need a guard on `@wagmi/core`'s `@internal` surface, change `EvmHydrator` (the single store writer) for every partner, and silently disable `reconnectOnMount` and cookie-hydrated first paint for MetaMask/WC users once Privy is on. The safety judge found four blocking issues; the DX judge added the exact `viem 2.56.0` peer (npm strict resolution fails, digest §4.2).

**Why not C (`EVM.sources`).** Same connector core, but it renames the issue's `EVM.privy` slot to `EVM.sources: [privyEvmSource()]` on a premise B refutes (an opaque object built by a sub-path factory needs no core Privy import), refactors the WalletConnect block in the same PR, accepts bare `CreateConnectorFn`s for callers that do not exist, and keeps a module-level runtime singleton keyed by `appId`. Two judges flagged the rename and the refactor as out of scope; the memory rule "no API surface for hypothetical callers" applies. C's *shape* is kept as an internal type (§3) so a second vendor slot reuses the same wiring later.

**Grafts (judge-agreed).** From C: internal structural `EvmWalletSource` type behind `EVM.privy`; `ctx = { chains, evmConfig }` passed to `createConnector(ctx)` and the Host so `supportedChains` cannot drift from the wagmi chain tuple; `'use client'` assertion in the dist gate; duplicate-host guard per `appId` (with B's per-instance runtime); demo loads the sub-path via a dynamic `import()` gated on an env var. From A: `vi.doMock('@privy-io/react-auth', () => { throw })` test; weekly allowed-to-fail canary against `react-auth@latest`; 300 s login timeout with late-completion handling; extra QA rows (MetaMask-disconnect-then-Privy, logout in another tab, CSP, Next 16 cookie SSR); `apps/demo` and `apps/example-next-js-16` stay Privy-free. From the judges: `isAuthorized()` short-circuits on positive no-session evidence; Host errors cannot unmount Hydrator/Actions; `createConnector`/`Host` marked `@internal`; speculative `recovery` / `keep-session` options dropped; `showWalletUIs` not defaulted.

**Effort.** 8–9 working days plus a 0.5–1 day spike that must complete before the PR opens (§7.1).

---

## 2. Architecture

### 2.1 Components

| Component | Path under `packages/wallet-sdk-react/src` | Imports Privy? | Role |
|---|---|---|---|
| `EvmWalletSource` (internal), `PrivyEvmSource`, `isEvmWalletSource` | `types/config.ts` | no | Opaque slot type for `EVM.privy`; core only calls `createConnector(ctx)` and renders `Host`. |
| `SODAX_EVM_CHAINS` | `xchains/evm/EvmXService.ts` (tuple at lines 99–114 today) | no | The 14-chain tuple, exported from `./xchains/evm`, passed as `ctx.chains`. |
| `EvmProvider` | `providers/evm/EvmProvider.tsx` | no | Pushes `config.privy.createConnector(ctx)` into `connectors`; renders `<EvmSourceHost>` around `{children}`. |
| `EvmSourceHost` | `providers/evm/EvmSourceHost.tsx` (new) | no | Class error boundary: renders `<source.Host ctx>{children}</source.Host>`; on a render error logs once and renders bare `{children}`. |
| `privy()` | `privy/index.tsx` (sub-path entry, `'use client'`) | yes, static | Returns `{ kind: 'privy', id: 'privy', appId, clientId, createConnector, Host }`; one `PrivyRuntime` per call. |
| `PrivyRuntime` | `privy/runtime.ts` | no | Framework-free store: snapshot, `subscribe`, `waitFor(pred, { timeoutMs })`, pending-login deferred, `logout` event. |
| `DeferredEip1193Provider` | `privy/deferredProvider.ts` | no | Stable `{ request, on, removeListener }`; `attach/detach`; rejects `ProviderRpcError(4900)` while detached; re-emits `chainChanged`/`accountsChanged`. |
| `privyConnector` | `privy/privyConnector.ts` | no | wagmi `createConnector` against the runtime interface only. |
| `PrivyHost` + `PrivyBridge` | `privy/PrivyHost.tsx` | yes | `PrivyProvider` with derived config; the bridge is the only place Privy hooks run; publishes into the runtime. (`sessionProbe.ts`, `icon.ts`: storage probe; inline SVG data URI, no trademark.) |

`EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`, `useXWalletStore.ts`, `useWalletModal`, `useEvmSwitchChain`: **unchanged**. Privy is a wagmi connector, so `useConnectors()` wraps it in `EvmXConnector` (id/name/icon from the connector; `isInstalled` true by base default), `useAccount()` drives `xConnections.EVM`, `useWalletClient()` feeds `EvmWalletProvider`, `chainActions.connect('privy')` finds it in `wagmiConfig.connectors` (`EvmActions.tsx:27`), `disconnect` calls `disconnectAsync()` (`:48–59`).

### 2.2 Mount trees

Without `EVM.privy` (today's behaviour; the only new code is one falsy check and a pass-through boundary):

```
<WalletConfigProvider>
  <EvmProvider>
    <QueryClientProvider client={ownQueryClient}>
      <WagmiProvider reconnectOnMount config={createWagmiConfig(chains, { connectors: [walletConnect?] })} initialState>
        <EvmHydrator/> <EvmActions/>
        {children}
```

With `EVM.privy: privy({ appId })`:

```
<WalletConfigProvider>
  <EvmProvider>
    <QueryClientProvider client={ownQueryClient}>
      <WagmiProvider reconnectOnMount config={createWagmiConfig(chains, { connectors: [walletConnect?, privyConnector] })} initialState>
        <EvmHydrator/> <EvmActions/>                 // unchanged; mipd (EIP-6963) stays ON
        <EvmSourceHost source={config.privy} ctx>    // boundary: on Host render error -> bare {children}, console.error once
          <PrivyHost ctx>                            // <PrivyProvider appId clientId config={derived}>
            <PrivyBridge/>                           // hooks -> runtime; renders null
            {children}                               // partners may call usePrivy() here when EVM.privy is set
```

Hydrator/Actions sit above the boundary, so a `PrivyProvider` throw (e.g. rejected `supportedChains`) degrades to "Email (Privy) fails with `PrivyHostNotMountedError`" while MetaMask/WC keep working (safety-judge graft). Children stay inside `PrivyProvider` as in B, so a partner can read `usePrivy().user` without an SDK wrapper; a throw at first mount re-renders children without Privy at no state cost. `SodaxWalletProvider.tsx:1` already carries `'use client'`, satisfying Privy's App Router rule (**verified**, https://docs.privy.io/basics/troubleshooting/react-frameworks). Derived `PrivyProvider` config (keys **verified** in the 3.43.0 types, https://unpkg.com/@privy-io/react-auth@3.43.0/dist/dts/):

```
loginMethods: ['email']                                     // OTP only; no 'password' LoginMethod exists
embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs }   // key omitted when undefined
supportedChains: ctx.chains (one cast at the boundary)      // 14 SDK chains incl. defineChain'd hyper 999 / robinhood 4663
defaultChain: chain whose id === opts.defaultChainId ?? 146 // Sonic
appearance, legal: passthrough
```

### 2.3 Data flow

```
partner config -> SodaxWalletProvider (frozen on first render) -> EvmProvider
  ctx = { chains: SODAX_EVM_CHAINS, evmConfig: config }
  connectors = [walletConnect?, config.privy?.createConnector(ctx)] -> createWagmiConfig -> WagmiProvider
  EvmSourceHost -> PrivyHost -> PrivyBridge --publish--> PrivyRuntime <--waitFor / ops-- privyConnector
wagmi state -> EvmHydrator -> zustand (xConnectorsByChain.EVM, xConnections.EVM, walletProviders.EVM)
            -> useXConnectors / useXAccount / useWalletProvider('EVM') -> @sodax/sdk
```

Runtime snapshot: `{ hostMounted, ready, authenticated, walletsReady, embedded?: { address, chainId, getEthereumProvider, switchChain }, isNewUser?, ops?: { login, logout, createWallet } }`; `ops.login()` returns a promise settled from `useLogin({ onComplete, onError })`.

### 2.4 First login (AC2)

`useXConnect(privyEntry)` → `chainActions.connect('privy')` (`EvmActions.tsx:26`) → `connectAsync({ connector })` → `privyConnector.connect({ chainId, isReconnecting: false })`:

1. `await runtime.waitFor(s => s.hostMounted && s.ready, { timeoutMs: 15_000 })`; host never mounted → `PrivyHostNotMountedError`.
2. `authenticated && embedded` → skip login (returning user, valid session).
3. `authenticated && walletsReady && !embedded` → `ops.createWallet()` (throws if one exists — caught; **verified**, https://docs.privy.io/wallets/wallets/create/create-a-wallet).
4. Otherwise `ops.login()`: the bridge stores a pending deferred and calls `login({ loginMethods: ['email'] })`. Completion arrives only via callbacks: `onComplete` "executes immediately" if already authenticated at mount, else after successful login; `onError` "executes when there's an error during login or when the user exits the login flow" (**verified**, re-read today, https://docs.privy.io/authentication/user-authentication/ui-component). `onComplete` resolves only while an attempt is pending; `onError` rejects with viem `UserRejectedRequestError` so `useWalletModal` reaches `error`; `connectTimeoutMs` (default 300 000) → `TimeoutError`. With modal login, `createOnLogin: 'users-without-wallets'` creates the embedded wallet (**verified**; not for headless flows; no timing guarantee stated, https://docs.privy.io/basics/react/advanced/automatic-wallet-creation).
5. `await runtime.waitFor(s => s.walletsReady && s.embedded, { timeoutMs: 30_000 })`; absent → `ops.createWallet()` and wait again (covers the **unverified** timing of `createOnLogin` vs `onComplete`).
6. `provider = await embedded.getEthereumProvider()` (`Promise<EIP1193Provider>`, **verified**, https://docs.privy.io/wallets/wallets/get-a-wallet/get-connected-wallet); `deferred.attach(provider)`; `accounts = [getAddress(embedded.address)]`; `chainId` from `eth_chainId`; a differing requested `chainId` → `this.switchChain`.
7. `config.storage.setItem('privy.connected', true)` (wagmi storage = the SDK's `cookieStorage` under `persistKey`); return `{ accounts, chainId }`; wagmi writes `recentConnectorId = 'privy'`.
8. wagmi `connected` → `EvmHydrator.tsx:60–66` writes `xConnections.EVM = { xAccount, xConnectorId: 'privy' }`; `useWalletModal`'s `waitForXConnection('EVM', 'privy')` matches. `useWalletClient()` resolves — wagmi builds `createClient({ transport: custom(provider) })` (`@wagmi/core/src/actions/getConnectorClient.ts:141–145`) — and `EvmHydrator.tsx:83–92` builds `EvmWalletProvider` → `walletProviders.EVM` (AC4).

Late completion: if step 4 timed out but Privy later fires `onComplete`, the bridge still publishes `authenticated/embedded`, so the next `connect()` takes branch 2 without a second OTP (unit-tested).

### 2.5 Returning user reload (AC3)

Two existing entry points: `reconnectOnMount: true` → wagmi's mount `reconnect()`; `reconnectOnMount: false` (SDK default, `constants.ts:25`) → `EvmHydrator.tsx:41–48` calls `reconnect()` when `status === 'disconnected'`, persist has hydrated, a persisted `xConnections.EVM` exists and `userDisconnected.EVM` is false.

wagmi `reconnect()` (**verified**, `@wagmi/core/src/actions/reconnect.ts`): status → `'connecting'`/`'reconnecting'`; connectors sorted `recentConnectorId` → connected → others; per connector `getProvider().catch(() => undefined)` (skip if undefined) → `isAuthorized()` (skip if false) → `connect({ isReconnecting: true })`; a module-level `isReconnecting` flag no-ops concurrent calls; the loop is sequential.

- `getProvider()` returns the deferred shell (never throws).
- `isAuthorized()` = `storage.getItem('privy.connected') === true && !noPrivyTraceOnDevice()`. The probe returns `true` only on *positive* evidence: `localStorage` readable with no key starting with `privy:` (js-sdk-core writes `privy:token`, `privy:refresh_token`, `privy:pat`, `privy:id-token`, `privy:active-user`, `privy:saved-users`, prefixed `privy:<clientId>:…` when a `clientId` is set — **verified** in `@privy-io/js-sdk-core@0.76.0/dist/esm/index.mjs`) and no `privy-session=` in `document.cookie`; any exception → `false`. In HttpOnly-cookie mode `privy-token` is not readable from JS (**verified**, https://docs.privy.io/recipes/react/cookies); which traces remain readable there is **unverified** (spike item 5) — if none, the probe is dropped and reconnect relies on Privy's `ready` plus `reconnectTimeoutMs`. The stall the judge feared is bounded anyway: with the flag set but the session expired, Privy still reaches `ready` quickly and "`!authenticated` → throw" fires at once; only a blocked iframe costs the full timeout.
- `connect({ isReconnecting: true })`: wait `hostMounted && ready` (≤ `reconnectTimeoutMs`, default 30 000); `!authenticated` → clear flag, throw (never opens the modal on reload); wait `walletsReady && embedded`; attach; return the same address. Same email = same Privy user = same wallet **within one `appId`** (**likely**, composite: one user per email per app, random entropy bound to the user, cross-app reuse is gated Global Wallets — https://docs.privy.io/security/wallet-infrastructure/architecture, https://docs.privy.io/wallets/global-wallets/overview).
- Failure: flag cleared, wagmi settles `'disconnected'`; because `EvmHydrator.tsx:77–81` set `wasConnectedRef` after hydration, `:67–70` runs `unsetXConnection('EVM')`; the retry effect's extra `reconnect()` is instant since `isAuthorized()` is now false.
- Cookie SSR: under `reconnectOnMount: false` wagmi `hydrate()` drops cookie connections and sets `'disconnected'` for all wallets (**verified**, `@wagmi/core/src/hydrate.ts`) — today's behaviour, then the Hydrator retry reconnects; under `true` the persisted Privy connection hydrates as `'reconnecting'`. `privy()` is SSR-safe; `PrivyProvider` server-renders to its children (**verified**, `renderToString` probe, digest §6.1).

### 2.6 Disconnect

`useXDisconnect` → `EvmActions.disconnect` (store cleared, `markUserDisconnected('EVM')`, `disconnectAsync()`) → `privyConnector.disconnect()`: remove `privy.connected`, `deferred.detach()`, `await ops.logout()` (errors logged). **V1: SODAX disconnect = Privy sign-out** — on a shared device "disconnect" must not leave a signing-capable session; the next connect asks for OTP. Reverse direction: the bridge watches `authenticated` true→false (partner logout, token expiry, another tab) and emits `logout`; the connector, only while attached, detaches and calls `onDisconnect()` → wagmi drops the connection → Hydrator `unsetXConnection('EVM')`. Needed because the embedded provider emits only `chainChanged` (**likely**, grep of the provider class, https://unpkg.com/@privy-io/js-sdk-core@0.76.0/dist/esm/index.mjs).

### 2.7 Chain switch

`useEvmSwitchChain` → wagmi `switchChain` → `privyConnector.switchChain({ chainId })`: chain must be in `config.chains` else `SwitchChainError`; `await embedded.switchChain(chainId)`; re-request `getEthereumProvider()` and re-attach because `switchChain` "will not update any existing provider instances" (**verified**, 3.43.0 types, digest §1.3); `emit('change', { chainId })`. The provider throws `4901 Unsupported chainId` outside `supportedChains` and ignores `wallet_addEthereumChain` (**verified**, js-sdk-core dist), hence the mirrored `ctx.chains`. `useWalletClient()` re-resolves and the Hydrator rebuilds `EvmWalletProvider` with `resolveEvmDefaults(newChainId)` — unchanged code. Whether embedded-wallet **sends** succeed on Sonic/HyperEVM/Kaia/Hedera/LightLink/Redbelly/Robinhood is **unverified** (spike item 6).

### 2.8 Coexistence with injected wallets and WalletConnect (AC5)

`multiInjectedProviderDiscovery` stays at wagmi's default (`EvmXService.ts:98–115` never sets it), so EIP-6963 wallets keep auto-registering; `walletConnect()` stays in the array (`EvmProvider.tsx:35–41`); Privy is appended, never replaces. With `loginMethods: ['email']` and no `connectWallet` call, Privy's own EIP-6963/WalletConnect discovery never registers wagmi connectors (**likely**, digest §6.2). `isAuthorized()` answers from storage, so MetaMask/WC reconnects are never delayed; `xConnections.EVM.xConnectorId` follows wagmi's `current` through normal `connect`/`disconnect`.

---

## 3. Public API (exact TypeScript)

```ts
// ─── packages/wallet-sdk-react/src/types/config.ts (main entry; no Privy types, no Privy imports) ───
import type { ComponentType, ReactNode } from 'react';
import type { Chain } from 'viem';
import type { CreateConnectorFn, State as WagmiState } from 'wagmi';
import type { WalletConnectParameters } from 'wagmi/connectors';

/** Facts a source receives when the wagmi config is built (config is frozen on mount). */
export type EvmWalletSourceContext = {
  /** The SDK's wagmi chain tuple; embedded-wallet vendors must mirror it. */
  readonly chains: readonly [Chain, ...Chain[]];
  readonly evmConfig: Readonly<EvmTypeConfig>;
};

/** @internal Structural contract behind `EVM.privy`; not a public extension point in V1. */
export type EvmWalletSource = {
  readonly kind: string;
  /** Stable wagmi connector id this source contributes (e.g. 'privy'). */
  readonly id: string;
  /** @internal Called once when the wagmi config is built. */
  readonly createConnector: (ctx: EvmWalletSourceContext) => CreateConnectorFn;
  /** @internal Mounted inside <WagmiProvider> around the partner's children, never around Hydrator/Actions. */
  readonly Host?: ComponentType<{ ctx: EvmWalletSourceContext; children?: ReactNode }>;
};

/** Opaque Privy source built by `privy()` from '@sodax/wallet-sdk-react/privy'. */
export type PrivyEvmSource = EvmWalletSource & {
  readonly kind: 'privy';
  readonly id: 'privy';
  readonly appId: string;
  readonly clientId?: string;
};

/** Runtime guard used by EvmProvider — a hand-written `{ appId }` literal is skipped with a console.warn. */
export function isEvmWalletSource(value: unknown): value is EvmWalletSource;

export type EvmAdapterFields = {
  reconnectOnMount?: boolean;
  ssr?: boolean;
  persistKey?: string;
  initialState?: WagmiState;
  walletConnect?: WalletConnectParameters;
  /**
   * Opt-in Privy email login as an EVM wallet source (connector id `privy`, name "Email (Privy)").
   * Build it with `privy()` from '@sodax/wallet-sdk-react/privy'; requires `@privy-io/react-auth` ^3.40.
   * Omit it and no Privy code is loaded.
   */
  privy?: PrivyEvmSource;
};

// ─── packages/wallet-sdk-react/src/privy/index.tsx (sub-path '@sodax/wallet-sdk-react/privy', 'use client') ───
import type { PrivyClientConfig } from '@privy-io/react-auth'; // optional peer; only opt-in partners resolve this d.ts

export const PRIVY_CONNECTOR_ID = 'privy' as const;
export const PRIVY_CONNECTOR_NAME = 'Email (Privy)' as const;

export type PrivyOptions = {
  /** Partner-owned Privy app id. Same email → same address only within this app. */
  appId: string;
  /** Optional Privy app client id (per-domain allowed origins / cookies). */
  clientId?: string;
  /** Initial chain of the embedded wallet; must be one of the SDK's EVM chains. @default 146 (Sonic) */
  defaultChainId?: number;
  /** Show Privy's signing / transaction UI. Omitted → the Privy dashboard setting applies. */
  showWalletUIs?: boolean;
  /** Forwarded to PrivyProvider `config.appearance` / `config.legal`. */
  appearance?: PrivyClientConfig['appearance'];
  legal?: PrivyClientConfig['legal'];
  /** Max wait for the user to finish the email OTP flow. @default 300_000 */
  connectTimeoutMs?: number;
  /** Max wait for Privy to restore a session and load the embedded wallet on reload. @default 30_000 */
  reconnectTimeoutMs?: number;
};

export function privy(options: PrivyOptions): PrivyEvmSource;
export class PrivyHostNotMountedError extends Error {}
export type { PrivyEvmSource, EvmWalletSourceContext } from '../types/config.js';

// ─── Partner usage (package.json additions are listed in §4) ───
// pnpm add @sodax/wallet-sdk-react @privy-io/react-auth
import { SodaxWalletProvider, type SodaxWalletConfig } from '@sodax/wallet-sdk-react';
import { privy } from '@sodax/wallet-sdk-react/privy';

const config: SodaxWalletConfig = {
  EVM: {
    walletConnect: { projectId: WC_PROJECT_ID },          // unchanged, still works (AC5)
    privy: privy({ appId: PRIVY_APP_ID, legal: { termsAndConditionsUrl: '/terms' } }),
    chains: { /* rpcUrl overrides as today */ },
  },
};
// Modal caveat (as for WalletConnect): render nothing while state.kind === 'connecting' && state.connector.id === 'privy'
```

Every exported function on the sub-path carries an explicit return type so tsup's dts build never emits TS2742/TS4058 for an inferred Privy type (**verified** failure mode, digest §4.4).

---

## 4. File-by-file change list

Core (`packages/wallet-sdk-react`):

| Path | Change |
|---|---|
| `src/types/config.ts` | Add `EvmWalletSourceContext`, `EvmWalletSource`, `PrivyEvmSource`, `isEvmWalletSource`; add `privy?: PrivyEvmSource` to `EvmAdapterFields` (line 77 block). |
| `src/index.ts` / `src/types/index.ts` | Types flow through the existing `export * from './types/index.js'` (`index.ts:10`); no runtime Privy reference. |
| `src/xchains/evm/EvmXService.ts`, `src/xchains/evm/index.ts` | Extract lines 99–114 into `export const SODAX_EVM_CHAINS = [mainnet, …, robinhoodChain] as const satisfies readonly [Chain, ...Chain[]]`; `createWagmiConfig` spreads it; export from the sub-path. |
| `src/providers/evm/EvmProvider.tsx` | In the `useMemo` (lines 33–43): `isEvmWalletSource(config.privy) ? connectors.push(config.privy.createConnector(ctx)) : console.warn('[wallet-sdk-react] EVM.privy must be built with privy() from "@sodax/wallet-sdk-react/privy" — skipped.')` (only when `config.privy` is set); add `config.privy` to deps; wrap `{children}` (line 58) in `<EvmSourceHost source ctx>`. |
| `src/providers/evm/EvmSourceHost.tsx` | NEW class boundary: `getDerivedStateFromError` + `componentDidCatch` → `console.error` once; renders `<Host ctx>{children}</Host>`, bare `{children}` on error or without a Host. No Privy strings. |
| `src/providers/evm/EvmProvider.test.tsx` | Extend (existing WagmiProvider-capture pattern): fake source → `createWagmiConfig` receives its connector factory and the Host renders inside the captured `WagmiProvider` with `ctx.chains === SODAX_EVM_CHAINS`; absent → neither; `{ appId: 'x' }` literal → warn + skipped; throwing Host → `console.error` once, Hydrator/Actions/children still mounted; `vi.doMock('@privy-io/react-auth', () => { throw })` never trips without `privy`. |
| `EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts` | NO CHANGE; their tests pass unchanged (the regression proof). |

Sub-path (`src/privy/`): `index.tsx` (entry; `'use client'` first line; validates `appId`; resolves `defaultChainId` against `ctx.chains` inside `createConnector`; one runtime per call), `runtime.ts`, `deferredProvider.ts`, `sessionProbe.ts`, `privyConnector.ts` (`createConnector` — `id 'privy'`, `name 'Email (Privy)'`, `type 'privy'`, `icon`; `setup` subscribes to `logout`; the full wagmi method set per §2.4–2.7; imports only `wagmi`, `viem`, the runtime), `PrivyHost.tsx` (`PrivyProvider` + `PrivyBridge` using `usePrivy`, `useWallets`, `useLogin`, `useLogout`, `useCreateWallet`, `getEmbeddedConnectedWallet`; module-level `Set<appId>` mount guard registered in an effect and released on cleanup so StrictMode passes; a second host for the same `appId` warns and renders children only), `icon.ts`, plus tests `privyConnector.test.ts`, `PrivyHost.test.tsx`, `deferredProvider.test.ts`, `sessionProbe.test.ts`, `index.test.ts`.

Packaging and workspace:

| Path | Change |
|---|---|
| `packages/wallet-sdk-react/package.json` | `exports['./privy']`, `typesVersions['*'].privy`, optional peer `@privy-io/react-auth ^3.40.0` + `peerDependenciesMeta`, devDependency `3.40.0` exact, `build` += `&& node ../../scripts/check-entry-isolation.mjs`. |
| `tsup.config.ts` | `entry` += `'src/privy/index.tsx'`. |
| `knip.json` | `entry` += `"src/privy/index.{ts,tsx}"`; `rules.optionalPeerDependencies: "warn"` (knip 5.30.5 exits 1 on a referenced optional peer — **verified**, digest §4.4). |
| `scripts/check-entry-isolation.mjs` | NEW post-build gate (§5). |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | `trustPolicyExclude` += `"jose@4.15.9"`, `"ua-parser-js@1.0.41"` under the "Legacy-line backports…" comment (line 14), each with a one-line evidence note (**verified** failures, digest §4.3); lockfile +113 pkg@ver / +53 names (`privy-delta-vs-repo.txt` goes in the PR body). |
| `.github/workflows/privy-latest-canary.yml` | NEW weekly `schedule` + `workflow_dispatch` (precedent: `security.yml`), `continue-on-error: true`: throwaway install of `@privy-io/react-auth@latest` with the cooldown overridden for that job only, then `checkTs` + `vitest run src/privy`. |

Docs and skills (docs-drift + AI-drift gates):

| Path | Change |
|---|---|
| `docs/WALLET_PRIVY.md` | NEW partner guide: install + optional-peer semantics; dashboard prerequisites (Email login, Ethereum embedded wallets, allowed origins, test accounts, MFA); `privy()` options; OTP behaviour; same address only per `appId`; disconnect = sign-out; reconnect + modal caveat; recovery/MFA reality (no password; TEE default); key export always available; CSP block; second viem copy + npm/yarn hoisting caveat (top-level viem ≥ 2.44); pricing/SLA; tested Privy version. |
| `README.md`, `docs/CONFIGURE_PROVIDER.md` | README: feature bullet after line 14, quick-start comment near line 58, docs-table row after line 109 (absolute GitHub URL; README is the mirrored page → docs-drift). CONFIGURE_PROVIDER: new §"Privy email login (EVM only)" after the WalletConnect section (line 217). |
| `docs/CONNECTORS.md` (line 216), `docs/WALLET_MODAL.md` (caveat at 229–244), `docs/SUB_PATH_EXPORTS.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` (near line 42) | Name `EVM.privy` as a wagmi-side extension point; generalise the "render null while connecting" caveat to `'walletConnect' \|\| 'privy'`; document `./privy` as the only entry referencing `@privy-io/react-auth`; describe the source/host pattern (Hydrator remains the only writer); AGENTS rule: Privy lives only under `src/privy`, core never imports `@privy-io/*`, `EVM.privy` is a wagmi connector source, no `'privy'` branching in modal primitives. |
| `packages/skills/skills/sodax-wallet-sdk-react/privy/SKILL.md`, `…/integration/knowledge/recipes/privy-setup.md`, `.claude/skills/add-wallet-provider/SKILL.md` | NEW granular skill (frontmatter `name: sodax-wallet-sdk-react-privy`, `check-skills.sh` lines 17–20; layout from `walletconnect/SKILL.md`); NEW recipe mirroring `walletconnect-setup.md`, registered in the six files that list it (`SKILL.md`, `walletconnect/SKILL.md`, `knowledge/README.md`, `examples/README.md`, `ai-rules.md`, `recipes/setup.md`); the fixture maps `@sodax/wallet-sdk-react/*` → `src/*/index.js` (`check-ai-imports.sh:119–121`); add-wallet-provider mentions `EVM.privy` beside `EVM.walletConnect`. |

Demo (`apps/wallet-modal-example` only): `src/privy-source.ts` (NEW `loadPrivySource()` — `if (import.meta.env.VITE_PRIVY_APP_ID) { const { privy } = await import('@sodax/wallet-sdk-react/privy'); return privy({ appId }) }`), `src/index.tsx` line 25 (`loadPrivySource().then(source => root.render(<Providers privy={source}>…))`), `providers.tsx` (optional source → `EVM.privy`), devDependency `@privy-io/react-auth 3.40.0`, `.env.example`, and an `App.tsx` panel with sign-message and 0-value `sendTransaction` buttons on `useWalletProvider('EVM')` (AC4 proof on the same `EvmWalletProvider` class `@sodax/sdk` consumes). `apps/demo` and `apps/example-next-js-16`: NO CHANGE — the Privy-free consumer builds (`ci.yml:223`).

---

## 5. Packaging and bundle-isolation proof

**Dependency shape.** `@privy-io/react-auth` is an optional peer `^3.40.0` (precedent `@sodax/libs` → `libsodium-wrappers-sumo`, `packages/libs/package.json:94–98`) and an exact devDependency `3.40.0` — the newest version that clears `minimumReleaseAge: 20160` today (published 2026-09-03T16:33Z; 3.41/3.42 eligible 09-23, 3.43 on 09-29; **verified**, https://registry.npmjs.org/@privy-io/react-auth `time`, gated resolve in `scratchpad/gh-456/resolve-gated/`). react-auth has no peer on wagmi/viem/react-query (**verified**, https://cdn.jsdelivr.net/npm/@privy-io/react-auth@3.39.0/package.json), so the catalog stays put and `pnpm.overrides` keeps react-query single-copy (protects `useWalletClient` from "No QueryClient set"); its exact viem 2.56.0 dependency means a second viem copy for opt-in partners. `@privy-io/wagmi` is not added anywhere.

**Sub-path, not a separate package, not a dynamic import.** `@sodax/wallet-sdk-react/privy` follows the `./xchains/*` precedent (tsup multi-entry with `splitting: true`, exports map, `typesVersions`, knip entry; `verify-dist-exports.mjs` walks every exports path); an explicit `./privy` export is visible in `package.json`. A separate npm package was rejected: `release.mjs`, `bump-versions.sh` and `sdks-publish.yml` carry hard-coded package lists (**verified**, digest §4.4) for no isolation gain. A string-literal `import('@privy-io/react-auth')` in the main entry was rejected because it breaks non-Privy partners on webpack 5 ("Module not found") unless they add `externals`; Vite tolerates it only through the optional-peer stub (**verified** experiments, `scratchpad/gh-456/wpexp/`, `viteexp/`).

**Isolation proof, four layers.**
1. *Static graph gate* — `scripts/check-entry-isolation.mjs`, run by the package `build` after `verify-dist-exports.mjs`: parse `import`/`export … from`/`import()` specifiers from `dist/index.mjs` and `dist/xchains/*/index.mjs`, follow relative chunks, fail if any reached file contains `@privy-io/`. Also assert `dist/privy/index.mjs` exists, starts with `'use client'` (**unverified** that esbuild keeps the directive on a non-main entry; the gate makes it a fact) and contains a bare `@privy-io/react-auth` specifier (proves externalisation).
2. *Source-level gate* — `EvmProvider.test.tsx` with `vi.doMock('@privy-io/react-auth', () => { throw })`.
3. *Consumer builds* — CI builds `apps/demo` (Vite) and `apps/example-next-js-16` (Next 16) without Privy installed (`ci.yml:223`). The demo's default build (no `VITE_PRIVY_APP_ID`) must show `grep -ril privy dist/assets` empty (**likely**: Vite inlines the env constant and Rollup drops the dead `import()` branch; otherwise the network-level proof — no privy chunk request, no `auth.privy.io` traffic — stands and the doc is corrected).
4. *Types* — `import type { PrivyClientConfig }` lives only in `dist/privy/index.d.ts`; the main `index.d.ts` exports the core-declared `PrivyEvmSource`, so a partner without Privy never resolves `@privy-io/*` types even with `skipLibCheck: false`.

**Bundle cost for opt-in partners.** +4.06 MB min / +1.15 MB gz, mostly lazy chunks (**verified**, esbuild measurement, digest §4.5); the demo-app number is measured in the spike.

**Supply chain.** `blockExoticSubdeps` passes; `trustPolicy: no-downgrade` needs exactly `jose@4.15.9` and `ua-parser-js@1.0.41`; OSV shows 0 advisories once the repo's `ws@8: 8.21.3` override applies; dependency-review lists +53 new names for reviewer sign-off (**verified**, digest §4.3).

---

## 6. Gates checklist

| Gate | How it passes |
|---|---|
| `pnpm lint` (biome) | Format only touched files (memory: `pnpm pretty` touches unrelated files on main). |
| `check:circular-deps` (madge) | `src/privy/*` imports `@/types/config.js` and `@/xchains/evm/…`; core never imports `src/privy`. No cycle. |
| `check:knip` | Entry `src/privy/index.{ts,tsx}`; `optionalPeerDependencies: "warn"`; react-auth is devDependency + optional peer, so neither unlisted nor unused. |
| `build:packages` | tsup emits `dist/privy/index.mjs` + `.d.ts`; `verify-dist-exports.mjs` validates `./privy`; `check-entry-isolation.mjs` validates graph + directive. Locally: fresh `pnpm i`, then `TURBO_CONCURRENCY=2` (memory: pre-commit needs a fresh install + build; the full build can exhaust RAM). |
| `check-exports` (attw `--pack --profile esm-only`) | `./privy` has matching `types`/`import` conditions + `typesVersions`; externals are not analysed (**verified**, digest §4.4). |
| `checkTs` + `check-tests-typechecked.mjs` | `vi.mock('@privy-io/react-auth')` factories return typed stubs; the single viem-2.29.2 → 2.56.0 `Chain` mismatch (`supportedChains`) is cast at that line; the spike confirms `tsc` is clean with two viem copies. |
| `check:ai` + AI-drift workflow | Skill named `sodax-wallet-sdk-react-privy`; recipe registered in all six lists; snippets use the real `privy()` API; skills tree updated alongside `src`; run `pnpm --filter @sodax/skills check:ai` before every push (memory: run a gate you just added). |
| Docs drift (`check-docs-drift.sh`), `check:doc-links` | `README.md` (mapped page) and `docs/WALLET_PRIVY.md` change in the same PR (JSDoc and skills do not count); README links into `docs/` are absolute GitHub URLs. |
| `pnpm test` (vitest) | §7.2; `EvmHydrator.test.tsx` passes unchanged. |
| Consumer builds (`ci.yml:223`) | `apps/demo` + `apps/example-next-js-16` untouched and Privy-free. |
| OSV / dependency-review (`security.yml`); cooldown (`minimumReleaseAge: 20160`) | 0 advisories; PR body carries the +53-name list and the evidence for both excludes; devDependency 3.40.0 is eligible — re-run `pnpm install --lockfile-only` on PR day; the canary overrides the gate only for its throwaway install. |

---

## 7. Test plan

### 7.1 Spike (0.5–1 day, before the PR opens; results pasted into the PR body)

Scratch worktree from `main` (not `git stash`): add the two `trustPolicyExclude` entries, `pnpm add -D @privy-io/react-auth@3.40.0 --filter @sodax/wallet-sdk-react`, `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages && pnpm checkTs && pnpm check-exports && pnpm check:knip`. Then in `apps/wallet-modal-example` with a dev `appId` and test accounts:

1. Does `import('@privy-io/react-auth')` load under pnpm's isolated layout (viem `tempoModerato` crash otherwise)? (**likely**, digest §4.2)
2. Does `useWalletClient()` resolve for the custom connector so `walletProviders.EVM` is set, and do `signMessage` + a 0-value `sendTransaction` succeed? (**likely**)
3. Does `createOnLogin` populate `useWallets()` before or after `onComplete`? (**unverified**)
4. After `wallet.switchChain`, does `useWallets()[i].chainId` update and a fresh `getEthereumProvider()` report the new chain? Does the provider emit anything on logout? (**likely** only `chainChanged`)
5. In HttpOnly-cookie mode, which `privy:*` keys and non-HttpOnly cookies stay readable? Decides whether the session probe stays (§2.5).
6. Switch + send on each of the 14 chains with the embedded wallet. (**unverified**)
7. Does `'use client'` survive as the first line of `dist/privy/index.mjs`?
8. Time-to-reconnect on reload; demo bundle delta; whether the auth iframe loads for anonymous visitors (**unverified**).

### 7.2 Unit tests (vitest, happy-dom, existing config)

- `src/privy/privyConnector.test.ts` — real `@wagmi/core` `createConfig` with `[privyConnector({ runtime: fake, options, ctx }), mock()]`, `createStorage({ storage: memory })`, `vi.useFakeTimers()`, no Privy import (Sushi precedent, **verified**, https://github.com/sushi-labs/sushiswap/pull/2267). Cases: the four `connect` branches of §2.4 plus late completion; modal exit → `UserRejectedRequestError`; timeout → `TimeoutError`; `isAuthorized` truth table (flag × probe); `reconnect()` success, and failure with flag cleared and an instant second pass; `disconnect()` → `ops.logout`, flag removed, shell detached; runtime `logout` while attached vs detached; `switchChain` (re-attach + `change`; unsupported → `SwitchChainError`); stable `getProvider()` identity; requested `chainId` on connect.
- `src/privy/PrivyHost.test.tsx` — `vi.mock('@privy-io/react-auth', …)` with a pass-through `PrivyProvider` and controllable `usePrivy`, `useWallets`, `useLogin`, `useLogout`, `useCreateWallet`, `getEmbeddedConnectedWallet` (Uniswap pattern). Cases: snapshot follows the hooks; `onComplete` resolves a pending attempt and is ignored without one (`wasAlreadyAuthenticated: true` at mount); `onError` rejects; `authenticated` true→false emits `logout`; `PrivyProvider` receives `loginMethods: ['email']`, `createOnLogin: 'users-without-wallets'`, `supportedChains === ctx.chains`, `defaultChain.id === 146`, no `showWalletUIs` key when unset; duplicate host → warn + children only, released on unmount.
- `deferredProvider.test.ts` (4900 while detached; forwards after attach; re-emits `chainChanged`; detach unbinds), `sessionProbe.test.ts`, `index.test.ts` (distinct runtimes per call; SSR-safe under `// @vitest-environment node`).
- `EvmProvider.test.tsx` cases from §4; `EvmHydrator.test.tsx` unchanged and green.

### 7.3 Demo proof (`apps/wallet-modal-example`, port 3002)

Dashboard prep on a dev app: Email login, Ethereum embedded wallets, allowed origin `http://localhost:3002`, "Enable test accounts" (`test-XXXX@privy.io` / OTP `XXXXXX`, 10 req/10 s — **verified**, https://docs.privy.io/recipes/using-test-accounts).

1. **AC1 negative**: env unset → `pnpm build`; `grep -ril privy dist/assets` empty; injected wallets only; no `auth.privy.io` traffic.
2. **AC1 positive**: env set → "Email (Privy)" with icon next to the injected wallets.
3. **AC2**: click → Privy `<dialog>` → test email → OTP → `useXAccount('EVM').address` set, `xConnectorId === 'privy'`; repeat with a new test email to observe wallet creation.
4. **AC4**: sign a message and send a 0-value self-transfer via `useWalletProvider('EVM').sendTransaction` → hash returned.
5. **AC3**: reload → same address without OTP (both `reconnectOnMount` values); disconnect → reload → not connected; same email again → same address; second `appId` → different address.
6. **AC5**: MetaMask → sign → disconnect → WalletConnect (local `projectId`) → sign → Privy → sign → MetaMask again, one session.
7. Switch the Privy wallet Base → Sonic → HyperEVM; `walletProviders.EVM` rebuilt; a chain outside the list → clean `SwitchChainError`.

### 7.4 Manual QA matrix

| # | Scenario | Expected |
|---|---|---|
| 1 | No `EVM.privy`; Next 16 example and `apps/demo` builds, Privy not installed | Builds pass; no `@privy-io` in output |
| 2 | `reconnectOnMount: false` (SDK default) with persisted `xConnections.EVM` | Hydrator retry reconnects Privy without OTP |
| 3 | `reconnectOnMount: true` + `ssr: true` + cookie `initialState`, throwaway Next 16 app with Privy | First paint `reconnecting` → connected; no hydration warning |
| 4 | Session expired (clear `privy:*` keys) then reload | Instant skip; stale store entry cleared; no stall |
| 5 | Session present but iframe blocked (CSP / adblock) | Fails within `reconnectTimeoutMs`; MetaMask/WC usable |
| 6 | Close the dialog mid-OTP; wrong OTP 5×; OTP after 2+ min | Reject → modal `error` → `walletSelect`, retry works; late OTP succeeds (300 s) |
| 7 | Disconnect from SODAX UI | `usePrivy().authenticated === false`; next click asks OTP |
| 8 | Logout from Privy in another tab / console | wagmi `disconnected`; store cleared |
| 9 | MetaMask disconnect (wagmi writes `io.metamask.disconnected`) then Privy login | Privy connects; MetaMask does not ghost-reconnect |
| 10 | MetaMask + Privy both connected; switch via wallet list | `xConnectorId` follows the last connect; signing uses that wallet |
| 11 | Chain switch to each of the 14 chains; send on non-default chains | No 4901; record which chains Privy can send on |
| 12 | Same email on a second `appId` | Different address (documented) |
| 13 | Broken Privy config (invalid `defaultChainId`, rejected `supportedChains`) | Boundary logs once; MetaMask/WC keep working; Privy connect fails with a clear error |
| 14 | CSP block from WALLET_PRIVY.md applied to the demo | Iframe + Turnstile load; login and signing work |
| 15 | Chrome with MetaMask + Hana; Safari without extensions | Privy-only flow works in Safari |

---

## 8. Rollout and versioning

- One branch, one PR from `main` (the local checkout is on `fix/sui-asset-manager-live-package-id`); SDK-only slice, no cross-repo parent.
- No changeset (removed in PR #407); release notes come from commit subjects: `feat(wallet-sdk-react): add opt-in Privy email login as an EVM wallet source`; `chore(workspace): exclude jose@4.15.9 and ua-parser-js@1.0.41 from trustPolicy no-downgrade`; `docs(wallet-sdk-react): add Privy partner guide and provider docs`; `docs(skills): add wallet-sdk-react privy skill and recipe`; `chore(wallet-modal-example): env-gated Privy demo`; `ci: weekly Privy latest canary`. No `#456` in subjects (memory: issue refs spray timeline noise); no attribution trailers.
- `@sodax/wallet-sdk-react` continues the `2.0.0-rc` line (rc.17 → rc.18 via `pnpm release`); additive change → no `!` marker.
- PR body: spike results, the +53-name delta, evidence for both `trustPolicyExclude` entries, tested Privy version, §11 decisions resolved or explicitly deferred. Out-of-scope findings go in the PR thread, not new issues.
- Bump policy: raise the exact devDependency when a newer 3.x clears the cooldown and the canary is green; never raise the peer floor unless an API the SDK uses changed.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Issue premise mismatch.** "Password = wallet recovery factor" has no mechanism on Privy's default TEE execution: no password login exists, recovery = the login method, password/cloud recovery exists only for on-device apps enabled via Privy support (**verified**, https://docs.privy.io/security/wallet-infrastructure/architecture, https://docs.privy.io/wallets/advanced-topics/new-devices/cloud-recovery, https://docs.privy.io/security/authentication/user-authentication). | Settle §11 Q1 before writing AC2 docs. V1 exposes nothing for recovery; WALLET_PRIVY.md states the TEE model and recommends dashboard wallet MFA. If Product chooses on-device, `useSetWalletRecovery()` becomes a `privy()` option later without contract change. Record a decision superseding context-repo decision 0001. |
| Two viem copies: npm/yarn-hoisted partners crash at import (`tempoModerato` missing from hoisted viem 2.29.2) (**verified**); pnpm isolation **likely** fine. | Spike item 1; document the top-level viem floor (≥ 2.44, 2.56.0 recommended; wagmi 2.16.9 accepts `2.x`); an import-time guard in `src/privy/index.tsx` rethrows that `SyntaxError` with a hint; catalog bump raised in the PR thread. |
| `useWalletClient()` across viem copies not proven. | Only `{ request, on, removeListener }` crosses; wagmi wraps it with the SDK's `custom()`; spike item 2 gates the build. |
| Privy ships weekly; the cooldown keeps the devDependency 2–3 minors behind; `^3.40.0` admits untested versions. | Privy hooks confined to `PrivyHost.tsx` behind the runtime interface with `vi.mock` contract tests; weekly canary; tested version in the docs; no `@experimental useLoginWithEmail`. |
| Sequential `reconnect()` waits on Privy when the flag is set and the iframe is slow/blocked. | Fast fail on `!authenticated` once `ready`; probe skips on positive no-session evidence; `reconnectTimeoutMs` bounds the rest; failure clears the flag. |
| Privy's `<dialog>` stacks under the partner's modal; an abandoned dialog holds `connecting` up to 300 s. | Same caveat WalletConnect has (render null while connecting for `'privy'`); `back()` already drops the in-flight attempt; no branching in SDK primitives. |
| Partner mounts its own `PrivyProvider` (sodax-frontend's separate Privy card). | V1: the SDK owns it when `EVM.privy` is set; children are inside it so `usePrivy()` works; duplicate-host guard warns. |
| Sends on non-default chains unverified; Privy's RPC differs from the SDK's `rpcUrl` overrides (reads via wagmi transports, sends via Privy). | Spike item 6 + QA row 11; document the verified subset; `addRpcUrlOverrideToChain` as a follow-up. |
| Supply-chain review load (+53 names incl. styled-components, x402, @stripe/*, hcaptcha; two excludes). | Optional peer → non-Privy partners install nothing; per-entry evidence; OSV clean; exact devDependency so a blocked bump never leaks into a release. |
| Plaintext wagmi cookie flag can be forged; eager `PrivyProvider` mount may load the iframe for visitors who never pick email (**unverified**). | The flag is intent only, the Privy session is authoritative, cleared on failure (same trust model as wagmi's `recentConnectorId`); iframe cost measured in spike item 8, lazy mount is a documented follow-up. |

---

## 10. Out of scope (V1)

Solana/other-chain Privy wallets (the internal source shape and per-instance runtime let a later `SOLANA.privy` share the same `privy()` instance); a public `EVM.sources` extension point and the WalletConnect-as-source refactor; `@privy-io/wagmi`, `useSetActiveWallet`, smart-account connectors; headless `useLoginWithEmail` and a SODAX-styled OTP UI; recovery enrollment (`useSetWalletRecovery`), `keep-session`, an SDK `usePrivyUser()` hook; catalog viem bump; Privy in `apps/demo` / the Next example; a SODAX-provided shared `appId`; Global Wallets; lazy `PrivyProvider` mounting; Privy-side RPC overrides.

---

## 11. Open questions for Fez / Robi

1. **Execution mode and the "password" line.** Is the SODAX Privy app on TEE (default) or on-device? On TEE there is no password factor; the safeguard is wallet MFA. Rewrite AC2/docs to "recovery = email OTP, MFA recommended", or request on-device execution and add a recovery option later?
2. **Whose `appId`?** Partner-owned (design default: partner controls origins, MFA, cookies, legal URLs, billing) or SODAX-provided (one wallet across integrations, but SODAX allow-lists every partner origin, pays MAU/signature fees, and all partner sites share one trust boundary)?
3. **Disconnect semantics.** V1 = SODAX disconnect signs the user out of Privy. Acceptable, or do partners who also use Privy for app auth need `keep-session`?
4. **Privy signing prompts.** Leave `showWalletUIs` to the dashboard — should the docs recommend a value?
5. **Default chain.** Sonic (146) as the embedded wallet's initial chain — confirm.
6. **Demo scope.** Privy only in `apps/wallet-modal-example`; also a swap-intent demo in `apps/demo` (adds the peer there)?
7. **Dashboard ownership for QA.** Who owns the dev Privy app (Email login, embedded wallets, test accounts, `localhost:3002` origin)?
8. **Catalog viem.** OK to raise viem to ≥ 2.44 (ideally 2.56.0) in a follow-up so npm/yarn partners cannot hit the hoisting crash?

---

## 12. Acceptance criteria → mechanism

| AC | Mechanism | Proof |
|---|---|---|
| **AC1** "Email (Privy)" in the same list when `EVM.privy` is set; no Privy code otherwise | `EvmProvider` pushes `config.privy.createConnector(ctx)` into wagmi `connectors`; `EvmHydrator` mirrors `useConnectors()` unchanged; without the slot no connector/Host exists and the main entry has no `@privy-io` reference | `EvmProvider.test.tsx` (present/absent/malformed/doMock-throw), `check-entry-isolation.mjs`, Privy-free CI builds, demo steps 1–2 |
| **AC2** Email OTP sign-up ends with a connected EVM XAccount | `connect()` → `login({ loginMethods: ['email'] })` → `onComplete` → embedded wallet (`createOnLogin` + `createWallet` fallback) → `getEthereumProvider()` → `{ accounts, chainId }` → wagmi `connected` → Hydrator writes `xConnections.EVM` with `xConnectorId: 'privy'`. Recovery/password: §9 row 1, §11 Q1 | `privyConnector.test.ts`, `PrivyHost.test.tsx`, demo step 3 |
| **AC3** Returning user reconnects to the same address | wagmi `reconnect()` (mount or Hydrator retry) → deferred `getProvider()` → `isAuthorized()` (flag + probe) → `connect({ isReconnecting })` waits for Privy's session restore; same user → same wallet within one `appId`; failure clears flag and stale store entry | connector reconnect tests, demo step 5, QA rows 2–4, 12 |
| **AC4** A signed SODAX action works through `useWalletProvider('EVM')` | `useWalletClient()` builds a viem client over `custom(deferredProvider)`; `EvmHydrator` builds `EvmWalletProvider` as for MetaMask; `@sodax/sdk` → `sendTransaction` → `eth_sendTransaction` on the Privy provider | Spike item 2, demo step 4, QA row 11 |
| **AC5** MetaMask / Hana / WalletConnect keep working with Privy enabled | mipd stays on; `walletConnect()` stays in the array; Privy is appended; `isAuthorized()` never waits without flag/session; Privy registers no EIP-6963/WC connectors of its own | `EvmProvider.test.tsx` (WC + source coexist), demo step 6, QA rows 5, 9, 10 |
| **AC6** Partner docs | `docs/WALLET_PRIVY.md`, README bullet + docs-table row (mirrored to docs.sodax.com), five docs + AGENTS updates, `packages/skills` privy skill + recipe | docs-drift, doc-links, check:ai and AI-drift gates green |
