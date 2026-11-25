---
type: plan
repo: builders-sodax-mcp-server
github:
updated: 2026-11-25
tags: [mpc-relay, swap, bridge, tron, xrp, ton, cardano, zcash, monad]
related_issues: [gh-147, gh-118]
related_decisions: [0001-mpc-settlement-ownership-and-launch-gate]
---

# MPC-relay chains in the MCP: the full flow, and what is hard

**Final policy:** [ADR 0001](../../decisions/0001-mpc-settlement-ownership-and-launch-gate.md)
supersedes the provisional rollout order and MCP-side notify/sender-rule fallbacks below.
SDK owns chain rules/shared proof; backend owns durable MPC settlement. Source deposits stay
disabled until those contracts and supported recovery are ready. See [process.md](process.md)
for the checked backend routing, real hub receipt and deployed ABI mismatch.

Tags: **[V]** verified in code (cited), **[N]** from an earlier context note, **[J]** judgement.
Sources read 2026-11-25: SDK tag `@sdks@2.4.0-rc.1` (paths under `packages/sdk/src/`), sodax-backend
`origin/development` `dc00438a`, MCP `feat/147-bridge-tools` `9ef5d54`, and
`projects/sodax-sdks/issues/task-pr-372-tron-review-fixes/chain-evidence-2026-11-02.md` (relay main `cbc10dd`).

## Where things stand

- [V] The MPC-relay chains are Tron, XRP Ledger, TON, Zcash, Cardano (memo mode: pay a shared reserve, tag
  the payment with a memo) and Monad (address mode: pay a per-payload deposit address the relay sweeps)
  (`shared/services/mpcRelay/MpcRelayApiService.ts:53-82`). First release: `2.4.0-rc.1`; `latest` is `2.3.0`.
  The MCP is on `2.3.0-rc.4`.
- [V] Backend submit-tx relays only through the intent relay: an MPC source settles client-side in the SDK
  (`swap/SwapService.ts:1112-1115`, `bridge/BridgeService.ts:197-203`).
- [V] The backend bumped to `2.4.0-rc.1` and gates MPC chains to allowlisted orgs (`MPC_ALLOWED_ORG_IDS`,
  `apps/{swaps,bridge}-api/src/shared/mpc-chain-gate.ts`, on `swaps.controller.ts:82` and
  `bridge.controller.ts:61`). Rechecked: submit-tx workers still use intent-relay notifications and
  packets, with no MPC branch (see `process.md`).
- [V] Swap cancel from an MPC source is refused by the SDK ("not supported yet", `swap/SwapService.ts:1897-1902`).

## The mechanism

Intent-relay chain (today): the spoke's asset manager makes `connection` emit a message (src, dst, payload);
the intent relay carries it to the hub, where the user's hub wallet runs the payload. The MCP proves a deposit
from that message, read on the source chain (`src/services/swap/sources/types.ts:19-36`).

MPC-relay chain as a source [V unless tagged]:

1. Build. The SDK registers "hub wallet W runs data D" with the relay (`getDepositAddress`) and gets back the
   reserve (or Monad's deposit address), `memo = keccak256(abi.encode(W, D))` and W
   (`XrpSpokeService.ts:226-240`, `MpcRelayApiService.ts:56`). The relay derives W from `srcAddress`.
2. The user pays the reserve with that memo.
3. Someone notifies the relay of the tx (`submitDeposit`, idempotent) (`MpcRelayApiService.ts:28-31`).
4. [N] A verifier checks the payment (memo, reserve, success, depth, amount > 0, no expected-amount check); NEAR
   chain signatures sign; the hub executor calls `AssetManager.recvMessage(...)` on Sonic, minting to W and
   running D. `D` becomes `0x` unless the owner paid directly.
5. Record: `pending → submitted → attested → minted (→ swept)`, with `txs.source / nearSubmit / hubMint`.
   No `failed`: a dropped deposit stays `pending` (`MpcRelayApiService.ts:84-101`).

MPC-relay chain as a destination: the hub emits a `BridgeRequest`, not a message. The relay doesn't watch the
hub, so someone notifies it of the hub tx (`submitHubRelease {hubTxHash, logIndex, dstChainKey}`); the
release record's `txs.release` is the payout tx (`swap/SwapService.ts:2252-2260`,
`backendApi/detailedStatusRouting.ts:160-210`).

## The flow, step by step

| # | Step | What the MCP needs | Today | Difficulty |
|---|------|--------------------|-------|-----------|
| 0 | SDK `2.4` | Bump; its types gain Tron and the new chains (breaking) | — | Low |
| 1 | Catalog, addresses | From the SDK (`checkAddress` uses `encodeRecipient`, `src/services/sodax.ts:166`); mirror the org gate | Mostly there | Low |
| 2 | Preview / quote | Payout minimums and no partial fill to an MPC chain come back as `VALIDATION_FAILED` (`swap/SwapService.ts:1540-1543`): map them | Bridge mapped | Low |
| 3 | Prepare (MPC source) | Sender check; build via SDK raw (a relay write); check memo = `keccak256(abi.encode(W, D))` and W; new step chain types; Monad as an EVM transfer to a deposit address | New | **High** (sender check) |
| 4 | Sign and send | Agent's wallet; one format per chain (XRPL, TonConnect, CIP-30, Tron, Zcash) | Outside the MCP | Low for the MCP |
| 5 | Submit | Backend submit-tx if it relays MPC, else the SDK's `submitDeposit`; each chain's tx-hash spelling | New | Medium |
| 6 | Track the deposit | Relay record → `hubMint` hash → prove on Sonic that W ran D with the built amount | New, shared | Medium |
| 7 | On the hub | Intent / solver fill, bridge hub actions | Exists | — |
| 8 | Delivery to an MPC chain | Notify the hub release (if the backend doesn't), read the release record, report `sent` | New, shared | Medium |
| 9 | Cancel / recovery | Swap cancel unsupported by the SDK; funds held in W need a withdraw-auth (sign a message, per-chain scheme) | Missing | **High**, blocked |

## What is hard, and why

1. **Cancel and recovery (step 9): hardest, and blocked.** A user on an MPC chain can't send a tx to the hub:
   anything W must do for them (cancel, release a HookFailed hold) needs a signed withdraw-auth message, a
   different scheme per chain (TON `signData`, Cardano CIP-30 `signData`, XRP scheme 3), then a withdrawal
   ladder (`submitted → burned → attested → released`). The MCP has no sign-a-message step type. The SDK
   doesn't support cancel from an MPC source yet. Until then: refuse cancel, send held funds to the help desk.
2. **The sender check (step 3): safety-critical, and the MCP lacks the input.** In raw mode the SDK skips
   `assertSignerCanWithdraw` and leaves it to the caller (`XrpSpokeService.ts:222-224`). On XRP only an
   ed25519 key that is the account's own can ever withdraw (`XrpSpokeService.ts:339-352`); a secp256k1 or
   regular key strands the deposit on the hub. [J] The check needs the wallet's public key, and an XRP
   address doesn't reveal it: the MCP takes only `fromAddress`, so it needs a new input, a ledger lookup of
   a past signed tx, or the SDK exposing the check by public key. Other chains' rules not read yet.
3. **The relay is a write dependency with no failure state (steps 5, 8).** Deposits and hub releases happen
   only when notified, so if the backend doesn't notify, track becomes a writer. [N] Several silent cases read
   `pending` forever, never an error: an unknown deposit, a wrongly spelled id (a `0x` or uppercase Tron id),
   a payout whose fee is at least the amount (dropped in the hub verifier). `GET /fees` lists no Tron entry,
   so a below-fee payout can't be refused up front. The MCP can only time out and hand over to a person.
4. **The hub-side proof (step 6): one implementation for every chain, but three details.**
   - [N] The verifier doesn't check the amount, so the minted amount must be compared to the build's.
   - [N] D is dropped unless the owner paid directly: a payment from another account mints to W without
     running D, which reads as held on the hub, not delivered.
   - Follow-up verified: underlying mint and vault-share transfers are separate; T1 has no swap intent.
     SDK/MCP `HookFailed` ABI differs from deployment. See `process.md` for evidence and limits.
5. **The deposit address can't be pinned (step 3).** [N] The relay doc says the reserve "is not a constant…
   always pay the address from this response", and the SDK only warns on an unknown one. Monad's
   per-payload address comes from MPC derivation the MCP can't redo. The backend's build and the SDK's both
   take it from the same relay, so comparing them proves nothing about it. Accept the relay's answer, or ask
   the relay team for an authenticated reserve list.
6. **Per-chain steps and hashes (steps 3-5): small per chain, but mistakes are silent.** A wrongly spelled
   tx hash doesn't fail, it reads `pending` forever (item 3).
7. **The org gate (step 1).** [J] The bridge catalog is built from the SDK's packaged config, so after the
   bump it lists MPC chains to every caller while bridge-api serves them only to allowlisted orgs. The MCP
   must apply the same gate per caller key. Follow-up verified: the backend filters catalogs and refuses
   disallowed requests; this policy gate does not make its settlement pipeline MPC-ready (`process.md`).

## Why the "add a chain with little code" goal holds only partly

- Intent-relay chains and MPC chains as destinations: yes, mostly config from the SDK plus shared code.
- MPC chains as sources: the settlement mechanism is new (no `connection` message, a relay that must be
  notified, no failure state, withdraw-auth for anything on the hub). Items 3-6 are written once for all MPC
  chains. Item 2 and the step formats are per chain.

## Provisional order (superseded by ADR 0001)

1. SDK `2.4` once stable; mirror the org gate.
2. MPC chains as destinations, swap and bridge. Needs the backend's answer on who notifies hub releases.
3. One MPC source end to end (Tron or XRP): hub-side proof, sender check, cancel refused, held → help desk.
4. The other sources one at a time.
5. Withdraw-auth recovery, once the SDK supports cancel from MPC sources.

## Open questions, and who answers them

- Backend: agree the future MPC settlement contract; current submit-tx does not notify MPC.
- Relay: an authenticated reserve list, a failure state, fees for every chain.
- SDK: cancel from an MPC source; the "can withdraw" check by public key, without a wallet provider.
- Ours/SDK: shared proof with aligned deployed ABI and real swap/failure fixtures; each chain's
  raw-mode sender check. The mint-log question is answered in `process.md`.
