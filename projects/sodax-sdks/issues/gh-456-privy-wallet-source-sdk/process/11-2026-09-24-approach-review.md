---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-24
updated: 2026-10-05
---

# Session 11 — approach review of the pushed branch

> Renumbered 08 → 11 on 2026-10-05: written 2026-09-24 on a second machine and not pushed until then; the other
> machine had taken 07–09 in the meantime. In time order it sits between sessions 06 and 07.

The user asked for a review of the approach (not a bug hunt) of `feat/456-privy-wallet-source` at `a2d6efb9`.
No code changed. Proposals below are **not yet accepted by the user**.

## Verdict

Keep the approach. A plain wagmi connector plus an SDK-mounted `PrivyProvider`, behind `./privy`, is the
only shape reviewed so far that meets AC5 (coexistence) and keeps AC4 structural (signing through the normal
wagmi wallet client → `EvmWalletProvider`). The public surface is small (`privy()`, `PrivyOptions`,
`PRIVY_CONNECTOR_ID`, the opaque `PrivySource`), and the `setup(ctx)` contract stays internal.

## Checked first-hand this session

- **The opaque value works across entries in `dist`**: `dist/index.mjs` and `dist/privy/index.mjs` both import
  `chunk-XEO2TCM3.mjs`, the only chunk holding the `WeakMap` registry. It depends on tsup `splitting` (already
  required for class identity); no gate checks it.
- **The start-up guard does not blame Privy for a partner's first-render error.** Temporary probe test (deleted):
  the partner's own boundary catches it and `runtime.fail` is **not** called — React skips `componentDidCatch`
  on a boundary whose fallback throws again. My hypothesis was wrong.
- **Main drift:** 2 commits behind `origin/main` (#480, #482); `git merge-tree` reports a clean merge. Both
  touch `packages/wallet-sdk-react/README.md` and the mirrored `wallet-sdk-react.md`.
- `PrivyProvider` initialises for every visitor once `EVM.privy` is set (Privy 3.40 builds a hidden iframe to
  `/apps/<appId>/embedded-wallets?caid=…` in `context-MM1cZbHj.mjs`), whether or not they pick Email.
- `Multiple PrivyProvider instances` is a real Privy 3.40 error string, so a partner who already mounts
  Privy gets "Email (Privy)" disabled by the guard.

## Weak points, ranked (proposals)

1. **Nothing has run against real Privy.** AC2/AC3/AC4 rest on reading Privy's dist plus mocks. Sonic (146),
   the hub chain, is outside Privy's chain registry, so signing there rests on `supportedChains` +
   `privyWalletOverride` (spike 2, not run). Do the dev-app QA before asking anyone to review.
2. **Restore UX is unmeasured.** Session 06 cut the restore to a 3 s budget, while rev 3 had already removed the
   late-readiness `reconnect()` — so the 3 s number now decides how often AC3 needs a click. The budget only
   matters when Privy is the recent connector, i.e. when the user wants Privy back. The budget test runs at the
   `@wagmi/core` level only; `EvmHydrator`'s retry `reconnect()` on `disconnected` (`EvmHydrator.tsx:40-48`)
   may give Privy a second attempt, untested. Set the number from spike 4(d) measurements.
3. **The SDK owns `PrivyProvider`.** V1 limits to state in the PR: partners already on Privy cannot use it;
   the SDK's fixed config (email only, external wallets off) becomes the app's Privy config; eager init for all
   visitors. The runtime/bridge split keeps the *mount* of a "bring your own `PrivyProvider`" mode small, but
   the mode as a whole is not — see § Partners already on Privy (corrects what I first told the user).
4. **Complexity is earned but concentrated.** `privyConnector.ts` + `runtime.ts` (~490 lines) combine an abort
   controller per attempt, a `generation` counter, the supersession rule, `switching` + re-evaluation, the
   StrictMode microtask unmount and the restore budget. Each has a mutation-checked test; a reviewer still
   cannot check it from the diff. PR body: one table, mechanism → bug it prevents → test name.
5. **Two non-Privy changes ride along**: disconnect-all for every EVM wallet (`12a3d0c3`, a behaviour change for
   all partners) and the RPC-map refactor (`b3c54dc3`). Justified; call them out in the PR body.
6. **Deviations from the issue lead the PR body**: not `@privy-io/wagmi` (breaks AC5), AC2 password/recovery
   impossible on TEE, no changeset (#407).

## Suggested order

1. Dev Privy app id → demo QA: AC2, AC3 (reload and browser restart, throttled network, time it), AC4 on
   Sonic, AC5.
2. Set `RECONNECT_BUDGET_MS` from those numbers.
3. `pnpm pack:local` into an npm + Vite app without Privy's Solana peers.
4. Merge `main`, open the PR as a draft with the body above; merge gated on open questions 5 and 7.

## Partners already on Privy (follow-up question, same session)

Privy 3.40 facts, read in `dist/esm`:

- **Nesting is detected through an internal context**: `createContext(false)` + a render-time check that throws
  `Multiple PrivyProvider instances found` (`get-entropy-details-for-user-Bq7nAeEf.mjs`). Not exported:
  `@privy-io/react-auth/internal` exports only `useDepositAddress`, `useLoginWithSsoToken`. Auto-detecting a
  partner's provider would be a heuristic.
- **Login callbacks are multi-subscriber**: `useLogin(cb)` pushes each callback onto a per-event list and removes
  it on cleanup (`events-context-BJ75xIIf.mjs`), so `PrivyBridge` can coexist with the partner's own `useLogin`.
- **A chain missing from `supportedChains` fails at use**: `getPublicClient` throws `Unsupported chainId <id>`
  (4901) (`getPublicClient-Z_u6EviM.mjs`). Sonic (146) is not in Privy's defaults.

Behaviour today: partner provider **above** `SodaxWalletProvider` → the SDK's provider throws, the guard keeps
the app on the partner's Privy; "Email (Privy)" stays listed and fails with the cause when picked (the
connector is registered with wagmi before render). Partner provider **below** → the partner's one
throws; the SDK guard recovers only if no partner error boundary sits in between (otherwise their boundary
shows an error). Fail-closed apart from that last case.

Two partner kinds:

1. **Privy used only as an email wallet** — works today with no code: drop their `PrivyProvider`, pass their
   `appId`/`clientId` to `privy()`. Same app id → same users and addresses. Costs: the SDK's fixed config
   (email only, external wallets off, SODAX chains only), Privy hooks only below `SodaxWalletProvider`,
   disconnect = Privy logout. Users who signed up with a non-email method cannot log in anymore.
2. **Privy as app login** — needs an explicit app-owned-provider mode, e.g. `privy({ provider: 'app' })`,
   partner provider above `SodaxWalletProvider`. Differs in four places: (a) mount only `PrivyBridge` under
   its own guard with `fallback={null}`; (b) export `sodaxPrivyChains()` (the chains + `privyWalletOverride`
   list `buildPrivyConfig` already builds) for the partner's `supportedChains` — new public API; (c) SDK
   disconnect must not call Privy `logout()` (open question 3); (d) a partner-driven login needs no new API —
   the connector skips the modal when `authenticated`, so the partner calls the SDK connect for `privy` in
   their `onComplete`. Estimated a few hundred lines with tests; runtime/connector core unchanged.

Decided with the user: mode 2 is not built in #456 — no partner has asked, and today's behaviour is
fail-closed. Build it when a real partner needs it.

**Done (uncommitted in `../sodax-sdks-456`):** `WALLET_PRIVY.md` gained § "Apps that already use Privy"
(both kinds, TOC renumbered, links from "Using the Privy user" and "When Privy cannot start"); the
partner-agent recipe `recipes/privy-email-login.md` gained an "App already on Privy?" note before step 1
(an agent following the old anti-pattern "use the one the SDK mounts" would strip an app's own sign-in
provider) and a shorter anti-pattern. Gates green: `check:doc-links`, `check:docs-nav`, `check:docs-pages`,
`check:ai-dev-files`, `pnpm --filter @sodax/skills check:ai`. Still to do when the PR opens: name the
limitation in the PR body.

## PR opened (same session, on the user's request)

- Two signed commits on `feat/456-privy-wallet-source`: `1be8035b` docs(wallet-sdk-react) — the guide section;
  `9a4bceb4` docs(skills) — the recipe note. The pre-commit hook ran from the linked worktree safely (the
  `unset GIT_DIR …` fix is in this base): workspace `checkTs` 15/15, full `build`, `test` 21/21 tasks (sdk 2903,
  dapp-kit 814, wallet-sdk-react 276); the second commit was fully cached. `core.bare` stayed `false`, no local
  `commit.gpgsign`, both commits `G`.
- Before writing the PR body, two claims were re-checked in Privy 3.40 source: `setWalletRecovery` throws
  `UNSUPPORTED_WALLET_TYPE` ("User owned wallet recovery is only supported for on-device execution…") for a TEE
  wallet (`index-rkoxGjIC.mjs`); and `@privy-io/chains@0.5.2` **defines** `sonic` and `kaia` but its
  `DEFAULT_SUPPORTED_CHAINS` (32 chains) omits both, while id 999 there is Zora Goerli Testnet — so the guide's
  "outside Privy's built-in chain list" holds.
- **PR #486** (draft) — https://github.com/icon-project/sodax-sdks/pull/486, title
  `feat(wallet-sdk-react): add opt-in Privy email login`, `Closes #456`. Body follows the repo template the way
  #478 does (plain paragraphs, honest checklist notes); no mechanism table. Draft because nothing has run
  against a real Privy app and merging publishes the README Privy bullet. First CI results: Dependency Review,
  Docs ship with code, PR title, gitleaks, No private hosts all pass; OSV (new in PR) and Build and Test were
  still running when this was written.
