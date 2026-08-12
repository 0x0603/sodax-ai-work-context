# My open PRs — state snapshot, 2026-08-11/12

Derived while triaging the assigned issues that have **no** PR. Out of scope to act on that
night, but expensive to re-derive, so it is parked here. **Treat every line as of 2026-08-12
and re-check before acting.**

Nine open PRs across four repos, all authored by `0x0603`.

## The short version

| PR | repo | issue | behind/ahead | merge | changeset | what actually blocks it |
| --- | --- | --- | --- | --- | --- | --- |
| [#232](https://github.com/icon-project/sodax-sdks/pull/232) | sdks | 304 | 57 / 1 | **clean** | n/a | **nothing — merge it** |
| [#1050](https://github.com/icon-project/sodax-backend/pull/1050) | backend | 1049 | — | **CLEAN** | n/a | **nothing — merge it**; but issue #1049 also needs an out-of-repo config change |
| [#367](https://github.com/icon-project/sodax-sdks/pull/367) | sdks | 358 | 0 / 14 | clean, BLOCKED | present | 1 approval + the author's own manual browser pass |
| [#365](https://github.com/icon-project/sodax-sdks/pull/365) | sdks | 353 | 6 / 2 | clean, BLOCKED | present | 1 approval |
| [#1059](https://github.com/icon-project/sodax-backend/pull/1059) | backend | 1058 | 0 / 4 | BLOCKED | n/a | 1 approval; one Low finding open |
| [#279](https://github.com/icon-project/sodax-sdks/pull/279) | sdks | 265 | 16 / 4 | **3 conflicts** | `no-changeset` | 3 unaddressed findings + a CHANGES_REQUESTED to dismiss |
| [#311](https://github.com/icon-project/sodax-sdks/pull/311) | sdks | 310 | 25 / 4 | **5 conflicts** | **missing** | conflicts, changeset, 1 doc finding, 1 approval |
| [#333](https://github.com/icon-project/sodax-sdks/pull/333) | sdks | doc#23 | 13 / 11 | **2 conflicts** | present | draft; pairs with sodax-document#26 |
| [#975](https://github.com/icon-project/sodax-backend/pull/975) | backend | 268 | 5 / 17 | **2 conflicts** | n/a | conflicts + 3 open decisions + 1 approval |
| [#308](https://github.com/icon-project/sodax-sdks/pull/308) | sdks | 305 | 26 / 50 | **30 conflicts** | **missing** | draft; parent #261 merged independently |

## The three findings worth acting on first

**#232 is already done and nobody noticed.** Its "Validate PR title" check shows red in the
rollup, but that is **stale runs**: the failures were `validateSingleCommitMatchesPrTitle` —
the PR title didn't match its single commit's subject. The title was edited 2026-07-30 and the
check has passed since (`Validate PR title  pass  6s`). It is APPROVED by 0xmilktea, merges
cleanly despite being 57 commits behind, and touches no published package so no changeset is
needed. **One click from closing #304.**

**#311 and #308 are both missing a required changeset, and CI will not tell you.** The
`Require a changeset for published packages` workflow reads
`BASE_SHA = pull_request.base.sha`. Both branches forked **before** `c853100e` (the commit that
introduced `.changeset/`), so `main`'s own changeset files register as "added" in the diff and
the gate **false-passes**. #311 shows a green check with no changeset at all; #308's check
never ran (its last push predates the workflow). Both touch `packages/sdk`, `types`, `dapp-kit`
and `skills`.

**#308's parent merged out from under it.** It is stacked on `feat/bridge-api-v2` (#261), which
merged to `main` on 2026-08-05. Most of its **30 conflicts** are add/add against its own
parent's now-landed files. The resolution is de-duplication against `main`, not a merge.
Note the changeset-check regex `^packages/(types|libs|swaps-api|wallet-sdk-core|sdk|wallet-sdk-react|dapp-kit|skills)/`
does **not** list `bridge-api`, so the new package alone would not trip the gate.

## Per-PR notes

### sodax-backend

**#1059** (zkLogin) — checks green, 0 behind, **zero reviews of any kind**; BLOCKED is purely
the 1-approval ruleset. One Low finding open and **not** addressed on the branch: every
field-level GraphQL failure is classified as an invalid signature
(`packages/shared-utils/src/utils/sui-zklogin-verifier.ts:90`), so a verifier outage rejects
legitimate registrations without emitting the warning meant to expose it. Fails closed, so it
does not block merge. Author posted live round-trip evidence against the reported account.

**#1050** (Sui RPC docs) — 1 file, APPROVED, CLEAN. Merge it. **But issue #1049 is not closed
by it**: scope item (a) is setting `rpcConfig.sui.rpc_url` in each **deployed** environment,
and there is no `RPC_CONFIG` value anywhere in the repo — `docker-compose.yml:216` passes it
through and `.env-example` has it commented out with no `sui` key. Deployment env lives in
**Coolify**. So (a) is an ops action, out-of-band.

**#975** (bridge-api) — conflicts are only `.env-example` (both sides insert at the same
anchor; keep both blocks) and `pnpm-lock.yaml` (regenerate — `development` moved the catalog to
`@sodax/sdk 2.1.0-rc.3` while the branch self-pins `apps/bridge-api` at rc.2). Three open
decisions waiting on a maintainer: admin-surface tests (author offered to add them), the
undefaulted `BRIDGE_API_PORT` in compose, and a pre-existing `$setOnInsert` ownership issue the
author declined with reasons. The last dual-agent review is `Partial`, targets a stale commit,
and asks for a re-run.

### sodax-sdks

**#367** (Sui gRPC) — 0 behind, all 13 checks green, no review threads, changeset present
(8 packages, **major**). Two `@claude` findings were fixed in `34f26f4`. The author's own
stated gate remains: *"the manual browser pass with a real wallet extension is still
outstanding and still a merge gate."*

**#365** (AI drift check) — green, no threads, changeset present. The gate declining to audit
its own PR is **by design**, and the author posted a local dry-run as a rendering preview. Only
open item is an approval. Post-merge, someone has to set the `AI_DRIFT_ENFORCE` repo variable —
the check is `continue-on-error` until then.

**#279** (docs) — round 1's four findings were fixed and independently verified. **Round 2's
three are still present on the branch** (head is the exact commit that review audited):
`RELAYER_API_ENDPOINTS.md:3` and `:29` relay error-handling guidance, the duplicated
`RelayAndWaitParams` at `:204` missing `OnDemandRelayData`/`pollTxHash`, and `SWAPS.md:277` /
`DEX.md:4` listing only two of the three stable relay strings (`RELAY_POLLING_FAILED` is
missing). Plus 3 file conflicts and R0bi7's CHANGES_REQUESTED to clear.

**#311** (chain-agnostic balances) — the earlier should-fix (stale demo comments) was fixed in
`8b6fb96`; a **later** review raised `packages/skills/.../features/auxiliary-services.md:158`,
which still claims a mismatched `token.chainKey` errors while line 156 of the same file says it
reads as `0n`. Head predates that review, so it is unaddressed.

**#333** (docs wiring) — draft, 2 conflicts, changeset present. **Must merge before**
sodax-document#26 (that repo's sync script hard-resets its submodule to `origin/main`).
Carries an open decision: the Bitcoin `signMessage` defect the author found while auditing —
`chainRegistry.ts:214-224` dispatches off the **connector**, but the sign methods live on the
module-private wallet-provider classes, so `hasSignBip322`/`hasSignEcdsa` can never be true.
**Still unfixed on `origin/main`**, and `chainRegistry.test.ts:157` only asserts the action is
defined, never invokes it. `SIGN_MESSAGE.md` documents the intended API; it needs a caveat or
the bug needs fixing.

## Cross-cutting

- **`checkTs` is not in sodax-backend's CI** — type errors surface only via `nest build`. The
  #975 review flagged it.
- sodax-sdks `main` requires **1 approving review**, squash-only, and has **no required status
  checks** — a red check does not block, and a green one is not sufficient.
