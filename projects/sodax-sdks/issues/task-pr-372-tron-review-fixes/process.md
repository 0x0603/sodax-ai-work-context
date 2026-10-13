---
type: process
repo: sodax-sdks
github: 
updated: 2026-10-13
---

# Process

## Log

- 2026-10-13 — worktree `sodax-sdks-pr372` (branch `pr-372-tron-spoke`, pushRemote = gcranju fork,
  via `gh pr checkout 372`). `git merge --no-commit origin/main` → 7 textual conflicts, all
  "both sides appended an entry": resolved main-first then Tron, so main's pinned registry order is
  a prefix. Merge resolution + adaptations staged; review fixes left unstaged.

## Findings

- **Review finding 1 is parity-only.** `SpokeService.verifyTxHash` returns `{ ok: true, value: true }`
  for every EVM chain, the hub included (it only checks Solana/NEAR/Stellar/Sui/Stacks). So "a
  reverted hub tx reported as success" was never caught, before or after the PR. Restoring the call
  matches main + `SwapService`, nothing more.
- **Semantic merge breaks that `git merge` did not flag** (all from main moving on):
  - `SwapService` cancel path on main calls `relayTxAndWaitPacket`; the PR had dropped that import.
  - main added `SpokeService.getWalletBalance(s)` with an exhaustive chain-type switch → Tron needed
    both methods (delegate to `getDeposit`: memo mode has no asset manager, so it IS the wallet balance).
  - main typechecks test files and requires a why-comment on every `as unknown as` → PR tests needed
    comments; `as never` on the Tron wallet mock made `vi.mocked(...)` resolve to `never`.
  - main bumped vitest 3.2.6 → 4.1.11: `restoreAllMocks` no longer clears `vi.fn` call history, so a
    shared mock's `mock.calls[0]` came from an earlier test → added `vi.clearAllMocks()` in `beforeEach`.
  - main generates Mintlify pages from `packages/sdk/docs` → `pnpm docs:sync-pages` for the PR's
    ESTIMATE_GAS.md edit (`check:docs-pages`).
  - `e2e.test.ts` `Record<SpokeChainKey, …>` map needed a Tron entry.
- **Hardening caught a fake fixture:** `TronSpokeService.test.ts` used `TW7ArGnLzGFvXeYbFmjzGVQwFwCJBiLLLL`
  (bad checksum) as a rotated reserve. Replaced with `tronHashToBase58('22'.repeat(20))`.
- Native TRX sentinel `0x000…0` never reaches the Tron address helpers: Tron deposits skip
  `simulateDeposit`, the only `encodeTokenIdentifier` caller. Safe to make the 0x form strict.
- KAT used in the provider test: dummy key `0x1234…cdef` (EVM `0x1Be3…d4bb`) → Tron
  `TCWfJguCLonUkvmsptQKHUyUJ713pU7XQ1`, computed with the SDK's independent `tronHashToBase58`.

- **Self-review (2026-10-13) found 4 defects in my own changes, all fixed:**
  - `getDeposit` (which my new `getWalletBalance` delegates to) returned `0n` on a failed TRC-20
    read. TronGrid answers failures with HTTP 200, verified live: not-a-contract →
    `result.code` + no `constant_result`; revert → `result.message: 'REVERT opcode executed'` +
    `constant_result: ['']`. A revert with a reason would have parsed as a huge garbage balance. Now
    requires `result.result === true` and a 64-hex word, else throws (matches the `GetBalanceParams`
    reject contract that `createBalanceCollector` relies on).
  - `verifyHubAction` JSDoc claimed `settle` verifies on every path; the MPC branch does not.
  - Broadcast error said "got no answer" for HTTP 5xx too → "did not complete".
  - Provider test used Hardhat key #0 (real, publicly known key); switched to the repo's dummy
    `0x1234…cdef` key → Tron `TCWfJguCLonUkvmsptQKHUyUJ713pU7XQ1`.
- Not changed, noted: `estimateTrc20Energy` also reads `energy_used ?? 0` silently (estimate only;
  fee_limit is fixed). Tron-sourced swap cancel rides the intent relay — same as the PR before the merge.

- **`/code-review` on the worktree (2026-10-13), 15 findings — none introduced by the merge or my
  fixes; all present at PR head `e8fb0c75` (checked).** Do not post on the PR unprompted.
  - Possible fund loss, needs contract/solver confirmation: swap intents (`SonicSpokeService:326`,
    `EvmSolverService:129`) and `PartnerFeeClaimService.setAutoSwapPreferences` encode a Tron
    destination with `encodeAddress` (20-byte identity), while the PR's own `encodeRecipient` doc
    says the release reads a 32-byte padded word. Don't change intent encoding blindly — the solver
    also reads `intent.dstAddress`.
  - Wrong status / timeouts, funds fine: `settle` picks MPC by SOURCE chain only (hub→Tron legs ride
    the intent relay); Tron-sourced borrow/withdraw to a non-Tron destination waits for a Tron
    `released` that may never come; `hubMint ?? tx` fallback feeds a Tron txID to `postExecution`;
    cancel + detailed status still use the intent relay; backend submit-tx (default on since before
    the PR) is chain-unaware.
  - wallet-sdk-react `TronXService`: same bugs as the SDK had — `tronToHex` unvalidated
    (`indexOf -1` → `BigInt(-1)`), `getBalance` parses any `constant_result`.
  - Docs/quality: `MpcRelayChainConfig` doc names a nonexistent `isMpcRelayChainConfig`; `settle`
    JSDoc stacked on `getMpcRelayService`; `dstAddress as Hex` cast; 3-line comments; unrelated
    reformat hunks.

- **C round (2026-10-13), committed as `7b1e9469`.** C1–C4 + 1.1/1.2 pushed at the user's request.
  - C3 investigation read the verified contract bundle from the position factory's sonicscan page and
    live-checked `relayMode` on the hub AssetManager (Tron = MPC). Details: findings § C3.
  - Mistake, corrected: I called the old Bitcoin `hubWalletSwap` relay (JSON as `tx_hash`) "almost
    certainly broken" from the swap-cancel commit `196da0dfc` alone. The user said Bitcoin has always
    worked; the backend relays it the same way. Lesson: before calling an existing flow broken, check
    what production actually runs.
  - Also wrong in the first pass: `settle` outbound for Tron `hubWalletSwap` / `operatePosition` — it
    waits for a release those calls never make. Replaced with a refusal before signing.
  - New finding 1.4b (leverage `originAddress` 20 bytes for Tron) left open: same field as 1.4.
  - Mutation-checked: 3 new leverage tests + 1 DEX + 2 partner tests fail without their fix.

## Changes During Work

- Mutation-checked every new test against the unfixed source: 9 MM tests and 11 Tron tests fail
  without the fixes.
