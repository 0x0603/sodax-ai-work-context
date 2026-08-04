---
type: plan
repo: sodax-sdks
github: 331
updated: 2026-08-04
---

# Plan

## Goal

Let a wallet holding a stale allowance approve again, on every flow — including the swaps-API path
the production dapp actually uses — without breaking a single existing consumer.

## Decisions (locked with the user before implementation)

1. **Fix both paths, one release.** Not just the signed path. Two PRs in sodax-sdks were offered and
   declined in favour of **one branch per repo**, so the whole SDK change is a single commit.
2. **UI: copy only.** No public planner API for the UI, no new dapp-kit hook. A line under the
   approve button explaining the possible second signature.
3. **`intents-whitelabel` out of scope.** It is pinned to rc.12 while frontend/backend are on rc.21;
   bumping it is a separate migration unrelated to this bug.
4. **No follow-up tracker issues.** Out-of-scope findings go in the PR thread.

## Approach

### Detection — behavioural, never a token list

`Erc20Service.planApproval` asks "will this approve revert?", not "is this token USDT?". Decision
table, evaluated in order:

| State | Plan | Reads |
| --- | --- | --- |
| native token | `[amount]` | 0 |
| allowance read throws | `[amount]` — today's behaviour, no regression | 1 |
| allowance `== 0` | `[amount]` | 1 |
| allowance `!= 0`, probe A `approve(amount)` succeeds | `[amount]` | 2 |
| probe A reverts, probe B `approve(0)` succeeds | `[0n, amount]` | 3 |
| both revert | `[amount]` | 3 |

Two deliberate deviations from the issue's proposal:

- **Probe on any non-zero allowance**, not only an insufficient one. The guard tests zero vs
  non-zero — `PartnerFeeClaimService` always approves `2^256-1`, and re-approving max over max
  reverts the same way.
- **Probe B is new.** Without it a paused token or a blacklisted owner yields a two-step plan whose
  first transaction is already doomed, so the user burns gas on a guaranteed failure.

Three implementation details that are easy to get wrong, each covered by a test:

- `publicClient.call`, **not** `simulateContract` — USDT's `approve` returns no value, so ABI
  decoding fails even on a successful call.
- `account: owner` is required; the guard reads `allowed[msg.sender][spender]`.
- Reuse the existing `Erc20Service.encodeApprove` for the calldata.

### Execution — sequential, last hash wins

`SpokeService` sends step 0, then for each later step waits for the previous receipt before signing.
The transactions cannot be batched: each is only valid once its predecessor has been mined. The hash
of the **last** transaction is returned, so `Promise<Hash>` and every consumer stay unchanged.

If the reset does not confirm, the next step is never sent and the error names the hash. The flow
self-heals: after a landed reset the allowance is zero, so a retry is a single transaction.

### Unsigned path — additive, never a silent change

`approve({ raw: true })` cannot express a two-step plan and is left byte-identical. Instead:

- `SpokeService.buildApproveTxs` / `SwapService.buildApproveTxs` → `{ txs }` in broadcast order
- `ApproveResponseV2.resetTx?` + the matching valibot field, to carry the reset over the swaps API

A rejected shortcut, recorded so it is not retried: making `raw: true` return `approve(0)` first and
letting the existing UI loop ask for a second approval. It breaks because
`swap-confirm-dialog.tsx:223` sets `confirmedAllowanceKey` unconditionally once the tx confirms,
`swap-button.tsx:54` then stops querying the allowance, and `:96` shows Swap. The user would sign
`approve(0)`, be told they are approved, and watch the swap fail — worse than today.

## Steps

1. **sodax-sdks** — planner, sequential execution, `buildApproveTxs`, `resetTx` on the wire, tests,
   docs, skills, changeset, diagnostic script. One branch, one commit.
2. **Release** — the maintainer cuts one release per `packages/RELEASE_INSTRUCTIONS.md`. Three
   changesets were already pending on `main`, so this rides the same cut.
3. **sodax-backend** — `swaps.service.ts` calls `buildApproveTxs`, DTO gains `resetTx?`, docs.
4. **sodax-frontend** — `handleApprove` broadcasts `resetTx` first; button copy.

Steps 3 and 4 can be written and verified before the release with
`pnpm pack:local`, but can only be merged after it — their CI installs from npm.

## Verification

- Unit: every row of the decision table, stubbing `publicClient.call`; spoke tests assert the second
  approve is not sent when the reset receipt is `failure` or `timeout`, and that the returned hash is
  the last transaction's.
- On-chain, read-only, no key, no gas: `apps/node/src/approve-guard-check.ts` runs the built planner
  against Ethereum mainnet with the exact wallet from the issue.
- Local end-to-end before the release: `pack:local` into backend + frontend, then drive the swap.
- Gates: `build:packages`, `lint`, `checkTs`, `test`, `check:ai`, `check:ai-dev-files`,
  `check:doc-links`, `check:knip`, `check:circular-deps`, `check-exports`, `size:check`.

## Risks

- **Consumer bump is not cosmetic.** npm has `latest = 2.0.0` and `rc = 2.1.0-rc.1` while
  frontend/backend are pinned to `2.0.0-rc.21`. Receiving the fix means crossing a stable boundary.
  This cost exists in every scope option, including an SDK-only one.
- **Every approve now costs at least one extra read** (the allowance). Previously the signed path
  read nothing. Native token = 0, ordinary wallet = 1, stale allowance = 2–3.
- **Two wallet prompts** on a guarded token. Type-safe, but UI that shows a single "Approving…"
  should say so.
