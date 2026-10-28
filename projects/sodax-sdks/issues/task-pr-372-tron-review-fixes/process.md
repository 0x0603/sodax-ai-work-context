---
type: process
repo: sodax-sdks
github: 
updated: 2026-10-27
---

# Process

## Log

- 2026-10-13 — worktree `sodax-sdks-pr372` (branch `pr-372-tron-spoke`, pushRemote = gcranju fork,
  via `gh pr checkout 372`). `git merge --no-commit origin/main` → 7 textual conflicts, all
  "both sides appended an entry": resolved main-first then Tron, so main's pinned registry order is
  a prefix. Merge resolution + adaptations staged; review fixes left unstaged.
- 2026-10-27 — #372 closed unmerged 2026-10-16T06:47Z; #534 (`gosodax:feat/tron-mpc-integration`)
  opened 06:57Z and supersedes it. Re-reviewed head `a9a8736c` (worktree in the session scratchpad).
  GitHub compare `<fix>...a9a8736c` is `diverged`, behind_by 2/3/4 for `94bcc241`/`2f40c0b2`/`7b1e9469`:
  none of our fixes are in #534. The hub clone is shallow (a big merge shows no parents), so
  `git merge-base --is-ancestor` there is meaningless; use the compare API.
  - Re-done by the author: 1.1 (swap `dstAddress` via `encodeRecipient`), strict `tronBase58ToHex`.
  - Back to pre-fix code (checked file by file against `pr-372`): 1.2 partner `encodeAddress`
    (`PartnerFeeClaimService.ts:379`) + C1 (`outputToken: Address`, `:56`); 1.3 `apps/node/src/tron.ts:122-123`;
    C2 dex `AssetService.ts:405`; C3 leverage yield relays directly (`:1795`, `:4130`), no MPC refusal;
    2.5 no MPC gate on backend submit-tx (`SwapService.ts:1089`, `BridgeService.ts:838`,
    `LeverageYieldService.ts:1747`); Group 3 `TronXService` loose `tronToHex` + unchecked `balanceOf`,
    `TronXService.test.ts` deleted; `TronSpokeService` unchecked `getDeposit` (`:348`) and energy
    (`:404`), sequential `estimateGas`, no `isAddress(dstAddress)` (`:421`); 4.1, 4.2, 4.6, C4.
  - Still open: 1.4/1.4b, 2.1–2.4 (swap detailed status now reads the MPC deposit record; bridge
    status `BridgeService.ts:1327` and cancel `SwapService.ts:1881` do not), DEX relay bypass, 4.5.
  - New this pass: reserve from `/deposit-address` only warned (`TronSpokeService.ts:261`, intentional
    per the changeset), memo never recomputed, RPC-built `raw_data_hex` signed unchecked on the raw-key
    path, MPC timeouts map to `RELAY_FAILED`/`UNKNOWN` (`relay-error-mapping.ts:58`). `RelayChainIdMap`'s
    Tron id is load-bearing (hub wallet derivation `EvmHubProvider.ts:89`), not "only to keep the map
    total". `ConfigService.initialize()` is a no-op today (config-v2 TODO), so no backend config.
  - Second pass: Tron message paths run `simulateRecvMessage` on the hub (srcChainId 728126428) before
    signing (`SpokeService.ts:1100-1111`), so "hub executes while the SDK reports failure" needs that
    simulation to pass; nothing in the PR exercises it (the harness calls `sodax.spoke.tron.sendMessage`
    directly, `apps/node/src/tron.ts:126`). Deposit paths skip simulation for Tron, so funds always move.
    Also unguarded: dex CL `supplyLiquidity`/`increaseLiquidity`/`decreaseLiquidity`/`claimRewards`
    (`ConcentratedLiquidityService.ts:747`, `:817`, `:887`, `:1111`), staking `unstake`/`cancelUnstake`.
    Blocked before signing: staking stake/instantUnstake/claim (`getSodaToken`, `StakingService.ts:493`,
    `:842`, `:1029`), bnUSD migration to Tron (`BnUSDMigrationService.ts:117`).
  - Docs pass (new `docs-review` skill, head `a9a8736c`). The PR's own doc lines are true; the
    `estimate_gas` row and the `chain-specifics` row mostly restate the `TronGasEstimate` and
    `ITronWalletProvider.signMessage` JSDoc (`common.ts:284`, `tron.ts:61-64`). Made false:
    `docs/developers/deployments/mainnet.md:743` ("no entry in `ChainKeys`"), wallet-sdk-core skill
    `chain-support.md:43` (22 → 23 keys). Raw Tron deposits return before `/notify`
    (`TronSpokeService.ts:173-181` vs `:197-206`), but `recipes/raw-tx-flow.md:46-61` says to call
    `relayTxAndWaitPacket`; per the MPC-relay hub card the relay has no chain watcher. Not updated:
    every wallet-sdk-core / wallet-sdk-react / dapp-kit skill list, both wallet READMEs,
    `WALLET_PROVIDERS.md`, `add-chain` (no MPC family). Changeset overstates: `settle` "feature
    services call" (LY/DEX/CL/staking/cancel relay directly), "partner-fee includes Tron
    automatically" (`PartnerFeeClaimService.ts:379` uses the identity encoding), `MpcRelayApiService`
    is a module, not an export. Gates are hollow: Docs Drift counts any mapped sdk doc for every
    package (`check-docs-drift.sh:56-64`); the AI drift job passed with "nothing was audited"
    (`error_max_turns`). Against main (`git merge-tree`) only `packages/types/src/swap/swap.ts`
    conflicts; the doc pages auto-merge.
  - Posted the code + docs findings on #534 at the user's request (#issuecomment-6432900564). Left
    out on purpose: the reserve/memo trust items (AuditMap route), relay internals from the hub
    card, the hardcoded relay endpoint, and the bot's six findings (only noted they hold).
  - Wrote the missing docs/skills for #534 (user asked) on local branch `docs/tron-mpc-docs`, worktree
    `sodax/sodax-sdks-pr534-docs`, based on `a9a8736c`; nothing committed. Markdown only, no `src/`:
    new `sodax-wallet-sdk-core/tron/SKILL.md` + `features/tron.md` (no code blocks), Tron in every
    all-families list/table (lists made family-agnostic where the sentence held), counts removed,
    raw Tron deposit -> `sodax.spoke.settle` (it re-notifies), `mainnet.md` note, changeset fixes,
    `add-chain` §2b MPC relay, `add-wallet-provider` Tron row, AGENTS trees; `docs:sync-pages` run.
    Gates green: check:docs-pages, doc-links, docs-nav, ai-dev-files, check:ai (after
    `pnpm build:packages`; unbuilt dist fails ai-imports), mint validate + broken-links.
    Code findings from it, not in docs: TRX is in `moneyMarketSupportedTokens[TRON]` but `sodaTRX`
    is not in `moneyMarketHubVaults` (`moneyMarket.ts:8-38`); `TronWalletProvider.getBalance` returns
    `0n` on any error (`:160-168`); `types.ts` says injected `tronWeb` is read-only but `signer()`
    falls back to it (`:101-105`); React layer has no Tron `signMessage`. Issue #541 has neither
    `plan-approved` nor `no-plan`.
  - Pushed onto the PR branch (gcranju's) at the user's request: one commit
    `f4e3af0e` (`docs: cover Tron and MPC-relay settlement in docs and skills`), fast-forward from
    `a9a8736c`. Committed under Node 24, full pre-commit hook passed, SSH-signed. No PR comment.
    On GitHub only the `pull_request_target` checks ran: Plan check fails as on `a9a8736c` (#541 has
    no plan comment, no `plan-approved`). CI, Docs Drift, AI Files Drift and Security did not run: the
    PR now conflicts with main (`packages/types/src/swap/swap.ts`, main `26e45cde`), and GitHub runs no
    `pull_request` workflow on a conflicting PR. They run once main is merged in.
  - Merged `origin/main` (`26e45cde`) into the worktree with `--no-commit`, uncommitted. Only conflict:
    `swap.ts` staging map, resolved as main's `ROBINHOOD_MAINNET: []` + the PR's Tron staging entries
    (main's #569 moved the other staging tokens to production). checkTs, types (1193) and sdk (3204)
    tests, check:docs-pages, doc-links, ai-dev-files green.
  - Checked the R0bi7 agent review (#issuecomment-6433047032, head `a9a8736c`): all five findings hold
    (DEX withdraw identity bytes `AssetService.ts:405`; intent-relay waits in LY `:4130`/`:1795`, DEX,
    CL, `cancelIntent`; bridge detailed status `BridgeService.ts:1327`; harness `tron.ts:122-123`;
    `?? tx`). Wrong: its fix "settle outbound for signed messages" hangs for messages with no Tron
    release (LY positions, CL), which need a refusal before signing; "branch up to date with main" (4
    main PRs merged before it). Missed: partner-fee auto-swap recipient (`PartnerFeeClaimService.ts:379`).
  - Merge committed + pushed (`c678c649`); CI green except the advisory Plan check (#541 label).
  - Fixes per `plan-pr534-fixes.md`, uncommitted in the worktree (36 files). Verified first: backend
    `origin/main` 3f838948 has no MPC/Tron code (backend skip stays right); on-chain
    `getReservesList()` on the hub pool has no sodaTRX (TRX dropped from MM; a types test now pins
    "every MM token's vault is a reserve"). LY changed from old C3 (refuse exits only) to refuse
    entry too: deposit/open from Tron would have no SDK exit. Every new test fails on the old code
    (mutation-checked file by file); sdk 3238, types 1194 pass. Wallet packages (E4–E6) done by a
    subagent and reviewed; added a `result.message` revert check to both TRC-20 balance reads.
  - Posted the three owner questions on #534 at the user's request (#issuecomment-6436894146):
    Tron `srcAddress`/`originAddress` encoding (1.4/1.4b), hub→Tron and Tron→other-chain settlement
    (2.1/2.2), `/notify` past `pending` (4.5). Cites head `c678c649` lines only, not the unpushed fixes.
  - Pre-commit review (review-core-sdk + docs-review), all fixed: a new `useTemplate` lint error
    (CI runs `pnpm lint`); cancel refusal returned `INTENT_CREATION_FAILED`, now `swapInvariant` →
    `VALIDATION_FAILED`; duplicated constant-call guard → `constantCallFailed`; `txs?.` restored
    (relay JSON is unvalidated); docs/comments claimed relay behaviour ("settles only on a release"),
    reworded to what the SDK confirms; checksummed hub-wallet test added; a Biome `--write` reformat
    of a pre-existing test line reverted. CI gates green locally (circular-deps, knip, check-exports,
    size, lint, checkTs, docs, check:ai); sdk 3240 tests. Left as-is: `executeWithdraw` with
    `params.dst` sends from the dst chain (pre-existing, not Tron); strict base58 accepts a leading `1`.
  - Committed as one commit at the user's request and pushed onto the PR branch: `e6c3d6a3`
    (fast-forward from `c678c649`, 45 files), Node 24, full pre-commit hook passed, signed. CI on it:
    CI, Docs Drift, AI Files Drift, Security, Issue Link, Lint PR green; only the advisory Plan check
    fails (#541 has no plan label).

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

- **claude[bot] check of our issue table (#issuecomment-6144955938), reviewed 2026-10-13, no reply
  posted.** Its line citations hold at `7b1e9469`. Wrong or overstated:
  - attributes our "I left `srcAddress` alone…" line to gcranju — it is ours (6144735748);
  - "no release mechanism for Sonic → Tron, may need the user's Tron key": wrong. `AssetManager.sol`
    emits `BridgeRequest` for MPC chains ("the backend watches BridgeRequest", lines 265-268); the
    release is hub-triggered, no Tron signature. 2.1 stays a status/polling gap;
  - 1.4b "higher confidence than 1.4": same intent `srcAddress` field (`LeveragePosition`
    `srcAddress: originAddress`), same open question;
  - 2.2 "confirmed by docstrings": inference only; the relay's terminal state for a no-release
    withdrawal is unknown;
  - 4.5 "one extra condition": needs a new `waitForDeposit` API (tried, reverted);
  - DEX fix "route through `settle` like MM": an `'outbound'` settle moves the Bitcoin DEX withdraw to
    the `od:` identity — the trap reverted in C3. Any DEX migration must keep Bitcoin's relay shape.

## Changes During Work

- Mutation-checked every new test against the unfixed source: 9 MM tests and 11 Tron tests fail
  without the fixes.
