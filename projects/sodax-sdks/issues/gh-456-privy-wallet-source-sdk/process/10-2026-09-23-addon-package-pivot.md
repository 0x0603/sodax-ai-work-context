---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-23
updated: 2026-10-05
---

# Session 10 — pivot to the add-on package `@sodax/wallet-privy` (EIP-6963)

> Renumbered 07 → 10 on 2026-10-05: written 2026-09-23 on a second machine and not pushed until then; the other
> machine had taken 07–09 in the meantime. In time order it sits between sessions 06 and 07.

> **Rejected by the user once built (same day): "tôi không thích cách làm này reset hết đi".**
> `../sodax-sdks-456` was reset to `a2d6efb9` (the pushed `EVM.privy` design); nothing was committed or
> pushed. The code survives only as the unreferenced commit `7ee0c1ac` in the shared repo, which git may
> prune after about two weeks. Read this for its findings, not as a plan.

The user asked for the cleaner alternative written up at the end of session 06 and chose it
("quành về cái này đi"). This **supersedes plan rev 3's API and packaging** (`EVM.privy`, the
`/privy` sub-path, the optional peer). The runtime, bridge, start-up guard, custody, availability and
QA content of `plan.md` still apply. Uncommitted in `../sodax-sdks-456` on top of `a2d6efb9`.

## Shape

```tsx
<SodaxWalletProvider config={config}>
  <PrivyEmailWallet appId="…"><App /></PrivyEmailWallet>
</SodaxWalletProvider>
```

- **`wallet-sdk-react` keeps only the disconnect-all fix** (`EvmActions`, its test, one `AGENTS.md` line,
  the `CONNECT_FLOW.md` paragraph) plus one README feature bullet pointing at the add-on. Everything else
  from commits `b3c54dc3`/`20ec90f8`/`7401e224` is reverted to `origin/main` (`84304d4a`).
- **New package `packages/wallet-privy`**: `PrivyEmailWallet.tsx` (public), `provider.ts` (EIP-1193 facade
  that answers exactly what wagmi's `injected` connector calls), `announce.ts` (EIP-6963), plus the moved
  `runtime` / `PrivyBridge` / `PrivyStartupGuard` / `privyConfig` / `connectedFlag` / `errors` / `icon`.
  Exports: `PrivyEmailWallet`, `PrivyEmailWalletProps`, `PRIVY_WALLET_ID = 'com.sodax.privy'` (rdns =
  wagmi connector id = `xConnectorId`).
- Release lists: `wallet-privy` added after `wallet-sdk-react` in `scripts/bump-versions.sh` and both
  `PACKAGES=` lines of `sdks-publish.yml` (`packageListErrors` → `[]`). Docs page mirrored to
  `docs/developers/packages/connection/wallet-privy.md` (map + nav + Connection index card). Skills: recipe
  rewritten, `api-surface.md` gets an add-on section, the `EVM.privy` entries reverted.

## Facts that shaped the facade (wagmi 2.16.9 / `@wagmi/core` 2.20.3)

1. **Login only through `eth_requestAccounts`.** `injected.connect()` tries `wallet_requestPermissions`
   first (`connectors/injected.js:79`) and swallows every error but 4001 / -32002, then falls back to
   `eth_requestAccounts` (`:105`). Routing login through the first call made a timeout run twice; the facade
   answers 4200 before a session exists. Mutation M1 is killed by a fake-timer test.
2. **Never emit a non-empty `accountsChanged` or `connect`.** `createConfig` puts a `connect` listener on
   every connector's emitter (`createConfig.js:60`), and `onAccountsChanged` connects when that listener
   exists (`injected.js:382`) — wagmi would connect Privy without the user.
3. **Supersession must read wagmi's status, not a start snapshot.** A reconnect replaces the whole
   connections map for its first restored connector (`actions/reconnect.js:68`), so a wallet the user
   connected before Privy's restore *started* was still clobbered. Rule now: return nothing when
   `status === 'connected'` with a non-Privy current connector (during connect/reconnect it never is).
4. **One provider per page.** An announcement cannot be withdrawn and mipd dedupes by uuid, so a remount
   rebinds the same provider; a different binding ends the old session and the SDK's retry restores it.
5. **Announce synchronously in the effect.** With `ssr: true` (SDK default) Hydrate's `onMount` re-reads
   `mipd.getProviders()` after rehydrate (`hydrate.js:31`), so the connector is in the list before the
   `EvmHydrator` retry; deferring the announcement broke that ordering on paper. With `ssr: false` the mipd
   subscriber drops an announcement made before storage hydration (`createConfig.js:243`) and never looks
   again — happens under RTL's `act()` (effects flush before microtasks), **not** in a real browser: the demo
   (`ssr: false`, StrictMode, dev) lists "Email (Privy)" in Chromium and surfaces "Invalid Privy app ID" at
   once for a fake id. Remaining exposure: `ssr: false` **and** the provider tree mounted inside a discrete
   event (sync commit). Not handled; say so if it comes up.

## Dependencies — one wagmi

`wagmi` and `viem` are regular **dependencies** of `wallet-sdk-react`, pinned by the catalog
(`2.16.9` / `2.29.2`). As peers of the add-on, pnpm could resolve a second wagmi instance and
`useContext(WagmiContext)` would miss the SDK's provider. The add-on therefore pins them the same way;
peers are `@privy-io/react-auth ^3.40.0`, `@sodax/wallet-sdk-react workspace:^`, `@tanstack/react-query
5.x`, `react >=19`. **Verified** with `pnpm pack:local` into a scratch pnpm app: the add-on's and the SDK's
`wagmi` resolve to the same directory; `viem`, Privy, the SDK, react and react-query are shared too. The
SDK's own docs already send partners to wagmi's `useAccount()`, so a single wagmi is an existing contract.

The scratch install hit an unrelated registry problem: a fresh resolve of
`@solana-mobile/wallet-adapter-mobile@2.3.0` wants `@solana/kit@7.1.1` → `@solana/rpc@7.1.1`, which npm
does not have (latest 7.0.0) — `ERR_PNPM_NO_MATCHING_VERSION`. The repo lockfile pins 2.2.8. Worked
around with an override in the scratch app only; it may bite partners installing `wallet-sdk-react` fresh.

## Pre-existing SDK bug found (not fixed — out of scope)

**Under React StrictMode, no EIP-6963 wallet is restored after a reload.** `EvmHydrator` sets
`wasConnectedRef` in its hydrated effect (`EvmHydrator.tsx:79`); StrictMode's second effect pass then sees
`disconnected` with the ref already true and calls `unsetXConnection('EVM')` (`:69`) before the retry
reconnect (`:47`) ever has a connector — so the retry never fires. Reproduced with a plain fake extension
announced before mount: restores without StrictMode, not with it. Dev only (production does not
double-invoke effects). The add-on's reload test therefore renders the second visit without StrictMode.
Raise in our own PR thread, not a new issue.

## Tests and gates (on the uncommitted tree)

- `wallet-privy`: 72 tests (provider 42 through wagmi's real `injected` connector; `PrivyEmailWallet` 10
  inside the real `SodaxWalletProvider` with only Privy mocked — listing, props to Privy, four warn-only
  configs, an app-owned wagmi, start-up failure, remount, and a connect → reload → sign → disconnect story).
  19 mutants, all killed (3 tests added for the survivors: M1 double login wait, M14 watcher leak, C4
  app-owned wagmi). `checkTs`, build, attw, madge, knip, biome clean.
- `wallet-sdk-react`: 210 tests, `checkTs`, knip, madge. Dependents: `checkTs` 15/15 after a fresh
  `build:packages` (dapp-kit had failed on a stale `@sodax/sdk` dist from before the main merge).
- Demo: builds with no Privy code without `VITE_PRIVY_APP_ID`, exactly one Privy copy with it.
- `check:ai`, `check:ai-dev-files` (root `AGENTS.md` sits at the 150-line cap — the add-on shares the
  `wallet-sdk-react` row and dependency line), `check:docs-pages`, `check:docs-nav`, `check:doc-links`,
  `--frozen-lockfile`. `mint` CLI not installed locally — `docs:validate` left to CI.
