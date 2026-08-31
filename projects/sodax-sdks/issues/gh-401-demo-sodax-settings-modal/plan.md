---
type: plan
repo: sodax-sdks
github: 401
updated: 2026-08-25
---

# Plan

## Goal

Demo-app UI to edit the main Sodax SDK config dynamically (Robi's request): a top-right
**"Sodax Settings"** button opening a modal with the current main settings and controls to
change them — `swaps.useBackendSubmitTx` first, plus the solver + API settings backend/solver
devs need. Changing settings re-creates the `Sodax` instance in the provider. Generalizes the
staging-submit fix already on PR #402. No new issue: scope lands on gh-401 / PR #402.

## Approach

Key verified facts (2026-08-25):

- `SodaxProvider` tracks `config` **by reference** (`packages/dapp-kit/src/providers/SodaxProvider.tsx:24`,
  `useMemo(() => new Sodax(config), [config])`). The demo comment claiming read-once `useRef`
  (providers.tsx:187-193) is stale — fix it. The module-level `queryClient` survives keyed
  remounts and `useQuote`'s key has no env/endpoint segment (`useQuote.ts:59`) → stale
  cross-config cache is real; clear it on config change.
- `ConfigService` backend fetch is a no-op today, so constructor `SodaxOptions` fully control
  behavior; `swapUseBackendSubmitTx = swaps.useBackendSubmitTx ?? … ?? true` (ConfigService.ts:499-501).
- `deepMerge` skips `undefined`, merges key-by-key → partial `relay: { relayerApiEndpoint }`
  preserves `relayChainIdMap`; partial `api` slices compile against `DeepPartial` + `CustomApiConfig`.
  `resolveSponsoringApiConfig` deliberately does **not** inherit the gateway override (hint text).
- No checkbox/switch primitive; repo rule: no new deps → tri-state `Select` for submit-tx
  (Auto/On/Off; Auto = on, but off on Staging, preserving #402). Persistence idiom is manual
  `lib/storage.ts` `readJson`/`writeJson` (`sodax-demo:*` keys), not zustand persist.

Settings model — new `apps/demo/src/lib/sodaxSettings.ts`:

```ts
// null = unset → effective default (env config / VITE_* var / SDK packaged default)
export type SodaxSettings = {
  useBackendSubmitTx: boolean | null;   // null = Auto: on, but off on Staging (#402 behavior)
  solverApiEndpoint: HttpUrl | null;
  intentsContract: Address | null;
  protocolIntentsContract: Address | null;
  apiBaseUrl: HttpUrl | null;           // gateway root → api.baseApiConfig.baseURL
  swapsApiBaseUrl: HttpUrl | null;      // → api.swapsApiConfig.baseURL
  apiKey: string | null;                // → SodaxOptions.apiKey (x-api-key)
  relayerApiEndpoint: HttpUrl | null;   // → relay.relayerApiEndpoint
};
```

Also there: `DEFAULT_SODAX_SETTINGS`; storage key `sodax-demo:sodax-settings` storing
`{ solverEnvironment } & SodaxSettings`; `isHttpUrl` (moved from providers) + `isEvmAddress`;
sanitizing loaders (invalid → null / Production); `saveSodaxSettings`; `hasActiveOverrides`
(header badge); env defaults `envSwapsApiBaseUrl` / `envSodaxApiKey`. No `constants.ts` import
(avoids a cycle via `useAppStore`). Precedence: settings override > VITE_ env default > env
solver config / SDK packaged default.

Store: `solverEnvironment: loadSolverEnvironment()` (**persists across reload — behavior
change, flag to Robi**), `sodaxSettings`, one `applySodaxSettings(env, settings)` action
(single identity change → single SDK re-create); `setSolverEnvironment` writes through.
Modal open state local to Header.

Provider: build `SodaxOptions` from env + settings (`api.baseApiConfig`/`swapsApiConfig`
conditional slices, `apiKey`, fully-populated `solver`, `swaps.useBackendSubmitTx` via
`defaultUseBackendSubmitTx(env)`, conditional `relay`); `configKey = env + JSON.stringify(settings)`
→ `<SodaxProvider key={configKey}>`; `useEffect` on configKey → `queryClient.clear()` guarded
by didMount ref; fix stale comment (≤2 lines).

Modal (`components/shared/SodaxSettingsModal.tsx`): existing primitives only; draft state
re-seeded on open; Save validates → normalizes ('' → null) → `applySodaxSettings` → close;
Cancel discards. Sections: Solver (env Tabs + endpoint + contracts, placeholders from
`configMap[draft.env]`), Swaps (tri-state Select, hint for On+Staging = the #402 bug), API
(apiBaseUrl / swapsApiBaseUrl / apiKey / relayerApiEndpoint, placeholders from SDK defaults).
URL/address validation inline; Save disabled while invalid; Reset-to-defaults; note that Save
re-creates the SDK and clears cached queries.

Header: `Settings2` lucide button, `cherryOutline`, outside the connected/disconnected
conditional; badge dot on `hasActiveOverrides`; modal mounted beside `<WalletModal />`.

Call-sites: stamp the **live** endpoint `sodax.config.solver.solverApiEndpoint` via
`useSodaxContext()` in `SwapCard.tsx:342`, `pages/leverage-yield/page.tsx:~464`, and the
`OrderStatus.tsx:328` fallback; then delete `solverApiEndpointForEnv` from `constants.ts`
(add `defaultUseBackendSubmitTx` there).

## Steps

1. `lib/sodaxSettings.ts` (types, guards, load/save, env defaults)
2. `constants.ts`: add `defaultUseBackendSubmitTx`
3. `useAppStore.tsx` (persisted env + settings, `applySodaxSettings`)
4. `providers.tsx` (assembly, configKey, cache clear, comment fix)
5. Call-site stamping (SwapCard, leverage-yield, OrderStatus); delete `solverApiEndpointForEnv`
6. `SodaxSettingsModal.tsx` + `header.tsx`
7. `apps/demo/AGENTS.md` (few lines)
8. Tracking: edit issue #401 body (expanded scope), commit on `fix/demo-staging-solver-submit`,
   push to PR #402, retitle + regenerate PR description (pr-description skill; flag env
   persistence + Select-not-checkbox). Commit with `TURBO_CONCURRENCY=2`, 600s timeout.

## Verification

Gates: `pnpm --filter sodax-demo-v2 checkTs`, demo lint, format changed files only.
Manual (dev :3000, network tab): modal open/cancel/validation; env sync modal ↔ page tabs +
staging token lists; Staging+Auto swap hits `{staging}/quote`, `/execute`, `/status` and order
stamps the staging endpoint; On+Staging goes via swaps API (hint warned); Off+Production does
client relay; custom solver endpoint honored + stamped; apiKey → `x-api-key` header; bogus
apiBaseUrl moves data-API but not sponsoring; Save re-creates SDK with no stale quote; reload
restores; corrupted storage → clean defaults.

## Risks

- Persisting `solverEnvironment` changes reload behavior (was: always Production) — deliberate, flag in PR.
- Submit-tx forced On against staging/custom solver is an inherent footgun (hint mitigates; it is what backend devs asked to test).
- `queryClient.clear()` wipes unrelated feature caches on save — acceptable in a demo.
- Wallet subtree remounts on save (same as env switch today); non-EVM wallets may need manual reconnect — pre-existing.
