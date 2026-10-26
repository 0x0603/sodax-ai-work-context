---
type: brief
repo: sodax-sdks
github: 519
status: Active
next: fix the review-2026-10-21.md findings before committing the 2026-10-20 edits; #519 @sodax/sdk section is in the body (2026-10-20); the user posts the other sections from drafts/519-bullets.md. Deep dive done (research/f-deep/README.md: ranking, 22 fix-now defects, D1-D19). The user takes D1-D19 to the team, with D3, D4, D8, D12 and D17 flagged by the review; then convert the W1 drafts to the spec → plan → PR workflow
updated: 2026-10-21
tags: [v3, idea-capture, lightweight, bundle-size, architecture, what-if, order, sub-issues, deep-dive, ranking]
related_issues: [gh-302, gh-456, gh-505, gh-507, gh-529, gh-531, gh-532, gh-533]
---

# GH-519 SDKs v3 · brief

**Entry point. Read this, then open exactly one row from the map.**

## State

#519 is R0bi7's idea-capture board for v3: bullets per package, name prefix, details later. On
2026-10-19 the user added six `**[SANG]**` bullets under `@sodax/sdk` to its body. On 2026-10-20 those
six were replaced by the nine settled `@sodax/sdk` bullets, numbered and prefixed `[Sang]:`; the other
sections are still `TODO`.

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

**2026-10-19: the issue workflow changed under the drafts.** R0bi7 merged a spec → plan → PR
workflow on 2026-10-18 (#537, #542, #544; `.github/issue-workflow.md`):
- The issue body is an outcome-only **spec** (Goal / Requirements / Non-goals / Constraints /
  Acceptance criteria / Context). No internal class, file or mechanism names.
- An **epic** body is Goal / Non-goals / Exit criteria; its native sub-issues are its plan; no
  checklist in the body.
- The **plan** is one `<!-- sodax:plan -->` comment (Approach / Packages / Steps / Dependencies /
  Verification / Risks). A human applies `plan-approved`, or `no-plan` for docs, dep bumps, release
  chores and one-file fixes. Agents implement only with one of the two labels.
- The plan check is advisory; `PLAN_ENFORCE` is unset as of 2026-10-19.

Effect on this plan:
- `parent-issues.md` predates the workflow. Its "Plan." paragraphs and sub-issue checklists do not
  fit the templates. Mechanism moves to plan comments, which `research/*` already holds.
- "W1 can start now" now means spec → plan comment → human approval → PR, per sub-issue.
- File the epics and the W1 specs only. File later-wave specs when their gate opens; a spec filed
  months early goes stale, and every material edit forces re-approval.

**R0bi7's pre-v3 epic.** #535 `feat(sdks): pre v3 scope` (2026-10-16) holds the work to finish before
v3. Its sub-issues are the first specs in the new format: #536 (closed), #540, #541 and #543. Three
of them overlap this plan:
- **#541 is Tron** (implementation #534). It matches the ordering anchor.
- **#540 brings atomic approve + action to every feature.** It pulls T31.1 forward from Later. It
  also overlaps the user's #512 (bridge, vaults) and wants one shared batch helper; the overlap is
  not checked against the #511/#512 code yet.
- **#543 is `initialize()` loading live config, i.e. T20.1.** R0bi7's four open questions are
  `plan-v3-final.md` decision 6 (answers in `research/b-sdk-core-chains.md` § T20).
  - His AC1 wants a remote contract address to take effect, which contradicts our trust-boundary
    advice.
  - His "blocked" probe missed the `/be/` segment. `https://api.sodax.com/v2/be/config/all` returned
    200 on 2026-10-19 (version 2020008, 22 chains); `/v2/config/all` is 404.

`main` moved cc053fef → 0181a053, CI/docs/deps only (#525, #530, #537, #538, #542, #544). No `src`
evidence in `research/*` is affected. #509, #511, #512, #523, #534, #483, #501, #488 are still open.

**2026-10-19: feasibility of the user's 39 bullets** (`research/e-519-bullet-feasibility.md`). Eight
read-only agents checked each bullet as worded at `0181a053`, plus consumers. The load-bearing claims
were re-checked by hand.
- **Verdicts:** 5 feasible, 27 with caveats, 6 need a decision, 1 premise wrong (sk-4: no shared MCP
  schemas exist yet).
- **Evidence level:**
  - Verified: bugs, spot-checks and probe results within their scope. A second review re-ran these on
    2026-10-19.
  - Design judgement: verdicts, sizes and wording.
- **New and important:**
  - the PancakeSwap v3/infinity SDKs ship a GPL-3.0 `LICENSE` despite MIT in `package.json`, so T5
    must not vendor from that dist until provenance is settled;
  - wallet read methods are called by sodax-frontend and whitelabel;
  - the 2.x backport path would move npm `latest` back after 3.0;
  - MM, staking, migration and DEX drop `srcTxHash` on relay errors.
- **Correction:** #540, #541 and #543 were authored by R0bi7 but are **assigned to the user** (#541 with
  gcranju).

No agent posted anything and no icon-project code changed. The user edited #519 themselves.

- **Deep dive, finished 2026-10-20** (`research/f-deep/`): ten area reports, each adversarially
  verified, plus `README.md`, the ranking, which a critic re-checked.
  - Tiers, computed by script: 11 Core, 1 Quick win (sk-1), 12 Worth it, 6 Cheap DX, 8 Defer and
    1 Drop (sk-4). dk-7 is ranked on its presets half.
  - Also in the README:
    - 22 fix-now defects in today's code: 20 in sodax-sdks, 1 in sodax-backend and 1 in
      sodax-frontend, 2 of them latent;
    - team decisions D1-D19;
    - dependency waves;
    - one-line wording per ID.
  - Weak spots:
    - five Core IDs reach B4 only on judgement or in combination: sk-2, sdk-2, x-2, x-3, dk-2;
    - never measured: a Next.js build of the real apps, browser runtime cost, all Core changes in
      one app, and persona sizes.
  - Changes from the first pass:
    - the srcTxHash drops are 32 post-broadcast exits, 24 of them additive in 2.x;
    - wsr-2's "−15 advisories" is 15 vulnerable packages and 1 distinct advisory.

## Next action

**First:** fix the findings in `review-2026-10-21.md` (a review of the uncommitted 2026-10-20 edits:
38 confirmed, 3 plausible) before committing them. Some items below are stale themselves: item 1
(V06), item 5 (V10), item 7 (V02).

All in `plan-v3-final.md`:

1. The user takes the §6 decisions to the team, 1–4 first: the delivery model, the chain-PR cutoff,
   the package-map ADR and the wallet-sdk-react design. The §7 asks go to gcranju, R0bi7,
   Prabinbaral77 and 0xmilktea.
2. The user posts the bullets on #519 (wording: `drafts/519-bullets.md`, which supersedes `drafts/519-input.md`): bullets per package, no details, each prefixed
   `[Sang]:` (the user's choice on 2026-10-20). The `@sodax/sdk` section went into the body on
   2026-10-20. It replaces `ideas.md` §1, which is too detailed for what #519 asks. The T1 epic draft
   waits until the team turns the bullets into issues.
3. Filing issues is the team's call: #519 is R0bi7's board, and R0bi7 said the team will turn it into
   sub-tasks later. Ask R0bi7 two things first: does #519 become the v3 root epic, and are one-PR
   specs (162 approvals over the plan) the granularity the new workflow wants?
4. **Style, set by the user on 2026-10-19:** file epics first and sub-issues later. An epic is the
   goal plus the client code an integrator will write, in short plain wording. The template headings
   stay (the board needs them); no bold lead-ins, tables or `path:line` inside. R0bi7's rule: every
   input starts with the author's name so a shared thread shows who wrote what. The user's prefix is
   `[Sang]:` since 2026-10-20 (it was `0x0603:`; superseded files such as `ideas.md` and
   `drafts/519-input.md` keep the old one). Sample:
   `drafts/t1-chain-plugins.md`. Once the user approves it, write the other epics the same way.
5. **Convert the W1 batch to the new format** (agent work, context repo only): the 12 epics W1
   touches (A1, T1, T2, T5, T7, T8, T11, T14, T21, T23, T24, T26) as epic bodies, the 15 W1 items as
   specs, and a draft plan comment for each from its `research/*` section. `no-plan` candidates for
   the human to judge: T1.1 (docs), T7.0 (dep bump), T9.1 and T14.1 (one-file fixes).
6. Then W1 runs per item: T11.1 (consumer CI) then T11.2, A1.1–A1.3, T9.1, T25.1, T23.4, T14.1,
   T2.3, T8.3, T5.1, T10.1, T21.1, T26.2, T24.1, the T1.1 ADR, and a trial `tsc` for T7.0.
7. Merging the user's #509, #511, #512 and #523 opens W2. #534 merging (ask gcranju) or the T1.1 ADR
   being accepted opens W3.

## Settled — do not re-litigate

- **Config source (the user, 2026-10-20):** config and token lists come only from SDK releases, because
  everything goes through the SDK in SODAX's design.
  - So sdk-9 is dropped from the v3 list.
  - Remote config stays an opt-in 2.x feature inside #543, which settles its own version rule and
    trusted fields.
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
| What is wrong in the uncommitted 2026-10-20 edits? 41 findings (V01–V40, S1; 38 confirmed, 3 plausible), grouped, with a fix plan and the user's open decisions | `review-2026-10-21.md` | 4.7k |
| What should I post on #519? | `drafts/519-bullets.md`: 38 paste-ready bullets with the `[Sang]:` prefix, settled on 2026-10-20 after two reviews; the nine `@sodax/sdk` ones went into the #519 body that day. It shortens `research/f-deep/README.md` § One-line wording and supersedes `research/e-519-bullet-feasibility.md` § Revised wording and `drafts/519-input.md` | 1.4k |
| The #519 bullets with a short Why and How under each | `drafts/519-bullets-explained.md` (2026-10-20, fact-checked against `research/f-deep/`) | 5.4k |
| **Can SODAX test every chain automatically?** Layers L0-L5, per-chain matrix, rollout, a #519 bullet | `research/g-chain-auto-tests.md` (2026-10-20; written by a workflow, then fixed by a critic pass) | 12.6k |
| **Which v3 issues are worth it, and in what order?** Tiers, fix-now defects, dependency waves, team decisions D1-D19 | `research/f-deep/README.md`; run `rg -n "^## "` first | 15k |
| Evidence behind one issue's scores: PR breakdown, probes, verification | `research/f-deep/<area>.md` (the README table names the file); run `rg -n "^## "` first | 12-21k each |
| **Is each #519 bullet feasible as worded?** Verdicts, team decisions, real bugs today, corrections to A–D | `research/e-519-bullet-feasibility.md` (first pass; `research/f-deep/` supersedes it where they differ) | 5.3k |
| Which packages exist in v3, why, their dependency rules, who installs what | `plan-v3-packages.md` | 3.4k |
| In what order, who waits for whom, which files collide, what needs deciding? | `plan-v3-order.md` §1–8 | 9k (whole file) |
| Is it feasible? What's proven vs read vs unverified; capacity | `plan-v3-order.md` §10 | (same) |
| Should dapp-kit split? What does each integration install? | `plan-v3-order.md` §11 | (same) |
| A better wallet-sdk-react: lazy chain adapters, headless `createSodaxWallets` | `plan-v3-order.md` §12 | (same) |
| What each issue changes for integrators; client code before → after | `client-usage.md` (index table at the top) | 6.3k |
| The parent issues: 30 drafts with title and body, plus the 7 single-PR items (**pre-2026-10-18 format**; titles and outcomes still valid, bodies need the new templates) | `parent-issues.md` (summary and benefit tables at the top) | 17k (whole file) |
| **Epic drafts in the user's style** (goal + client code, plain wording, sub-issues later). T1 is the sample | `drafts/t1-chain-plugins.md` | 0.6k |
| How issues must be written now (spec / epic / plan comment / labels) | `sodax-sdks/.github/issue-workflow.md` on `main` | 2k |
| One sub-issue: title, points, wave, dependencies, conflicts | `plan-v3-subissues.md`; use `rg -n "^\| T1\.7 "` | 7.1k (whole file) |
| How a sub-issue is done, with `path:line` evidence | `research/{a-build-packaging,b-sdk-core-chains,c-wallet,d-dappkit-api-ai-migration}.md`; use `rg -n "^## T<n>"` first | 17–22k each |
| What was wrong in the 2026-10-14 scope? | "Corrections" section at the end of each `research/*.md` | small |
| Why each idea; v2 bugs found; open questions | `ideas.md` §2–4 | (same as §1) |
| How heavy is the SDK today, and why does tree-shaking fail? | `measurements.md` | 4.7k |
| What would v3 gain? | `measurements.md` § Projected v3 gains | (same) |
| What do peer SDKs do? | `competitors.md` | 2.3k |
| The first verified scope (superseded where it conflicts) | `plan-v3-scope.md` | 5.0k |
| Is T2 (unbundled ESM) proven? Diff, SSR / Next 16 results, bundle numbers | `artifacts/t2-probe/README.md` | 0.8k |
| Re-measure; re-run the research probes; regenerate the sub-issue table | `artifacts/bundle-baseline/`, `artifacts/v3-probes/` (`check.py`, `gen.py`, `subissues.psv`) | small |
| Source issue summary | `issue.md` | 0.5k |
| Byte-equality probes (ICON signing, Solana instructions), browser-globals and packaging scans | `artifacts/feasibility-probes/` | small |
| What was done in each session | `process.md` (index), then one file in `process/` | 1k |

<!-- ~tok ≈ bytes / 3800 -->

## Landmines

- **#540 and #543 are authored by R0bi7 and assigned to the user.** Answers to #543's open questions
  and the #512 overlap go through the user. No agent comments without the user's say-so in that
  message.
- **Do not vendor T5 code from the PancakeSwap dist** until per-file provenance is settled (legal call).
  Its `LICENSE` is GPL-3.0 while `package.json` says MIT. Uniswap's MIT v3-sdk and the contract ABIs
  avoid the question.
- **T3.9 lazy chain adapters is unproven.** In the current design EVM, Solana and Sui wrap the app in
  providers, so lazy-loading them needs a redesign and a prototype. Connect-time SDKs can load lazily
  today (`research/e-519-bullet-feasibility.md`, wsr-1).
- **The sodax-sdks linked worktrees are gone.** The user deleted all 11 by hand on 2026-10-19 to free
  disk space, `sodax-sdks-v3feas` and `sodax-sdks-t2probe` included. Git lists them as prunable until
  `git worktree prune` runs. Read code at the research commit with `git show 0181a053:<path>` in the
  main checkout. The probes in `artifacts/feasibility-probes/packaging/` hard-code t2probe paths, so
  re-running them needs a new checkout.
- **npm rejects `v2` and `2.x` as dist-tags.** Use `v2-latest`; A1.1 in research A is wrong on this.

- **Do not paste `parent-issues.md` bodies as-is.** They break the spec rules from #542
  (mechanism, class names, checklists). Agents never apply `plan-approved` or `no-plan`.

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
