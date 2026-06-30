---
type: process
repo: sodax-sdks
github: 255
updated: 2026-06-30
---

# Process

## Log

### 2026-06-30 — Analysis + planning (no code yet)

1. Read issue #255 (via `gh issue view`; GitHub MCP was failing auth). It's a NEW
   implementation task, not a PR review. Reference = PR #210 (Swaps API v2).
2. Mapped the working tree (`feat/demo-solver-status-panel` @ `1e37cd91`). Found the
   Swaps API runtime foundation is NOT present locally — only the V2 *types* are.
3. Fetched `origin/feat/swaps-api-v2` (PR #210, HEAD `519d2fb2`) and `origin/main`.
   Merge-base = `3f71a0133d`. Pulled the full 132-file diff name-status list.
4. Read the current `BridgeService.ts` (850 lines) in full to ground the bridge domain.
5. Ran a multi-agent workflow (`bridge-api-plan-analysis`, 15 agents, ~1.26M tokens,
   286 tool calls, ~16 min): 8 agents deep-read the Swaps API reference (from
   `git show origin/feat/swaps-api-v2:<path>` / diffs), 5 agents deep-read the current
   Bridge implementation, then a synthesis agent wrote the plan and a critic agent
   reviewed it. All reads were against real code (no guessing).
6. Folded the critic's concrete fixes into `plan.md` (see Findings below).

Tooling note: the raw workflow output (digests + plan + critique) was saved to the
session scratchpad: `…/scratchpad/{PLAN.md,CRITIQUE.md,digests/00..12.json}`. The
distilled, corrected version lives in this folder's `plan.md` + `analysis-notes.md`.

### 2026-06-30 — Backend contract DECIDED (Q&A, still no code)

Resolved all 13 backend-contract questions in a grounded Q&A (every answer traced
against real swap/bridge source). Captured in `reference/backend-contract/`
(`README` + `01-routes` + `02-request-response-dtos` + `03-confirm-checklist` +
`04-decisions`). Priority locked: **SDK first (Phases 1–6), backend after** — the
`/bridge/*` endpoints don't exist yet; `useBackendSubmitTx` ships default-OFF.

Key findings (corrections to the original plan draft):

- **relayData (Q7):** bridge `submit-tx` must send the FULL `relayData {address,
  payload}`, not just `payload`. Swap relies on `intent.creator` as the relay
  envelope address; bridge has no intent but `relayData.address` (= `hubWallet`,
  `BridgeService.ts:495`) is that address. Dropping it breaks split-tx-chain relay
  (`relay-swap-tx.ts:74-78`).
- **Param naming (Q4):** chose **swaps convention** (`inputToken/outputToken/
  inputAmount/srcAddress/dstAddress`) over SDK bridge names; SDK maps at the API
  boundary. (Plan draft had recommended SDK-bridge names — flipped.)
- **Idempotency (Q12):** the re-relay idempotency the fallback needs is the GENERIC
  relay layer (shared `relayTxAndWaitPacket` + relayer dedupe
  `IntentRelayApiService.ts:195` + `e2e-relay.test.ts` test 2), already proven; the
  swap-only part (re-post intent) is exactly what bridge lacks/doesn't need. Lower
  risk than plan's Open Q#6 implied — flag OFF only until a bridge-flavored re-relay
  assertion is added.
- **Refund/cancel (Q11):** bridge has no intent-expiry refund; drop
  `relayedForRefundAt`/`intentCancelled`. Stuck bridge → `RecoveryService.withdrawHubAsset`
  (generic, out of band).
- **Bitcoin source (Q13):** feasible via Bound TRADING mode (raw PSBT from the Radfi
  backend via `radfi.createWithdrawTransaction`, needs only `accessToken` — no
  wallet). USER self-custody raw throws. Bridge must mirror swap's
  `extras.bound.accessToken` plumbing (currently absent in `createBridgeIntent` /
  `CreateBridgeIntentParams`); V2 mirror types `BitcoinBoundExtrasV2`/`SwapExtrasV2`
  already exist. (Earlier I wrongly called Bitcoin-via-API infeasible — corrected.)

### 2026-06-30 — plan.md reconciled to the 13 decisions (9-agent workflow)

Ran a reconcile workflow (7 gather/verify agents grounded against real source +
synthesize + adversarial critique; 9 agents, ~641K tokens, 111 tool calls). Applied 46
verified edits to `plan.md` so it matches the locked contract:

- `CreateBridgeIntentParamsV2` → swaps wire naming (`inputToken/outputToken/inputAmount/
  srcAddress/dstAddress`) + `bound?`/`srcPublicKey?`; SDK maps domain→wire (new mapper).
- submit-tx → FULL `relayData {address,payload}` (not `.payload`); `BridgeSubmitTxRequestV2`
  uses `RelayExtraDataResponseV2`.
- Tokens backend-served: `getTokens`/`getTokensByChain` on `IBridgeApiV2` + `useBridgeApiTokens`
  (`bridgeApi/` = 6 hooks); bridgeable-amount stays client-side.
- New §3 sub-step: Bitcoin-source-via-Bound plumbing (`BridgeExtras`, 4-arg `BridgeParams`,
  `createBridgeIntent` accessToken/srcPublicKey, lift effective-wallet for raw).
- Host #1: shared base — no `BridgeApiConfig` type / no `constants.ts` change;
  `resolveBridgeApiConfig` = unconditional `resolveBaseApiConfig`.
- Status #10/#11: 5-state, drop `intent_hash` + `relayedForRefundAt`/`intentCancelled`, tolerant schema.
- Idempotency #12: reframed re-relay as safe-by-construction (shared `relayTxAndWaitPacket` +
  relayer dedupe + generic e2e test 2); flag default-OFF + add a bridge e2e assertion.
- Open Questions → Decided (#1,2,3,4,5,8); only #7 (backend endpoint timeline) genuinely open.
- Dependency table flipped to ✅ (rebase DONE, scaffold `8fd58453`); Phase 0 marked done.

Critique verified all 44 changeset anchors verbatim/unique + groundings accurate against
source; folded the E15 wording fix (wallet-provider invariant scoped to `raw===false` for any
Bitcoin mode; `ensureRadfiAccessToken` to TRADING sub-branch) + 2 missed-section fixes
(dependency table, the `Extend (not duplicate)` block). Still SDK-first; no source code written yet.

## Findings

### Key architectural facts (verified)

- `SwapsApiService implements ResultifiedSwapsApiV2` — a mapped type that derives the
  class surface from the canonical `ISwapsApiV2` (adds trailing `config?: RequestOverrideConfig`,
  wraps return in `Promise<Result<T>>`). Constructor takes an ALREADY-RESOLVED flat
  `SwapsApiConfig`; the parent `BackendApiService` resolves it via `resolveSwapsApiConfig(config)`.
- Reachable as `sodax.api.swaps.*` (`this.api = this.backendApi`).
- Private `request<S>()` is the heart: `makeRequest` → `v.safeParse(schema, raw)` →
  `Result`. Two failure modes, both `SodaxError('EXTERNAL_API_ERROR', …, { feature:'backend',
  context:{ api:'backend', endpoint } })`: (a) transport error (carries `cause`); (b) 2xx
  body failing valibot (`context.reason='invalid_response_shape'`, `context.issues`).
- `SwapService.submitTx` + `fallbackSwapSteps` implement the backend-submit + client-fallback
  with ONE shared wall-clock deadline; poll interval 1s; reserve ~1/3 of remaining (cap 20s)
  for the fallback. Bridge mirrors this minus the intent/solver fields.
- Bridge is vault deposit + relay; `createBridgeIntent({ raw:true })` already yields the
  unsigned tx + `relayData` (the backend's raw-tx creation path). No intent/solver/quote/limit-order.

### Critic findings folded into plan.md

1. (moderate) Demo↔endpoint coupling for tokens — DECIDED: keep token list +
   bridgeable-amount client-side (reuse `useGetBridgeableTokens`/`useGetBridgeableAmount`),
   so `bridgeApi/` = 5 hooks; avoids asserting endpoints that may not exist.
2. (error) `GetBridgeTokensByChainResponseV2` must be `type = readonly BridgeTokenV2[]`,
   not an empty `interface {}` (which matches anything).
3. (minor) Import `PacketDataV2` from `./backendApiV2.js` (used in status result).
4. (minor) Bridge `SKILL.md` must DROP/reframe the "Migration v1→v2" section — no v1 Bridge API.
5. (minor) Keep the demo's max-bridgeable display + route gate (no UX regression).
   Plus: confirm `RelayExtraDataResponseSchema` is exported (else declare a trivial local schema);
   elevate idempotency (Open Q #6) to a default-off ship gate.

## Changes During Work

(none — planning only; no source changes in `sodax-sdks` yet)
