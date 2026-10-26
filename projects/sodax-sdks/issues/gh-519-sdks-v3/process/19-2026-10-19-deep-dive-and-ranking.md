---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-19
updated: 2026-10-20
---

# 2026-10-19 — deep dive: feasibility, complexity, benefit (in progress)

- **Request:** research each bullet thoroughly for feasibility, complexity and benefit.
- **Method:**
  - Ten read-only agents started around 17:51, one per area, using `artifacts/deep-dive-rubric.md`.
  - Each writes `research/f-deep/<area>.md`.
- **Status at 18:15:**
  - All ten agents were still probing.
  - No report had been written yet.
  - The user said their token quota was running low.
- **Resume:**
  1. List `research/f-deep/`.
  2. Re-run only the missing areas with the rubric.
  3. Consolidate into a ranking (benefit vs complexity) and update the brief.
- **18:2x:** the user was at 95% of quota. All ten agents were told to checkpoint: write `research/f-deep/<area>.md` with `PENDING` markers and a `## Resume notes` section, then stop. Next session: finish the PENDING items only.
- **Checkpoint result:** 9 of 10 reports written (chains, dapp-kit-flows, api, sdk-runtime, dapp-kit-surface, packaging, deps, release-ci, wallet-sdk-core). `wallet-sdk-react.md` was still being written when the usage limit hit. PENDING: deps sdk-5/sdk-7 (C?/B?), plus sub-items listed in each `## Resume notes`. Next: finish PENDING, then consolidate the ranking.
- **Update:** `wallet-sdk-react.md` was written after the limit hit, so all 10 reports exist. Still PENDING: deps sdk-5/sdk-7 scores, the wsr-2 bundle measurement and the viem typecheck, plus the sub-items in each `## Resume notes`. Then consolidate the ranking.
- **18:3x, after the quota reset:** a workflow started (run `wf_42a4e4d7-93b`). It finishes PENDING items (8 areas), runs one adversarial verifier per report (10) that fixes in place and appends `## Verification`, then a ranking agent writes `research/f-deep/README.md` and a critic checks it. Resume: `Workflow({scriptPath: "~/.claude/projects/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/workflows/scripts/v3-deep-dive-finish-verify-rank-wf_42a4e4d7-93b.js", resumeFromRunId: "wf_42a4e4d7-93b"})` in the same session.
- **19:35 paused again (quota).** Finish (8) and Verify (10) completed and are cached in the run
  journal; all 10 reports have 0 PENDING and a `## Verification (2026-10-19)` section. Rank had just
  started and was stopped before writing `research/f-deep/README.md`. To resume, re-run the same
  script with `resumeFromRunId: 'wf_42a4e4d7-93b'`: the 18 finished agents return from cache, and only
  Rank and Check run live.
- **20:26 resume failed and was stopped (task `wxzq4xfwr`).** The 8 finishers and the 2 verifiers
  without a finisher (dk-surface, dk-flows) came from cache. The other 8 verifiers got new cache keys
  and started again: `verifyPrompt` embeds `JSON.stringify(fin)`, and the cached finisher result does
  not serialize the same way as the live one. They were stopped after about a minute, and no report
  file changed (all mtimes are at or before 19:32:50). **Do not resume this run again.** After the
  quota reset, run a new Rank + Check-only workflow instead. Take its rows from the first run's
  `verify:*` result entries in `journal.jsonl` (written up to line 37, before the resume), write them
  to a scratchpad file, and point the rank prompt at that file.
- **2026-10-20, after the reset:** extracted the first run's 39 verified rows (no missing IDs, no
  duplicates) to the scratchpad file `wf-rank-rows.json`. Started a Rank + Check-only workflow, run
  `wf_065b45fc-786` (task `wkushj9fd`). Neither prompt embeds another agent's output, so a resume of
  this run reuses the cache safely.
- **2026-10-20, done.** Rank + Check finished, using 2 agents and about 0.63M subagent tokens.
  `research/f-deep/README.md` ranks all 39 IDs: 11 Core, 1 Quick win, 12 Worth it, 6 Cheap DX,
  8 Defer, 1 Drop.
  - **Critic:** found 13 issues and fixed them in the README, and left 7. The lead then fixed these
    leftovers in the area files, each noted in that file's Verification section:
    - vulnerable-package counts labeled "advisories" in wallet-sdk-react.md and api.md;
    - deps.md's 137 KB method;
    - the dk-4 edge in wallet-sdk-react.md.

    The lead also removed the dangling `node` symlink from `research/f-deep/`.
  - **Lead spot-checks:** recounted the 39 IDs and recomputed every tier with a script; all match.
    dk-7 shows up as a parse mismatch only, because its split verdict is ranked on presets by design
    (README line 56). Opened 7 fix-now citations at `0181a053` with `git show` (useMMAllowance:37,
    useDexAllowance:27, shared-utils:57, swaps-api http:166-191, SodaxError:103-111,
    ConfigService:157-164, EvmProvider:27-30); all hold.
  - **Worktrees:** every sodax-sdks linked worktree is missing from disk. The user said on 2026-10-20
    that they deleted them by hand to free disk space. The landmine is in the brief.
- **2026-10-20, #519 wording.** `drafts/519-bullets.md` now holds 38 bullets; sk-4 is left out.
  - **First review (pasted by the user):** applied 9 changes. wsc-2 was kept neutral on D4.
  - **Follow-up review:** took a neutral wsc-2 wording and called the list final. D3, D4, D8, D12
    and D17 stay with the team.
  - **Chat-only corrections, nothing persisted:**
    - `require(esm)` does not need a `require` export condition; `default` or a direct mapping
      works, as long as the graph loads synchronously.
    - A rejected query function can reach an error boundary under `throwOnError` or Suspense.
- **2026-10-20, Why/How per bullet.** Workflow `wf_23308e1d-269`: 4 writers and 4 fact-checkers, about 1.69M
  subagent tokens. The result is `drafts/519-bullets-explained.md`; the checkers changed 26 of the 38
  items, and the lead made two more edits (dk-5 "reject", wsr-1 "simulation").
- **2026-10-20, libs and sdk-9.**
  - **libs `crypto` probe:** 9/9 outputs byte-identical, and the shim was never called. Recorded in
    `research/f-deep/deps.md`, with the probe in `artifacts/feasibility-probes/libs-crypto/`.
  - **sdk-9:** the user settled that config comes only from SDK releases. The bullets, the README D8
    row and the brief were updated.
- **2026-10-20, automatic per-chain testing.** The user: regressions on one chain are found by users.
  - **Run:** workflow `wf_c57fbfed-e1a`, 3 surveys + design + critic, about 1.47M subagent tokens and 67 min.
    It wrote `research/g-chain-auto-tests.md`.
  - **Lead spot-checks:**
    - The e2e job runs on PRs only, with `continue-on-error: true` on the suite step (`ci.yml:258-300`).
    - The hub simulation exists in `SpokeService.ts` (12 hits).
    - `polygon-rpc.com` returned HTTP 401 from this machine.
    - The backend has Discord and Telegram alert config.
  - **No commit and no posting.**
- **2026-10-20, plan update.**
  - x-6 (automatic per-chain checks) is added to `drafts/519-bullets.md` and the explained version, so
    there are now 39 bullets.
  - `plan-v3-final.md` gets "§0 Update (2026-10-20)", a new status line and a new next-step 1.
- **2026-10-20, sdk-9 dropped.** The user asked whether sdk-9 could go. Recommended yes:
  - under SDK-only config there is no gain, and the item is C5 risk;
  - #543 already tracks the opt-in feature.

  It is removed from both drafts (now 38 bullets), and the plan §0, the README D8 row and the brief are
  updated.
- **2026-10-20, sdk-9 cleanup.** The README still listed sdk-9 as live in four places. The ranking row,
  the tier summary and the one-line wording now say "Dropped 2026-10-20 (D8)", and waves 3 and 4 no
  longer carry it. The other README mentions are research history and stay as they are.
- **2026-10-20, `@sodax/sdk` section into the #519 body.** The user asked for the nine `@sodax/sdk`
  bullets with a `[Sang]` prefix, first as a comment, then as an edit in the body instead.
  - They replaced the user's six `**[SANG]**` items (body lines 10-15) as a numbered list, each item
    prefixed `[Sang]:`. Backticks were kept from the draft, so `<name>` survives and `@sodax/...` is no
    mention.
  - The rest of R0bi7's body is byte-identical: a diff before the PATCH showed only those lines, the
    PATCH ran only after `updated_at` was unchanged since the read, and the live body matches the
    intended one. GitHub renders 9 items, no mentions and no links.
  - The drafts now use `[Sang]:`. The six replaced items, for the record:

    ```text
    1. **[SANG]**: Keep the Sonic hub and EVM support in core. Make every non-EVM chain an opt-in @sodax/chain-<name> package, with @sodax/chains-all for full-chain integrations.
    2. **[SANG]**: Publish unbundled ESM with per-feature entry points and no import-time side effects, so unused features and chain implementations can be excluded from application bundles.
    3. **[SANG]**: Publish ESM-only packages. Declare viem, wagmi and @tanstack/react-query as peer dependencies in the packages that use them, with tested compatibility ranges
    4. **[SANG]**: Replace the PancakeSwap SDK dependencies with vendored CL math and encoders we actually use, reducing install size, transitive advisories and duplicate viem installations
    5. **[SANG]**: Lighter chain libraries: use Stellar's minimal entry point, replace ICON SDK reads and transaction building with a small JSON-RPC client, and encode Solana instructions without fetching the Anchor IDL at runtime
    6. **[SANG]**: Add per-feature entry points (@sodax/sdk/swap, @sodax/sdk/money-market, …) built on a shared core, so apps can import and initialize only the features they need. Keep the Sodax facade for convenience
    ```
