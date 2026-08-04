---
type: outcome
repo: sodax-sdks
github: 331
status: In review — SDK PR open, consumers blocked on the release
updated: 2026-08-04
---

# Outcome

- PR:
  - sodax-sdks — https://github.com/icon-project/sodax-sdks/pull/341 (ready)
  - sodax-frontend — https://github.com/icon-project/sodax-frontend/pull/1634 (draft)
  - sodax-backend — branch `fix/331-approve-reset-tx` off `origin/development`, **uncommitted**
- Commits: `3dc8dc067` (sodax-sdks, one commit) · `ee8dc009` (sodax-frontend)
- Tests: sodax-sdks **1916/1916** · sodax-backend **341/341** (against a `pack:local` SDK)

## Summary

A wallet holding a stale allowance on a guarded ERC-20 could never approve. The SDK now plans the
approval before signing: it reads the allowance and, when the token rejects the write but accepts
`approve(0)`, sends the reset first and waits for it to be mined. Detection is behavioural, so a
token listed or upgraded later is covered without a code change. Signed callers keep their
`Promise<Hash>` contract; unsigned callers get two additive entry points instead of a silent change.

## What Changed

### sodax-sdks — 21 files, +1163 / −34

| File | Change |
| --- | --- |
| `packages/sdk/.../erc-20/Erc20Service.ts` | `getAllowance`, `planApproval`, private `canApprove`, plan types; `isAllowanceValid` refactored onto `getAllowance`; **`approve` unchanged** |
| `packages/sdk/.../spoke/SpokeService.ts` | public `buildApproveTxs`; private `executeErc20ApprovalPlan`, `planErc20Approval`, `getEvmPublicClient`, `logApprovalPlan`; hub + EVM-spoke branches of `approve` merged |
| `packages/sdk/src/swap/SwapService.ts` | `buildApproveTxs` mirroring `approve`, same spender resolution |
| `packages/sdk/src/leverageYield/LeverageYieldService.ts` | the last bypass of `SpokeService` removed |
| `packages/types/.../backendApiV2.ts` | `ApproveResponseV2.resetTx?` |
| `packages/swaps-api/src/schemas.ts` | `resetTx: v.optional(txSchema)` |
| `Erc20Service.test.ts`, `SpokeService.test.ts` | new — decision table, ordering, abort-before-step-2 |
| `apps/node/src/approve-guard-check.ts` | new — read-only on-chain diagnostic |
| `apps/demo`, `apps/swap-api-example` | the two raw consumers broadcast `resetTx` first |
| docs ×4, skills ×2, `.claude/skills/add-token` | behaviour documented; token-vetting step added |
| `.changeset/usdt-stale-allowance.md` | **minor** for sdk / types / swaps-api / skills |

### sodax-backend — 5 files

`swaps.service.ts:185` calls `buildApproveTxs` and returns `{ tx: txs.at(-1), resetTx?: txs[0] }`.
`ApproveResponseDto` gains `resetTx?`. README + `docs/SWAPS_V2_INTEGRATION.md`. Test updated plus a
new one asserting reset-before-approve ordering.

### sodax-frontend — 2 files

`handleApprove` signs and confirms `resetTx` before `tx`; `setConfirmedAllowanceKey` deliberately
stays after the final transaction — it disables the allowance query, so moving it earlier would offer
Swap on a zero allowance. Button copy explains the possible second prompt.

## Evidence

The built planner, run against Ethereum mainnet with the wallet from the issue (read-only, no key,
no gas):

```
token      0xdAC17F958D2ee523a2206206994597C13D831ec7
owner      0xd1ffb0c0136b6360841b6677893e122d2d30f0d2
spender    0x39E77f86C1B1f3fbAb362A82b49D2E86C09659B4   (resolved from config)
allowance  205000000                                    ← the 205 USDT in the issue
plan       2 transaction(s) — 0 then 1550566800
reason     reset-required
```

USDC with the same owner: `allowance 0`, one transaction, no probes.

## Follow-ups

Ordered — nothing here can start before the release.

1. Maintainer cuts one release (three unrelated changesets were already pending on `main`).
2. `sodax-backend/apps/swaps-api/package.json` — bump `@sodax/sdk`; the pre-commit hook then passes,
   so commit and open the PR.
3. `sodax-frontend/apps/web/package.json` — bump the four `@sodax/*` deps; take #1634 out of draft.
4. Fix `useStellarTrustlineCheck` at `migrate-button.tsx:203` and `liquidity-inputs.tsx:152` — the
   hook swapped `walletProvider` for `walletAddress` somewhere between rc.21 and `main`. Unrelated to
   this bug but it blocks the frontend bump.

### Raised in the PR thread, not tracked as issues

- The reported wallet is still stuck. Sending `approve(0)` to the asset manager on USDT clears it for
  ~31k gas — no code needed, confirmed viable by the probe.
- `intents-whitelabel` stays on rc.12 and will not receive the fix until bumped.
- `Erc20Service.encodeApprove` inside hub multicall payloads is untouched — those run inside one hub
  transaction, a different mechanism.
- `sodax-frontend migrate-button.tsx:126` has no `try/catch` around `approve`, so a wallet rejection
  escapes `mutateAsync`. Pre-existing; a second signature makes it likelier to fire.
