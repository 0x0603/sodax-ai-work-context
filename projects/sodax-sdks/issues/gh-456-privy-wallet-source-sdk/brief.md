---
type: brief
repo: sodax-sdks
github: 456
status: Active — PR #486 ready for review (not draft), head ff296f36 pushed (audit fixes 1-3 + main #496 merge), CI green, REVIEW_REQUIRED with no reviews (checked 2026-10-05); PR body still lacks the audit fixes; live QA waits on a dev Privy app id
next: PR body gains the audit fixes → one live login with a brand-new email (process/09); then spike 2/4 + QA matrix
updated: 2026-10-05
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
Implemented 2026-09-23 (spike 0 GO, every gate green); **pushed as draft PR #486** on 2026-09-24, where
`apps/demo` now takes the Privy app id from its Settings modal (`process/07`).
Nine places the code differs from `plan.md` are listed in `process/05`; the review in `process/06`
reversed three more (start-up guard, `privy()` never throws, optional peer `*`).

| Item | State |
| ---- | ----- |
| Repo + Privy package internals verified first-hand | done — `process/01` (F1-F6), `process/02` (F7-F10) |
| Round 1: 6 research topics, 3 architectures judged, 10 claims refuted | done — `research.md` |
| Round 2: 5 topics + 5-lens review of rev 1, 14 findings verified | done — `archive/plan-revision-2.md` |
| ADR 0003 (Privy supersedes the in-house auth plane 0001) | done — `decisions/0003-…` |
| Audit of rev 2: approach, over-engineering, bug risk | done — `process/03` |
| `plan.md` rev 3: smaller API, 3 errors fixed, `EVM.privy` settled | done — `process/04` |
| Worktree on current `main` | done — `1549d309`, re-installed |
| Spike 0 (Turbopack + webpack prerender) and 1 (install, gates, Privy 3.40.0 facts) | done — GO; `process/05` |
| Steps 1–7 (seam, sub-path, tests, demo, docs, skills, CI line) | done, **uncommitted** — `process/05` |
| Max review: 15 findings verified and fixed, 276 tests | done — `process/06` |
| Alternative: add-on package `@sodax/wallet-privy` (EIP-6963) | built, **rejected by the user, reset** to `a2d6efb9` — `process/10` |
| Approach review of the pushed branch: keep it; six weak points (proposals, not accepted) | done — `process/11` |
| Vercel previews hung (DTS OOM on 8 GB builders) → privy DTS in its own pass; Privy in `apps/demo` | done, pushed `bbc80df4`, `4a17e728` — `process/12` |
| Pushed; **PR #486 draft**, 14 commits, CI green; demo Settings field for the app id | done — `process/07` |
| R0bi7 review (3 low): logout mid-connect, guard vs app errors, demo `cross-env` — verified + fixed | done, pushed `59be6f2e` — `process/08` |
| Implementation audit: 1 High, 1 Medium, 5 Low/nits; fixes 1–3 + main merge | done, pushed `ff296f36`; 4–7 open — `process/09` |
| Spike 2–4 (unregistered-chain signing, funded sends, live MFA/config) | blocked on a dev Privy app id (+ gas owner for 3) |

## Blocked on

**Nothing blocks the spike or the code.** Open question 5 blocks *publishing* the partner guide (not
writing it): product must agree to state that no signing is possible while Privy is unreachable, and
that a lost email is a lost wallet. Open question 4 blocks **spike item 3 only** (funded sends on
Hedera / LightLink / Redbelly — needs an owner and a gas budget). A dev Privy app is free and
self-service, so question 7 is pre-merge, not pre-spike.

## Next action

1. **A dev Privy app id** (dashboard.privy.io, free; enable Email + Ethereum embedded wallets, allow
   `http://localhost:3000`): `pnpm dev:demo` → Settings → Wallet → "Privy app id" → Save (reloads). Or
   `VITE_PRIVY_APP_ID` in `apps/demo/.env` / `apps/wallet-modal-example/.env` (:3002). Then spike items
   2 and 4 and the QA matrix in `plan.md`; measure the 3 s restore budget (spike 4(d)).
2. Before merge (#486 was marked ready without these — nothing records them done): `pnpm pack:local` into a
   scratch **npm + Vite** app without Privy's Solana peers — the one install shape nobody has built yet
   (`process/05` § Deviations 8); post the AC2 rewrite comment (`plan.md` § Verification) — #456 still has
   no comments (2026-10-05).
3. Merging stays gated on open question 5 (see Landmines).

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
7. **Start-up guard, not a general boundary** (reversed in session 06): `PrivyStartupGuard` catches only
   `PrivyProvider`'s render-time throws before it has started (http origin, malformed app id, nested
   provider) and keeps the app running; later errors reach the app's own boundaries. `privy()` is pure and
   **never throws** (warns + disabled source). Runtime is per mount.
7b. **Optional peer range is `*`**; the 3.40 floor is checked at runtime from Privy's `VERSION`. A narrower
   range makes npm ERESOLVE for partners who already use an older Privy (reproduced).
7c. **SDK disconnect ends every wagmi EVM connection** (`EvmActions`), not only the current one.
8. **Two `trustPolicyExclude` entries** (`jose@4.15.9`, `ua-parser-js@1.0.41`) are the whole
   supply-chain cost, matching the repo's existing legacy-backport category.
9a. **Not an add-on package.** `@sodax/wallet-privy` (`<PrivyEmailWallet>` + an EIP-1193 provider over
   EIP-6963) was built in session 10 at the user's request, then rejected by the user; do not re-propose it.
9. **No changeset** (PR #407); the release note is the commit subject; no `#456` in subjects.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Audit of #486 at f48a836a: what is wrong (ranked, verified), fix directions, what holds up | `process/09-…-implementation-audit.md` | 1.4k |
| R0bi7's three findings: what is real, what was overclaimed, the fixes and gates | `process/08-…-review-findings-fixes.md` | 1.1k |
| Why #486's Vercel previews hung and the tsup split; Privy in `apps/demo`; first live QA | `process/12-…-vercel-dts-and-demo.md` | 2.0k |
| Is the approach right; what to measure before review; partners already on Privy; how #486 was opened | `process/11-…-approach-review.md` | 2.8k |
| The rejected add-on package: why not, and the wagmi/mipd facts it surfaced | `process/10-…-addon-package-pivot.md` | 1.9k |
| PR #486, the commits after session 06, the demo Settings field and its trade-off | `process/07-…-pr486-and-demo-settings.md` | 1.0k |
| What the max review found, what was reversed and why, the fixes | `process/06-…-review-fixes.md` | 1.5k |
| What was built, spike results, gates run, where the code differs from the plan | `process/05-…-implementation.md` | 2.3k |
| What exactly do I build, in what order; API; lifecycle; gates; tests; QA matrix; risks; open questions | `plan.md` (rev 3) | 15.7k |
| What rev 3 changed and why; the three rev-2 errors; the "why import `privy`" answer | `process/04-…-plan-rev3-api-simplification.md` | 1.7k |
| The audit that triggered rev 3: what held up, residual bug risk ranked | `process/03-…-plan-audit.md` | 2.5k |
| Sources behind any Privy/wagmi/packaging claim, with confidence labels (round 1) | `research.md` | 12.8k |
| What was verified first-hand, per session — **index only, open one row** | `process.md` | 0.6k |
| The issue body verbatim + AC + corrections to the issue text | `issue.md` | 2.2k |
| **Archived** — rev 1 design; rev 1 → 2 evidence with file:line (read one § only if a rev-3 fact needs its source) | `archive/plan-architecture.md`, `archive/plan-revision-2.md` | 13.5k, 23.5k |
| What shipped | `outcome.md` | 0 |

Resuming cold: this brief → `process/09` → `process/08` → `process/07` → `process/06` → `process/05` → the one `plan.md` section you need.
Sessions 10–12 were written on the other machine and pushed late; in time order they sit between 06 and 07
(`rg -n "^## |^### " plan.md` first — it is past a cheap full read).

## Landmines

- **The issue's own design is wrong on two points.** Its step 2 (`WagmiProvider` from
  `@privy-io/wagmi`) breaks AC5; its AC2 (set recovery/password) calls an API that **throws**.
- **Workspace-only: dedupe Privy in any app that also imports `@privy-io/react-auth`.** The worktree holds
  three Privy instances; the SDK's own resolves `@solana/kit` 2.3.0 (Privy wants ≥ 3.0.3), which breaks a
  Vite build even for a dead `import()`, and two copies split the React context. `apps/wallet-modal-example`
  uses `resolve.dedupe`.
- **Keep `./privy` declarations in their own tsup pass** (`tsup.privy-dts.config.ts`). The combined declaration
  pass needs > 6 GB heap and hangs Vercel's 8 GB builders until the 45-minute timeout; the main pass alone is
  already at 6–8 GB (`process/12`).
- **StrictMode drops EIP-6963 wallets' restore after a reload** (pre-existing `EvmHydrator` bug, dev only;
  not re-checked for the static `EVM.privy` connector) — `process/10`. Not ours to fix in this PR.
- **Merging publishes the README Privy bullet** to docs.sodax.com (the README is mirrored) — gate the
  merge on open question 5.
- **With Privy's wallet UI on, a send resolves only when the user closes Privy's success screen**
  (after Privy waits for the receipt) — Privy 3.40 `SendTransactionScreen`; the close handler is a
  no-op while the receipt is pending, so there is no UI option around it. `showWalletUIs: false`
  resolves right after broadcast — the demo used it in `b981aed7`, **then `411af4cd` (local, 2026-10-01) set
  `showWalletUIs: true` again at the user's request**.
  The SDK still leaves it to the partner. `process/08`. Documented for partners in `10ff3f81`
  (`WALLET_PRIVY.md` Options + new "Your own dialogs" section + per-appId addresses; the skill
  recipe's options line and two anti-patterns).
- **Never time a pass-through provider request.** Signing can open Privy's MFA prompt or confirmation
  modal; only connector-internal calls get `INTERNAL_CALL_MS`. Rev 2 had this wrong.
- **Nothing under `archive/` is a source of truth.** Where it disagrees with `plan.md`, `plan.md` wins.
- **Privy facts are verified against the pinned 3.40.0** (`process/05` § Spike results) — re-check them
  when bumping the pin; Privy ships weekly. `@privy-io/wagmi` (F2) is not installed and not used.
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
- Work in the worktree `../sodax-sdks-456`, never the main `sodax-sdks` checkout (other branches live
  there). A machine without it: `git worktree add ../sodax-sdks-456 -b feat/456-privy-wallet-source
  origin/feat/456-privy-wallet-source`, then `pnpm install` + `build:packages`.
- **Commit on Node 24** — the hook's `wallet-sdk-react` tests fail on Node 26. No Node 24 installed?
  A checksum-verified nodejs.org tarball + a `pnpm` wrapper over corepack's `pnpm.js` works (`process/07`).
