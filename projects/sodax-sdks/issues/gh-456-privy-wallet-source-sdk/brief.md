---
type: brief
repo: sodax-sdks
github: 456
status: Active — plan rev 2 audited; no code written; two things to settle before the spike
next: Merge main into the worktree, settle EVM.privy vs EVM.wagmiConnectors, then plan.md § Step 0 item 0
updated: 2026-09-23
tags: [wallet, privy, email-login, embedded-wallet, wallet-sdk-react, evm, wagmi, walletconnect]
related_issues: [gh-1069, gh-1024]
related_decisions: [0003, 0001, 0002]
---

# GH-456 Privy Wallet Source SDK · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

**Decision: Privy is a plain wagmi connector plus a React host, behind the
`@sodax/wallet-sdk-react/privy` sub-path with `@privy-io/react-auth` as an optional peer;
`@privy-io/wagmi` is NOT used** — it replaces the wagmi connector list and would kill WalletConnect
and EIP-6963. Same shape ships in production at sushiswap. Two research rounds, two adversarial
reviews, `plan.md` at **rev 2** and executable — then an **audit of the plan itself** (2026-09-23):
approach holds, five things should be cut, one "verified fact" was wrong. **No code written.**

| Item | State |
| ---- | ----- |
| Repo + Privy package internals verified first-hand | done — `process/01` (F1-F6), `process/02` (F7-F10) |
| Round 1: 6 research topics, 3 architectures judged, 10 claims refuted | done — `research.md` |
| Round 2: 5 topics + 5-lens review of rev 1, 14 findings verified | done — `plan-revision-2.md` |
| ADR 0003 (Privy supersedes the in-house auth plane 0001) | done — `decisions/0003-…` |
| `plan.md` rev 2 (53 edits + the PR #163 memo folded in) | done |
| Audit: approach, over-engineering, bug risk | done — `process/03` |
| Spike (5 items), then Steps 1-7 | not started |

## Blocked on

**Nothing blocks the spike or the code.** Open question 5 blocks *publishing* the partner guide (not
writing it): product must agree to state that no signing is possible while Privy is unreachable, and
that a lost email is a lost wallet. Open question 4 blocks **spike item 3 only** (funded sends on
Hedera / LightLink / Redbelly — needs an owner and a gas budget). A dev Privy app is free and
self-service, so question 7 is pre-merge, not pre-spike.

**The audit added one pre-code decision:** `EVM.privy` vs riding PR #163's `EVM.wagmiConnectors` plus
a generic host slot. Public API cannot be changed after release — settle it before Step 2.

## Next action

1. **Merge `main` into the worktree** — it sits at `898b7e6a`, 166 files behind `a7426e57` — and
   re-install. It is a stale base, not a ready one: clean, no edits, no `@privy-io/*` installed.
2. **Settle `EVM.privy` vs `EVM.wagmiConnectors`** (see Settled #3), because it changes the public
   API the spike proves out.
3. `plan.md` § Steps → **Step 0, item 0**: mount `PrivyProvider` in `apps/example-next-js-16` with a
   dummy `appId`, run `pnpm --filter example-next-js-16 verify` under both `next build` (Turbopack)
   and `next build --webpack`. Privy *statically* imports `@walletconnect/ethereum-provider`, putting
   its init on the prerender path. No amount of reading settles this, and it could change the
   delivery shape.

## Settled — do not re-litigate

1. **Not `@privy-io/wagmi`.** Its `createConfig` keeps only `mock` connectors and disables EIP-6963;
   `useSyncPrivyWallets` **replaces** the connector list; it peer-pins `viem 2.56.0` exactly.
2. **Sub-path entry + optional peer** — not a main-entry dynamic import (breaks webpack 5 partners),
   not a new package (`release.mjs` would fail; see the `@sodax/wallet-hw` case in `plan.md`).
3. **Public API is `EVM.privy: privy({ appId })`**, `EvmWalletSource` internal.
   **⚠ Re-opened by the audit:** the stated reason (the host needs `EvmTypeConfig['chains']` for
   `privyWalletOverride`) justifies the *Host*, not a provider-named *connector slot* — and
   `plan.md` § Out of scope forbids adding a second extension point. Cost `wagmiConnectors` + a
   generic `EVM.hosts` first. `process/03` § Re-open.
4. **Modal login**, branch on `authenticated` before `login()`, reject only on `exited_auth_flow`.
   Disconnect = Privy sign-out in V1.
5. **The SDK never calls `setWalletRecovery()`** — it throws on Privy's default TEE execution. AC2 is
   rewritten; post it as a comment (text in `plan.md` § Verification), do not edit the issue body.
6. **Hydrator / Actions / store / modal / `EvmWalletProvider` untouched** — AC4 is structural.
7. **Two `trustPolicyExclude` entries** (`jose@4.15.9`, `ua-parser-js@1.0.41`) are the whole
   supply-chain cost, matching the repo's existing legacy-backport category.
8. **No changeset** (PR #407); the release note is the commit subject; no `#456` in subjects.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Is the plan any good — what to cut, where the bugs are, what is still unverified | `process/03-…-plan-audit.md` | 2.3k |
| What exactly do I build, in what order; API; lifecycle; gates; QA; risks; open questions | `plan.md` | 17k |
| Why each rev-2 change, with file:line evidence; the 38 facts; the spike rationale | `plan-revision-2.md` | 23k |
| Mount trees, file-by-file table, QA matrix rows 1-15, bundle-isolation proof (rev 1) | `plan-architecture.md` | 13k |
| Sources behind any Privy/wagmi/packaging claim, with confidence labels (round 1) | `research.md` | 13k |
| What was verified first-hand, per session — **index only, open one row** | `process.md` | 0.5k |
| The issue body verbatim + AC + corrections to the issue text | `issue.md` | 2.2k |
| What shipped | `outcome.md` | 0 |

Resuming cold: this brief → `process/03` → the one `plan.md` section you need. Everything except
`issue.md` and `process.md` is past a cheap full read — `rg -n "^## |^### "` first.

## Landmines

- **The issue's own design is wrong on two points.** Its step 2 (`WagmiProvider` from
  `@privy-io/wagmi`) breaks AC5; its AC2 (set recovery/password) calls an API that **throws**.
- **Neither `plan-architecture.md` nor `plan-revision-2.md` is a source of truth.** The first is rev 1,
  wrong in five places; the second is a diff already applied to `plan.md`. 140 KB / ~36k tokens of
  duplicate design — the audit recommends reducing both to a decisions log (`process/03` § cut 1).
- **Every `@privy-io/*` claim here is single-sourced and unverified since 2026-09-18**, and the package
  is installed nowhere in the workspace. Spike item 1 must diff the pinned version against F2/F7/F8
  rather than assume them.
- **Do not build the late-readiness self-`reconnect()`** (`plan.md` § Lifecycle — returning user
  reload): it races wagmi's internal `current` on heuristic guards, and the plan's own one-click
  fallback costs nothing. `process/03` § cut 5.
- **PR #163 `feat/wallet-hw` touches the same `useMemo` and config block**, is stale and conflicting,
  and would fail `pnpm test` on merge (`@sodax/wallet-hw` non-private at `0.0.1-test`). That note goes
  in **their PR thread**, not a new issue. Draft in `process/02` § F9 — not posted; ask first.
- **`pnpm build:packages` DOES work — the old note here was wrong** (corrected 2026-09-23).
  `turbo.json:27` gives it `dependsOn: ["^build"]`, so the dry run schedules 26 tasks, 8 of them real
  builds, despite the task's own command being `<NONEXISTENT>`. Lighter than `pnpm build`, which also
  builds the apps. Use `TURBO_CONCURRENCY=2`.
- **Never run the root `pnpm test` in the linked worktree** — `scripts/release.test.mjs` leaks
  `GIT_DIR` and writes `core.bare=true` / `commit.gpgsign=false` into the shared `.git/config`.
- wagmi does **not** catch `isAuthorized()`; a throw wedges every later `reconnect()` for the page
  lifetime, and `storage.getItem` is async, so rev 1's `=== true` predicate was permanently false.
- `'use client'` does not survive tsup's rollup pass — neither this package's nor Privy's dist has it.
- Local `sodax-sdks` checkout sits on `feat/quote-too-small-refusal`; branch/worktree from `main`.
