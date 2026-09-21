---
type: plan
repo: sodax-sdks
github: 456
updated: 2026-09-18
related_issues: [gh-1069, gh-1024]
related_decisions: [0003, 0001]
---

# Plan — Privy as an opt-in EVM wallet source in `@sodax/wallet-sdk-react`

**Revision 2 (2026-09-18).** Rev 1 came from first-hand source reads, a six-topic research sweep,
three judged architectures and an adversarial pass. Rev 2 folds in a second round: five more research
topics (chain coverage, recovery/MFA/TEE, session+mount, Next/Turbopack/SSR, a line-by-line read of
the production precedent), a five-lens review of rev 1 itself, and my own re-reads. **Five things rev 1
called settled were wrong** — they are corrected in place below and flagged `[rev2]`. The evidence trail
is `plan-revision-2.md`; the rev-1 long-form design is `plan-architecture.md` (historical: where it
disagrees with this file, this file wins); external facts with sources are in `research.md`.

Privy versions cited: `@privy-io/react-auth@3.43.0`, `@privy-io/chains@0.6.0`,
`@privy-io/js-sdk-core@0.76.0`, read 2026-09-18. **Privy ships weekly — re-stamp every Privy citation
on the spike day.** Repo baseline: `origin/main 898b7e6a`.

## Goal

Partners who set `EVM.privy` get an **"Email (Privy)"** entry in the same EVM wallet list as MetaMask,
Hana and WalletConnect. Picking it runs Privy's email one-time-code login, provisions an embedded EVM
wallet, and from then on that wallet signs SODAX intents through the unchanged `EvmWalletProvider`
slot. Partners who omit `EVM.privy` load **zero** Privy code and see no Privy entry. V1 is EVM only.

## Approach

### The decision

**Privy is one more wagmi connector, not a provider swap.** `EvmProvider` appends a Privy connector
(`id: 'privy'`, `name: 'Email (Privy)'`) to the same `connectors` array it already fills with
`walletConnect()`, and mounts a small React host (`PrivyProvider` + a bridge) *inside* `WagmiProvider`,
around the children but **not** around `EvmHydrator` / `EvmActions`, behind an error boundary. Both
objects come from `privy({ appId })` exported by a new sub-path **`@sodax/wallet-sdk-react/privy`**.
`@privy-io/react-auth` is an optional peer; **`@privy-io/wagmi` is not used.**

This shape now has a production precedent: sushiswap ships exactly it on `master`
(`apps/web/src/lib/wallet/privy/privy-evm-connector.ts` @ `7fbb578`) — framework-free runtime store,
lazy runtime gate, deferred provider shell, per-attempt `AbortController`, untimed login modal, a
`getWagmiState` injection to avoid clobbering a user-selected wallet, and a 21-case unit suite that
uses real `@wagmi/core` with zero Privy imports.

### Why not the issue's assumed design (`@privy-io/wagmi`)

Verified in the published 4.0.17 source:
- `createConfig` **drops every non-mock connector** and sets `multiInjectedProviderDiscovery: false`.
- `useSyncPrivyWallets` calls `config._internal.connectors.setState(list)` on every `useWallets()`
  change — it **replaces** the list, so even our own `createConfig` is wiped on first sync. AC5 cannot
  hold.
- `WagmiProvider` forces `reconnectOnMount: false`.
- It peer-pins **`viem 2.56.0` exactly**; the catalog is 2.29.2.

### Why a sub-path, not a dynamic import and not a new package

- A string-literal `import('@privy-io/react-auth')` from the **main entry** breaks non-Privy partners
  on webpack 5 unless they add `externals` (verified). Turbopack offers no portable escape hatch:
  `turbopackOptional` is Turbopack-only, `webpackOptional` is supported by neither, and both apply only
  to dynamic imports.
- A sub-path entry keeps the main entry and every `./xchains/*` entry free of `@privy-io/*`. **Caveat
  `[rev2]`:** with `splitting: true`, a single *value* import of Privy from any module the barrel also
  reaches hoists the bare specifier into a shared chunk the barrel imports (reproduced both ways in a
  fixture). `import type` is erased and safe. That is why the isolation gate must be a transitive
  chunk-graph walk, not a grep (Step 1).
- **A new package `@sodax/wallet-privy` is rejected**, even though `@sodax/wallet-hw` (PR #163) sets a
  precedent for one. `scripts/release.mjs` `discoverPublishablePackages()` walks `packages/*` for any
  non-private `@sodax/*` manifest, rejects a version that is not `X.Y.Z[-rc.N]`
  (`scripts/config-version.mjs:15`), and `packageListErrors()` requires `scripts/bump-versions.sh:7`
  and `.github/workflows/sdks-publish.yml:30,72` to list exactly that set — asserted against the real
  repo root by `scripts/release.test.mjs:306-311`, which runs inside `pnpm test` in CI
  (`.github/workflows/ci.yml:234`). A new package therefore costs three file edits plus a tenth aligned
  version, for zero isolation gain. The hw add-on is also a *pure connector* package; Privy needs a
  React provider mounted inside `EvmProvider`, which a peer-only connector package cannot give.

### Relationship to PR #163 `feat/wallet-hw` `[rev2]`

PR #163 (open since 2026-05-27, last CI run 2026-05-27, `mergeable: CONFLICTING`, no reviews) adds
`EVM.wagmiConnectors?: CreateConnectorFn[]` to the same `EvmAdapterFields` block and pushes into the
same `EvmProvider` `useMemo` this plan edits. **The two compose; only the text conflicts.**

- This PR does not wait on #163, and #163 must rebase on `main` regardless — its diff predates #443
  (no `persistKey` in the `createWagmiConfig` call) and it adds `EvmProvider.test.tsx` as a new file
  although that file has existed since #247.
- If #163 lands first: `privy()` returns something that *could* be passed through `EVM.wagmiConnectors`,
  and core would keep only the Host mount. **We still keep the single `EVM.privy` slot**, because a
  partner who passes the connector but forgets the host gets a wallet-list entry that throws on click,
  and because the host needs `ctx.evmConfig` (below). One field makes the broken state unrepresentable.
- The decisive technical reason `EVM.privy` cannot collapse into `wagmiConnectors`: `createWagmiConfig`
  writes the partner's per-chain `rpcUrl` into **`transports` only**, never into the viem `Chain`
  objects (`EvmXService.ts:99-114` vs `:123-138`). A wagmi connector sees only `config.chains`, which
  carries default RPCs. Privy resolves RPC from `chain.rpcUrls.privyWalletOverride`, so the host must
  receive `EvmTypeConfig['chains']` — a value that exists only inside `EvmProvider`.
- Note for **their** PR thread (not a new issue): `packages/wallet-hw/package.json` is
  `"private": false` at `0.0.1-test`, which fails `pnpm test` on merge through the chain above; the
  gate landed in #407 on 2026-08-30, after that branch's last CI run.

### What stays untouched (the regression proof)

`EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`, `useXWalletStore.ts`, `useWalletModal`,
`useEvmSwitchChain`, `EvmWalletProvider` (core). Privy rides wagmi's `useConnectors` / `useAccount` /
`useWalletClient` / `reconnect()` exactly as MetaMask does; `EvmHydrator.test.tsx` must pass unchanged.
Without `EVM.privy`, `EvmProvider` renders `{children}` byte-identically to today — **no boundary is
constructed** `[rev2]`.

### Settled choices — do not re-litigate

1. **Modal login**, `login({ loginMethods: ['email'] })`, not headless `useLoginWithEmail`
   (`@experimental` in the 3.43 types; `createOnLogin` does not fire for headless flows).
   `useLogin().login` is synchronous and returns `void`, which is why a deferred bridge is structurally
   required; never pass it as an `onClick` handler (it has a `MouseEvent` overload).
2. **Disconnect = Privy sign-out** in V1 (shared-device safety; open question 3 can relax it).
3. **Partner-owned `appId`** is the design default (open question 2 can change it; no code depends on it).
4. **No recovery/password API in V1, and the SDK never calls `setWalletRecovery()`** `[rev2]`. On
   Privy's default TEE execution that call **throws** `PrivyErrorCode.UNSUPPORTED_WALLET_TYPE` before
   any UI — *"User owned wallet recovery is only supported for on-device execution and this app uses TEE
   execution"* (`@privy-io/react-auth@3.43.0 dist/esm/index-BcpLdFr2.mjs`, byte-identical in 3.40.0; the
   `.d.ts` doc-comment at `dist/dts/index.d.ts:3399` is stale and still promises a password modal). Even
   on an on-device app the SDK could not configure recovery from code: `requireUserOwnedRecoveryOnCreate`
   and `userOwnedRecoveryOptions` live on the internal dashboard `AppConfig`
   (`dist/dts/types-ChU9ocPQ.d.ts:2148-2149`), not on `PrivyClientConfig` (`:1779-1860`) — do not re-add
   them from a doc example. Consequence: **the issue's AC2 and game-plan step 4 are struck, not softened**
   (see Verification), and the docs can be written today.
5. **`showWalletUIs` is not defaulted** by the SDK; the dashboard setting applies unless the partner
   passes it.
6. **Sonic (146)** is the embedded wallet's default chain, and `supportedChains` mirrors the SDK's
   14-chain wagmi tuple. **Mirroring is necessary but not sufficient** `[rev2]` — the tuple must be
   decorated with `rpcUrls.privyWalletOverride` (see Architecture), and chain id 999 collides with **Zora
   Goerli Testnet** inside Privy's own default registry.
7. **No changeset** (PR #407 removed them); release notes come from commit subjects. No `#456` in
   subjects; no attribution trailers.
8. **The derived `PrivyProvider` config disables Privy's own external-wallet surface** `[rev2]`:
   `appearance.walletList: []` and
   `externalWallets: { disableAllExternalWallets: true, walletConnect: { enabled: false } }`.
   `loginMethods: ['email']` does **not** shrink `walletList` — its default is a nine-entry list
   including `wallet_connect`, `coinbase_wallet` and `base_account`, and
   `externalWallets.walletConnect.enabled` defaults to `true`
   (`dist/esm/privy-context-BRYUJfjv.mjs`; observed live on an anonymous `demo.privy.io` load firing
   `explorer-api.walletconnect.com/v3/wallets` and writing a Base Account store with no session). Without
   these keys, mounting Privy stands up a second WalletConnect v2 provider, a Coinbase Wallet SDK and a
   Base Account SDK next to the SDK's own `walletConnect()`. `disableAllExternalWallets` short-circuits
   Privy's connector manager before any provider detection and is `@experimental`
   (`dist/dts/types-ChU9ocPQ.d.ts:1490`) — pin the Privy version and add a QA row.
   The partner's `appearance` passthrough must not be allowed to re-enable `walletList`.
9. **The SDK never sets `mfa.noPromptOnMfaRequired`** `[rev2]`. It defaults to `false`, so Privy raises
   its own MFA modal from inside the SDK-mounted provider and wallet MFA works end to end with zero SDK
   code; setting it `true` would silently break signing for MFA-enrolled users. Assert in a unit test
   that the built config carries **no `mfa` key and no recovery key**.

## Public API

```ts
// @sodax/wallet-sdk-react (main entry) — src/types/config.ts; no Privy imports, no Privy types
export type EvmWalletSourceContext = {
  /** The SDK's wagmi chain tuple. Named `wagmiChains` because `EvmTypeConfig['chains']` already
   *  means the partner's per-chain rpcUrl/defaults record, and the Privy host builds a third,
   *  decorated array from both. */
  readonly wagmiChains: readonly [Chain, ...Chain[]];
  /** Carries the partner rpcUrl map that feeds `privyWalletOverride`. */
  readonly evmConfig: Readonly<EvmTypeConfig>;
};

/** @internal One structural contract behind `EVM.privy`; not a public extension point in V1.
 *  Branded with a non-exported nominal marker so only `privy()` can produce one. */
export type EvmWalletSource = {
  readonly createConnector: (ctx: EvmWalletSourceContext) => CreateConnectorFn;
  /** Mounted inside <WagmiProvider> around children, never around Hydrator/Actions. */
  readonly Host?: ComponentType<{ ctx: EvmWalletSourceContext; children?: ReactNode }>;
};

export type EvmAdapterFields = {
  /* … existing fields … */
  /**
   * Opt-in Privy email login as an EVM wallet source (connector id `privy`, "Email (Privy)").
   * Build it with `privy()` from '@sodax/wallet-sdk-react/privy'; requires `@privy-io/react-auth` ^3.40.
   * Omit it and no Privy code is loaded.
   */
  privy?: EvmWalletSource;
};

// @sodax/wallet-sdk-react/privy — src/privy/index.ts ('use client')
export type PrivyOptions = {
  appId: string;
  clientId?: string;
  /** Initial chain of the embedded wallet; must be one of the SDK's EVM chains. @default 146 (Sonic) */
  defaultChainId?: number;
  /** Show Privy's signing UI. Omitted → the Privy dashboard setting applies. */
  showWalletUIs?: boolean;
  appearance?: PrivyClientConfig['appearance'];   // `walletList` is always overridden to []
  legal?: PrivyClientConfig['legal'];
  // Timeouts — one per non-interactive phase. The login modal is NEVER timed out, only cancelled.
  readyTimeoutMs?: number;         // default 3_000  — host ready, RECONNECT path
  connectReadyTimeoutMs?: number;  // default 15_000 — host ready, interactive connect
  walletTimeoutMs?: number;        // default 30_000 — embedded wallet materialisation after login
  providerTimeoutMs?: number;      // default 10_000 — any single provider/runtime request
};

export const PRIVY_CONNECTOR_ID = 'privy';
export const PRIVY_CONNECTOR_NAME = 'Email (Privy)';
export function privy(options: PrivyOptions): EvmWalletSource;
export class PrivyHostNotMountedError extends Error {}
export class PrivyConnectorCancelledError extends Error {}
export class PrivyRuntimeWaitTimeoutError extends Error {}   // "runtime never became usable"
export class PrivyConnectorSupersededError extends UserRejectedRequestError {}
```

**Timeout rule, in prose:** interactive phases are cancellable, never timed out — users take minutes to
enter a code. Every non-interactive phase gets its own fresh deadline. `[rev2: replaces rev 1's single
connectTimeoutMs of 300 s]`

Partner usage (the copy-paste target for `WALLET_PRIVY.md`):

```ts
// pnpm add @sodax/wallet-sdk-react @privy-io/react-auth
import { SodaxWalletProvider, type SodaxWalletConfig } from '@sodax/wallet-sdk-react';
import { privy } from '@sodax/wallet-sdk-react/privy';

// Call privy() ONCE — module scope or useMemo/useRef. A new object every render rebuilds the
// wagmi config and remounts PrivyProvider.
const privySource = privy({ appId: PRIVY_APP_ID, legal: { termsAndConditionsUrl: '/terms' } });

const config: SodaxWalletConfig = {
  EVM: {
    walletConnect: { projectId: WC_PROJECT_ID },   // still works (AC5)
    privy: privySource,
    chains: { /* rpcUrl overrides as today — these now reach Privy too */ },
  },
};
// Modal caveat, same as WalletConnect: render nothing while
// state.kind === 'connecting' && state.connector.id === 'privy'
```

Every exported function on the sub-path carries an explicit return type (tsup dts emits TS2742/TS4058
on inferred Privy types).

## Architecture

### Mount tree

With `EVM.privy` set. Without it, `EvmProvider` renders `{children}` exactly as today.

```
<WalletConfigProvider>
  <EvmProvider>
    <QueryClientProvider client={ownQueryClient}>          // Privy has no react-query dep — no collision
      <WagmiProvider reconnectOnMount config={createWagmiConfig(chains, { connectors: [walletConnect?, privyConnector] })} initialState>
        <EvmHydrator/> <EvmActions/>                       // unchanged; EIP-6963 (mipd) stays ON
        {source?.Host                                       // boundary exists ONLY when a Host does [rev2]
          ? <EvmSourceHost source ctx>
              <PrivyHost ctx>                               // <PrivyProvider appId clientId config={derived}>
                <PrivyBridge/>                              // the ONLY place Privy hooks run
                {children}                                  // = SuiProvider → SolanaProvider → partner children
              </PrivyHost>                                  //   (SodaxWalletProvider.tsx:48-60)
            </EvmSourceHost>
          : children}
```

`EvmSourceHost`'s `console.error` must **not** assert the Host is at fault: the boundary also catches
throws from `SuiProvider` (which throws by design on bad `grpcUrl`), `SolanaProvider` and the partner
subtree. Print the caught error and say the source may be the subtree below `SodaxWalletProvider`.

**`usePrivy()` in children — the exact contract** `[rev2]`. Partners may call `usePrivy()` and
`useWallets()` there; outside a provider they fall back to Privy's context defaults (`ready: false`,
`authenticated: false`, `user: null`) and `useWallets()` warns. They must **not** call the callback
forms — `useLogin({…})`, `useLogout({…})`, `useCreateWallet({…})`, `useLinkAccount({…})` — because those
dereference an events context that is `undefined` without a provider and throw during render, and an
error thrown while a boundary renders its fallback is not caught by that boundary. Verified against
3.43.0; re-assert against the pinned version in the spike.

### Sub-path modules (`src/privy/`)

`index.ts` (factory; no JSX), `runtime.ts` (framework-free store: snapshot, `subscribe`,
`waitFor(pred, { timeoutMs })` **with an error channel**, pending-login deferred, `logout` event),
`deferredProvider.ts`, `privyConnector.ts`, `PrivyHost.tsx` (`PrivyProvider` + `PrivyBridge`),
`errors.ts`, `icon.ts`. `sessionProbe.ts` is **optional and mount-gate only — never consulted by
`isAuthorized()`** `[rev2]`.

### Derived `PrivyProvider` config

```
loginMethods: ['email']
embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs? }
appearance: { ...partnerAppearance, walletList: [] }                          // [rev2]
externalWallets: { disableAllExternalWallets: true, walletConnect: { enabled: false } }  // [rev2]
supportedChains: <decorated array, below>                                      // [rev2]
defaultChain: chain whose id === opts.defaultChainId ?? 146
legal: passthrough
// no `mfa` key, no recovery key — ever
```

**`supportedChains` must carry the partner's RPC** `[rev2]`. Build a **separate** array, never mutate the
shared tuple:

```
chain → { ...chain, rpcUrls: { ...chain.rpcUrls, privyWalletOverride: { http: [url] } } }
url  = getRpcUrl(ctx.evmConfig.chains?.[chainKeyOf(chain.id)]) ?? chain.rpcUrls.default.http[0]
```

memoised on `ctx`, injected for **all 14 chains unconditionally**. Reasons:
1. Privy's embedded wallet resolves RPC as `privyWalletOverride → dashboard rpcConfig.rpcUrls[chainId] →
   rpcUrls.privy + '?privyAppId=' → public ?? default`, and that one client does **both**
   `prepareTransactionRequest` (nonce/gas/fees) and the broadcast — wagmi's `transports` are bypassed
   entirely on the Privy path.
2. `rpcConfig` is dashboard-supplied, not a `PrivyClientConfig` field, so the chain object is the only
   in-code lever.
3. An override makes `dedupeSupportedChains` a no-op, which stops Privy grafting its shared
   `*.rpc.privy.systems` proxy onto ids 1/10/56/137/8453/42161 and immunises the id-999 Zora Goerli
   collision.

`viem@2.29.2`'s `Chain.rpcUrls` carries `[key: string]: ChainRpcUrls`, so this needs no cast and **no
`@privy-io/chains` dependency**; wagmi ignores the extra key because it uses the explicit `transports`
map. `getRpcUrl` already exists (`src/utils/walletRpcConfig.ts:24`) and is what `createWagmiConfig` uses,
so reads and sends share one source of truth.

### Lifecycle — first login (AC2)

`useXConnect(privyEntry)` → `chainActions.connect('privy')` → `connectAsync({ connector })` →
`privyConnector.connect({ chainId })`:

1. Read `hostMounted` **synchronously** from the snapshot; absent → throw `PrivyHostNotMountedError`
   immediately (a partner who forgot the provider must not wait out a deadline). Then await `ready`
   bounded by `connectReadyTimeoutMs`. `waitFor` has an error channel: `usePrivy().error` is published
   into the snapshot and every waiter rejects with the real cause — a wrong `appId`
   (`MISSING_OR_INVALID_PRIVY_APP_ID`) must not surface as a timeout. `[rev2]`
2. **Branch on `authenticated` first.** `authenticated && embedded` → skip login. For wallet creation,
   gate on a `hasEmbeddedAccount` flag the bridge derives from
   `user.linkedAccounts.some(a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum')`
   — **not** on `!embedded` from `useWallets()`, which lags Privy's own lookup, because `createWallet()`
   **throws** for a user who already has one. Only call it on positive evidence that none exists; never
   on a `waitFor` timeout. `[rev2]`
   (On whether an already-authenticated `login()` fires a callback, the 3.43.0 typedoc and the observed
   behaviour disagree; branching on `authenticated` makes it moot.)
3. Otherwise `ops.login()`: the bridge stores a pending deferred and calls
   `login({ loginMethods: ['email'] })` with a **ref-stable callbacks object**. Resolve on `onComplete`.
   **Reject only on `onError('exited_auth_flow')`** → viem `UserRejectedRequestError` so `useWalletModal`
   reaches `error`; other codes (`invalid_credentials`, `invalid_captcha`, `captcha_timeout`,
   `too_many_requests`, `disallowed_plus_email`) are recoverable in-modal and must not reject. **Do not
   copy the precedent here — it rejects on any `PrivyErrorCode`.** No timeout; cancellation only, via a
   per-attempt `AbortController`.
4. `await waitFor(s => s.walletsReady && s.embedded, walletTimeoutMs)`.
5. `provider = await embedded.getEthereumProvider()`; `deferred.attach(provider)`; pin the checksummed
   address (`getAddress`) as the connector's account; if the requested `chainId` differs, run the
   connector's own `switchChain` **before returning**, and return the **post-switch** `chainId` —
   `connect.js` writes `data.chainId` straight into `connections[uid]`. `[rev2]`
6. `writeFlag()` — a **localStorage-backed** flag owned by the sub-path, keyed
   `` `${config.storage?.key ?? 'sodax'}.privy.connected` ``. **Never `config.storage`** `[rev2]`: the
   SDK's wagmi storage is `cookieStorage`, whose `setItem` writes no `expires`/`max-age`
   (`@wagmi/core dist/esm/utils/cookie.js:9-14`) — a **session cookie** that dies on browser quit, while
   the zustand `xConnections.EVM` entry in localStorage survives. AC3 would fail on the most common form
   of "return", silently, and invisibly to an in-memory test harness. `readFlag/writeFlag/clearFlag` each
   in their own try/catch with a write probe (mirroring `useXWalletStore.ts:158-167`), injectable for tests.
7. Return `{ accounts, chainId }`; wagmi writes `recentConnectorId = 'privy'`; `EvmHydrator` writes
   `xConnections.EVM`; `useWalletClient()` resolves (wagmi builds `createClient({ transport:
   custom(provider) })` with its own viem — only `provider.request` crosses the viem boundary) →
   `EvmWalletProvider` → `walletProviders.EVM` (AC4).

A late `onComplete` after cancellation still publishes state, so the next `connect()` takes branch 2
without a second OTP.

### Lifecycle — returning user reload (AC3)

Both existing triggers work: `reconnectOnMount: true` (wagmi's mount reconnect) and the SDK default
`false` (`EvmHydrator` retries `reconnect()` when a persisted `xConnections.EVM` exists).

```ts
async isAuthorized() {
  try { return readFlag() === '1'; } catch { return false; }   // total; no Privy read; no await on Privy
}
```

`[rev2]` Rev 1's `storage.getItem(...) === true` compares a **Promise** to `true` — `@wagmi/core`
wraps every backing store in `async getItem` (`dist/esm/createStorage.js:13-19`) — and it type-checks
clean, so it would be permanently `false`. And **no Privy storage probe here**: in
`sessions.cookieWriteBehavior: 'never'` + server-cookie mode no JS-readable Privy signal exists, so a
probe-gated `isAuthorized()` would silently never reconnect; the `noPrivyTraceOnDevice()` formulation
was unsound anyway, because `privy:caid` and `privy:connections` are written by **any**
`PrivyProvider` mount, including an anonymous one, and survive logout.

Hard requirements from `@wagmi/core@2.20.3 reconnect.js`: `getProvider()` returns the deferred shell — a
**distinct object** (wagmi dedupes by identity) that never throws; `isAuthorized()` is **not** wrapped in
catch (`:56`) and `isReconnecting = false` sits outside any `finally` (`:97`), so a throw there wedges
every later `reconnect()` for the page lifetime.

`connect({ isReconnecting: true })`: wait for `ready` bounded by **`readyTimeoutMs` (3 s)**, then the
embedded wallet by `walletTimeoutMs`; `ready && !authenticated` → clear the flag and throw (never opens
the modal on reload); **`readyTimeoutMs` expiry → do NOT clear the flag** — readiness is unknown, and
clearing makes the state terminal. `[rev2]`

**Late readiness** `[rev2]`: if the host reaches `ready && authenticated` *after* the reconnect loop has
settled, nothing re-enters — `EvmHydrator`'s retry is gated on `status !== 'disconnected'` and its
`if (!state.xConnections.EVM) return;` guard closes once the entry is cleared. V1 resolution: the Host
calls `reconnect()` **once** when it becomes ready-and-authenticated, guarded on
(flag still set ∧ `!config.state.current` ∧ `!userDisconnected.EVM`), at most once per page. Do **not**
`emit('connect', …)`: `createConfig`'s connect handler returns early while connecting/reconnecting and
otherwise sets `current` unconditionally, which would hijack an already-reconnected MetaMask. If this is
judged not worth the code, document the fallback: one click on "Email (Privy)" reconnects with no second
OTP via branch 2.

AC3 wording: same email → same address **for the same `appId`, as long as the user has not been deleted
or unlinked**. Bind the wallet deterministically (lowest HD index / `walletIndex 0`) rather than taking
whatever `getEmbeddedConnectedWallet` returns first — it is an unpinned first-match over
`user.linkedAccounts`. `[rev2]`

### Lifecycle — disconnect and account change `[rev2]`

`useXDisconnect` → `EvmActions.disconnect` → `privyConnector.disconnect()`:
(a) **first abort any in-flight connect attempt**, so a user who opens the OTP dialog then picks another
wallet does not leave a promise that never settles; (b) `clearFlag()`, `deferred.detach()`,
`await ops.logout()`.

Reverse direction is **required**, not optional: after a Privy logout the provider emits nothing and
still answers `eth_accounts`, but signing throws 4900. The bridge watches `authenticated` true→false,
and the connector — while attached — detaches, **clears the flag** and calls `onDisconnect()`. Real
triggers are partner `logout()`, token expiry, and storage-shared tokens adopting a different user at
the next refresh; **not** another tab (cross-tab sync is an opt-in `@experimental` plugin the SDK does
not pass).

**Account change, fail-closed**: the connector pins the address it returned. While attached, connected
and not mid-connect/switch: if the pinned address is still present, re-take `getEthereumProvider()` only
when the wallet object identity changed, and emit nothing; if the pinned address is **gone** (gated on
`authenticated && walletsReady`, ignoring transient null-`user` ticks), detach and `onDisconnect()`.
Never silently follow a new address — for an intent-signing SDK a re-pointed session is worse than a
clean disconnect. Note `accountsChanged` has no producer in Privy's provider at all.

**On bridge unmount**: reject every pending deferred ("Privy runtime unloaded") and publish an
unavailable snapshot, so a partner unmounting mid-login does not strand `useWalletModal` on `connecting`.

### Lifecycle — chain switch `[rev2: replaced entirely]`

Rev 1's "await `embedded.switchChain()` → re-request provider → attach" is a **guaranteed** race: in
3.43.0 `embedded.switchChain` is a React `setState` only, and `getEthereumProvider()` mints a *new*
provider pinned to the chain captured in the render that produced that wallet object.

1. Validate `chainId` against wagmi `config.chains` → `SwitchChainError`. This is the **only** guard:
   Privy's `handleSwitchEthereumChain` does no validation (`this.chainId = Number(t)` unconditionally).
2. Switch the **attached provider in-band**:
   `await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(id) }] })`.
   Same instance — no re-attach.
3. **Best-effort** `embedded.switchChain(chainId)` to update Privy's per-address chain map. A failure
   must not fail the action: record a `pendingRuntimeChainId` and drag the next provider replacement to
   wagmi's chain. Skipping it is not optional — without it the next `getEthereumProvider()` mints a
   provider back on `defaultChain`. (`gap-app-v2` documents the concrete failure: `wallet.switchChain()`
   throwing *"Unable to determine current chainId."* Do not string-match it; ordering makes it moot.)
4. Verify `Number(await provider.request({ method: 'eth_chainId' })) === chainId`; only then set
   `lastVerifiedChainId` and `emit('change', { chainId })`. Mismatch → keep the old attachment and throw.
   This mirrors wagmi's own `injected.js`.

`useWallets()[i].chainId` is CAIP-2 (`eip155:8453`), a **string** — parse it before comparing.

### Connector methods `getChainId()` / `getAccounts()` `[rev2]`

Both mandatory, both total. `getConnectorClient` calls them together
(`@wagmi/core dist/esm/actions/getConnectorClient.js:14-21`) and throws `ConnectorChainMismatchError`
on disagreement with `config.state.chainId` (`:32-39`); `useWalletClient` holds that query at
`staleTime: Infinity`, so a mismatch is permanent for the session — and because `EvmHydrator`
deliberately does not gate on `walletClient`, the UI would show a connected Privy account while
`useWalletProvider('EVM')` stays `undefined`, with no error surfaced.

- `getChainId()` → a **live** read of `eth_chainId` on the attached provider (a local field read, no
  network), falling back to `lastVerifiedChainId` when detached. Never throw; never return the
  constructor default `1`. Do not cache a connector-held chainId as the sole authority.
- `getAccounts()` → the pinned, checksummed address from the runtime snapshot; never an `eth_accounts`
  round trip through a possibly-detached shell.

The deferred shell also **intercepts `wallet_switchEthereumChain`** and routes it back into the
connector's validated `switchChain`, so a caller going through `useWalletClient()` cannot reach Privy's
unvalidated handler. Keep 4900-while-detached; never queue requests (replaying a stale request after a
later login could send it through a different user's wallet).

### Coexistence (AC5) `[rev2]`

`multiInjectedProviderDiscovery` stays at wagmi's default; `walletConnect()` stays in the array; Privy is
appended, never replaces. Settled choice 8 keeps Privy from standing up its own WalletConnect/Coinbase
stacks.

Rev 1's "MetaMask/WC reconnects are never delayed" was **false**. The honest statement:

> With no flag the loop never pauses on Privy at all. With the flag set, wagmi's loop `await`s Privy's
> `connect()` and has **no `break`** (`reconnect.js:46-82`), publishing `status: 'connected'` only after
> the loop (`:84-96`) — so other wallets' published connection is delayed by at most `readyTimeoutMs`,
> regardless of sort order (`recentConnectorId` scores Privy first, `:36-37`). Nothing in the SDK surface
> is gated on that window: `useWalletClient` stays enabled while `reconnecting`, the `walletProvider`
> memo has no status gate, and a manual connect is never blocked.

**Supersession guard.** wagmi's `reconnect()` replaces the connection map on its first success
(`:67-74`) and `connect.js` sets `current` unconditionally, so a slow Privy restore resolving after the
user manually picked MetaMask would clobber it. The connector snapshots the active connection identity
at attempt start and re-checks it in a no-yield window before returning; if another connector is now
current: detach, do not write the flag, throw `PrivyConnectorSupersededError extends
UserRejectedRequestError` so wagmi's catch restores the existing connection. Do **not** `logout()` on
supersede. `CreateConnectorFn` does not receive `config.state`, so inject a
`getWagmiState?(): Config['state']` from `EvmProvider` (the precedent does exactly this); fallback:
compare `recentConnectorId` snapshots.

## Steps

### Step 0 — Spike (1 day, before the branch opens; results pasted into the PR body)

Read `plan-revision-2.md` § 5 for why each item survives. A dev Privy app is **self-service and free**
(Developer tier, ~10 minutes at dashboard.privy.io: Email login, Ethereum embedded wallets, allowed
origin `http://localhost:3002`, "Enable test accounts"), so nothing here waits on product.

Baseline `origin/main 898b7e6a`, in a scratch worktree. **`pnpm build:packages` runs zero tasks** —
`turbo.json` declares the task but no package implements the script; use `pnpm build` or
`pnpm turbo run build --filter=@sodax/wallet-sdk-react...` with `TURBO_CONCURRENCY=2`. **Never run the
root `pnpm test` in a linked worktree** — `scripts/release.test.mjs` leaks `GIT_DIR` and writes
`core.bare=true` / `commit.gpgsign=false` into the shared `.git/config`.

| # | Item |
| - | ---- |
| **0** | **Turbopack prerender go/no-go, first, no Privy app needed.** `pnpm --filter example-next-js-16 verify` with `PrivyProvider` mounted (dummy `appId`), under `next build` (Turbopack, scope hoisting on by default in Next 16) **and** `next build --webpack`; watch for a hydration warning on first client render. Privy **statically** imports `@walletconnect/ethereum-provider`, putting its init on the prerender path, whereas wagmi's `walletConnect()` uses `await import()` — which is why the Next 16 example builds green today. Budget for a `@sodax/libs`-style stub if it reproduces; record `--webpack` as the documented partner fallback. |
| 1 | **Install + build + gates.** Two `trustPolicyExclude` entries, exact devDependency, then `pnpm i && TURBO_CONCURRENCY=2 pnpm build && pnpm checkTs && pnpm check-exports && pnpm check:knip`. Confirm `import('@privy-io/react-auth')` resolves the nested viem 2.56.0 under pnpm's isolated layout, and that `attw --pack --profile esm-only` tolerates a sub-path whose only external import is an absent optional peer. |
| 2 | **Signing acceptance for the six unregistered chain ids** (295, 151, 1890, 8217, 146, 4663). On a free dev app, call the provider with a 0-value self-transfer on each: the **sign** call fails before broadcast if the id is rejected, so **no funds are needed** to learn it. This is the last real unknown in Risk 7. |
| 3 | **End-to-end send on the three riskiest chains** — Hedera 295, LightLink 1890, Redbelly 151 — with `privyWalletOverride` pointing at the SDK's configured `rpcUrl`, and a devtools capture proving which endpoint served `eth_estimateGas` / `eth_sendRawTransaction`. Redbelly first (it gates account activity on identity verification). Needs dust funding and an owner — open question 4. |
| 4 | **Config + MFA on a live app**: (a) `disableAllExternalWallets: true` + `walletList: []` leaves the email modal fully functional; (b) an MFA-enrolled user signs through the wagmi `provider.request` path — does the prompt fight the connector's connecting state, does the 15-minute cache suppress the second prompt; (c) does `useLogin`'s `onError` fire for recoverable in-modal errors (wrong OTP, failed send-code), which decides whether our `exited_auth_flow`-only rule is a correctness fix or merely equivalent; (d) returning-user `ready` latency and demo bundle delta. |

### Step 1 — Workspace and packaging

- `pnpm-workspace.yaml`: under the existing "Legacy-line backports…" comment add `"jose@4.15.9"` and
  `"ua-parser-js@1.0.41"`, each with a one-line evidence note. Verified: exactly these two unblock the
  tree; 0 exotic subdeps; OSV clean once the existing `ws@8` override applies.
- `packages/wallet-sdk-react/package.json`: `exports['./privy']`, `typesVersions['*'].privy`,
  `peerDependencies['@privy-io/react-auth'] = '^3.40.0'` **plus
  `peerDependenciesMeta['@privy-io/react-auth'].optional = true`**, devDependency pinned exact,
  `build` += the two new scripts. The `optional` flag is load-bearing, not a detail: `.npmrc` sets
  `auto-install-peers = true`, and pnpm auto-installs missing **non-optional** peers — without it every
  workspace consumer and every pnpm partner silently installs Privy. **Assert this at install level**,
  not only by a `dist` grep. `[rev2]`
- `tsup.config.ts`: `entry` += `'src/privy/index.ts'`. `knip.json`: `entry` += the same;
  `rules.optionalPeerDependencies: "warn"`.
- **`scripts/restore-use-client.mjs`** (new, in `packages/wallet-sdk-react/scripts/`, called as
  `node scripts/…` — the `@sodax/libs` pattern, because the `build` task declares **no `inputs`**, so
  root `scripts/*.mjs` sit outside its hash). It stamps **only** `dist/privy/index.mjs` and carries an
  explicit assertion that it never touches `dist/index.mjs`, `dist/xchains/*/index.mjs` or any chunk — a
  directive on the shared chunk would break `layout.tsx`'s server-side cookie SSR for every existing Next
  partner. `banner` is **not** an alternative: tsup 8.5.0 + `treeshake: true` routes through Rollup,
  which prints *"Module level directives cause errors when bundled"* and strips both the source directive
  and the banner, and esbuild sprays a banner onto shared chunks (reproduced with the repo's own tsup).
  Next 16's "Advice for Library Authors" says a directive on a bundled entry is sufficient and warns that
  bundlers strip it — cite both so nobody re-opens this. `[rev2]`
- **`scripts/check-entry-isolation.mjs`** (new, same location): a **transitive chunk-graph walk** from
  `dist/index.mjs` and every `dist/xchains/*/index.mjs` — not a grep — because with `splitting: true` one
  *value* import of Privy from any module the barrel also reaches hoists the bare specifier into a shared
  chunk. Extend the same rule to `.d.ts` chunks. State the property as "no reachable specifier in the
  non-privy entrypoints, JS or types, is `@privy-io/*`", ship the leak shape as a negative fixture, and
  require Privy types to be `import type` only. Also assert `dist/privy/index.mjs` exists, starts with
  `'use client'` (after the restore step) and contains a bare `@privy-io/react-auth` specifier. `[rev2]`

### Step 2 — Core seam (main entry; no Privy imports)

`src/types/config.ts`: `EvmWalletSourceContext` (with `wagmiChains`), the `@internal` branded
`EvmWalletSource`, `isEvmWalletSource()` (shrunk to `typeof value?.createConnector === 'function'`),
`privy?: EvmWalletSource` on `EvmAdapterFields`.
`src/xchains/evm/EvmXService.ts` + `index.ts`: extract the chain tuple into
`export const SODAX_EVM_CHAINS = [...] as const satisfies readonly [Chain, ...Chain[]]`;
`createWagmiConfig` spreads it; export from the `./xchains/evm` sub-path.
`src/providers/evm/EvmProvider.tsx`: push `config.privy.createConnector(ctx)` into `connectors` when the
guard passes (else warn and skip); add `config.privy` to the deps (final deps
`[config.chains, reconnectOnMount, ssr, walletConnectConfig, config.persistKey, config.privy]`, placed
after #163's `extraConnectors` spread if that landed); wrap `{children}` in `<EvmSourceHost>` **only when
`source?.Host` exists**; inject `getWagmiState` for the supersession guard.
`src/providers/evm/EvmSourceHost.tsx`: new class boundary, message per the Architecture note.
**No change** to `EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`.

### Step 3 — Sub-path `src/privy/`

Modules as in Architecture. Connector facts: `type: 'privy'`, inline SVG data-URI icon, the full method
set above, `switchChain` per the four-step sequence. **No `setup()`** `[rev2]` — `connect()` subscribes
to `logout` before `attach()` and keeps the unsubscribe; `disconnect()` and the logout handler
unsubscribe. (zustand's `createStore` initialiser runs `connector.setup?.()` synchronously inside
`createConfig`, i.e. inside `EvmProvider`'s `useMemo`, which StrictMode double-invokes — a
`setup()`-registered listener leaks from a discarded config with no teardown and can eat the live
connector's `onDisconnect()`.)

Ownership: **one runtime and one deferred shell per `privy()` call**; a source belongs to exactly one
`SodaxWalletProvider` mount. The mount guard is a module-level `Map<appId, owner>` that is
**re-claimable** — host #1 unmounting hands ownership to host #2 rather than wedging
`hostMounted: false`. `privy()` must be called once (module scope or `useMemo`/`useRef`); warn once past
a small per-`appId` instance count. The bridge keeps every Privy hook handle behind a ref refreshed each
render, so the published operations object is referentially stable (Privy's handles are not, and every
publish otherwise re-fires every `waitFor` predicate). An import-time guard rethrows the `tempoModerato`
`SyntaxError` with a hint about top-level viem ≥ 2.44 for npm/yarn-hoisted partners.

### Step 4 — Tests (vitest, happy-dom; `checkTs` typechecks tests; `as unknown as` needs a why-comment)

Two files, not five `[rev2]`: `src/privy/privyConnector.test.ts` (absorbs the deferred-provider cases)
and `src/privy/PrivyHost.test.tsx` (absorbs the factory cases), plus the extension of
`EvmProvider.test.tsx` — which **already exists** (54 lines, #247): extend, do not create.

The connector file uses real `@wagmi/core` `createConfig` with `[privyConnector({ runtime: fake }), mock()]`
and a real storage adapter, fake timers, and **zero Privy imports**. Required cases:

1. `reconnect()` resolves `[]` and the runtime is **never requested** with no flag — the AC5 regression
   proof as a cheap unit test.
2. A never-resolving readiness promise still lets `mock()` reach `connected` within `readyTimeoutMs`.
3. `isAuthorized` truth table through the **real** storage/flag adapter, including the positive row and
   the **restart case** (wagmi cookie storage empty + localStorage flag present → `true`).
4. `storage.getItem` rejects → `reconnect()` called **twice** proves the module-level `isReconnecting`
   flag was not poisoned.
5. Seeded `wagmi.store` + `hydrate(config, { reconnectOnMount: true }).onMount()` — the path a real
   reload takes.
6. Expired session over two consecutive loads: the second must not even request the runtime.
7. `connector.uid` and `getProvider()` identity stable across logout → login as another user.
8. Delayed reconnect does not overwrite a user-selected wallet.
9. `getChainId()` after a switch equals the target; no `change` if the fake never updates
   (→ `SwitchChainError`); a real `getConnectorClient()` after a switch returns a client rather than
   `ConnectorChainMismatchError`; `getAccounts()`/`getChainId()` do not reject while briefly detached.
10. Pinned wallet disappears → detach + `onDisconnect`; a *different* embedded wallet appears while the
    pinned one is present → no `change`; `walletsReady === false` → no event.
11. Derived-config assertions: `walletList` is `[]`, `disableAllExternalWallets` is `true`, **no `mfa`
    key**, **no recovery key**, and `supportedChains` has the same ids and order as `ctx.wagmiChains`
    with `rpcUrls.privyWalletOverride.http[0]` equal to the URL `createWagmiConfig` would use (plus a
    case for a chain with no partner entry).
12. Both `PrivyProvider` mount-time throws (empty `supportedChains`; `defaultChain` absent from the list).
13. `EvmProvider.test.tsx`: with **no** `EVM.privy`, assert no `EvmSourceHost` is in the tree at all; the
    connector factory reaches `createWagmiConfig` and the Host renders inside the captured
    `WagmiProvider` with `ctx.wagmiChains === SODAX_EVM_CHAINS`; a malformed literal warns and is
    skipped; a throwing Host logs once with children still mounted; one child calling `usePrivy()`
    (stays mounted, `ready === false`) and one calling `useLogin({ onComplete })` asserting the error
    **escapes** the boundary — which pins the documented limit in code;
    `vi.doMock('@privy-io/react-auth', () => { throw })` never trips without `privy`.

`EvmHydrator.test.tsx` unchanged and green.

### Step 5 — Demo proof (`apps/wallet-modal-example` only)

`src/privy-source.ts`: env-gated dynamic `import('@sodax/wallet-sdk-react/privy')`; `providers.tsx` maps
the optional source to `EVM.privy`; devDependency pinned exact; `.env.example`; an `App.tsx` panel with
sign-message and a 0-value `sendTransaction` on `useWalletProvider('EVM')`. **Add an injectable fake
runtime behind a `VITE_` flag** `[rev2]` (the precedent ships exactly this): it makes AC3 and the
chain-switch path reproducible for a reviewer with no Privy account. `apps/demo` and
`apps/example-next-js-16` stay **Privy-free** — they are the CI proof that the main entry has no Privy.

### Step 6 — Docs and skills (Docs Drift + AI-drift gates)

`packages/wallet-sdk-react/docs/WALLET_PRIVY.md` (new, mirroring `WALLETCONNECT.md`'s shape) must carry,
beyond the config/install/modal-caveat basics:

- **Recovery** — paste-ready `[rev2]`: *"A Privy embedded wallet has no password and no seed phrase. On
  Privy's default TEE execution environment the wallet is reachable only through the user's Privy login
  method — for this integration, their email one-time code — and there is no recovery factor to set:
  calling `setWalletRecovery()` on a TEE app throws `unsupported_wallet_type`, so this SDK never calls
  it. If a user permanently loses access to that email address, the wallet and everything in it are
  unrecoverable: Privy states there is no backdoor and cannot restore the account. Tell your users they
  can export their private key at any time, and that linking a second login method (only the user can do
  it) is the one durable fallback. Enable wallet MFA — passkey, TOTP or SMS — in your Privy dashboard so
  that a stolen browser session cannot sign or export on the user's behalf; Privy renders the MFA prompt
  itself inside the provider this SDK mounts."* Do **not** link a Privy "recovery" page — there is none.
- **Availability** (new section) — every signature is a round trip to Privy's API + TEE, so while Privy
  is unreachable a Privy-connected user cannot sign. Cite status.privy.io's 90-day per-component uptime
  rather than an SLA (there is none below Enterprise). Say what the SDK does, and warn that a SODAX flow
  is approve-then-intent — two signatures — so an outage between them leaves an approval granted and the
  follow-up unsignable while a MetaMask user on the same page is unaffected.
- **Leaving Privy / user exit** (new section) — addresses are bound to that `appId`; there is no
  automatic app-to-app transfer; the exit is user-driven key export (an app cannot prevent it
  client-side), optionally re-imported elsewhere. Export requires the user to still authenticate against
  the app holding the wallet, so dropping `EVM.privy` without a migration window strands those addresses.
- **Chain honesty** — state plainly that **7 of the 14 chains are outside Privy's registry** (146, 8217,
  1890, 151, 295, 4663 absent from `DEFAULT_SUPPORTED_CHAINS`; id 999 there is Zora Goerli Testnet, not
  HyperEVM), that this SDK sets `privyWalletOverride` so Privy broadcasts through the partner's `rpcUrl`,
  and name the subset actually send-tested. One sentence each: Privy's transaction scanning will not
  resolve on those 7, and if Privy's wallet UIs are enabled the HyperEVM fiat price line is known-wrong.
- **`'use client'`** — the partner's own providers wrapper is **mandatory**, not a nicety: the published
  `@sodax/wallet-sdk-react@2.0.0-rc.17` dist carries zero directives across `dist/index.mjs` and all 15
  chunks, and `@privy-io/react-auth@3.43.0` ships none either. `apps/example-next-js-16/app/providers.tsx:1`
  is the in-repo example. Keep `layout.tsx` server-side and Privy-free, set `turbopack.root` in a
  monorepo, gate UI on Privy `ready`, and expect a slower first *usable* paint for a returning Privy user.
- **What this costs you** — the tier table as of the tested date, that metering is **per signing
  request**, the measured number of signatures a SODAX swap/intent costs (count it in the demo), the
  auto-upgrade-on-overage behaviour, and that the `appId` owner is billed.

`README.md`: feature bullet, quick-start comment, docs-table row with an **absolute GitHub URL**.
`WALLET_PRIVY.md` is **not** mirrored to docs.sodax.com — either add it to `scripts/docs-pages-map.json`
with a `docs/docs.json` nav entry, **or** lift the four sentences that must not be missed (custody model,
no signing during an outage, app-scoped addresses, who pays) into the README bullet, which does publish.
**Decide this in the plan, not at authoring time.** `[rev2]`

Also update `docs/CONFIGURE_PROVIDER.md` (new section after WalletConnect), `docs/CONNECTORS.md:216`
(name both `EVM.privy` and — once #163 lands — `EVM.wagmiConnectors`, and state that `isAuthorized()` is
per-connector policy, must never throw and must be self-timed), `docs/WALLET_MODAL.md` (generalise the
render-null caveat to `'walletConnect' || 'privy'`), `docs/SUB_PATH_EXPORTS.md`, `docs/ARCHITECTURE.md`,
and `AGENTS.md`.

Skills: a new granular skill + recipe, registered in **eight** files `[rev2]` — the six rev 1 listed plus
`packages/skills/AGENTS.md` and `packages/skills/README.md`. `check-ai-imports.sh:118-121` already maps
`@sodax/wallet-sdk-react/*`, so no fixture edit is needed there. For the snippets gate, either give
`packages/skills` a way to resolve `@privy-io/react-auth` (devDependency at the same exact version, or an
ambient shim) **or** mark the Privy blocks `// @ai-snippets-skip` and drop "check:ai green" from the AC6
proof column — decide here, because as written the gate either skips the example or fails it. `[rev2]`

Run `pnpm --filter @sodax/skills check:ai` and `pnpm check:doc-links` before every push.

### Step 7 — Gates, canary, PR

**Commit order, each one green** `[rev2]` (rev 1's order installed Privy before the excludes existed and
left the build red between Steps 1 and 3, because `verify-dist-exports.mjs` fails on a declared `./privy`
with no `dist/privy`):

1. `chore(workspace): exclude jose@4.15.9 and ua-parser-js@1.0.41 from trustPolicy no-downgrade` — the
   two entries + the exact devDependency + lockfile.
2. `feat(wallet-sdk-react): add an internal EVM wallet-source seam` — types + `EvmProvider` +
   `EvmProvider.test.tsx`, **no Privy anywhere**. The commit a reviewer should read hardest.
3. `feat(wallet-sdk-react): add opt-in Privy email login as an EVM wallet source` — `src/privy/`
   **together with** the packaging edits (exports, typesVersions, tsup entry, knip, the two scripts) and
   its tests, because the exports map and the entry must land together.
4. `chore(wallet-modal-example): env-gated Privy demo`.
5. `docs(wallet-sdk-react): add Privy partner guide and provider docs`.
6. `docs(skills): add wallet-sdk-react privy skill and recipe`.

**CI**: add `--filter='./apps/wallet-modal-example'` to the *Build Apps* step with `VITE_PRIVY_APP_ID`
unset — that build **is** the AC1 negative proof — and make the isolation assertion over its
`dist/assets` a script, not a manual grep. `[rev2]`

**Canary — fix it or cut it** `[rev2]`. As rev 1 specified it, it cannot run: there is no per-invocation
`minimumReleaseAge` override in pnpm 10, `trustPolicy: no-downgrade` plus exact pins would fail the
*install* rather than the API check, and `continue-on-error: true` hides both. Either install the canary
copy **outside the workspace** (throwaway directory, own minimal manifest, no cooldown, no trustPolicy,
`--ignore-scripts`, `permissions: contents: read`, no secrets, fail only on typecheck/test) or cut the
workflow and take the same signal from the ordinary devDependency-bump PR when a version clears the
cooldown. Whatever ships must be proved via `workflow_dispatch` after merge.

**PR body**: spike results (including the Turbopack go/no-go), the dependency delta named as a reviewer
will ask about it — a fourth `@walletconnect/core` line (Privy pins `@walletconnect/{ethereum,universal}-provider`
at exactly **2.22.4** against wagmi's 2.21.1; the tree already carries 2.11.2 and 2.21.0), a third
`@coinbase/wallet-sdk`, a second **viem** (2.56.0 vs the catalog's 2.29.2), plus styled-components, x402,
`@stripe/*`, hcaptcha, and the two exact excludes, with the note that these are **static** top-level
imports of `dist/esm/index.mjs`, not behind a dynamic import — evidence for both excludes, the tested
Privy version, and the open questions resolved or explicitly deferred. `@sodax/wallet-sdk-react` stays on
the `2.0.0-rc` line; additive → no `!`.

**Effort** `[rev2]`: ≈9–10 working days (spike 1 incl. the Turbopack go/no-go, workspace+seam 1,
sub-path 3, tests 2, demo 1, docs+skills 2, gates/PR 0.5). Sanity check: the precedent's connector is 865
lines with an 865-line test — expect a 1:1 test-to-source ratio.

## Verification

| AC | Mechanism | Proof |
| --- | --- | --- |
| **AC1** list entry only when `EVM.privy` is set; no Privy code otherwise | `EvmProvider` appends `createConnector(ctx)`; `EvmHydrator` mirrors `useConnectors()` unchanged; without the slot no connector, **no boundary** and no `@privy-io` reference in the main entry | `EvmProvider.test.tsx`, `check-entry-isolation.mjs` (graph walk, JS + types), the demo built in CI with the env unset, Privy-free `apps/demo` + Next 16 builds |
| **AC2** `[rev2: rewritten]` | `connect()` → `login({ loginMethods: ['email'] })` → `onComplete` → embedded wallet (`createOnLogin` + `linkedAccounts`-gated `createWallet`) → `getEthereumProvider()` → wagmi `connected` → `xConnectorId: 'privy'`. **No recovery factor is set, because on TEE there is none** | connector + host unit tests; demo with a fresh test email |
| **AC3** same address on return | wagmi `reconnect()` → deferred `getProvider()` → total `isAuthorized()` reading a **localStorage** flag → `connect({ isReconnecting })` bounded by `readyTimeoutMs`; deterministic wallet selection (`walletIndex 0`) | connector reconnect tests incl. the restart case; demo reload under both `reconnectOnMount` values; **fresh-browser/same-email** row (clear all storage, log in again, compare addresses); second `appId` → different address |
| **AC4** a signed SODAX action via `useWalletProvider('EVM')` | `useWalletClient()` over `custom(deferredProvider)`; `EvmHydrator` builds `EvmWalletProvider` as for MetaMask | Named artifact `[rev2]`: sign the intent's typed data through `useWalletProvider('EVM')` **plus** one funded transaction on the default chain, in the demo, with a tx hash + screenshot in the PR body. Funding owner and budget per open question 4 |
| **AC5** injected + WC keep working | mipd on; `walletConnect()` kept; Privy appended; settled choice 8 stops Privy's own stacks; the bounded-delay statement from § Coexistence; supersession guard | `EvmProvider.test.tsx`; unit case 1; demo MetaMask → WC → Privy → MetaMask in one session, asserting **no** *"WalletConnect Core is already initialized"* warning |
| **AC6** partner docs | `WALLET_PRIVY.md` + README (mirrored) + five docs + AGENTS + skills | docs-drift, doc-links, AI-drift; `check:ai` only if the snippets decision in Step 6 keeps it |

**Post this AC2 rewrite as a comment on #456 — do not edit the issue body:**

> **AC 2:** Choosing that connector opens Privy's email one-time-code login and a new user ends with an
> automatically provisioned embedded EVM wallet surfaced as a connected EVM XAccount — with no password
> or recovery factor set, because on Privy's default TEE execution environment an embedded wallet has
> none (`setWalletRecovery()` throws `unsupported_wallet_type`) and the wallet is reachable only via the
> user's Privy login method.

**QA matrix** lives in `plan-architecture.md` § 7.4 with these rev-2 additions: (16) connect → **fully
quit the browser** → reopen → same address without OTP and `xwagmi-store` intact; (17) connect →
disconnect → quit → reopen → still disconnected (catches a missed `clearFlag()`); (18) Privy unreachable
while connected (block `auth.privy.io` + `*.rpc.privy.systems`) → sign rejects clearly, no hang past
`readyTimeoutMs`, MetaMask/WC still usable — **record what actually happens**, because that observation
is what the Availability docs section then states; (19) an MFA-enrolled user signs twice; (20) host throws
after mount → SUI/SOLANA connections intact; (21) partner calls `useCreateWallet({ createAdditional })`
from children → no spurious disconnect; (22) `disableAllExternalWallets` + empty `walletList` leaves the
email modal functional. Rewrite rev 1's row 5 as three (persisted Privy + iframe blocked + MetaMask
authorized → MetaMask reached within `readyTimeoutMs`; persisted MetaMask + stale Privy flag; Privy
becomes ready after the budget) and rewrite "logout in another tab" as "partner code calls `logout()` in
this tab" — the cross-tab version cannot reproduce without the opt-in plugin.

## Risks

1. **The issue's AC2 premise is unimplementable, and rev 1 understated it** `[rev2]`. `setWalletRecovery()`
   **throws** on TEE; the SDK never calls it; AC2 is rewritten above. Three-state note: TEE default;
   on-device with Privy-managed *automatic* recovery (a new device is transparent); on-device with
   user-managed recovery. **In all three the SDK ships nothing** — enrolment is a dashboard toggle or a
   partner-side call, and `PrivyClientConfig.embeddedWallets` carries no recovery option. On-device is a
   Privy-support-gated, one-way, per-app switch SODAX cannot pick for a partner. Decision 0003 records the
   supersession of 0001.
2. **Two viem copies.** Privy hard-depends on viem 2.56.0; npm/yarn-hoisted partner apps crash at import
   if their top-level viem is < 2.44. Spike item 1; document the floor; import-time guard with a hint;
   catalog bump raised in the PR thread. No react-query collision — Privy has no react-query dependency.
   **Do not add zustand to `pnpm.overrides`** `[rev2]`: Privy needs zustand 5 while the SDK pins 4.5.2,
   and the repo's overrides deliberately do not force it.
3. **Privy ships weekly; the 14-day cooldown keeps the pin 2–3 minors behind; `^3.40.0` admits untested
   versions.** Privy hooks confined to `PrivyHost.tsx` behind the runtime interface; the canary decision
   in Step 7; tested version stated in the docs; no `@experimental` APIs except
   `disableAllExternalWallets`, which is pinned and QA'd.
4. **Sequential `reconnect()` delays other wallets by up to `readyTimeoutMs` when the flag is set.** Fast
   fail on `ready && !authenticated`; total, self-timed `isAuthorized()`; the honest bounded statement is
   in § Coexistence and in the docs.
5. **A pending connect with no Privy UI on screen** `[rev2]`. Rev 1's *"`back()` already drops the
   in-flight attempt"* is false — `useWalletModal`'s `isStillCurrent()` only drops the pending
   `success`/`error` transition, and `@wagmi/core`'s `connect` has no abort input. The connector stands
   itself down instead (supersession guard), and `disconnect()` aborts a pending attempt. The real
   exposure is not the dialog (Privy's login UI is a Headless UI `Dialog` that marks the page `inert`) but
   the readiness wait before `login()` and the wallet-materialisation wait after `onComplete`.
6. **Partner already mounts its own `PrivyProvider`.** V1: the SDK owns it when `EVM.privy` is set;
   children sit inside it; the mount guard is re-claimable and warns.
7. **Privy's server-side acceptance of an unregistered chain id during signing** `[rev2: premise replaced]`.
   Client-side RPC is settled (we inject `privyWalletOverride`, so estimation and the non-TEE broadcast go
   through the partner's endpoint), but on the TEE stack the final broadcast is server-side via CAIP-2, so
   Privy's backend must know the chain: 295, 151, 1890, 8217, 146, 4663. Robinhood 4663 has a first-party
   Privy reference, which downgrades it. Spike item 2. **Hedera decimals are not a risk** — viem's `hedera`
   declares 18 and `EvmSpokeService.ts:42-54` already scales `msg.value`, so what Privy signs is weibar.
   **LightLink 1890 is the weak one**: its public replicator answers neither `eth_feeHistory` nor
   `eth_maxPriorityFeePerGas` and its blocks carry no `baseFeePerGas`, so viem falls back to a legacy
   transaction (live probes, 2026-09-18).
8. **Supply-chain review load** (+53 names; two exact excludes). Optional peer means non-Privy partners
   install nothing; exact devDependency so a blocked bump never leaks into a release.
9. **`ready === true` does not mean the wallet channel works** `[rev2]`. The hidden auth iframe is
   rendered **eagerly for every visitor**, gated only on `isServerConfigLoaded` — so lazy mount is
   promoted from "follow-up" to *a shape V1 must be built to allow*: a permanently-mounted near-zero gate
   publishes `hostMounted` and can be asked to mount the real provider, so the connector contract does not
   change when the lazy import lands. And the iframe handshake retries every 150 ms × 270 (~40 s) then only
   `console.warn`s, while embedded-wallet postMessage RPCs carry no timeout of their own — under CSP,
   adblock or Safari ITP the app sees `ready === true` with a dead channel. **Every** connector call into
   Privy must be independently self-timed, not just `connect()`.
10. **Precedents reviewed and rejected** `[rev2]`, so nobody re-opens them: `pinto-org/interface` is an
    anti-pattern catalogue (`isAuthorized()` reads a React closure that is `undefined` at reconnect time;
    `disconnect()` calls `logout()`; `getProvider()` builds a new object every call, defeating wagmi's
    identity dedupe); `gap-app-v2` hardcodes `isAuthorized() { return true }`. And do not follow sushiswap
    on error mapping (they reject on any `PrivyErrorCode`) or on their rdns-shaped id and storage-writing
    `isAuthorized`.
11. **PR #163 collision** — see § Relationship to PR #163.

## Open questions for product

1. **Do we ship on Privy's default TEE environment** — accepting that a user who loses their email loses
   the wallet, with no support path and no backdoor, in Privy's own words? The alternative is asking Privy
   to enable on-device execution: user-managed recovery, but a one-way, per-app, support-gated switch with
   a narrower feature set. **This no longer blocks anything** — the SDK calls no mode-dependent API and the
   docs can be written today. Sub-decisions: (a) do we require wallet MFA on a SODAX-blessed Privy app, and
   prompt enrolment in the demo? (b) do we tell users to export their key as the documented fallback?
2. **Whose `appId`?** Partner-owned (design default: partner controls origins, MFA, cookies, legal URLs and
   **billing**; addresses differ per partner) or SODAX-provided (one wallet across integrations; SODAX
   allow-lists every origin, pays, holds the secret, one shared trust boundary). Sharper than it looks:
   Privy meters **per signing request** and one SODAX intent costs several — the `appId` owner is billed.
3. **Disconnect semantics.** V1 = SODAX disconnect signs the user out of Privy. OK, or do partners who also
   use Privy for app auth need a keep-session mode?
4. **Which chains must be send-verified for V1, and who funds them?** 7 of 14 are outside Privy's registry;
   the docs name the tested subset honestly either way. Decides spike item 3's scope; needs an owner and a
   gas budget.
5. **Are we willing to publish the partner guide as written** — specifically that no signing is possible
   while Privy is unreachable, mid-intent included, and that a lost email is a lost wallet? Both are
   Privy's documented positions, but they are product's to publish.
6. **Demo scope.** Privy only in `apps/wallet-modal-example`, or also a swap-intent demo in `apps/demo`?
7. **Dashboard ownership for QA and the demo — pre-merge, not pre-spike.** The spike runs on a throwaway
   personal app; this decides who owns the app used for PR QA and the demo `.env`, and it means the PR must
   not ship pointing at a personal `appId`.
8. **Two defaults to confirm in review rather than debate**: `showWalletUIs` left to the dashboard (note
   that if Privy's wallet UIs are ever enabled, the HyperEVM fiat price line is known-wrong and the modals
   are untested on the 7 unregistered chains), and **Sonic (146)** as the default chain. Plus: OK to raise
   the catalog viem to ≥ 2.44 in a follow-up so npm/yarn partners cannot hit the hoisting crash?

## Out of scope (V1)

Solana/other-chain Privy wallets (the internal source shape and per-instance runtime let a later
`SOLANA.privy` share one `privy()` instance); a public `EVM.sources` extension point and the
WalletConnect-as-source refactor — **once #163 lands, `EVM.wagmiConnectors` is the public generic
extension point, so #456 must not add a second one**; `@privy-io/wagmi`, `useSetActiveWallet`,
smart-account connectors; headless `useLoginWithEmail` and a SODAX-styled OTP UI; recovery enrolment,
keep-session, an SDK `usePrivyUser()` hook; catalog viem bump; Privy in `apps/demo` / the Next example; a
SODAX-provided shared `appId`; Global Wallets; the lazy `PrivyProvider` mount itself (V1 only keeps the
shape open); replacing sodax.com's in-house email login (separate card).

**No SDK surface for recovery, MFA or key export** — `useExportWallet` is not re-exported; a partner who
wants an export button imports it from `@privy-io/react-auth` inside the SDK-mounted provider.
**Gas sponsorship is structurally unreachable through a wagmi connector** and is therefore an
architectural consequence of the settled design rather than a V1 omission: `sponsor` exists only as a
per-call option on Privy's own `useSendTransaction`, needs TEE-stack wallets and dashboard-configured
chains, and routes server-side via CAIP-2 — the EIP-1193 path a wagmi connector drives never sets it.
