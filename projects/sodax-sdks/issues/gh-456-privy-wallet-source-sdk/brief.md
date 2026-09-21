---
type: brief
repo: sodax-sdks
github: 456
status: Active — plan rev 2 ready; no code written; spike is the next action
next: Run plan.md § Step 0 — item 0 (Turbopack prerender go/no-go) needs no Privy app and can start now
updated: 2026-09-18
tags: [wallet, privy, email-login, embedded-wallet, wallet-sdk-react, evm, wagmi, walletconnect]
related_issues: [gh-1069, gh-1024]
related_decisions: [0003, 0001, 0002]
---

# GH-456 Privy Wallet Source SDK · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Two research rounds and two adversarial reviews are done. **Decision: Privy is a plain wagmi connector
plus a React host, behind the `@sodax/wallet-sdk-react/privy` sub-path with `@privy-io/react-auth` as an
optional peer; `@privy-io/wagmi` is NOT used** — it replaces the wagmi connector list and would kill
WalletConnect and EIP-6963. The same shape ships in production at sushiswap. `plan.md` is **rev 2** and
is executable; **no code written**. A 1-day spike comes first, and its first item needs no Privy app.

| Item | State |
| ---- | ----- |
| Repo + Privy package internals verified first-hand | done — `process.md` F1-F10 |
| Round 1: 6 research topics, 3 architectures judged, 10 claims refuted | done — `research.md` |
| Round 2: 5 research topics + 5-lens review of rev 1, 14 findings verified | done — `plan-revision-2.md` |
| ADR 0003 (Privy supersedes the in-house auth plane 0001) | done — `decisions/0003-…` |
| `plan.md` rev 2 (53 edits + the PR #163 memo folded in) | done |
| Spike (5 items), then Steps 1-7 | not started |

## Blocked on

**Nothing blocks the spike or the code.** Two things block *other* things:

1. **Open question 5 blocks publishing the partner guide**, not writing it: product must agree to
   publish two sentences — no signing while Privy is unreachable (mid-intent included), and a lost
   email is a lost wallet. Both are Privy's own documented positions.
2. **Open question 4 blocks spike item 3** (funded sends on Hedera / LightLink / Redbelly): needs an
   owner and a gas budget. Items 0, 1, 2 and 4 do not wait on it.

A dev Privy app is **self-service and free** (~10 minutes), so question 7 is a pre-merge question about
who owns the shared QA app, not a pre-spike blocker.

## Next action

`plan.md` § Steps → **Step 0, item 0**: mount `PrivyProvider` in `apps/example-next-js-16` with a dummy
`appId` and run `pnpm --filter example-next-js-16 verify` under both `next build` (Turbopack) and
`next build --webpack`. Privy statically imports `@walletconnect/ethereum-provider`, which puts that
module's init on the prerender path; this is the one thing no amount of reading settles, and it could
change the delivery shape. A worktree is already prepared at `../sodax-sdks-456` on branch
`feat/456-privy-wallet-source` (from `origin/main 898b7e6a`, dependencies installed, **no edits**).

## Settled — do not re-litigate

1. **Not `@privy-io/wagmi`.** Its `createConfig` keeps only `mock` connectors and disables EIP-6963;
   `useSyncPrivyWallets` calls `connectors.setState(list)` and **replaces** the list; `WagmiProvider`
   forces `reconnectOnMount: false`; it peer-pins `viem 2.56.0` exactly.
2. **Sub-path entry + optional peer**, not a main-entry dynamic import (breaks webpack 5 partners) and
   not a new package (`release.mjs` would fail — see the `@sodax/wallet-hw` case in `plan.md`).
3. **Public API is `EVM.privy: privy({ appId })`.** The generic `EvmWalletSource` shape stays internal.
   It coexists with PR #163's `EVM.wagmiConnectors`; it cannot collapse into it, because the host needs
   `EvmTypeConfig['chains']` to inject `privyWalletOverride`.
4. **Modal login**, branch on `authenticated` before calling `login()`, reject only on
   `exited_auth_flow`. Disconnect = Privy sign-out in V1.
5. **The SDK never calls `setWalletRecovery()`** — it throws on Privy's default TEE execution. The
   issue's AC2 is rewritten (text to post as a comment is in `plan.md` § Verification).
6. **Hydrator / Actions / store / modal / `EvmWalletProvider` untouched** — AC4 is structural.
7. **Two `trustPolicyExclude` entries** (`jose@4.15.9`, `ua-parser-js@1.0.41`) are the whole
   supply-chain cost, and they match the repo's existing legacy-backport category.
8. **No changeset** (PR #407); the release note is the commit subject; no `#456` in subjects.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order; API; lifecycle; gates; QA; risks; open questions | `plan.md` | 17k |
| Why each rev-2 change, with file:line evidence; the 38 facts the plan relies on; the spike rationale | `plan-revision-2.md` | 23k |
| Mount trees, file-by-file table, QA matrix rows 1-15, bundle-isolation proof (rev 1 record) | `plan-architecture.md` | 13k |
| Sources behind any Privy/wagmi/packaging claim, with confidence labels (round 1) | `research.md` | 13k |
| What I verified first-hand across both sessions | `process.md` | 4.3k |
| The issue body verbatim + AC + corrections to the issue text | `issue.md` | 2.2k |
| What shipped | `outcome.md` | 0 |

Every file except `issue.md` and `process.md` is past a cheap full read — `rg -n "^## |^### "` first,
then open one section.

## Landmines

- **The issue's own design is wrong on two points.** Step 2 ("use `WagmiProvider` from
  `@privy-io/wagmi`") would break AC5, and AC2 ("set recovery/password") calls an API that **throws** on
  a normally-provisioned Privy app. Follow `plan.md`, and post the AC2 rewrite as a comment rather than
  editing the issue body.
- **Rev 1 of this plan is wrong in five places** and is still on disk as `plan-architecture.md`. It is
  marked historical; rev 2 wins on every conflict.
- **PR #163 `feat/wallet-hw` touches the same `useMemo` and the same config block**, is three months
  stale and conflicting, and would fail `pnpm test` on merge (`@sodax/wallet-hw` is non-private at
  `0.0.1-test`; the version pattern and the three package lists are enforced by
  `scripts/release.test.mjs` against the real repo root). That note belongs in **their PR thread**, not
  a new issue. A ready-to-post draft is in `process.md` § F9 — not posted; ask first.
- **`pnpm build:packages` runs zero tasks** — the turbo task exists, no package implements the script.
  Use `pnpm build` or a filtered `turbo run build`, with `TURBO_CONCURRENCY=2`.
- **Never run the root `pnpm test` in the linked worktree** — `scripts/release.test.mjs` leaks `GIT_DIR`
  and writes `core.bare=true` / `commit.gpgsign=false` into the shared `.git/config`.
- wagmi does **not** catch `isAuthorized()`; a throw there wedges every later `reconnect()` for the page
  lifetime, and `storage.getItem` is async, so rev 1's `=== true` predicate was permanently false.
- `'use client'` does not survive tsup's rollup pass — the published dists of both this package and
  `@privy-io/react-auth` carry none.
- Local `sodax-sdks` checkout sits on `feat/quote-too-small-refusal`; branch/worktree from `main`.
