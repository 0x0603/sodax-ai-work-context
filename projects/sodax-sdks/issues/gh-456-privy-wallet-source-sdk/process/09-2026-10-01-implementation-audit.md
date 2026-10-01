---
type: process
repo: sodax-sdks
github: 456
session: 2026-10-01
updated: 2026-10-01
---

# 09 — Implementation audit of PR #486 (head f48a836a)

User asked: "audit lại cách implement xem có đúng và là best practice chưa?" Three read-only agents
(wagmi lifecycle, Privy SDK usage, packaging/design/tests) plus my own read of `src/privy/*`,
`EvmActions`, `EvmProvider`, `EvmXService`. Every finding below was re-checked against the source
named; nothing was changed in the worktree. Repros live in the session scratchpad
(`audit/lifecycle/race.test.tsx`, real wagmi 2.16.9 / @wagmi/core 2.20.3; re-run: 4/4 pass).

## Verdict

Approach holds: plain wagmi connector + `PrivyProvider` inside wagmi, deferred provider, connector-side
chain switch, sub-path + optional peer. Not overkill (each helper guards a real failure; only the
runtime `waiters` set is redundant). Two real bugs around first login and disconnect.

## Findings (verified)

1. **High (client race verified; server outcome unverified) — new user's first login.** `runtime.login()`
   settles as soon as `authenticated` flips (`runtime.ts:133`); the connector then calls `createWallet()`
   for a user without `hasEmbeddedAccount` (`privyConnector.ts:198-206`). Privy 3.40's own flow, still in
   the modal: `AwaitingPasswordlessCodeScreen` → after a delay navigates to
   `EmbeddedWalletOnAccountCreateScreen`, which re-checks the user **at mount** and, if the SDK's create has
   not landed, creates wallet 0 itself (`idempotencyKey = generateWalletIdempotencyKey(userId,'ethereum')`).
   SDK path `useCreateWallet().createWallet()` refreshes the user, then creates **without** a key. Outcome
   is server-side: a second wallet, or Privy's create fails → its `onFailure` (passed by the code screen)
   calls `logout()` after "Something went wrong". Same root: with `requireUsersAcceptTerms`, the SDK
   connects while the consent screen is up. **Fix direction:** decide on `createWallet()` only once
   `hasEmbeddedAccount || !modalOpen`; "modal closed + not authenticated" = rejection. **Confirm live with a
   brand-new email.**
2. **Medium — Disconnect during the reload restore skips Privy.** zustand persists `xConnections`, so the
   address + Disconnect show at once; wagmi is `connecting` with 0 connections for up to 3 s.
   `EvmActions.disconnect` walks `config.state.connections` → nothing. Restore then succeeds (Privy
   connected, hidden by `userDisconnected`) or times out; either way no `logout()`, flag stays `'1'`, next
   "Email (Privy)" connects the previous user with no code. Stock-UI reachable (unlike known item (a)).
   Fix: always run the Privy connector's disconnect (abort + clear flag + logout) when EVM disconnects, or
   wait bounded for wagmi to leave connecting.
3. **Low — logout awaited inside wagmi's disconnect.** wagmi `disconnect` captures `connections` before
   `await connector.disconnect()`; a wallet connected during Privy's logout POST is wiped when it settles
   (reproduced). Privy `_destroy()` awaits the POST, then `destroyLocalState()`; past our 10 s bound the
   session survives → next connect skips the code. Fix: return after `resetSession()`, keep the bounded
   logout as a pending promise the next `connect()` awaits (retry / force login if it failed).
4. **Low — SSR.** `PrivyProvider` (`Rr` in `index-rkoxGjIC.mjs`) runs `Rt()` and the 25-char app-id check
   with no `window` guard (only the https check has one). Error boundaries do not run on the server → a
   bad app id 500s a Next SSR app; guide/guard comment promise "keeps rendering". Fix: qualify docs;
   optionally reject non-25-char ids in `privy()`.
5. **Low — isolation gate gap.** `check-privy-isolation.mjs` greps only `@privy-io/` specifiers outside
   `dist/privy/`; a future main-entry `import('./privy/index.mjs')` passes (agent reproduced with tsup's
   esbuild). Current dist is clean. Fix: also fail on `privy/index.mjs` references outside `dist/privy/`.
6. **Test gap.** No success-path test across Host → PrivyBridge → runtime → connector (removing the
   `useMemo` at `PrivyBridge.tsx:44` stays green). No test for an interactive connect when Privy never
   becomes ready.
7. **Nits.** CSP docs lack captcha origins when bot protection is on; literal `'exited_auth_flow'` vs
   Privy's exported error enum; `createWallet()` errors swallowed (30 s timeout instead of the cause);
   runtime `waiters` redundant with `fail()`; `privy()` warns per call; `withDeadline` duplicates
   `withTimeout`; 3-line comment in `tsup.config.ts`; `SUB_PATH_EXPORTS.md` "import type anywhere".

## Solid (verified)

Deferred provider fits Privy's single shared proxy provider (no stale events, 4900 when detached);
connector-side `wallet_switchEthereumChain` is needed (Privy sets `chainId` before validating);
`privyWalletOverride` is Privy's top-priority RPC; restore cannot wedge wagmi; supersession matches
wagmi's `connecting` state; StrictMode handled; shipped `dist` isolated, attw green; demo visitors
without an app id load nothing (lazy chunk); 95 tests in `src/privy` + `providers/evm` pass.

## Fixes for 1–3 — `9ad69c30` (local, not pushed)

User: "fix dễ không 1 2?" → "ok làm đi" (1, 2 and 3).

- **1.** `runtime.login()` settles on `authenticated && !modalOpen` (or `onComplete`); a modal that was
  shown and closes without a sign-in rejects (`userRejected`). The embedded-wallet wait also ends when
  the session ends (`ready && !authenticated` → "The Privy session has ended."), so a failed Privy
  create-on-login no longer hangs 30 s.
- **2.** `privyConnector()` now returns `{ connector, disconnect }`; `PrivySourceSetup.disconnect` →
  `EvmProvider` → `EvmActions` prop `onDisconnect`, run beside the wagmi disconnects. No-op unless an
  attempt, a session or the connected flag exists (so a MetaMask-only disconnect never touches Privy).
- **3.** Connector `disconnect()` returns after `resetSession()`; `signOut()` (deduped) waits for Privy
  `ready` (15 s), `logout()` (10 s), then `!authenticated` (10 s), and only then clears the localStorage
  marker `<persistKey>.privy.signout`. `connect()` checks the marker after `ready` (so init errors keep
  their cause): signs out first, fails with "Could not sign out of the previous Privy session." if it can't.
- `connectedFlag.ts` → `storedFlag.ts` (`createStoredFlag`), reused for the marker.
- Tests: 11 new (runtime 2, connector 8, EvmActions 1, EvmProvider wiring assert); 9 mutations, each
  caught. Package: checkTs, lint, 307 tests, build + isolation green; docs gates green. Docs:
  `WALLET_PRIVY.md` (Sessions + custom modal), `CONNECT_FLOW.md`, package `AGENTS.md`.
- Side effect: an SDK disconnect during an *interactive* Privy login now aborts it and signs out (known
  item (a), R0bi7's Low finding) — the same hook covers it.
- **Still to do:** push on the user's go; one live login with a brand-new email (confirms the modal stays
  open through Privy's wallet creation); add the fixes to the PR body.
