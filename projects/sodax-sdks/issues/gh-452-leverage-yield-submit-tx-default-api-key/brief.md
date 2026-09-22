---
type: brief
repo: sodax-sdks
github: 452
status: In review — PR 475, unverified against a funded run
next: Run gh-450 tier 3 F07/F08 with the demo toggle ON — CI is green and both review rounds are answered, so the funded run is the only thing left holding the flip
updated: 2026-09-22
tags: [leverage-yield, leverage-yield-api, submit-tx, detailed-status, api-key, dapp-kit, demo, docs, skills]
related_issues: [gh-453, gh-450]
---

# GH-452 Leverage Yield Submit Tx Default Api Key · brief

**Entry point. Read this, then open exactly one row from the map.**

## State in five lines

All seven steps of `plan.md` are **implemented** and open as **PR #475** — 13 signed commits, on
`feat/452-leverage-yield-submit-tx` off `main` @ `ae857f57` (worktree `sodax-sdks-452`), head
`75165b62`. #468 merged mid-session, so the branch was rebuilt off the merged `main`; the first
attempt (`feat/452-leverage-yield-submit-tx-default`, 4 commits) is stale and unused. **CI is green,
20/20**, measured on `844535b8`. Local gates too: 2902 sdk + 814 dapp-kit tests, `checkTs` across the
workspace and the demo, `check:ai`, `docs:sync-pages`, all three docs checks. Two bot review rounds
came and were answered (§ Session 4 in `process.md`). The default **is flipped** — decided on the
precedent that bridge shipped its ON default three days after its backend path existed, with no
verification run (§ Settled 3). What is still missing is the funded run itself.

| Step | State |
| ---- | ----- |
| 0: branch | done — rebuilt off merged `main`, PR #475 |
| 1: demo settings row + kill the wrong local checkbox | done |
| 2: funded run (gh-450 tier 3 F07/F08) — the gate | **not started** |
| 3: flip the default + tests | done |
| 4: `extras.apiKey` | done |
| 5: `LeverageYieldService.getDetailedStatus` | done |
| 6: `useLeverageYieldDetailedStatus` + `hooks/shared/solverStatusPolicy.ts` | done |
| 7: docs + skills | done |
| 8 (unplanned): rejected-key stop, to match swap/bridge | done — `5dcd962d` |
| 9 (unplanned): undo the accidental `getIntentStatus` change | done — `c98af612` |
| 10 (unplanned): self-review cleanup — drop the shim, key both legs | done — `c1ffca21` |
| 11 (review 1): key the durable-intent reconcile leg too | done — `844535b8` |
| 12 (review 2): the unmirrored API reference still said opt-in | done — `a27d9a14` |
| 13 (unplanned): demo order cards read the status router | done — `d3b106d3` |
| 14 (unplanned): re-baseline the SDK tarball gate | done — `c02fe1e4` |
| 15 (unplanned): LY API host + per-action key rows in demo settings | done — `8073ecf7` |
| 16 (unplanned): stop showing the deployment API key in the modal | done — `75165b62` |

## Blocked on

1. **The funded run.** Not a blocker for the code, which is finished — a blocker for *claiming* the
   flip is safe. gh-450 tier 3 F07/F08: an EVM-spoke deposit and withdraw through
   `submit-tx → relay → postExecution → getStatus → solved`. Step 1 unblocked it; the demo now has a
   Leverage Yield SDK submit-tx row in Sodax Settings.
2. ~~#468 must merge first~~ — it merged 2026-09-21 08:28 as a squash (`ae857f57`). Branch rebuilt
   on top of it; the superseded `feat/452-leverage-yield-submit-tx-default` is deleted, locally and
   on origin, after checking every one of its four commits had a counterpart on the new branch.

## Next action

Run gh-450 tier 3 (F00 prereqs first — `apps/demo/.env` points swaps at a dead `localhost:3108`). CI
is green and both reviews are answered; nothing else blocks. If the flip turns out to be wrong,
revert `ec2b388d` — it is the only commit that carries it, and the others stand without it.

## Settled — do not re-litigate

1. **No `sodax-backend` work.** `leverage-yield.service.ts:365-379` calls
   `swapsService.submitTx(swapDto, operation)`; `operation` is a `$setOnInsert` row tag with no worker
   branching on it. Same `stateful_submit_swap_tx_v2` pipeline swaps runs with default ON in
   production. Evidence in `process.md` § Findings.
2. **#468 is a dependency, not a parallel effort.** It already shipped `resolveDeliveredPacket`, moved
   `DETAILED_STATUS_NOT_DELIVERED` + `isBackendSubmitTxAbandoned` into
   `backendApi/detailedStatusRouting.ts`, migrated swap onto it, and extracted the poll budget into
   `hooks/shared/notFoundStreak.ts`. gh-453's brief names #452 as the anticipated third consumer.
3. **The flip needs no bedding-in period, because neither swap nor bridge had one.** `#362`
   (2026-08-09) defaulted both ON in a single commit — and *created* `runBackendSubmitTx` /
   `submitTxAttempt` in that same commit, so bridge's path was 3 days old (`#261`, 2026-08-06). PR
   #362's body contains no verification evidence at all; its whole argument is "on any backend
   non-success, the SDK automatically falls back to the client-side relay". Same author as #452. One
   revert (`b66725de`) was a same-day review catch, re-landed with a timeout fix; nothing since has
   turned a default back off. So `ConfigService`'s "opt-in while it beds in" comment was one person's
   caution, not a policy this repo follows.
4. **No 401/403-terminal arm.** `GET /leverage-yield/submit-tx/status` declares no scope
   (`leverage-yield.controller.ts:558`), unlike bridge's `bridge:read`. LY is swap-shaped here.
   Separately: `POST /leverage-yield/submit-tx` declares `swaps:write`, but **declaring a scope is
   not the same as enforcing it** — see Landmines. Do not write "requires a key" as present tense.
5. **LY's arms are `backend | solver`**, not bridge's terminal `relay` — a vault swap IS a solver
   intent (`terminalStatus: 'solved'`). So the swap refetch policy applies unchanged, and it was
   moved to `hooks/shared/solverStatusPolicy.ts` rather than copied: `hooks/` has no cross-feature
   imports anywhere, and swap's 33 cases passed unedited across the move.
6. **No new `getStatus`.** `getIntentStatus` and `getDetailedStatus` both go through one private
   `resolveSolverStatus`, which also carries the durable-intent reconcile.
7. **The reconcile does apply to leverage yield** — `createVaultIntent` builds through the same
   `EvmSolverService.constructCreateIntentData` a swap does, so the intent lands on the same hub
   Intents contract, and `intent_journal` is fed by that contract's events. Positions too:
   `reportPositionIntent` notifies through the same `notifySolver({ intent_tx_hash })`. But it is
   wired to `getDetailedStatus` **only** — see Landmines.
8. **Position flows are out of scope** — they never touch submit-tx; the body admits only
   `deposit|withdraw`.
9. **`partnerFee` / `hubWalletSwap` stay intersected at the alias site**, not moved into `extras`.
10. **No follow-up issue for the deferred LY e2e pin** — defer in-source, same fixture gap as gh-453
    Step 5.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What do I build, in what order, with which citations and snippets? | `plan.md` | 6.2k |
| The issue body verbatim + acceptance criteria | `issue.md` | 2.1k |
| What was verified, what the draft plan got wrong, the implementation session, the backend probe, the two review rounds | `process.md` | 5.0k |
| What shipped, file by file, and the suggested commit split | `outcome.md` | 1.0k |

## Landmines

- **The issue body's "AI suggestions" block is stale in two places.** It predates #468: it tells you
  to re-derive the relay leg and to generalise `getSwapStatusRefetchInterval.ts`. Both are done.
- **Line numbers here and in `plan.md` were stamped at `origin/main` @ `898b7e6a` (2026-09-21)** and
  at `origin/fix/453-bridge-api-auth-retry` @ `444c736e`. The #468 branch's own base was `b5aaca0e`,
  so its citations predate two `main` commits. Re-stamp before trusting one.
- **Never re-export `DETAILED_STATUS_NOT_DELIVERED` from `leverageYield/index.ts`** — swap's barrel
  already publishes it and the root barrel is a flat `export *`. Same for exporting anything from
  `backendApi/index.ts`, which is a curated barrel.
- **`LeverageYieldLookupError` is not a substitute** for a prefixed detailed-status alias: it admits
  `VALIDATION_FAILED` / `UNKNOWN` too. And there is no *type* collision with swap's
  `DetailedStatusError` — both are `SodaxError<Extract<SodaxErrorCode,'LOOKUP_FAILED'>>`. The barrel
  is the constraint, not the type.
- **`LeverageYieldService.test.ts`'s module-level instance is load-bearing** for every client-side
  assertion in a 139 KB file. It is now pinned to `{ useBackendSubmitTx: false }`; a second instance,
  `sodaxDefaults`, is what the default assertions read. Do not "tidy" the pin away.
- **`hooks/shared/solverStatusPolicy.ts` is shared by swap and leverage yield.** Changing it moves
  both. Swap's `getSwapStatusRefetchInterval.ts` is now a thin named face over it and keeps swap's
  import site; run `src/hooks/swap` after touching either.
- **dapp-kit resolves `@sodax/sdk` from `dist/`** — an SDK source change is invisible to
  `pnpm --filter @sodax/dapp-kit checkTs` until the sdk package is rebuilt.
- **`hooks/swap/getSwapStatusRefetchInterval.ts` no longer exists.** The polling policy is
  `hooks/shared/solverStatusPolicy.ts`, imported directly by `useStatus`, `useDetailedStatus` and
  the leverage-yield hook. Do not reintroduce a swap-named face over it — it was tried and deleted.
- **Do not fold `getIntentStatus` into the reconciling solver read.** It was done once for tidiness
  and reverted in `c98af612`: the reconcile adds a round trip on every `NOT_FOUND` and turns a
  `NOT_FOUND` behind an unreadable backend into an error. No in-repo caller, so tests stay green and
  it lands on an external consumer instead. `solverStatus` is the plain read; `resolveSolverStatus`
  is the reconciling one, and only `getDetailedStatus` uses it.
- **Branching off an unmerged PR branch costs twice.** #468 squash-merged mid-session, so the
  original 3 commits stayed on the branch and a PR would have claimed 69 files. Worse, #468 kept
  changing during review *after* the copy: `main` gained a rejected-key stop in the very module this
  work moved to `hooks/shared/`, plus an auth arm in `SwapService`. Diff the base against `main`
  before assuming a cherry-pick is mechanical.
- **A new branch off a moved `main` needs `pnpm i` again.** The pre-commit hook failed in
  `wallet-sdk-core`, a package untouched here, because `main` had bumped deps.
- **A declared `@RequireApiKey` scope is not enforcement.** `ApiKeyGuard` has three modes and only
  `enforce` rejects; `API_KEY_ENFORCEMENT` defaults to `'off'`
  (`apps/swaps-api/src/config/configuration.ts:77`). Probed 2026-09-21: an unkeyed
  `POST /v1/leverage-yield/submit-tx` on `api.sodax.com` returns **400 validation**, not 401 — and
  `/v1/swaps/submit-tx` behaves identically. A first draft of this PR's docs asserted the 401 as
  current fact and had to be corrected in four places. Re-probe before restating it.
- **`packages/sdk/docs/LEVERAGE_YIELD_API.md` is unmirrored, so no gate reads it.** It sits in
  `scripts/docs-pages-map.json` § `unpublished`; `check:docs-pages` / `check:doc-links` only walk
  published pages. The flip updated `CONFIGURE_SDK.md`, `LEVERAGE_YIELD.md` and the skills pages and
  left this one saying "opt in … default OFF" for two review rounds. Hand-carry it on any behaviour
  change; the same applies to the other pages in that list.
- **The demo's status cards are not uniform.** `/leverage-yield` reads
  `useLeverageYieldDetailedStatus` (source-tx keyed, covers the relay fallback); `/swaps-sdk` and
  `/swaps-api` still use the local `hooks/useSolverStatus.ts` fetch and `useSwapsApiSubmitTxStatus`.
  `OrderStatus`'s `feature` prop picks; an order whose `statusEndpoint` is not the current env falls
  back to the solver poll on purpose. Don't "unify" without keeping that pin.
- **The SDK tarball gate trips on accumulated growth, not on one PR.** `ci.yml` pins
  `SODAX_SDK_TARBALL_BASELINE_BYTES` with a 5% tolerance; `main` had drifted 4.2% into it, so this
  branch's ~11 KB of feature dist pushed the merge ref 1587 B over while `main` alone still passed.
  The step's own comment says to refresh the baseline on a deliberate increase — do that (`c02fe1e4`
  set it to 1000000 against a measured 999087 B), and re-measure rather than raise the tolerance.
- **A `VITE_` var is in the public bundle, so the demo's API key was never secret** — but it was
  being *displayed*: the settings modal seeded the key row from `VITE_SODAX_API_KEY` and put it in
  the reset button's `title`. `75165b62` starts the row empty and adds a `secret` mode to `TextRow`.
  Anything key-shaped added to that modal needs `secret`, and its default must stay `''`.
- **`main` has Biome drift** — format only the files you touched, never a blanket `pnpm pretty`.
- **Fresh worktree needs `pnpm i && pnpm build:packages`** before the first commit, or the pre-commit
  hook fails on unrelated packages. `TURBO_CONCURRENCY=2`.
