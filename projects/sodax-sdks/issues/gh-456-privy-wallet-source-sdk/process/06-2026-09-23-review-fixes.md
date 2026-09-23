---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-23
updated: 2026-09-23
---

# Session 06 — max-effort review of the implementation, and the fixes

`/code-review max` over the uncommitted tree (untracked files included) returned 15 findings. Every one
was re-verified against Privy 3.40.0 / wagmi 2.16.9 / `@wagmi/core` 2.20.3 source before fixing; all 15
held. Still **uncommitted**. Gates after the fixes: 276 tests, `checkTs` (package + 14 dependents),
build + `check-privy-isolation`, attw, knip, madge, `check:ai`, doc gates, CI *Build Apps* 11/11,
Next 16 `verify` 5/5, demo build with and without Privy (0 / exactly 1 Privy copy), `--frozen-lockfile`.

## Three decisions reversed (with the evidence)

1. **A start-up guard around `PrivyProvider` after all** (rev 3 settled 11 said "no boundary"). Privy
   3.40 throws *during render* in cases `privy()` cannot pre-check (`dist/esm/index-rkoxGjIC.mjs`, `Rr`):
   plain http on any host but `localhost`/`127.0.0.1` ("Embedded wallet is only available over HTTPS" —
   a LAN IP from `vite --host` trips it), an app id that is not a 25-char string, and a nested
   `PrivyProvider` ("Multiple PrivyProvider instances found"). Without a guard that white-screens the
   partner's whole app. `PrivyStartupGuard` catches **only before a successful start**: it renders the
   children without Privy and calls `runtime.fail(cause)`, so "Email (Privy)" rejects with the real
   message at once. After a start, errors are rethrown to the app's own boundaries (tested).
2. **`privy()` never throws** (rev 3: fail fast). Empty/whitespace `appId` (an unset env var in a preview
   deploy), unknown `defaultChain`, or Privy `VERSION` < 3.40.0 → `console.warn` + a disabled source, like
   a missing WalletConnect `projectId`. `appId` is trimmed (Privy's check is exact length 25).
3. **Optional peer range `*`, floor enforced at runtime** (was `^3.40.0`). Reproduced with npm 11.6.0 and
   real tarballs: an installed-but-older optional peer is an **ERESOLVE install failure**
   (`peerOptional left-pad@"^1.3.0"` vs root `left-pad@1.2.0`), so a partner who uses Privy < 3.40 for
   their own auth could not upgrade the SDK even without `EVM.privy`. With `*` the same install passes.
   `privy()` checks Privy's exported `VERSION` ("3.40.0" at runtime, `context-*.mjs`).

## Bugs fixed (all with tests that fail on the old code — mutation-checked)

| # | Bug | Fix |
| - | --- | --- |
| 2 | SDK disconnect ended only wagmi's *current* connection. Privy-then-MetaMask → disconnect → Privy stayed connected, flag `1`, no logout; the next click hit `ConnectorAlreadyConnectedError`, which `EvmActions` treats as success → next person gets the previous user's wallet with no code | `EvmActions.disconnect` ends **every** wagmi connection (`disconnect(config, { connector })` per connection, `allSettled`). Race-free: all calls share wagmi's original `connections` Map (`disconnect.js:11,17`). Behavioural change for every EVM wallet — the SDK already models EVM as one connection; noted in `CONNECT_FLOW.md` and package `AGENTS.md` |
| 3 | Only the `ready` wait was bounded on reconnect; then 30 s + 30 s + 10 s + an untimed `createWallet()` inside wagmi's sequential loop (other wallets held ~34 s) | One `RECONNECT_BUDGET_MS` (3 s) aborts the whole restore; reconnect never creates a wallet (clears a flag whose user has none) |
| 5 | Aborted/superseded attempts still committed (flag, `watch()`, accounts); `watch()` leaked subscriptions; the fire-and-forget re-attach was never cancelled | `withTimeout(…, signal)` on every internal call, `throwIfAborted` before commit, `watch()` unsubscribes first, a `generation` counter drops late re-attaches |
| 6 | StrictMode's simulated unmount rejected in-flight waits (page-load restore died in dev with `ssr:false`) | `runtime.unmount()` rejects only if no bridge re-attached by the next microtask |
| 7 | Untimed `logout()` kept wagmi `connected` with a detached provider | Logout bounded by `INTERNAL_CALL_MS`, local disconnect always completes |
| — | wagmi re-running reconnect (every Hydrate render with `ssr:false`) tore the live session down and rebuilt it | `connect()` is idempotent while attached |
| — | A logout arriving mid-switch was ignored until the next publish | `switchChain` re-evaluates the snapshot in `finally` |
| 10 | The opaque value was a plain object: built in a Server Component it serialized fine and was silently dropped on the client | The value is a frozen class instance → React refuses it across RSC (loud) |

Docs/skills: guide gained "When Privy cannot start", corrected the RSC reason, the 3-second claim (now
true), the disconnect semantics, and gates Privy hooks at the parent component (the demo panel had the same
bug). `api-surface.md` (the skills' declared single source of truth) and `chain-support.md` now list
`PrivySource`, `EVM.privy` and the `/privy` exports. Recipe no longer shows a throwing env pattern. Minor:
isolation-script comment cut to two lines, `.env.example` → `example.env`, demo renders even if Privy fails
to load, deferred-provider comment corrected (Privy's provider does emit `chainChanged`).

## Still open

- Returning-user restore now always fits 3 s — on a slow network the user sees "disconnected" and clicks
  once (no OTP). Spike 4(d) should measure real latency before the PR.
- npm + Vite partner **without** Privy's optional Solana peers is still unbuilt (`process/05` § 8).
- Live QA needs a dev Privy app id.

## Committed, not pushed

Split into 8 signed commits `b3c54dc3..af132fab` on `feat/456-privy-wallet-source` (intermediate
`AGENTS.md` and lockfile staged via `git hash-object` so commits 2 and 4 carry only their own lines). The
pre-commit hook (checkTs + build + test over the whole workspace) passed on every commit. `git push`
failed with 403: `0x0603` now has `pull` only on `icon-project/sodax-sdks` (member of the org, no fork).
The user also asked for a cleaner alternative mid-way; the EIP-6963 + add-on-package option is written
up in the chat and not started.
