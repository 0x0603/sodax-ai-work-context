---
type: process
repo: sodax-frontend
github: 1069
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Checked the ticket's execution instructions and the current state of the
  repos. No code written.

## Findings

### "Branch out of `sdk-v2-main`" is no longer valid guidance

The branch still exists on origin (`90a87ff9`) but it is **dead**: last commit 2026-05-08,
and **65 commits ahead / 460 behind** `main`. It still carries the `packages/` tree that `main`
deleted in `168bb93e` (#1308). Branching there would target a layout that no longer exists.

Any real work starts in **`sodax-sdks`**, where `wallet-sdk-core` and `wallet-sdk-react` now live.

### Nothing has been started

`git grep -niE 'web3auth|privy|turnkey|magic-sdk'` across `origin/main` — including
`pnpm-lock.yaml` — returns **zero hits**. Same for `sodax-sdks` via code search. No branch, no
PR, no issue in either repo mentions these providers other than #1069 itself. 169 remote heads
in `sodax-frontend`; none matches 1069, email, social or web3auth.

### The existing `better-auth` in the repo is unrelated

`apps/web` has `better-auth` + `mongodb`, but `apps/web/lib/auth.ts:6` scopes it to internal
CMS staff (`ALLOWED_EMAIL_DOMAIN = "@sodax.com"`, Google OAuth). That is the CMS login, not
wallet connectivity — it is not a foundation this can build on.

### The connector abstraction is the plug-in point

In `sodax-sdks/packages/wallet-sdk-react`:

- `IXConnector` (`src/types/interfaces.ts`) — `xChainType`, `name`, `_id`, `_icon`,
  `isInstalled`, `installUrl`, `connect()`, `disconnect()`.
- `abstract class XConnector implements IXConnector` (`src/core/XConnector.ts:16`) with
  `abstract connect()` (:39) and `abstract disconnect()` (:44); `isInstalled` defaults to true
  for provider-managed chains and is overridden by extension-injected ones.
- Concrete connectors under `src/xchains/{bitcoin,evm,icon,injective,near,solana,stacks,stellar,sui}/`
  — e.g. `OKXXConnector`, `UnisatXConnector`, `XverseXConnector`, `IconHanaXConnector`,
  `StellarWalletsKitXConnector`.
- Discovery/registration: `chainRegistry.ts`, `useXConnectors.ts`, `useXConnect.ts`,
  `useConnectionFlow.ts`, `useWalletModal.ts`.

So the integration shape is well-defined whenever a direction is picked: one more `XConnector`
subclass plus registry wiring.

### The cross-repo link nobody has drawn

Backend **#1024** is researching Bound Auth, which is an **encrypted-keystore** model, not MPC.
That distinction is exactly what this ticket ran aground on: MPC scopes keys to a `clientId`
(hence "different provider → different address"), while an encrypted-keystore model derives the
address from a user-held mnemonic and has no such scoping.

Written up once, for both issues, in `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md`.

## Changes During Work

None.
