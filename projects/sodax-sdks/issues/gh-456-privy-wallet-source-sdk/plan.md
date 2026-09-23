---
type: plan
repo: sodax-sdks
github: 456
updated: 2026-09-23
related_issues: [gh-1069, gh-1024]
related_decisions: [0003, 0001]
---

# Plan — Privy as an opt-in EVM wallet source in `@sodax/wallet-sdk-react`

**Revision 3 (2026-09-23).** Rev 2's architecture stands; rev 3 shrinks the public API, removes
machinery that bought nothing, and fixes three errors rev 2 carried (timeouts on interactive signing,
an unimplementable import guard, a useless `'use client'` build step). What changed and why:
`process/04`. The audit that started it: `process/03`. Rev 1 and the rev 1 → 2 evidence trail are in
`archive/` — **historical, do not build from them**. External facts with sources: `research.md`.

**Implemented and max-reviewed 2026-09-23 (uncommitted).** Settled 11 (no boundary), fail-fast `privy()`
and the `^3.40.0` peer were reversed in `process/06`. **`process/05` § Deviations lists nine more places the
code differs from this text** (supersession rule, no `pendingRuntimeChainId`, `WeakMap` instead of a brand, Privy-specific
seam names, commit order, knip, the optional-peer claim, the workspace dedupe, pinned 3.40.0). Read it
before trusting § Coexistence, § Lifecycle — chain switch or § Step 7.

Privy versions cited: `@privy-io/react-auth@3.43.0`, `@privy-io/chains@0.6.0`,
`@privy-io/js-sdk-core@0.76.0`, read 2026-09-18. **Privy ships weekly — re-stamp every Privy citation
on the spike day.** Repo baseline: `origin/main 1549d309` (worktree `../sodax-sdks-456` sits there).

## Goal

Partners who set `EVM.privy` get an **"Email (Privy)"** entry in the same EVM wallet list as MetaMask,
Hana and WalletConnect. Picking it runs Privy's email one-time-code login, provisions an embedded EVM
wallet, and from then on that wallet signs SODAX intents through the unchanged `EvmWalletProvider`
slot. Partners who omit `EVM.privy` load **zero** Privy code and see no Privy entry. V1 is EVM only.

## Approach

### The decision

**Privy is one more wagmi connector, not a provider swap.** `EvmProvider` appends a Privy connector
(`id: 'privy'`) to the `connectors` array it already fills with `walletConnect()`
(`src/providers/evm/EvmProvider.tsx:33-42`), and renders a small host (`PrivyProvider` + a bridge)
*inside* `WagmiProvider`, around the children but **not** around `EvmHydrator` / `EvmActions`. Both come
from the value `privy({ appId })` returns, exported by a new sub-path **`@sodax/wallet-sdk-react/privy`**.
`@privy-io/react-auth` is an optional peer; **`@privy-io/wagmi` is not used.**

Production precedent: sushiswap ships this shape on `master`
(`apps/web/src/lib/wallet/privy/privy-evm-connector.ts` @ `7fbb578`) — framework-free runtime store,
deferred provider shell, per-attempt `AbortController`, untimed login modal, a `getWagmiState`
injection, and a unit suite on real `@wagmi/core` with zero Privy imports. Rejected parts of it are in
Risk 9.

### Why not `@privy-io/wagmi`

Verified in the published 4.0.17 source: `createConfig` **drops every non-mock connector** and sets
`multiInjectedProviderDiscovery: false`; `useSyncPrivyWallets` calls
`config._internal.connectors.setState(list)` on every `useWallets()` change, **replacing** the list;
`WagmiProvider` forces `reconnectOnMount: false`; it peer-pins **`viem 2.56.0` exactly** (catalog:
2.29.2). WalletConnect and EIP-6963 die, so AC5 cannot hold.

### Why an import from a sub-path — not plain config, not a hard dependency, not a new package

The partner writes `privy: privy({ appId })`, not `privy: { appId }`. The import is the opt-in signal:
bundlers decide what enters a bundle only by following `import`s, never by reading config values.

- **Plain config + the SDK loading Privy itself** needs a Privy specifier in the main entry. As an
  optional peer, a string-literal `import('@privy-io/react-auth')` there breaks every non-Privy partner
  on webpack 5 ("Module not found", verified) and Vite/Turbopack alike — bundlers resolve dynamic
  imports at build time; Turbopack has no portable escape hatch.
- **A hard dependency** (so that lazy import resolves) makes every partner install ~53 more packages
  (a second viem, a fourth `@walletconnect/core` line, a third `@coinbase/wallet-sdk`, styled-components,
  `@stripe/*`, hcaptcha, x402), inherits every Privy advisory into `npm audit` for all of them, pins the
  two `trustPolicyExclude` entries on the main package, and exposes npm/yarn partners with a hoisted
  viem < 2.44 to the `tempoModerato` crash (`research.md:185`) whether or not they use Privy.
- **A side-effect registration import** (`import '@sodax/wallet-sdk-react/privy'` + plain config) is
  still an import, is deleted by bundlers under the package's `"sideEffects": false`, and turns a
  forgotten import into a runtime failure instead of a build error.
- **A new package `@sodax/wallet-privy`** costs three release-file edits for zero isolation gain:
  `scripts/release.mjs` `discoverPublishablePackages()` requires `scripts/bump-versions.sh:7` and
  `.github/workflows/sdks-publish.yml:30,72` to list exactly the publishable set, asserted by
  `scripts/release.test.mjs:306-311` inside `pnpm test` in CI. `@sodax/wallet-hw` (PR #163) is a pure
  connector package; Privy needs a React provider mounted inside `EvmProvider`.

`walletConnect: { projectId }` can stay plain only because its SDK is a hard dependency of
`wagmi/connectors`. **Caveat:** with `splitting: true`, one *value* import of Privy from any module the
main barrel also reaches hoists the bare specifier into a shared chunk (reproduced in a fixture);
`import type` is erased and safe. Step 1's gate catches it.

### Relationship to PR #163 `feat/wallet-hw`

#163 (OPEN, `MERGEABLE` since its 2026-09-21 main merge, no reviews) adds
`EVM.wagmiConnectors?: CreateConnectorFn[]` to the same `EvmAdapterFields` block and pushes into the
same `useMemo`. **The two compose; only the text conflicts.** This PR does not wait on #163; whichever
lands second rebases the `useMemo` by hand (`...extraConnectors` then the Privy connector).

`EVM.privy` is **not a second extension point**: its value type is opaque, only `privy()` can produce
one, and the `setup(ctx)` contract behind it is internal and ships in the same package version as its
only producer — so it can change in any release. `wagmiConnectors` + a generic host slot was costed
and rejected: it would *publish* that contract (the host needs `ctx`), make partners wire two fields
where forgetting the host yields a list entry that throws on click, and depend on #163 landing.
A raw wagmi connector also cannot see partner RPCs — `createWagmiConfig` writes `rpcUrl` into
`transports` only, never into the `Chain` objects (`src/xchains/evm/EvmXService.ts:94-138`), and Privy
resolves RPC from `chain.rpcUrls.privyWalletOverride`.

Do not touch #163 (no comment, no edit). Its `packages/wallet-hw/package.json` is `"private": false`
at `0.0.1-test`, which the #407 release gate rejects — raise it only in our own PR if it ever blocks us.

### What stays untouched (the regression proof)

`EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`, `useXWalletStore.ts`, `useWalletModal`,
`useEvmSwitchChain`, `EvmWalletProvider` (core). Privy rides wagmi's `useConnectors` / `useAccount` /
`useWalletClient` / `reconnect()` exactly as MetaMask does; `EvmHydrator.test.tsx` must pass unchanged.
Without `EVM.privy`, `EvmProvider` renders `{children}` exactly as today.

### Settled choices — do not re-litigate

1. **Modal login**, `login({ loginMethods: ['email'] })`, not headless `useLoginWithEmail`
   (`@experimental` in 3.43; `createOnLogin` does not fire for headless flows). `useLogin().login` is
   synchronous and returns `void` — hence the deferred bridge; never pass it as an `onClick` handler.
2. **Disconnect = Privy sign-out** in V1 (shared-device safety; open question 3 can relax it).
3. **Partner-owned `appId`** is the design default (open question 2; no code depends on it).
4. **The SDK never calls `setWalletRecovery()`.** On Privy's default TEE execution it **throws**
   `UNSUPPORTED_WALLET_TYPE` before any UI (`@privy-io/react-auth@3.43.0 dist/esm/index-BcpLdFr2.mjs`,
   byte-identical in 3.40.0; the `.d.ts` doc-comment at `dist/dts/index.d.ts:3399` is stale).
   `requireUserOwnedRecoveryOnCreate` / `userOwnedRecoveryOptions` live on the dashboard `AppConfig`
   (`types-ChU9ocPQ.d.ts:2148-2149`), not `PrivyClientConfig` (`:1779-1860`). The issue's AC2 and
   game-plan step 4 are **struck** (see Verification).
5. **`showWalletUIs` is not defaulted**; the dashboard setting applies unless the partner passes it.
6. **Sonic** is the embedded wallet's default chain; `supportedChains` mirrors the SDK's 14-chain wagmi
   tuple, **decorated** with `rpcUrls.privyWalletOverride` (Architecture). Chain id 999 collides with
   Zora Goerli Testnet in Privy's own registry.
7. **No changeset** (PR #407); the release note is the commit subject; no `#456` in subjects; no
   attribution trailers.
8. **Privy's own external-wallet surface is disabled**: `appearance.walletList: []` and
   `externalWallets: { disableAllExternalWallets: true, walletConnect: { enabled: false } }`.
   `loginMethods: ['email']` does **not** shrink `walletList` (default: nine entries incl.
   `wallet_connect`, `coinbase_wallet`, `base_account`), and `externalWallets.walletConnect.enabled`
   defaults to `true` (`dist/esm/privy-context-BRYUJfjv.mjs`; observed live on `demo.privy.io`).
   Without these keys Privy stands up a second WalletConnect v2 provider, a Coinbase SDK and a Base
   Account SDK. `disableAllExternalWallets` is `@experimental` (`types-ChU9ocPQ.d.ts:1490`) — pinned
   version + QA row.
9. **The SDK never sets `mfa.noPromptOnMfaRequired`.** Default `false` → Privy raises its own MFA modal
   inside the SDK-mounted provider; `true` would silently break signing for MFA-enrolled users.
10. **Public shape is `EVM.privy: privy({ appId })`** — see the two sections above. `[rev3]`
11. **No error boundary around the host.** No other SDK-mounted provider has one (`SuiProvider` throws by
    design on a bad `grpcUrl`); the two known `PrivyProvider` mount throws are made unreachable by
    `privy()` validation and the `EvmChainKey` type; Privy's runtime failures arrive via
    `usePrivy().error`, not render throws. A boundary around the partner's whole subtree would remount
    it on error, catch the partner's own errors, and render children *outside* the provider — which is
    exactly where Privy's callback hooks throw. `[rev3]`
12. **Only non-interactive calls are timed. Pass-through requests are never timed** (see § Timeouts).
    `[rev3]`

## Public API

```ts
// @sodax/wallet-sdk-react (main entry) — src/types/config.ts; no Privy imports, no Privy types
declare const privySourceBrand: unique symbol;
/** Opaque. Build it with `privy()` from '@sodax/wallet-sdk-react/privy'. */
export type PrivySource = { readonly [privySourceBrand]: true };

export type EvmAdapterFields = {
  /* … existing fields … */
  /**
   * Opt-in Privy email login as an EVM wallet source (connector id `privy`, "Email (Privy)").
   * Build it with `privy()` from '@sodax/wallet-sdk-react/privy'; requires `@privy-io/react-auth` ^3.40.
   * Omit it and no Privy code is loaded.
   */
  privy?: PrivySource;
};

// @sodax/wallet-sdk-react/privy — src/privy/index.ts. The whole sub-path surface:
export type PrivyOptions = {
  appId: string;
  clientId?: string;
  /** Initial chain of the embedded wallet. @default ChainKeys.SONIC_MAINNET */
  defaultChain?: EvmChainKey;
  /** Show Privy's signing UI. Omitted → the Privy dashboard setting applies. */
  showWalletUIs?: boolean;
  appearance?: Omit<NonNullable<PrivyClientConfig['appearance']>, 'walletList'>;
  legal?: PrivyClientConfig['legal'];
};
export const PRIVY_CONNECTOR_ID = 'privy';
export function privy(options: PrivyOptions): PrivySource;
```

`EvmChainKey` is exactly the 14 keys of the wagmi tuple today (`packages/types/src/chains/chains.ts`),
so a bad default chain is a compile error; a unit test keeps the two in sync. `privy()` is **pure**:
it validates (`appId` non-empty; `defaultChain` in the tuple, for JS callers) and returns a descriptor.
No runtime, no global registry — so calling it inline is safe (`SodaxWalletProvider` freezes its
config on first render via `useRef`, `src/SodaxWalletProvider.tsx`). Error classes stay internal; every
exported function carries an explicit return type (tsup dts emits TS2742/TS4058 on inferred Privy types).

Partner usage (the copy-paste target for `WALLET_PRIVY.md`):

```tsx
// providers.tsx — must be a 'use client' file (privy() returns functions, which cannot cross RSC)
// pnpm add @sodax/wallet-sdk-react @privy-io/react-auth
import { ChainKeys } from '@sodax/types';
import { SodaxWalletProvider, type SodaxWalletConfig } from '@sodax/wallet-sdk-react';
import { privy } from '@sodax/wallet-sdk-react/privy';

const config: SodaxWalletConfig = {
  EVM: {
    walletConnect: { projectId: WC_PROJECT_ID },                  // still works (AC5)
    privy: privy({ appId: PRIVY_APP_ID, legal: { termsAndConditionsUrl: '/terms' } }),
    chains: { [ChainKeys.BASE_MAINNET]: { rpcUrl: '…' } },        // reaches Privy's sends too
  },
};
```

- **Custom modal caveat** (same as WalletConnect): render nothing while
  `state.kind === 'connecting' && ['walletConnect', PRIVY_CONNECTOR_ID].includes(state.connector.id)`.
- **The Privy user** — the SDK exposes only what every wallet has (`useXAccount({ xChainType: 'EVM' })`,
  `useWalletProvider`, `xConnectorId === 'privy'`). Email, user id, key export: import `usePrivy`,
  `useExportWallet` from `@privy-io/react-auth` in children — they sit inside the SDK-mounted
  `PrivyProvider`, so every Privy hook works, callback forms included. No SDK `usePrivyUser()`. If the
  partner enables `EVM.privy` conditionally (env), components calling Privy hooks must be gated the
  same way — outside a provider the callback forms throw during render.
- Do **not** mount a second `PrivyProvider` of your own; use the SDK-mounted one.

## Architecture

### Mount tree

```
<WalletConfigProvider>
  <EvmProvider>
    <QueryClientProvider client={ownQueryClient}>        // Privy has no react-query dep — no collision
      <WagmiProvider config={createWagmiConfig(chains, { connectors: [walletConnect?, privy.connector] })}>
        <EvmHydrator/> <EvmActions/>                     // unchanged; EIP-6963 (mipd) stays ON
        {Host ? <Host>{children}</Host> : children}      // Host = <PrivyProvider config={derived}>
                                                         //          <PrivyBridge/>{children}
                                                         //        </PrivyProvider>
```

`children` = `SuiProvider → SolanaProvider → partner children` (`src/SodaxWalletProvider.tsx`).

### Internal seam `[rev3]`

```ts
// src/providers/evm/evmSource.ts — main side, not re-exported from src/index.ts
type EvmSourceContext = {
  readonly chains: readonly [Chain, ...Chain[]];      // SODAX_EVM_CHAINS; never mutated
  readonly rpcUrls: Readonly<Record<number, string>>; // the same map createWagmiConfig builds transports from
  readonly getState: () => Config['state'];           // public wagmi field (createConfig.d.ts:31)
};
type EvmSourceSetup = { readonly connector: CreateConnectorFn; readonly Host: ComponentType<{ children?: ReactNode }> };
type PrivySourceInternal = { readonly setup: (ctx: EvmSourceContext) => EvmSourceSetup };
```

`EvmProvider` calls `setup(ctx)` **inside the same `useMemo` that builds the wagmi config**, pushes
`connector`, and renders `Host`. `getState` is a closure over the config built a line later.

- **One runtime per mount, not per `privy()` call.** Connector and Host share it through the closure
  `setup` creates. StrictMode double-invokes the `useMemo`, creating two runtimes and discarding one —
  harmless because creating a runtime has no side effects (subscriptions happen only in the bridge's
  effects and in `connect()`). A `key` remount gets a fresh runtime. This removes rev 2's
  "call `privy()` once" rule, the per-`appId` instance warning and the re-claimable
  `Map<appId, owner>` mount guard.
- **One RPC source of truth by construction.** Extract the tuple into an internal
  `SODAX_EVM_CHAINS` (not exported from `./xchains/evm`) and a `resolveEvmRpcUrls(evmChains)` helper
  over `getRpcUrl` (`src/utils/walletRpcConfig.ts:24`); `createWagmiConfig`'s `transports` and
  `ctx.rpcUrls` both come from it. `createWagmiConfig`'s public signature is unchanged.
- The runtime guard for JS callers: `typeof value?.setup === 'function'`, else warn once and skip.
- The host is always rendered by `EvmProvider` in the same tree as its connector, so "connector
  without host" cannot happen; rev 2's `PrivyHostNotMountedError` is gone. The window before the
  bridge's first effect is covered by the readiness wait.

### Sub-path modules (`src/privy/`)

`index.ts` (factory + validation; no JSX), `setup.tsx` (builds runtime, connector, `Host`),
`runtime.ts` (framework-free store: snapshot, `subscribe`, `waitFor(pred, { timeoutMs })` **with an
error channel**, pending-login deferred, `logout` event), `deferredProvider.ts`, `privyConnector.ts`,
`PrivyBridge.tsx` (the only place Privy hooks run), `privyConfig.ts` (`buildPrivyConfig`, pure),
`errors.ts` (internal), `icon.ts`.

### Derived `PrivyProvider` config — `buildPrivyConfig(options, ctx)`, pure

```
loginMethods: ['email']
embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs? }
appearance: { ...partnerAppearance, walletList: [] }
externalWallets: { disableAllExternalWallets: true, walletConnect: { enabled: false } }
supportedChains: ctx.chains.map(c => ({ ...c, rpcUrls: { ...c.rpcUrls,
                   privyWalletOverride: { http: [ctx.rpcUrls[c.id]] } } }))   // a NEW array
defaultChain: the chain whose id === baseChainInfo[options.defaultChain ?? SONIC].chainId
legal: passthrough
// no `mfa` key, no recovery key — ever
```

The override goes on **all 14 chains unconditionally**, because: (1) Privy's embedded wallet resolves RPC
as `privyWalletOverride → dashboard rpcConfig → rpcUrls.privy + '?privyAppId=' → public ?? default`,
and that one client does both `prepareTransactionRequest` and the broadcast — wagmi's `transports` are
bypassed on the Privy path; (2) `rpcConfig` is dashboard-only, so the chain object is the only in-code
lever; (3) an override makes `dedupeSupportedChains` a no-op, which stops Privy grafting its
`*.rpc.privy.systems` proxy onto ids 1/10/56/137/8453/42161 and neutralises the id-999 collision.
`viem@2.29.2`'s `Chain.rpcUrls` is an index signature, so no cast and no `@privy-io/chains` dependency;
wagmi ignores the extra key. **Never mutate the shared tuple** — the same `Chain` objects feed
`createWagmiConfig`, so a mutation corrupts the read path too.

### Timeouts `[rev3]`

Four **internal constants**, no public options:

| Constant | Default | Bounds |
| -------- | ------: | ------ |
| `READY_RECONNECT_MS` | 3 000 | host `ready` on the reconnect path |
| `READY_CONNECT_MS` | 15 000 | host `ready` on an interactive connect |
| `WALLET_MS` | 30 000 | embedded wallet materialisation after login |
| `INTERNAL_CALL_MS` | 10 000 | each connector-internal call: `getEthereumProvider()`, `eth_chainId`, the in-band `wallet_switchEthereumChain`, runtime ops |

Rules: interactive phases are cancellable, never timed — users take minutes to enter a code. **Requests
passed through the deferred shell from wagmi's wallet client (`eth_signTypedData_v4`,
`eth_sendTransaction`, `personal_sign`, …) are never timed**: they can open Privy's MFA prompt
(settled 9) or its confirmation modal (`showWalletUIs`), and a deadline would reject a user who is
typing a TOTP code. MetaMask is not timed either. The dead-channel case (iframe handshake retrying
150 ms × 270 then only `console.warn`-ing under CSP / adblock / Safari ITP, while postMessage RPCs carry
no timeout of their own) is caught at `connect()`, because `getEthereumProvider()` is timed there.
Spike item 4(d) sets `READY_RECONNECT_MS` from measured returning-user latency.

### Lifecycle — first login (AC2)

`useXConnect(privyEntry)` → `chainActions.connect('privy')` → `connectAsync({ connector })` →
`privyConnector.connect({ chainId })`:

1. Await `ready` bounded by `READY_CONNECT_MS`. `waitFor` has an error channel: `usePrivy().error` is
   published into the snapshot and every waiter rejects with the real cause — a wrong `appId`
   (`MISSING_OR_INVALID_PRIVY_APP_ID`) must not surface as a timeout.
2. **Branch on `authenticated` first.** `authenticated && embedded` → skip login. Gate wallet creation on
   a `hasEmbeddedAccount` flag the bridge derives from
   `user.linkedAccounts.some(a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum')`
   — **not** on `!embedded` from `useWallets()`, which lags, because `createWallet()` **throws** for a
   user who already has one. Only call it on positive evidence; never on a `waitFor` timeout.
3. Otherwise `ops.login()`: the bridge stores a pending deferred and calls
   `login({ loginMethods: ['email'] })` with a ref-stable callbacks object. Resolve on `onComplete`.
   **Reject only on `onError('exited_auth_flow')`** → viem `UserRejectedRequestError` so
   `useWalletModal` reaches `error`; other codes (`invalid_credentials`, `invalid_captcha`,
   `captcha_timeout`, `too_many_requests`, `disallowed_plus_email`) are recoverable in-modal and must not
   reject (the precedent rejects on any code — do not copy). No timeout; cancellation via a per-attempt
   `AbortController`.
4. `await waitFor(s => s.walletsReady && s.embedded, WALLET_MS)`.
5. `provider = await embedded.getEthereumProvider()` (timed); `deferred.attach(provider)`; pin the
   checksummed address (`getAddress`). Bind deterministically (`walletIndex 0`), not whatever
   `getEmbeddedConnectedWallet` finds first. If the requested `chainId` differs, run the connector's
   own `switchChain` **before returning** and return the post-switch `chainId` — `connect.js` writes
   `data.chainId` straight into `connections[uid]`.
6. `writeFlag()` — a **localStorage** flag owned by the sub-path, keyed
   `` `${config.storage?.key ?? 'sodax'}.privy.connected` ``. **Never `config.storage`**: the SDK's wagmi
   storage is `cookieStorage` (`EvmXService.ts:139-141`), whose `setItem` writes no expiry
   (`@wagmi/core dist/esm/utils/cookie.js:9-14`) — a session cookie that dies on browser quit while
   the zustand `xConnections.EVM` entry in localStorage survives. `readFlag/writeFlag/clearFlag` each in
   their own try/catch with a write probe (mirroring `useXWalletStore.ts:158-167`), injectable for tests.
7. Return `{ accounts, chainId }`; wagmi writes `recentConnectorId = 'privy'`; `EvmHydrator` writes
   `xConnections.EVM`; `useWalletClient()` resolves over `custom(deferredProvider)` (only
   `provider.request` crosses the viem boundary) → `EvmWalletProvider` → `walletProviders.EVM` (AC4).

A late `onComplete` after cancellation still publishes state, so the next `connect()` takes step 2's
fast branch without a second OTP.

### Lifecycle — returning user reload (AC3)

Both triggers work: `reconnectOnMount: true` (wagmi's mount reconnect) and the SDK default `false`
(`EvmHydrator` retries `reconnect()` when a persisted `xConnections.EVM` exists).

```ts
async isAuthorized() {
  try { return readFlag() === '1'; } catch { return false; }   // total; no Privy read; no await on Privy
}
```

- Not `storage.getItem(...) === true`: `@wagmi/core` wraps every store in `async getItem`
  (`dist/esm/createStorage.js:13-19`), so that compares a Promise and is permanently `false`.
- No Privy storage probe: with `sessions.cookieWriteBehavior: 'never'` + server cookies no JS-readable
  signal exists, and `privy:caid` / `privy:connections` are written by *any* `PrivyProvider` mount and
  survive logout.
- From `@wagmi/core@2.20.3 reconnect.js`: `getProvider()` returns the deferred shell — a **distinct,
  stable object** (wagmi dedupes by identity) that never throws; `isAuthorized()` is not wrapped in
  catch (`:56`) and `isReconnecting = false` sits outside any `finally` (`:97`), so a throw wedges every
  later `reconnect()` for the page lifetime.

`connect({ isReconnecting: true })`: wait for `ready` bounded by `READY_RECONNECT_MS`, then the wallet by
`WALLET_MS`; `ready && !authenticated` → clear the flag and throw (never opens the modal on reload);
**`READY_RECONNECT_MS` expiry → keep the flag** — readiness is unknown, and clearing makes it terminal.

**Late readiness is not handled in V1** `[rev3: cut]`. If Privy becomes ready after wagmi's loop has
settled, nothing re-enters; the user clicks "Email (Privy)" once and step 2 reconnects with **no
second OTP**. Documented in `WALLET_PRIVY.md`. (Rev 2's self-`reconnect()` raced wagmi's
`config.state.current` on three heuristic guards.)

AC3 wording: same email → same address **for the same `appId`, as long as the user has not been deleted
or unlinked**.

### Lifecycle — disconnect and account change

`useXDisconnect` → `EvmActions.disconnect` → `privyConnector.disconnect()`: (a) **first abort any
in-flight connect attempt**, so a user who opens the OTP dialog then picks another wallet does not
leave a promise that never settles; (b) `clearFlag()`, `deferred.detach()`, `await ops.logout()`.

Reverse direction is required: after a Privy logout the provider emits nothing and still answers
`eth_accounts`, but signing throws 4900. The bridge watches `authenticated` true→false; the connector —
while attached — detaches, **clears the flag** and calls `onDisconnect()`. Triggers: partner
`logout()`, token expiry, storage-shared tokens adopting a different user at refresh; **not** another
tab (cross-tab sync is an opt-in `@experimental` plugin the SDK does not pass).

**Account change, fail-closed.** While attached, connected and not mid-connect/switch: pinned address
still present → re-take `getEthereumProvider()` only when the wallet object identity changed, emit
nothing; pinned address **gone** (gated on `authenticated && walletsReady`, ignoring transient
null-`user` ticks) → detach and `onDisconnect()`. Never follow a new address — for an intent-signing
SDK a re-pointed session is worse than a clean disconnect. `accountsChanged` has no producer in Privy's
provider.

**On bridge unmount**: reject every pending deferred ("Privy runtime unloaded") and publish an
unavailable snapshot, so an unmount mid-login does not strand `useWalletModal` on `connecting`.

### Lifecycle — chain switch

`embedded.switchChain` is a React `setState` only, and `getEthereumProvider()` mints a provider pinned to
the chain captured in the render that produced that wallet object — so "switch, then re-request the
provider" is a guaranteed race. Instead:

1. Validate `chainId` against wagmi `config.chains` → `SwitchChainError`. The **only** guard: Privy's
   `handleSwitchEthereumChain` sets `this.chainId = Number(t)` unconditionally.
2. Switch the **attached provider in-band**:
   `provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(id) }] })`.
   Same instance, no re-attach.
3. **Best-effort** `embedded.switchChain(chainId)` to update Privy's per-address chain map. Failure must
   not fail the action: record `pendingRuntimeChainId` and drag the next provider replacement to wagmi's
   chain. Skipping it is not optional — the next `getEthereumProvider()` would mint a provider back on
   `defaultChain`. (`gap-app-v2` documents `wallet.switchChain()` throwing *"Unable to determine current
   chainId."* — ordering makes it moot; do not string-match.)
4. Verify `Number(await provider.request({ method: 'eth_chainId' })) === chainId`; only then set
   `lastVerifiedChainId` and `emit('change', { chainId })`. Mismatch → keep the old attachment and throw.
   Mirrors wagmi's `injected.js`.

`useWallets()[i].chainId` is CAIP-2 (`eip155:8453`), a string — parse before comparing.

### Connector methods `getChainId()` / `getAccounts()`

Both mandatory, both total. `getConnectorClient` calls them together
(`@wagmi/core dist/esm/actions/getConnectorClient.js:14-21`) and throws `ConnectorChainMismatchError`
on disagreement with `config.state.chainId` (`:32-39`); `useWalletClient` holds that at
`staleTime: Infinity`, and `EvmHydrator` deliberately does not gate on `walletClient`
(`EvmHydrator.tsx`, the comment above `wasConnectedRef`) — so the UI would show a connected account while
`useWalletProvider('EVM')` stays `undefined`, silently.

- `getChainId()` → a **live** `eth_chainId` read on the attached provider (a local field, no network),
  falling back to `lastVerifiedChainId` when detached. Never throw; never the constructor default `1`.
- `getAccounts()` → the pinned, checksummed address from the snapshot; never an `eth_accounts` round
  trip through a possibly-detached shell.

The deferred shell **intercepts `wallet_switchEthereumChain`** and routes it into the connector's
validated `switchChain`. Detached → 4900; never queue requests (a replay after a later login could send
through a different user's wallet).

### Coexistence (AC5)

`multiInjectedProviderDiscovery` stays at wagmi's default; `walletConnect()` stays in the array; Privy is
appended. Settled 8 keeps Privy from standing up its own WalletConnect/Coinbase stacks.

> With no flag the reconnect loop never pauses on Privy. With the flag set, wagmi's loop `await`s
> Privy's `connect()` with **no `break`** (`reconnect.js:46-82`) and publishes `status: 'connected'`
> only after the loop (`:84-96`), so other wallets' published connection is delayed by at most
> `READY_RECONNECT_MS`. Nothing in the SDK surface gates on that window: `useWalletClient` stays enabled
> while `reconnecting`, the `walletProvider` memo has no status gate, a manual connect is never blocked.

**Supersession guard.** wagmi's `reconnect()` replaces the connection map on its first success
(`:67-74`) and `connect.js` sets `current` unconditionally, so a slow Privy restore resolving after the
user picked MetaMask would clobber it. The connector snapshots `ctx.getState().current` at attempt start
and re-checks it in a no-yield window before returning; if another connection is now current: detach,
do not write the flag, throw an internal `PrivyConnectorSupersededError extends UserRejectedRequestError`
so wagmi's catch keeps the existing connection. Do **not** `logout()` on supersede. `config.state` is
public wagmi API, not `_internal`.

## Steps

### Step 0 — Spike (1 day; results pasted into the PR body)

A dev Privy app is **self-service and free** (Developer tier, ~10 minutes at dashboard.privy.io: Email
login, Ethereum embedded wallets, allowed origin `http://localhost:3002`, "Enable test accounts").
Build with `TURBO_CONCURRENCY=2 pnpm build:packages` (it runs the 8 package builds through
`turbo.json:27`'s `dependsOn: ["^build"]`; lighter than `pnpm build`, which also builds apps). **Never
run the root `pnpm test` in the linked worktree** — `scripts/release.test.mjs` leaks `GIT_DIR` and
writes `core.bare=true` / `commit.gpgsign=false` into the shared `.git/config`.

| # | Item |
| - | ---- |
| **0** | **Turbopack prerender go/no-go, first, no Privy app needed.** `pnpm --filter example-next-js-16 verify` with `PrivyProvider` mounted (dummy `appId`), under `next build` (Turbopack) **and** `next build --webpack`; watch for a hydration warning. Privy **statically** imports `@walletconnect/ethereum-provider`, putting its init on the prerender path (wagmi's `walletConnect()` uses `await import()`). Budget a `@sodax/libs`-style stub if it reproduces; record `--webpack` as the partner fallback. |
| 1 | **Install + build + gates.** Two `trustPolicyExclude` entries, exact devDependency, then `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages && pnpm checkTs && pnpm check-exports && pnpm check:knip`. **Diff the pinned version against the F2/F7/F8 facts** (process/01-02) rather than assume them. Confirm the nested viem 2.56.0 resolves under pnpm's isolated layout; reproduce the npm-hoisted `tempoModerato` failure once to word the viem ≥ 2.44 note; confirm `attw --pack --profile esm-only` tolerates a sub-path whose only external import is an absent optional peer. |
| 2 | **Signing acceptance for the six unregistered chain ids** (295, 151, 1890, 8217, 146, 4663): a 0-value self-transfer on each — the sign call fails before broadcast if the id is rejected, so **no funds are needed**. Last real unknown in Risk 6. |
| 3 | **End-to-end send on Hedera 295, LightLink 1890, Redbelly 151** with `privyWalletOverride` pointing at the SDK's `rpcUrl`; devtools capture of which endpoint served `eth_estimateGas` / `eth_sendRawTransaction`. Redbelly first (identity-gated accounts). Needs dust funding and an owner — open question 4. |
| 4 | **Config + MFA on a live app**: (a) `disableAllExternalWallets` + `walletList: []` leaves the email modal functional; (b) an MFA-enrolled user signs through the wagmi `provider.request` path, **taking longer than 10 s** on the prompt; (c) does `onError` fire for recoverable in-modal errors (wrong OTP, failed send-code); (d) returning-user `ready` latency (sets `READY_RECONNECT_MS`) and demo bundle delta. |

### Step 1 — Workspace and packaging

- `pnpm-workspace.yaml`: under the existing "Legacy-line backports…" comment add `"jose@4.15.9"` and
  `"ua-parser-js@1.0.41"`, each with a one-line evidence note. Verified: exactly these two unblock the
  tree; OSV clean once the existing `ws@8` override applies.
- `packages/wallet-sdk-react/package.json`: `exports['./privy']`, `typesVersions['*'].privy`,
  `peerDependencies['@privy-io/react-auth'] = '^3.40.0'` **plus
  `peerDependenciesMeta['@privy-io/react-auth'].optional = true`**, devDependency pinned exact, `build` +=
  the isolation script. The `optional` flag is load-bearing: `.npmrc` sets `auto-install-peers = true`,
  so without it every pnpm consumer silently installs Privy. Assert at install level.
- `tsup.config.ts`: `entry` += `'src/privy/index.ts'` (the entry glob is `src/xchains/*/index.ts`).
  `knip.json`: `entry` += the same; `rules.optionalPeerDependencies: "warn"`.
- **`scripts/check-entry-isolation.mjs`** (package-local, `node scripts/…` — the `build` task declares no
  `inputs`, so root scripts sit outside its hash) `[rev3: simplified]`: **no file under `dist/` outside
  `dist/privy/`, `.mjs` or `.d.ts`, may contain `@privy-io/`**, and `dist/privy/index.mjs` must contain
  the bare `@privy-io/react-auth` specifier. esbuild emits a chunk only for code shared by ≥ 2 entries,
  so the rule cannot miss a leak (it can only over-report, e.g. if a later lazy import inside `privy/`
  gets its own chunk — adjust then). Require Privy types to be `import type` outside `src/privy/`.
  Simulate one deliberate leak locally before the first push; do not commit a fixture.
- **No `'use client'` restore step** `[rev3: cut]`. `privy()` returns functions and a component, which
  cannot cross the RSC boundary, so it can only be called from a client module; the main entry already
  ships without a directive (`2.0.0-rc.17` dist has none; tsup's rollup pass strips them) and partners
  wrap it in their own `'use client'` providers file (`apps/example-next-js-16/app/providers.tsx:1`).

### Step 2 — Core seam (main entry; no Privy imports)

- `src/types/config.ts`: `PrivySource` (opaque), `privy?: PrivySource` on `EvmAdapterFields`; export
  `type PrivySource` from `src/index.ts`.
- `src/providers/evm/evmSource.ts`: the internal seam types + the `setup` guard.
- `src/xchains/evm/EvmXService.ts`: internal `SODAX_EVM_CHAINS` + `resolveEvmRpcUrls()`;
  `createWagmiConfig` builds `chains` and `transports` from them (signature unchanged).
- `src/providers/evm/EvmProvider.tsx`: in the `useMemo`, call `setup(ctx)`, push the connector, return
  `{ wagmiConfig, Host }`; render `Host ? <Host>{children}</Host> : children`; add `config.privy` to the
  deps. If #163 landed first, place the Privy connector after its `extraConnectors`.
- **No change** to `EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`.

### Step 3 — Sub-path `src/privy/`

Modules as in Architecture. Connector facts: `type: 'privy'`, name `'Email (Privy)'`, inline SVG
data-URI icon, the method set above, `switchChain` per the four steps. **No `setup()` on the
connector**: zustand's `createStore` initialiser runs `connector.setup?.()` synchronously inside
`createConfig`, i.e. inside the `useMemo` StrictMode double-invokes, and a listener registered there
leaks from the discarded config and can eat the live connector's `onDisconnect()`. `connect()`
subscribes to `logout` before `attach()` and keeps the unsubscribe; `disconnect()` and the logout
handler unsubscribe. The bridge keeps every Privy hook handle behind a ref refreshed each render, so the
published ops object is referentially stable (Privy's handles are not, and every publish otherwise
re-fires every `waitFor` predicate).

### Step 4 — Tests (vitest, happy-dom; `checkTs` typechecks tests; `as unknown as` needs a why-comment)

`src/privy/privyConnector.test.ts` (real `@wagmi/core` `createConfig` with
`[privyConnector({ runtime: fake }), mock()]`, a real storage adapter, fake timers, **zero Privy
imports**), `src/privy/privyConfig.test.ts` (pure), `src/privy/PrivyBridge.test.tsx`, and an extension of
the existing `EvmProvider.test.tsx` (54 lines, #247 — extend, do not create).

1. `reconnect()` resolves `[]` and the runtime is **never requested** with no flag (AC5 regression proof).
2. A never-resolving readiness promise still lets `mock()` reach `connected` within `READY_RECONNECT_MS`.
3. `isAuthorized` truth table through the real flag adapter, incl. the **restart case** (wagmi cookie
   storage empty + localStorage flag present → `true`).
4. `storage.getItem` rejects → `reconnect()` called twice proves `isReconnecting` was not poisoned.
5. Seeded `wagmi.store` + `hydrate(config, { reconnectOnMount: true }).onMount()` — the real reload path.
6. Expired session over two consecutive loads: the second must not request the runtime.
7. `connector.uid` and `getProvider()` identity stable across logout → login as another user.
8. Delayed reconnect does not overwrite a user-selected wallet (supersession guard via `getState`).
9. `getChainId()` after a switch equals the target; no `change` if the fake never updates
   (→ `SwitchChainError`); a real `getConnectorClient()` after a switch returns a client, not
   `ConnectorChainMismatchError`; `getAccounts()`/`getChainId()` do not reject while briefly detached.
10. Pinned wallet disappears → detach + `onDisconnect`; a different embedded wallet appears while the
    pinned one is present → no `change`; `walletsReady === false` → no event.
11. **A pass-through `eth_signTypedData_v4` that resolves after `INTERNAL_CALL_MS` still resolves**; a
    connector-internal call past it rejects. `[rev3]`
12. `buildPrivyConfig`: `walletList` is `[]`, `disableAllExternalWallets` is `true`, **no `mfa` key, no
    recovery key**, `supportedChains` has the ids and order of `ctx.chains` with
    `privyWalletOverride.http[0] === ctx.rpcUrls[id]`, the input tuple is not mutated, `defaultChain`
    maps from the key.
13. `privy()`: empty `appId` throws; calling it N times creates no global state; every `EvmChainKey`'s
    `chainId` is in `SODAX_EVM_CHAINS` and vice versa. `[rev3]`
14. `EvmProvider.test.tsx`: with no `EVM.privy` the tree and the `createWagmiConfig` call are unchanged;
    with it, the connector reaches `createWagmiConfig`, `Host` renders inside the captured
    `WagmiProvider`, `ctx.rpcUrls` equals the transports' URLs; a malformed value warns and is skipped;
    `vi.doMock('@privy-io/react-auth', () => { throw })` never trips without `privy`.

`EvmHydrator.test.tsx` unchanged and green. Expect roughly a 1:1 test-to-source ratio (the precedent's
connector is 865 lines with an 865-line test).

### Step 5 — Demo proof (`apps/wallet-modal-example` only)

`src/privy-source.ts`: env-gated `import('@sodax/wallet-sdk-react/privy')`; `providers.tsx` maps the
optional source to `EVM.privy`; devDependency pinned exact; `.env.example`; an `App.tsx` panel with
sign-message and a 0-value `sendTransaction` on `useWalletProvider('EVM')`, plus the user's email via
`usePrivy()`. No fake runtime `[rev3: cut]` — reviewers use a free dev app. `apps/demo` and
`apps/example-next-js-16` stay Privy-free.

### Step 6 — Docs and skills (Docs Drift + AI-drift gates)

`packages/wallet-sdk-react/docs/WALLET_PRIVY.md` (new, `WALLETCONNECT.md`'s shape): install,
config, modal caveat, the Privy user (hooks from `@privy-io/react-auth`, conditional-mount gating, no
second `PrivyProvider`), plus:

- **Why an import** — a short FAQ from § Approach ("why not `privy: { appId }`").
- **Recovery** — paste-ready: *"A Privy embedded wallet has no password and no seed phrase. On Privy's
  default TEE execution environment the wallet is reachable only through the user's Privy login method —
  for this integration, their email one-time code — and there is no recovery factor to set: calling
  `setWalletRecovery()` on a TEE app throws `unsupported_wallet_type`, so this SDK never calls it. If a
  user permanently loses access to that email address, the wallet and everything in it are
  unrecoverable: Privy states there is no backdoor and cannot restore the account. Tell your users they
  can export their private key at any time, and that linking a second login method (only the user can do
  it) is the one durable fallback. Enable wallet MFA — passkey, TOTP or SMS — in your Privy dashboard so
  that a stolen browser session cannot sign or export on the user's behalf; Privy renders the MFA prompt
  itself inside the provider this SDK mounts."* Do not link a Privy "recovery" page — there is none.
- **Availability** — every signature is a round trip to Privy's API + TEE, so no signing while Privy is
  unreachable; cite status.privy.io's 90-day per-component uptime (no SLA below Enterprise); a SODAX
  flow is approve-then-intent, so an outage between the two leaves an approval granted and the intent
  unsignable while a MetaMask user on the same page is unaffected.
- **Returning users** — a reload restores the session without OTP; if Privy is slow to start, one click
  on "Email (Privy)" reconnects without a second OTP.
- **Leaving Privy** — addresses are bound to the `appId`; the exit is user-driven key export, which
  requires the user to still authenticate against that app, so dropping `EVM.privy` without a migration
  window strands those addresses.
- **Chain honesty** — 7 of the 14 chains are outside Privy's registry (146, 8217, 1890, 151, 295, 4663
  absent; id 999 there is Zora Goerli Testnet); this SDK sets `privyWalletOverride`; name the subset
  actually send-tested; transaction scanning will not resolve on those chains; with Privy's wallet UIs on,
  the HyperEVM fiat price line is known-wrong.
- **`'use client'` and Next** — the providers file must be a client file; keep `layout.tsx` server-side
  and Privy-free; set `turbopack.root` in a monorepo; gate UI on Privy `ready`.
- **npm/yarn partners** — top-level viem must be ≥ 2.44 (wording from spike item 1).
- **Cost** — metered per signing request, the `appId` owner is billed, the measured signature count of
  one SODAX swap/intent (count it in the demo); **link Privy's pricing page** rather than copying tiers.

`README.md` (the only file of this package mirrored to docs.sodax.com — `scripts/docs-pages-map.json:170`;
`WALLETCONNECT.md` is not mirrored either): feature bullet, quick-start comment, docs-table row with an
absolute GitHub URL, and **the four sentences that must not be missed** — custody model, no signing
during an outage, app-scoped addresses, who pays. No new map entry.

Also: `docs/CONFIGURE_PROVIDER.md` (section after WalletConnect), `docs/CONNECTORS.md:216` (name
`EVM.privy` — and `EVM.wagmiConnectors` once #163 lands — and state that `isAuthorized()` is
per-connector policy, must never throw and must be self-timed), `docs/WALLET_MODAL.md` (generalise the
render-null caveat to `'walletConnect' || PRIVY_CONNECTOR_ID`), `docs/SUB_PATH_EXPORTS.md`,
`docs/ARCHITECTURE.md`, `AGENTS.md`.

Skills: a granular skill + recipe registered in the eight files the repo expects (the six skill
indexes plus `packages/skills/AGENTS.md` and `packages/skills/README.md`); `check-ai-imports.sh:118-121`
already maps `@sodax/wallet-sdk-react/*`. Snippet gate: expect it to pass unchanged (the sub-path's
`.d.ts` resolves Privy through the package's own devDependency); only if `check:ai` fails, mark the
Privy blocks `// @ai-snippets-skip`. Run `pnpm --filter @sodax/skills check:ai` and
`pnpm check:doc-links` before every push.

### Step 7 — Gates, PR

**Commit order, each one green** (`verify-dist-exports.mjs` fails on a declared `./privy` with no
`dist/privy`, so exports and entry land together):

1. `chore(workspace): exclude jose@4.15.9 and ua-parser-js@1.0.41 from trustPolicy no-downgrade` — the
   two entries + the exact devDependency + lockfile.
2. `feat(wallet-sdk-react): add an internal EVM wallet-source seam` — types, `evmSource.ts`,
   `EvmXService` extraction, `EvmProvider` + its test; **no Privy anywhere**. The commit to read hardest.
3. `feat(wallet-sdk-react): add opt-in Privy email login as an EVM wallet source` — `src/privy/` with
   the packaging edits (exports, typesVersions, tsup entry, knip, isolation script) and its tests.
4. `chore(wallet-modal-example): env-gated Privy demo`.
5. `docs(wallet-sdk-react): add Privy partner guide and provider docs`.
6. `docs(skills): add wallet-sdk-react privy skill and recipe`.

**CI**: add `--filter='./apps/wallet-modal-example'` to *Build Apps* with `VITE_PRIVY_APP_ID` unset so
the demo keeps compiling. **No canary workflow** `[rev3: cut]` — the signal comes from the ordinary
devDependency-bump PR once a Privy version clears the 14-day cooldown.

**PR body**: spike results (incl. the Turbopack go/no-go and the > 10 s MFA signing run), the dependency
delta a reviewer will ask about — a fourth `@walletconnect/core` line (Privy pins
`@walletconnect/{ethereum,universal}-provider` at exactly **2.22.4** against wagmi's 2.21.1; the tree
already carries 2.11.2 and 2.21.0), a third `@coinbase/wallet-sdk`, a second **viem** (2.56.0 vs
2.29.2), styled-components, x402, `@stripe/*`, hcaptcha, noting these are **static** top-level imports
of Privy's `dist/esm/index.mjs` — evidence for both excludes, the tested Privy version, and the open
questions resolved or deferred. `@sodax/wallet-sdk-react` stays on `2.0.0-rc`; additive → no `!`.

**Effort**: ≈ 8 working days (spike 1, workspace + seam 1, sub-path 2.5, tests 2, demo 0.5, docs +
skills 1.5, gates/PR 0.5) — re-estimate after the spike.

## Verification

| AC | Mechanism | Proof |
| --- | --- | --- |
| **AC1** list entry only when `EVM.privy` is set; no Privy code otherwise | `EvmProvider` pushes the connector only from `setup`; `EvmHydrator` mirrors `useConnectors()` unchanged; no `@privy-io` outside `dist/privy/` | `EvmProvider.test.tsx`, `check-entry-isolation.mjs`, Privy-free `apps/demo` + Next 16 builds |
| **AC2** (rewritten, below) | `connect()` → `login({ loginMethods: ['email'] })` → `onComplete` → embedded wallet (`createOnLogin` + `linkedAccounts`-gated `createWallet`) → `getEthereumProvider()` → wagmi `connected` → `xConnectorId: 'privy'`. No recovery factor is set, because on TEE there is none | connector + bridge tests; demo with a fresh test email |
| **AC3** same address on return | `reconnect()` → stable deferred `getProvider()` → total `isAuthorized()` on a **localStorage** flag → `connect({ isReconnecting })` bounded by `READY_RECONNECT_MS`; `walletIndex 0` | reconnect tests incl. the restart case; demo reload under both `reconnectOnMount` values; QA 16, 17, 21; second `appId` → different address |
| **AC4** a signed SODAX action via `useWalletProvider('EVM')` | `useWalletClient()` over `custom(deferredProvider)`; `EvmHydrator` builds `EvmWalletProvider` as for MetaMask | sign the intent's typed data through `useWalletProvider('EVM')` **plus** one funded transaction on the default chain, tx hash + screenshot in the PR body (funding per open question 4) |
| **AC5** injected + WC keep working | mipd on; `walletConnect()` kept; Privy appended; settled 8; bounded delay (§ Coexistence); supersession guard | `EvmProvider.test.tsx`; unit case 1; QA 9, 10, 18 |
| **AC6** partner docs | `WALLET_PRIVY.md` + README (mirrored) + five docs + AGENTS + skills | docs-drift, doc-links, AI-drift, `check:ai` |

**Post this AC2 rewrite as a comment on #456 — do not edit the issue body:**

> **AC 2:** Choosing that connector opens Privy's email one-time-code login and a new user ends with an
> automatically provisioned embedded EVM wallet surfaced as a connected EVM XAccount — with no password
> or recovery factor set, because on Privy's default TEE execution environment an embedded wallet has
> none (`setWalletRecovery()` throws `unsupported_wallet_type`) and the wallet is reachable only via the
> user's Privy login method.

### QA matrix (manual, demo app on a dev Privy app)

| # | Scenario | Expected |
| - | -------- | -------- |
| 1 | No `EVM.privy`; `apps/demo` and the Next 16 example build, Privy not installed | Builds pass; no `@privy-io` in output |
| 2 | `reconnectOnMount: false` (default) with persisted `xConnections.EVM`, reload | Hydrator retry reconnects Privy without OTP |
| 3 | `reconnectOnMount: true` + `ssr: true` + cookie `initialState`, throwaway Next 16 app | First paint `reconnecting` → connected; no hydration warning |
| 4 | Session expired (clear `privy:*` keys), reload | Flag cleared, stale store entry cleared, no stall, no modal |
| 5 | Persisted Privy + iframe blocked (CSP/adblock) + MetaMask authorized | MetaMask reached within `READY_RECONNECT_MS` |
| 6 | Persisted MetaMask + stale Privy flag | MetaMask restored; Privy does not clobber it |
| 7 | Privy becomes ready after the reconnect budget | Shows disconnected; one click on "Email (Privy)" connects without OTP |
| 8 | Close the dialog mid-OTP; wrong OTP 5×; OTP after 2+ min | Close → modal `error` → `walletSelect`, retry works; wrong OTP stays in-modal; late OTP succeeds |
| 9 | Disconnect from SODAX UI | `usePrivy().authenticated === false`; next click asks OTP |
| 10 | Partner code calls `logout()` in this tab | wagmi `disconnected`; store and flag cleared |
| 11 | MetaMask disconnect then Privy login | Privy connects; MetaMask does not ghost-reconnect |
| 12 | MetaMask → WC → Privy → MetaMask in one session | `xConnectorId` follows the last connect; signing uses that wallet; no *"WalletConnect Core is already initialized"* warning |
| 13 | Chain switch to each of the 14 chains; send on non-default chains | No 4901; record which chains Privy can send on |
| 14 | Same email on a second `appId` | Different address (documented) |
| 15 | CSP block from `WALLET_PRIVY.md` applied to the demo | Iframe + Turnstile load; login and signing work |
| 16 | Connect → **fully quit the browser** → reopen | Same address without OTP; `xwagmi-store` intact |
| 17 | Connect → disconnect → quit → reopen | Still disconnected (catches a missed `clearFlag()`) |
| 18 | Privy unreachable while connected (block `auth.privy.io` + `*.rpc.privy.systems`) | Sign rejects clearly; MetaMask/WC usable — **record what happens**; the Availability section states it |
| 19 | MFA-enrolled user signs twice, taking > 10 s on the first prompt | Both succeed; no timeout |
| 20 | Partner calls `useCreateWallet({ createAdditional })` and `useLogin({ onComplete })` from children | No spurious disconnect; no render throw |
| 21 | Fresh browser, all storage cleared, same email | Same address as before |
| 22 | `disableAllExternalWallets` + empty `walletList` | Email modal fully functional |
| 23 | Chrome with MetaMask + Hana; Safari without extensions | Privy-only flow works in Safari |

## Risks

1. **The issue's AC2 premise is unimplementable.** `setWalletRecovery()` throws on TEE; the SDK never
   calls it; AC2 is rewritten above. TEE default, on-device with automatic recovery, on-device with
   user-managed recovery — **in all three the SDK ships nothing**; on-device is a Privy-support-gated,
   one-way, per-app switch SODAX cannot pick for a partner. Decision 0003 records the supersession of 0001.
2. **Two viem copies.** Privy hard-depends on viem 2.56.0; npm/yarn-hoisted partners crash when their
   top-level viem is < 2.44. This is an ESM link-time error, so **no import-time guard can catch it**
   `[rev3]` — spike item 1 + the documented floor + a catalog bump raised in the PR thread. **Do not add
   zustand to `pnpm.overrides`**: Privy needs zustand 5, the SDK pins 4.5.2.
3. **Privy ships weekly; the 14-day cooldown keeps the pin 2–3 minors behind; `^3.40.0` admits untested
   versions.** Privy hooks confined to `PrivyBridge.tsx` behind the runtime interface; tested version
   stated in the docs; no `@experimental` API except `disableAllExternalWallets`, pinned and QA'd.
4. **Sequential `reconnect()` delays other wallets by up to `READY_RECONNECT_MS` when the flag is set** —
   bounded, stated in § Coexistence and in the docs.
5. **A pending connect with no Privy UI on screen.** `useWalletModal`'s `isStillCurrent()` only drops
   the pending transition and `@wagmi/core`'s `connect` has no abort input, so the connector stands
   itself down (supersession guard) and `disconnect()` aborts. Exposure: the readiness wait before
   `login()` and the wallet wait after `onComplete` — both timed.
6. **Privy's server-side acceptance of an unregistered chain id during signing.** Client-side RPC is
   settled by `privyWalletOverride`, but on TEE the final broadcast is server-side via CAIP-2 for 295,
   151, 1890, 8217, 146, 4663 (Robinhood 4663 has a first-party Privy reference). Spike item 2. Hedera
   decimals are not a risk (viem's `hedera` declares 18; `EvmSpokeService.ts:42-54` scales `msg.value`).
   **LightLink 1890 is the weak one**: its public replicator answers neither `eth_feeHistory` nor
   `eth_maxPriorityFeePerGas` and blocks carry no `baseFeePerGas`, so viem falls back to legacy txs.
7. **Supply-chain review load** (+53 names; two exact excludes) — carried only by partners who opt in.
8. **`ready === true` does not mean the wallet channel works.** The hidden auth iframe renders eagerly
   for every visitor of a Privy-enabled app; the handshake retries ~40 s then only warns. Mitigated by
   the timed `getEthereumProvider()` in `connect()`. A lazy `PrivyProvider` mount is a later perf
   option; the connector only talks to the runtime, so it needs no V1 accommodation `[rev3]`.
9. **Precedents reviewed and rejected**: `pinto-org/interface` (`isAuthorized()` reads a React closure
   that is `undefined` at reconnect time; `disconnect()` calls `logout()`; `getProvider()` builds a new
   object per call); `gap-app-v2` (`isAuthorized() { return true }`); sushiswap's error mapping (rejects
   on any `PrivyErrorCode`), rdns-shaped id and storage-writing `isAuthorized`.
10. **PR #163 collision** — text only; see § Relationship to PR #163.

## Open questions for product

1. **Ship on Privy's default TEE environment** — accepting that a lost email is a lost wallet, with no
   support path? (Alternative: ask Privy for on-device execution — one-way, per-app, support-gated.)
   **No longer blocks anything.** Sub-decisions: require wallet MFA on a SODAX-blessed app and prompt
   enrolment in the demo? Tell users to export their key as the documented fallback?
2. **Whose `appId`?** Partner-owned (design default: partner controls origins, MFA, cookies, legal URLs
   and **billing**; addresses differ per partner) or SODAX-provided (one wallet across integrations;
   SODAX allow-lists every origin and pays). Privy meters **per signing request** and one SODAX intent
   costs several.
3. **Disconnect semantics.** V1 signs the user out of Privy. OK, or do partners using Privy for app
   auth need a keep-session mode?
4. **Which chains must be send-verified for V1, and who funds them?** Decides spike item 3's scope.
5. **Publish the guide as written** — no signing while Privy is unreachable (mid-intent included), a
   lost email is a lost wallet? Blocks *publishing*, not writing.
6. **Demo scope.** Privy only in `apps/wallet-modal-example`, or also a swap-intent demo in `apps/demo`?
7. **Dashboard ownership for PR QA and the demo `.env`** — pre-merge, not pre-spike; the PR must not
   ship pointing at a personal `appId`.
8. **Defaults to confirm in review**: `showWalletUIs` left to the dashboard; Sonic as default chain;
   raising the catalog viem to ≥ 2.44 in a follow-up.

## Out of scope (V1)

Solana/other-chain Privy wallets; a public generic source/host extension point; the WalletConnect-as-
source refactor; `@privy-io/wagmi`, `useSetActiveWallet`, smart-account connectors; headless
`useLoginWithEmail` and a SODAX-styled OTP UI; recovery enrolment, keep-session, an SDK
`usePrivyUser()`; catalog viem bump; Privy in `apps/demo` / the Next example; a SODAX-provided shared
`appId`; Global Wallets; the lazy `PrivyProvider` mount; replacing sodax.com's in-house email login.

**No SDK surface for recovery, MFA or key export** — partners import `useExportWallet` from
`@privy-io/react-auth` inside the SDK-mounted provider. **Gas sponsorship is structurally unreachable
through a wagmi connector**: `sponsor` exists only as a per-call option on Privy's own
`useSendTransaction`, needs TEE-stack wallets and dashboard-configured chains, and routes server-side
via CAIP-2 — the EIP-1193 path a connector drives never sets it.

## Removed in rev 3 — do not re-add

| Removed | Why |
| ------- | --- |
| Four public timeout options | No partner asked; a public knob is permanent. Internal constants |
| Five exported error classes, `PRIVY_CONNECTOR_NAME` | Diagnostics nobody `instanceof`s; wagmi's catch needs the type, not an export |
| `defaultChainId: number` | `defaultChain: EvmChainKey` — consistent with `EVM.chains`, compile-time checked |
| "Call `privy()` once", per-`appId` instance warning, `Map<appId, owner>` mount guard | Runtime is per mount; `privy()` is pure |
| `PrivyHostNotMountedError` + synchronous `hostMounted` check | The host is rendered by `EvmProvider` itself; the state cannot occur |
| `EvmSourceHost` error boundary | Settled 11 |
| `sessionProbe.ts` | Forbidden at the one place it looked useful |
| Late-readiness self-`reconnect()` | Raced wagmi internals; the one-click fallback is free |
| Per-request timeout on pass-through requests | Rejected MFA / confirmation-modal users after 10 s |
| Import-time `tempoModerato` guard | ESM link errors happen before any module body runs |
| `scripts/restore-use-client.mjs` | `privy()` can only be called from a client module anyway |
| Chunk-graph-walk isolation gate + committed negative fixture | A conservative scan says the same thing in ~15 lines |
| Public `SODAX_EVM_CHAINS` export | Only the seam needs it |
| Demo fake runtime, `dist/assets` isolation script, canary workflow | Redundant with unit tests / the package gate / the bump PR |
| Copied Privy pricing tiers | Stale on arrival; link instead |
