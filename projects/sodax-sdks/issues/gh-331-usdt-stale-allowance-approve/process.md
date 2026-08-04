---
type: process
repo: sodax-sdks
github: 331
updated: 2026-08-04
---

# Process

## Log

- Read the issue, mapped the approve call graph across all four repos.
- Traced the production swap flow and found it uses the **raw** swaps-API path, not the signed one —
  this reframed the whole scope (see `issue.md` § Context).
- Surveyed the token list on-chain to decide between a token list and behavioural detection.
- Implemented the SDK change, then the backend and frontend on top of `pnpm pack:local` tarballs.
- Self-reviewed `SpokeService.ts` and refactored four things that were not good enough
  (§ Changes During Work).

## Findings

### On-chain survey of the token list

Scanned all **174 EVM ERC-20s** in `packages/types/src/chains/tokens.ts`. Two methods:

1. Cheap screen — `eth_call approve(spender, 1)`. A standard ERC-20 returns a `bool`; the
   TetherToken lineage returns nothing.
2. Definitive — `eth_call` with a `stateDiff` that plants a stale allowance, then simulates the
   approve. The storage slot is discovered, not assumed: try
   `keccak256(spender ‖ keccak256(owner ‖ slot))` until `allowance()` reads back the planted value.

Results:

- **Exactly one guarded token today: USDT on Ethereum** (`0xdAC17F958D2ee523a2206206994597C13D831ec7`).
  It reverts `execution reverted / data: 0x` while `approve(0)` succeeds under the same stale
  allowance — so the two-step plan is valid.
- 169 of 174 return a proper `bool`. Every other USDT (Sonic, Arbitrum, Base, Optimism, Polygon, BSC,
  Avalanche, HyperEVM USDT0, Kaia, Redbelly, LightLink) is standard.
- Three Hedera tokens are inconclusive by anonymous `eth_call` — the Hedera relay requires an
  existing account.
- Two false positives were chased down and dismissed: Polygon AAVE (rate-limit artifact) and
  `sodaRBNT` (see below).

### `sodaRBNT` is filed under the wrong chain

`tokens.ts` declares `sodaRBNT` with `chainKey: ChainKeys.REDBELLY_MAINNET`, but
`eth_getCode(0x4B207114F9118dEAC56436e1aE3c45648783c7Ac)` on Redbelly returns `0x` while the same
address on Sonic holds an ERC-1967 proxy. The config points at a chain where the contract does not
exist. Surfaced to the user, who opened `fix/soda-rbnt-chain-key` separately.

### Why a token list would rot silently

At least **109 of 174** listed tokens are upgradeable proxies by EIP-1967/1822 — and that count
**undercounts**, because the whole USDC family uses the pre-EIP-1967 zeppelinos slot
`0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3`. USDT itself uses a third
pattern (`deprecated()` + `upgradedAddress()`). So even the meta-question "is this token
upgradeable?" has no reliable static answer: at least four proxy patterns are in play and new ones
keep appearing. A token that is standard today can become guarded tomorrow behind the same address.

### `eth.merkle.io` is rate-limited

The packaged Ethereum RPC in `chains.ts` returns Cloudflare `error code: 1015` from this machine.
The diagnostic script grew an `--rpc` flag because of it — without one, a throttled node makes the
planner report `allowance-read-failed` instead of a real verdict.

### The tempting shortcut that does not work

Making `raw: true` return `approve(0)` first, and letting the existing UI loop ask for a second
approval, would have avoided touching the backend entirely. It breaks — reasoning recorded in
`plan.md` § Unsigned path.

## Changes During Work

### Diagnostic script rewritten after the user questioned it

The first version required `--owner` of a wallet already holding a non-zero allowance — useless for
the case it exists for, vetting a token **before** it is listed, when nobody has approved it. It now
falls back to a synthetic probe (state override) when no owner is given, and the `add-token` skill
step was reworded to match. The slot-search range also had to grow from 20 to 60: several bridged L2
tokens (Arbitrum USDT among them) put the allowance mapping well past 20, and a short range reported
"inconclusive" on a perfectly ordinary token.

### `SpokeService.ts` self-review — four fixes

1. `approveErc20` handled both the raw and the signed path while its doc said "Run the approval
   plan"; the raw branch runs no plan. Raw moved back into `approve`, the private renamed
   `executeErc20ApprovalPlan`, and its doc is now true.
2. The 6-field `planApproval` argument block plus the log call were duplicated in `approve` and
   `buildApproveTxs` → extracted `planErc20Approval(params, caller)`.
3. An unreachable error branch (`lastTxHash === undefined`) existed only because `steps` was typed
   `readonly bigint[]`. Typed it `readonly [bigint, ...bigint[]]` instead and rewrote the loop as
   "send the first, then wait-then-send each remaining" — the invariant is now expressed directly and
   the dead branch is gone.
4. `logApprovalPlan(method: string)` → `caller: 'approve' | 'buildApproveTxs'`.

Deliberately **not** de-duplicated: the Stellar `requestTrustline` branch appears in both `approve`
and `buildApproveTxs`. Extracting it would edit a pre-existing branch unrelated to this bug, against
the repo's no-drive-by-refactor rule. The duplication is safe — both call the same method with the
same mapping, so a signature change fails typecheck in both places and cannot drift silently.

### Backend branch was cut from the wrong base

First cut from the user's WIP branch `feat/swaps-api-radfi-hmac`, which needs a `radfi` option that
only exists on an unreleased SDK branch. Re-cut from `origin/development` and re-applied the patch.

### Backend cannot be committed yet

`.husky/pre-commit` runs `pnpm checkTs` + `pnpm test` across the whole repo. `buildApproveTxs` does
not exist in `2.0.0-rc.21` (verified: nor in `2.1.0-rc.1`), so the hook fails. Not bypassed —
`--no-verify` is against the repo rules. The change sits in the working tree on
`fix/331-approve-reset-tx` until the release lands.

### Frontend was done in a git worktree

`sodax-frontend` had uncommitted WIP on `fix/financial-flow-ux-safety-1559`. Used
`git worktree add ../sodax-frontend-331` so that tree was never touched.
