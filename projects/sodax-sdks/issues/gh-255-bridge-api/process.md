---
type: process
repo: sodax-sdks
github: 255
updated: 2026-07-01
---

# Process

## Log

### 2026-07-01 — Fixed dead Bitcoin dust-limit guard in SwapService.createIntent

Spotted while reviewing `packages/sdk/src/swap/SwapService.ts` on `feat/bridge-api-v2`. The
546-sat dust guard read `params.outputToken === 'BTC'`, but `outputToken` is an **original asset
address** (native BTC is `'0:0'`), never the symbol string. Real callers pass the address
(`dst.token.address`), so the guard never fired — dead code — and the only value that *would*
satisfy it (`'BTC'`) failed the preceding `isValidOriginalAssetAddress` invariant anyway. The
unit test only passed because a global `beforeEach` stubbed `isValidOriginalAssetAddress → true`
and fed the literal `'BTC'`.

- **FIX** resolve the token via `this.config.getSpokeTokenFromOriginalAssetAddress(dstChainKey,
  outputToken)` and match on `.symbol === 'BTC'` instead of comparing the address to `'BTC'`.
- **TEST** now passes the real BTC address (`spokeChainConfig[BITCOIN_MAINNET].supportedTokens.BTC
  .address`) and asserts the dust-limit message — so it actually guards the regression.
- **Verify:** `SwapService.test.ts` 155/155, `tsc` exit 0, Biome clean.
- Committed + pushed → `sodax-sdks@feat/bridge-api-v2` `bda4111b`.
- `sodax-frontend` has the same bug (`SwapService.ts:951`, v1 API on `main`) — left untouched,
  awaiting user decision (would need a dedicated branch, not a direct `main` push).

### 2026-07-01 — P0.1 Node smoke test for raw bridge-tx (created + ran)

The steps.md P0.1 box said `bridge-raw.ts` was "already written, compiles" but it did NOT
exist in the working tree — created it fresh, mirroring the existing raw-intent scripts
(`stacks-raw-intent.ts` / `injective-raw-intent.ts`).

- **CREATE** `apps/node/src/bridge-raw.ts` — `new Sodax()` (static defaults), calls
  `sodax.bridge.createBridgeIntent({ params, raw: true, skipSimulation: true })`. No PK / wallet /
  funds; read-only mainnet (derives hub wallet + resolves vault config, needs RPC).
  - Auto-discovers a bridgeable pair: scans `sodax.config.spokeChainConfig[SRC].supportedTokens`,
    keeps the first token whose `getBridgeableTokens(SRC, DST, addr)` is non-empty (same hub vault),
    prefers USDC/bnUSD/SODA for readable output; skips `withdrawOnly` src / `depositOnly` dst.
  - Env overrides: `BRIDGE_SRC`/`BRIDGE_DST` (default ARBITRUM→BASE), `SRC_ADDRESS`/`RECIPIENT`
    (default sample EVM addr — any valid EVM addr works, hub-wallet derivation is deterministic),
    `BRIDGE_AMOUNT` (default 0.01 of src token in base units).
  - Chain-key env values narrowed via a runtime `isValidSpokeChainKey` guard (validated cast to
    `SpokeChainKey`, no unsafe silencing).
- **MODIFY** `apps/node/package.json` — added `"bridge-raw": "tsx src/bridge-raw.ts"`.
- **Verify:** `bridge-raw.ts` typechecks clean (`pnpm checkTs` errors are all pre-existing in the
  stale `sui.ts`, untouched by this change). **Ran `pnpm bridge-raw` → PASS:** auto-picked
  USDC(Arbitrum)→USDC(Base), printed the unsigned EVM raw tx `{from,to,value,data}` +
  `relayData {address:hubWallet, payload:0x…}`. Proves the BE-builds-raw assumption on the CURRENT
  SDK before any bridge-api backend exists. Not committed (awaiting explicit request).

### 2026-07-01 — Extended bridge-raw smoke test to ALL source-chain families

User asked to cover NEAR / Injective / Solana / Stacks / Bitcoin sources too. Generalized
`apps/node/src/bridge-raw.ts` into a **chain-aware** script: `BRIDGE_SRC=<chainKey>` picks the source;
per-family sample address + extras are supplied automatically. Discovery scans the source chain's
supported tokens for the first pair bridgeable to an EVM destination (so the recipient is a plain EVM
address; default dst resolves to the `sonic` hub, which is EVM).

Key facts learned (bridge raw deposit == swap raw deposit at the spoke; only the hub `data` differs):

- **Type gotcha:** with `srcChainKey` typed as the `SpokeChainKey` UNION, `BridgeExtras<K>` collapses to
  `never` (can't set `srcPublicKey`/`bound`). Stacks/Bitcoin each have ONE mainnet key → pass an explicit
  type arg `createBridgeIntent<typeof ChainKeys.STACKS_MAINNET, true>({…})` to open the `extras` slot
  (mirrors the existing `approve<…, false>` usage). Inlining params per branch alone was NOT enough.
- **Stale-dist trap:** apps/node resolves `@sodax/sdk` → `packages/sdk/dist/index.mjs`. The Bitcoin-Bound
  plumbing (Decision #13: `srcPublicKey`/`accessToken` in `coreParams`) was missing from the loaded
  bundle, so Stacks/Bitcoin silently dropped `extras` (spoke threw "requires srcPublicKey" / "no token
  set"). `pnpm build:packages` said FULL-TURBO-cached; a **clean rebuild** (`rm -rf packages/sdk/dist
  .turbo && pnpm --filter @sodax/sdk build`) fixed it. Rule: rebuild the SDK before running node scripts
  after any SDK source change.

Results per source (against freshly-built dist):

| Source | Raw build | Note |
| --- | --- | --- |
| EVM (Arbitrum) | ✅ PASS | `{from,to,value,data}` |
| Solana | ✅ PASS | unsigned v0 tx (base64) + RPC blockhash |
| NEAR | ✅ PASS | `NearRawTransaction` object, no network read |
| Stacks | ✅ PASS | `{ payload }`; needs `extras.srcPublicKey` (sample pubkey↔address pair) |
| Injective | ✅ PASS | raw build ALWAYS simulates gas (`getRawTransaction`, ignores skipSimulation) → Cosmos bank check → source address must HOLD ≥ amount of the exact deposit denom. Wallet `inj10ch5…` holds 0.236 **bnUSD** + 1.35 INJ; discovery defaulted to USDC (0 held → "insufficient funds"), so pin `SRC_TOKEN=factory/inj1d036…/bnUSD` → built the unsigned Cosmos SignDoc (bodyBytes 2906 B) + relayData. |
| Bitcoin | ⚠️ Bound 403 | SDK now correctly forwards `accessToken` → Bound `getTradingWallet`; Bound edge returns HTTP 403 to plain Node server-to-server (documented in `bitcoin-raw-intent-check.ts`). Needs a valid non-expired token + browser origin. Mechanism OK. |

**Injective address model (MetaMask Q):** `srcAddress` MUST be bech32 `inj1…` (Cosmos REST auth +
`MsgExecuteContract.sender`). MetaMask's `0x` is the SAME 20-byte account re-encoded — `InjectiveWalletProvider.getWalletAddress()` runs `walletStrategy.getAddresses()` (returns `0x`) →
`getInjectiveSignerAddress` → `inj1…`. So in a real dapp the connected account is already `inj1…`; in
Node convert a raw `0x` via `getInjectiveAddress()` before passing.

Added a **`SRC_TOKEN`** env to `bridge-raw.ts` — pins the source token by address so it matches what a
given wallet actually holds (needed for the balance-gated Injective simulate).

5/6 build read-only against a normal address (EVM/Solana/NEAR/Stacks with no funds; Injective needs the
source wallet to hold the deposit denom, which `inj10ch5…`+bnUSD satisfies). Only Bitcoin stays gated by
the Bound edge 403 (infra, needs browser origin). Not committed.

**Default = run ALL:** `pnpm bridge-raw` (no arg) sweeps one representative source per family and prints a
summary table; pass a network to run just one — accepts a chain key OR a friendly alias derived from the
`ChainKeys` constant (`pnpm bridge-raw arbitrum|solana|injective|near|stacks|bitcoin`). Single-mode auto-
applies the per-family hint (Injective → bnUSD). Removed the separate `bridge-raw:all` script. Sweep
result: **5/6 PASS** (EVM/Solana/NEAR/Injective(bnUSD)/Stacks); Bitcoin ❌ only from the Bound edge 403. Confirms `createBridgeIntent` never throws for domain errors — even the deep
Bitcoin `RadfiApiError` (403) came back as `result.ok === false` (the SDK's outer try/catch guard), so the
`all` loop's defensive try/catch was NOT triggered.

**Native-token coverage:** Bitcoin's case is already native BTC (`0:0`). Verified EVM native ETH via
`BRIDGE_SRC=0xa4b1.arbitrum SRC_TOKEN=0x0000000000000000000000000000000000000000` — the native entry has a
`sodaETH` vault (bridgeable ETH↔WETH), and the raw tx carries **`value: 0.01 ETH`** (the native path in
`EvmSpokeService.deposit`: `value = token===nativeToken ? amount : 0n`) instead of an ERC20 transfer →
PASS. Native sentinels for the other families (Solana `1111…1111`, Injective `inj`) can be pinned the same
way via `SRC_TOKEN`; documented in the script header.

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

### 2026-06-30 — Backend contract DECIDED (Q&A, still no code)

Resolved all 13 backend-contract questions in a grounded Q&A (every answer traced
against real swap/bridge source). Captured in `reference/backend-contract/`
(`README` + `01-routes` + `02-request-response-dtos` + `03-confirm-checklist` +
`04-decisions`). Priority locked: **SDK first (Phases 1–6), backend after** — the
`/bridge/*` endpoints don't exist yet; `useBackendSubmitTx` ships default-OFF.

Key findings (corrections to the original plan draft):

- **relayData (Q7):** bridge `submit-tx` must send the FULL `relayData {address,
  payload}`, not just `payload`. Swap relies on `intent.creator` as the relay
  envelope address; bridge has no intent but `relayData.address` (= `hubWallet`,
  `BridgeService.ts:495`) is that address. Dropping it breaks split-tx-chain relay
  (`relay-swap-tx.ts:74-78`).
- **Param naming (Q4):** chose **swaps convention** (`inputToken/outputToken/
  inputAmount/srcAddress/dstAddress`) over SDK bridge names; SDK maps at the API
  boundary. (Plan draft had recommended SDK-bridge names — flipped.)
- **Idempotency (Q12):** the re-relay idempotency the fallback needs is the GENERIC
  relay layer (shared `relayTxAndWaitPacket` + relayer dedupe
  `IntentRelayApiService.ts:195` + `e2e-relay.test.ts` test 2), already proven; the
  swap-only part (re-post intent) is exactly what bridge lacks/doesn't need. Lower
  risk than plan's Open Q#6 implied — flag OFF only until a bridge-flavored re-relay
  assertion is added.
- **Refund/cancel (Q11):** bridge has no intent-expiry refund; drop
  `relayedForRefundAt`/`intentCancelled`. Stuck bridge → `RecoveryService.withdrawHubAsset`
  (generic, out of band).
- **Bitcoin source (Q13):** feasible via Bound TRADING mode (raw PSBT from the Radfi
  backend via `radfi.createWithdrawTransaction`, needs only `accessToken` — no
  wallet). USER self-custody raw throws. Bridge must mirror swap's
  `extras.bound.accessToken` plumbing (currently absent in `createBridgeIntent` /
  `CreateBridgeIntentParams`); V2 mirror types `BitcoinBoundExtrasV2`/`SwapExtrasV2`
  already exist. (Earlier I wrongly called Bitcoin-via-API infeasible — corrected.)

### 2026-06-30 — plan.md reconciled to the 13 decisions (9-agent workflow)

Ran a reconcile workflow (7 gather/verify agents grounded against real source +
synthesize + adversarial critique; 9 agents, ~641K tokens, 111 tool calls). Applied 46
verified edits to `plan.md` so it matches the locked contract:

- `CreateBridgeIntentParamsV2` → swaps wire naming (`inputToken/outputToken/inputAmount/
  srcAddress/dstAddress`) + `bound?`/`srcPublicKey?`; SDK maps domain→wire (new mapper).
- submit-tx → FULL `relayData {address,payload}` (not `.payload`); `BridgeSubmitTxRequestV2`
  uses `RelayExtraDataResponseV2`.
- Tokens backend-served: `getTokens`/`getTokensByChain` on `IBridgeApiV2` + `useBridgeApiTokens`
  (`bridgeApi/` = 6 hooks); bridgeable-amount stays client-side.
- New §3 sub-step: Bitcoin-source-via-Bound plumbing (`BridgeExtras`, 4-arg `BridgeParams`,
  `createBridgeIntent` accessToken/srcPublicKey, lift effective-wallet for raw).
- Host #1: shared base — no `BridgeApiConfig` type / no `constants.ts` change;
  `resolveBridgeApiConfig` = unconditional `resolveBaseApiConfig`.
- Status #10/#11: 5-state, drop `intent_hash` + `relayedForRefundAt`/`intentCancelled`, tolerant schema.
- Idempotency #12: reframed re-relay as safe-by-construction (shared `relayTxAndWaitPacket` +
  relayer dedupe + generic e2e test 2); flag default-OFF + add a bridge e2e assertion.
- Open Questions → Decided (#1,2,3,4,5,8); only #7 (backend endpoint timeline) genuinely open.
- Dependency table flipped to ✅ (rebase DONE, scaffold `8fd58453`); Phase 0 marked done.

Critique verified all 44 changeset anchors verbatim/unique + groundings accurate against
source; folded the E15 wording fix (wallet-provider invariant scoped to `raw===false` for any
Bitcoin mode; `ensureRadfiAccessToken` to TRADING sub-branch) + 2 missed-section fixes
(dependency table, the `Extend (not duplicate)` block). Still SDK-first; no source code written yet.

### 2026-06-30 — Implementation Phases 1–4 (SDK + dapp-kit) — all gates green

Worked the locked plan one box at a time, top→bottom, running each `verify:` before
ticking. Branch `feat/bridge-api-v2` (off `feat/swaps-api-v2`, scaffold `8fd58453`).

Environment note: the fresh checkout had an INCOMPLETE pnpm install — `valibot` (and
other catalog deps) were in the store but not symlinked into `packages/*/node_modules`,
so `checkTs` failed with `Cannot find module 'valibot'` even on untouched swaps files.
Fixed with `pnpm i --prefer-offline` (relinked; "Already up to date" but the symlinks
were created). Not a code issue.

**Phase 1 — `@sodax/types`** (gate `checkTs` ✅):
- Filled `backend/backendBridgeApiV2.ts` (was a stub): `BridgeTokenV2` + token responses,
  `CreateBridgeIntentParamsV2` (swaps wire names + `srcPublicKey?`/`bound?`), allowance/approve/
  create-intent responses (`{tx, relayData}`, no intent), submit-tx + tolerant 5-state status
  (`status` typed `string` to match the tolerant `v.string()` schema), `IBridgeApiV2` (7 methods),
  `_AssertJsonSafe` guard re-declared module-private on `GetBridgeTokensByChainResponseV2`.
- Exported from `backend/index.ts`; added `BridgeClientOptions` + `bridgeOptions?` to
  `sodax-config.ts` (distinct from the data `bridge` partner-fee slot).

**Phase 2 — `@sodax/sdk` HTTP client** (gate `checkTs` + `vitest src/backendApi` = 194 ✅):
- `bridgeApiSchemas.ts` (reuses `RelayExtraDataResponseSchema` from swaps; status `v.string()`
  tolerant; packet/result/status sub-schemas module-private).
- `BridgeApiService.ts` (mirrors `SwapsApiService`, 7 routes, message `…bridge API…`) +
  `toCreateBridgeIntentParamsV2` domain→wire mapper. NOTE: the mapper takes a STRUCTURAL input
  (not `import type CreateBridgeIntentParams from ../bridge`) to avoid a `backendApi → bridge`
  madge cycle (`check:circular-deps` follows `import type`).
- `resolveBridgeApiConfig` (alias of `resolveBaseApiConfig`, Decision #1); wired `bridge` into
  `BackendApiService` (+ `setHeaders` fan-out); barrel export.
- Tests: `BridgeApiService.test.ts` (routing 7, happy paths, mapper, tolerant-status, validation,
  transport, override, utils) + `resolveBridgeApiConfig` cases in `apiConfig.test.ts`.

**Phase 3 — `@sodax/sdk` BridgeService refactor** (gate `checkTs` + `sdk test` = 1690 ✅):
- ctor gained `backendApi` + `useBackendSubmitTx` (default off); wired in `Sodax.ts` via a distinct
  `bridgeUseBackendSubmitTx = options?.bridgeOptions?.useBackendSubmitTx ?? false`.
- `BridgeExtras<K>` (Stacks `srcPublicKey?` / Bitcoin `bound?` slots, NO partnerFee) + widened
  `BridgeParams` to 4-arg.
- `createBridgeIntent`: lifted `getEffectiveWalletAddress` out of the `raw===false` gate (derives the
  Bitcoin trading wallet for raw too); kept provider-invariant + `ensureRadfiAccessToken` gated on
  `raw===false`; added `srcPublicKey`/`accessToken` to `coreParams` (Decision #13).
- Extracted `fallbackBridgeSteps` (verify + relay, shared-deadline floor 5s, no hub short-circuit);
  added backend `submitTx` (FULL relayData envelope, terminal `executed && dstIntentTxHash`, no
  `intent_hash`); refactored `bridge()` to createBridgeIntent → shared deadline → submit (if flag) →
  fallback.
- Tests: 5-case backend submit-tx batch + 3 Sodax bridgeOptions wiring assertions (19 bridge tests).

**Phase 4 — `@sodax/dapp-kit`** (gate `checkTs` + `dapp-kit test` = 359 ✅):
- 6 `bridgeApi/` hooks (allowance, approve, createBridgeIntent, submitTx, submitTxStatus, tokens).
  Allowance queryKey uses WIRE names (`inputToken`/`inputAmount`, Decision #4 — the stub's old
  `srcToken`/`amount` would not typecheck against the wire DTO). Status poller stops on
  `executed`/`failed` (no `posting_execution`).
- Barrel + `hooks/index.ts` export; registered the 3 mutation hooks in `_mutationContract.test.ts`.

Remaining: Phase 5 (demo bridge-api page), Phase 6 (skills/docs), Phase 7 (build:packages +
full-repo typecheck/lint/test/circular-deps + bridge e2e re-relay assertion + PR).

### 2026-06-30 — Comment cleanup + push (Phases 1–4) + Phase 5 (demo)

- **Comment cleanup (user feedback):** stripped ALL `Decision #N` / `04-decisions` / `backend-contract`
  references from committed `sodax-sdks` code (they belong only to the private context repo) and
  made verbose comments concise (notably the 5-line Bitcoin comment in `createBridgeIntent`).
  Saved a feedback memory. Re-verified checkTs + tests green.
- **Pushed Phases 1–4** as commit `e3d8343e` → `origin/feat/bridge-api-v2`. (commitlint requires a
  lowercase subject start: `feat(bridge): add Bridge API client and backend submit-tx flow (gh-255)`.
  husky `.husky/pre-commit` is empty; `.lintstagedrc` exists but isn't invoked. `dist/` is gitignored.)
- **Phase 5 (demo) — approach corrected by user:** NOT a wholesale copy of the swaps-api demo. The
  bridge-api page is the EXISTING bridge demo UI (BridgeManager + BridgeDialog UX: chain/token select,
  max-bridgeable, route-availability gate, Bitcoin/Stellar/NEAR gating) with the Bridge API wired in
  (allowance/approve/createBridgeIntent/submitTx via `bridgeApi/` hooks), mirroring how the swaps-api
  demo is swap + API. Token discovery + bridgeable math stay CLIENT-SIDE (`useGetBridgeableTokens` /
  `useGetBridgeableAmount` / `sodax.bridge.isBridgeable`) — no backend dependency.
  - Filled `components/bridge-api/{lib/config,lib/mappers,lib/signAndBroadcast,SelectChain,OrderStatus,BridgeCard}.tsx`
    + `pages/bridge-api/page.tsx`; wired route in `App.tsx` + nav in `components/shared/header.tsx`.
  - submit-tx sends the FULL `relayData` object (not `.payload`). Bitcoin source routes via
    `sodax.spoke.getSpokeService(BITCOIN).signAndSubmitRawTransaction` with the Bound accessToken
    threaded into the create body.
  - Gate: `sodax-demo-v2 checkTs` + `lint` green (the 5 lint warnings are all pre-existing files, none
    in bridge-api). Not committed yet.

### 2026-06-30 — Post-implementation code review of PR #261

Ran an adversarial multi-agent review (9 reviewers per scope → verify each finding; 31 agents,
~1.9M tokens). 22 raw → **16 survived, 6 refuted**. Verdict **request-changes** (no blockers; the
default flat-config path ships fine). Full write-up: [reference/pr-261-code-review.md](reference/pr-261-code-review.md). Headline items:

- **S1 (should-fix, correctness):** `apiConfig.ts:96` `resolveBridgeApiConfig` aliases
  `resolveBaseApiConfig`, but `/bridge/*` is co-located with swaps → under `CustomApiConfig`
  split-host, bridge calls route to the base host (wrong). Decision #1 was internally inconsistent
  ("swaps host" comments vs base-host code). Fix: alias `resolveSwapsApiConfig` + fix the test that
  codifies the wrong behavior + the docs.
- **Reuse (the review priority):** `BridgeService.submitTx` duplicates `SwapService.submitTx` poll
  loop; demo `signAndBroadcast.ts` is a verbatim copy of the swaps one → extract shared helpers.
- **Dead demo files:** `bridge-api/SelectChain.tsx` (unused; inline selects show raw chain keys) +
  `bridge-api/lib/mappers.ts` (`toXToken` unused).
- Smaller: stale Bitcoin docstring (`BridgeService.ts:547`), missing `useBridgeApiTokensByChain`,
  skills `AGENTS.md` router inventory missing `bridge-api`, JSON-safety guard / `BridgeExtras` dup.

Not fixed yet — awaiting go-ahead.

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
