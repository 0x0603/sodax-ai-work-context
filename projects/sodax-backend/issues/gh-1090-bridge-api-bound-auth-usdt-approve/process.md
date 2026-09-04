---
type: process
repo: sodax-backend
github: 1090
updated: 2026-09-04
---

# Process

## Log

### 2026-09-04 — resume after 2.5 weeks, merge onto development, absorb #1069

Opened by asking what changed under the PR. Three answers, all load-bearing, all cheap to get:
`gh pr view 975` (merged, squash), `npm view @sodax/sdk versions` (blocker gone), and
`git log c55bacf1..origin/feat/bridge-api` (~30 commits of drift the branch never saw).

## Findings

### The squash-merge merge-base trap

`faa93826` — the merge of #975 into `development` — has **one parent**. `development` therefore holds
bridge-api's *content* but none of its *history*, and `merge-base(development, PR-branch)` resolves to
`66c96a27`, from before `apps/bridge-api` existed. Measured with `git merge-tree --write-tree --name-only`:

| Merge | Conflicts |
| --- | --- |
| `origin/development` → PR branch, directly | **155** — every bridge-api file is add/add |
| `origin/development` → `origin/feat/bridge-api` (base `b5affe86`) | **2** |
| `origin/feat/bridge-api` → PR branch (base `c55bacf1`) | **4** |

The way through, given "merge, never rebase": build a throwaway branch from `origin/feat/bridge-api`,
merge `development` into it (2 conflicts, both dependency files — resolve to development's side; the
gate is that `git diff origin/development HEAD` comes back **empty**, because
`tree(faa93826) == tree(origin/feat/bridge-api)`), then merge that into the PR branch with `c55bacf1`
as a proper three-way base (4 conflicts, the real drift). Six total instead of 155.

`git merge-tree --merge-base=` needs git ≥ 2.40; Apple git 2.39.5 has only the two-argument form, which
uses the real merge base — enough for both measurements above.

### The design had been overturned upstream, and nothing said so

The single most valuable thing found: `208eaa6a` (#1069, merged 2026-08-18 — **one day after** this PR
opened) removed the fail-fast from swaps-api because it caused a production outage. The PR body is
explicit: unset `BOUND_API_*` → `buildRadfiConfig()` threw inside the CONFIG factory →
`NestFactory.create({abortOnError:true})` exited 1 → crash loop under `restart: on-failure`, taking EVM
swaps, leverage-yield, admin and the drainer down over a Bitcoin-only credential.

This PR shipped that exact fail-fast, and re-stated the "refuses to boot" contract in the same four
files #1069 had just corrected for swaps. Nothing in the PR, the issue, or the diff would have
surfaced it — it was found by diffing the copied-from file against its current state.

**Generalisable:** when a PR says "ported from X", the port's correctness expires. Diff X's current
state before landing, not X as of the port.

### An audit found three tests that could not fail

Ran an 8-dimension audit with adversarial verification (6 of 15 findings refuted). The material ones
were all of one kind — a test that passes whether or not the code works:

- Deleting `onChain` from all three build routes left the **whole suite green**. The 15s deadline was
  the headline of one of the four commits and was unasserted at the route level.
- The bigint-guard e2e put the **same object** in `approveTx` and `resetTx`, so swapping the mapping
  passed all four approve cases — while in production it would leave the allowance at zero.
- `with-timeout.spec` never covered the inner-rejection path, the one property the new `onTimeout`
  parameter could break.

**Generalisable:** the check that catches this is not reading the test, it is deleting the code and
watching for red. Cheap, and it is what separated these from the stylistic findings.

### Refuted findings worth remembering

Six were thrown out on verification, five of them for the same reason: **the property was identical on
`development`**, so the PR was being blamed for pre-existing behaviour. Always confirm a finding is in
`git diff origin/development...HEAD` before acting on it.

## Changes During Work

- The pre-commit gate blocked on `@repo/incident-manager`'s `unique_active_per_target`, which failed
  **14 consecutive runs**. Root cause: `beforeAll` never awaits the index build, so on a machine where
  the first insert wins the race the test reports a working invariant as broken. `await syncIndexes()`
  → 3/3 pass. Fixed here rather than bypassed (user's call), as its own commit.
- `lint-staged` reformatted `apps/sodax-backend-dashboard/scripts/generate-chains.mjs` when the merge
  staged it. Pre-existing formatting drift on `development`, and unavoidable — biome reformats the file
  on any commit that stages it, so the reformatted state is the fixed point.
- The working tree carried an uncommitted `@sodax/sdk` → local `.tgz` pin from the original session.
  Obsolete once `development` pinned `2.2.0-rc.2`; backed up to the scratchpad and discarded.
