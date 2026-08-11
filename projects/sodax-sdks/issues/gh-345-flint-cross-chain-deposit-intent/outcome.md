---
type: outcome
repo: sodax-sdks
github: 345
status: Review delivered — follow-up work not started
updated: 2026-08-11
---

# Outcome

- PR: #347 (merged 2026-08-06), #364 (open, reviewed here)
- Commits: none of mine — review only
- Tests: none run; the audit was static + one read-only on-chain check (see `process.md` § Refuted #1)

## Summary

**PR #364 is clean and correctly scoped for what it claims to be** — a one-entry registry activation with
a real deployed address behind it, and its release gate genuinely cleared (the SpokeAssetManager upgrade is
live on mainnet). It should not be blocked over the gaps below; most of them predate it.

**But it answers none of the reviewer's three asks, and root issue #345 is closed prematurely.**

### Root issue #345

| Requirement | Verdict |
| --- | --- |
| Flint service/module with a deposit builder | **not delivered** |
| Route any spoke asset → USDC on Ethereum | delivered (via generic routing) |
| dst = hook, `data = abi.encode(recipient)` | **delivered** |
| Address book: hook + vault + flUSD | partial — hook only; vault/flUSD blocked on a config-shape decision |
| **Pre-flight quote against live vault state** | **not delivered — 0%** |
| Type-safe params + validation | partial — zero-recipient guard yes; output-token and minDeposit no |
| Intent built against actually-delivered USDC | satisfied structurally |
| No orphaned `requestDeposit` on routing failure | inherited, unproven |
| Unit tests + mainnet-fork integration test | partial — units only |

Requirement 5 — the one the issue itself called *"the interesting part"* — has no home in either PR.
`HookService` has no `async`/`readContract` at all, so it is structurally incapable of the live-vault read
the issue describes. Every "this will fall back to USDC, not shares" warning the issue asked for is absent.

**#345 auto-closed 2 seconds after #347 merged**, four days before the hook was deployed, every checkbox
unticked. That is a `Closes #345` side effect, not a decision — worth flagging.

### The reviewer's message

| Ask | Verdict | One-line reason |
| --- | --- | --- |
| (a) "fully compatible" | **half** | The default backend-submit path works because the SDK builds the intent client-side *before* handing it over, and the backend validates `dstAddress`/`data` as bare `@IsHex()`. The API's own intent-building endpoints (`POST /swaps/intents` et al.) cannot express a hook at all, and `CreateIntentParams.data` is not a workaround — it is a dead field both constructors overwrite. |
| (b) "test this against API" | **no** | No test touches a hooked intent through any API surface, `resolveDelivery` is never tested with `FLINT_DEPOSIT`, and the mainnet smoke run cannot distinguish backend acceptance from silent client-side fallback (`SwapService.ts:473-483`). |
| (c) "API docs for hooks" | **no** | Zero delivery-hook content in any `.md` in either repo. `SWAPS.md:368-387` documents 12 `CreateIntentParams` fields and omits `hook` and `deliveryData` outright. |

## What Changed

Nothing in `sodax-sdks`. This folder plus
[`knowledge/architecture/delivery-hooks-are-sdk-only.md`](../../../../knowledge/architecture/delivery-hooks-are-sdk-only.md).

## Follow-ups

Ranked. Everything here goes in the **PR thread as prose** — no follow-up issues.

**Worth raising before #364 merges** (all cheap, all in-PR):

1. Reword the changeset's "USDC only, matching the hook's on-chain behaviour" — `resolveDeliveryHook`
   never consults `supportedTokens`, so that reads as a guarantee the code does not make.
2. Resolve the contradiction between the two unreleased changesets ("the hook is not usable yet" vs
   "activating it end to end") — both ship in the same release.
3. Fix the example's stale gate comment (the SpokeAssetManager upgrade *is* live), read `minDeposit()` on
   chain instead of hardcoding it at `:37`, and use `spokeChainConfig[…].addresses.assetManager` instead of
   the literal at `:33`.
4. Add a `flint-deposit` script + README entry so the example is discoverable.
5. Add the `FLINT_DEPOSIT` case to the `resolveDelivery` describe — that is the function production calls.

**After merge:**

6. Docs (ask c) — `packages/sdk/docs/SWAPS.md` + `packages/swaps-api/README.md` + `packages/skills`.
7. Mocked backend-submit coverage for a hooked intent (ask b) — assert the captured request body carries
   the hook `dstAddress` and a DELIVERY envelope.
8. Registry-vs-chain assertion in the `e2e-tests` tier that already blocks CI: hook address has code,
   on-chain `minDeposit()` matches the SDK's assumption.
9. Enforce `supportedTokens` in `resolveDeliveryHook` — **behaviour change**, the current fixture asserts
   the opposite, needs the author's agreement.
10. Requirement 5, the pre-flight service — blocked on deciding where a third-party vault address lives
    (an optional field on `SpokeHookConfig` is the natural slot).
11. Backend PR, separate repo: `hook?`/`deliveryData?` on the intent-builder DTO + mapper + wire type;
    either wire up or delete the dead `data` field; `DELIVERY = 3` in both hand-synced decoders. Needs an
    SDK release + catalog bump first.
