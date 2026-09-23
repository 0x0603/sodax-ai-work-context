---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-23
updated: 2026-09-23
---

# Session 04 — plan rev 3: smaller public API, less machinery, three errors fixed

Re-read `plan.md` rev 2 and the `process/03` audit against the code at `origin/main 1549d309`, with
one question: is the solution clean, maintainable, and easy for a partner to use. No code written.
Output: `plan.md` rev 3 (self-contained; its § "Removed in rev 3" is the cut list), the two
superseded plan files moved to `archive/`.

## Repo state this session

- Worktree `../sodax-sdks-456` (`feat/456-privy-wallet-source`) is at `1549d309` = `origin/main` —
  the brief's "merge main first" step is done. Re-install not verified.
- PR #163: still OPEN, now `MERGEABLE` (merged main 2026-09-21). Adds
  `EVM.wagmiConnectors?: CreateConnectorFn[]` to `EvmAdapterFields` and spreads it in the
  `EvmProvider` `useMemo`; tests in the existing `EvmProvider.test.tsx`.
- #456: OPEN, 0 comments.

## Three errors rev 2 carried (not caught by the audit)

1. **The 10 s per-request timeout would reject interactive signing.** Rev 2 defined
   `providerTimeoutMs` as "any single provider/runtime request" and Risk 9 said every connector call
   must be self-timed. A request passed through the deferred shell (`eth_signTypedData_v4`,
   `eth_sendTransaction`) can open Privy's MFA prompt (settled choice 9) or its confirmation modal
   (`showWalletUIs`), so a TOTP typed in 11 s would fail. Fix: time only connector-internal calls; the
   dead-channel case is caught at `connect()` by the timed `getEthereumProvider()`. New unit case 11,
   spike 4(b) and QA 19 exercise > 10 s.
2. **The import-time `tempoModerato` guard cannot exist.** The failure (`research.md:185`) is an ESM
   link-time `SyntaxError` — it fires before any module body in the graph runs, including
   `src/privy/index.ts`. Under a bundler it is a build-time missing-export diagnostic instead. Replaced
   by a documented viem ≥ 2.44 floor; spike item 1 reproduces it once for the wording.
3. **`scripts/restore-use-client.mjs` bought nothing.** `privy()` returns functions and a component,
   which cannot cross the RSC boundary, so it can only be called from a client module; the main entry
   already ships without a directive and partners wrap it in their own `'use client'` file
   (`apps/example-next-js-16/app/providers.tsx:1`).

Also fixed in `plan.md`: the `build:packages runs zero tasks` claim (the brief was corrected in
session 03, the plan was not) and the baseline commit.

## Decisions made (were open)

- **`EVM.privy` stays** (closes the audit's re-open). The value is opaque; the `setup(ctx)` contract is
  internal and ships in the same package version as its only producer, so it is not a second extension
  point. `wagmiConnectors` + a generic host slot would publish that contract, need two fields wired
  correctly, and wait on #163.
- **Shape is `privy: privy({ appId })`, not `privy: { appId }`.** The user asked twice why the import is
  needed. Answer recorded in `plan.md` § Approach and to be a FAQ in `WALLET_PRIVY.md`: bundlers only
  follow imports; a Privy specifier in the main entry breaks non-Privy partners (optional peer) or, as a
  hard dependency, costs every partner ~53 packages, inherited advisories, and the npm/yarn viem crash;
  a side-effect registration import is dropped under `"sideEffects": false` and fails at runtime.
  `walletConnect: { projectId }` is plain only because its SDK is a hard dependency of `wagmi/connectors`.
- **No error boundary.** No other SDK provider has one (`SuiProvider` throws by design); the two known
  `PrivyProvider` mount throws become unreachable via `privy()` validation + `defaultChain: EvmChainKey`;
  a boundary around the partner subtree remounts it, catches the partner's own errors, and renders
  children outside the provider — where Privy's callback hooks throw. Dropping it also deletes rev 2's
  "do not call `useLogin({…})` in children" caveat.

## Simplifications (verified against code)

- **Runtime per mount**: internal `setup(ctx) → { connector, Host }` called in the same `useMemo` that
  builds the wagmi config. `privy()` becomes pure, which removes the "call once" rule, the per-`appId`
  instance warning and the `Map<appId, owner>` mount guard. Safe to call inline because
  `SodaxWalletProvider` freezes its config with `useRef` on first render.
- **`PrivyHostNotMountedError` removed**: with one slot the host is always rendered by `EvmProvider`
  next to its connector.
- **`defaultChain: EvmChainKey`** replaces `defaultChainId: number`. `EvmChainKey` is exactly the 14 keys
  of the wagmi tuple (`packages/types/src/chains/chains.ts`, checked key by key); a test keeps them in
  sync.
- **`ctx.rpcUrls`** built by the same helper as `createWagmiConfig`'s `transports`
  (`EvmXService.ts:94-144`, `getRpcUrl` at `utils/walletRpcConfig.ts:24`) — one RPC source by
  construction.
- **Supersession guard reads `config.state.current`**, which is public wagmi API
  (`@wagmi/core dist/types/createConfig.d.ts:31`, `readonly state: State`) — the audit's risk #4
  ("wagmi internals") was overstated.
- **Isolation gate** reduced to a conservative scan (no `@privy-io/` in `dist/` outside `dist/privy/`):
  esbuild emits chunks only for code shared by ≥ 2 entries, so it cannot miss a leak.
- **Docs mirror settled**: only the package `README.md` is mirrored (`scripts/docs-pages-map.json:170`);
  `WALLETCONNECT.md` is not either — lift the four must-not-miss sentences into the README.
- Cut as redundant: public `SODAX_EVM_CHAINS` export, demo fake runtime, `dist/assets` isolation script,
  canary workflow, copied pricing tiers. The audit's cuts 2–5 applied as recommended.

## Partner-facing Privy user access (asked this session)

The SDK exposes only generic wallet state (`useXAccount`, `useWalletProvider`, `xConnectorId`). Email,
user id and key export come from `usePrivy` / `useExportWallet` imported from `@privy-io/react-auth`
in children, which sit inside the SDK-mounted `PrivyProvider`. No SDK `usePrivyUser()`.

## Not done

- `plan.md` rev 3 is 59 KB, not the ≲ 35 KB aimed for: it absorbed the QA matrix and the rationale that
  used to live in the two archived files. The reading set for a cold resume dropped from three plan
  files (~206 KB) to one.
- No `@privy-io/*` claim was re-checked — still not installed anywhere. Spike item 1 does it.
