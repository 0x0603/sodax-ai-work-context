---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-30
updated: 2026-09-30
---

# Session 08 — R0bi7's three findings on PR #486: verified, fixed, pushed

## State found

- Branch head `9e52f858` (31 commits). The commits after `4e334fbc` (2026-09-24/25: demo 6 GB heap
  `8bc1930e`, open-login-through-reconnect `b94687e8`, bounded wagmi disconnect `6db1ef90`, demo wallet
  sheet `4c2a61dc`, CSP docs `a73ad65d`, connector state trim `6c098351`, …) were never logged here.
- CI green on `9e52f858`; merges cleanly into `main` (9 commits behind, mostly docs).
- Reviews: Claude bot (2026-09-24) approve, no findings. **R0bi7 dual-agent (2026-09-25, on
  `9e52f858`): three low findings**, disposition `follow_up`.

## The three findings, checked against the code

1. **Logout mid-connect leaves wagmi connected** (`privyConnector.ts`). Real — reproduced: a
   `loggedOut` publish while `getEthereumProvider` or the requested switch is pending → `connect`
   resolves, `status=connected`, flag `1`, old address. The last `waitFor` has dropped its listener,
   `watch()` subscribes only at the end and does not replay, and `switchChain`'s `finally` skips the
   recheck because `unwatch` is still unset. Heals on the next bridge publish (any Privy state change)
   or a reload. Not established: what Privy's provider does with a signing request after logout.
2. **Startup guard can take an app error for a Privy start-up failure** (`PrivyStartupGuard.tsx`). Real,
   but **narrower than first claimed** — a probe on the unchanged guard showed:
   - error that recurs on every render → the fallback render throws again, React escalates to the
     app's boundary; `fail()` is **not** called, nothing logged (the guard's update never commits);
   - error that only happens once → absorbed by React's own retry; the guard never fell back;
   - error that only happens **inside `PrivyProvider`** (e.g. depends on Privy context) → the fallback
     renders fine: Privy disabled for the mount, "Privy could not start" logged with the app's error.
   The package `AGENTS.md` claims the guard "catches only start-up throws from `PrivyProvider`" — the
   code did not match that.
3. **`apps/demo` build uses POSIX `VAR=value`** — real, Windows-only; the same `package.json` already
   has `test: "true"` and `clean: "rm -rf …"`, so the demo is not Windows-ready either way. Cheap and
   matches `wallet-sdk-react`'s own `cross-env` use.

## Fixes — pushed 2026-09-30 (`9e52f858..59be6f2e`), all three commits Verified on GitHub

- `c5c6f5c7` connector: the watcher's rule is now one pure function `sessionWallet(snapshot, address)` →
  wallet | `'ended'` | `'pending'`, used by `onRuntimeChange` (behaviour unchanged) and once more in
  `connect` right before `flag.write()` — no await between that check and `watch()`. `'ended'` clears
  the flag and throws `The Privy session has ended.` (same message as the restore path). Two tests.
- `891d2706` guard: `AppErrorPassThrough` wraps the app tree in **both** slots (`setup.tsx`), marks
  `Error`s it catches (a `WeakSet`) and rethrows them; the guard passes marked errors through. Non-`Error`
  throwables cannot be marked and keep the old behaviour. One test (error only inside a stand-in
  provider). `WALLET_PRIVY.md` § "When Privy cannot start": one sentence updated.
- `59be6f2e` demo: `cross-env NODE_OPTIONS=… vite build` + `cross-env: catalog:` devDependency;
  lockfile +3 lines (importer entry only); `apps/demo/AGENTS.md` command comment.
- Red/green: each new test fails with its fix removed.
- Gates: `checkTs`, biome, **289/289** tests, `pnpm build` (+ `verify-dist-exports`,
  `check-privy-isolation` OK), demo `pnpm build` via cross-env (exit 0), `check:ai-dev-files`.
- Tests on Node 26 without a Node 24: `NODE_OPTIONS=--no-experimental-webstorage npx vitest run`.
- Commits: pre-commit hook (root `checkTs`, `build`, `test`) green on a checksum-verified Node 24.21.0
  tarball + `pnpm` wrapper; shared `.git/config` diffed before/after, unchanged. Identity passed with
  `-c user.name=0x0603 -c user.email=193848687+0x0603@users.noreply.github.com` to match the branch
  (this machine's global identity is different).

- CI on `59be6f2e`: every check green (Build and Test 24.x, E2E advisory, Vercel previews incl. the
  demo, CodeQL, Semgrep, OSV, gitleaks). The AI drift job reports success but its comment says the
  audit did not complete, as on 2026-09-24 — nothing was audited.

## Demo QA note (asked this session)

`apps/demo` sets `disconnectBehavior: 'detach'` (`50a3f899`). Its wallet row hides other wallets while
EVM is connected, so switching = X then pick. X really disconnects (store cleared, every wagmi EVM
connection ended, provider detached → requests fail 4900, flag cleared → no restore on reload) but
does **not** sign out of Privy: "Email (Privy)" reconnects with no code. The demo has no Privy
sign-out, so a second email cannot be tested from its UI until the session expires (or drop `'detach'`).

## Still open

No reply posted on R0bi7's review. Everything from session 07 is unchanged: live QA needs a dev
Privy app id, the npm + Vite install shape is unbuilt, open question 5 gates the merge, the AC2
comment is not posted.
