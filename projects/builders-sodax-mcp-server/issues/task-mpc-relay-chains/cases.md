---
type: plan
repo: builders-sodax-mcp-server
github:
updated: 2026-11-26
tags: [mpc-relay, swap, bridge]
related_issues: [gh-147, gh-118, gh-115]
related_decisions: [0001-mpc-settlement-ownership-and-launch-gate]
---

# MPC chains: swap vs bridge, source vs destination

The case-by-case companion to `plan.md` (mechanism) and ADR 0001 (policy: the SDK owns chain rules and the
shared hub proof, the backend drives settlement, the MCP stays an adapter; MPC source execution stays
disabled until then). "Legs to drive" below are the backend's under ADR 0001; the MCP's own column is
what it adds as an adapter.

Tags: **[V]** verified in code (cited), **[N]** earlier context note, **[J]** judgement. SDK `@sdks@2.4.0-rc.1`
(paths under `packages/sdk/src/`), backend `dc00438a`, MCP `9ef5d54`.

## Verdict

| Case | Legs to drive | The MCP adds | Difficulty |
|------|---------------|--------------|-----------|
| S1 swap, intent-relay/hub source → MPC destination | none: the solver notifies (unchecked live) | preflight mapping; read the release after `solved` | Low-medium |
| S2 swap, MPC source → intent-relay/hub destination | D, P | quote binding, hub intent proof, refusals | **High**, blocked |
| S3 swap, MPC → MPC | D, P (+ S1) | S2 + S1 | **High**, blocked |
| B1 bridge, intent-relay spoke → MPC | R | `BridgeRequest` check, release read | Medium |
| B2 bridge, Sonic → MPC | R | as B1 | Low-medium |
| B3 bridge, MPC → Sonic | D | existing `deliveredOnHub` on the hub-mint receipt | Medium |
| B4 bridge, MPC → intent-relay spoke | D, I | existing packet proof from the hub-mint tx | Medium-high |
| B5 bridge, MPC → MPC | D, R | B3 + B1 checks | Medium-high |

Why the axes matter:
- **Swap vs bridge:** a swap has a solver in the middle. The solver fills on the hub and is described as
  notifying the relay of its fill (`swap/SwapService.ts:747-748`), so a swap's destination leg needs no notify.
  A bridge has nobody else: every leg the backend doesn't drive is undriven.
- **Source vs destination:**
  - An MPC source adds a deposit leg the backend doesn't drive today.
  - An MPC destination adds a release leg that someone must notify.
  - A swap from an MPC source can't be cancelled, and its only exit, the deadline refund, pays back through a
    release leg nothing is shown to notify.

## Legs

Each case is a chain of these. Mechanism detail in `plan.md`.

- **D. Deposit, MPC source → hub** [V `shared/services/spoke/SpokeService.ts:1830-1912`]:
  1. register (W, D) with the relay;
  2. the user pays;
  3. `submitDeposit`;
  4. the record reaches `minted`; `txs.hubMint` is the hub tx.
  The SDK doesn't read the source tx; it waits on the record.
- **R. Release, hub → MPC destination** [V `SpokeService.ts:1584-1625`, `:1699-1708`]:
  - the hub tx must hold exactly one asset-manager `BridgeRequest` log naming that chain;
  - `submitHubRelease {hubTxHash, logIndex, dstChainKey}`;
  - read until `txs.release`.
- **I. Intent relay from an MPC-made hub tx** [V `SpokeService.ts:1922-1940`]: the intent relay doesn't know a
  hub tx the MPC relay produced. Its outbound message reaches an intent-relay spoke only after that hub tx is
  submitted to the intent relay.
- **P. Solver post-execution** [V `swap/SwapService.ts:1150-1200`]: an intent created by an MPC mint is filled
  only after `postExecution({intent_tx_hash: hubMint})`.
- **W. Withdraw-auth** [V `recovery/RecoveryService.ts`]: recovery from an MPC chain returns a `trackingId`
  (a signed message, not a tx). Swap cancel has no such path (`swap/SwapService.ts:1897-1902`).

## Preflight rules the SDK enforces [V]

**Swap** (`shared/utils/shared-utils.ts:253-330`, `swap/SwapService.ts:1600-1655`):
- no partial fill to or from an MPC chain;
- an MPC source needs a deadline;
- production allows only the solver's listed tokens on an MPC leg;
- the output minimum, and for an MPC source the refund (input less fee), must clear `MpcRelayPayoutMinimums`;
- XRPL recipients must be ready: the destination, and the source for refunds;
- an XRPL issued-token output needs `minOutputAmount` at least half a fresh quote.

**Bridge** (`bridge/BridgeService.ts:1076-1090`, `:1312-1320`):
- the delivered amount must clear the minimum;
- an XRPL recipient must be ready.

**All:** XRPL is the only chain whose recipient is checked (`SpokeService.ts:1714-1745`).

## Swap cases

**S1. Intent-relay or hub source → MPC destination: low-medium**

The source works as today: swaps-api submit-tx relays and post-executes; then the solver fills and notifies.
- The MCP's track ends at `solved` with `fillTxHash` (`src/services/swap/track.ts:492-500`). On an MPC
  destination, `solved` is not a payout: [N] a below-fee payout is dropped silently and reads `pending` forever.
- Add: read the release from `fillTxHash` (`getHubRelease`) and report `sent` with the payout hash, or time out
  to a person.
- Map the preflight refusals.

**S2. MPC source → intent-relay or hub destination: high, blocked**

Legs: D, P, then the normal fill and delivery. Backend submit-tx doesn't take this source today.
- MCP as adapter:
  - bind the build to the quote;
  - prove on the hub that the mint created the exact quoted intent (the hub-source intent check, gh-115);
  - refuse what the SDK can't support.
- Blocking:
  - no cancel, and the deadline refund's release leg has no owner. [N] On 2026-11-02 refund legs read
    `pending` empty, unpaid.
  - D is dropped when the payer isn't the owner: the mint lands in W with no intent.

**S3. MPC → MPC: high, blocked.** S2 plus S1.

## Bridge cases

Bridge-api's build route still matters (hub simulation, comparison with the SDK). The SDK skips backend
submission for any bridge with an MPC end (`bridge/BridgeService.ts:197-203`).

- **B1. Intent-relay spoke → MPC: medium.**
  - Legs: the spoke → hub leg as today, then R.
  - Add: preflight; on the hub tx (`row.result.dstIntentTxHash`), check the single `BridgeRequest` carries the
    recipient and the delivered amount; read the release; report `sent`.
- **B2. Sonic → MPC: low-medium.** B1 from the user's own hub tx, which the MCP already checks.
- **B3. MPC → Sonic: medium.**
  - Legs: D. D ends in a hub transfer to the recipient (or a wS unwrap), so the existing `deliveredOnHub` check
    on the hub-mint receipt is the proof.
  - [V] A native route with an MPC end (vault = hub asset) has no vault limit (`bridge/BridgeService.ts:1583-1596`):
    `checkBridgeLimit` must not refuse it for lack of one.
  - MPC sources may bridge to the hub asset itself (`:1752-1762`).
- **B4. MPC → intent-relay spoke: medium-high.** Legs: D, then I. The existing packet proof applies once the
  hub-mint tx has been submitted to the intent relay.
- **B5. MPC → MPC: medium-high.** D, then R, both on the hub-mint tx.

## Cross-case findings

1. **Undriven legs.** D, R, I and P are each idempotent, but none is driven by the backend today (`process.md`).
   ADR 0001 gives them to the backend. Without that, the MCP would turn into a relay driver against its "never
   polls, never resubmits" track contract and its in-memory store.
2. **No failure state.** [N] An unknown deposit, a wrongly spelled id and a below-fee payout all read `pending`
   forever. Build every relay id through SDK functions, never by hand.
3. **`HookFailed` on the hub is `HookFailed(address,string)`.** [V on chain, 2026-11-25] Sonic asset manager
   `0x60c5…37C0` (`onchain find 'sonic asset manager'`): 7 logs with the string topic `0xfc062a14…`, 0 with the
   bytes topic `0x85c46289…`, over blocks 79.1M–83.1M. The log has no indexed parameter; data word 0 is the
   wallet. The SDK ABI uses the bytes topic (checked on `2.3.0-rc.4`). gh-147 did too at `9ef5d54`, so its
   bridge track never saw a real HookFailed (in_transit, then a person: safe, no recovery advice). Fixed in
   gh-147 `997f768` (`src/services/swap/sourceTx.ts:28`, string topic); the SDK ABI fix is still upstream.
4. **The org gate meets a shared catalog.** [V] The swap catalog is one process-wide cache refreshed under
   whichever request triggers it (`src/services/swap/tokens.ts:87-112`). The bridge catalog comes from the SDK's
   config. [V] For an org outside `MPC_ALLOWED_ORG_IDS` the backend answers 400 to any request naming an MPC
   chain and strips MPC chains from responses (`packages/shared-nest-http/src/interceptors/mpc-chain-gate.interceptor.ts`).
   [J] MPC visibility in the MCP would follow whoever refreshed last: filter per caller, or hide MPC chains.
5. **XRPL specifics.** Recipient readiness covers the destination and a swap's refund to the source; an
   issued-token output needs the half-quote minimum; only XRP needs the sender key check (`plan.md`).

## Order, within ADR 0001

1. Catalog and preview work gated per caller; no execution.
2. Destination cases (S1, B2, B1) once someone owns R where needed.
3. Bridge sources (B3, then B4, B5) once the backend drives D and I and the shared hub proof exists.
4. Swap sources (S2, S3) last: they also need cancel or an owned refund leg.
