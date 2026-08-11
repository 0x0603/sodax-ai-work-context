---
type: plan
repo: sodax-sdks
github: 345
updated: 2026-08-11
---

# Plan

## Goal

Answer the reviewer's message on PR #364, and record how far #345 actually got so nobody re-derives it.

The message is three asks. Each needs a different kind of answer:

| Ask | What would close it |
| --- | --- |
| (a) "see if this is **fully compatible**" | A written verdict distinguishing the SDK's default backend-submit path (works) from the API's own intent-building endpoints (cannot express a hook). Not a yes/no. |
| (b) "**test this against API**" | An offline contract test asserting the submit-tx request body carries the hook, plus a `FLINT_DEPOSIT` case in the `resolveDelivery` describe. The existing mainnet smoke run does not count — see Approach. |
| (c) "include in any **API docs** how to use hooks with the API" | A delivery-hooks section in the mirrored docs, plus the `packages/skills` bundle that `AGENTS.md:109` mandates. |

## Approach

**On (a) — the split that matters.** `SwapService.swap()` builds the intent client-side *first*
(`SwapService.ts:454` `createIntent()`), and only then decides whether to hand it to the backend
(`:473` `if (this.useBackendSubmitTx)`). So the hook is already baked into `dstAddress` and `data` before
the API sees anything. That is why the default path works despite the API having no concept of a hook. The
API's *own* intent-building endpoints are a different surface and genuinely cannot express one.

**On (b) — why the smoke run is not evidence.** `SwapService.ts:473-483` falls back to the client-side
relay on *any* backend non-success, then returns an indistinguishable `SwapResponse`. A green run is
equally consistent with "the backend accepted the hooked intent" and "the backend rejected it and the
client relayed it itself". The test has to assert on the request body, not on the outcome.

**On (c) — where docs go.** `packages/sdk/docs/SWAPS.md` and `packages/swaps-api/README.md` are both
mirrored to docs.sodax.com via `scripts/gitbook-sync-map.json`, so cross-links out of them must be
absolute `https://github.com/icon-project/sodax-sdks/blob/main/…` or `pnpm check:doc-links` fails.

**Scope discipline.** #364 is a one-line registry activation and should stay that. Everything the audit
found splits into three buckets: defects *in* #364, gaps #364 merely makes *reachable* (pre-existing since
the HyperCore hook in #214), and #345 requirements nobody built. Only the first belongs in a
change-requested; the rest go in the PR thread as prose. No follow-up issues.

## Steps

1. Record the audit in this folder (`issue.md` / `process.md` / `outcome.md`) + a reusable
   `knowledge/delivery-hooks-are-sdk-only.md`. **← this step**
2. Draft the PR #364 comment. Terse, human, a few lines. Do not post until asked.
3. Docs (ask c): `packages/sdk/docs/SWAPS.md` — extend the `CreateIntentParams<K>` block at `:368-387`
   with `hook` and `deliveryData`, then add a `## Delivery Hooks` section covering the payload shape, the
   `dstAddress` override, the registry as source of truth, and the best-effort fallback. Then
   `packages/swaps-api/README.md` (what the API can and cannot do today) and
   `packages/skills/skills/sodax-sdk/integration/knowledge/features/swap.md` + `.../reference/public-api.md`.
4. Tests (ask b): the `FLINT_DEPOSIT` case in `HookService.test.ts:86-110`; a hooked-intent assertion on
   the captured submit-tx body in `SwapService.test.ts:2744` (reuse the existing `sodaxBE` + spy harness);
   and a registry-vs-chain check in `packages/sdk/src/e2e-tests/` — that tier already blocks CI and its
   stated purpose is exactly "assert static config in `@sodax/types` is in sync with on-chain state".

## Verification

- `cd packages/types && pnpm build` **before** running SDK tests — otherwise the SDK does not see the new
  registry entry.
- `cd packages/sdk && npx vitest run src/swap/HookService.test.ts src/swap/SwapService.test.ts`
- `pnpm check:doc-links` after any mirrored doc; `pnpm check:ai` after `packages/skills`.
- Format only the files touched — `main` has Biome drift and a repo-wide `pnpm pretty` rewrites unrelated
  files.

## Risks

- **Enforcing `supportedTokens` is a behaviour change, not a fix.** The existing fixture
  (`HookService.test.ts:87-99`) asserts the *non*-enforcing behaviour on purpose. Changing it needs the
  author's agreement, so it stays out of scope here.
- **Requirement 5 (pre-flight) is blocked on a config decision**, not on effort: flUSD cannot be an
  `XToken` (`packages/types/src/chains/tokens.ts:23-32` requires `hubAsset` + `vault`), and there is no
  slot for a third-party vault address. An optional field on `SpokeHookConfig` (`hooks.ts:29-39`) is the
  natural home, but that is someone's call.
- The example script is outside every CI gate (`apps/node/package.json:44` `"test": "true"`, root turbo
  `--filter=!./apps/node`), so anything asserted only there rots silently.
