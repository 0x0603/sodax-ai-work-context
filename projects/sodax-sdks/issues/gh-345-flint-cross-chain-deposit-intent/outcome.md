---
type: outcome
repo: sodax-sdks
github: 345
status: Review delivered — backend follow-up #11 in PR (sodax-backend#1081, open); items 1-5 pushed to #364
updated: 2026-08-13
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

**Worth raising before #364 merges** (all cheap, all in-PR) — **done, 2026-08-13**. User (0x0603) chose
to push directly to AntonAndell's branch `feat/flint-hook-registry-entry` (commit `a04d8afe6`) rather than
a suggestion-comment or stacked PR, without pre-clearing it with AntonAndell first — mitigated with a
courtesy PR comment explaining the diff right after
(icon-project/sodax-sdks#364, comment `#issuecomment-5276095545`). Flag if AntonAndell pushes back.

1. Reword the changeset's "USDC only, matching the hook's on-chain behaviour" — `resolveDeliveryHook`
   never consults `supportedTokens`, so that reads as a guarantee the code does not make.
2. Resolve the contradiction between the two unreleased changesets ("the hook is not usable yet" vs
   "activating it end to end") — both ship in the same release.
3. Fix the example's stale gate comment (the SpokeAssetManager upgrade *is* live), read `minDeposit()` on
   chain instead of hardcoding it at `:37`, and use `spokeChainConfig[…].addresses.assetManager` instead of
   the literal at `:33`.
4. Add a `flint-deposit` script + README entry so the example is discoverable.
5. Add the `FLINT_DEPOSIT` case to the `resolveDelivery` describe — that is the function production calls.

Verification: `pnpm i && pnpm build:packages`, `packages/sdk` `tsc --noEmit` clean, `HookService.test.ts`
11/11 (was 10), full repo pre-commit gate (`checkTs`+`build`+`test`, `pnpm test` → 2080/2080 in
`@sodax/sdk`) green. `apps/node` has pre-existing unrelated `tsc` errors in `stacks.ts`/`stellar.ts`/
`sui.ts` (stale against current SDK API) — not touched, not introduced by this diff, confirmed via
`git diff` showing zero overlap.

**After merge:**

6. Docs (ask c) — `packages/sdk/docs/SWAPS.md` + `packages/swaps-api/README.md` + `packages/skills`.
   **`packages/skills` done 2026-08-13** (commits `4c5c7e63e` + `d690a11f5`, in #364) — a `claude[bot]`
   review flagged the same gap as should-fix, so it was pulled forward from "after merge" into the PR.
   Covered: `features/swap.md` (`hook?`/`deliveryData?` on the type block + a kind-neutral Delivery hooks
   section), `features/swaps-api.md` (`CreateIntentParamsV2` has no `hook` — that path can't express one),
   `reference/public-api.md` (hook exports). `pnpm check:ai` green.
   `packages/sdk/docs/SWAPS.md` and `packages/swaps-api/README.md` are **still open**.
7. Mocked backend-submit coverage for a hooked intent (ask b) — assert the captured request body carries
   the hook `dstAddress` and a DELIVERY envelope.
8. Registry-vs-chain assertion in the `e2e-tests` tier that already blocks CI: hook address has code,
   on-chain `minDeposit()` matches the SDK's assumption.
9. Enforce `supportedTokens` in `resolveDeliveryHook` — **behaviour change**, the current fixture asserts
   the opposite, needs the author's agreement.
10. Requirement 5, the pre-flight service — blocked on deciding where a third-party vault address lives
    (an optional field on `SpokeHookConfig` is the natural slot).
11. Backend PR, separate repo: `hook?`/`deliveryData?` on the intent-builder DTO + mapper + wire type;
    either wire up or delete the dead `data` field; `DELIVERY = 3` in both hand-synced decoders.
    **Precisely scoped 2026-08-12** — see `process.md` § "`/swaps/intents` hook-forwarding gap": the DTO
    field (`create-intent.dto.ts`) + one line in `buildRawIntentAction` (`swaps.service.ts:503`) is enough
    to make `hook` reach the SDK, since `createIntent`/`approve` already call the real
    `sodax.swaps.createIntent()` server-side. The pinned-SDK/registry bump is a *separate*, still-needed
    prerequisite specifically for `FLINT_DEPOSIT` to resolve without throwing — not a blocker for wiring
    the field itself.
    **Done, 2026-08-13**: the `hook?: HookRequestDto` field + forward line landed in
    icon-project/sodax-backend#1081 (closes tracking issue icon-project/sodax-backend#1080), branch
    `feat/forward-hook-param-to-swaps-createintent` off `development`. Verified `tsc --noEmit` clean,
    `biome lint` clean, `swaps.service.spec.ts` + `intent-dto.transform.spec.ts` 92/92 green, full
    pre-commit gate (`checkTs`+`test`+`lint-staged`, 20 packages) green. `HYPERCORE_DEPOSIT` now resolves
    end-to-end through the API; `FLINT_DEPOSIT` still throws "hook not registered" until the backend's
    pinned `@sodax/sdk`/`@sodax/types` (currently `2.1.0-rc.3`) bumps past a release containing #364 —
    confirmed by reading the installed package's `hooks.js`, where `FLINT_DEPOSIT` is still commented out.
    PR not yet merged (open, base `development`).
