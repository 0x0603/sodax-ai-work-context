---
type: issue
repo: sodax-backend
github: 268
related_issues: [255, 269]
tags: [bridge-api, backend]
status: Active
updated: 2026-07-16
---

# GH-268 — Bridge API (backend service for `@sodax/sdk` bridge)

> Issue lives in the `icon-project/sodax-sdks` tracker, but the work lands in
> **`sodax-backend`**. Assignee: **Robi (R0bi7)**.
>
> **UPDATE 2026-07-16 — P1–P3 are code-complete on `feat/bridge-api`, all gates
> green; awaiting the user's commit/push. See [[outcome]] for the final result.**
> The "Current state (2026-07-15)" section below is the original framing, kept for
> history — it is now superseded by [[outcome]].

## Goal

Do for **bridge** what `apps/swaps-api` does for **swaps**: a stateless
SDK-passthrough surface (discovery + tx building) plus a durable
submit-and-track pipeline. Client broadcasts the source-chain tx; backend owns
relay orchestration, retries, give-up alerting, and status polling.

**How bridge differs from swaps** (do not copy-paste swaps-api):

- Post-submission is **relay-only**: relay submit (idempotent by src tx hash) →
  poll packets until `executed`. No solver, no `postExecution`, no `getStatus` —
  a ~2-step drainer instead of 4.
- Status set: `pending | relaying | relayed | executed | failed` (drops swaps'
  `posting_execution`).
- Terminal success = `status==='executed' && result.dstIntentTxHash`
  (destination delivery, NOT just hub execution).
- No backend recovery path — `RELAY_TIMEOUT` strands funds in the user's hub
  wallet; recovery is user-signed (SDK `RecoveryService`).
- Split-tx chains (Solana/Bitcoin) need an off-chain `{address, payload}` data
  payload at relay submit — affects the submit DTO, persistence, idempotency key.

## The user's concrete acceptance target — "full test flow"

The feature is only "done" when the full **local** loop runs end-to-end:

1. **local demo** (`@sodax/demo` `/bridge-api` page) invoking a **local API endpoint**;
2. **local backend API** consuming a **locally-built `@sodax/sdk`** in its code;
3. exercise the **whole feature flow: create → submit → status**.

## Current state (2026-07-15)

- **SDK client side (#255, PR #261, branch `feat/bridge-api-v2`) — DONE.**
  `sodax.api.bridge.*` (`BridgeApiService`, 7 routes), dapp-kit `bridgeApi/`
  hooks, demo `/bridge-api` page, `apps/node/bridge-raw.ts` smoke. Ships
  `useBackendSubmitTx` **default-OFF**.
- **Backend (#268) — does NOT exist.** No `apps/bridge-api`, no branch, no
  commit in `sodax-backend`. This is the only blocker for the full test flow.
- **Locked contract** for `/bridge/*` (7 routes, DTOs, status enum, 13
  decisions) lives in `../../../sodax-sdks/issues/gh-255-bridge-api/reference/backend-contract/`.

## Key precedent to learn from

- **`apps/swaps-api`** — the structural blueprint (pipeline, drainer, guards, config).
- **milktea's leverage-yield (#269, PR #928, branch `origin/fix/leverage-swap-api`)** —
  colocated a new SDK-domain API **inside `apps/swaps-api`** as a `src/api/leverage-yield/`
  module reusing `SwapsModule`, and rode the swaps submit pipeline via an `operation`
  discriminator. Bridge reuses the **colocation pattern** for discovery/intent-building
  but **cannot** reuse the swaps drainer/collection (its relay-only machine differs) —
  see [[plan]] §0.

## Next

**Decision (2026-07-15): Option A — standalone `apps/bridge-api` on port 3009**,
following Robi's #268 structure (Robi authored + self-assigned #268; the "new app"
line is Robi's recommendation, `implementor decides` clause notwithstanding).

- `plan.md` — the committed, code-ready Option A plan (3-bucket reuse taxonomy,
  P1 scaffold → P2 submit pipeline → P3 ops, file-by-file with swaps-api mirrors,
  build order, 9 open questions for Robi).
- `decision-analysis-a-vs-b.md` — archived A-vs-B tradeoff + the Option B
  (colocate-in-swaps-api) breakdown, for the record.

**All 9 open questions are now decided** (2026-07-15) — see plan `§7` (Q2/Q3/Q7/Q9
settled by the SDK on `feat/bridge-api-v2`; Q4 timeout ceiling 120s) and `§8`
(Q5 rate-limit / Q6 async-drainer + topology / Q8 admin+triage, mirroring swaps-api).
**Zero design blockers for P1/P2/P3.** Only deploy-time infra facts remain: which
single deployment runs `RUN_SUBMIT_BRIDGE_TXS_TASK=true`, and confirming both
deployments' `STATEFUL_MONGO_*` point at the same shared server.
