---
type: process
repo: sodax-sdks
github: 456
updated: 2026-10-05
---

# Process — index

The session log passed the point where reading it whole is sensible. It is now **one file per
session** under `process/`, and this file is the index. Read the row you need, not the folder.

Every file under `process/` carries the same frontmatter (`type: process`, `github: 456`,
`session: <date>`), so `rg "^github: 456"` still finds all of them. Append a **new file** per
session; add a row here. Do not grow this index beyond the table.

## Sessions

| # | Date | File | What it settled | ~tok |
| - | ---- | ---- | --------------- | ---: |
| 01 | 2026-09-17 | [repo-and-privy-verification](process/01-2026-09-17-repo-and-privy-verification.md) | **F1-F6.** How the SDK wires EVM wallets today; what `@privy-io/wagmi@4.0.17` actually does (the decisive fact against it); registry + packaging; repo gates; the full trust-policy blocker list; adversarial verification of ten load-bearing claims | 3.0k |
| 02 | 2026-09-18 | [rev2-decision-and-pr163](process/02-2026-09-18-rev2-decision-and-pr163.md) | **F7-F10.** ADR 0003 written; `'use client'` absent from every published dist; `privyWalletOverride` answers the chain-coverage risk; **PR #163 already opened this seam** (+ reference text about it — **never post, do not touch that PR**); round-2 close and the 53 rev-2 edits | 1.9k |
| 03 | 2026-09-23 | [plan-audit](process/03-2026-09-23-plan-audit.md) | **Audit of `plan.md` rev 2 as the thing under test.** Approach holds; five cuts recommended (incl. deleting the late-readiness `reconnect()`); `build:packages` landmine was **factually wrong**; `EVM.privy` vs `EVM.wagmiConnectors` re-opened; base is 166 files stale | 2.3k |
| 04 | 2026-09-23 | [plan-rev3-api-simplification](process/04-2026-09-23-plan-rev3-api-simplification.md) | **`plan.md` rev 3.** Three rev-2 errors fixed (10 s timeout on interactive signing, unimplementable `tempoModerato` guard, useless `'use client'` step); `EVM.privy` + `privy({ appId })` shape settled with the why; no error boundary; runtime per mount; two plan files archived | 1.7k |
| 05 | 2026-09-23 | [implementation](process/05-2026-09-23-implementation.md) | **Spike 0 GO (Turbopack + webpack); Steps 1–7 built, uncommitted.** Privy pinned 3.40.0; 250 tests + every gate green; supersession rule fixed by a test; nine deviations from rev 3 listed; workspace dual-Privy / `@solana/kit` 2.3.0 hazard found and deduped | 2.3k |
| 06 | 2026-09-23 | [review-fixes](process/06-2026-09-23-review-fixes.md) | **Max review: 15 findings, all verified, all fixed with mutation-checked tests.** Reversed: start-up guard around `PrivyProvider` (Privy throws on http/bad appId/nested), `privy()` never throws, optional peer `*` (npm ERESOLVE proven). SDK disconnect now ends every EVM connection | 1.5k |
| 07 | 2026-09-24 | [pr486-and-demo-settings](process/07-2026-09-24-pr486-and-demo-settings.md) | **PR #486 (draft) up**, the five unlogged commits since 06; `apps/demo` Settings modal takes the Privy app id (`4e334fbc`, Privy chunk now always built but lazy); Node 24 from a tarball for the hook | 1.0k |
| 08 | 2026-09-30 | [review-findings-fixes](process/08-2026-09-30-review-findings-fixes.md) | **R0bi7's 3 low findings verified, fixed, pushed (`59be6f2e`).** Logout mid-connect reproduced; guard finding narrower than first said (only errors that vanish outside `PrivyProvider`); demo `cross-env`. 289 tests, build + isolation, demo build green | 1.1k |
| 09 | 2026-10-01 | [implementation-audit](process/09-2026-10-01-implementation-audit.md) | **Audit of #486 at f48a836a.** Design holds, not overkill; High: SDK `createWallet()` races Privy's create-on-login for new users (2nd wallet or logout); Medium: Disconnect during reload restore skips Privy logout (reproduced); logout-in-disconnect, SSR, isolation-gate, test gaps | 1.4k |
| 10 | 2026-09-23 | [addon-package-pivot](process/10-2026-09-23-addon-package-pivot.md) | *(Written on a second machine, pushed late; in time order between 06 and 07.)* **Tried and rejected: the add-on package `@sodax/wallet-privy` (EIP-6963).** Built at the user's request, then rejected and the tree reset to `a2d6efb9`. Kept for its findings: wagmi `injected`/mipd facts, one-wagmi install check, the pre-existing StrictMode `EvmHydrator` restore bug | 1.9k |
| 11 | 2026-09-24 | [approach-review](process/11-2026-09-24-approach-review.md) | *(Late, between 06 and 07.)* **Approach review of the pushed branch: keep it.** Six weak points ranked (no real-Privy run yet; 3 s restore budget unmeasured; SDK-owned `PrivyProvider` limits; connector complexity; two non-Privy changes; issue deviations for the PR body). Verified: `dist` shares the `WeakMap` chunk, the guard does not swallow partner first-render errors. Partners already on Privy: an app-owned-provider mode sketched, not for #456; **how PR #486 was opened** | 2.8k |
| 12 | 2026-09-24 | [vercel-dts-and-demo](process/12-2026-09-24-vercel-dts-and-demo.md) | *(Late, between 06 and 07.)* **Why #486's Vercel previews hung** (8 GB builders; the main declaration pass already needs 6–8 GB) → `./privy` declarations in a second tsup pass (`bbc80df4`); **Privy in `apps/demo`** (`4a17e728`); a background reconnect killed an open login; first live QA on localhost:1993 | 2.0k |

## Changes During Work

- Created this dossier (`issue.md`, `brief.md`, `plan.md`, `plan-architecture.md`, `research.md`,
  `process.md` → `process/`, `outcome.md`). 2026-09-23: `plan-architecture.md` and
  `plan-revision-2.md` moved to `archive/` (superseded by `plan.md` rev 3).
- Context repo: decision 0003 (Privy supersedes 0001) written, 0001 status flipped.
- Code in `sodax-sdks`: worktree `../sodax-sdks-456` on `feat/456-privy-wallet-source`, base
  `1549d309`, **implemented but uncommitted** (2026-09-23) — see `process/05`. 2026-09-24: pushed,
  PR #486 (draft) — see `process/07`.
