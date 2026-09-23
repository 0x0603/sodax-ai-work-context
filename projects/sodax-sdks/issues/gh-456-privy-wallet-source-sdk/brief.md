---
type: brief
repo: sodax-sdks
github: 456
status: Active — plan rev 3 written; no code written; public API settled; next is the spike
next: Re-install in the worktree, then plan.md § Step 0 item 0 (Turbopack prerender go/no-go)
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
and EIP-6963. Same shape ships in production at sushiswap. Partner writes
`EVM: { privy: privy({ appId }) }` — one import, one field. `plan.md` is at **rev 3** (2026-09-23):
the audit's cuts applied, three rev-2 errors fixed, public API settled, the old plan files archived.
**No code written.**

| Item | State |
| ---- | ----- |
| Repo + Privy package internals verified first-hand | done — `process/01` (F1-F6), `process/02` (F7-F10) |
| Round 1: 6 research topics, 3 architectures judged, 10 claims refuted | done — `research.md` |
| Round 2: 5 topics + 5-lens review of rev 1, 14 findings verified | done — `archive/plan-revision-2.md` |
| ADR 0003 (Privy supersedes the in-house auth plane 0001) | done — `decisions/0003-…` |
| Audit of rev 2: approach, over-engineering, bug risk | done — `process/03` |
| `plan.md` rev 3: smaller API, 3 errors fixed, `EVM.privy` settled | done — `process/04` |
| Worktree on current `main` | done — `1549d309`; re-install not verified |
| Spike (5 items), then Steps 1-7 | not started |

## Blocked on

**Nothing blocks the spike or the code.** Open question 5 blocks *publishing* the partner guide (not
writing it): product must agree to state that no signing is possible while Privy is unreachable, and
that a lost email is a lost wallet. Open question 4 blocks **spike item 3 only** (funded sends on
Hedera / LightLink / Redbelly — needs an owner and a gas budget). A dev Privy app is free and
self-service, so question 7 is pre-merge, not pre-spike.

## Next action

1. In `../sodax-sdks-456` (already at `origin/main 1549d309`): `pnpm i`, then
   `TURBO_CONCURRENCY=2 pnpm build:packages`.
2. `plan.md` § Steps → **Step 0, item 0**: mount `PrivyProvider` in `apps/example-next-js-16` with a
   dummy `appId`, run `pnpm --filter example-next-js-16 verify` under both `next build` (Turbopack)
   and `next build --webpack`. Privy *statically* imports `@walletconnect/ethereum-provider`, putting
   its init on the prerender path. No amount of reading settles this, and it could change the
   delivery shape.

## Settled — do not re-litigate

1. **Not `@privy-io/wagmi`.** Its `createConfig` keeps only `mock` connectors and disables EIP-6963;
   `useSyncPrivyWallets` **replaces** the connector list; it peer-pins `viem 2.56.0` exactly.
2. **Sub-path entry + optional peer** — not a main-entry dynamic import (breaks non-Privy partners at
   build), not a hard dependency (every partner pays ~53 packages), not a new package (`release.mjs`).
3. **Public API is `EVM.privy: privy({ appId })`** — closed in session 04. The value is opaque and the
   `setup(ctx)` contract behind it is internal, so it is not a second extension point; `wagmiConnectors`
   + a host slot would publish that contract. **Not `privy: { appId }`**: the import is what makes the
   bundler include Privy (`plan.md` § Approach has the full why; it becomes a FAQ in the guide).
4. **Modal login**, branch on `authenticated` before `login()`, reject only on `exited_auth_flow`.
   Disconnect = Privy sign-out in V1.
5. **The SDK never calls `setWalletRecovery()`** — it throws on Privy's default TEE execution. AC2 is
   rewritten; post it as a comment (text in `plan.md` § Verification), do not edit the issue body.
6. **Hydrator / Actions / store / modal / `EvmWalletProvider` untouched** — AC4 is structural.
7. **No error boundary around the host**; `privy()` is pure and fails fast; runtime is per mount.
8. **Two `trustPolicyExclude` entries** (`jose@4.15.9`, `ua-parser-js@1.0.41`) are the whole
   supply-chain cost, matching the repo's existing legacy-backport category.
9. **No changeset** (PR #407); the release note is the commit subject; no `#456` in subjects.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order; API; lifecycle; gates; tests; QA matrix; risks; open questions | `plan.md` (rev 3) | 15.6k |
| What rev 3 changed and why; the three rev-2 errors; the "why import `privy`" answer | `process/04-…-plan-rev3-api-simplification.md` | 1.7k |
| The audit that triggered rev 3: what held up, residual bug risk ranked | `process/03-…-plan-audit.md` | 2.5k |
| Sources behind any Privy/wagmi/packaging claim, with confidence labels (round 1) | `research.md` | 12.8k |
| What was verified first-hand, per session — **index only, open one row** | `process.md` | 0.6k |
| The issue body verbatim + AC + corrections to the issue text | `issue.md` | 2.2k |
| **Archived** — rev 1 design; rev 1 → 2 evidence with file:line (read one § only if a rev-3 fact needs its source) | `archive/plan-architecture.md`, `archive/plan-revision-2.md` | 13.5k, 23.5k |
| What shipped | `outcome.md` | 0 |

Resuming cold: this brief → `process/04` → the one `plan.md` section you need
(`rg -n "^## |^### " plan.md` first — it is past a cheap full read).

## Landmines

- **The issue's own design is wrong on two points.** Its step 2 (`WagmiProvider` from
  `@privy-io/wagmi`) breaks AC5; its AC2 (set recovery/password) calls an API that **throws**.
- **Never time a pass-through provider request.** Signing can open Privy's MFA prompt or confirmation
  modal; only connector-internal calls get `INTERNAL_CALL_MS`. Rev 2 had this wrong.
- **Nothing under `archive/` is a source of truth.** Where it disagrees with `plan.md`, `plan.md` wins.
- **Every `@privy-io/*` claim here is single-sourced and unverified since 2026-09-18**, and the package
  is installed nowhere in the workspace. Spike item 1 must diff the pinned version against F2/F7/F8.
- **Do not re-add what rev 3 removed** — `plan.md` § "Removed in rev 3" lists each item with its reason
  (late-readiness `reconnect()`, public timeouts, the boundary, `restore-use-client.mjs`, the
  `tempoModerato` guard, …).
- **Do not touch PR #163** (0xmilktea's `feat/wallet-hw`) — no comment, no edit. It collides with #456
  on the same `useMemo` and config block (text only), and its `@sodax/wallet-hw` is non-private at
  `0.0.1-test`, which the #407 release gate rejects. Reference for **us** in `process/02` § F9; raise it
  only in our own PR if it ever blocks us.
- **`pnpm build:packages` works** — `turbo.json:27` gives it `dependsOn: ["^build"]` (8 real builds);
  lighter than `pnpm build`. Use `TURBO_CONCURRENCY=2`.
- **Never run the root `pnpm test` in the linked worktree** — `scripts/release.test.mjs` leaks
  `GIT_DIR` and writes `core.bare=true` / `commit.gpgsign=false` into the shared `.git/config`.
- wagmi does **not** catch `isAuthorized()`; a throw wedges every later `reconnect()` for the page
  lifetime, and `storage.getItem` is async, so a `=== true` predicate is permanently false.
- `'use client'` does not survive tsup's rollup pass — and the `/privy` entry does not need it:
  `privy()` can only be called from a client module.
- Local `sodax-sdks` checkout sits on `feat/quote-too-small-refusal`; work in `../sodax-sdks-456`.
