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
- Correction commit `e61a2670c`: user pointed out bridge has no staging. Renamed the modal's
  generic `Environment` control to `Swap solver env`, changed debug JSON to
  `swapSolverEnvironment`, and updated UI/docs copy so bridge is explicitly not tied to the
  Production/Staging switch.

### 2026-08-31 (later) · modal regrouped by feature + global partner fee

- Session opened on a **stale-router surprise**: the working tree held an undocumented uncommitted
  revert (file mtime 18:02, an hour after `e61a2670c`) stripping the Bridge SDK submit-tx control
  back out — i.e. re-applying the 2026-08-25 "v1 scoped to swaps" decision. Nothing recorded it in
  either repo. User confirmed the bridge config should stay (bridge runs prod; it only lacks a
  staging preset), so it was restored with `git restore`. Lesson: an un-noted working-tree revert
  reads as a decision reversal and costs a full re-derivation.
- Traced the solver-override chain end to end (the "does it actually take effect?" question):
  modal → `providers.tsx:150-152` → `SodaxProvider.tsx:23` (`new Sodax(config)` keyed on config
  reference) → `Sodax.ts:65` `mergeSodaxConfig` → `deepMerge` → `ConfigService`.
  **`ConfigService.initialize()` is a no-op** — the dynamic backend config fetch + re-layer is
  commented out (`ConfigService.ts:158-185`, `TODO(config-v2)`), so nothing ever clobbers the
  constructor-merged config. When config v2 is switched back on, the re-layer that preserves user
  overrides is the commented `mergeSodaxConfig(response.config, this.userConfig)` at `:171-173`,
  and `userConfig` is currently "accepted but unused" (`:137-138`) — verify that line then, or
  every modal override starts losing to backend config.
- Staging and production presets carry **identical** `intentsContract` /
  `protocolIntentsContract` (`apps/demo/src/constants.ts:19-27`); only `solverApiEndpoint` differs.
  No hardcoded copies of those addresses exist outside `packages/types/src/common/constants.ts:89,91`
  and the demo constants, so the config path has no bypass.
- UX fix (user: *"chọn staging, sao có bridge sdk submit tx? bridge đâu có staging tab?"*): the
  modal was grouped by setting kind, so a `Submit handling` section sat directly under the env tabs
  and the Bridge row read as scoped by Staging. Regrouped **by feature** — `Swap SDK` (env tabs,
  submit-tx, solver endpoint, intents contract) · `Bridge SDK` (submit-tx, Bridge API URL, with a
  caption stating it never reads solver config) · `Partner fee` · `API endpoints`.
  `protocolIntentsContract` moved under Partner fee: it is the fee-claim contract, not a swap one.
- Added the global partner fee, the one `SodaxOptions` knob the demo never exposed:
  `partnerFeeAddress` + `partnerFeeBps` → `fee: { address, percentage }` in `providers.tsx`.
  Validated both-or-neither, because `PartnerFee` is a single object — a lone address is
  inexpressible.
- **Fee cap correction:** the SDK bound is `FEE_PERCENTAGE_SCALE = 10000` bps (= 100%), enforced at
  `shared-utils.ts:113` and `LeverageYieldService.ts:577-580`. The `common.ts:53` doc comment
  ("Maximum allowed is 100 (1%)") is stale, and the 100-bps cap in `BridgeCard.tsx:164-168` is the
  **backend** API's, not the SDK's. `SodaxOptions.fee` does not reach the Swaps/Bridge API pages at
  all — `backendApiV2.ts:79` states those routes have no default and ignore SDK fee config.
- Added hints to `Intents contract` and `Protocol intents` — the only two rows in the modal that
  had none.
- Verified in the browser (Playwright on the local demo): four sections render, 0 console errors;
  a lone fee address errors and disables Save; `20000` bps errors; `50` bps saves and persists to
  `sodax-demo:sodax-settings`. Gates: demo `checkTs` + Biome on the changed files only.
- `apps/demo/AGENTS.md` updated for the AI drift-check gate.

### 2026-08-31 (later still) · one fee setting across all four surfaces

- User asked to unify the fee across Swap SDK / Swaps API / Bridge SDK / Bridge API. Read all four
  first; the merge turned out to be mostly free, with one real conflict:
  - **Unit already matches.** `PartnerFeeV2` is documented as the wire mirror of the SDK
    `PartnerFee` union and its `percentage` is basis points (`backendApiV2.ts:53-61`). The
    percent input + `Math.round(pct*100)` in `BridgeCard` was a UI choice, not a unit gap.
  - **The SDK route never uses the wire field.** The fee is baked into the intent at construction
    (`SwapService.ts:1266` → `SonicSpokeService.createSwapIntent`, `:1299` →
    `constructCreateIntentData`), so even with backend submit-tx ON the swaps API relays an intent
    that already carries it. That is why `SwapsApiService` has zero `partnerFee` references — the
    two paths are separate mechanisms, not two doors to one.
  - **The conflict: the two backend routes disagree on "omitted".** `/swaps/*` charges nothing
    (`backendApiV2.ts:79`); `/bridge/*` falls back to the backend's configured `bridgePartnerFee`
    (`backendBridgeApiV2.ts:103-108`). Auto-filling the bridge body from settings would silently
    take over that default. Resolved by seeding-not-forcing: the pages prefill from settings and
    clearing both inputs restores each route's own omitted-behaviour, named per page in the hint.
- Built `components/shared/PartnerFeeFields.tsx` — `usePartnerFeeDraft()` (seeds once at mount from
  the store; `configKey` remount re-seeds) plus the shared input row. Wired into `BridgeCard`
  (replacing its local percent state) and `SwapCard` (which had no fee UI at all, so every swap
  through that route charged 0). The Swaps API quote body carries the fee too — omitting it there
  would quote an output the intent does not deliver.
- Three caps are in play and only one is verified: SDK enforces 10000 bps (`shared-utils.ts:113`),
  `common.ts:53` claims 100, and the old `BridgeCard` comment claimed the backend caps at 100. The
  backend lives in another repo — **the 100-bps backend cap is unverified**, so the shared field
  uses the SDK bound and lets the backend reject what it will.
- Verified in the browser: both API pages seed from settings (`0x93D5…62d4` / `75`), each shows its
  own omitted-behaviour hint, and clearing one input alone raises "Set a fee address, or clear the
  rate". Console errors on `/swaps-api` are environmental (`localhost:3009` swaps-api and the
  Datadog mock intake are not running), not from the change.
- Unrelated drift spotted, **not fixed**: `pages/leverage-yield/page.tsx:71-74` sets
  `DEPOSIT_PARTNER_FEE = { percentage: 10 }` = 10 bps = 0.1%, while the comment above it says
  "100 bps = 1%, the max" and `apps/demo/AGENTS.md` says 1%. The value has been `10` since
  `ef447be1c` (2026-06-16), so code and prose never agreed. Needs the user's intent to resolve.
- Follow-up from the user: *"số nhập 0.1 được không? nghĩa là 0.1%"* — the first cut used a bps
  input, so `0.1` was rejected. Switched every fee input to **percent**, keeping bps as the stored
  and wire unit, with the resolved bps shown beside each field (`= 10 bps`). Smallest accepted step
  is 0.01% (1 bp), enforced by counting decimals — not a style rule: `BigInt(percentage)` in
  `calculatePercentageFeeAmount` throws on a fractional bp rather than rounding.
  Conversion helpers live in `lib/sodaxSettings.ts` (`percentTextToBps`, `bpsToPercentText`,
  `partnerFeePercentError`) so the modal and the shared field agree.
- Also answered: ordinary swaps have **no** fee address today. The only hardcoded one in the demo is
  `0x93D5CE288b3BF6b33F913b98FD1fA844Acc462d4` at `leverage-yield/page.tsx:72`, deposits only.
- Round-trip verified in the browser: typed `0.1` → hint `= 10 bps` → Save → localStorage holds
  `partnerFeeBps: 10` → both API pages seed back to `0.1` with their own per-route hint. `0.005`
  raises "Smallest step is 0.01% (1 bp)" and disables Save.
- User asked where the Swap SDK fee address comes from, then pushed back on the "there is none"
  answer. Re-checked exhaustively inside `sodax-sdks`, and the answer held: `swapsConfig` is only
  `{ supportedTokens }` (`swap.ts:352-354`), `bridgeConfig` is `{}` (`sodax-config.ts:70`), the sole
  `satisfies PartnerFee` value under `apps/` is the leverage-yield deposit constant, and
  `git log -S partnerFee -- apps/demo/src/providers.tsx` is empty — a fee was never wired there.
- **The recollection was right, in another repo.** `sodax-frontend/apps/web/providers/constants.ts:26-29`
  sets `partnerFeePercentage = { address: '0x93D5CE288b3BF6b33F913b98FD1fA844Acc462d4', percentage: 10 }`
  — SODAX's Sonic treasury, 10 bps — passes it as `sodaxConfig.fee` (`:108`) **and** per-request to
  the Swaps API (`swap/page.tsx:101`, `swap-confirm-dialog.tsx:139`). Its comment states the same
  asymmetry found here: `sodaxConfig.fee` "only reaches the flows that still call the SDK directly …
  never `/swaps/*`". So the product app already solved this the way the demo now does.
  Lesson: for "what does the app actually use", search the whole workspace, not the repo in hand.
- Committed as `8b5b98306`, pushed to PR #402. Deliberately **not** included: seeding the demo with
  the treasury default, and the leverage-yield 1%-vs-0.1% prose drift — both are product calls.
