---
type: research
repo: sodax-sdks
github: 519
commit: 0181a053
updated: 2026-10-20
tags: [v3, deep-dive, ranking]
---

# v3 deep dive: ranking of the 39 issues

## How to read

- **Scales.** C1–C5 (complexity), B1–B5 (benefit), the verdicts, the confidence labels and the personas P1–P6 are defined in the [rubric](../../artifacts/deep-dive-rubric.md).
- **Sources.** Each score comes from the summary table of a verified area file in this folder. The first pass, [`e-519-bullet-feasibility.md`](../e-519-bullet-feasibility.md), is superseded wherever it differs. Delivery context is from [`plan-v3-final.md`](../../plan-v3-final.md).
- **Evidence tags.**
  - **[verified]**: a path:line, a probe, or a measurement with its method.
  - **[derived]**: arithmetic on verified numbers, with the arithmetic shown.
  - **[judgement]**: an opinion.
  - An untagged figure in a table, in "Fix now in 2.x", in "Corrections" or in "Decisions" repeats a figure from the named area file, where it carries its own tag. Figures in the Summary carry their own tags.
- **Tier.** A priority bucket computed from B and C (see "Tier rule"). It is not a timing: some "Defer" IDs are prerequisites and get scheduled early in "Dependencies and order".
- **Code.** sodax-sdks at `0181a053`. The two worktrees used by the area agents (`sodax-sdks-v3feas`, `sodax-sdks-t2probe`) no longer exist (`ls` on 2026-10-20). I re-checked the "Fix now" citations with `git -C sodax-sdks show 0181a053:<path>`. I re-ran no bundle, install or runtime probe.

## Summary

1. Tiers for the 39 IDs: 11 Core, 1 Quick win, 12 Worth it, 6 Cheap DX, 8 Defer, 1 Drop [verified: script below].
2. Only 3 Core IDs have a standalone B4: sdk-1, wsr-1 and wsr-2. The other 8 reach Core through a B4 that is combined, conditional or measured with an npm layout. Scoring standalone B instead moves 11 IDs down a tier [verified: same script]. For 5 Core IDs (sk-2, sdk-2, x-2, x-3, dk-2) the B4 rests only on [judgement] in the area file; see "Evidence behind B4 and C4+".
3. The large wins come in pairs.
   - sdk-1 + sdk-4 take an EVM-only `new Sodax()` from 1,261 to 303 KB gzip [verified in chains.md: esbuild, removed code stubbed out].
   - wsr-1 on a per-file wallet-sdk-core takes initial wallet JS from 1,744 to ~162 KB [verified in wallet-sdk-react.md: a module-graph simulation].
   - wsr-2 cuts the wallet-sdk-react install by 541 MB [verified in wallet-sdk-react.md: npm install with a wagmi 3 override]. It removes 15 vulnerable packages, but only 1 of 68 distinct advisories [verified: recount of the saved `npm audit` output; see "Consistency check"].
4. 22 defects at the pinned commits can be fixed in 2.x: 20 in sodax-sdks, 1 in sodax-backend and 1 in sodax-frontend. 2 of them are latent [verified: count of "Fix now in 2.x"]. Most are about C1 [judgement]. Examples: 4 public `/be` token reads fail on prod (live GET in api.md, 2026-10-19), two allowance query keys leave out inputs, and the app's QueryClient settings are bypassed.
5. sk-4 is dropped, because its premise is wrong. So is the "execution modes" half of dk-7.
6. Order is gated by 0x0603's open PRs #509/#511/#512/#523 (transport and dapp-kit work), by the open PR #534 (chains, types split, MM lifecycle) and by the open issues #540/#543 (approval batches, remote config) [verified: `gh pr view` / `gh issue view`, 2026-10-20].
7. The team owns 19 decisions. Seven block 4 IDs each, and none blocks more: D1 chain placement, D3 wallet-sdk-core home, D4 chain clients without the sdk, D6 2.x subpaths, D7 error model, D10 docs channel and D11 2.x maintenance [verified: count of the Blocks column; command in "Consistency check"].

## Tier rule

The tier is computed from the area summary tables, not by eye.
- **Parse.** For each area file, the first table row that starts with `| <id> |` is taken.
- **B_eff** is the largest `B<n>` anywhere in the Benefit cell, standalone or combined.
- **C** is the first `C<n>` in the Complexity cell.
- **Verdict** is the Feasibility cell up to the first ` / ` or ` · `.

The tiers are applied in this order:

| Order | Tier | Condition |
| --- | --- | --- |
| 1 | Drop | the verdict is exactly "Premise incorrect", or Timing starts with "Drop" |
| 2 | Core | B_eff ≥ 4 |
| 3 | Quick win | B_eff = 3 and C ≤ 2 |
| 4 | Worth it | B_eff = 3 and C ≥ 3 |
| 5 | Cheap DX | B_eff ≤ 2 and C ≤ 2 |
| 6 | Defer | B_eff ≤ 2 and C ≥ 3 |

dk-7's verdict is split ("Presets: Feasible with caveats; modes: Premise incorrect"), so it is not exactly "Premise incorrect". It is ranked on its presets half; its modes half is dropped in the area file's Recommendation [judgement on how to apply the rule].

**Command** (the script is in the session scratchpad, `scratchpad/rank/tier.py`):

```
python3 -I tier.py research/f-deep ../wf-rank-rows.json
```

**Output** (abridged to tier, B_eff, C and ID):

```
39 IDs
Core       B4 C2 sk-2 | B4 C3 sdk-2, sdk-4, sdk-5, wsr-2, x-2 | B4 C4 api-1, dk-2, wsr-1, x-3 | B4 C5 sdk-1
Quick win  B3 C2 sk-1
Worth it   B3 C3 api-4, dk-6, sdk-7, x-1, x-5 | B3 C4 api-2, dk-5, sdk-3, sdk-8, wsc-1, wsc-3 | B3 C5 sdk-9 (dropped 2026-10-20, see D8)
Cheap DX   B2 C1 wsr-3 | B2 C2 api-3, dk-7, sk-3 | B1 C2 wsc-4, wsr-4
Defer      B2 C3 dk-1, dk-3, dk-4, sdk-10, sdk-6, wsc-2, x-4 | B2 C4 wsr-5
Drop       B1 C- sk-4
counts: {'Core': 11, 'Quick win': 1, 'Worth it': 12, 'Cheap DX': 6, 'Defer': 8, 'Drop': 1}
missing in json: [] missing in areas: []
```

**Area files against `wf-rank-rows.json`** [verified: the same script plus a comparison after stripping backticks].
- All 39 IDs are in both.
- Verdict, C, B and timing agree for every ID. The only raw differences were backticks in sdk-5, sdk-7 and wsc-2.
- sdk-2's confidence is worded differently but means the same thing.
- The "why" text differs for 11 IDs (sk-2, sdk-2, wsr-2, wsr-1, x-3, sk-1, api-4, x-1, sdk-3, sdk-6, x-4). The rows add detail. Reading them, I found no figure that conflicts with its area file.
- Where they differ, the area file wins.

**Sensitivity** [verified: the same parse, with B taken as the first `B<n>` in the cell instead of the largest]. 11 IDs move:

| ID | Standalone B | Tier |
| --- | --- | --- |
| sk-2 | B3 | Core → Quick win |
| sdk-4, sdk-5, x-2, api-1, dk-2, x-3 | B3 | Core → Worth it |
| sdk-2 | B2 | Core → Defer |
| dk-6, wsc-3, sdk-9 | B2 | Worth it → Defer |

The C5 fund-path clause is applied unevenly across areas. sdk-8 and sdk-9 use it. These stay below C5 although each area file names a fund-path risk:
- at C4: dk-2, dk-5, api-1, wsc-1, wsr-1 and wsr-5;
- at C3: wsc-2, and sdk-4, sdk-5 and sdk-7's Bitcoin track. For the last three, deps.md says C5 would apply if their golden tests did not land first (deps.md:208,439,632).

It does not change any tier, because none of these IDs sits at the C ≤ 2 boundary [derived from the table].

**Evidence behind B4 and C4+.** IDs where a B ≥ 4 or C ≥ 4 rests only on [judgement] in the area file, or where the measured gain reaches only one layout or persona. Every other B4 and C4+ has a verified measurement, count or 3.0 break behind it [judgement, from reading each Benefit and Complexity section]. The C4-versus-C5 choice is judgement in most areas (see the C5 note above).

| ID | Rating | What it rests on | Source |
| --- | --- | --- | --- |
| sk-2 | B4 (with x-5) | [judgement] only | release-ci.md:583 |
| sdk-2 | B4 (as enabler) | [judgement] only; its measured share of the facade drop is at most −28 KB | packaging.md:124-125 |
| x-2 | B4 (combined) | [judgement] only: "the measuring stick" for other IDs | release-ci.md:143 |
| x-3 | B4 (combined) and C4 | [judgement] only, for both; the codemod alone is ~1,150 LOC, under C4's ~1.5k | release-ci.md:233,246 |
| dk-2 | B4 (if sodax-frontend adopts) | [judgement]; the adoption is unverified | dapp-kit-flows.md:20, Verification |
| wsr-5 | C4 | [judgement] breakdown; #486's size (88 files, +6,378/−247 LOC) is the only measured anchor | wallet-sdk-react.md:536 |
| sdk-1 | B4 | Measured (1,261 → 433 KB gzip, −291 MB) only for installs without the SODAX wallet packages; B4 for most rests on the prerequisite role [judgement] | chains.md:293,609 |
| sdk-4 | B4 (npm layout) | Measured −359 MB with npm; all three consumers use pnpm, where it is ~−70 MB, a B3 size | deps.md:214 |
| sdk-5 | about B4 | −254 KB measured on `new Sodax()`; carry-over to the real apps is [judgement], and most of it ships only with the 3.0 removals | deps.md:767 |
| api-1 | B4-size for P4 | Measured for P4 only; that persona's size is unknown | api.md:591 |

So only wsr-1 and wsr-2 reach B4 on measurements that cover both known React consumers, sodax-frontend and intents-whitelabel [derived from this table and wallet-sdk-react.md's consumer list]. The tier rule ignores confidence, so a judgement B4 ranks above a measured B3.

## Ranking table

Sorted by tier, then B_eff descending, then C ascending. FC = Feasible with caveats.

| ID | Issue | Feasibility / confidence | C | B (combined) | Timing | Tier | Area file |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sk-2 | Docs and AI guidance from released versions | Needs a decision / Proven | C2 | B3; B4 with x-5 | 2.x, before the first breaking merge | Core | [release-ci.md](release-ci.md) |
| sdk-2 | Unbundled ESM, no import-time side effects | Feasible / Proven (sdk), Code-traced (3 other packages) | C3 | B2 alone; B4 as enabler [judgement] | 2.x | Core | [packaging.md](packaging.md) |
| sdk-4 | Vendor the PancakeSwap code we use | FC / Proven (pure-function scope) | C3 | B3; B4 for npm-layout installs (−359 MB npm, ~−70 MB pnpm) | 2.x vendor; 3.0 `Price`/`Token` | Core | [deps.md](deps.md) |
| sdk-5 | Lighter chain libraries | FC / Proven (sizes, ICON tx+sig, Solana ix), Code-traced (ICON RPC, receipts) | C3 | B3; about B4 for ICON/Solana/Stellar apps after the 3.0 removals | 2.x (~110 KB); 3.0 removals | Core | [deps.md](deps.md) |
| wsr-2 | wagmi v3, connector SDKs optional | FC / Code-traced (connector break and bundle proven) | C3 | B4 (−541 MB; −15 vulnerable packages, −1 distinct advisory; no initial-bundle gain) | 3.0, first PR | Core | [wallet-sdk-react.md](wallet-sdk-react.md) |
| x-2 | Size, install and consumer-audit budgets in CI | FC / Code-traced | C3 | B3; B4 combined | 2.x, first | Core | [release-ci.md](release-ci.md) |
| api-1 | One viem-free `@sodax/api` with subpaths and shims | FC / Code-traced | C4 | B3; B4-size for P4 with api-2 | 2.x (T25 now) | Core | [api.md](api.md) |
| dk-2 | Lifecycle hooks for the remaining multi-step flows | FC / Code-traced | C4 | B3; B4 only if sodax-frontend adopts (unverified) | 2.x; DEX + cancel error change and DEX lifecycle 3.0 | Core | [dapp-kit-flows.md](dapp-kit-flows.md) |
| wsr-1 | Opt-in chain adapters, lazy chains, per-provider state | FC / Code-traced (bundle simulated) | C4 | B4 (1,744 → ~162 KB, simulated, needs a per-file wallet-sdk-core; ~924 KB EVM-only with today's dist) | 3.0; opt-in in 2.x | Core | [wallet-sdk-react.md](wallet-sdk-react.md) |
| x-3 | v2 → v3 codemod and migration guide | FC / Code-traced | C4 (codemod alone C3) | B3; codemod alone B2; B4 combined | 3.0; harness in 2.x | Core | [release-ci.md](release-ci.md) |
| sdk-1 | Non-EVM chains as opt-in packages | FC / Code-traced (benefit Proven) | C5 | B4 (sdk-only installs; with wallet packages ~0 alone) | 3.0; registry + boundary in 2.x | Core | [chains.md](chains.md) |
| sk-1 | Skills versioned with the SDK | Feasible / Code-traced | C2 | B3 | 2.x, before the first contract merge | Quick win | [release-ci.md](release-ci.md) |
| api-4 | OpenAPI drift check in CI | FC / Proven (prototype) | C3 | B3 [judgement; B2 fallback] | 2.x, scheduled; `/be` reads fixed now | Worth it | [api.md](api.md) |
| dk-6 | Standard names; `SodaxProvider` accepts an instance | FC / Code-traced (size Proven) | C3 | B2; B3 combined (43–50 KB, at the line) | 2.x aliases + prop; 3.0 removes aliases | Worth it | [dapp-kit-surface.md](dapp-kit-surface.md) |
| sdk-7 | Browser entries without Node polyfills | Needs a decision (scope) / Proven (EVM-only core), Code-traced (rest) | C3; Bitcoin a further C3 (C5 before golden PSBT tests) | B3 | 2.x T15.1 + libs `crypto`; 3.0 rest | Worth it | [deps.md](deps.md) |
| x-1 | Split `@sodax/types`, stop inlining it | FC / Proven (simulation) | C3 | B3 | 2.x, split after #534 | Worth it | [packaging.md](packaging.md) |
| x-5 | `release-2.x` maintenance line | FC / Code-traced | C3 | B3 | 2.x guard now; line at 3.0.0 | Worth it | [release-ci.md](release-ci.md) |
| api-2 | `@sodax/api/react` hooks without the SDK | FC / Code-traced | C4 | B3 (needs api-1 for LY, `/be`) | 2.x, after api-1 | Worth it | [api.md](api.md) |
| dk-5 | Consistent typed errors in hooks | FC / Code-traced | C4 | B3 | 2.x all `SodaxError`; 3.0 Result-as-data + stop swallowing | Worth it | [dapp-kit-surface.md](dapp-kit-surface.md) |
| sdk-3 | ESM-only packages, peers with tested ranges | FC / Proven | C4 | B3 (alone and on top of sdk-4) | 3.0 | Worth it | [packaging.md](packaging.md) |
| sdk-8 | Error metadata, AbortSignal, request IDs | FC / Code-traced (defects Proven) | C4 (C5 once signals reach action flows) | B3 | 2.x; solver result type 3.0 | Worth it | [sdk-runtime.md](sdk-runtime.md) |
| wsc-1 | Private-key signers to server-only entries | FC / Code-traced (bundle Proven) | C4 | B3 (98–160 KB gzip) | 3.0; expand in 2.x | Worth it | [wallet-sdk-core.md](wallet-sdk-core.md) |
| wsc-3 | Signers into chain packages; a slim wallet-sdk-core keeps base + EVM (D3 recommendation) | FC / Code-traced | C4 | B2; B3 with sdk-1 + wsr-1 | 3.0 | Worth it | [chains.md](chains.md) |
| sdk-9 | Remote token lists and chain metadata | Needs a decision / Code-traced (live data Proven) | C5 | B2; B3 combined | 3.0; decisions now | Dropped 2026-10-20 (D8) | [sdk-runtime.md](sdk-runtime.md) |
| wsr-3 | Reuse the app's QueryClient | Feasible / Code-traced | C1 | B2 | 2.x now | Cheap DX | [wallet-sdk-react.md](wallet-sdk-react.md) |
| api-3 | Document API mode | FC / Code-traced | C2 | B2 | 2.x now | Cheap DX | [api.md](api.md) |
| dk-7 | Polling presets (execution modes dropped) | Presets FC; modes Premise incorrect / Code-traced | C2 (presets) | B2 presets; B1 modes | 2.x presets after dk-3; drop modes | Cheap DX | [dapp-kit-flows.md](dapp-kit-flows.md) |
| sk-3 | Generate the hook index and query-key reference | Feasible / Code-traced | C2 | B2 | 2.x now | Cheap DX | [dapp-kit-surface.md](dapp-kit-surface.md) |
| wsc-4 | Standard wallet adapters | Feasible / Proven (adapter type-check only) | C2 | B1 | Later | Cheap DX | [wallet-sdk-core.md](wallet-sdk-core.md) |
| wsr-4 | Typed per-chain account hooks | Feasible / Code-traced | C2 | B1 | Later | Cheap DX | [wallet-sdk-react.md](wallet-sdk-react.md) |
| dk-1 | Per-feature subpaths, SDK as peer, no `export *` | FC / Proven | C3 | B2 (0 KB alone when the SDK is bundled) | 2.x build + subpaths; 3.0 peer + no `export *` | Defer | [dapp-kit-surface.md](dapp-kit-surface.md) |
| dk-3 | Export query keys and `queryOptions` builders | Feasible / Code-traced (gate impact Proven) | C3 | B2 | 2.x | Defer | [dapp-kit-surface.md](dapp-kit-surface.md) |
| dk-4 | Wallets from context | FC / Proven (stand-in typing), Code-traced (trees) | C3 | B2 | 2.x | Defer | [dapp-kit-flows.md](dapp-kit-flows.md) |
| sdk-10 | `@sodax/sdk/testing` | FC / Code-traced (fakes and fake `fetch` Proven) | C3 | B2 | 2.x `fetch` + fixtures; 3.0 wallet fakes | Defer | [sdk-runtime.md](sdk-runtime.md) |
| sdk-6 | Per-feature entry points | FC / Proven | C3 | B2 (−54 KB on top of sdk-1 + sdk-4; no consumer skips the facade) | 2.x, `import`-only subpaths | Defer | [packaging.md](packaging.md) |
| wsc-2 | Signing-only wallet interfaces | FC / Code-traced (EVM receipt probe) | C3 (C4 if chain clients ship outside the sdk) | B2 | 3.0; internal callers in 2.x | Defer | [wallet-sdk-core.md](wallet-sdk-core.md) |
| x-4 | Runtime matrix: Node, Bun, Deno, Workers | Needs a decision / Proven | C3 | B2 | 2.x smoke legs; 3.0 matrix | Defer | [release-ci.md](release-ci.md) |
| wsr-5 | Embedded and social wallets, starting with Privy | Needs a decision / Code-traced | C4 (social login alone C2) | B2 | Later; social login in 2.x on request | Defer | [wallet-sdk-react.md](wallet-sdk-react.md) |
| sk-4 | Skills and shared MCP tool schemas | Premise incorrect / Code-traced | — | B1 | Drop | Drop | [api.md](api.md) |

## Fix now in 2.x

Defects in today's code, at `0181a053` unless another repo is named. "re-checked" means I opened the cited lines with `git show` on 2026-10-20. The rest are [verified] in their area file. The local `origin/main` was still `0181a053` on 2026-10-20, so no later commit has touched these lines. Items 20–22 were added by the consistency check; each is [verified] in its area file and re-checked the same way.

1. **api-1 (T25).** swaps-api has no Bitcoin raw-tx branch, so a Bitcoin `tx` falls through to `AnyRawTxSchema` and `value` stays a string where the type says `bigint`. See `packages/swaps-api/src/rawTxSchemas.ts:105-106,137-138` against `packages/bridge-api/src/rawTxSchemas.ts:80-85,155-156` [re-checked]. About C1. Land it before #534/#497/#95, or each of them must add the branch.
2. **api-4.** 4 public `/be` token reads return `invalid_response_shape` on prod. They validate the v2 `XToken` shape (`packages/sdk/src/backendApi/backendApiSchemas.ts:29-38`) but call v1 routes (`BackendApiService.ts:708,724,737,776`) [re-checked]. Fix: route them to `/v2/be/config/*`, which already serves `XToken`. The tests feed a v2 fixture to the v1 routes (`BackendApiService.test.ts:106-114`).
3. **dk-3.** The `useMMAllowance` key leaves out `amount` and `srcAddress`, but the query sends the whole payload (`packages/dapp-kit/src/hooks/mm/useMMAllowance.ts:37` vs `:48`) [re-checked].
4. **dk-3.** The `useDexAllowance` key leaves out `srcAddress` (`packages/dapp-kit/src/hooks/dex/useDexAllowance.ts:27`) [re-checked].
5. **wsr-3.** `EvmProvider` creates its own `QueryClient` and wraps children in it, so app defaults are bypassed: whitelabel's retry, refetch and `onError`, and the frontend's `staleTime`. See `packages/wallet-sdk-react/src/providers/evm/EvmProvider.tsx:27-30,70-77` [re-checked].
6. **dk-2, PR 1.** 32 post-broadcast error exits outside #509 drop `srcTxHash`, plus 2 in the LY positions hub branch. 24 of the 32 can carry it additively in 2.x, for example `packages/sdk/src/moneyMarket/MoneyMarketService.ts:551,574`, `staking/StakingService.ts:437` and `migration/MigrationService.ts:573` [re-checked: these call `verifyFailed`/`mapRelayFailure`]. The 8 MM exits among them wait for #534. The 8 DEX and swap-cancel exits change error shape, so they are 3.0.
7. **sdk-8 P1.** swaps-api retries a caller abort 3 times and reports `NETWORK_ERROR`, because `timedOut()` checks only its own controller (`packages/swaps-api/src/http.ts:168,184-191`) [re-checked]. bridge-api has the same code, not run.
8. **sdk-8 P3.** The solver transport returns the raw body without the HTTP status (`packages/sdk/src/swap/SolverApiService.ts:104,164,240`) [re-checked :104]. It builds `-999` details (`:125,181,259`). A 500 with a NestJS body comes back typed as `SolverErrorResponse` without `detail`, so `res.error.detail.code` throws. In the two probed transport failures (a 502 and a refused connection), `sodax.swaps.postExecution` returned `EXTERNAL_API_ERROR`, not the documented `EXECUTION_FAILED` (`SwapService.ts:644`). Adding status to the context is additive; the result-type change is 3.0.
9. **sdk-8.** `retry()` writes `console.error` even with a silent logger (`packages/sdk/src/shared/utils/shared-utils.ts:57`) [re-checked].
10. **api-3.** The docs say Bitcoin raw mode is not supported, but TRADING mode supports it (`docs/developers/how-to/bitcoin-integration.md:311`) [re-checked]. The OpenAPI section is stale, and there is no bridge HTTP page.
11. **api-4.** `.github/ci.md:19` calls `check:sponsoring-contract` a manual gate because "CI has no sponsoring service to fetch it from" [re-checked]. The live spec is fetchable and the check passes against it, so it can be wired into CI.
12. **api-4, sodax-backend.** bridge-api mounts Swagger at `docs`, so `/v1/bridge/docs-json` returns 404 (`apps/bridge-api/src/main.ts:78`).
13. **x-5, latent.** Every stable publish sets `latest` (`.github/workflows/sdks-publish.yml:38-43` [re-checked]; the 9 per-package workflows at `:35`). The first 2.x publish after 3.0 would move `latest` back. The guard gates 3.0.0.
14. **x-4.** CI runs only Node 24.x (`.github/workflows/ci.yml:112,152,271`) [re-checked; every `node-version` in `.github/workflows/*.yml` is 24.x, by grep], while `engines` is `>=22.12.0` (`package.json:6-7`) and the backend runs 22.18.
15. **sk-1, sodax-frontend.** `skill.md` says `version: '2.1.0'` and links `main` (`apps/web/content/skill.md:23`) [re-checked].
16. **sk-3.** `hooks-index.md` (`packages/skills/skills/sodax-dapp-kit/integration/knowledge/reference/hooks-index.md`) misses 14 of 217 hooks; #374 added 13 of them without rows. Method: `python3 -I doc_drift.py` in the dk-surface scratch.
17. **wsr-1 (T3.10).** The wallet-sdk-react dist has no `'use client'` (0 of 29 `.mjs` files), although the source has one (`packages/wallet-sdk-react/src/SodaxWalletProvider.tsx:1`) [re-checked: source line].
18. **sdk-6, latent.** `import` plus `require` of `@sodax/sdk` in one process loads two `Sodax` classes (probe on the published 2.2.0; exports at `packages/sdk/package.json:28-40` [re-checked]). No known consumer mixes the two. `import`-only subpaths keep this from spreading.
19. **sk-2.** docs.sodax.com documents `useSwapLifecycle` (#504) and `@sodax/wallet-sdk-react/privy` (#486), which no npm release contains [verified: `npm view @sodax/dapp-kit time` and `npm view @sodax/wallet-sdk-react time` show no publish after 2026-10-12; #486 merged 10-13 and #504 on 10-15, by `gh pr view`]. Docs go live on merge (`docs/README.md:3-6`). The fix waits on decision D10.
20. **sdk-8 P4.** `JSON.stringify` of a swaps/bridge-stack error loses the backend body, because a non-`SodaxError` cause is serialized with only name, message, stack and cause (`packages/sdk/src/errors/SodaxError.ts:104-111`) [re-checked; probe at sdk-runtime.md:91-93]. The makeRequest stack keeps the body.
21. **sdk-9, docs.** `docs/developers/faq.md:26` says `await sodax.initialize()` "fetches the latest tokens and chains", but `initialize()` is a no-op (`packages/sdk/src/shared/config/ConfigService.ts:158-164`, a TODO until the v2 endpoint is live) [re-checked; release-ci.md:550]. Fix the page now, or with #543.
22. **wsr-1, docs.** `SodaxWalletProvider.tsx:32-33` says "remount with a new `key`" to change config, but the ICON and Injective singletons keep the config of their first creation (`xchains/icon/IconXService.ts:53-58`; `xchains/injective/InjectiveXService.ts:50-53` documents it) [re-checked; wallet-sdk-react.md:98-101]. Fix the JSDoc now; the code fix comes with wsr-1's per-provider state.

## Dependencies and order

### Edges between IDs

"A → B" means A should land first, or B's benefit needs A.

| From | To | Why |
| --- | --- | --- |
| sdk-2 | sdk-6, sdk-3, dk-1, wsr-1, sdk-7, wsc-1 | Per-file ESM is the template. sdk-6 needs it in the planned layout [judgement; tsup `splitting: true` not evaluated]. wsr-1's ~162 KB needs a per-file wallet-sdk-core. sdk-7 gets lazy ECC init. wsc-1's gain splits with it |
| sdk-2, sdk-6, x-1, sdk-3, x-5 | sdk-1 | 2.x chain subpaths, `createSodaxCore`/plugin entries, light types, package scaffold, release lists |
| sdk-4 | sdk-1, sdk-3, sdk-7, x-1 | swap-sdk-core pulls `@solana/web3.js` into EVM bundles. The install gain of peers needs PancakeSwap's pinned viem gone. It is the only `buffer` importer in the EVM-only graph. Infinity type copy |
| sdk-5 (2.x part) | sdk-1 | 2.x users get ~110 KB only if it lands first. Stellar `/minimal` must ship in sdk, wallet-sdk-core and wallet-sdk-react together |
| sdk-1 | wsc-3, dk-1, dk-6, x-3, x-2, sdk-9 | Chain packages host the signers. Per-chain dapp-kit subpaths. Plugins in `SodaxProvider`. Codemod. EVM-only budget. Unknown chains |
| dk-1 (per-chain subpaths) | sdk-1 (3.0 chain packages) | If dapp-kit's chain hooks import runtime values from optional chain packages, a missing package breaks a root barrel that re-exports them (dapp-kit-surface.md:539; esbuild, minimal model) |
| x-1 | sdk-3, api-1 | sdk-3 needs T10 first: no inlined copies left in CJS (packaging.md:422). `@sodax/types` is 117–143 KB of every `@sodax/api` bundle, so api-1 can land first but its P4 size gain arrives with the split (packaging.md:431, api.md:463) |
| sdk-1 + sdk-4 | sdk-6 (benefit) | sdk-6's size and startup gains belong to them; it adds ~54 KB on top. sdk-6 can land first, since it also fixes the dual graph (packaging.md:420) |
| dk-2 (PR 1) | sdk-8 (action-param aborts) | `srcTxHash` on every flow before action-param aborts (sdk-runtime.md:474) |
| wsc-1 | wsc-3 | Where the server classes live |
| wsc-3, wsr-2 | wsr-1 (install win) | wallet-sdk-core alone still installs 507 MB, with 31 vulnerable packages (51 distinct advisories) |
| wsr-1, wsr-2 | wsr-5 | Adapter shape; `withCapabilities` |
| wsr-1 | dk-4 (option (a), and the store switch) | dk-4's chosen option (b), a nestable provider, ships in 2.x on today's wallet-sdk-react; its hook must then read the store wsr-1 introduces. Option (a), a `wallets=` prop, needs wsr-1's headless `createSodaxWallets()` (dapp-kit-flows.md:295-296,301). wallet-sdk-react.md:573 states the edge as a hard need |
| wsc-2 | sdk-10 (wallet fakes), wsc-4 (Solana adapter) | Fakes shrink; `signTransaction(bytes)` |
| sdk-8 | api-1, sdk-1 | Fix the two identical `http.ts` copies before merging them. Loop signals land before the chain moves |
| sdk-8 ↔ sdk-10 | — | Same 8 transport sites (signal and `fetch`); do them in one pass |
| api-1 | api-2, api-4, api-3 (rename) | LY and `/be` hooks need sdk-free clients. One schema location. Docs name `@sodax/api` |
| sdk-8, dk-5 | api-2 | `SodaxError` and `isAuthFailure` must move below the sdk |
| dk-3 | dk-7, api-2, sk-3 | Presets live in the builders. 63 API-lane keys. The generator follows the factory |
| dk-6 | api-2, sdk-9, sk-3, x-3 | `SodaxProvider` mounts `ApiProvider`. An instance lets `initialize()` run. Aliases. Rename transforms |
| dk-2 | dk-5 (3.0 part) | Status hooks that throw must land with or after the lifecycles |
| x-2 | x-4 | Fixtures |
| sdk-3, sdk-7 + sdk-1 | x-4 (3.0 leg) | `require(esm)`; Workers with neither `nodejs_compat` nor a `Buffer` polyfill |
| x-5 | sk-1, sk-2, sdk-9 | 2.x ref names; a major-aware `CONFIG_VERSION` rule |
| sk-2 | sk-1, api-3 | One docs channel decision; api-3 feeds the pinned channels |
| dk-1, dk-6, sdk-1, wsr-1, wsc-3, api-1, x-1 | x-3 | Each transform waits for its API freeze |
| api-4 | sk-4 | api-4's OpenAPI contract replaces sk-4's shared schemas |

### Edges to in-flight PRs and issues

States are from `gh pr view` / `gh issue view` on 2026-10-20.

| Item | State | Blocks or touches |
| --- | --- | --- |
| #534 Tron + MPC settle (`!`) | open PR | sdk-1 registry (merge first), x-1 T14.2 (all 4 chain PRs conflict), dk-2 MM part (`spoke.settle`, but only 6 of 24 relay calls move), wsr-1 order step 1, wsc-1 (Tron is a tenth class), api-1 T25 (needs a raw-tx branch) |
| #509 `srcTxHash` on bridge and vault errors | open PR | dk-2 extends it. sdk-8 action-param aborts depend on it. It collides with call-site annotations in `LeverageYieldService` |
| #511 approve + intent, swaps API lane | open PR | wsc-2 lands after it. api-2 (where the batch hook lives). dk-1/dk-3/sk-3 touch the same index files. sdk-8 (feature services) |
| #512 approve + deposit, bridge and LY vaults | open PR | wsc-2 lands after it. sdk-8 (`IntentRelayApiService.ts`). dk-3/sk-3 index files |
| #523 stop polling a cancelled intent | open PR | dk-2 settlement read (`detailedStatusRouting.ts`). sdk-8 (feature services) |
| #540 approve + action batches beyond swap | open issue | dk-2 hooks are gated on it. dk-6 names must be agreed before it adds `*WithApproval` hooks. wsc-2 (shared batch helper waits through the spoke) |
| #543 `initialize()` loads live config | open issue | sdk-9 builds on it. api-4's token-read fix reads the same v2 controller. dk-6 instance prop. x-5 version rule. Its "Blocked" note is stale (see Corrections) |

### Proposed order

Waves 0–3 are **2.x, additive**. Wave 4 is the **3.0 breaking** window. Within a wave, IDs can run in parallel unless an edge above says otherwise. Some Defer-tier IDs come early because other work depends on them: dk-1, dk-3, sdk-6, wsc-2 and sdk-10.

| Wave | Opens when | IDs | Kind |
| --- | --- | --- | --- |
| **0. Fix now** | now | The 22 items above. T25 first (before the chain PRs). dk-2 PR 1 after #509; its MM part after #534 | 2.x patch, no API change |
| **1. Gates and builds** | now | x-2 (first; it measures the rest); x-5 dist-tag guard; x-4 Node 22.12 leg and Deno/Bun/workerd smokes; sk-2 and sk-1 decided; sk-3; api-3; sdk-2; x-1 T10.1 + T14.1; sdk-4 PR 1; sdk-5 2.x part; sdk-7 T15.1 + libs `crypto`; wsc-1 Injective + browser-only classes (with sdk-2); sdk-8 metadata and request IDs together with the sdk-10 `fetch` option | 2.x additive |
| **2. Transport and dapp-kit** | #509, #511, #512, #523 merge (#483 for errors) | sdk-8 AbortSignal; sdk-10 fixtures; sdk-6 `import`-only subpaths; dk-1 build + subpaths; dk-3 factory + builders → dk-7 presets; dk-6 aliases + instance prop (names agreed before #540); dk-4 option (b) on today's wallet-sdk-react; wsc-2 internal callers; dk-5 2.x part; api-1 PR 2–4 (after the sdk-8 `http.ts` fix) → api-4 gate (backend bridge-spec fix in parallel) | 2.x additive |
| **3. Chains and APIs** | #534 merges, or the chain ADR is accepted | x-1 T14.2 split; sdk-1 registry, seams and boundary gate; wsr-1 expand phase (store → adapters → per-file ESM → lazy siblings), with dk-4's source hook moved to the new store; dk-2 settlement read + MM/staking/migration lifecycles (after #540); api-2 (after api-1 and the error move) | 2.x additive |
| **G. Gate before breaking** | waves 1–3 done | x-5 line ready; sk-1/sk-2 pinned to stable; x-3 harness + in-repo transforms (dk-1, dk-6); last 2.x minor; branch `release-2.x` | 2.x |
| **4. Contract** | 3.0 window opens | wsr-2 → sdk-3 (with sdk-4 PR 2 `Price`/`Token` and the dk-1 peer) → wsc-2 removals → wsc-1 root removal → sdk-1 chain packages, one per chain, each with wsc-3 + sdk-5 removals + sdk-7 T15.3/T15.2 (Bitcoin: bitcoinjs 7 only after golden PSBT tests) → wsr-1 default flip → dk-1 no `export *`, dk-5 3.0 part, dk-6 alias removal, dk-2 DEX/cancel errors + DEX lifecycle, sdk-8 solver result type, sdk-10 wallet fakes, x-4 matrix → x-3 guide and codemod → 3.0.0-rc.1 | 3.0 breaking |
| **Later** | 3.x | wsc-4 (after wsc-2), wsr-4, wsr-5 (social login in 2.x only on request; lazy Privy with wsr-1). sk-4 is dropped | additive |

This matches `plan-v3-final.md` §4 (W1–W8). It differs in three places:
- sdk-5's 2.x part goes before sdk-1;
- wsc-1's Injective split goes in wave 1;
- api-4 is pulled into wave 2 because of the live `/be` drift.

All three are [judgement].

## Decisions the team owns

Deduplicated across the ten areas. "Rec" is the area file's recommendation.

| # | Decision | Options | Blocks |
| --- | --- | --- | --- |
| D1 | Chain placement | Tron: core or plugin (rec plugin, on by default in 2.x). Monad: core key-level built-in or opt-in. Registry key: chain type or hybrid key-then-type (rec hybrid, fail-closed). Sponsoring: whole into the Stellar plugin, or core with a Stellar capability | sdk-1, wsc-3, x-1, dk-1 |
| D2 | When chain code moves | (a) in-package `src/chains/<name>` in 2.x, extract in 3.0; (b) packages in 2.x through a kit; (c) registry only, move once in 3.0. Rec (a), or (c) for fewer PRs. The install win is 3.0 under all three | sdk-1, wsc-3, sdk-5 (3.0 part) |
| D3 | wallet-sdk-core home | Fold base + EVM into `@sodax/sdk/wallet` (reverses two AGENTS.md rules; API-only React apps install the sdk) or keep a slim wallet-sdk-core (rec). Where server signers live | wsc-3, wsc-1 (3.0), wsr-1 install win, api-2 |
| D4 | Chain clients for apps without `@sodax/sdk` | (a) keep receipt waits as optional wallet members; (b) read clients outside the sdk; (c) per-chain recipes. Rec (a) + (c) | wsc-2, sdk-10, wsc-4, api-2 |
| D5 | Toolchain and peer floors | viem `^2.29.2`, 2.28.0 or `>=2.43`. TS ≥5.9.3 as a recommendation or a catalog bump. react ≥18 or ≥19 for `@sodax/api/react` | sdk-3, wsr-2, api-2 |
| D6 | Subpaths in 2.x | `import`-only subpaths now (proven gate) or wait for ESM-only 3.0 | sdk-6, sdk-1 (2.x entries), dk-1, sdk-10 |
| D7 | Error model | Where `SodaxError` lives. #483 in 2.x or in the window. Solver errors converted in dapp-kit or in the SDK. D-class hooks keep their defaults or throw. Standalone-client aborts: rethrow `signal.reason` or add `ABORTED`. Request IDs only to hosts that allow them, or ask the solver/relay owners first | sdk-8, dk-5, api-1, api-2 |
| D8 | Remote config (#543) | Version rule (same major and ≥, or a separate data revision). Default in 3.0. Fallback (bundled, opt-in import, none). Trusted fields vs #543 AC1. Data source: settled 2026-10-20 as SDK releases only (SODAX design: everything goes through the SDK). sdk-9 was then dropped from the v3 list, and the rest of D8 is decided inside #543. Unknown chains. Start-up mode. Who bumps the backend pin | sdk-9, x-5, dk-6 |
| D9 | Lifecycle scope | Which flows (rec MM and staking, then migration, then DEX as two legs). Resume after a closed tab: (A) `onBroadcast`, (B) the lifecycle drives the steps, (C) no change plus `resumeFrom` (rec). What `settled` means for two-leg flows | dk-2 |
| D10 | Docs channel | Docs stop going live on merge. Hotfix path. Who moves `docs-stable`. Where the marketing-docs auto-merge (#416) targets | sk-2, sk-1, api-3, x-3 |
| D11 | 2.x maintenance | Patch releases at all, or security only. Tag names `v2-latest`/`v2-rc` (npm refuses `v2`, `2.x`). Support length | x-5, sk-1, sk-2, sdk-3 |
| D12 | CI gates | Required or advisory (`main` requires no check today). Budget levels. Consumer job on every PR, or on dependency PRs plus weekly | x-2, x-4 |
| D13 | Runtime support | Workers with `nodejs_compat`, with an app `Buffer` polyfill, or with neither (after sdk-7 + sdk-1). Bun/Deno committed or best effort. Which entries (wallet-sdk-react is bundler-only) | x-4, sdk-7 |
| D14 | sdk-7 scope | Core + EVM entries only (reachable) or every chain and the wallet-sdk-react root (not with today's libraries, as probed) | sdk-7, x-4 |
| D15 | dapp-kit names and provider | Fix ~18 outliers, or full feature prefixes (~30 names). Agree before #540. Shape of the facade-free provider | dk-6, sk-3, x-3 |
| D16 | wallet-sdk-react design | Lazy chains opt-in in 2.x or default in 3.0. Headless `createSodaxWallets()`. Throw outside a provider or keep the fallback. dk-4: (a) a `wallets=` prop or (b) a nestable provider (rec b) | wsr-1, dk-4, wsr-5 |
| D17 | Social and embedded wallets | Wanted at all, which providers. Solana embedded now or on demand | wsr-5 |
| D18 | Codemod form | A published `@sodax/codemod` or a repo script plus a skill | x-3 |
| D19 | PancakeSwap source and timing | Port from Uniswap MIT and the ABIs (rec), which leaves only a legal call on the type copy in `@sodax/types` (`pancakeswap-infinity.ts:418-610`). `Price`/`Token` change in 3.0 | sdk-4, x-1 |

Smaller calls, each with one owner area:
- dk-3: an optional `queryKeyScope`.
- sk-3: whether the index's Purpose column comes from JSDoc.
- wsc-4: whether `fromEip1193` switches chains or only rebinds.
- wsr-4: a generic `useXAccount<K>`, or per-chain hooks in subpaths.
- api-1: inline or external `@sodax/types`, and whether solver and relay move.

Ops items (not design):
- confirm that the npm token can create new `@sodax/*` packages (sdk-1, api-1, wsc-3);
- relay CORS for `x-request-id` (sdk-8).

## Corrections to earlier research

Mostly the first pass (e-519) and research A–D. Each area file has the full list under its IDs.

**sdk core and packaging**
- **sdk-1.**
  - "viem-based chains in core" is rejected.
  - The plugin contract draft misses XRP `checkDestination`, the MPC simulation skip, Bitcoin `walletMode`, Sponsoring and Radfi.
  - There is no install win in 2.x under any layout.
  - With the SODAX wallet packages installed, sdk-1 alone saves ~4.8 MB and 0 advisories.
- **sdk-2.** Facade apps gain −33 KB, not 0. "SodaxError 825 → 0.6 KB" is not the integrators' import set.
- **sdk-3.** Peers alone remove 1 of 8 viem copies, and sdk-4 owns most of the combined drop, so B3, not B4. Per-file ESM costs the CJS backend +143 to +164 ms at start.
- **sdk-6.** The dual-graph hazard exists in 2.x today. `import`-only subpaths fix it without 3.0. It adds −54 KB on top of sdk-1 + sdk-4, so B2, not B4.
- **x-1.** Stopping inlining alone makes a one-client P4 bundle larger (40.7 → 43.8 KB) until `sideEffects: false` lands.
- **sdk-4.**
  - The GPL `LICENSE` matches pnpm's automatic copy of a GPL root. Porting from Uniswap MIT avoids the question.
  - "Keep swap-sdk-core in 2.x" is a step, not an end state: it costs +92 KB gzip with sdk-1.
  - The −359 MB is an npm-layout number (~−70 MB with pnpm).
  - PancakeSwap reaches every entry through `SonicSpokeService.ts:33`, not only swap and LY.
- **sdk-5.** Only ~110 of 254 KB can ship in 2.x. icon-sdk-js leaves with the 3.0 `iconService` removal. Stellar `/minimal` must move in all three packages.
- **sdk-7.** The libs `crypto` external is not a break under Next webpack, which maps `crypto` to crypto-browserify. That adds about 137 KB gzip, measured with npm shims in esbuild standing in for Next's copies (deps.md:637). bip322-js 4 still needs a global `Buffer`.

**sdk runtime and APIs**
- **sdk-8.** The caller-abort `REQUEST_TIMEOUT` is latent. Relay and solver CORS behaviour depends on the route (solver `/quote` allows the header). There are 5 transport error types plus ≥3 context layouts, not "4 shapes".
- **sdk-9.**
  - #543's "Blocked" is stale: `/v2/be/config/all` returns 200.
  - rc.2–rc.18 do fetch v1 config, then reject it.
  - Same-major alone allows downgrades. The rule needs "same major and ≥" or a separate data revision (sdk-runtime.md:370; D8).
  - Token lists are fund-routing data, not a low-trust subset.
- **api-4.** The v2 routes are reachable at `/v2/be/config/*`; the second pass probed the wrong path.
- **api-2.** There are 79 hooks, not "88 hook files", and the "3 `sodax.bridge.*` hooks" do not exist.
- **sk-4.** No request schemas exist. Remove `@sodax/api/tools` from `plan-v3-packages.md`.

**dapp-kit**
- **dk-1.** Bundlers already drop unused hooks when the SDK is bundled (0 KB). The value is dedupe and per-chain subpaths.
- **dk-2.**
  - 32 exits (+2) drop the hash, not just "relay errors in 4 flows".
  - A keyless public relay read exists.
  - After #534 the seam is `spoke.settle` for only 6 of 24 relay calls.
  - Recovery does not submit to the relay, although `RECOVERY.md:105` says it does.
- **dk-3.** The frontend hand-writes 11 keys. `useEModes` is an inconsistency, not a bug. `useDexAllowance` is a new bug.
- **dk-5.** 6 hooks swallow errors, not 5. A fourth class: 18 hooks pass raw library errors through.
- **dk-6.** The instance prop works today with lockstep pins.
- **dk-7.** The modes already exist, so that half is "Premise incorrect". There are 46 code sites, not 52.

**Wallets**
- **wsr-1.** Solana and Sui can mount lazily as siblings. ~162 KB needs a per-file wallet-sdk-core; with today's dist the EVM-only build is ~924 KB.
- **wsr-2.** TS ≥5.9.3 is not a blocker; 5.5.4 compiles. wagmi v3 adds 15–19 KB on a code-split path.
- **wsr-3.** The effect is that SODAX's own queries miss the app defaults, not that wagmi picks them up.
- **wsr-5.** Privy on Solana does not force the SDK onto `@solana/kit`. `x402` installs wagmi v2.
- **wsc-1.** It is B3, not B2 (98–160 KB). "84% Injective" holds only after sdk-2; it is 57% today.
- **wsc-2.** Apps can build `SpokeService` from public exports, without `new Sodax()` (EVM probe).
- **wsc-3.** It also reverses `packages/sdk/AGENTS.md:15`. Its size win needs wsr-1.

**Release and CI**
- **x-2.**
  - "35 advisories" counted packages; there are 47 advisory IDs.
  - There are 20 overrides, not 24.
  - size-limit 14.1.0 is outside the cooldown; only 14.2.0 is inside.
- **x-4.** The Deno result came from the T2 build. It now holds for tsup builds (import + construct). Workers pass with `nodejs_compat` or a `Buffer` polyfill.
- **x-5.** `release.mjs` assumes one line in 9 places, not 8.
- **sk-1.** No context7 library is indexed from the repo.
- **sk-2.** The `release` branch holds rc content, so pinning to it is not "released".

## One-line wording per ID for #519

- **sdk-1:** Keep the Sonic hub and EVM chains in core. Make every other chain type an opt-in @sodax/chain-<name> plugin, with @sodax/chains-all for full-chain integrations
- **sdk-2:** Publish unbundled ESM with no import-time side effects, and `sideEffects: false` on @sodax/types, so bundlers can remove unused code
- **sdk-3:** Publish ESM-only packages that Node 22.12+ can still require(), with viem, wagmi and @tanstack/react-query as peers where used, tested at the floor and latest in CI
- **sdk-4:** Replace the PancakeSwap SDKs with our own CL math, codecs and encoders, ported from Uniswap's MIT SDK or written from the ABIs, with golden equivalence tests
- **sdk-5:** Lighter chain libraries: ICON reads and tx building over JSON-RPC with typed receipts, Stellar /minimal, and Solana instructions without Anchor or runtime IDL fetching
- **sdk-6:** Add per-feature entry points like @sodax/sdk/swap alongside the Sodax facade
- **sdk-7:** Make the core and EVM browser entries need no Node builtins or globals (Buffer, process, global, crypto, stream); chain packages document what they still need
- **sdk-8:** Standardize API error metadata (status, body, retryable, aborted vs timeout), support AbortSignal for requests and polling, and add request IDs where the backend supports them
- **sdk-9:** Dropped 2026-10-20 (D8). Config and token lists come only from SDK releases; remote config stays opt-in inside #543
- **sdk-10:** Add a @sodax/sdk/testing entry with typed fake wallet providers, schema-checked API fixtures and a fetch option, with no test-runner dependency
- **dk-1:** Ship dapp-kit as unbundled ESM with per-feature and per-chain subpaths, make the SDK a peer, and stop re-exporting the entire SDK
- **dk-2:** Lifecycle hooks for money market, staking, migration and DEX on one shared core, with srcTxHash on every post-broadcast error and a public settlement-status read
- **dk-3:** Export a query-key factory that keeps today's key shapes, plus queryOptions builders for every query
- **dk-4:** Resolve wallets from a nestable wallet-source context by default (wallet-sdk-react or app-provided); an explicit walletProvider always wins
- **dk-5:** Every hook error is a SodaxError with typed codes where the SDK types them; quote and status reads throw instead of returning Result, and reads stop swallowing errors
- **dk-6:** Standardize hook and parameter names (deprecated aliases until 3.0), and let SodaxProvider take an existing Sodax or core instance without importing the full facade
- **dk-7:** Add named polling presets with a SodaxProvider override
- **wsc-1:** Move private-key and mnemonic signers to server-only entries; browser classes never reference them
- **wsc-2:** Wallet interfaces only sign and submit; SDK flows wait through chain clients, and receipt waits stay optional for API-only apps
- **wsc-3:** Move non-EVM signers into the chain packages and slim @sodax/wallet-sdk-core down to the shared base and EVM signers
- **wsc-4:** Add EIP-1193 and Solana Wallet Standard adapters (viem WalletClient already works)
- **wsr-1:** Use opt-in chain adapters (adapters={[evm(), solana()]}), load non-EVM chain code on demand with Solana and Sui providers mounted beside the app, and scope state to each provider
- **wsr-2:** Upgrade to wagmi v3 (viem ≥2.43) and make connector SDKs optional peers, installed only when their connectors are used
- **wsr-3:** Reuse the app's QueryClient instead of creating a nested one
- **wsr-4:** Type useXAccount's address by chain (narrow for EVM and ICON), without adding a hook named useAccount
- **wsr-5:** Support embedded and social wallets as wallet sources passed to chain adapters: social login on today's Privy email login, then Solana, with Privy loaded only when used
- **sk-1:** Pin every non-npm skills channel (skills CLI, sodax.com/skill.md, doc links) to the latest stable release, with a 2.x ref for 2.x users
- **sk-2:** Serve docs.sodax.com and the AI guidance built from it from the latest stable release, with main as a preview and a hotfix path for docs-only fixes
- **sk-3:** Generate the hook index and query-key reference from source, and fail check:ai when they drift
- **sk-4:** Drop. Later, only if an MCP owner commits to using them: publish JSON Schemas for the API responses from @sodax/api for MCP servers that ask for them
- **api-1:** Merge swaps-api, bridge-api and the SDK's leverage-yield, backend and sponsoring clients into one @sodax/api on a single transport, with per-API subpaths, one raw-tx schema, a CI gate that keeps it viem-free, and the old packages as shims
- **api-2:** Add @sodax/api/react with an ApiProvider and the API-lane hooks, no Sodax instance needed, with react and TanStack Query as optional peers; dapp-kit re-exports the same hooks so names, keys and errors stay one family
- **api-3:** Document API mode per flow and chain: which endpoints build unsigned transactions (swaps, bridge, leverage yield), how each chain signs and broadcasts them, how submit-tx hands off, and the sponsoring and Bitcoin exceptions
- **api-4:** Check the API clients' response schemas against the live OpenAPI specs on a schedule and on API PRs, after the backend serves the bridge spec
- **x-1:** Mark @sodax/types side-effect-free, split it by concern into chains, tokens and config subpaths, and stop inlining it into other packages
- **x-2:** Track install size, bundle size and consumer audit results in CI, failing a pull request only on regressions against its base
- **x-3:** Provide a v2 → v3 migration guide covering every breaking change, and a codemod for the mechanical import and rename changes
- **x-4:** Test the supported entry points on the Node engines floor and current Node, Deno, Bun and Workers (nodejs_compat), and publish the results as a support matrix
- **x-5:** Support a release-2.x maintenance line with its own npm dist-tag, so latest never moves back to 2.x

## Not verified

**This ranking**
- I re-ran no probe. Both worktrees are gone. The "Fix now" re-checks are source reads at `0181a053` only. The sk-3 count, the dist `'use client'` count and the dual-graph result come from the area files.
- The tier inputs are the area tables. Where an area labels its B or C as [judgement], the tier carries the same judgement.

**Bundles**
- esbuild 0.25.12 only. No webpack, Turbopack or Vite runs. No real Next.js build of sodax-frontend or whitelabel.
- Stubbed modules count as zero, and no registry, kit or vendored code is added (sdk-1, sdk-6).
- The 160/162 KB wallet figures mix wallet-sdk-react source with a simulated per-file wallet-sdk-core.

**Installs**
- `@sodax/*@2.2.0` was past the `--before` cutoff, so 2.2.0-rc.8 or third-party-only installs stand in.
- No pnpm install was run, so the pnpm sizes are approximations (sdk-4's real saving could land between 56 and 359 MB).
- Advisory counts are as of 2026-10-19, and they are not on one basis. wallet-sdk-react.md and api.md label npm's vulnerable-package count (`metadata.vulnerabilities.total`) as "advisories". chains.md, deps.md, packaging.md, wallet-sdk-core.md and release-ci.md count distinct advisory IDs. Where this README gives a count, it uses distinct IDs.
- MB are allocated blocks (`du -sk`); apparent sizes are 27–37% smaller (packaging.md:454). The B-scale MB bars were applied to allocated sizes. At apparent size [derived: × 0.63–0.73, assuming packaging's ratio holds for the other areas' installs]:
  - sdk-1's −291 MB would be about 183–212 MB, at the 200 MB line; its bundle gain also clears the B4 bar for those installs;
  - sdk-4's ~−70 MB with pnpm would be about 44–51 MB, at the 50 MB line; its B3 also rests on the 96–99 KB bundle gain.

**Builds and runtime**
- No pnpm build was run. So nothing exists yet for: a per-file wallet-sdk-core, the libs browser build, an `@sodax/api` tarball, `new Sodax({ fetch })`, the `./testing` subpath build, a registry prototype (all PR LOC are judgement), or the react ≥18 floor of `@sodax/api/react`.
- Runtime probes stop at import + construct.
- Runtime probes ran local tsup builds, not the npm 2.2.0 tarball. The exception is packaging.md's dual-graph probe, which loaded the published 2.2.0 `index.mjs` and `index.cjs` in one process.
- Jest-CJS consumers of the 2.x CJS build were not tested after x-1 T10.1 or after sdk-3 (packaging.md, Residual doubts).
- workerd ran under miniflare without an OS network block.
- bridge-api aborts and mutation aborts were not run.

**Fund-moving paths**
- The vendored encoders were not executed on-chain; they are only proven equal to today's calldata.
- SODAX's own Bitcoin code was not run on bitcoinjs 7.
- P2TR with `finalize: false` is not covered.
- The ICON client was not run against a node.
- The Sodax-free receipt wait was checked only on an already-mined EVM tx.
- Not checked:
  - whether the relayer indexes spoke-origin txs that were never submitted (recovery);
  - whether Solana and Bitcoin `relayData` can be rebuilt after a closed tab;
  - whether the browser-only signer variants run (they were only bundled or type-checked).

**Demand and production**
- The number of P4 integrators.
- Whether sodax-frontend will adopt the lifecycle hooks (dk-2's B4 depends on it).
- Production rates of `RELAY_TIMEOUT`.
- Bun, Deno and Workers demand.
- External private-key users.
- External callers that match DEX/cancel `message` strings.
- How often agents open `hooks-index.md`.

**Outside our repos**
- Whether the solver and relay log `x-request-id`.
- When the gateway started serving `/v2/be/config/*`.
- The Mintlify production-branch setting.
- Whether the npm token can create new packages.
- Whether Bitcoin raw-tx is enabled on prod.
- The relay rate limit for browsers.

**Counts that the area files could not reproduce**
- dk-6 "30 of 202" (the token list was not saved).
- sdk-1 "26 doc pages" and "18 feature files".
- sdk-9's frontend "26 files" (an 8-name grep finds 28) and the 16-file constructor lower bound (a heuristic finds 19).
- dk-6's "about 145" docs mentions (141 with a stated scope).
- dk-2's research-d "12 / 9" lookup counts.
- The Privy subtree's 329 MB (its node_modules were deleted before the re-derivation).

**Housekeeping**
- The dangling `node` symlink that the sdk-10 prototype left in this folder was removed on 2026-10-20.

## Not measured at all

These are things a reader would expect, which no area report measured. Each was checked by reading the area methods and with `rg` over the 10 area files; which gaps matter is [judgement].
- **The consumers' real builds and installs.** No Next.js build (webpack or Turbopack) of sodax-frontend or intents-whitelabel, and no pnpm install of their lockfiles. Every size above comes from esbuild and npm.
- **Browser runtime cost.** Only gzip bytes were measured. There is no parse, compile or execute time and no page-load metric. The one time figure is a download estimate derived from bytes (wallet-sdk-react.md:177).
- **The end state.** No run applies all the Core changes to one app. The largest measured combinations are sdk-1 + sdk-4, sdk-1 + wsc-3 + wsr-1, and wsr-1 + wsr-2.
- **Effort against the plan.** No area file reconciles its C levels with `plan-v3-final.md` §8 (453 points; 239 for 3.0.0). Some say the earlier points are off: dk-2's T18.4–T18.7 look closer to 3 points each than 5, and wsr-5's T36.1 is low if Solana is in scope. No updated total exists.
- **Test coverage on the fund-moving paths that 3.0 moves:** per-chain deposit and settle routing, the signers, the Bitcoin PSBT path. The only baseline is that no sdk test builds or signs a real PSBT (deps.md).
- **CI cost of the new gates:** x-2's consumer job, the x-4 legs, the api-4 schedule. Run time is [judgement] (release-ci.md:133: "about 3–5 min", install time not measured). Flake rate was not measured; flakiness appears only as a named risk (api.md:403, release-ci.md:130,342).
- **Persona sizes.** How many users each of P1–P6 has. B4's "for most" depends on it, so B3 versus B4 for sdk-1, sdk-5 and api-1 stays [judgement].

## Consistency check (2026-10-20)

A critic pass over this README against the 10 area files. I edited no area file. A script compared each per-ID Feasibility, Complexity and Benefit heading with its file's summary table, and found only standalone-versus-combined wording, no contradiction. The other problems found either span two files or are a missing method (see "Left for the area owners").

**Checked**
- **IDs.** `awk '/^## Ranking table/{p=1;next} /^## /{p=0} p' README.md | grep -oE '^\| (sdk|dk|wsc|wsr|sk|api|x)-[0-9]+ ' | sort | uniq -c` gives 39 IDs, each once.
  - Each area's summary table is the first `| ID | Feasibility` table, above the file's first `##`. It holds exactly the rubric's IDs for that area.
  - The Verification sections confirm these tables are post-verification.
- **Rows.** Verdict, C (first `C<n>`), B_eff (largest `B<n>`) and area link match for all 39. I compared the timing cells side by side. Extra words in README cells ("first PR", "harness in 2.x", "before the first contract merge") come from the area Recommendations.
- **Tiers.** I recomputed them with an independent `python3 -I` stdin script using the rule above. The result has the same tiers and counts and the same 11 sensitivity moves. The table is sorted by tier, then B_eff descending, then C ascending. `wf-rank-rows.json` differs from the area tables only by backticks (sdk-5, sdk-7, wsc-2).
- **Citations.**
  - Each of the 19 original "Fix now" items traces to an area citation. Its lines hold at `0181a053`, backend `985959e9` and frontend `1b915ec7` (`git show`).
  - Every edge row traces to an area "Dependencies" section.
  - PR and issue states were re-read with `gh`.
- **Calibration.** I scanned for absolutes with `rg -n -i -w "never|cannot|impossible|always|only|must" README.md` and for untagged Summary figures.
- **Decisions.** `grep -E '^\| D[0-9]+ \|' README.md | awk -F'|' '{b=$(NF-1); print gsub(/(sdk|dk|wsc|wsr|sk|api|x)-[0-9]+/,"&",b), $2}' | sort -rn` shows 7 decisions at 4 IDs and none above 4.

**Advisory recount** [verified]: `python3 -I -c 'import json,sys; j=json.load(open(sys.argv[1])); print(j["metadata"]["vulnerabilities"]["total"], len({v["url"] for x in j["vulnerabilities"].values() for v in x["via"] if isinstance(v,dict)}))' <audit.json>`, run on the saved `scratchpad/deep-wsr/inst/*/audit.json` and `scratchpad/deep-api/npm/*/audit.json`.

| Install | Vulnerable packages | Distinct advisories |
| --- | --: | --: |
| wallet-sdk-react 2.2.0-rc.8 + base | 99 | 68 |
| the same with wagmi 3 (wsr-2) | 84 | 67 |
| wallet-sdk-core 2.2.0-rc.8 alone | 31 | 51 |
| P1 with wsr-1 | 51 | 53 |
| P1 with wsr-1 + wsr-2 | 31 | 51 |
| `@sodax/sdk` 2.2.0-rc.8 | 35 | 47 |
| `@sodax/dapp-kit` + React stack | 36 | 47 |

**Changed in this file**
- **Advisory figures.** wsr-2's "−15 advisories" and wallet-sdk-core's "31 advisories" are vulnerable-package counts. They now give both counts. wsr-2's B4 still holds on its −541 MB install.
- **Summary.** Points 2, 3, 4, 6 and 7 are tagged. The "most blocking" decisions are recounted.
- **Fix now.** Items 6, 8, 11, 14 and 19 are tightened or scoped. Three verified defects are added: item 20 (sdk-8 P4), item 21 (`faq.md:26`) and item 22 (the ICON/Injective remount note).
- **Edges.**
  - Four area-cited edges are added: dk-1 → sdk-1, x-1 → sdk-3 and api-1, sdk-1 + sdk-4 → sdk-6, and dk-2 → sdk-8.
  - The wsr-1 → dk-4 row now matches both area files and the wave plan.
  - Three rows are tagged or scoped.
- **Ranking table.** The wsr-1 and wsr-2 benefit cells are corrected. The dk-1 and dk-5 timing cells are restored to the area wording.
- **Corrections.** sdk-7 now states its method, sdk-9's "must be" is replaced by the two options in D8, and wsr-1's ~924 KB is marked EVM-only.
- **Not verified.** The 2.2.0-tarball line is scoped, the inverted apparent-size ratio is fixed, the two advisory bases are stated, and Jest-CJS plus three unreproduced counts are added.
- **New sections.** "Evidence behind B4 and C4+" and "Not measured at all".

**Fixed after this check (2026-10-20).** These were not contradictions inside one file, so the critic left them. They are now fixed in the area files, and each fix is noted in that file's Verification section:
- wallet-sdk-react.md and api.md: vulnerable-package counts were labeled "advisories". They are relabeled, and distinct-advisory counts from the recount above are added. The wallet-sdk-react method line now defines the unit.
- deps.md: the 137 KB under Next is labeled as an esbuild measurement with npm shims.
- wallet-sdk-react.md: the dk-4 edge now says option (b) ships first, matching dapp-kit-flows.md:295-301.
