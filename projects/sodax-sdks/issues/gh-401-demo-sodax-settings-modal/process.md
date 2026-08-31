---
type: process
repo: sodax-sdks
github: 401
updated: 2026-08-31
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

## Findings

## Changes During Work

### 2026-08-25 · staging fix + settings modal (one session)

- Diagnosed gh-401: SDK's backend 2-step submit (`useBackendSubmitTx` default true,
  `ConfigService.ts:499-501`) sends every intent to the production swaps-api; the demo env
  switcher only swaps `sodaxConfig.solver`. Staging solver never sees the intent; the order
  card's raw `/status` poll (`useSolverStatus`) sticks on NOT_FOUND (~2 min cap). SDK-level
  `getStatus` is immune (durable-record reconcile, `SwapService.ts:398-403`).
- Fix commit `fc87f25c8`: staging opts out via `swaps: { useBackendSubmitTx: false }`.
- Robi expanded scope (settings modal). Plan agent validated the design; two corrections vs
  first sketch: `SodaxProvider` tracks config BY REFERENCE (`SodaxProvider.tsx:24` useMemo) —
  the demo's "read-once useRef" comment was stale; and the module-level queryClient survives
  the keyed remount while `useQuote` keys carry no env segment → must `queryClient.clear()`.
- Feature commit `c5c827f19` (10 files, +518): `lib/sodaxSettings.ts` (types/guards/loaders,
  env defaults moved out of providers), store gains persisted env + `applySodaxSettings`,
  providers assemble overrides (`api.baseApiConfig` slice, full `solver`, conditional
  `relay`), configKey remount + guarded cache clear, modal + header button, order cards stamp
  `sodax.config.solver.solverApiEndpoint` (deleted `solverApiEndpointForEnv`).
- Verified: checkTs + Biome green; Playwright — validation blocks Save, Save persists/syncs
  tabs/badge/re-creates SDK, quote hit `POST http://localhost:9999/quote` with override set,
  reload restores, Reset clears. Dead ends: none major; commitlint rejected a sentence-case
  subject; biome exhaustive-deps needed the prev-key-ref pattern for the clear effect.
- Pre-commit full build previously exhausted machine RAM → committed with
  `TURBO_CONCURRENCY=2` (fine, warm cache).

### 2026-08-25 (later) · UX rounds + full audit

- Same-branch additions on PR #402: header nav redesign (grouped dropdowns, brand), modal
  prefilled-with-effective-values (copy per field, Copy JSON, per-field reset, override dots),
  page top-spacing pass, bridge logos + balances + last-selection persistence, SelectToken
  consolidated into shared/ (generic token shape).
- Full audit (code-review skill, high, 10 findings; each verified in source before acting).
  Fixed in `5de40cb37`: Auto submit-tx + warning now key on the EFFECTIVE solver endpoint
  (env-label keying recreated gh-401 via the endpoint override); per-config query client
  replaces parent-effect clear() (child-before-parent effect ordering served stale cache and
  wiped new fetches); children-only key preserves wallet sessions; bridge dst-restore ref moved
  out of the setState updater (StrictMode double-invoke broke restore in dev); save effect
  guarded while tokens unresolved; DEFAULT_API_BASE_URL/DEFAULT_RELAYER_API_ENDPOINT imported
  from dapp-kit (they ARE re-exported — earlier dist grep missed chunked d.ts); nav dropdowns
  close on focus-out/Escape/item-click instead of a 200ms blur timeout.
- Deliberately NOT changed: bridge.useBackendSubmitTx stays SDK-default (env switcher never
  applied to bridge; Robi scoped v1 to swaps); clearing an env-provided API key from the UI is
  inexpressible (documented hint); BTC bridge balance shows the on-chain wallet, not the
  trading wallet.

### 2026-08-31 · explicit bridge/swap settings coverage

- User asked whether backend submit-tx applies to bridge and how to make the modal cover bridge
  and swap clearly. Re-audited PR #402 and found the modal only controlled
  `swaps.useBackendSubmitTx`; bridge remained SDK-default and the Bridge API showcase had a
  hard-coded canary base URL.
- Follow-up commit `0339bc7d3`: renamed the persisted swap setting to
  `swapUseBackendSubmitTx` with backward-compatible loading from legacy `useBackendSubmitTx`,
  added `bridgeUseBackendSubmitTx`, and wired `providers.tsx` so Swap SDK and Bridge SDK each
  receive an explicit submit-tx config.
- UI now has a dedicated Submit handling section with separate `Swap SDK submit-tx` and
  `Bridge SDK submit-tx` rows. Copy explains Auto/On/Off behavior, warns when forced swap
  backend submit-tx is used with a non-production/custom solver, and labels solver settings as
  swap-only.
- Added `bridgeApiBaseUrl` to settings and made the Bridge API page read
  modal override > `VITE_BRIDGE_API_BASE_URL` > canary default. Bridge SDK backend submit-tx
  still uses the shared gateway/base API config, which the modal copy calls out.
- Verification: `pnpm --filter sodax-demo-v2 checkTs`, Biome format/lint, `git diff --check`,
  browser visual check at `http://localhost:3000/`, and the repo pre-commit build/test all
  passed. Build logs still show existing Vite/Rollup warnings from dependencies and large chunks.
