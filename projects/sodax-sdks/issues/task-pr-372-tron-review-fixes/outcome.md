---
type: outcome
repo: sodax-sdks
github: 
status: Pushed
updated: 2026-10-13
---

# Outcome

- PR: icon-project/sodax-sdks#372 (fork branch `gcranju:feat/tron-spoke`)
- Commits: `6484af32` merge of main, `94bcc241` and `2f40c0b2` fixes — pushed 2026-10-13
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

Tried and reverted before commit: 4.5 `onStatus` re-notify stop (unverified relay behaviour).

## Follow-ups

- Open `/code-review` findings: `code-review-findings.md`.
- `wallet-sdk-core/AGENTS.md` provider tree does not list `tron/` (advisory AI-drift; not touched).
