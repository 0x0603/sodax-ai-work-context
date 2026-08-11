---
type: knowledge
area: architecture
status: Stable
tags: [hooks, delivery-hook, swaps-api, intent, sdk, backend]
updated: 2026-08-11
related_issues: [gh-345]
related_decisions: []
---

# Delivery hooks are an SDK-only feature

A delivery hook routes an intent's output to `ISpokeReceiver(dstAddress).hook(token, amount, deliveryData)`
on the destination spoke instead of transferring it to the recipient. Two hooks exist today: HyperCore
deposit (#214) and Flint deposit (#347/#364).

**You can only build one through `@sodax/sdk`. The SODAX Swaps API v2 cannot construct one.** That is not
obvious from either side, because a hooked intent *does* travel through the API perfectly well once built.

## Why both halves are true

The SDK builds the intent **client-side first**, then decides whether to hand it to the backend:

```
SwapService.swap()
  → createIntent()                     SwapService.ts:454   ← hook resolved HERE
  → if (this.useBackendSubmitTx) …     SwapService.ts:473   ← backend only sees the finished intent
```

`HookService.resolveDelivery` (`HookService.ts:103-107`) overrides `dstAddress` with the hook's registry
address and derives `deliveryData`; `IntentDataService.composeIntentData` folds it into `Intent.data` as a
`DELIVERY` entry (or an `ARRAY[FEE, DELIVERY]` when a partner fee is present). By the time
`POST /swaps/submit-tx` is called, the hook is just two opaque hex strings — and the backend validates
`dstAddress` and `data` as bare `@IsHex()` with no length cap and no EOA check
(`sodax-backend/apps/swaps-api/src/api/swaps/dto/intent.dto.ts:107-122`). So it round-trips.

The API's **own** intent-building endpoints are a different surface: `POST /swaps/intents`,
`/swaps/approve`, `/swaps/allowance/check`, `/swaps/quote?includeTxData=true`, `/swaps/limit-orders`. Their
request body is `CreateIntentParamsV2` (`packages/types/src/backend/backendApiV2.ts:299-323`), which has no
`hook` and no `deliveryData`. `grep -riI 'hookKind|deliveryData|spokeHooks'` over the entire `sodax-backend`
repo returns **zero hits**.

## `CreateIntentParams.data` is a dead field — do not reach for it

It looks like the escape hatch. It is not, on either side:

- SDK: `data` is *required* on `CreateIntentParams` (`intent-types.ts:30`) and never read — both intent
  constructors overwrite it (`EvmSolverService.ts:131`, `SonicSpokeService.ts:324`). `git log -S
  'createIntentParams.data'` returns no commits, ever.
- Backend: `create-intent.dto.ts:107-114` advertises and `@IsHex`-validates it, then silently discards it
  (`swaps.service.ts:491-504`; `includeTxData` hardcodes `data: '0x'` at `:143`).
- Even if it were wired, it could not carry a hook: `Intent.data` is a **typed envelope**
  (`IntentDataService.composeIntentData`, `IntentDataService.ts:47-77`), not free-form calldata, and the
  hook address must simultaneously become `dstAddress`.

## Consequences worth remembering

- **A green end-to-end swap does not prove the backend accepted a hooked intent.**
  `SwapService.ts:473-483` falls back to the client-side relay on *any* backend non-success and returns an
  indistinguishable `SwapResponse`. To test API compatibility you must assert on the captured request body,
  not on the outcome.
- **`IntentDataType.DELIVERY = 3` is SDK-only.** The two hand-synced backend decoders know `ARRAY=0`,
  `FEE=1`, `HOOK=2` (`sodax-backend/packages/shared-utils/src/utils/common-utils.ts:6-10`;
  `apps/sodax-backend-dashboard/lib/server/decode-intent-data.ts:14-18`), so a hooked intent renders as
  `Unknown (type 3)` + raw hex in the dashboard. Fee accounting still works — the ARRAY walk finds the FEE
  entry regardless.
- **The registry's `supportedTokens` is metadata, not a gate.** `resolveDeliveryHook` (`HookService.ts:84-92`)
  never consults it; the only caller of `isHookSupportedToken` repo-wide is the demo's `SwapCard.tsx:136`.
  Don't describe a hook as "USDC only" in user-facing text on the strength of the registry entry alone.
- **Hooks are best-effort by design.** A hook that refuses hands the user the plain output token rather
  than reverting — reverting would wedge the cross-chain message. Nothing in the SDK predicts that
  outcome today, so any UI promising the hooked result is promising something unverified.
- Adding a hook kind without its payload schema is a compile error: `HOOK_DELIVERY_ABI` is declared
  `satisfies Record<HookKind, …>` (`HookService.ts:11-18`). Worth preserving.

## If you need hooks over HTTP

Nothing today. It needs `hook?`/`deliveryData?` on `CreateIntentParamsV2` + the backend DTO + the mapper,
and the backend pins a published `@sodax/sdk` from the pnpm catalog — so an SDK release and a catalog bump
come first.
