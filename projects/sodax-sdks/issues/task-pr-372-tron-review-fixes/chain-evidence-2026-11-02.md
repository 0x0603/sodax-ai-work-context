---
type: knowledge
repo: sodax-sdks
github: 534
tags: [tron, mpc-relay, settle, evidence]
updated: 2026-11-02
---

# Tron payouts on chain · verdicts (2026-11-02)

The verdicts below were made before relay access, from chain data, the relay's public GET route, SDK
code at `8a3cabc1` and the 2026-08-20 v2 audit quotes. Since later on 2026-11-02 the relay source is
readable (`icon-project/MPC-relay`, hub submodule `repos/offchain/MPC-relay`; drop its local
`submodule.*.update none`). Code-level facts are in the last section; prefer them over the inferences.

Data: 34 hub `BridgeRequest` logs to Tron (728126428), 2026-08-05 → 2026-10-26, matched to the Tron
reserve's 27 outgoing payouts by recipient, token, time and amount minus fee (heuristic, not 1:1 ids).

| Item | Verdict | Evidence |
|---|---|---|
| 2.1 status | SDK always times out on Sonic → Tron | `SpokeService.ts:1379` intent relay; SDK `/notify` only sends Tron txIDs (`TronSpokeService.ts:217`, `:341`) |
| 2.1 lookup | Not under `/withdrawal/` (`unknown trackingId`), but under `/deposit/146-0x<tx>-<logIndex>` (see below) | live GET |
| 2.1 delivery | Solver fills (`executeC`, not via `/withdraw`) are paid in 0–2 min; no user-originated hub → Tron tx exists to check | 19 of 25 solver legs paid |
| 2.2 | SDK can never report success: resolves only on `released` + release hash (`MpcRelayApiService.ts:281`), and a non-Tron destination has no Tron release | code + contract; relay terminal state still unknown |
| 1.4 | Cancel refund with a 20-byte recipient not paid after 7 days (15 TRX, hub tx `0xe7c60bde…`); a 32-byte solver payout to the same address the same minute was paid. Cause (format vs canceller sender) not separable | user accepted as test cost of an unreleased feature |
| Fee | Payouts arrive minus a relay fee that changes (TRX 0.2937 → 0.27234; USDT ~1.22 → 0.616); below-fee legs (0.71, 0.21 USDT) were dropped, matching audit `verifiers:I-2` | SDK has no guard; docs note pushed as `2b2ebc6d` |
| Unpaid above fee | 08-18 11:05, 08-20 10:16, 08-20 10:35 (solver), 09-09 17:46 (relay), 08-14 03:13 unclear | relay ops only |

## Relay lookup for hub-originated payouts (verified 2026-11-02)

`GET {mpcRelayApiEndpoint}/deposit/146-0x<hub tx>-<logIndex of the BridgeRequest log>`:

| Hub tx | Record | Chain |
|---|---|---|
| `0x9f655e2b…-10` (solver) | `submitted`, `txs.release` `0617e6e3…` | matches the Tron payout |
| `0x25f5fce6…-10` (solver) | `submitted`, `txs.release` `b9a31d21…` | matches |
| `0xa0f5e8f9…-1` (Tron-signed) | `submitted`, `release` `19f9f125…`, plus `burn`, `submitMessage` | matches |
| `0xe7c60bde…-1` (cancel, 20-byte) | `pending`, `txs` empty | never paid |
| `0x6cd8596c…-13` (below fee) | `pending`, `txs` empty | never paid |

Without the `0x` the same id reads `pending` empty. `GET /withdrawal/` only takes 32-byte trackingIds.
gcranju confirmed the hub → Tron leg is MPC-relay, not `get_transaction_packets`.

T1 (Tron → Sonic, 10 TRX): Tron `c58feca9…` confirmed 05:19:45 UTC, hub mint `0x6124231a…` 05:20:37,
10.0 sodaTRX to `0x1468…8f31`, no deposit-side fee.

## Relay client-api doc (pasted by the user, 2026-11-02) vs findings

Doc, not code; where it disagrees with live behaviour that is noted.

- No chain watcher: the relay learns of a hub burn only via `POST /notify {chain_id: "146", tx_hash, type: "withdrawal"}`. The SDK never sends that for a Sonic source, so a user's Sonic → Tron transfer is likely never paid (2.1 is a delivery gap, not only status). Matches chain data: solver fills paid (someone notifies them); cancel refund and below-fee legs read `pending` empty.
- Documented lookup is `GET /withdrawal/{trackingId}` only; it returns `withdrawalId: "146-0x…-n"`. `GET /deposit/146-0x<tx>-<n>` works live but is undocumented for burns, its status stays `submitted`, and the doc says tracking `txs` writes are best-effort ("trust status").
- `/withdrawal` ladder: `submitted → burned → attested → released`, or `failed` (`SUBMIT_FAILED` / `RELEASE_FAILED`). No state for a Tron-signed message that releases nothing (2.2 still undefined).
- `GET /fees` exists, but live it lists only 133 (ZEC) and 607 (USDT conditional); no Tron entry, while Tron payouts are charged (~0.27 TRX, ~1.22 USDT). Doc says "no entry charges nothing": contradiction.
- `reserveAddress` "is not a constant… always pay the address from THIS response". Our PR-row-1 advice (refuse when ≠ config) conflicts with the relay contract; the SDK's warn-only matches the doc. Needs a relay-side answer (e.g. an authenticated reserve list) instead.
- Tron recipient = 12 zero bytes ‖ 20-byte hash: confirms the 20-byte cancel refund was malformed (1.4).

## gcranju's fix, head `a3ef535d` (6c4147d7 + 4d4e3214), reviewed 2026-11-02

- `settle` takes `dstChainKey`: hub source + MPC destination → `settleHubRelease` (hub receipt → the one `BridgeRequest` to that chain → `POST /notify type=withdrawal`, re-notify every 6 s → poll `/deposit/146-<lowercased tx>-<logIndex>` until `txs.release`). Spoke source → intent-relay packet to the hub, then the same release step. Swap fills and DEX withdraws to Tron use it too. Bridge skips backend submit-tx when either side is an MPC chain.
- 2.2: a Tron-signed message paying elsewhere settles on `/withdrawal` status past `submitted` with `txs.burn`, then carries the hub tx onward. That relay behaviour is unverified until T4.
- Verified locally: build, 697 tests in the 7 changed suites, sdk checkTs. Read-only `getHubRelease` on real hub txs returns the right ids and release hashes; a hub tx without a Tron `BridgeRequest` returns `undefined`.
- Not addressed: below-fee payouts (now notified, then a 300 s timeout; `/fees` has no Tron); reserve warn-only (matches the relay doc, so PR row 1 should be withdrawn). Nits: the hub receipt wait has no caller timeout; `notify` sends the hash un-lowercased while the poll id is lowercased; docs don't say how to resume a timed-out hub → Tron (`spoke.settleHubRelease`).

## Relay code check (MPC-relay main `cbc10dd`, 2026-11-02)

Paths under `v2/`. Read by two subagents, the fee drop re-read by hand.

- Deposit: one fixed Tron reserve (path `bridge:reserve:728126428`, `apps/ingest/src/derivers/tron.ts:15`),
  not per payload. Tron verifier checks success, 32-byte `raw_data.data` memo, ≥19 blocks below head,
  pays the reserve, amount > 0 (no expected-amount check) (`verifiers/tron/src/verify.ts:119-188`).
  `data` becomes `0x` unless the owner paid directly (`:221-235`). Id `728126428-<lowercase txid, no 0x>-<index>`;
  a `0x` or uppercase id reads `pending` forever.
- Deposit hub tx is `AssetManager.recvMessage(...)` from the hub executor after NEAR
  `submit_batch_and_request_hub_sign`. Tron sweep is a no-op: a Tron deposit never reaches `swept`.
  Status: `submitted` = first verifier row, `attested` = NEAR call sent, `minted` = hub tx final. No failed state.
- Withdraw-auth: ingest verifies scheme 1 and writes the trackingId pointer; the hub executor runs
  NEAR `submit_withdraw_message` → `Wallet.recvMessage` on the hub. `burned` only means that tx is final.
  After the burn the coordinator itself notifies the hub verifier (`finalize.ts:267`), so a Tron payback
  needs no SDK notify. `attested` = ≥1 verifier signature, not quorum. Stuck at `burned`: fee ≥ amount,
  zero recipient, no BridgeRequest. Stuck at `attested`: destination with no executor queue
  (`executors/coordinator/src/handlers/aggregator.ts:60-68`).
- Hub → Tron: no hub watcher anywhere (flow-indexer only mirrors attestations). Hub verifier needs a
  `0x` hash, lowercases it, ≥12 blocks, AssetManager logs only. Fee is taken in the hub verifier
  (fee-api quote, pinned; payout re-encoded as amount − fee). Fee ≥ amount → message dropped, nothing
  written, `GET /deposit` stays `pending` (`verifiers/hub/src/verify.ts:582-586`). This is the below-fee case.
- Recipient is the payload's `to` (32 bytes: 12 zero bytes ‖ 20-byte address), not `dstAddress`. A 20-byte
  `to` fails at executor-tron or NEAR → retries → failure + DLQ. So the 1.4 cancel refund could not pay
  out even if notified; its `pending`-empty record still says it never reached the verifier.
- Release record via `/deposit/146-0x…-n` stays `submitted` because executor-tron writes no NEAR hash;
  `GET /withdrawal/` cannot read hub-originated releases. `GET /deposit` never shows `failed`.
- Doc vs code: `docs/client-api.md` lists Tron as address-mode (code: memo-only); `createdAt` is seconds,
  not ms. Relay constants name 728126428 `TRON_NILE_CHAIN_ID` (9206 = mainnet placeholder), but one id
  serves both and mainnet T1 settled under 728126428.
