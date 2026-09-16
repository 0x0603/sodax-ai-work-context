---
type: outcome
repo: sodax-backend
github: 1090
status: Merged to development 2026-09-09 — never exercised against a real Bound credential
updated: 2026-09-09
---

# Outcome

- PR: [#1097](https://github.com/icon-project/sodax-backend/pull/1097), merged into
  `development` 2026-09-09 12:21 UTC, merge commit `9d3d8b06`. Approved by R0bi7 with **zero
  inline comments**. #1090 auto-closed one second later.
- Commits: 26 files, +1163/−40. The Commits tab shows ~70 because #975 was squash-merged —
  Files changed is the real diff.
- Tests: bridge-api 172 unit + 130 e2e, `pnpm checkTs` 20/20, `pnpm test` 35/35, all local.

## Summary

Both halves of #1090 landed. Bitcoin-source bridging in bridge-api can now authenticate to
Bound at all, and `POST /bridge/approve` can return the `approve(0)` that Ethereum USDT
requires before a non-zero allowance change.

The review was quiet, which is worth reading correctly: it does **not** mean the risky parts
were checked. The three things `plan.md` flagged as unverified are all still unverified, and
they are now unverified *on `development`* rather than on a branch.

## What Changed

**RadFi/Bound backend HMAC auth** — `apps/bridge-api` now reads the same
`BOUND_API_SECRET_KEY` / `BOUND_API_SECRET_WORD` pair swaps-api reads, and passes
`radfi.signRequest` into `new Sodax(...)`. Without it every outbound Bound request went
unsigned and was rejected, so Bitcoin bridging had never worked here at all.

Following #1069's degrade model rather than the fail-fast the PR was originally written with:
`buildRadfiConfig` returns `undefined`, the service boots, and a Bitcoin source with no signer
gets a **503** ahead of the existing `bound.accessToken` 400. A missing signer is our fault and
no caller token would help.

**`resetTx` from `POST /bridge/approve`** — the route goes through `buildApproveTxs` and passes
the reset through as an optional `resetTx`, the shape swaps-api has used since #1045. Additive
on the wire; `tx` is byte-identical to what the old path produced. The two cannot be batched.

**Three build routes now run under a 15s deadline** and answer 504. Reading the allowance makes
`/bridge/approve` 1–3 `eth_call`s, and a rate-limited RPC hangs rather than erroring — viem
honours `Retry-After`, which public endpoints set in the tens of minutes.

**Error-mapper split** — Bound answers a bad service credential and a rejected user token with
the same 401. Without the split, an expired user token (~10 min lifetime) logs at ERROR and
pages on-call.

Two things in the diff that were not this feature: the `packages/incident-manager`
`unique_active_per_target` index-race fix (it blocked the pre-commit gate for every unrelated
change) and one line of pre-existing biome drift.

## Follow-ups

- **Uncommitted on the merged branch, and this is the one that will get lost.**
  `apps/bridge-api/src/api/bridge/bridge.service.ts` carries a +9/−1 fix that never made it
  into #1097: the 504 warn log omits `message`, so winston nests an object with no truthy
  `.message` under `message` and renders the header as the literal `undefined` — observed on
  the first live 504. It is the same trap the RadFi branch of `error-mapper.ts` documents. The
  branch's PR is closed, so this needs its own PR against `development`.
- **Bound has still never been exercised end to end with a real credential on this code.** The
  successful bitcoin bridge (`4cd19135…`) predates the degrade-model rewrite. This is the
  headline risk and merging did not touch it.
- **The 15s build deadline is inherited from swaps-api, not measured.** A bitcoin
  `createBridgeIntent` makes 3+ sequential Bound HTTP calls plus a hub read inside that budget.
  Unmeasured on staging.
- **"One guard call site is enough"** rests on a trace of `BridgeService` in
  `@sodax/sdk@2.2.0-rc.2` — only `createBridgeIntent` reaches `radfi`/`getTradingWallet`. A
  later SDK could add a second Bound-reaching path and the guard would thin out silently. There
  is a comment, but no test.
- **The RadFi auth is duplicated with swaps-api, not shared.** Deliberately out of scope here
  because extracting it edits production `apps/swaps-api`. Note that
  [gh-425](../../../sodax-sdks/issues/gh-425-bound-domain-split-svc-auth/brief.md) is about to
  edit both apps for the host split (sodax-backend#1215) — that is the cheapest moment to pay
  this down, and the duplication has already grown once while waiting.

## Generalisable, already promoted to `process.md`

- When a PR says "ported from X", the port's correctness expires — diff X's *current* state
  before landing. #1069 overturned this PR's design one day after it opened and nothing in the
  PR, the issue, or the diff would have surfaced it.
- The check that catches a test which cannot fail is deleting the code and watching for red,
  not reading the test. That is what separated three real findings from stylistic ones.
