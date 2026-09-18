---
type: brief
repo: sodax-sdks
github: 456
status: Active — paused by the user on 2026-09-18 after research + plan; no code yet
next: Answer the resume checklist below, then run plan.md § Step 0 (spike) in a worktree from main
updated: 2026-09-18
tags: [wallet, privy, email-login, embedded-wallet, wallet-sdk-react, evm, wagmi, walletconnect]
related_issues: [gh-1069, gh-1024]
related_decisions: [0001, 0003]
---

# GH-456 Privy Wallet Source SDK · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

Issue read, repo verified from source, Privy researched (6 topics), three architectures judged,
ten load-bearing claims adversarially checked (8 verified, 2 refuted-and-corrected, 2 unchecked).
**Decision: Privy is a plain wagmi connector behind a `@sodax/wallet-sdk-react/privy` sub-path;
`@privy-io/wagmi` is NOT used** because it replaces the wagmi connector list (kills WalletConnect +
EIP-6963). **No code written.** `plan.md` rev 1 is executable; a 0.5–1 day spike comes first.

| Item | State |
| ---- | ----- |
| Repo facts + Privy package internals verified first-hand | done — `process.md` § F1–F5 |
| Research digest (versions, API, security, packaging) | done — `research.md` |
| Architecture chosen + judged + verified | done — `plan.md`, `plan-architecture.md` |
| Claims C8 (Privy session storage keys) and C10 (TEE has no password recovery) | **unverified** — refuters hit usage limit; both are covered by spike item 5 and Q1 |
| Completeness critic pass | not run (same limit); optional |
| Decision record 0003 (Privy supersedes 0001) + 0001 status flip | **not written yet** |
| Step 0 spike → Steps 1–7 | not started |

## Blocked on

1. **AC2 wording only**: "set recovery/password" has no mechanism on Privy's default TEE
   execution (verified in Privy docs). Needs Fez's answer to Q1 in `plan.md` before the docs are
   written. Does **not** block the spike or the code.
2. A dev Privy app id with email login + Ethereum embedded wallets + test accounts (Q7) — needed
   from spike item 2 onward.

## Next action

**Resume checklist (in this order):**

1. `git -C sodax-sdks fetch` and re-check `origin/main` (was `898b7e6a` on 2026-09-17; the
   lockfile moved in PR #467, so re-run the version pick in `plan.md` § Step 0 — the newest
   `@privy-io/react-auth` that clears the 14-day cooldown on that day).
2. Optional: finish the interrupted verification pass. The workflow run id is `wf_9eac3d91-095`;
   script at
   `~/.claude/projects/-Users-sangnguyen-Documents-GitHub-sodax-sodax-sdks/d3f03adc-caac-445e-8e4b-0742c1886f36/workflows/scripts/gh-456-privy-research-design-wf_9eac3d91-095.js`.
   Resuming with `resumeFromRunId` replays the 28 cached agents and only runs the 7 missing ones
   (C5/C8/C9/C10 refuters + critic). Exact call (Claude Code, this machine):

   ```
   Workflow({scriptPath: '/Users/sangnguyen/.claude/projects/-Users-sangnguyen-Documents-GitHub-sodax-sodax-sdks/d3f03adc-caac-445e-8e4b-0742c1886f36/workflows/scripts/gh-456-privy-research-design-wf_9eac3d91-095.js', resumeFromRunId: 'wf_9eac3d91-095'})
   ```
 Its scratch inputs live in the session scratchpad and may be
   gone; the outputs that matter are already copied into this folder.
3. Write `decisions/0003-adopt-privy-for-email-login.md` (product call Anton/Fez 14 Sep; supersedes
   0001) and set 0001 `status: Superseded by 0003`.
4. Run `plan.md` § Step 0 in a worktree from `main` (never `git stash`).

## Settled — do not re-litigate

1. **Not `@privy-io/wagmi`.** Verified in its 4.0.17 source: `createConfig` keeps only `mock`
   connectors and disables EIP-6963; `useSyncPrivyWallets` calls
   `config._internal.connectors.setState(list)` and **replaces** the list; `WagmiProvider` forces
   `reconnectOnMount: false`; peer-pins `viem 2.56.0` exactly vs catalog 2.29.2.
2. **Sub-path entry, optional peer `@privy-io/react-auth`**, not a main-entry dynamic import
   (breaks webpack 5 partners — verified) and not a separate package (release tooling has
   hard-coded lists).
3. **Public API is `EVM.privy: privy({ appId })`** as the issue says; the generic
   `EvmWalletSource` shape is internal only ("no API surface for hypothetical callers").
4. **Modal login `login({ loginMethods: ['email'] })`**; branch on `authenticated` before calling
   it; reject only on `exited_auth_flow`. Disconnect = Privy sign-out in V1.
5. **Hydrator/Actions/store/modal/`EvmWalletProvider` untouched** — AC4 is structural.
6. **Two `trustPolicyExclude` entries** (`jose@4.15.9`, `ua-parser-js@1.0.41`) are the whole
   supply-chain cost; they match the repo's existing "legacy-line backport" category. Not a
   relaxation of controls.
7. **No changeset** (PR #407); commit subjects carry the release note; no `#456` in subjects.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What exactly do I build, in what order; API; lifecycle; gates; QA; risks; open questions | `plan.md` | 9.2k |
| Why this design and not A/C; full mount trees; 15-row QA matrix; file-by-file table | `plan-architecture.md` | 14k |
| Evidence behind any Privy/wagmi/packaging claim, with URLs and confidence labels | `research.md` | 12.7k |
| What I verified first-hand (source reads, npm facts, probe installs, verdict summary) | `process.md` | 3.5k |
| The issue body verbatim + AC + corrections to the issue text | `issue.md` | 2.2k |
| What shipped | `outcome.md` | 0 |

`plan-architecture.md` and `research.md` are past a cheap full read — `rg -n "^## |^### "` first,
then open one section.

## Landmines

- **The issue's own design is wrong on one point**: "use `WagmiProvider` from `@privy-io/wagmi`"
  would break AC5. Do not follow the issue's step 2 literally; follow `plan.md`.
- **The issue's AC2 "set recovery/password" cannot be met as written** on a TEE Privy app. Raise
  Q1 with Fez before the PR body claims AC2.
- Privy docs say `useLogin.onComplete` "executes immediately at mount when already
  authenticated" — the shipped code does not replay that event to later subscribers, and
  `login()` fires **no** callback when already authenticated. Verified in the 3.43.0 bundle.
- `'use client'` is stripped from every tsup entry by the rollup tree-shake pass (verified with
  the repo toolchain); the main entry ships without it today. The plan re-adds it post-build for
  `dist/privy/index.mjs`.
- wagmi `reconnect()` does not catch `isAuthorized()`; a throw wedges the module-level flag for
  the page lifetime. The Privy connector's `isAuthorized` must be total.
- Local `sodax-sdks` checkout was on `fix/sui-asset-manager-live-package-id`; branch from `main`.
- Session scratch (`/private/tmp/claude-501/.../scratchpad/gh-456/`) held the probe installs and
  the de-minified Privy sources; everything load-bearing was copied into this folder.
