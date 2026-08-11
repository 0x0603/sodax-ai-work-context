---
type: process
repo: sodax-sdks
github: 331
updated: 2026-08-05
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

Initially left duplicated: the Stellar `requestTrustline` branch appeared in both `approve` and
`buildApproveTxs`, and I justified that with the no-drive-by-refactor rule. **That reasoning was
wrong** and the user pushed back on it. The rule protects *pre-existing* code from unrelated edits —
but `buildApproveTxs` is new in this PR, so the duplication was mine, and cleaning up what you just
made is finishing the work rather than a drive-by. The stronger argument I had missed: the
`as RequestTrustlineParams<…>` cast is exactly the unsafe cast `AGENTS.md` calls an escape hatch, and
having it in two places is worse than one. Extracted to `requestTrustlineForApproval`.

### Backend branch was cut from the wrong base

First cut from the user's WIP branch `feat/swaps-api-radfi-hmac`, which needs a `radfi` option that
only exists on an unreleased SDK branch. Re-cut from `origin/development` and re-applied the patch.

### Backend cannot be committed yet

`.husky/pre-commit` runs `pnpm checkTs` + `pnpm test` across the whole repo. `buildApproveTxs` does
not exist in `2.0.0-rc.21` (verified: nor in `2.1.0-rc.1`), so the hook fails. Not bypassed —
`--no-verify` is against the repo rules. The change sits in the working tree on
`fix/331-approve-reset-tx` until the release lands.

### #331 restructured into a topic with three sub-issues

Done after the PRs were already open, at the user's request. GitHub's native sub-issue API accepts a
**cross-repo** child, so the three live in their own repos and #331 still renders the progress bar.
Two gotchas worth remembering: the API takes the issue's **database id**, not its number, and `gh api
-f` sends it as a string — it needs `-F` to be typed as an integer, otherwise 422.

The body of #331 was left untouched (it holds the original analysis); the topic structure went into a
comment instead. Both PRs were repointed to close their sub-issue rather than the topic.

### Self-audit found the docs/skills coverage was two-thirds short

A review pass over the PR turned up two should-fix findings, both documentation coverage rather than
code. The behaviour note had landed in 4 docs and 2 skill files; 6 more `packages/sdk/docs` pages with
an `### approve` section, 8 `sodax-sdk` feature knowledge files, and the entire `sodax-dapp-kit`
knowledge tree still described approval as a single transaction. Root `AGENTS.md` requires skills to
be updated when public behaviour changes, so this was a real gap, not polish.

One of them was worse than a missing note: `LEVERAGE_YIELD.md:218` said approve *"delegates to
`Erc20Service.approve`"*, which this PR made **false** for the signed path — it now goes through
`SpokeService.approve`. An inaccurate statement the change itself introduced.

Fixed by putting the full explanation in one place per skill family (`sodax-sdk/architecture.md`,
`sodax-dapp-kit/architecture.md`) and a short pointer with a relative link in each feature file, so
`check:ai` validates the link rather than 15 copies drifting apart. The dapp-kit note is deliberately
different from the SDK one: the hooks do not change at all, so what a reader needs there is that
`isPending` now spans two prompts, that gas estimates assuming one transaction are wrong, and that a
retry is always safe.

Three cheap nits fixed alongside: a comment explaining why the hub and EVM-spoke branches of `approve`
can share one condition, a test for the Stellar branch of `buildApproveTxs`, and a comment recording
that the diagnostic script's synthetic probe mirrors `Erc20Service.canApprove` and must stay in step.

Deliberately left: `SwapService.buildApproveTxs` not returning `plan.reason` (would widen the public
surface for no current consumer), the spoke public client having no RPC failover while the hub does
(pre-existing, degrades safely, deserves its own change), and `apps/node` sitting outside every CI
gate (by design — `btc.ts` has had errors for a while).

### Frontend was done in a git worktree

`sodax-frontend` had uncommitted WIP on `fix/financial-flow-ux-safety-1559`. Used
`git worktree add ../sodax-frontend-331` so that tree was never touched.

### A review session that found four defects I had signed off on

After I had twice reported the branch clean, the user kept asking and each question surfaced a real
defect. Worth recording because the pattern matters more than the individual fixes:

1. **`requestTrustlineForApproval<K, Raw>`** — `K` appeared only in the parameter type, never in the
   return, forcing callers to pass type arguments the compiler should have inferred. It could not
   infer them because I had typed the parameter as `Extract<SpokeApproveParams<K, Raw>, …>`, a
   conditional type. Taking `SpokeApproveParamsStellar<StellarChainKey, Raw>` directly fixed it. I
   had justified the `Extract` form from two commented-out lines in `guards.ts` — those are about the
   *guard's* signature, not a function receiving already-narrowed input. Reasoning from an old
   artefact instead of trying it; one `tsc` run settled it.
2. **`raw` leaked on the Stellar branch** — the ERC-20 branch hardcodes `raw: true`, the Stellar one
   spread it from `params`, and `requestTrustline` reads it at runtime. A JavaScript caller could
   have made a method named "build" broadcast.
3. **Positional contract across a package boundary** — the backend read `txs.at(-1)` / `txs[0]`. A
   future three-step plan would have silently dropped the middle transaction. Fixed at the type
   level, not with a guard.
4. **Array instead of an object** — the strongest one. The only consumer converted the array
   straight back into named fields, so the array was a pointless round trip through positions, and
   that round trip is where defect 3 lived.

Defect 4 generalised: `Erc20ApprovalPlan.steps` had the same flaw one layer down, and it is public
API too. Now `{ resetAmount?, approveAmount }`, so the whole chain — planner, executor,
`ApprovalTxs`, wire — names things instead of counting them. Safe to change only because none of it
exists on `main` yet (`0` occurrences) and npm is still on `2.0.0`; that window closes at release.

Two measurement mistakes of my own are worth remembering. `rg` reported line numbers for
`SpokeService.ts` that plain `grep` contradicted — always confirm a surprising line number against
the file. And `pnpm --filter demo checkTs | grep … ; echo $?` reports the exit code of `grep`, not
`tsc`; I called a gate green off that and the real failure only appeared in the full run.

### `useSwapsApiApproveAndBroadcast` — the boundary this fix moved

The user's sharpest point: leaving signing to the app was fine when it was one transaction, because
there was nothing to get wrong. This change made it two with an ordering and a wait between them —
so the fix exported a correctness burden onto integrators. The package should carry it.

`packages/dapp-kit/src/hooks/swapsApi/` had 23 hooks and not one touched `walletProvider`; they are
deliberately thin HTTP wrappers. This hook breaks that symmetry on purpose. It only needs EVM and
Stellar, because `buildApproveTxs` supports nothing else and every other chain reports its allowance
as always sufficient — my earlier "8 chain families" estimate came from the length of the demo's
dispatcher, which is shared with `createIntent`/`submitTx`, and was inflated cost used to argue for
deferring.

It also closes a gap the demo had documented long before this issue: `useSwapsApiApprove` cannot
invalidate `['swapsApi','allowance']` because confirmation happens client-side after it resolves.
This hook owns confirmation, so it invalidates the query itself.

`apps/swap-api-example` deliberately keeps the manual two-step: it does not depend on dapp-kit, and
demonstrating the standalone `@sodax/swaps-api` path is the point of that app.

## 2026-08-05 — the bot review's one finding, and a live end-to-end run of the backend

### The should-fix was real, but not where the reviewer put it

The `@claude` review on PR #341 flagged one 🟡: `apps/demo` and `apps/swap-api-example` await the
reset receipt without checking whether it succeeded, so a reverted reset is followed by a doomed
second signature. The demo half of that is stale — the review ran at 10:47 and
`useSwapsApiApproveAndBroadcast` landed at 14:21, after which the demo stopped touching `resetTx` at
all (`rg resetTx apps/demo/src` → no hits).

The finding did apply to the hook itself, which is worse than the app it was reported against:
`sendAndWait` awaited the receipt and dropped it. So the correctness burden the hook exists to carry
had exactly the hole the reviewer described, one layer up from where it was reported. Fixed there
plus in `apps/swap-api-example` (the only app still doing the two-step by hand, deliberately).

Detail that had to be verified rather than assumed: `EvmRawTransactionReceipt.status` is documented
as the JSON-RPC hex flag (`'0x1'`/`'0x0'`), but `EvmWalletProvider.serializeReceipt` spreads viem's
receipt and overrides only the numeric fields — so `status` arrives as viem's `'success'`/
`'reverted'`. Both spellings are accepted; a missing status stays inconclusive rather than counting
as a revert. The type/runtime mismatch is pre-existing and left alone.

### Backend run end-to-end against the wallet from the issue

Booted `apps/swaps-api` locally (`.env` from `example.env.dev`, Redis + Mongo already up) against
the `pack:local` SDK. The endpoint hung twice before producing anything, and the cause was not code:
both the SDK's default Ethereum endpoint and `eth.merkle.io` were rate-limiting (`error code: 1015`
from Cloudflare), and viem's retry/backoff turns that into an apparently hung request rather than an
error. `https://ethereum-rpc.publicnode.com` worked. Worth remembering — a "hanging" approve on this
path is an RPC symptom first.

The guard, confirmed live by raw `eth_call` before trusting any SDK layer:

```
approve(assetManager, 1550566800) -> execution reverted, data 0x
approve(assetManager, 0)          -> 0x   (succeeds)
allowance(owner, assetManager)    -> 0x0c380d40 = 205000000   (the 205 USDT, still there)
```

`POST /swaps/approve` for that wallet then returned **both** transactions — `resetTx` =
`approve(spender, 0)`, `tx` = `approve(spender, …)` — in 0.66 s. The same call with USDC as the
source token returned `{ tx }` alone. That is the whole fix, observed from outside the process.

### Unrelated smell found while probing

`POST /swaps/allowance/check` answers `{"valid":true}` for a chain key that does not exist
(`0xdead.nope`). Unknown keys fall through to the "allowance always sufficient" branch instead of
being rejected, so a typo'd `srcChainKey` silently reports a sufficient allowance. Out of scope for
#331 — raise in the PR thread.
