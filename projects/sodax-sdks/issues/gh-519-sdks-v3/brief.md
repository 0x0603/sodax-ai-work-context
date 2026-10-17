---
type: brief
repo: sodax-sdks
github: 519
status: Active
next: User takes plan-v3-final.md §6 decisions 1–4 to the team, posts ideas.md §1 on #519, and starts the W1 PRs (§10); GitHub issues only when the team agrees (R0bi7's board)
updated: 2026-10-17
tags: [v3, idea-capture, lightweight, bundle-size, architecture, what-if, order, sub-issues]
related_issues: [gh-302, gh-456, gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 SDKs v3 · brief

**Entry point. Read this, then open exactly one row from the map.**

## State

#519 is R0bi7's idea-capture board for v3: bullets per package, name prefix, details later. As of
2026-10-16 it has no comments and an untouched template body.

**2026-10-14**
- Measured the published 2.2.0 packages: bundle, install, Node import, tsc, audit.
- Wrote a ranked, evidence-backed idea list.
- Measured the v3 what-ifs. EVM-only swap dapp: 2,994 → 186 KB gzip.
- First verified scope: `plan-v3-scope.md`, 260 pts.

**2026-10-16, part 1.** `ideas.md` §1 became one ranked table: 36 items (T1–T36), each with a score
out of 10.

**2026-10-16, part 2: per-item research and work order**
- **Research.** Four cluster agents researched every item against `origin/main` cc053fef:
  A build/packaging, B core/chains, C wallet, D dapp-kit/API/AI/migration. The lead re-checked their
  load-bearing claims in code.
- **Result.** 162 one-PR sub-issues in waves, with dependencies, conflicts and hot files:
  `plan-v3-order.md` and `plan-v3-subissues.md`.
- **Totals.** 453 pts in all; **239 pts are required for 3.0.0**; 19 sub-issues are breaking.
- **Package map** (`plan-v3-packages.md`, proposed). Core is types, api, sdk, the chain packages,
  chains-all, wallet-sdk-react, dapp-kit, skills and codemod. API hooks live at `@sodax/api/react`.
  wallet-sdk-core folds into `@sodax/sdk/wallet` (shim through 3.x). libs is retired. swaps-api and
  bridge-api become shims.
- **Feasibility** (`plan-v3-order.md` §10). Technically feasible. The risks are capacity (5–8 months
  alongside feature work) and coordination with other people's PRs.
- **Packaging** (`plan-v3-order.md` §11, proposed). Split packages only along install-weight axes:
  SDK vs API, chain, wallet. dapp-kit is not split per feature. A new sdk-free API-hooks package sits
  on `@sodax/api`, with an install matrix per persona. Measured: React in API mode is 21 MB vs ≥777 MB
  through dapp-kit today.
- **Delivery model.** Expand, then contract, on `main`, with a `release-2.x` maintenance line.
- **Ordering anchors.** The user's #509, #511, #512 and #523 merge first. #534 (Tron + MPC settle)
  merges before the chain registry; the chain-PR cutoff is acceptance of the T1.1 ADR.

**2026-10-16, final.** `plan-v3-final.md` consolidates everything into one entry point: outcome,
package map, delivery model, waves, 30 parent and 7 single issues, decisions, coordination asks,
totals and next steps.

Nothing is posted and no icon-project code changed.

## Next action

All in `plan-v3-final.md`:

1. The user takes the §6 decisions to the team, 1–4 first: the delivery model, the chain-PR cutoff,
   the package-map ADR and the wallet-sdk-react design. The §7 asks go to gcranju, R0bi7,
   Prabinbaral77 and 0xmilktea.
2. The user posts `ideas.md` §1 on #519.
3. Filing issues is the team's call: #519 is R0bi7's board, and R0bi7 said the team will turn it into
   sub-tasks later. Paste-ready drafts are in `parent-issues.md`; sub-issue titles are in
   `plan-v3-subissues.md`.
4. W1 can start now (§10). Every W1 sub-issue is conflict-free or trivially so: T11.1 (consumer CI)
   then T11.2, A1.2, T9.1, T25.1, T23.4, T14.1, T2.3, T8.3, T5.1, T21.1, T26.2, T24.1, the T1.1 ADR
   draft, and a trial `tsc` for T7.0.
5. Merging the user's #509, #511, #512 and #523 opens W2. #534 merging (ask gcranju) or the T1.1 ADR
   being accepted opens W3.

## Settled — do not re-litigate

- **Stay off #519.** Do not edit its body or comment on it from an agent (memory: stay off others'
  issues).
- **The `measurements.md` numbers are for published 2.2.0**, not `main`.
- **What-ifs are upper bounds.**
- **Precedence.** `plan-v3-order.md` and `research/*` supersede `plan-v3-scope.md` wherever they
  differ. Each research file ends with a corrections list against the scope.
- **Design decisions** (`plan-v3-order.md` §2):
  - the option is named `plugins`;
  - in 2.x, chain code stays inside the sdk, because turbo rejects an sdk ↔ chain-package cycle (probe);
  - chain packages export `.`, `./wallet` and `./server`, with **no `./react`** (wallet boundary H);
  - query-key shapes are kept;
  - no SDK lifecycle engine (decision 0003 stands);
  - the correlation id is never sent to the relay.
- **There is no team velocity.** Points use a proposed Fibonacci scale.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| **The final plan — start here** (outcome, packages, waves, issues, decisions, next steps) | `plan-v3-final.md` | 5.6k |
| What should I post on #519? | `ideas.md` §1 (ranked table) | 4.4k (whole file) |
| Which packages exist in v3, why, their dependency rules, who installs what | `plan-v3-packages.md` | 3.4k |
| In what order, who waits for whom, which files collide, what needs deciding? | `plan-v3-order.md` §1–8 | 9k (whole file) |
| Is it feasible? What's proven vs read vs unverified; capacity | `plan-v3-order.md` §10 | (same) |
| Should dapp-kit split? What does each integration install? | `plan-v3-order.md` §11 | (same) |
| A better wallet-sdk-react: lazy chain adapters, headless `createSodaxWallets` | `plan-v3-order.md` §12 | (same) |
| What each issue changes for integrators; client code before → after | `client-usage.md` (index table at the top) | 6.3k |
| The parent issues: 30 drafts with title and body, plus the 7 single-PR items | `parent-issues.md` (summary and benefit tables at the top) | 17k (whole file) |
| One sub-issue: title, points, wave, dependencies, conflicts | `plan-v3-subissues.md`; use `rg -n "^\| T1\.7 "` | 7.1k (whole file) |
| How a sub-issue is done, with `path:line` evidence | `research/{a-build-packaging,b-sdk-core-chains,c-wallet,d-dappkit-api-ai-migration}.md`; use `rg -n "^## T<n>"` first | 17–22k each |
| What was wrong in the 2026-10-14 scope? | "Corrections" section at the end of each `research/*.md` | small |
| Why each idea; v2 bugs found; open questions | `ideas.md` §2–4 | (same as §1) |
| How heavy is the SDK today, and why does tree-shaking fail? | `measurements.md` | 4.7k |
| What would v3 gain? | `measurements.md` § Projected v3 gains | (same) |
| What do peer SDKs do? | `competitors.md` | 2.3k |
| The first verified scope (superseded where it conflicts) | `plan-v3-scope.md` | 5.0k |
| Re-measure; re-run the research probes; regenerate the sub-issue table | `artifacts/bundle-baseline/`, `artifacts/v3-probes/` (`check.py`, `gen.py`, `subissues.psv`) | small |
| Source issue summary | `issue.md` | 0.5k |
| What was done in each session | `process.md` | 2.9k |

<!-- ~tok ≈ bytes / 3800 -->

## Landmines

- **v2 bugs, none posted; the user raises them:**
  - QueryClient shadowing in `EvmProvider` (fix: T9.1);
  - `useBitcoinBalance` returning `0n` on HTTP error;
  - three separate ICONEX queues, so WALLET-L-1 does not hold across modules (fix: T23.4);
  - ICON receipts typed `bigint` that are BigNumber at runtime (fix: T8.1).
- **Bundle numbers are a floor.** They stub Node builtins as external.
- **PancakeSwap's 358 MB is mostly six nested `viem@2.37.13` copies.** T5.2 drops them in 2.x; only
  the `Price` / `Token` type swap waits for 3.0.
- **The B research report still names `./react`** in the chain-package template. It is overridden; see
  the reconciliation note at the top of `research/b-sdk-core-chains.md`.
- **wagmi v3 needs viem ≥ 2.43.0 and declares TS ≥ 5.9.3.** The repo builds with TS 5.5.4. T7.0
  (TS 5.9) is verified only on `@sodax/types`; start it with a trial `tsc` of the whole repo.
- **Remote config v2 is live** (`/v2/be/config/all`, version 2020008 = 2.2.0-rc.8). The SDK's
  commented version gate would reject it for any newer SDK; product decides the policy (T20).
