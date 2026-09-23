---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-23
updated: 2026-09-23
---

# Session 05 — implementation: spike 0 + Steps 1–7, uncommitted

Worktree `../sodax-sdks-456` (`feat/456-privy-wallet-source`, base `1549d309`). Everything below is in
the working tree, **not committed**. Privy pinned at **`@privy-io/react-auth@3.40.0`** — the newest
version past the 14-day `minimumReleaseAge` (3.41/3.42 published 2026-09-09, 3.43+ later).

## Spike results

| Item | Result |
| ---- | ------ |
| 0 — Turbopack go/no-go | **GO.** `PrivyProvider` (dummy appId, rev-3 config) in `apps/example-next-js-16`: `next build` (Turbopack) and `next build --webpack` both green, `verify-build` 5/5 (`no-ssr-crash`, `no-hydration-mismatch`, …). webpack prints *warnings* only: `Can't resolve '@farcaster/mini-app-solana'` (Privy optional Solana peer) and "Critical dependency" in `ox/_esm/tempo`. No stub needed. Temporary edits reverted. |
| 1 — install + gates | Two excludes + exact devDep install cleanly. Package gates green (below). Privy 3.40.0 facts re-verified first-hand: `PrivyInterface` has `ready/authenticated/user/error`; `useLogin(callbacks)` → `{ login }`; `USER_EXITED_AUTH_FLOW = "exited_auth_flow"`; `useWallets()` → `{ wallets, ready }`; `ConnectedWallet.chainId: string`, `walletIndex?`, `getEthereumProvider()`, `switchChain()`; `createWallet()` "will error if the user already has an embedded wallet"; config fields `disableAllExternalWallets` (@experimental), `appearance.walletList`, `supportedChains`, `defaultChain`, `embeddedWallets.ethereum.createOnLogin`, `showWalletUIs`, `mfa.noPromptOnMfaRequired`; RPC order `privyWalletOverride → rpcConfig.rpcUrls[id] → rpcUrls.privy` (react-auth `getPublicClient-*.mjs` and js-sdk-core 0.73.0); embedded `handleSwitchEthereumChain` sets `this.chainId = Number(t)` with no validation and `eth_chainId` answers locally; `@privy-io/chains@0.5.2` registry lacks 146/1890/8217/151/295/4663 and 999 is "Zora Goerli Testnet". Privy's `Chain` type is structural (`@privy-io/chains`), so viem chains assign without a cast. |
| 2–4 | Not run — need a dev Privy app id (user action) and, for 3, gas + owner (open question 4). |

## What was built

- **Workspace:** `pnpm-workspace.yaml` excludes `jose@4.15.9`, `ua-parser-js@1.0.41`; lockfile +51 package
  names. Lockfile also gained **two** new WalletConnect lines (2.21.9 and 2.22.4 — rev 3 said one) and a
  dedupe `@wallet-standard/app` 1.1.0 → 1.1.1.
- **Core seam (no Privy):** `EvmXService.ts` → `SODAX_EVM_CHAINS` + `resolveEvmRpcUrls()` (transports built
  from it; signature unchanged; chain → key via `getEvmChainKeyByChainId`). `types/config.ts` →
  `privy?: PrivySource`, `PrivySource = { readonly kind: 'privy' }`. `providers/evm/privySource.ts` →
  internal `PrivySourceContext` / `PrivySourceSetup`, `createPrivySource`, `setupPrivySource`.
  `EvmProvider.tsx` → setup in the wagmi `useMemo`, renders `PrivyHost` around children.
- **Sub-path `src/privy/`:** `index.ts` (`privy()`, `PRIVY_CONNECTOR_ID`, `PrivyOptions`), `setup.tsx`,
  `runtime.ts`, `PrivyBridge.tsx`, `privyConnector.ts`, `deferredProvider.ts`, `connectedFlag.ts`,
  `privyConfig.ts`, `errors.ts`, `constants.ts`, `icon.ts` (plain envelope SVG, no Privy logo).
- **Packaging:** `exports['./privy']`, `typesVersions.privy`, peer `^3.40.0` + `peerDependenciesMeta.optional`,
  tsup entry, `scripts/check-privy-isolation.mjs` in `build`.
- **Tests:** 35 new (connector 22 on real `@wagmi/core` + real runtime, config 5, `privy()` 4, bridge 4)
  + 3 `EvmProvider` + 3 `EvmXService`. Package total 250 green.
- **Demo:** `apps/wallet-modal-example` — `src/privy.ts` (env-gated dynamic import), `index.tsx` resolves
  it before first render, `components/PrivyPanel.tsx` (lazy), `example.env` (repo convention, not
  `.env.example` which `.gitignore` swallows), `resolve.dedupe` += Privy, README/AGENTS rows.
- **Docs:** new `docs/WALLET_PRIVY.md`; README (feature bullet with the four must-read sentences, quick-start
  comment, docs row, sub-path note) + regenerated `docs/developers/packages/connection/wallet-sdk-react.md`;
  `CONFIGURE_PROVIDER.md`, `CONNECTORS.md`, `WALLET_MODAL.md`, `SUB_PATH_EXPORTS.md`, package `AGENTS.md`.
- **Skills:** recipe `integration/knowledge/recipes/privy-email-login.md` + three index lines — **not** a
  granular skill (8-file registration for no extra value). The `usePrivy` block carries `@ai-snippets-skip`.
- **CI:** `wallet-modal-example` added to *Build Apps*.

## Gates run (all green)

wallet-sdk-react `test` (250) · `checkTs` · `build` (+ `verify-dist-exports`, `check-privy-isolation`) ·
`check-exports` (attw: `./privy` 🟢 ESM/bundler) · `check:knip` · `check:circular-deps` · biome lint/format
(changed files only) · `turbo checkTs --filter=...@sodax/wallet-sdk-react` 14/14 · CI *Build Apps* 11/11 ·
Next 16 `verify-only` 5/5 · `check:ai` · `check:doc-links` · `check:docs-nav` · `check:docs-pages` ·
`check:ai-dev-files` · `pnpm i --frozen-lockfile`. Isolation gate proven by a deliberate leak (failed with
`dist/chunk-*.mjs imports @privy-io/*`, then reverted). Not run: root `pnpm test` (linked-worktree rule),
OSV scan, docs-drift (needs commits).

## Deviations from `plan.md` rev 3 (fold in when next editing the plan)

1. **Supersession rule changed.** `current !== startCurrent` alone misses the case where the user connects
   another wallet *before* wagmi's reconnect loop reaches Privy (then `startCurrent` already is that
   wallet, and wagmi's first-success branch replaces it). Test caught it. Rule now:
   `status === 'connected' && current is not Privy && (isReconnecting || current !== startCurrent)` —
   both wagmi `connect` and `reconnect` set `connecting`/`reconnecting` before calling the connector, and
   only another finished connect flips it to `connected`; a *failed* parallel connect can also restore
   `connected`, hence the `startCurrent` clause for interactive attempts.
2. **`pendingRuntimeChainId` removed.** Every `attach()` pulls a freshly minted provider to
   `lastVerifiedChainId` in-band; `wallet.switchChain()` stays best-effort. Same guarantee, one variable less.
3. **Opaque value via a module `WeakMap`, not a branded type** — the repo forbids unsafe casts
   (root `AGENTS.md`, "No escape hatches"), and a brand needs one. `{ kind: 'privy' }` not from `privy()`
   is warned and skipped.
4. **Seam names are Privy-specific** (`privySource.ts`, `PrivyHost`) — the user found `SourceHost` opaque.
5. **Commit order:** the Privy devDependency + lockfile must ride with the sub-path commit — alone, knip
   flags it unused. Order: (1) seam, no Privy; (2) workspace excludes + deps + lockfile + `src/privy/` +
   packaging + tests; (3) demo; (4) docs; (5) skills; (6) CI line (or fold into 3).
6. **knip entry not needed** — knip reads `exports`; adding `src/privy/index.ts` to `knip.json` only
   produced a "redundant entry" hint. `optionalPeerDependencies` rule not needed either.
7. **`peerDependenciesMeta.optional` is not observable inside the workspace**: removing it and
   reinstalling did not install Privy into any app (the peer is satisfied by the package's own
   devDependency). The flag still matters for **external** consumers (npm 7+ and pnpm
   `auto-install-peers` install non-optional peers). Rev 3's "every workspace consumer silently installs
   Privy" was wrong; verify externally with `pnpm pack:local` in PR QA.
8. **Workspace hazard found (demo only):** three `@privy-io/react-auth@3.40.0` instances exist (peer
   variants). The one under `packages/wallet-sdk-react` resolved Privy's optional peer `@solana/kit` to
   **2.3.0** (Privy wants `>=3.0.3`) → Vite/Rollup failed with a missing export
   (`sequentialInstructionPlan`) — Rollup resolves dynamic imports even in dead branches. Worse, the SDK's
   `dist/privy` and the app would bundle **two** Privy copies, so `usePrivy()` in the app would read a
   different context from the SDK-mounted provider. `resolve.dedupe: ['@privy-io/react-auth']` fixes both;
   the guide tells monorepo partners to dedupe. Real partners have one `node_modules`, so not a general
   partner bug — but the Solana-peer/Vite interaction for **npm partners without Privy's Solana peers** is
   untested and is a spike item.
9. **Pass-through `personal_sign` etc. are untimed** (unit-tested with a 30 s fake-timer signature).

## Open, needs the user

- A dev Privy **app id** for spike items 2 and 4, the demo run, and QA rows.
- Merging publishes the README Privy bullet to docs.sodax.com (it is mirrored) — tie merge to open question 5.
- Commit/push only when asked; branch is `feat/456-privy-wallet-source` in the linked worktree (hook fix
  present, so a normal `git commit` is safe there).
