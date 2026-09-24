---
type: process
repo: sodax-sdks
github: 456
session: 2026-09-24
updated: 2026-09-24
---

# Session 07 — PR #486 is up; the demo takes the Privy app id from its Settings modal

## What happened between session 06 and this one (not logged at the time)

Write access came back (`permissions.push: true` for `0x0603`, 2026-09-24). The branch was pushed and
**PR #486 opened as a draft** (2026-09-24 04:09 UTC), with five commits past the eight from session 06:

| Commit | What |
| ------ | ---- |
| `a2d6efb9` | merge `main` (never rebase) |
| `1be8035b` | docs: what `EVM.privy` means for apps that already run their own `PrivyProvider` |
| `9a4bceb4` | skills: same, for partner agents (the old anti-pattern would strip an app's own Privy sign-in) |
| `bbc80df4` | build: emit the `privy` declarations in their own tsup pass — together with the other entries the d.ts worker needs more than Vercel's 8 GB and the previews hung to the 45-min timeout |
| `4a17e728` | `apps/demo` offers "Email (Privy)" behind `VITE_PRIVY_APP_ID` (Privy as a devDependency, `resolve.dedupe`) |

CI on `4a17e728`: every check green (Build and Test 24.x, E2E advisory, AI drift, docs, CodeQL,
Semgrep, OSV, gitleaks, Vercel preview). No reviews yet.

## This session

- The worktree was not on this machine; recreated `../sodax-sdks-456` from
  `origin/feat/456-privy-wallet-source`, `pnpm install`, `build:packages` (8/8, isolation check OK).
- Empty, git-ignored `.env` slots for `VITE_PRIVY_APP_ID` in `apps/wallet-modal-example` (:3002) and
  `apps/demo` (:3000).
- **`4e334fbc` feat(demo): set the Privy app id from the Settings modal** — pushed.
  - `SodaxSettings.privyAppId` in `sodax-demo:sodax-settings`; `effectivePrivyAppId` = modal >
    `VITE_PRIVY_APP_ID`. `src/privy.ts` reads it before the first render.
  - New **Wallet** section, "Privy app id" row, prefilled from the env (an app id is public, unlike the
    API key). Saving a changed id calls `window.location.reload()` — `SodaxWalletProvider` reads its
    config once.
  - **Trade-off, reverses `4a17e728`'s promise:** the Privy chunk is now always built, but only loaded
    with an id. Verified the Privy code sits in a lazy chunk, not the entry. `README.md`, `AGENTS.md`,
    `example.env` of the demo updated to say so.
  - Gates: demo `checkTs`, biome, `vite build` with no env; pre-commit hook 21/21 on Node 24.
- **No Node 24 on this machine.** Used the official `node-v24.21.0-darwin-arm64` tarball (SHA-256
  checked) in the session scratchpad plus a `pnpm` wrapper over corepack's `pnpm.js`. The shared
  `.git/config` was diffed before and after the hook: unchanged.

## Still open

Unchanged from session 06: live QA needs a dev Privy app id (spike 2, 4 and the QA matrix); npm + Vite
without Privy's Solana peers is unbuilt; open question 5 gates the merge; the AC2 rewrite comment is not
posted yet.
