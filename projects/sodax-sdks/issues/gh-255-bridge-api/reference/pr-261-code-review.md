---
type: reference
repo: sodax-sdks
github: 255
status: Open
updated: 2026-06-30
tags: [bridge-api, code-review, pr-261, clean-code, reuse]
---

# PR #261 — Code Review (post-implementation)

Adversarial multi-agent review of PR #261 (Bridge API, gh-255). Base `feat/swaps-api-v2`
→ HEAD `d09e2ff1`; 43 files (+3198/−51). 9 reviewers fanned out per scope, every finding
verified adversarially against the real code: **22 raw → 16 survived, 6 refuted**.

**Verdict: `request-changes`** — no blockers (the default flat-config path works and ships),
but several **should-fix**: one latent correctness bug (host routing under `CustomApiConfig`),
two dead demo files, and reuse duplication (the review's stated priority).

> Findings are grouped by scope, deduped to the primary location (duplicate manifestations of
> one root cause are noted inline). Nothing fixed yet — this is the to-do list.

## Scope 1 — Problem & Solution

### S1 · should-fix · `packages/sdk/src/backendApi/apiConfig.ts:96` — bridge host routing (CONFIRMED)

`resolveBridgeApiConfig` is an alias of `resolveBaseApiConfig` (returns only the `baseApiConfig`
slice for a `CustomApiConfig`), but the bridge controller is documented as **co-located with
swaps** (`@Controller('bridge')` in the swaps-api NestJS app, "served on the shared swaps host"
— `backendBridgeApiV2.ts:5`). `resolveSwapsApiConfig` layers base→swaps so a divergent
`swapsApiConfig.baseURL` wins; `resolveBridgeApiConfig` ignores `swapsApiConfig` entirely.

- **Impact:** `new Sodax({ api: { baseApiConfig:{baseURL:base}, swapsApiConfig:{baseURL:swapsHost} } })`
  → `sodax.api.bridge.*` calls `base/bridge/*` while `/bridge/*` actually lives on `swapsHost` →
  every bridge call (and the opt-in `bridge()` backend submit-tx flow) 404s. **Flat-config default
  is unaffected** (base==swaps), which is why all tests pass.
- **Root-cause group:** internal inconsistency of Decision #1 — the comments say "swaps host" but
  the code uses the base host. Also surfaces as **S3b** (`BRIDGE_API.md:102` Configuration claim),
  the `bridge-api.md:16` intro wording, and the `apiConfig.ts:90` / `BackendApiService.ts:199`
  comments.
- **Fix:** `resolveBridgeApiConfig` should mirror swaps — `return resolveSwapsApiConfig(config)`
  (or `layerConfigs(config.baseApiConfig, config.swapsApiConfig)`). Then update
  `apiConfig.test.ts:181` (the case "uses the baseApiConfig slice … ignoring swapsApiConfig"
  **codifies the wrong behavior**) and reconcile the three "shares the swaps host" comments + the
  two docs. If bridge is genuinely meant to live on the base host, instead fix all the docs/types
  that claim the swaps host.

## Scope 2 — Core SDK (`packages/{types,sdk,dapp-kit}`)

### S2a · should-fix · `packages/sdk/src/bridge/BridgeService.ts:547` — stale Bitcoin docstring (CONFIRMED)

`createBridgeIntent` docstring still says "Bitcoin is only supported with `raw: false`", but this
PR added raw-Bitcoin support (effective-wallet now derived for raw too; `BridgeExtras.bound`).
Public doc now misleads integrators into thinking raw Bitcoin bridge is unsupported — the opposite
of the new behavior. **Fix:** update the docstring to cover both modes (raw derives the Bound
deposit address; non-raw additionally needs a Bitcoin wallet provider + Radfi auth in TRADING mode).

### S2b · should-fix (reuse) · `packages/sdk/src/bridge/BridgeService.ts:510` — submitTx poll loop duplicated (CONFIRMED)

`BridgeService.submitTx` duplicates `SwapService.submitTx`'s backend submit-tx state machine almost
verbatim (reserve/deadline math, 1s poll loop, terminal-state handling). Timing/budget logic for a
financial relay flow now lives in two places — a change to the reserve fraction, poll interval, or
terminal set in one silently diverges from the other. **Fix:** extract a shared
`pollBackendSubmitTx({ getStatus, deadline })` helper returning a normalized terminal result; each
service builds its feature-specific success value from it. *(Most impactful item for the refactor.)*

### S2c · should-fix · `packages/dapp-kit/src/hooks/bridgeApi/index.ts` — missing `useBridgeApiTokensByChain` (CONFIRMED)

The SDK ships + tests `sodax.api.bridge.getTokensByChain`, and the swaps mirror has
`useSwapsApiTokensByChain`, but no bridge hook exists → the dapp-kit surface doesn't match the
parity it claims; consumers must call the SDK directly or fetch the whole map and filter. **Fix:**
add `useBridgeApiTokensByChain.ts` (mirror `useSwapsApiTokensByChain.ts`) + export it, OR drop
`getTokensByChain` from the SDK if a per-chain hook is intentionally out of scope.

### S2d · nit (reuse) · `packages/types/src/backend/backendBridgeApiV2.ts:265` — JSON-safety guards duplicated (CONFIRMED)

`_ContainsBigint` / `_AssertJsonSafe` are byte-for-byte copies of the `backendApiV2.ts` versions.
The recursive conditional types can silently drift. **Fix:** extract to a shared non-exported
`backend/_jsonSafe.ts` (kept out of the barrel) imported by both.

### S2e · nit (reuse) · `packages/sdk/src/bridge/BridgeService.ts:87` — `BridgeExtras` re-inlines slot types (CONFIRMED)

`BridgeExtras` re-inlines the `srcPublicKey`/`bound` conditional slots instead of reusing the
helpers `SwapExtras` is built from. **Fix:** `Omit<SwapExtras<K>, 'partnerFee'>`, or export
`SrcPublicKeySlot`/`BitcoinBoundSlot` from `intent-types.ts` and reuse.

## Scope 3 — `packages/skills`

### S3a · should-fix · `packages/skills/AGENTS.md` (L13 / L29 / L66) — router inventory out of sync (CONFIRMED)

The new `sodax-sdk/bridge-api` granular skill isn't added to the router's three enumerations
(granular-skill table row, feature parenthetical, layout tree) where `swaps-api` appears. Not caught
by CI: `check:ai-structural` validates only `plugin.json` registration + link resolution, not these
prose lists. Agents routing via AGENTS.md can't discover the skill. **Fix:** add `bridge-api` to all
three lists, mirroring `swaps-api`.

### S3b · should-fix · `packages/sdk/docs/BRIDGE_API.md:102` + `…/features/bridge-api.md:16` — "shares the swaps host" claim (CONFIRMED)

Docs claim the bridge client "shares the swaps host" / "same base URL as `sodax.api.swaps`", but the
code aliases `resolveBaseApiConfig` (base slice). Same root cause as **S1** — reconcile docs with
whatever the apiConfig fix lands on.

## Scope 4 — Demo (`apps/demo`)

### S4a · should-fix · `apps/demo/src/components/bridge-api/SelectChain.tsx` — dead file + raw-key UX regression (CONFIRMED)

`SelectChain.tsx` is never imported; `BridgeCard` inlines its own `<Select>` rendering **raw
`SpokeChainKey`s** instead of friendly names — a UX regression vs `BridgeManager` (which uses
`ChainSelector`). **Fix:** use `SelectChain`/`ChainSelector` in `BridgeCard`, or delete
`SelectChain.tsx`.

### S4b · should-fix · `apps/demo/src/components/bridge-api/lib/mappers.ts:9` — dead `toXToken` (CONFIRMED)

`toXToken` is never imported (`BridgeCard` uses client-side `XToken`s directly, no API balance
reads). `useBridgeApiTokens` is likewise unused by the demo. Misleading dead file in a reference
app. **Fix:** delete `mappers.ts`, OR wire `useBridgeApiTokens` + `toXToken` into `BridgeCard` if
API token discovery was actually intended.

### S4c · should-fix (reuse) · `apps/demo/src/components/bridge-api/lib/signAndBroadcast.ts` — verbatim copy of the swaps dispatcher (CONFIRMED)

180-vs-186-line near-verbatim copy of `swaps-api/lib/signAndBroadcast.ts`, differing only in symbol
names. Two byte-for-byte copies of chain-dispatch/timing logic to maintain in lockstep. **Fix:**
extract one shared dispatcher (param'd by error class / feature) re-exported by both demos, or
promote it to `@sodax/dapp-kit` per `apps/demo/AGENTS.md` ("if demo code becomes reusable, move it
to dapp-kit"). *(Strong reuse candidate.)*

### S4d · nit · `apps/demo/src/components/bridge-api/BridgeCard.tsx:497` — silent disable when not signable (CONFIRMED)

When `!isSourceSignable` the Bridge button is disabled with no explanation, unlike `SwapCard` which
renders a warning. Defensive parity for a future unsupported spoke-chain type. **Fix:** render the
same warning.

## Scope 5 — Change Hygiene

**No findings.** No unrelated production / dependency / lockfile changes; `dist/` is gitignored. (The
`swaps-api.md` row added to `features/README.md` was reviewed as a harmless accuracy fill, not scope
creep.)

## Refuted (6) — verified NOT problems

- **Stacks-raw `srcPublicKey` invariant omitted** (`BridgeService.ts`) — deliberate; the deposit
  layer handles a missing key, swap's invariant is just a friendly early error.
- **`BridgeApiService.request()` duplicates `SwapsApiService.request()`** — intentional per-service
  mirror (the same `request<S>` is copied across every backend client; no shared base by design).
- **`toCreateBridgeIntentParamsV2` is dead code** — it's a public-barrel export consumed by a unit
  test + documented; not dead by knip's rules. (Note: still unused in any *production* path — the
  demo builds the wire DTO inline. Minor; consider using it in the demo or accept it as public API.)
- **`BridgePacketDataSchema` re-declares the swaps packet schema** — the swaps one is module-private;
  re-declaring is the established pattern.
- **`SubmitBridgeTxStatusV2` only referenced in JSDoc** — same as the swaps `SubmitSwapTxStatusV2`
  exported-but-doc-referenced pattern; intentional public type.
- **`features/README.md` swaps-api row is out-of-scope** — harmless accuracy fill alongside the
  bridge-api row.

## Suggested fix order (clean-code / reuse priority)

1. **S1** `resolveBridgeApiConfig` → swaps layering + fix `apiConfig.test.ts:181` + docs (S3b) —
   the only correctness item.
2. **S4a/S4b** remove (or wire) the dead demo files `SelectChain.tsx` + `mappers.ts`.
3. **S2b + S4c** extract the shared `pollBackendSubmitTx` helper + the shared sign/broadcast
   dispatcher — the core reuse wins.
4. **S2a** Bitcoin docstring; **S2c** `useBridgeApiTokensByChain`; **S3a** skills AGENTS inventory.
5. Nits: **S2d** shared JSON-safety guards, **S2e** `BridgeExtras` reuse, **S4d** disable warning.
