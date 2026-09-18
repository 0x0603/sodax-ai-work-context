---
type: plan
repo: sodax-sdks
github: 456
updated: 2026-09-18
related_issues: [gh-1069, gh-1024]
related_decisions: [0001, 0003]
---

# Plan — Privy as an opt-in EVM wallet source in `@sodax/wallet-sdk-react`

Revision 1 (2026-09-18). Produced from first-hand source reads (`process.md` § F1–F5), a
six-topic research sweep (`research.md`), three independent architecture proposals judged through
three lenses, and an adversarial pass over the ten load-bearing claims (`process.md` § F6). The
long-form design is `plan-architecture.md`; this file is what to build, in order.

## Goal

Partners who set `EVM.privy` get an **"Email (Privy)"** entry in the same EVM wallet list as
MetaMask / Hana / WalletConnect. Picking it runs Privy's email OTP login, provisions an embedded
EVM wallet, and from then on the wallet signs SODAX intents through the unchanged
`EvmWalletProvider` slot. Partners who omit `EVM.privy` load **zero** Privy code and see no Privy
entry. V1 is EVM only. Six acceptance criteria are in `issue.md`; each maps to a mechanism in
§ Verification.

## Approach

### The decision

**Privy is one more wagmi connector, not a provider swap.** `EvmProvider` appends a Privy
connector (`id: 'privy'`, `name: 'Email (Privy)'`) to the same `connectors` array it already fills
with `walletConnect()`, and mounts a small React host (`PrivyProvider` + a bridge) *inside*
`WagmiProvider`, around the partner's children but **not** around `EvmHydrator` / `EvmActions`,
behind an error boundary. Both objects come from `privy({ appId })` exported by a new sub-path
**`@sodax/wallet-sdk-react/privy`**. `@privy-io/react-auth` is an optional peer;
**`@privy-io/wagmi` is not used.**

### Why not the issue's assumed design (`@privy-io/wagmi`)

Verified in the published 4.0.17 source (`process.md` § F2):

- Its `createConfig` **drops every non-mock connector** and sets
  `multiInjectedProviderDiscovery: false` — our `walletConnect()` and EIP-6963 wallets vanish.
- Its `useSyncPrivyWallets` calls `config._internal.connectors.setState(list)` on every
  `useWallets()` change — it **replaces** the wagmi connector list with Privy-owned wallets, so
  even with our own `createConfig` the list is wiped on first sync. AC5 cannot hold.
- Its `WagmiProvider` forces `reconnectOnMount: false`, which silently disables mount reconnect
  and cookie-hydrated first paint for MetaMask/WC users once Privy is on.
- It peer-pins **`viem 2.56.0` exactly** (every release re-pins); the catalog is viem 2.29.2.

All three judges ranked the connector design first on safety, partner DX and testability. The
vendor package's own internals validate the technique: it wraps `wallet.getEthereumProvider()` in
wagmi's `injected({ target })` — we do the same with a proper `createConnector`, statically, and
without touching wagmi `_internal`.

### Why a sub-path and not a dynamic import or a separate package

- A string-literal `import('@privy-io/react-auth')` in the **main entry** breaks non-Privy partners
  on webpack 5 ("Module not found") unless they add `externals` (verified experiment). A sub-path
  entry keeps the main entry and every `./xchains/*` entry free of `@privy-io/*` (verified with the
  repo's tsup 8.5 + `splitting: true`; class identity is preserved through the shared chunk).
- A separate npm package would need edits to `release.mjs`, `bump-versions.sh` and
  `sdks-publish.yml` (hard-coded package lists) for no extra isolation. Precedents: `./xchains/*`
  sub-paths in this package; optional peer `libsodium-wrappers-sumo` in `@sodax/libs`.

### What stays untouched (the regression proof)

`EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`, `useXWalletStore.ts`, `useWalletModal`,
`useEvmSwitchChain`, `EvmWalletProvider` (core). Privy rides wagmi's `useConnectors` /
`useAccount` / `useWalletClient` / `reconnect()` exactly as MetaMask does; `EvmHydrator.test.tsx`
must pass unchanged.

### Settled choices (do not re-litigate)

1. **Modal login**, `login({ loginMethods: ['email'] })`, not headless `useLoginWithEmail` (marked
   `@experimental` in the 3.43 types; `createOnLogin` does not fire for headless flows).
2. **Disconnect = Privy sign-out** in V1 (shared-device safety; open question Q3 can relax it).
3. **Partner-owned `appId`** is the design default (Q2 can change it; nothing in code depends on
   it).
4. **No recovery/password API in V1** — Privy's default TEE execution has no password factor
   (see Risks 1 and Q1). Nothing speculative ships.
5. **`showWalletUIs` not defaulted** by the SDK; the dashboard setting applies unless the partner
   passes it.
6. **Sonic (146)** is the embedded wallet's default chain; `supportedChains` mirrors the SDK's
   14-chain wagmi tuple so `wallet_switchEthereumChain` never hits Privy's 4901.
7. **No changeset** (PR #407 removed them); release notes come from commit subjects. No `#456` in
   commit subjects; no attribution trailers.

## Public API

```ts
// @sodax/wallet-sdk-react (main entry) — src/types/config.ts; no Privy imports, no Privy types
export type EvmWalletSourceContext = {
  readonly chains: readonly [Chain, ...Chain[]];   // the SDK's wagmi chain tuple (SODAX_EVM_CHAINS)
  readonly evmConfig: Readonly<EvmTypeConfig>;
};
/** @internal structural contract behind EVM.privy; not a public extension point in V1 */
export type EvmWalletSource = {
  readonly kind: string;
  readonly id: string;                                          // stable wagmi connector id
  readonly createConnector: (ctx: EvmWalletSourceContext) => CreateConnectorFn;
  readonly Host?: ComponentType<{ ctx: EvmWalletSourceContext; children?: ReactNode }>;
};
export type PrivyEvmSource = EvmWalletSource & { kind: 'privy'; id: 'privy'; appId: string; clientId?: string };
export type EvmAdapterFields = { /* existing */ ; privy?: PrivyEvmSource };

// @sodax/wallet-sdk-react/privy — src/privy/index.tsx ('use client')
export type PrivyOptions = {
  appId: string;                 // partner-owned Privy app id
  clientId?: string;
  defaultChainId?: number;       // must be one of the SDK EVM chains; default 146 (Sonic)
  showWalletUIs?: boolean;       // omitted → dashboard setting
  appearance?: PrivyClientConfig['appearance'];
  legal?: PrivyClientConfig['legal'];
  connectTimeoutMs?: number;     // default 300_000 — user finishing the OTP
  reconnectTimeoutMs?: number;   // default 30_000  — session restore on reload
};
export const PRIVY_CONNECTOR_ID = 'privy';
export const PRIVY_CONNECTOR_NAME = 'Email (Privy)';
export function privy(options: PrivyOptions): PrivyEvmSource;
export class PrivyHostNotMountedError extends Error {}
```

Partner usage (copy-paste target for `WALLET_PRIVY.md`):

```ts
// pnpm add @sodax/wallet-sdk-react @privy-io/react-auth
import { SodaxWalletProvider, type SodaxWalletConfig } from '@sodax/wallet-sdk-react';
import { privy } from '@sodax/wallet-sdk-react/privy';

const config: SodaxWalletConfig = {
  EVM: {
    walletConnect: { projectId: WC_PROJECT_ID },   // still works (AC5)
    privy: privy({ appId: PRIVY_APP_ID, legal: { termsAndConditionsUrl: '/terms' } }),
    chains: { /* rpcUrl overrides as today */ },
  },
};
// Modal caveat, same as WalletConnect: render nothing while
// state.kind === 'connecting' && state.connector.id === 'privy'
```

Every exported function on the sub-path carries an explicit return type (tsup dts emits
TS2742/TS4058 on inferred Privy types — verified).

## Architecture (condensed; full text in `plan-architecture.md` § 2)

Mount tree with `EVM.privy` set (without it, only a falsy check and a pass-through boundary):

```
<WalletConfigProvider>
  <EvmProvider>
    <QueryClientProvider client={ownQueryClient}>
      <WagmiProvider reconnectOnMount config={createWagmiConfig(chains, { connectors: [walletConnect?, privyConnector] })} initialState>
        <EvmHydrator/> <EvmActions/>            // unchanged; EIP-6963 (mipd) stays ON
        <EvmSourceHost source={config.privy} ctx> // class error boundary → bare {children} on Host throw
          <PrivyHost ctx>                       // <PrivyProvider appId clientId config={derived}>
            <PrivyBridge/>                      // the ONLY place Privy hooks run; publishes into PrivyRuntime
            {children}                          // partners may call usePrivy() here
```

Sub-path modules (`src/privy/`): `index.tsx` (factory, one `PrivyRuntime` per call),
`runtime.ts` (framework-free store: snapshot, `subscribe`, `waitFor(pred, { timeoutMs })`,
pending-login deferred, `logout` event), `deferredProvider.ts` (stable `{ request, on,
removeListener }` shell; rejects 4900 while detached; re-emits `chainChanged`),
`privyConnector.ts` (wagmi `createConnector` against the runtime only), `PrivyHost.tsx`
(`PrivyProvider` + `PrivyBridge` using `usePrivy`, `useWallets`, `useLogin`, `useLogout`,
`useCreateWallet`, `getEmbeddedConnectedWallet`), `sessionProbe.ts`, `icon.ts`.

Derived `PrivyProvider` config: `loginMethods: ['email']`;
`embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' }, showWalletUIs? }`;
`supportedChains: ctx.chains` (cast once at the boundary — two viem copies);
`defaultChain` = chain with `id === defaultChainId ?? 146`; `appearance` / `legal` passthrough.

### Lifecycle — with the corrections from the adversarial pass

**First login (AC2).** `useXConnect(privyEntry)` → `chainActions.connect('privy')` →
`connectAsync({ connector })` → `privyConnector.connect({ chainId })`:

1. `await runtime.waitFor(s => s.hostMounted && s.ready, 15 s)`; never mounted →
   `PrivyHostNotMountedError`.
2. **Branch on `authenticated` first** (verified: when the user is already logged in, Privy's
   `login()` only `console.warn`s and fires *no* callback — a deferred keyed on callbacks would
   hang). `authenticated && embedded` → skip login. `authenticated && walletsReady && !embedded`
   → `ops.createWallet()` (tolerate "already exists").
3. Otherwise `ops.login()`: the bridge stores a pending deferred and calls
   `login({ loginMethods: ['email'] })` with a **ref-stable callbacks object** (the subscribe
   effect keys on object identity). Resolve on `onComplete`. **Reject only on
   `onError('exited_auth_flow')`** (user closed the dialog) → viem `UserRejectedRequestError` so
   `useWalletModal` reaches `error`. Other `onError` codes (bad OTP, send-code failure) are
   recoverable in-modal and must not reject. `connectTimeoutMs` (300 s) → `TimeoutError`; a late
   `onComplete` still publishes state so the next `connect()` takes branch 2 without a second OTP.
   Never rely on the `wasAlreadyAuthenticated: true` event (one-shot from `PrivyProvider` init;
   not replayed to later subscribers) — read `usePrivy().authenticated` / `useWallets()` instead.
4. `await runtime.waitFor(s => s.walletsReady && s.embedded, 30 s)`; absent → `createWallet()`
   and wait again (covers the unverified `createOnLogin` timing).
5. `provider = await embedded.getEthereumProvider()`; `deferred.attach(provider)`;
   `accounts = [getAddress(embedded.address)]`; `chainId` via `eth_chainId`; requested chain
   differs → `this.switchChain`.
6. `storage.setItem('privy.connected', true)` (wagmi storage = the SDK's cookie storage under
   `persistKey`); return `{ accounts, chainId }`; wagmi writes `recentConnectorId = 'privy'`.
7. wagmi `connected` → `EvmHydrator` writes `xConnections.EVM = { xConnectorId: 'privy', … }`;
   `useWalletClient()` resolves (wagmi builds `createClient({ transport: custom(provider) })` with
   its *own* viem; only `provider.request` crosses the viem boundary — verified) →
   `EvmWalletProvider` → `walletProviders.EVM` (AC4).

**Returning user reload (AC3).** Both existing triggers work: `reconnectOnMount: true` (wagmi
mount reconnect) and the SDK default `false` (`EvmHydrator` retries `reconnect()` when a
persisted `xConnections.EVM` exists). wagmi's `reconnect()` is sequential per connector:
`getProvider()` (skip on falsy/throw) → `isAuthorized()` → `connect({ isReconnecting: true })`.
Hard requirements (verified in `@wagmi/core` 2.20.3 `reconnect.ts`):

- `getProvider()` returns the deferred shell — a **distinct object** (never `window.ethereum`,
  wagmi dedupes by identity) and never throws.
- **`isAuthorized()` must be total and self-timed**: wagmi does not catch it; a throw rejects
  the whole loop, later connectors (MetaMask/WC) are never tried, and the module-level
  `isReconnecting` flag stays `true` for the page lifetime. Implementation:
  `storage.getItem('privy.connected') === true && !noPrivyTraceOnDevice()`, everything in
  try/catch → `false`. The probe returns `true` only on *positive* no-session evidence (readable
  `localStorage` with no `privy:*` key and no `privy-session=` cookie); in HttpOnly-cookie mode
  which traces stay readable is unverified (spike item 5) — if none, drop the probe and rely on
  `ready` + `reconnectTimeoutMs`.
- `connect({ isReconnecting: true })`: wait `hostMounted && ready` (≤ `reconnectTimeoutMs`);
  `!authenticated` → clear flag, throw (**never opens the modal on reload**); wait for the
  embedded wallet; attach; return the same address. Failure clears the flag; the Hydrator's
  existing `wasConnectedRef` logic then `unsetXConnection('EVM')`.
- Same email → same address **for the same `appId`, as long as the user has not been deleted or
  unlinked** (address is bound to the app-scoped user record; entropy is random, not derived from
  the email). Different `appId` → different address. This is the exact AC3 wording for docs.

**Disconnect.** `useXDisconnect` → `EvmActions.disconnect` (store cleared,
`markUserDisconnected('EVM')`, `disconnectAsync()`) → `privyConnector.disconnect()`: remove the
flag, `deferred.detach()`, `await ops.logout()`. Reverse direction is **required**, not optional:
after a Privy logout (partner code, token expiry, another tab) the provider emits nothing and
still answers `eth_accounts`, but signing throws 4900. The bridge watches `authenticated`
true→false and emits `logout`; the connector, while attached, detaches and calls
`onDisconnect()` → wagmi drops the connection → Hydrator clears the store.

**Chain switch.** `useEvmSwitchChain` → wagmi `switchChain` → `privyConnector.switchChain`:
**validate against wagmi `config.chains` first** (`SwitchChainError` otherwise) because Privy's
provider mutates `chainId` *before* throwing 4901; then `await embedded.switchChain(chainId)`,
re-request `getEthereumProvider()` and re-attach (Privy: "will not update any existing provider
instances"), `emit('change', { chainId })`. `useWalletClient()` re-resolves and the Hydrator
rebuilds `EvmWalletProvider` with `resolveEvmDefaults(newChainId)` — existing code.

**Coexistence (AC5).** `multiInjectedProviderDiscovery` stays at wagmi's default; `walletConnect()`
stays in the array; Privy is appended, never replaces. With `loginMethods: ['email']` and no
`connectWallet` call, Privy registers no EIP-6963/WalletConnect connectors of its own.
`isAuthorized()` answers from storage, so MetaMask/WC reconnects are never delayed.

## Steps

### Step 0 — Spike (0.5–1 day, before the branch is opened; paste results in the PR body)

Scratch **worktree** from `main` (never `git stash`; the local checkout is on
`fix/sui-asset-manager-live-package-id`). Add the two `trustPolicyExclude` entries,
`pnpm add -D @privy-io/react-auth@<newest eligible> --filter @sodax/wallet-sdk-react` (3.40.0 as
of 2026-09-18; 3.41/3.42 become eligible 2026-09-23, 3.43 on 09-29 — pick the newest that clears
`minimumReleaseAge` on the day), then `pnpm i && TURBO_CONCURRENCY=2 pnpm build:packages &&
pnpm checkTs && pnpm check-exports && pnpm check:knip`. Then in `apps/wallet-modal-example` with a
dev Privy app (Email login, Ethereum embedded wallets, allowed origin `http://localhost:3002`,
"Enable test accounts" → `test-XXXX@privy.io` / OTP `XXXXXX`):

1. `import('@privy-io/react-auth')` loads under pnpm's isolated layout (the npm-hoisted layout
   crashes on `tempoModerato` missing from viem 2.29.2 — verified; pnpm is expected to resolve the
   nested 2.56.0 — verified by two refuters, confirm at runtime).
2. `useWalletClient()` resolves for the custom connector → `walletProviders.EVM` set; `signMessage`
   and a 0-value self `sendTransaction` succeed.
3. `createOnLogin` populates `useWallets()` before or after `onComplete`?
4. After `wallet.switchChain`, does `useWallets()[i].chainId` update; does a fresh
   `getEthereumProvider()` report the new chain?
5. HttpOnly-cookie mode: which `privy:*` keys / non-HttpOnly cookies stay readable (decides the
   session probe).
6. Switch + send on each of the 14 chains (Sonic, HyperEVM, Kaia, Hedera, LightLink, Redbelly,
   Robinhood are unverified on Privy's RPC side).
7. Confirm the post-build `'use client'` restore lands as line 1 of `dist/privy/index.mjs`
   (tsup's rollup pass strips it — verified).
8. Time-to-reconnect on reload; demo bundle delta; whether the auth iframe loads for anonymous
   visitors.

### Step 1 — Workspace and packaging

- `pnpm-workspace.yaml`: under the existing "Legacy-line backports…" comment add
  `"jose@4.15.9"` (4.x line, 2024-07-03; jose 5.0.0 with provenance is 2023-10-25; same
  maintainer) and `"ua-parser-js@1.0.41"` (1.x line; 2.x has provenance; same maintainer), each
  with a one-line evidence note in the same style. Verified: exactly these two unblock the tree;
  0 exotic subdeps; OSV clean once the existing `ws@8` override applies.
- `packages/wallet-sdk-react/package.json`: `exports['./privy']` (`types` + `import`),
  `typesVersions['*'].privy`, `peerDependencies['@privy-io/react-auth'] = '^3.40.0'` +
  `peerDependenciesMeta.optional`, `devDependencies['@privy-io/react-auth'] = '<exact>'`,
  `build` += `&& node ../../scripts/restore-use-client.mjs && node ../../scripts/check-entry-isolation.mjs`.
- `tsup.config.ts`: `entry` += `'src/privy/index.tsx'`.
- `knip.json`: `entry` += `"src/privy/index.{ts,tsx}"`; `rules.optionalPeerDependencies: "warn"`
  (knip 5.30.5 exits 1 on a referenced optional peer — verified).
- `scripts/restore-use-client.mjs` (NEW): prepend `'use client';\n` to `dist/privy/index.mjs`
  when absent (tsup `onSuccess` is the alternative; `banner` and `plugins[].renderChunk` are
  re-stripped — verified). Note the one-line sourcemap shift (sourcemaps are off in CI/publish).
- `scripts/check-entry-isolation.mjs` (NEW post-build gate): walk `import`/`export … from`/
  `import()` specifiers from `dist/index.mjs` and `dist/xchains/*/index.mjs` through relative
  chunks; fail if any reached file contains `@privy-io/`; assert `dist/privy/index.mjs` exists,
  starts with `'use client'`, and contains a bare `@privy-io/react-auth` specifier.

### Step 2 — Core seam (main entry; no Privy imports)

- `src/types/config.ts`: `EvmWalletSourceContext`, `EvmWalletSource` (`@internal`),
  `PrivyEvmSource`, `isEvmWalletSource()`; `privy?: PrivyEvmSource` on `EvmAdapterFields`.
- `src/xchains/evm/EvmXService.ts` + `index.ts`: extract the chain tuple (lines 99–114) into
  `export const SODAX_EVM_CHAINS = [...] as const satisfies readonly [Chain, ...Chain[]]`;
  `createWagmiConfig` spreads it; export from the `./xchains/evm` sub-path.
- `src/providers/evm/EvmProvider.tsx`: in the `useMemo`, `isEvmWalletSource(config.privy)` →
  `connectors.push(config.privy.createConnector(ctx))`, else (slot set but malformed) warn
  `[wallet-sdk-react] EVM.privy must be built with privy() from "@sodax/wallet-sdk-react/privy" —
  skipped.`; add `config.privy` to deps; wrap `{children}` in `<EvmSourceHost source ctx>`.
- `src/providers/evm/EvmSourceHost.tsx` (NEW): class error boundary; `console.error` once; renders
  `<Host ctx>{children}</Host>`, bare `{children}` on error or without a Host.
- **No change** to `EvmHydrator.tsx`, `EvmActions.tsx`, `EvmXConnector.ts`.

### Step 3 — Sub-path `src/privy/`

Files and responsibilities as in § Architecture. Connector facts: `type: 'privy'`, inline SVG
data-URI icon (no trademark asset), `setup()` subscribes to the runtime `logout` event,
`getProvider()` stable shell, `isAuthorized()` total + self-timed, `switchChain` validates
against `config.chains` first, `onAccountsChanged`/`onChainChanged` forward to the emitter.
`PrivyHost`: module-level `Set<appId>` mount guard registered in an effect and released on
cleanup (StrictMode-safe); a second host for the same `appId` warns and renders children only.
`privy()` validates `appId`, resolves `defaultChainId` against `ctx.chains` inside
`createConnector`, returns one runtime per call (no module singleton — test isolation). An
import-time guard in `index.tsx` rethrows the `tempoModerato` `SyntaxError` with a hint about
top-level viem ≥ 2.44 for npm/yarn-hoisted partners.

### Step 4 — Tests (vitest, happy-dom; `checkTs` typechecks tests; `as unknown as` needs a why-comment)

- `src/privy/privyConnector.test.ts`: real `@wagmi/core` `createConfig` with
  `[privyConnector({ runtime: fake }), mock()]` and an in-memory `createStorage`, fake timers, no
  Privy import (sushiswap precedent). Cases: the four `connect` branches + late completion;
  `exited_auth_flow` → `UserRejectedRequestError`; non-terminal `onError` does not reject; timeout
  → `TimeoutError`; `isAuthorized` truth table incl. "throws inside → false"; `reconnect()` success
  and failure (flag cleared, instant second pass); `disconnect()` → logout + flag removed + shell
  detached; runtime `logout` while attached vs detached; `switchChain` (re-attach + `change`;
  unsupported → `SwitchChainError` without touching the provider); stable `getProvider()` identity.
- `src/privy/PrivyHost.test.tsx`: `vi.mock('@privy-io/react-auth')` with a pass-through
  `PrivyProvider` and controllable hooks (Uniswap pattern). Cases: snapshot follows the hooks;
  `onComplete` resolves a pending attempt and is ignored without one; `authenticated` true→false
  emits `logout`; derived config (`loginMethods`, `createOnLogin`, `supportedChains === ctx.chains`,
  `defaultChain.id === 146`, no `showWalletUIs` key when unset); stable callbacks object;
  duplicate host → warn + children only, released on unmount.
- `deferredProvider.test.ts`, `sessionProbe.test.ts`, `index.test.ts` (distinct runtimes per
  call; SSR-safe under `// @vitest-environment node`).
- `EvmProvider.test.tsx` (extend the existing WagmiProvider-capture pattern): fake source →
  connector factory reaches `createWagmiConfig` and the Host renders inside the captured
  `WagmiProvider` with `ctx.chains === SODAX_EVM_CHAINS`; absent → neither; `{ appId: 'x' }`
  literal → warn + skipped; throwing Host → `console.error` once, Hydrator/Actions/children still
  mounted; `vi.doMock('@privy-io/react-auth', () => { throw })` never trips without `privy`.
- `EvmHydrator.test.tsx`: unchanged and green.

### Step 5 — Demo proof (`apps/wallet-modal-example` only)

`src/privy-source.ts` (NEW): `if (import.meta.env.VITE_PRIVY_APP_ID) { const { privy } = await
import('@sodax/wallet-sdk-react/privy'); return privy({ appId }) }`; `index.tsx` awaits it before
`root.render(<Providers privy={source}>)`; `providers.tsx` maps the optional source to
`EVM.privy`; devDependency `@privy-io/react-auth <exact>`; `.env.example`; an `App.tsx` panel with
sign-message and 0-value `sendTransaction` on `useWalletProvider('EVM')` (AC4 proof on the same
class `@sodax/sdk` consumes). `apps/demo` and `apps/example-next-js-16` stay **Privy-free** — they
are the CI proof that the main entry has no Privy (`ci.yml:223`).

### Step 6 — Docs and skills (Docs Drift + AI-drift gates)

- `packages/wallet-sdk-react/docs/WALLET_PRIVY.md` (NEW, mirror `WALLETCONNECT.md`'s shape):
  install + optional-peer semantics; dashboard prerequisites (Email login, Ethereum embedded
  wallets, allowed origins, test accounts, wallet MFA); `privy()` options; OTP behaviour; same
  address only per `appId`; disconnect = sign-out; reconnect + modal caveat (`'privy'`); **recovery
  reality** (no password on TEE default; recovery = login method; MFA recommended); key export
  always available to the user; CSP block (`frame-src https://auth.privy.io`, `connect-src
  https://auth.privy.io https://*.rpc.privy.systems`, Turnstile); second viem copy + npm/yarn
  hoisting caveat (top-level viem ≥ 2.44); pricing/SLA pointer; tested Privy version; App Router
  needs the partner's own `'use client'` wrapper (the main entry ships without the directive).
- `README.md`: feature bullet after line 14, quick-start comment near line 58, docs-table row
  after line 109 with an **absolute GitHub URL** (README is the page mirrored to docs.sodax.com;
  `check:doc-links`).
- `docs/CONFIGURE_PROVIDER.md`: new § "Privy email login (EVM only)" after the WalletConnect
  section (line 217). `docs/CONNECTORS.md` (line ~216): name `EVM.privy` beside "a custom wagmi
  connector". `docs/WALLET_MODAL.md` (229–244): generalise the render-null caveat to
  `'walletConnect' || 'privy'`. `docs/SUB_PATH_EXPORTS.md`: `./privy` is the only entry that
  references `@privy-io/react-auth`. `docs/ARCHITECTURE.md`: source/host pattern; Hydrator stays
  the only writer. `AGENTS.md` (near line 42): Privy lives only under `src/privy`; core never
  imports `@privy-io/*`; `EVM.privy` is a wagmi connector source; no `'privy'` branching in modal
  primitives.
- `packages/skills/skills/sodax-wallet-sdk-react/privy/SKILL.md` (NEW granular skill, frontmatter
  `name: sodax-wallet-sdk-react-privy`, layout from `walletconnect/SKILL.md`) and
  `integration/knowledge/recipes/privy-setup.md` (NEW, mirror `walletconnect-setup.md`),
  registered in the six files that list recipes (`SKILL.md`, `walletconnect/SKILL.md`,
  `knowledge/README.md`, `examples/README.md`, `ai-rules.md`, `recipes/setup.md`); the
  `check-ai-imports` fixture maps `@sodax/wallet-sdk-react/*` → `src/*/index.js`.
  `.claude/skills/add-wallet-provider/SKILL.md`: mention `EVM.privy` beside `EVM.walletConnect`.
- Run `pnpm --filter @sodax/skills check:ai` and `pnpm check:doc-links` locally before every push
  (a gate you just added must be run).

### Step 7 — Gates, canary, PR

- Local: fresh `pnpm i`, `TURBO_CONCURRENCY=2 pnpm build:packages`, `pnpm checkTs`,
  `pnpm check-exports`, `pnpm check:knip`, `pnpm check:circular-deps`, `pnpm test`, biome on
  touched files only (`pnpm pretty` reformats unrelated files on main).
- `.github/workflows/privy-latest-canary.yml` (NEW, weekly `schedule` + `workflow_dispatch`,
  `continue-on-error: true`, precedent `security.yml`): throwaway install of
  `@privy-io/react-auth@latest` with the cooldown overridden for that job only, then `checkTs` +
  `vitest run src/privy`. Privy ships weekly; this is how a breaking minor is seen before the
  devDependency bump.
- One branch from `main`, one PR. Commit subjects (no `#456`, no trailers):
  `feat(wallet-sdk-react): add opt-in Privy email login as an EVM wallet source`;
  `chore(workspace): exclude jose@4.15.9 and ua-parser-js@1.0.41 from trustPolicy no-downgrade`;
  `docs(wallet-sdk-react): add Privy partner guide and provider docs`;
  `docs(skills): add wallet-sdk-react privy skill and recipe`;
  `chore(wallet-modal-example): env-gated Privy demo`; `ci: weekly Privy latest canary`.
- PR body: spike results, the +53-name dependency delta for reviewer sign-off, evidence for both
  excludes, tested Privy version, open questions resolved or explicitly deferred. Out-of-scope
  findings go in the PR thread, not new issues. `@sodax/wallet-sdk-react` stays on the
  `2.0.0-rc` line; additive → no `!` marker.

Effort: 8–9 working days + the spike.

## Verification

| AC | Mechanism | Proof |
| --- | --- | --- |
| AC1 list entry only when `EVM.privy` is set; no Privy code otherwise | `EvmProvider` appends `createConnector(ctx)`; `EvmHydrator` mirrors `useConnectors()` unchanged; main entry has no `@privy-io` reference | `EvmProvider.test.tsx`, `check-entry-isolation.mjs`, Privy-free `apps/demo` + Next 16 builds in CI, demo: env unset → `grep -ril privy dist/assets` empty and no `auth.privy.io` traffic |
| AC2 email OTP → connected `XAccount` | `connect()` → `login({ loginMethods: ['email'] })` → `onComplete` → embedded wallet → `getEthereumProvider()` → wagmi `connected` → Hydrator writes `xConnectorId: 'privy'`. **"set recovery/password"** has no mechanism on TEE — see Risks 1 / Q1 | connector + host unit tests; demo with a new test email |
| AC3 same address on return | wagmi `reconnect()` → deferred `getProvider()` → total `isAuthorized()` → `connect({ isReconnecting })`; same user → same wallet within one `appId` | reconnect unit tests; demo reload under both `reconnectOnMount` values; second `appId` → different address (documented) |
| AC4 SODAX signed action via `useWalletProvider('EVM')` | `useWalletClient()` over `custom(deferredProvider)`; Hydrator builds `EvmWalletProvider` as for MetaMask | spike item 2; demo sign + 0-value send; QA row 11 |
| AC5 injected + WC keep working | mipd on; `walletConnect()` kept; Privy appended; `isAuthorized()` never waits without flag/session; Privy registers no connectors of its own | `EvmProvider.test.tsx` (WC + source coexist); demo: MetaMask → WC → Privy → MetaMask in one session; QA rows 5, 9, 10 |
| AC6 docs | `WALLET_PRIVY.md`, README row (mirrored), provider/modal/connector docs, AGENTS, skills skill + recipe | docs-drift, doc-links, check:ai, AI-drift gates green |

Manual QA matrix (15 rows) is in `plan-architecture.md` § 7.4; the non-obvious rows: session
expired then reload (instant skip, no stall); iframe blocked by CSP/adblock (fails within
`reconnectTimeoutMs`, MetaMask/WC usable); close the dialog mid-OTP and wrong OTP ×5 (recoverable,
modal stays; only closing rejects); logout from Privy in another tab (wagmi `disconnected`, store
cleared); MetaMask disconnect then Privy login (no ghost reconnect); broken Privy config (boundary
logs once, other wallets keep working); Safari without extensions (Privy-only flow works).

## Risks

1. **Issue premise vs Privy reality (blocking for AC2 wording, not for code).** "Password = wallet
   recovery factor" exists only for Privy's *on-device* execution, enabled by Privy support;
   the default is TEE execution with no password factor — recovery *is* the login method, and the
   documented gate is wallet MFA. Verified in Privy's architecture, cloud-recovery and
   authentication pages. → Settle Q1 before writing AC2 docs; V1 exposes nothing for recovery;
   if Product picks on-device, `useSetWalletRecovery()` becomes a `privy()` option later without
   a contract change. Decision 0003 records the supersession of 0001.
2. **Two viem copies.** `@privy-io/react-auth` hard-depends on viem 2.56.0; npm/yarn-hoisted
   partner apps crash at import if their top-level viem is < 2.44 (verified). → Spike item 1;
   document the floor; import-time guard with a hint; raise the catalog bump in the PR thread as a
   separate decision.
3. **Privy ships weekly; the 14-day cooldown keeps the devDependency 2–3 minors behind; `^3.40.0`
   admits untested versions.** → Privy hooks confined to `PrivyHost.tsx` behind the runtime
   interface; weekly canary; tested version stated in the docs; no `@experimental` APIs.
4. **Sequential `reconnect()` waits on Privy when the flag is set and the iframe is slow or
   blocked.** → fast fail on `!authenticated` once `ready`; positive-evidence probe;
   `reconnectTimeoutMs` bounds the rest; `isAuthorized()` never throws.
5. **Privy's `<dialog>` stacks under the partner's modal; an abandoned dialog holds `connecting`
   up to 300 s.** → same caveat WalletConnect has (render null while connecting for `'privy'`);
   `back()` already drops the in-flight attempt; no branching in SDK primitives.
6. **Partner already mounts its own `PrivyProvider`** (sodax-frontend's follow-up card). → V1: the
   SDK owns it when `EVM.privy` is set; children are inside it so `usePrivy()` works; duplicate-host
   guard warns.
7. **Sends on non-default chains unverified** (Privy signs through its own RPC, not the SDK's
   `rpcUrl` overrides). → spike item 6; document the verified subset; `addRpcUrlOverrideToChain`
   as a follow-up.
8. **Supply-chain review load** (+53 new names incl. styled-components, x402, @stripe/*,
   hcaptcha; two exact excludes). → optional peer means non-Privy partners install nothing; exact
   devDependency so a blocked bump never leaks into a release; per-entry evidence in the PR.
9. **Eager `PrivyProvider` mount may load the iframe for visitors who never pick email**
   (unverified). → spike item 8; lazy mount is a documented follow-up.

## Open questions for Fez / Robi (none block the spike; Q1 blocks AC2 docs)

1. **Execution mode / the "password" line.** TEE (default) or on-device? On TEE there is no
   password factor; the safeguard is wallet MFA. Rewrite AC2 to "recovery = email OTP, MFA
   recommended", or request on-device execution and add a recovery option later?
2. **Whose `appId`?** Partner-owned (default here: partner controls origins, MFA, cookies, legal
   URLs, billing; addresses differ per partner) or SODAX-provided (one wallet across integrations;
   SODAX allow-lists every partner origin, pays MAU/signature fees, holds the secret, and all
   partner sites share one trust boundary)?
3. **Disconnect semantics.** V1 = SODAX disconnect signs the user out of Privy. OK, or do partners
   who also use Privy for app auth need a keep-session mode?
4. **Privy signing prompts** (`showWalletUIs`): leave to the dashboard, or recommend a value?
5. **Default chain** Sonic (146) — confirm.
6. **Demo scope.** Privy only in `apps/wallet-modal-example`, or also a swap-intent demo in
   `apps/demo` (adds the peer there)?
7. **Dashboard ownership for QA.** Who owns the dev Privy app (email login, embedded wallets, test
   accounts, `localhost:3002` origin)?
8. **Catalog viem.** OK to raise viem to ≥ 2.44 (ideally 2.56.0) in a follow-up so npm/yarn
   partners cannot hit the hoisting crash?

## Out of scope (V1)

Solana/other-chain Privy wallets (the internal source shape and per-instance runtime let a later
`SOLANA.privy` share the same `privy()` instance); a public `EVM.sources` extension point and the
WalletConnect-as-source refactor; `@privy-io/wagmi`, `useSetActiveWallet`, smart-account
connectors; headless `useLoginWithEmail` / a SODAX-styled OTP UI; recovery enrollment,
keep-session, an SDK `usePrivyUser()` hook; catalog viem bump; Privy in `apps/demo` / the Next
example; a SODAX-provided shared `appId`; Global Wallets; lazy `PrivyProvider` mounting;
Privy-side RPC overrides; replacing sodax.com's in-house email login (separate card).
