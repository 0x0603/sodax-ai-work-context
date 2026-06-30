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
