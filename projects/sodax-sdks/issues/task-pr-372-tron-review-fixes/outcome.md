---
type: outcome
repo: sodax-sdks
github: 
status: Pushed
updated: 2026-10-13
---

# Outcome

- PR: icon-project/sodax-sdks#372 (fork branch `gcranju:feat/tron-spoke`)
- Commits: `6484af32` merge of main, `94bcc241`, `2f40c0b2` and `7b1e9469` fixes — pushed 2026-10-13
- Tests: workspace `pnpm test` 21/21 tasks; sdk 2967+, wallet-sdk-core +22 new; checkTs, knip,
  check-exports, circular-deps, check:ai, doc-links, docs-nav, docs-pages, ai-dev-files green.

## What Changed

Staged (merge): 7 conflict resolutions, plus what main forced — `relayTxAndWaitPacket` import in
`SwapService`, `TronSpokeService.getWalletBalance(s)` + `SpokeService` TRON cases, e2e Tron map
entry, why-comments on test casts, `vi.clearAllMocks()` for vitest 4, regenerated
`docs/developers/how-to/estimate_gas.md`.

Unstaged (review fixes):
1. `MoneyMarketService.verifyHubAction` — hub-only supply/borrow/withdraw/repay verify the hub tx.
2. `tronBase58ToHex` strict base58check / 21-byte hex; fake fixture address replaced.
3. New `TronWalletProvider.test.ts` (22 tests).
4. `buildSignAndBroadcast` keeps `txID` (+ cause) on rejected or unanswered broadcasts.

From the `/code-review` follow-up (also unstaged):
5. `TronSpokeService.getDeposit` rejects a failed TRC-20 read instead of `0n`/garbage.
6. wallet-sdk-react `TronXService`: strict base58check `tronToHex` + same balance-read guard, new
   `TronXService.test.ts` (9 tests).
7. `MpcRelayChainConfig` doc no longer names a nonexistent `isMpcRelayChainConfig`; `settle`'s JSDoc
   moved onto `settle()`.

`2f40c0b2` (second `/code-review` pass, 16 files; sdk 2995 tests, checkTs 15/15):
8. Swap/bridge skip backend submit-tx for an MPC-relay source (+ SWAPS.md, BRIDGE.md, skills row).
9. `TronSpokeService.sendMessage` rejects a non-20-byte hub wallet before signing.
10. `estimateGas` throws on a failed TRC-20 simulation; energy call and build run concurrently.
11. `apps/node` harness recipients via `encodeRecipient`.
12. Six 3+-line inline comments cut to 1–2 lines; `SpokeService(.test).ts` format-only hunks back to main.
13. Tron test fixtures typed (`satisfies ITronWalletProvider`, `deposit<true>`); every dead cast dropped.

`7b1e9469` (14 files, +318/−48; sdk 3004 tests; workspace build, checkTs, lint, knip, circular-deps,
check:ai, ai-dev-files, doc-links, docs-pages, docs-nav green; pre-commit 21/21):
14. 1.1 + 1.2: swap intent and partner auto-swap `dstAddress` via `encodeRecipient`.
15. C1: `SetSwapPreferenceParams.outputToken` takes the destination's own format (base58 on Tron).
16. C2: DEX `executeWithdraw` unwrap recipient via `encodeRecipient`.
17. C3: leverage yield settles via `spoke.settle`; Tron sources skip the backend; Tron vault withdraw and
    `operatePosition` refused before signing; Bitcoin identity unchanged (pinned by a test).
18. C4: `wallet-sdk-core/AGENTS.md` lists `tron/`. Docs: `LEVERAGE_YIELD.md` (+ generated page), skills
    `chain-specifics.md` Tron row.

Tried and reverted before commit: 4.5 `onStatus` re-notify stop (unverified relay behaviour); Bitcoin
`hubWalletSwap` on the on-demand identity (wrong — see findings § C3).

Open items posted to the PR by severity: #issuecomment-6144735748.

## Follow-ups

- Open findings (1.4, 1.4b, 1.1 solver check, 2.1–2.4, DEX relay bypass, 4.5, JSDoc):
  `code-review-findings.md`.
