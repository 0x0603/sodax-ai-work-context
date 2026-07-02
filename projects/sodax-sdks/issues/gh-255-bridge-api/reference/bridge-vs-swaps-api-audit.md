---
type: reference
repo: sodax-sdks
github: 255
status: Open
updated: 2026-07-02
tags: [bridge-api, swaps-api, audit, code-review, drift, reuse, parity, pr-261]
related_issues: [gh-1417-swaps-api-sdk]
---

# Bridge API vs Swaps API — Parity & Bug Audit

Multi-agent audit comparing the **bridge-api** implementation against the canonical
**swaps-api** on `main` (the "prime example" PR #210 mirrors), on the post-merge
working tree of `feat/bridge-api-v2` (HEAD `0b6c3152`, main fully merged in).

**Method:** 6 comparison dimensions fanned out in parallel (SDK HTTP client + config +
mapper · SDK feature service submit-tx/fallback/Bitcoin · types/DTOs + client config ·
dapp-kit hooks · demo app · drift-from-main git hunt); every candidate finding
adversarially verified against real code by an independent skeptic; then synthesized and
cross-referenced against the prior review [`pr-261-code-review.md`](pr-261-code-review.md).
**20 findings raised → 20 survived verification → 0 refuted.** 27 agents.

## Verdict

- **Nothing from PR #261 has been fixed since that review** — all 12 items (S1, S2a–e,
  S3a–b, S4a–d) re-verify as **still unfixed** at HEAD.
- **The only real correctness bug is S1** (`resolveBridgeApiConfig` routes bridge to the
  BASE host instead of the SWAPS host). The default flat `BaseApiConfig` path is
  unaffected, so it is **should-fix, not a blocker**.
- The audit **overturns** one PR #261 refutation: `createBridgeIntent` genuinely lacks the
  raw-Stacks `srcPublicKey` pre-flight guard that `SwapService.createIntent` carries (#235).
- **Every non-S1 finding fails safely** — a failed `Result`, never a wrong success, fund
  loss, or behavioural risk.

---

## 1. The only correctness bug — S1 (should-fix)

### `resolveBridgeApiConfig` aliases the BASE resolver instead of the SWAPS resolver

- **Where:** `packages/sdk/src/backendApi/apiConfig.ts:95-97`
  (`export function resolveBridgeApiConfig(config): BaseApiConfig { return resolveBaseApiConfig(config); }`).
  Test `apiConfig.test.ts:181` **enshrines the wrong behavior** ("uses the baseApiConfig
  slice … ignoring swapsApiConfig").
- **Why it's wrong:** the bridge controller is co-located on the **swaps host**
  (`@Controller('bridge')` in the swaps-api NestJS app). `resolveSwapsApiConfig` layers
  `base → swaps` so a divergent `swapsApiConfig.baseURL` wins; `resolveBridgeApiConfig`
  ignores `swapsApiConfig` entirely.
- **Failure scenario:**
  `new Sodax({ api: { baseApiConfig:{baseURL:base}, swapsApiConfig:{baseURL:swapsHost} } })`
  → every `sodax.api.bridge.*` call (and the opt-in `bridge()` backend submit-tx flow)
  hits `base/bridge/*` while `/bridge/*` actually lives on `swapsHost` → **404/401 on every
  bridge call**. Flat config (base == swaps) is unaffected, which is why tests pass.
- **Fix:** `return resolveSwapsApiConfig(config)` (or `layerConfigs(base, swaps)`); flip
  `apiConfig.test.ts:181-192` to expect the swaps host; reconcile the "shares the swaps
  host" docs/comments (S3b: `BRIDGE_API.md:102`, `features/bridge-api.md`, `apiConfig.ts:89`,
  `BridgeService.ts:93`, `BackendApiService.ts:199`). **Confirm with backend that `/bridge/*`
  is served on the swaps host** before landing.

---

## 2. New findings (not in PR #261)

| # | Finding | Category | Severity | Verdict |
|---|---------|----------|----------|---------|
| N1 | `createBridgeIntent` lacks the raw-Stacks `srcPublicKey` pre-flight guard (#235) — **overturns PR #261's refutation** | drift / error-taxonomy | should-fix (low) | CONFIRMED |
| N2 | `useBridgeApiAllowance` fires per keystroke (no debounce, not dialog-gated) | demo / perf-drift | should-fix | CONFIRMED |
| N3 | `createBridgeIntent` omits general wallet-provider + spoke-chain-key invariants (validates only Bitcoin provider) | drift / error-taxonomy | nit | CONFIRMED |
| N4 | Source `BitcoinSetupPanel` omits `nativeBalance` → "Your Wallet" BTC reads 0 when bridging FROM Bitcoin | demo / cosmetic | nit | CONFIRMED |
| N5 | `BridgeTokenV2` duplicates `SwapTokenV2` (7 fields + verbatim JSDoc; schemas duplicated too) | types / reuse | nit | CONFIRMED |
| N6 | Bridge JSON-safety guard covers only the response token, not the request surface (asymmetry vs swaps) | types / defensive | nit | CONFIRMED |
| N7 | `bridgeBody` built inline instead of the exported `toCreateBridgeIntentParamsV2` mapper | demo / reuse | nit | CONFIRMED |
| N8 | `SubmitBridgeTxStatusV2` union exported but never used as a field type (SDK/hook compare raw strings) | types / drift | nit (leave as-is) | CONFIRMED |

### N1 — raw-Stacks `srcPublicKey` guard missing (overturns PR #261)

- **Where:** bridge `packages/sdk/src/bridge/BridgeService.ts:604,631`; swaps ref
  `packages/sdk/src/swap/SwapService.ts:864`; deep catch `StacksSpokeService.ts:143`.
- PR #261 refuted this as "deliberate; the deposit layer handles a missing key." The audit
  re-confirms and disagrees on framing: `SwapService.createIntent` carries #235
  (`SwapService.ts:864-870`: `isStacksChainKeyType && raw===true → swapInvariant(extras?.srcPublicKey !== undefined, {field:'srcPublicKey'}) → VALIDATION_FAILED` early).
  `createBridgeIntent` never got the equivalent and doesn't import `isStacksChainKeyType`.
  Stacks **is** an intended bridge source (`BridgeExtras` keys `srcPublicKey` off
  `GetChainType extends 'STACKS'`, `BridgeService.ts:97-99`). A missing key is still caught,
  but only deep in `StacksSpokeService.deposit:143`, wrapped as `INTENT_CREATION_FAILED`
  with no field tag, after `getUserHubWalletAddress` + simulation. Live public path (not
  behind `useBackendSubmitTx`). No fund/correctness risk; only `error.code`, missing
  `context.field`, and lateness differ.
- **Fix:** import `isStacksChainKeyType` (already in the shared barrel) and add after the
  dust/token invariants (~`BridgeService.ts:602`):
  `if (isStacksChainKeyType(params.srcChainKey) && _params.raw === true) bridgeInvariant(extras?.srcPublicKey !== undefined, '…', { ...baseCtx, field: 'srcPublicKey' });`
  add a bridge test.

### N2 — allowance query fires per keystroke

- **Where:** `apps/demo/src/components/bridge-api/BridgeCard.tsx:144,167`;
  `packages/dapp-kit/src/hooks/bridgeApi/useBridgeApiAllowance.ts:33`.
- `bridgeBody` (`BridgeCard.tsx:144-161`) is an always-live `useMemo` with
  `inputAmount: parsedAmount.toString()`; `fromAmount` updates per keystroke
  (`BridgeCard.tsx:365`) with **no debounce** (no `useDebouncedValue` under `bridge-api/lib/`).
  `useBridgeApiAllowance` is top-level (not dialog-gated), `queryKey` includes
  `body.inputAmount` + `enabled: !!body` + `retry: 3`, so once both wallets are connected
  and tokens picked, typing "1000" fires ~4 `checkAllowance` POSTs (×3 on retry) against the
  canary API. Swaps fires **zero** until dialog-open and debounces the amount
  (`SwapCard.tsx:168`). Harmless functionally but on the bridge demo **default path** and
  diverges from the reference integrators copy.
- **Fix:** debounce the amount (reuse `swaps-api/lib/useDebouncedValue.ts`) or gate the
  allowance body behind the dialog like swaps.

### N3 — missing general invariants in `createBridgeIntent`

- **Where:** bridge `BridgeService.ts:574,608`; swaps ref `SwapService.ts:819,834`.
- `SwapService.createIntent` front-loads `isUndefinedOrValidWalletProviderForChainKey`
  (`SwapService.ts:820`) and `isValidSpokeChainKey(src)/(dst)` (`834-843`), all
  `VALIDATION_FAILED`. `createBridgeIntent` validates the provider **only** in the raw=false
  Bitcoin branch (`isBitcoinWalletProviderType`, `BridgeService.ts:611`) and never imports
  `isUndefinedOrValidWalletProviderForChainKey`. For a raw=false non-Bitcoin source with a
  mismatched-family provider, `SpokeService.deposit` (unlike `approve`) does not run the
  family guard, so it routes to the wrong-chain deposit and fails deep as
  `INTENT_CREATION_FAILED` vs swaps' up-front `VALIDATION_FAILED`. Provider omission is
  substantive; `isValidSpokeChainKey` omission is cosmetic (invalid chains still rejected via
  token resolution). Reachable mainly via casts / JS consumers; always a failed `Result`.
- **Fix:** mirror the top-of-`createIntent` invariants after the amount/token invariants
  (~`BridgeService.ts:602`).

### N4 — source Bitcoin panel shows 0 balance

- **Where:** `BridgeCard.tsx:196,515`.
- BridgeCard fetches a BTC balance only for the destination (`toBtcBalance`) and passes it to
  the destination panel; the source panel gets no `nativeBalance`, so `BitcoinSetupPanel`
  shows "Your Wallet: 0 BTC" and the Top-Up dialog's From balance reads 0 when bridging FROM
  Bitcoin. Display-only (`walletBalance` never caps input; readiness uses `tradingBalance`).
  Swaps supplies both sides (`SwapCard.tsx:530-536`). `apps/demo` is non-production UX.
- **Fix:** fetch the source BTC balance (`useBitcoinBalance` for `fromAccount.address` when
  `fromChainKey` is Bitcoin) and pass it as `nativeBalance` to the source panel.

### N5–N8 (type / reuse nits)

- **N5** `BridgeTokenV2` (`backendBridgeApiV2.ts:31-46`) duplicates `SwapTokenV2`
  (`backendApiV2.ts:103-118`) field-for-field with verbatim JSDoc; `BridgeTokenSchema`
  (`bridgeApiSchemas.ts:25-33`) duplicates `SwapTokenSchema`. Deliberate mirror → drift-only
  risk. Optionally alias/extract a shared `BackendTokenV2` + shared token schema.
- **N6** Swaps wires `_AssertJsonSafe` onto its REQUEST type (`CreateLimitOrderParamsV2`,
  `backendApiV2.ts:509-512`); the bridge guard is only on the RESPONSE token type
  (`backendBridgeApiV2.ts:59-60`) while `CreateBridgeIntentParamsV2` (76-101) is an
  interface with an ungated `bound?`. Zero runtime impact today. Low priority symmetry.
- **N7** `BridgeCard.tsx:144` hand-builds the wire DTO though the SDK exports
  `toCreateBridgeIntentParamsV2` (`BridgeApiService.ts:51`). Matches the swaps demo (also
  inline), so a missed-showcase nit; the inline build omits the optional `srcPublicKey`.
- **N8** `SubmitBridgeTxStatusV2` (`backendBridgeApiV2.ts:178`) referenced only in JSDoc;
  field is `status: string` (`:200`); SDK/hook compare raw literals. **Deliberate** tolerant
  `v.string()` design (schema `bridgeApiSchemas.ts:11-13`, asserted by
  `BridgeApiService.test.ts:209`). Safe to leave as-is.

---

## 3. Improvements to inherit from `main`

| Improvement | Files | Why |
|-------------|-------|-----|
| Raw-Stacks `srcPublicKey` invariant (#235) | `SwapService.ts:864` → `BridgeService.ts:604` | Match error taxonomy of the canonical reference (N1) |
| Front-loaded provider + spoke-chain-key invariants | `SwapService.ts:819,834` → `BridgeService.ts:574` | `VALIDATION_FAILED` up front vs deep `INTENT_CREATION_FAILED` (N3) |
| Debounced amount + dialog-gated allowance | `SwapCard.tsx:168`, `swaps-api/lib/useDebouncedValue.ts` → `BridgeCard.tsx:167` | Stop per-keystroke backend traffic (N2) |
| Source-chain not-signable amber warning | `SwapCard.tsx:538` → `BridgeCard.tsx:481` | Explain why the action is disabled (S4d) |
| Source `BitcoinSetupPanel` `nativeBalance` wiring | `SwapCard.tsx:530` → `BridgeCard.tsx:515` | Correct wallet balance display (N4) |
| Friendly chain picker (`SelectChain`) usage | `SwapCard.tsx:467`, `SelectChain.tsx:19` → `BridgeCard.tsx:354` | Fix raw-key UX + retire dead file (S4a) |
| Status union used AS the DTO field type | `backendApiV2.ts:597` → `backendBridgeApiV2.ts:178` | Optional hardening; keep schema tolerant (N8) |

---

## 4. PR #261 review items — all still unfixed

**should-fix:** S1 (host routing — §1) · S2b (submit-tx poll loop / deadline / reserve math
duplicated verbatim `BridgeService.ts:521-541` vs `SwapService.ts:591-624`; extract shared
`pollBackendSubmitTx`) · S3a (`packages/skills/AGENTS.md` router omits the
`sodax-sdk/bridge-api` granular skill in all three enumerations — not caught by
`check:ai-structural`) · S3b ("shares the swaps host" docs; same root as S1) · S4c
(`bridge-api/lib/signAndBroadcast.ts` ≈ verbatim copy of the swaps dispatcher; extract one
shared dispatcher or promote to `@sodax/dapp-kit`).

**nit:** S2a (stale `createBridgeIntent` docstring "Bitcoin only raw:false",
`BridgeService.ts:560`) · S2c (missing `useBridgeApiTokensByChain` hook) · S2d
(`_ContainsBigint`/`_AssertJsonSafe` duplicated `backendBridgeApiV2.ts:264-281` vs
`backendApiV2.ts:911-930`; extract shared un-barreled `_jsonSafe.ts`) · S2e (`BridgeExtras`
re-inlines `srcPublicKey`/`bound` slots vs reusing `SrcPublicKeySlot`/`BitcoinBoundSlot`
from `intent-types.ts:56-78`) · S4a (raw `SpokeChainKey` `<Select>`s + dead `SelectChain.tsx`)
· S4b (dead `bridge-api/lib/mappers.ts`; `toXToken` never imported) · S4d (silent disable when
`!isSourceSignable`; branch unreachable today).

## 5. Refuted

None — all 20 findings survived adversarial verification.

---

## 6. Recommended fix order

1. **S1** (only correctness item): `resolveBridgeApiConfig` → swaps layering + flip
   `apiConfig.test.ts:181` + reconcile the "shares the swaps host" docs/comments (S3b).
   Confirm the backend serves `/bridge/*` on the swaps host.
2. **N2 allowance-per-keystroke**: debounce the amount or dialog-gate the allowance body in
   `BridgeCard` (default demo path).
3. **SDK parity guards**: add the raw-Stacks `srcPublicKey` invariant (#235, N1) and the
   general `isUndefinedOrValidWalletProviderForChainKey` + `isValidSpokeChainKey` invariants
   (N3) to `createBridgeIntent`, with tests, for `VALIDATION_FAILED` parity.
4. **Reuse extractions**: shared `pollBackendSubmitTx` (S2b), shared `signAndBroadcast`
   dispatcher (S4c), shared `_jsonSafe.ts` (S2d), `BridgeExtras` slot reuse (S2e).
5. **Surface/parity completeness**: `useBridgeApiTokensByChain` (S2c) + add bridge-api to the
   `packages/skills/AGENTS.md` router enumerations (S3a).
6. **Demo cleanups**: wire `SelectChain` + delete `mappers.ts` (S4a/S4b), pass source Bitcoin
   `nativeBalance` (N4), add the not-signable warning (S4d), optionally use
   `toCreateBridgeIntentParamsV2` (N7).
7. **Docstring + type nits**: fix the stale Bitcoin docstring (S2a) and the low-value type
   items (N5 `BridgeTokenV2` dup, N6 request-surface guard asymmetry, N8 union-as-field-type).
