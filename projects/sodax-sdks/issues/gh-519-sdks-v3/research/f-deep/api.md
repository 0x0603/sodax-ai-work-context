---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-19
tags: [v3, deep-dive, api]
---

# API packages — deep dive (feasibility, complexity, benefit)

1. The two API packages are already viem-free; the real api-1 work is moving the sdk-only leverage-yield, `/be` and sponsoring clients (2,252 LOC + 2,309 test LOC) onto one transport, and fixing the live Bitcoin raw-tx drift in swaps-api (the second live drift, in `/be`, is under api-4).
2. Measured gain is large but persona-specific: a P4 who wants the leverage-yield client today installs the sdk (412 pkgs, 776 MiB, 35 vulnerable packages / 47 distinct advisories) and ships 868.6 KB gzip; the same client from source is 44.6 KB gzip and ~5 MiB.
3. api-2 is mostly a mechanical move of 79 hooks (87 files, 3,681 LOC) whose only runtime sdk ties are the `sodax` instance, `isAuthFailure` and one approval helper; the hard part is keeping one error type (SodaxError must move below the sdk).
4. api-4: a prototype compared 59 response-schema pairs (380 keys) across swaps, LY, sponsoring and `/be` with the live specs. It found one live drift: 4 public `/be` token reads (`getSwapTokens`, `getSwapTokensByChainId`, `getMoneyMarketTokens`, `getMoneyMarketTokensByChainId`) return `invalid_response_shape` against prod today, because the sdk validates the v2 `XToken` shape on v1 routes. The same calls pass through the gateway's v2 mount (`/v2/be/config/*`), so the fix is a route change. The gate catches a real class of bug (B3, judgement), not only a hypothetical one.
5. sk-4's premise is wrong (no shared schemas exist, and the skills mention no MCP tool); drop it and let OpenAPI (api-4) be the shared contract.

| ID | Feasibility (verdict / confidence) | Complexity | Benefit | Timing | Why, one line |
| --- | --- | --- | --- | --- | --- |
| api-1 | Feasible with caveats / Code-traced | C4 | B3 standalone · B4-size for P4 with api-2 | 2.x (T25 fix now) | Clients are viem-free already; moving LY/`/be`/sponsoring off `makeRequest` is the bulk and touches a sponsor-error path |
| api-2 | Feasible with caveats / Code-traced | C4 | B3 (needs api-1 for LY/`/be`) | 2.x, after api-1 | 79 hooks move mechanically; one hook family needs SodaxError + `isAuthFailure` below the sdk |
| api-3 | Feasible with caveats / Code-traced | C2 | B2 | 2.x now | 13 tx-building endpoints in 3 APIs; per-chain signing is undocumented and two pages are wrong |
| api-4 | Feasible with caveats / Proven (prototype, scope below) | C3 | B3 | 2.x, scheduled and non-blocking; fix the 4 `/be` token reads now | Prototype works and found 4 public `/be` reads broken on prod; bridge spec needs a backend fix; tx shapes are opaque in specs |
| sk-4 | Premise incorrect / Code-traced | — as worded | B1 | Drop | No shared schemas exist; MCP servers hand-write zod; skills reference no MCP tool |

Conventions. **[verified]** = path:line, a probe I ran, or a measurement (method given). **[derived]** = arithmetic on verified numbers. **[judgement]** = opinion. sdks paths are at `0181a053` (worktree `sodax-sdks-v3feas`). Backend paths are `sodax-backend@985959e9` (= remote `development` head, checked with `gh api`). Frontend `sodax-frontend@1b915ec7`. KB/MB in bundle numbers are 1024-based; install sizes are `du -sk` KiB.

**Measurement methods (used throughout).**
- **Install:** `npm 11.6.0`, `npm i --ignore-scripts --before=2026-10-05` into fresh scratch dirs. `@sodax/*@2.2.0` (2026-10-12) is too new for `--before`, so I installed `2.2.0-rc.8` (2026-09-26, the backend's pin). Its third-party dependency list is identical to 2.2.0's (`npm view @sodax/sdk@{2.2.0-rc.8,2.2.0} dependencies`), and the sdk's unpacked size differs by 589 bytes (`npm view … dist.unpackedSize`). Audit: `npm audit --json --omit=dev`.
- **Bundle:** esbuild 0.25.12 (from the t2probe pnpm store), browser ESM, minify, tree-shake, gzip -9. React, react-dom and react-query are external where noted. Node builtins are external where noted, because the sdk needs `crypto`.
- **Source-level "what-if" bundles:** esbuild on the TS source, with `@sodax/types` aliased to the built t2probe `packages/types` (tsc multi-file ESM, same commit). The optional "sef" variant marks `@sodax/types` files side-effect-free through an esbuild plugin.

---

## api-1 · One viem-free `@sodax/api` with per-API subpaths and shims
**Bullet:** "Consolidate HTTP clients into a viem-free @sodax/api package with per-API subpaths and compatibility shims for the old packages"  ·  **T-ids:** T25.1, T28.1, T28.2, T28.3, T28.4

### Today
HTTP clients that call SODAX endpoints [verified; `rg -n "\bfetch\(" packages/*/src --glob '!*.test.ts'`]:

| Client | Where | Base URL | Errors | Schema | Transport |
| --- | --- | --- | --- | --- | --- |
| `SwapsApi` (21 methods) | `packages/swaps-api/src/client.ts` | caller must pass `baseUrl` (`config.ts:7`) | throws `SwapsApiError` (5 codes) | valibot, responses only | own `http.ts`: retries idempotent calls (`:38-44`), injectable `fetch` (`config.ts:19`), whole-call timeout |
| `BridgeApi` (10 methods) | `packages/bridge-api/src/client.ts` | same | throws `BridgeApiError` | valibot | copy of the same `http.ts` |
| `BackendApiService` (21 of 51 `/be` ops) | `sdk/src/backendApi/BackendApiService.ts:257` | `https://api.sodax.com/v1` + `/be` (`types/src/common/constants.ts:16,42`) | `Result` + `SodaxError` (`:248-252`) | valibot; config reads unvalidated (`:406`) | `makeRequest` (`api-utils.ts:173-219`): global `fetch` only (`:189`), no retry, timeout surfaces as plain `Error('REQUEST_TIMEOUT')` (`:205-206`) |
| `LeverageYieldApiService` (33 methods = 33 spec ops) | `…/LeverageYieldApiService.ts:127` | `/v1` + `/leverage-yield` | `Result` | valibot; reuses the swaps-api schemas (`leverageYieldApiSchemas.ts:24-47`) | `makeRequest` (`:158`) |
| `SponsoringApiService` (2 methods) | `…/SponsoringApiService.ts:56` | `/v1` + `/sponsorships/stellar` (`constants.ts:38-40`) | `Result`; `sponsoring/errors.ts:146-147` classifies via `isBackendHttpError(cause)` | valibot | `makeRequest` (`:98`) |
| `SwapsApiService` / `BridgeApiService` | `…/SwapsApiService.ts`, `BridgeApiService.ts` | as above | `Result` wrappers over the two packages | — | — |
| `SolverApiService` (static) | `sdk/src/swap/SolverApiService.ts:90,154,230` | `/v1/intent` (`constants.ts:90`) | `Result`; error is the raw JSON body | none | global `fetch` + `retry` |
| `IntentRelayApiService` | `sdk/src/shared/services/intentRelay/IntentRelayApiService.ts:205,239` | `/v1/relay` (`constants.ts:29`) | `Result` + `HttpRelayError` | none | global `fetch`, own retry |

`ConfigService` fetching is disabled (`ConfigService.ts:160-162`). The other `fetch` calls are chain RPCs, Radfi and DefiLlama, not SODAX APIs.

- **Already viem-free [verified].**
  - Both packages depend only on `@sodax/types` + valibot (`packages/{swaps,bridge}-api/package.json`). `@sodax/types` has no dependencies.
  - Probes show no viem, ox or @noble in:
    - `SwapsApi` (135.6 KB min / 40.6 KB gzip);
    - `BridgeApi` (132.1 / 39.6);
    - the source graphs of the three sdk-only clients (LY 281.5 / 79.4 through the t2probe `dist/esm` deep import).
- **The qualifier is redundant as a change but not as a guard [verified].** The helper layer next to these clients does pull viem: `pollBackendSubmitTx.ts:3` imports `sleep` from `shared/utils/shared-utils.ts`, which imports viem, `@mysten/sui`, `@solana/web3.js`, `@stellar/stellar-sdk` and `@sodax/libs` (`:24-28`).
- **Duplication [verified].**
  - The two `http.ts` files are 242 lines each and, after normalising names, differ only in comments: 4 hunks, 5 lines (`diff` after `sed`: lines 22, 27, 96-97, 158).
  - `mergeHeaders` exists 3 times, kept "in step" by comment: `swaps-api/src/http.ts:99`, `bridge-api/src/http.ts:99`, `sdk/src/backendApi/api-utils.ts:65`.
- **Raw-tx schema drift** (`diff packages/swaps-api/src/rawTxSchemas.ts packages/bridge-api/src/rawTxSchemas.ts`) [verified].
  - Everything else is identical: 8 of 9 `ChainTypeArr` branches, `BigintFromString`, the Injective bytes.
  - Only bridge has `BitcoinRawTxSchema` (`bridge:80-85`) and `case 'BITCOIN'` (`:155-156`).
  - In swaps-api, Bitcoin falls to `AnyRawTxSchema` (`swaps:105-106`, `:137-138`), so `tx.value` stays a string while `BitcoinRawTransaction.value` is `bigint` (`types/src/bitcoin/bitcoin.ts:131-136`).
  - The live path exists: the swaps spec documents Bitcoin-source raw TRADING intents (`BitcoinBoundExtrasDto`), the backend gates them in `swaps.service.ts:486-511`, and the sdk admits it: `BitcoinSpokeService.ts:552-553` ("isn't schema-validated upstream").
  - LY inherits the gap through `rawTxSchemaForChainKey` (`leverageYieldApiSchemas.ts:47`).
- **Behaviour differs between the two stacks [verified].**
  - swaps-api and bridge-api `encodeURIComponent` path params (`client.ts:26-42`).
  - The sdk clients interpolate raw values: LY `:228,680,693`; `/be` `:427,437,519,547,724,776`.
- **Public coupling [verified].**
  - The sdk exports a single entry `"."` (`sdk/package.json` exports), which re-exports every API service (`src/index.ts:6`, `backendApi/index.ts:9,15,16`). A typed LY, `/be` or sponsoring client is therefore only reachable through `@sodax/sdk`; the alternative is hand-written HTTP.
  - `BackendHttpError` / `isBackendHttpError` are public (`backendApi/index.ts:8`).
- **Downstream use [verified, `git grep`].**
  - Files importing `@sodax/swaps-api`/`bridge-api`: 0 / 0 / 0 (frontend / whitelabel / backend). The frontend only names `@sodax/swaps-api` in marketing copy (`apps/web/app/partners/sodax-api/page.tsx:200`).
  - Files using the sdk API services directly: 0 / 0 / 0.
  - npm downloads 2026-09-19..10-18: sdk 3,538, swaps-api 2,270, bridge-api 1,149. These do not separate direct use from transitive installs through the sdk.
- **Release lists [verified].** `sdks-publish.yml:30,72`, `bump-versions.sh:7`, plus one per-package publish workflow each (`sodax-swaps-api-publish.yml`, …). `@sodax/api` is unclaimed on npm (404).

### Change
From two thin packages plus three sdk-only clients on a second transport, to one `@sodax/api` with:
- subpaths `./swaps`, `./bridge`, `./leverage-yield`, `./backend`, `./sponsoring`;
- one `http` (retry, timeout, injectable `fetch`), one `rawTxSchemas` with an exhaustive switch, and an `ApiError` base;
- `SwapsApiError`/`BridgeApiError` kept as the same classes.

The old packages become `export *` shims. The sdk's `*ApiService` classes become `Result` adapters over `@sodax/api`, the way `SwapsApiService` already wraps `SwapsApi`. Solver and relay stay in the sdk [judgement]: they serve SDK-mode orchestration, have no OpenAPI spec (`/v1/intent/docs-json` and `/v1/relay/docs-json` both 404, verified), and P4 uses `submit-tx` instead.

```ts
// before (P4-node wanting leverage yield): the whole sdk, Result-wrapped
import { LeverageYieldApiService } from '@sodax/sdk';
const ly = new LeverageYieldApiService({ baseURL: 'https://api.sodax.com/v1', timeout: 30_000, headers: {} });
const r = await ly.getVaults(); if (!r.ok) throw r.error;
// after
import { LeverageYieldApi } from '@sodax/api/leverage-yield';
const vaults = await new LeverageYieldApi({ baseUrl: 'https://api.sodax.com/v1' }).getVaults(); // throws ApiError
```

### Feasibility — Feasible with caveats · Code-traced
- **Proven:**
  - the clients' import graphs are viem-free (bundle probes above);
  - the two transports can merge: same retry/timeout semantics in the packages; `makeRequest` is a subset.
- **Caveats:**
  1. Fix T25 first (copy the BITCOIN branch, exhaustive `never` check, parity test over `ChainTypeArr`). It is independent and 2.x-safe.
  2. Moving sponsoring off `makeRequest` must keep `BackendHttpError` as `error.cause`, or update `sponsoring/errors.ts:146-147`. That classifier gates Stellar activation, which spends sponsor XLM.
  3. The LY, `/be` and sponsoring reads gain retries and a new timeout error code. This is observable, though not a type break.
  4. Do not move `pollBackendSubmitTx` without replacing its `shared-utils` import (viem + 4 chain libs).
  5. Bitcoin raw txs still need the sdk to sign and submit (see api-3), so "sdk-free API mode" does not cover Bitcoin.
  6. Four `/be` token reads fail against prod today (see api-4). Fix them before or inside PR3, or the moved client ships the same bug.
- **Decisions:**
  - (a) whether `@sodax/api` inlines `@sodax/types` like today (`tsup noExternal`) or keeps it external (x-1);
  - (b) dual CJS/ESM in 2.x vs ESM-only in 3.0 (sdk-3);
  - (c) whether solver/relay move.

### Complexity — C4
- **PR1, T25 (C1, ~60 LOC + tests):** both `rawTxSchemas.ts` plus tests. It forces branches in #534, #497 and #95.
- **PR2: `packages/api` with swaps + bridge, shims, release lists.**
  - Moves 1,958 src LOC and 2,152 test LOC and removes about 430 duplicate LOC (`http` 242 + `errors` 47 + `rawTxSchemas` ~140).
  - Release lists change in 3 places, plus a new publish workflow and the first-publish setup.
- **PR3: LY, `/be` and sponsoring as throwing clients in `@sodax/api`; the sdk wraps them.**
  - 2,252 LOC moved or rewritten, 2,309 test LOC.
  - Count: `cat packages/sdk/src/backendApi/{LeverageYieldApiService,BackendApiService,SponsoringApiService,leverageYieldApiSchemas,backendApiSchemas,sponsoringApiSchemas}.ts | wc -l`.
- **PR4: sdk and dapp-kit depend on `@sodax/api`; deprecate the shims; docs and skills.** The Docs Drift gate requires docs with source.
- **Breaks:** nothing in 2.x if the shims and the `Result` adapters keep their shapes.
- **Top risks:** the sponsor-error classification regression (funds-adjacent), and the error `cause` chain read by consumers. The frontend's `swap-quote-error.ts:5-45` walks up to 4 causes for `context.body`; it is tolerant, but other apps may not be.
- **Compared with earlier points:** larger than the first pass's "M/L". T28.1 + T28.2 + T28.4 sum to 13 in the old points.

### Benefit — B3 (B4-size for P4 once api-2 lands)
- **P4-node using LY, `/be` or sponsoring:**
  - today: 412 pkgs, 794,780 KiB (776 MiB), 35 vulnerable packages (11 high, 13 moderate, 11 low; 47 distinct advisories) [verified install], and a Node import of about 1 s (1,043 ms median of 7; a re-run gave 979 ms) [verified];
  - after: 3 pkgs, about 4.6–5.4 MiB, 0 advisories [derived: types + valibot measured at 4,488 KiB = 4.38 MiB, 0 advisories, plus an estimated 0.2–1.0 MB (0.19–0.95 MiB) tarball], and an import of about 7 ms (swaps-api measured).
- **P4-react using the LY client from the sdk root (browser):**
  - today: 3,103 KB min / 868.6 KB gzip, 67 pkgs, and it needs a `crypto` polyfill (the build fails without one) [verified];
  - from source: 163.4 / 44.6 KB gzip [verified, source probe]. Saving about 824 KB gzip [derived].
- **P4 using only swaps + bridge:**
  - install unchanged (5,308 KiB measured today);
  - bundle drops from 77.9 to 45.5 KB gzip, because the second inlined `@sodax/types` copy goes away [derived from probes e3 vs h1]. That is −32 KB, below the B3 threshold.
- **P5:** removes the copy-drift class (3 header helpers, 2 transports, 2 schema copies; one live bug).
- **P1, P2, P3:** ~0. **P6:** ~0 (the MCP servers import no `@sodax/*`).
- **Calibration:** B3, not B4. The big numbers apply to one persona whose size is unknown (no downstream consumer in our three repos).

### Recommendation
2.x: T25 now, then PR2–PR4. Shims are deprecated in 3.0 and removed in 4.0. Wording: "Merge swaps-api, bridge-api and the SDK's leverage-yield, backend and sponsoring clients into one @sodax/api on a single transport, with per-API subpaths, one raw-tx schema, a CI gate that keeps it viem-free, and the old packages as shims"

### Corrections to earlier research
- `plan-v3-order.md` §11 / measurements:
  - "5.2 MB" is MiB (5,308 KiB);
  - "21 MB" is decimal MB (20,448 KiB = 19.97 MiB);
  - "≥777 MB" holds: the sdk alone is 776 MiB; dapp-kit with the React stack is 794 MiB with 36 vulnerable packages (47 distinct advisories).
- The first pass rated "viem-free" as a property only. The sdk helper layer (`pollBackendSubmitTx.ts:3` → `shared-utils.ts:24-28`) does reach viem and chain libraries, so keep it as a guard.
- `d-…` T28 omitted that sponsoring error classification depends on `BackendHttpError` (`sponsoring/errors.ts:146-147`).

## api-2 · `@sodax/api/react` hooks without the SDK
**Bullet:** "Add @sodax/api/react hooks that work without the SDK, with React dependencies optional for non-React users"  ·  **T-ids:** T28.5, T28.6, T28.7, T28.8

### Today
- **API-lane hooks [verified].**
  - 79 hook files (`ls <dir> | grep -E '^use.*\.tsx?$' | grep -v '\.test\.'`): swapsApi 22, bridgeApi 11, leverageYieldApi 34, backend 12.
  - 87 non-test files including index files and helpers; 3,681 LOC; 6 test files.
  - All of them take the client from `useSodaxContext()` (`hooks/shared/useSodaxContext.ts`) → `SodaxProvider` (`providers/SodaxProvider.tsx:24`, `new Sodax(config)`).
  - Call sites: `sodax.api.swaps` 44, `.bridge` 22, `.leverageYield` 68, `sodax.backendApi` 12.
  - `sodax.bridge.*` appears 0 times as code; the 4 matches are JSDoc.
- **Runtime sdk ties [verified, `scripts/sdk-imports.mjs`].**
  - 81 files import `@sodax/sdk`; 77 are type-only; 4 import `isAuthFailure`.
  - Shared helpers: `retryUnlessAuthFailure.ts:1` (`isAuthFailure`), `unwrapResult.ts` (`Result` → throw `SodaxError`).
  - 3 `*ApproveAndBroadcast` hooks use `utils/approvalPlan.ts:11-17`, which imports `getEvmViemChain` (viem chain objects, `sdk/src/shared/utils/constant-utils.ts:64`) for `expectedChainId` (`:97`). `@sodax/types` already carries EVM chain ids (`types/src/chains/chains.ts:84,112,126,…`).
  - The same import block also takes 4 chain-type guards (`isApprovalSupportedChainKeyType`, `isEvmSpokeOnlyChainKeyType`, `isHubChainKeyType`, `isStellarChainKeyType`; `sdk/src/shared/guards.ts:253,163,171,183`). They wrap checks that `@sodax/types` already exports (`types/src/utils/utils.ts:46,59,79`).
  - Open PR #511 adds `useSwapsApiBroadcastWithApproval`, which imports `sendApprovalBatch`, `getEvmViemChain` and related helpers from the sdk.
- **SodaxError is portable [verified].** `SodaxError`, codes and guards depend only on `@sodax/types` types (`errors/SodaxError.ts:13`, `codes.ts:15`).
- **Query-key prefixes [verified, `rg -o "queryKey:\s*\[\s*'<prefix>'"`].** `swapsApi` 16, `bridgeApi` 8, `leverageYieldApi` 27, `backend` 12 (63). There are also 18 `mutationKey` literals (7 / 4 / 7 / 0). Downstream hand-writes none of them (`git grep` in frontend and whitelabel: 0).
- **dapp-kit manifest:** depends on `@sodax/sdk` + viem; peers react ≥18 and react-query 5.x.
- **Optional-peer precedent [verified].** wallet-sdk-react has a `./privy` subpath and `@privy-io/react-auth` as an optional peer (`peerDependenciesMeta`). The 26-line post-build gate `scripts/check-privy-isolation.mjs` is wired into `build` (`package.json:64`).
- **Consumer:** the frontend swap page uses 7 `useSwapsApi*` hooks through dapp-kit [verified].

### Change
From hooks bound to a `Sodax` instance, to `@sodax/api/react` exporting:
- an `ApiProvider` that holds clients;
- the same 79 hooks with the same names and keys, throwing `SodaxError`.

dapp-kit re-exports them, and `SodaxProvider` mounts an `ApiProvider` fed from `sodax.api`, so there is one implementation and one family. react and react-query become optional peers, guarded by an isolation gate. The batch hook from #511 stays in dapp-kit or moves to a viem-peer subpath [judgement].

```tsx
// before: pulls the whole sdk
<SodaxProvider config={cfg}>…</SodaxProvider>; const q = useSwapsApiQuote({ params });
// after (API-only app)
import { ApiProvider, useSwapsApiQuote } from '@sodax/api/react';
<ApiProvider baseUrl="https://api.sodax.com/v1">…</ApiProvider>; const q = useSwapsApiQuote({ params });
```

### Feasibility — Feasible with caveats · Code-traced
- **Code-traced:** the hooks need nothing from the sdk beyond what can move: types, `isAuthFailure`, `SodaxError`, EVM chain ids and 4 chain-type guards, whose checks are already in types.
- **Blockers:**
  - api-1 for the LY and `/be` clients (34 + 12 hooks);
  - relocating `SodaxError`/`isAuthFailure` to `@sodax/types` or `@sodax/api` with sdk re-exports. Otherwise the two families throw different errors.
- **Decisions:**
  - (a) where `SodaxError` lives (overlaps sdk-8, dk-5);
  - (b) whether the #511/#512 batch hooks stay in dapp-kit;
  - (c) react peer floor: dapp-kit says ≥18, wallet-sdk-react ≥19.
- **Coupling:** wsc-2 removing receipt waits from wallets would break `approvalPlan.ts:99,119`.

### Complexity — C4
- **PRs:**
  1. error relocation;
  2. `ApiProvider` + swaps hooks + dapp-kit re-export;
  3. bridge + `/be` hooks;
  4. LY hooks;
  5. isolation gate + per-persona install fixture.
- **Size:** about 3.7k LOC moved, mostly mechanically, plus about 150 LOC of provider and gate. Additive in 2.x if names, keys and errors are identical.
- **Coordination:** the in-flight hook PRs (#511) and the user's lifecycle issues (#529/#531/#532). `check:ai` (hooks-index, key tables) and the skills must follow.
- **Top risks:** the dapp-kit error type changing; the key factory (dk-3) diverging.
- **Compared with earlier points:** T28.5–T28.8 sum to 11 points, consistent with C4.

### Benefit — B3
- **P4-react (API hooks), today through dapp-kit rc.8:**
  - bundle: 4,766 KB min / 1,262.7 KB gzip, 83 pkgs, plus `crypto`/`buffer` polyfills [verified, probes k1 and k2: same for swaps and LY hooks];
  - install: 418 pkgs, 813,040 KiB (794 MiB), 36 vulnerable packages (47 distinct advisories) [verified].
- **P4-react after api-1 + api-2:**
  - bundle: about 57 KB gzip for all hooks and all five clients [derived: 52.2 clients (probe h2) + 4.6 hook code (probe k3, with react, react-query and sdk external)], or about 48 KB for swaps only;
  - install: about 7–9 pkgs, 19.2–20.0 MiB, 0 advisories [verified hypo-api-react 19,628 KiB and api-react 20,448 KiB].
  - Saving: about 1.2 MB gzip, about 774 MiB, 36 vulnerable packages [derived]. The wallet stack is extra in both cases.
- **P1, P2, P3:** 0 (dapp-kit re-exports). **P5:** one hook family instead of a future fork.
- **Calibration:** B3, not B4: one persona, size unknown.

### Recommendation
2.x after api-1 and the error relocation. Wording: "Add @sodax/api/react with an ApiProvider and the API-lane hooks, no Sodax instance needed, with react and TanStack Query as optional peers; dapp-kit re-exports the same hooks so names, keys and errors stay one family"

### Corrections to earlier research
- `plan-v3-order.md` §11:
  - "88 hook files (24/13/35/16)" counts index and helper files; there are 79 hooks.
  - "The 3 hooks that call `sodax.bridge.*`" do not exist at `0181a053` (JSDoc only).
- The earlier count missed the 3 `*ApproveAndBroadcast` hooks' runtime sdk dependency through `approvalPlan.ts`.

## api-3 · Document API mode
**Bullet:** "Document API mode: the server prepares transactions, and the client signs and submits them as required by each flow"  ·  **T-ids:** T24.1, T24.2, T24.3

### Today
- **Tx-building endpoints [verified, live specs parsed with `scripts/spec-routes.mjs`; bridge from its controller]:**
  - swaps: 21 ops, 5 return `tx` (`quote?includeTxData`, `approve`, `intents`, `intents/cancel`, `limit-orders`);
  - leverage yield: 33 ops, 6 return `tx` (`quote/deposit`, `quote/withdraw`, `approve`, `intents/deposit`, `intents/withdraw`, `intents/cancel`);
  - bridge: 10 routes, 2 return `tx` (`approve`, `intents`; `bridge.controller.ts:120-157`);
  - `/be`: 51 GET ops, 0 tx;
  - sponsoring: 2 sponsorship ops (the spec also lists 3 health probes), 0 tx. Its `POST /accounts` adds the sponsor signature to a client-signed transaction and submits it (`sponsorship.controller.ts:97`), so it is the reverse of "server prepares".
  - Total: 13 tx-building endpoints in 3 APIs.
- **How the server builds them [verified].** The backend calls the sdk with `raw: true`:
  - `swaps.service.ts:149,339,554`;
  - `leverage-yield.service.ts:248,256,286,310`;
  - `bridge.service.ts:400`.
- **Coverage is bounded by the backend pin [verified].** The pin is `@sodax/sdk`/`types` `2.2.0-rc.8` (`pnpm-workspace.yaml:199-200`). rc.8 and main both have 22 `ChainKeys` (`scripts/chainkeys.mjs`), so there is no gap today. New chains (#534, #498, #497, #95) build server-side only after a backend bump [judgement].
- **Hand-off after broadcast [verified, spec descriptions].**
  - The client signs and broadcasts on the source chain, then either `POST /submit-tx` (the server relays and posts execution) or `/intents/submit` + `/intents/status`.
  - `approve` may return `resetTx`, which must be mined first.
- **Per-chain signing [verified]:**

  | Chain | Wire shape | How the client signs |
  | --- | --- | --- |
  | EVM | `{from,to,value,data}` | `sendTransaction` |
  | Solana | `data` is a base64 unsigned tx (`SolanaSpokeService.ts:193`) | `signAndSendTransaction` |
  | Sui | `Transaction#serialize()` JSON (`SuiSpokeService.ts:193`) | `signAndExecuteTxn` |
  | Stellar | `data` is XDR (`StellarSpokeService.ts:393`) | `signAndSendTransaction` |
  | Injective | `signedDoc` bytes as index objects | `signAndSendTransaction` |
  | NEAR | `{signerId, params}` | `signAndSubmitTxn` |
  | ICON | tx dict | `sendTransaction` |
  | Stacks | hex `payload`; the request needs `srcPublicKey` | `signAndSendTransaction` |
  | Bitcoin | base64 PSBT, TRADING mode only (`BitcoinSpokeService.ts:468-470`; USER mode throws `:491-495`); the request needs a Bound `accessToken` | needs the sdk's `signAndSubmitRawTransaction` (`:542-560`) for the Bound co-sign |

  This dispatcher exists in 3 copies:
  - `apps/demo/.../swaps-api/lib/signAndBroadcast.ts` (166 lines);
  - `apps/demo/.../bridge-api/lib/signAndBroadcast.ts` (159 lines);
  - frontend `apps/web/lib/swaps-api-sign.ts` (181 lines).
- **Docs today [verified]:**
  - Published API-mode pages:
    - http-api: 5 pages, 1,101 lines;
    - package pages `swaps-api.md` and `bridge-api.md`;
    - how-tos: swap, LY, submit-tx migration, Bitcoin;
    - the blog post `swaps-api-any-language`.
  - Gaps:
    - no bridge HTTP page, and no `/v1/bridge/*` in the route map (`http-api/index.mdx`);
    - no per-chain signing guide; the swap-api-example executes EVM only (README);
    - the OpenAPI section is stale: it points swaps and LY at `/docs` on the service origin and omits the `/v1/{swaps,leverage-yield,sponsorships}/docs-json` URLs, which all work;
    - `how-to/bitcoin-integration.md:311` says raw mode is not supported, but it is in TRADING mode.

### Change
From scattered pages, to one "Integration modes" page with:
- SDK, API and raw modes;
- an endpoint table per flow;
- a per-chain signing table with links to the dispatcher;
- the `submit-tx` hand-off;
- the Bitcoin and sponsoring exceptions;
- an install matrix.

Also add a bridge HTTP page and fix the two wrong passages. After api-1, rename to `@sodax/api` (T24.2).

```ts
const { tx, intent, relayData } = await api.swaps.createIntent(params);   // server builds
const hash = await signAndBroadcast(srcChainKey, tx, walletProvider);     // client: per-chain table
await api.swaps.submitTx({ txHash: hash, srcChainKey, intent, relayData }); // hand-off
```

### Feasibility — Feasible with caveats · Code-traced
- Docs only.
- **Caveats:**
  - Bitcoin API mode is not sdk-free today;
  - the bridge spec is unreachable (api-4);
  - docs go live on merge (sk-2), so v3 names must wait for release.

### Complexity — C2
- 1–2 docs PRs, about 400–600 lines, plus a `docs.json` nav entry; one follow-up rename PR after api-1.
- No code; nothing breaks.
- **Risk:** the per-chain table goes stale when chains are added. Mitigate by linking the code instead of copying it.

### Benefit — B2
- P4 (node and react) no longer has to reverse-engineer 8 signing paths from demo code.
- Fixes 2 incorrect statements.
- No measured support load [judgement].

### Recommendation
2.x now. Wording: "Document API mode per flow and chain: which endpoints build unsigned transactions (swaps, bridge, leverage yield), how each chain signs and broadcasts them, how submit-tx hands off, and the sponsoring and Bitcoin exceptions"

### Corrections to earlier research
- T24 missed:
  - the missing bridge HTTP page;
  - the stale OpenAPI section;
  - the wrong Bitcoin raw-mode line;
  - that sponsoring is client-built and server-submitted.

## api-4 · OpenAPI drift check in CI
**Bullet:** "Check API client and schema drift against OpenAPI in CI"  ·  **T-ids:** T34.1, T34.2

### Today
- **Live specs, 2026-10-19 11:04 UTC [verified, curl]:**

  | Spec | Status | Size |
  | --- | --- | --- |
  | `/v1/swaps/docs-json` | 200 | 53,037 B |
  | `/v1/leverage-yield/docs-json` | 200 | 52,656 B |
  | `/v1/be/docs-json` | 200 | 90,880 B |
  | `/v1/sponsorships/docs-json` | 200 | 16,268 B |
  | `/v1/bridge/docs-json` | 404 | 79 B, Nest's `"Cannot GET /bridge/docs-json"` |

  - Canary is byte-identical (sha256) for the four 200s.
  - The bridge API itself is live (`/v1/bridge/tokens` 200).
- **Bridge 404 cause [verified].** `apps/bridge-api/src/main.ts:78` uses `SwaggerModule.setup('docs', …)`. swaps-api fixed the same thing with `setupSwapsSwagger` (`apps/swaps-api/src/main.ts:54-58`).
- **Specs are opaque on tx [verified].** Every `tx` is `{"type":"object"}` plus prose.
- **Existing contract links [verified]:**
  - backend controllers `implements` the sdk interfaces at rc.8: swaps (`swaps.controller.ts:78`), bridge (`bridge.controller.ts:60`), sponsoring (`sponsorship.controller.ts:55`);
  - `LeverageYieldController` does not (`leverage-yield.controller.ts:83-84`; `git grep LeverageYieldApiV2 -- apps` → 0);
  - in the sdks repo, valibot ↔ `@sodax/types` compile guards exist for swaps (`schemas.ts` `SchemaDriftGuards`) and bridge, but not for LY, `/be` or sponsoring.
- **Prior art:**
  - `scripts/check-sponsoring-contract.mjs` (167 lines, hand-written expectations) passes against the live prod spec: I ran `--spec https://api.sodax.com/v1/sponsorships/docs-json` → OK. `.github/ci.md:19` still says CI cannot fetch the spec.
  - The Builders MCP already runs a 650-line `apiDriftCheck.ts` against `/v1/be/docs-json`.
- **History [verified].**
  - The packages were added 2026-07-08 (swaps-api) and 2026-09-17 (bridge-api).
  - `git log --oneline --since=2026-04-19 origin/main -- packages/swaps-api packages/bridge-api | grep -i -E 'schema|field|drift|mismatch'` → 1 of 17 commits (`8abaaef2`, a docs fix).
  - Adding `packages/sdk/src/backendApi packages/types/src/backend`: 40 commits, still 1 hit.
  - Reading the subjects and five bodies: `c4838a67` (a new `resetTx` field that would have been dropped silently), `95b356b2` (request-side Stacks `srcPublicKey`), `30f0f9bc` (base-URL routing). None is a production response drift.
- **Gotcha [verified].** The `/be` spec's `servers` list a private `iconblockchain.xyz` host. A committed snapshot would fail the `private-hosts` job (`ci.yml:61-84`).
- **Live `/be` drift, 2026-10-19 11:33 UTC [verified, live GETs and a call through the built client].**
  - The sdk validates 4 token reads with the v2 `XToken` shape (`symbol,name,decimals,address,chainKey,hubAsset,vault,access?`; `backendApiSchemas.ts:29-38`) but calls the v1 routes `/config/swap/tokens`, `/config/swap/${chainId}/tokens`, `/config/money-market/tokens` and `/config/money-market/${chainId}/tokens` (`BackendApiService.ts:708,724,737,776`).
  - Prod and canary v1 return `{symbol,name,decimals,address,xChainId}` (e.g. `GET https://api.sodax.com/v1/be/config/swap/0xa4b1.arbitrum/tokens` → 20 items, 0 with `chainKey`). The backend does this on purpose [verified, `git show`]: `apps/api` keeps `@sodax/types` pinned to v1 (`1.3.1-beta-rc1`, `apps/api/package.json:51`) and maps v2 tokens to the 5-field v1 shape (`SdkConfigV1ToV2Adapter.ts`, since backend #568, 2026-06-06). The spec agrees that `chainKey`, `hubAsset` and `vault` are absent: these routes return `TokenDto` (4 props; it omits `xChainId` too). `XTokenDto` belongs to `/v2/config/*`.
  - The v2 routes are reachable, through a different mount [verified, `git show` and curl GETs]. The backend's `ConfigV2Controller` (`apps/api/src/api/v2/config/config-v2.controller.ts:75`, `@Controller('v2/config')`) is exposed at `/v2/be/config/*`: the backend's `DEPENDENCIES.md:59,264` says the gateway rewrites `/v2/be/config` to `/v2/config`. A verifier probe on 2026-10-19 at 11:40 UTC returned 200 on prod and canary for `/v2/be/config/swap/0xa4b1.arbitrum/tokens` (20 items, all with `chainKey`, `hubAsset` and `vault`) and for `/v2/be/config/all` (`{version: 2020008, config}`). The sdks docs already read `https://api.sodax.com/v2/be/config/all` (`docs/config-tables.js:8`). The second pass probed `/v1/be/v2/config/*`, which is the wrong mount: it returns `route_not_found` 404, re-confirmed. #543's probe (`/v1/config/all`, `/config/all`, `/v2/config/all`) also missed `/v2/be/config/all`.
  - Result: `new BackendApiService({})` from the t2probe dist (`0181a053`) returns `EXTERNAL_API_ERROR`, `reason: invalid_response_shape` for all 4 calls; the controls `getMoneyMarketReserveAssets`, `getChains` and `getOracleMarkets` return ok. Script: `wf-finish-api/scripts/be-live-call.mjs`, output `wf-finish-api/be-live-call.txt`. The t2probe's `backendApi/{BackendApiService,backendApiSchemas,api-utils}.ts` are byte-identical to `0181a053` (`cmp`).
  - The same 4 calls return ok on prod and canary when they get a per-call `{ baseURL: 'https://api.sodax.com/v2' }` (swap: 382 tokens over 22 chains; money market: 202 tokens over 22 chains) [verified, `wf-verify-api/scripts/be-v2-mount.mjs`, output `wf-verify-api/be-v2-mount.txt`]. So integrators have a workaround today, and the sdk fix is a route change [derived].
  - The unit tests feed the v2 fixture `SAMPLE_XTOKEN` (`BackendApiService.test.ts:106-114`) to mocked v1 routes, so they pass against a shape the server does not send [verified].
  - Age: the schema and routes date from #210 (`ffb3e7e3f`, 2026-07-01; `git log -S XTokenSchema`). All 23 release tags that contain it (`@sdks@2.0.0-rc.19` to `@sdks@2.2.0`) carry the same schema, the validated v1 route and the v1 default host (loop over `git tag --contains ffb3e7e3f`). The published `2.2.0-rc.8` dist has the same schema and routes (`dist/index.mjs:30314,35565,35577`). I have no response older than today.
  - Callers: 0 outside tests in the sdks packages and apps (`rg -w` for the 4 names in `packages/*/src` and `apps`, excluding `BackendApiService.ts`: the only hits are tests, the types' interface declarations and `ConfigService`'s own same-named methods). 0 in frontend and whitelabel (`git grep -w`). In the backend the names are only controller methods (v1 `config-api.controller.ts:169,191,208,236`; v2 `config-v2.controller.ts:121,155`). So external integrators are the only ones affected [derived from the greps]. The methods are advertised to them: the published `docs/developers/packages/foundation/sdk/tooling-modules/backend_api.md:783-786` and the sodax-sdk skill (`packages/skills/skills/sodax-sdk/integration/knowledge/features/backend-api.md:36-40`) list all 4.

### Change
From a manual sponsoring check, to `scripts/check-api-contract.mjs`. It walks the valibot response schemas and compares property names, required-ness and picklist enums with the spec components. It runs as a scheduled, non-blocking workflow and on PRs touching the API packages. The backend gets a bridge Swagger mount fix, and optionally `LeverageYieldController implements ILeverageYieldApiV2`.

```
$ node scripts/check-api-contract.mjs --spec https://api.sodax.com/v1/swaps/docs-json
pairs 17/17 · keys 113 · enums 6 · drift 0 · opaque tx 5
```

### Feasibility — Feasible with caveats · Proven (prototype; scope stated)
- **Prototype:** `scratchpad/deep-api/scripts/drift-check.mjs`, against the built swaps-api dist and the sdk `dist/esm` schemas.
  - swaps: 17 pairs, 113 keys, 6 enums;
  - LY: 30 pairs, 155 keys;
  - sponsoring: 1 pair, 10 keys;
  - result: 0 name or required-ness drift, 5 opaque-tx limits per swaps/LY spec, and 1 lenient (`operation` is required in the spec, optional in valibot).
  - Mutation test: 3 injected drifts (rename, required → optional, enum value) → 3 detected.
  - `/be` suite (added in `wf-finish-api/scripts/drift-check-be.mjs`, against the sdk `dist/esm/backendApi/backendApiSchemas.js`): 11 pairs covering 14 of the 18 validated `BackendApiService` methods (`grep -c` of `return this.request(` / `this.request(` = 18, plus 3 `requestUnvalidated`), 102 keys, 1 enum. 13 findings. 4 valibot keys are missing from the spec's `TokenDto` (`XTokenSchema`: `chainKey`, `hubAsset` and `vault` are required, `access` is optional); this is the live drift above. 7 findings are spec fields the sdk drops, over 6 distinct names (`packetData` twice, `createdAt`, `isActive`, `isFrozen`, `isBorrowingEnabled`, `isPaused`). 2 spec arrays are typed as strings, yet their own examples show objects (`OrderbookResponseType.data`, `GetUserPositionResponseDto.positions`). A live `/v1/be/solver/orderbook` GET confirms objects for the first; positions was not called. Output: `wf-finish-api/drift-be.txt`. A verifier re-run of all four suites reproduced every count, and the `/be` output is identical.
  - The 2 map reads (`TokensByChainMapSchema`, a `v.custom`) are opaque to the name check; a live-response parse caught them instead (`wf-finish-api/scripts/parse-live.mjs`). A CI gate needs both kinds of check.
  - Totals: 59 pairs, 380 keys [derived: 17+30+1+11; 113+155+10+102]; 1 live drift (4 methods), 0 in swaps, LY and sponsoring.
- **Scope:** responses only; hand-written name map; EVM tx variant; property types not compared.
- **Not covered:**
  - requests (the one historical contract incident was request-side);
  - the 3 unvalidated `/be` config reads and the 2 array-of-string reads (`getChains`, `getMoneyMarketReserveAssets`; both parse ok live);
  - bridge (no spec).
- **Caveats:**
  - the bridge spec needs a backend PR (cross-repo, so a parent issue);
  - tx shapes stay unchecked by a name comparison while the spec types `tx` as a bare `object`;
  - strip `servers` from fixtures.

### Complexity — C3
- **PRs:**
  1. the generalised script with fixtures and unit tests, about 300–450 LOC;
  2. the workflow;
  3. the backend bridge mount, about 10–30 LOC;
  4. optionally, LY `implements` in the backend.
- **Top risks:**
  - a live-spec flake failing CI, so keep it non-blocking;
  - the pairing map going stale.

### Benefit — B3
- Not only preventive: the prototype found 4 public `/be` reads that fail on prod today. The same code is in all 23 release tags since #210 [verified above]. That prod failed for that whole time is derived from backend history, not captured.
- T25 (api-1) is a second live client-vs-server drift, but this gate does not see it: the specs type `tx` as a bare `object`. So the evidence that the gate removes a recurring class is 1 shipped drift plus 1 near miss (`c4838a67`) [judgement].
- Git history alone showed ~0 drift fixes, yet the token-read drift shipped for about 3.5 months without one. History undercounts this class [judgement].
- Most useful for LY (no compile-time link on either side) and `/be`. The backend's v1 config controller `implements IConfigApiV1Compatible` (`config-api.controller.ts:71`), but that type comes from the frozen v1 types (`1.3.1-beta-rc1`). The sdk's `IConfigApiV1` (`types/src/backend/backendApiV1.ts:24`) declares the v2 `XToken`. The two "v1" contracts disagree, so neither compiler sees the drift [derived from the two declarations].
- Gives P4 a trustworthy spec.
- **P5:** catches backend-ahead fields that `v.object` drops silently (the `c4838a67` class; 7 such findings over 6 distinct fields in `/be` today).
- **Calibration:** B3, not B4. It removes a recurring bug class [judgement], but the broken reads have 0 callers in our three consumer repos. B2 is the fallback if 1 shipped drift plus 1 near miss is not enough to call the class recurring.

### Recommendation
2.x, scheduled and non-blocking. First steps now: fix the 4 `/be` token reads, and wire `check-sponsoring-contract` against the live URL. To fix the reads, point them at the v2 mount `/v2/be/config/*`, which already serves `XToken` and needs no gateway change. The other option is to map the v1 `TokenDto` + `xChainId` shape. Either fix is about C1 [judgement]. Cheaper parallel fix: the backend LY `implements`. Wording: "Check the API clients' response schemas against the live OpenAPI specs on a schedule and on API PRs, after the backend serves the bridge spec"

### Corrections to earlier research
- T34: the sponsoring spec is fetchable (`ci.md:19` is stale).
- New facts:
  - the LY controller lacks `implements`;
  - the `/be` spec advertises a private host;
  - the Builders MCP already has a drift checker for `/be`;
  - 4 public `/be` token reads fail on prod (v2 `XToken` schema on v1 routes); the summary's earlier "0 drift" covered only swaps, LY and sponsoring.
- Second pass, corrected by verification: "the v2 routes are not reachable" was wrong. The gateway serves them at `/v2/be/config/*`. The second pass probed `/v1/be/v2/config/*`. The token-read fix therefore needs no gateway change.

## sk-4 · Skills and shared MCP tool schemas
**Bullet:** "Keep skills aligned with shared API tool schemas used by the existing MCP servers"  ·  **T-ids:** T33.1, T33.2

### Today
- **MCP servers [verified, `gh api`]:**
  - `icon-project/sodax-mcp-server`: master, last push 2026-02-05; 16 tools; zod; no `@sodax/*`.
  - `gosodax/builders-sodax-mcp-server`: development, v1.6.0; 35 tools; zod (48 + 6 `z.*` calls); no `@sodax/*`; read tools plus `sodax_relay_submit_tx`; its relay host is the private `iconblockchain` domain (`src/constants.ts:12`).
- **Skills [verified].** `packages/skills` contains 0 MCP or tool references (`rg -i "mcp|sodax_get|openapi"` → 0). Our docs name 14 Builders tools (`rg -o -I 'sodax_[a-z_]+' docs | sort -u`), and all 14 exist.
- **No request schemas exist [verified].** No request or param valibot schemas exist in any client (`rg "RequestSchema|ParamsSchema"` → 0).
- **JSON Schema conversion of response schemas [verified, `@valibot/to-json-schema@1.7.1`]:** 40 of 45 convert. The 5 that fail are all tx-bearing (`v.custom`). Scope: swaps-api exports and LY schemas. A verifier extension (`wf-verify-api/scripts/tojson-be.mjs`) adds `/be`: 13 of 18 convert. Its 5 failures are the config and token schemas, whose nominal `ChainKey`/`Address` scalars are `v.custom`. Sponsoring: 2 of 2. Version 1.8.0 needs valibot ≥1.5; the repo pins 1.4.2.

### Change
None as worded. Options:
- (a) drop;
- (b) rescope to "publish JSON Schemas from `@sodax/api`": responses only, unless request schemas are written; this needs adoption by another org;
- (c) check docs and skills against OpenAPI. That belongs in api-4, because skills contain no HTTP shapes and their SDK snippets are already compile-checked by `check:ai`.

### Feasibility — Premise incorrect · Code-traced
No shared schemas exist, and skills do not reference MCP tools. The new scope is (b) or (c).

### Complexity — n/a as worded
(b) is C2 for responses and C3 with new request schemas, plus external adoption. (c) is folded into api-4.

### Benefit — B1
P6 gains little: the Builders MCP already guards `/be` drift itself.

### Recommendation
Drop. If an MCP owner commits to consuming them: Later, "Publish JSON Schemas for the API responses from @sodax/api for MCP servers that ask for them".

### Corrections to earlier research
- T33.1 assumed valibot request schemas; none exist.
- `plan-v3-packages.md`'s `@sodax/api/tools` subpath should be removed.

## Dependencies between these bullets
- **api-1 → api-2:** the LY and `/be` hooks need sdk-free clients. The swaps and bridge hooks could start on today's packages.
- **T25 (inside api-1) before:** #534, #497 and #95 add chain types; each must add a raw-tx branch.
- **api-1 ↔ x-1:** `@sodax/types` is 117–143 KB of every `@sodax/api` bundle; inline it or keep it external.
- **api-1 ↔ sdk-3:** dual vs ESM-only shims.
- **api-1 ↔ sdk-8:** one transport is where `AbortSignal` and request ids land; this conflicts with T19.2 on `http.ts`.
- **api-1 ↔ sdk-10:** gives LY, `/be` and sponsoring an injectable `fetch`.
- **api-1 ↔ sdk-9 / #543:** the config client moves to `./backend`.
- **api-1 ↔ x-5:** shim versioning.
- **api-1 ↔ x-3:** codemod for the import moves.
- **api-1 ↔ sdk-1:** the Bitcoin co-sign moves to chain-bitcoin, which P4 Bitcoin users would install.
- **api-2:**
  - needs `SodaxError`/`isAuthFailure` relocated (sdk-8, dk-5);
  - dk-1 (dapp-kit re-exports, sdk as peer);
  - dk-3 (key factory must cover 63 API-lane query keys, plus 18 mutation keys);
  - dk-6 (`SodaxProvider` mounts `ApiProvider`);
  - wsc-2 (receipt waits used by `approvalPlan`);
  - wsr-1/wsr-3 (the P4-react wallet stack);
  - x-2 (persona install budgets).
- **api-3:**
  - names `@sodax/api` after api-1;
  - follows sk-2 (live-on-merge docs);
  - feeds dk-7 (defines "API mode");
  - Bitcoin depends on sdk-1.
- **api-4:**
  - easier after api-1 (one schema location);
  - bridge part needs a backend change (cross-repo);
  - absorbs sk-4 (c);
  - pairs with x-2 (CI gates);
  - the token-read fix overlaps sdk-9 / #543: both read the backend's v2 config controller, which the gateway already serves at `/v2/be/config/*`. #543's "blocked on the gateway" constraint looks stale, because `/v2/be/config/all` returns 200.
- **sk-4:** if kept, depends on api-1 and on the MCP owners; relates to sk-1 and sk-3 only through docs pinning.

## Not verified
- How many external P4 integrators exist. npm downloads do not separate transitive installs, and there is no other data source.
- The exact `@sodax/api` tarball size, estimated 0.2–1.0 MB depending on whether types are inlined. Measuring it needs a branch and a build; the hard rules forbid both here.
- Whether the Bitcoin raw-tx path is enabled on prod, and LY Bitcoin-source support. Both need a POST with a Bound credential; I made no POSTs. The LY spec names `bitcoin` only in chain enums and has no `BitcoinBoundExtrasDto` (`grep -o -i "bitcoin[A-Za-z]*"` on the saved spec), so LY support looks absent from the spec [judgement].
- Request-side drift. The prototype checks responses only. Skipped: it would not change api-4's score or verdict.
- Whether the 4 broken `/be` token reads were broken before 2026-10-19. I have only today's responses. Code history makes it likely [derived]: the backend has mapped these routes to the 5-field v1 shape since #568 (2026-06-06), before sdk #210, and every release tag since #210 validates them with `XToken`.
- The published `2.2.0` npm tarball. `--before=2026-10-05` blocks installing it. Its source tag `@sdks@2.2.0` (`ed770019`) has the same `BackendApiService.ts`, `backendApiSchemas.ts` and `backendApiV1.ts` as `0181a053` (`git diff --stat` is empty), and the rc.8 dist was checked.
- When the gateway started serving `/v2/be/config/*`. Its routing lives in `sodax-unified-api`, which is outside this audit's sources.
- Whether npm trusted publishing needs a token for the first publish of a new package name. Needs npm org admin access.
- Support-question volume for API-mode signing. No data source.
- The react ≥18 floor for `@sodax/api/react`. Needs a build and a test run; the hard rules forbid pnpm build.

## Resume notes
Scratch root: `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/deep-api/`. Files:
- installs: `results/install.tsv`, `npm/{api,hypo-api,api-react,hypo-api-react,sdk,dappkit,tojson}`;
- bundles: `out/*.js` and `*.meta.json`, entries in `entries/`;
- specs: `dl-specs/` (prod and canary); mutation copy: `dl-specs-mut/`;
- MCP sources: `dl-mcp/`;
- scripts: `scripts/` (`install-all.sh`, `measure.mjs`, `measure-src.mjs`, `measure-ext.mjs`, `spec-routes.mjs`, `drift-check.mjs`, `tojson-probe.mjs`, `sdk-imports.mjs`, `chainkeys.mjs`, `time-import.mjs`).
- The esbuild used: `sodax-sdks-t2probe/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild`.

Second pass (2026-10-19): `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-finish-api/`: `scripts/drift-check-be.mjs` (the prototype plus a `be` suite; run `node drift-check-be.mjs <swaps-api dist index.mjs> <api-be.json> be <sdk dist esm backendApiSchemas.js>`), `scripts/parse-live.mjs`, `scripts/be-live-call.mjs`, live responses in `dl-live/`, outputs `drift-be.txt`, `parse-live.txt`, `be-live-call.txt`.

Verification (2026-10-19): `/private/tmp/claude-501/-Users-sangnguyen-Documents-GitHub-sodax/dce5bfac-05d8-403a-bb45-88d5f47c5082/scratchpad/wf-verify-api/`: `scripts/be-v2-mount.mjs` (the 4 token reads on the v1 and v2 gateway roots; run `node be-v2-mount.mjs <t2probe dist/esm/backendApi/BackendApiService.js> <host root>`), `scripts/tojson-be.mjs`, `scripts/drift-check-be.copy.mjs` (unchanged copy used for the re-runs), live probes in `dl-live/` and `dl-specs/`, outputs `be-v2-mount.txt`, `drift-be.rerun.txt`, `mut.rerun.txt`, `tojson-be.txt`.

All five bullets are scored; no open markers remain.
- Done: the api-4 `/be` suite (found the live token-read drift; api-4 B2 → B3).
- Still open, optional (no score depends on them):
  - **api-1:** measure a real `@sodax/api` tarball once a branch exists (`npm pack --dry-run`).
  - **api-2:** re-run `scripts/sdk-imports.mjs` after #511 merges (`hooks/{swapsApi,bridgeApi,leverageYieldApi,backend}`).
  - **api-4:** add a request-side check (TS types vs the spec's `*ParamsDto`); re-fetch `/v1/bridge/docs-json` after the backend fix; re-run `be-live-call.mjs` and `be-v2-mount.mjs` after the token-read fix.
  - **sk-4:** none, unless an MCP owner asks.

## Verification (2026-10-19)

This was an adversarial pass over the whole report, with extra care on the second pass's `/be` results. Sources were the sdks code at `0181a053`, backend `985959e9`, frontend `1b915ec7` and whitelabel `5e1fbba`. The live probes were GETs only. I installed nothing, ran no pnpm, and wrote only this file and my scratch dir. `sodax-sdks-v3feas` is still clean.

**What I checked**
- **Scores.** I checked all 5 IDs against the rubric: verdict, confidence, C, B and timing.
  - No ID is scored B4 or B5.
  - No breaking change is timed 2.x. api-1 and api-2 stay additive behind shims and re-exports, and api-1's retry and timeout change is flagged as observable.
  - The C ratings match their PR breakdowns:
    - api-1: 4 PRs, cross-package, about 4.2k src LOC moved or rewritten → C4;
    - api-2: 5 PRs, about 3.7k LOC, cross-package → C4;
    - api-3: docs only → C2;
    - api-4: 3–4 PRs, one of them in the backend → C3.
- **Citations: 54 opened.** That is 40 in sdks, 10 in the backend via `git show origin/development:`, 3 in the frontend via `git show origin/main:` and 1 MCP source.
  - 5 had wrong line numbers: LY `:126`/`:157`, sponsoring `:55`, `BitcoinSpokeService` `:551-552` and LY `:690`. All are fixed.
  - 1 backend statement was incomplete (the controller methods).
  - The rest held.
- **Numbers: 23 groups re-derived.** I re-ran the cheap ones and checked the arithmetic of the rest:
  - two esbuild rebuilds: SwapsApi 135.6/40.6 KB, and the sdk LY client 3,103.1/868.6 KB with 67 pkgs. A third build reproduced the `crypto` resolve failure;
  - the 20 saved bundles, re-gzipped: every cited KB matches;
  - `npm audit` re-run: sdk 35 (11 high, 13 moderate, 11 low), dapp-kit 36, the API installs 0;
  - lockfile package counts 412/418;
  - LOC: 2,252 + 2,309 tests; 1,958 + 2,152 tests; `http.ts` 242; errors 47; rawTx 140;
  - hooks 79 (22/11/34/12) over 87 files and 3,681 LOC; call sites 44/22/68/12; sdk imports 81/77/4; query keys 63;
  - spec ops 21/33/51/2 (+3 health); client methods 21/10/21/33/2; `this.request(` 18 + 3 unvalidated;
  - all four drift suites re-run with identical counts (59 pairs, 380 keys, 13 `/be` findings), and the mutation test (3 of 3);
  - git history 17/1 and 40/1;
  - npm downloads 3,538/2,270/1,149;
  - Node import 979 ms on re-run (1,043 ms reported) and 7 ms;
  - JSON Schema conversion 40 of 45;
  - spec sizes; release tags since #210 (23);
  - MCP tool counts 16/35/14.
- **Live (GET only).**
  - The 5 specs: same status, size and sha256 as the first pass; canary identical.
  - The v1 and v2 token routes on prod and canary.
  - The 4 token reads through the built client on both the `/v1` and `/v2` gateway roots.
  - The orderbook route.
  - `check-sponsoring-contract` against the live spec: OK.

**What I changed, and why**
1. **The api-4 v2 claim was wrong.** The second pass said "the v2 routes are not reachable". The gateway serves the backend's v2 config controller at `/v2/be/config/*`; the second pass probed `/v1/be/v2/config/*`. The 4 reads return ok with a per-call `baseURL: 'https://api.sodax.com/v2'`. I updated the summary line 4, Today, Recommendation, Corrections and Dependencies to match. The token-read fix is a route change and waits on no gateway work.
2. **api-4 Benefit reasoning.** T25 was counted as evidence for the class the gate removes, but the gate does not see `tx` shapes. The evidence is now 1 shipped drift plus 1 near miss. B3 is kept as judgement, with B2 named as the fallback. I also replaced "nobody noticed" with the 3.5-month fact. "No `implements` contract for `/be`" was wrong: there is one, but the backend's is against the frozen v1 types and the sdk's against v2 types.
3. **The api-4 `/be` suite wording.**
   - "4 REQUIRED keys" is 3 required + 1 optional.
   - "7 spec fields" is 7 findings over 6 names.
   - "Server sends objects" is confirmed live for the orderbook only.
4. **The api-4 caller count method.** `git grep … -- 'packages/*/src'` matches no files in this repo: a sanity count of `getOracleMarkets` with that pathspec returns 0, while `rg` finds 4 files. I re-counted with `rg -w`; the result is unchanged (0 non-test callers). I also added where the 4 methods are advertised: the published docs and the skill.
5. **Not verified.**
   - 2.2.0 is now checked at the source tag.
   - The prod-history item now carries the code-history derivation.
   - New item: when the gateway started serving the route.
6. **api-2.**
   - `approvalPlan` also imports 4 chain-type guards, and their checks already exist in types.
   - "35 + 12 hooks" is 34 + 12.
   - The Feasibility label "Proven" is now "Code-traced", to match the confidence.
   - Added the 18 mutation keys.
7. **api-1 and api-3 precision.**
   - The frontend "imports" swaps-api in 0 files; it only names it in copy.
   - The install upper bound is 5.4 MiB, not 5.5.
   - The `http.ts` diff is 4 hunks, 5 lines.
   - The tarball statement is about unpacked size.
   - Sponsoring has 2 ops plus 3 health probes.
8. **sk-4.** The JSON Schema probe's scope is now stated: `/be` converts 13 of 18 and sponsoring 2 of 2.

**What remains judgement**
- **api-4 B3.** It rests on calling 1 shipped drift plus 1 near miss a recurring class.
- **api-1 and api-2 B3, not B4.** The large gains apply to one persona of unknown size.
- **api-1 C4, not C5.** The sponsor-error path is funds-adjacent, but it keeps its classifier if `BackendHttpError` stays the cause.
- **Other calls:**
  - the token-read fix is about C1;
  - solver and relay stay in the sdk;
  - the bridge spec fix is about 10–30 LOC;
  - api-3's 400–600 docs lines.

**Residual doubts**
- **#543 / sdk-9 (owned by `sdk-runtime.md`).** It names the gateway as its blocker, and `ConfigService.ts:160-162` says the v2 endpoint is not live. Yet `/v2/be/config/all` returns 200 `{version: 2020008, config}` on prod and canary. If that report inherits the blocker, it is stale; I did not check it.
- **Prod history.** That prod returned the v1 shape before today is derived from backend history, not captured.
- **Config freshness.** `/v2/be/config/*` serves the backend's packaged config at its sdk pin (2020008 = 2.2.0-rc.8), so a fix that points there inherits that lag.
- **Unchecked scope.** The positions array and request-side drift are still unchecked.
- **Drifting measurements.**
  - Re-run `du` is 0.03–0.2% lower than the recorded sizes (794,508 vs 794,780 KiB; 811,376 vs 813,040 KiB).
  - Import times vary by about 10% with machine load.
- **Consistency fix (2026-10-20).** The "advisories" figures were npm vulnerable-package counts. They are relabeled, with distinct-advisory counts from the README advisory recount. No score changes.
