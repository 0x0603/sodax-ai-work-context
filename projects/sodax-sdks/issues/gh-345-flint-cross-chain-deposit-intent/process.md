---
type: process
repo: sodax-sdks
github: 345
updated: 2026-08-13
---

# Process

## Log

- **2026-08-11** — Review of PR #364 against root issue #345 and a reviewer message. Method: one
  orchestrated audit (5 parallel investigations → adversarial verification of every blocker/major claim →
  synthesis), then hand re-verification of the load-bearing facts. 9 of 23 verified claims were refuted or
  downgraded — those are recorded under Refuted below so they are not re-derived.
- **2026-08-12** — Follow-up scoping session (chat walkthrough, not an orchestrated audit): traced the
  actual `sodax-backend` code behind `/swaps/intents` end to end to size ask (c)'s backend follow-up
  (`outcome.md` follow-up #11) precisely. Sharpens two 2026-08-11 claims — see "Correction" below. No code
  touched in either repo, read-only session.

### Checkout caveat

The `sodax-sdks` working tree was on `feat/sui-grpc-transport`, **not** on the PR branch, and that branch
does not contain `origin/main`. PR content was therefore read via the fetched ref:

```bash
git fetch origin pull/364/head:pr-364-review
git show pr-364-review:packages/types/src/hooks/hooks.ts
git diff c5a2b007e..pr-364-review          # c5a2b007e is the PR base
```

Only `packages/types/src/hooks/hooks.ts` differs between the working tree and the PR for hook-related
files; `apps/node/src/flint-deposit.ts` exists *only* on the PR branch. Everything else read from the
working tree is equivalent to the PR base.

## Findings

### What PR #364 actually is

Four files, 191+/22−. The production change is **one registry entry**:

```
packages/types/src/hooks/hooks.ts:53-61
  [ChainKeys.ETHEREUM_MAINNET]: [{ kind: FLINT_DEPOSIT,
                                   address: '0xDf376dE34e9f1474A025Dfe411b7EB5541793C5d',
                                   supportedTokens: [Ethereum USDC] }]
```

replacing a commented-out placeholder. Effect: `getSpokeHook(ETHEREUM, FLINT_DEPOSIT)` resolves instead of
returning `undefined`, so `HookService.resolveDeliveryHook` (`HookService.ts:89-90`) stops throwing. The
other three files are a flipped unit test (`HookService.test.ts:71-83`, negative → positive), a changeset,
and a 161-line example `apps/node/src/flint-deposit.ts`.

**No service code is touched.** `HookService.ts`, `SwapService.ts`, `EvmSolverService.ts` are all base
branch. The codec, ABI, `HookRequest` member and zero-recipient guard landed in #347. #364 is the switch,
not the mechanism.

### How a hook reaches the chain

```
CreateIntentParams.hook            intent-types.ts:37
  → HookService.resolveDelivery    HookService.ts:103-107   (overrides dstAddress, derives deliveryData)
  → EvmSolverService.constructCreateIntentData:110
  → IntentDataService.composeIntentData(feeEnvelope, deliveryData)   :113
  → intent.dstAddress = hook address, intent.data = DELIVERY envelope (or ARRAY[FEE, DELIVERY])   :129,131
```

Called from exactly two places: `EvmSolverService.ts:110` and `SonicSpokeService.ts:304`.

### #345 requirement coverage

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Flint service/module with a deposit builder | **not delivered** | No `packages/sdk/src/flint/`; `Sodax.ts:29-44` service roster has no `flint`. The only builder is the hand-rolled block at `flint-deposit.ts:113-129`. The generic path works, so what is missing is the named module + Flint-specific validation. |
| 2 | Route any spoke asset → USDC on Ethereum | **delivered (generic)** | Hook applied inside the generic constructor `EvmSolverService.ts:110`. USDC pinning is data-only (`hooks.ts:59`) and unenforced — see #6. |
| 3 | dst = hook address, `data = abi.encode(recipient)` | **delivered** | `HookService.ts:13-17` (ABI), `:59-69` (encode + zero-addr guard), `:92` (dstAddress override). Asserted `HookService.test.ts:28-32,71-83`. |
| 4 | Address book: hook + vault + flUSD | **partial (1 of 3)** | Hook at `hooks.ts:53-61`. `git grep 0x7f35dEa44a192764aa50d50e5f0eCE1d5a8b0e45 pr-364-review` → **zero hits**; no flUSD entry. Blocked on config shape, not effort: `tokens.ts:23-32` requires `hubAsset` + `vault` on an `XToken`, and there is no slot for a third-party vault (`chains.ts:473-480`, `hooks.ts:29-39`). |
| 5 | **Pre-flight quote against live vault state** | **not delivered — 0%** | Repo-wide grep for `paused(`/`isAllowed`/`maxCap`/`totalAssets`/`pendingDepositRequest`/`minDeposit` returns no Flint hits. `HookService.ts` contains zero `async`/`await`/`readContract` — structurally incapable of an on-chain read. Only substitute: the hardcoded `HOOK_MIN_DEPOSIT = 1_000_000n` at `flint-deposit.ts:37`, checked at `:106`. The script's `assertEthSpokeSupportsHooks()` (`:60-75`) checks the *spoke implementation*, not the vault. |
| 6 | Type-safe params + validation | **partial** | Present: zero-recipient invariant `HookService.ts:60-63` (tested `:36-40`); supported *source* asset validated generically (`SwapService.ts:930-934` → `ConfigService.ts:190-192`). Absent: no output-token check — `resolveDeliveryHook` never calls `isHookSupportedToken` (`hooks.ts:76-82`, whose only caller repo-wide is `apps/demo/.../SwapCard.tsx:136`, HyperCore-only); no minDeposit floor anywhere under `packages/`. |
| AC | Intent built against actually-delivered USDC | **satisfied structurally** | `minOutputAmount` is an enforced protocol floor carried verbatim into the intent (`EvmSolverService.ts:123`); `allowPartialFill: false` (`flint-deposit.ts:119`); the vault is credited what `SpokeAssetManager` actually delivers. |
| AC | Routing failure recoverable, no orphaned `requestDeposit` | **inherited, unproven** | `requestDeposit` is only reachable inside the hook, which only runs at delivery — a failed routing leg cannot orphan one. Recovery is the generic `RecoveryService.ts:55-64`. Nothing Flint-specific asserts it. |
| AC | Unit tests **+ mainnet-fork integration test** | **partial** | Units exist. No fork harness anywhere (`anvil`/`foundry`/`hardhat`/`createTestClient` → zero hits). Aggravating: a live-mainnet tier that *already blocks CI* exists and was not used — `packages/sdk/vitest.e2e.config.ts`, job `e2e` at `.github/workflows/ci.yml:136`, `pnpm test:e2e` at `:169`, whose stated purpose (`e2e-tests/e2e.test.ts:9-14`) is "assert static config in `@sodax/types` is in sync with on-chain state". |

### Reviewer ask (a) — "fully compatible"

**Works on the default path.** `flint-deposit.ts:51` does a bare `new Sodax()`, so `useBackendSubmitTx`
defaults to `true` (`ConfigService.ts:473`). But the intent is built client-side first
(`SwapService.ts:454` → `:473`), so the hook is already in `dstAddress`/`data` before the API sees it. The
submit body is `{ txHash, srcChainKey, walletAddress, intent, relayData }` (`SwapService.ts:620-632`), and
the backend accepts it unchanged — `IntentDto.dstAddress` and `.data` are bare `@IsHex()` with no length
cap and no EOA check (`sodax-backend/apps/swaps-api/src/api/swaps/dto/intent.dto.ts:107-122`). Nothing is
stripped by `serialize.ts:30-45` or the valibot schemas (`schemas.ts:45-60`). Partner-fee accounting
survives a DELIVERY sibling: `sodax-backend/packages/shared-utils/src/utils/common-utils.ts:460-479`
recurses the ARRAY envelope and still finds the FEE entry.

**Does not work on the API's own intent-building endpoints** — `POST /swaps/intents`, `/swaps/approve`,
`/swaps/allowance/check`, `/swaps/quote?includeTxData=true`, `/swaps/limit-orders`:

- `CreateIntentParamsV2` has no `hook` and no `deliveryData` (`packages/types/src/backend/backendApiV2.ts:299-323`);
  the backend DTO mirrors it (`create-intent.dto.ts:20-114`); the mapper forwards neither
  (`swaps.service.ts:491-504`); `includeTxData` hardcodes `data: '0x'` (`swaps.service.ts:143`).
- `grep -riI 'hookKind|deliveryData|spokeHooks'` over the whole `sodax-backend` repo → **zero hits**.
- **No workaround via `data`.** `CreateIntentParams.data` is a *required* field (`intent-types.ts:30`)
  that is never read: both constructors overwrite it (`EvmSolverService.ts:131`, `SonicSpokeService.ts:324`).
  The backend advertises and `@IsHex`-validates it (`create-intent.dto.ts:107-114`) and silently discards
  it. `git log -S 'createIntentParams.data'` returns no commits, ever — it has always been dead.
- Version skew, for later: the backend pins `@sodax/sdk 2.1.0-rc.3` (`apps/swaps-api/package.json:48`,
  catalog `pnpm-workspace.yaml:67-68`), where the Ethereum entry is still commented out. Any API-side hook
  support needs an SDK release + catalog bump. **Does not block merging #364.**

Cosmetic, backend side: the SDK stamps `IntentDataType.DELIVERY = 3` (`intent-types.ts:100-105`); the two
hand-synced backend decoders only know `ARRAY=0/FEE=1/HOOK=2`
(`shared-utils/src/utils/common-utils.ts:6-10`; `apps/sodax-backend-dashboard/lib/server/decode-intent-data.ts:14-18`),
so a hooked intent renders as `Unknown (type 3)` + raw hex in the dashboard. Designed fallback, tested
(`common-utils.unit.test.ts:247-256`), no functional loss.

### Reviewer ask (b) — "test this against API"

- Zero tests exercise a hooked intent against any API, mocked or live:
  `git grep -i hook pr-364-review -- packages/swaps-api packages/sdk/src/backendApi packages/sdk/src/e2e-tests`
  → no hits.
- The PR's only test change is offline and self-referential: `HookService.test.ts:83` compares
  `deliveryData` to `HookService.encodeDeliveryData(...)` — the function under test.
- **`resolveDelivery` is never tested with `FLINT_DEPOSIT`.** Both cases in the describe
  (`HookService.test.ts:87-110`) are HyperEVM/HyperCore. That is the function `EvmSolverService.ts:110`
  actually calls.
- The backend-submit describe (`SwapService.test.ts:2744-2748`, "default ON") uses hookless fixtures
  (`:156-169`); the main suite explicitly opts out at `:127` with `useBackendSubmitTx: false`.
- **The mainnet smoke run in the PR comment cannot prove API compatibility.** `SwapService.ts:473-483`
  falls back to the client-side relay on *any* backend non-success and returns an indistinguishable
  `SwapResponse`. Green is equally consistent with the backend having rejected the hooked intent.
- The example is outside every CI gate: `apps/node/package.json:44` `"test": "true"`; root `package.json`
  runs `turbo run test --filter=!./apps/node` (same for `lint`, `checkTs`, `pretty`, `build`).

### Reviewer ask (c) — "API docs"

- Zero delivery-hook content in **any** `.md`/`.mdx` in either repo:
  `git grep -l -iE 'deliveryData|HookKind|HyperCore|FLINT' pr-364-review -- '*.md' '*.mdx'` returns only
  the two changesets. Every other "hook" hit is a React hook or a Uniswap-v4 pool hook
  (`packages/sdk/docs/DEX.md:422,448,630`).
- The canonical reference actively omits the fields: `packages/sdk/docs/SWAPS.md:368-387` lists 12
  `CreateIntentParams` fields and stops, while `intent-types.ts:37,45` define `hook?` (JSDoc: "the
  preferred way to use hooks") and `deliveryData?` ("escape hatch").
- The two most on-target docs are silent: `packages/sdk/docs/SWAPS_API.md:121-125` and
  `CONFIGURE_SDK.md:149` (the `useBackendSubmitTx` doc). Backend too:
  `sodax-backend/docs/SWAPS_V2_INTEGRATION.md:57-85` hardcodes `data: '0x'`.
- The agent-facing bundle is stale despite an explicit mandate: `packages/skills/.../features/swap.md:77-94`
  and `.../reference/public-api.md` omit hooks; `AGENTS.md:109` requires keeping them in step
  (`pnpm check:ai`).
- **HyperCore set this precedent** — PR #214 (`014cf2300`) shipped 15 files, all source, no doc, no
  changeset. So this is a two-hook-old gap, not a #364 regression.

### Defects that are genuinely #364's

1. The changeset promises a guarantee the code does not enforce — `.changeset/flint-hook-registry-entry.md`
   says "USDC only, matching the hook's on-chain behaviour", but `resolveDeliveryHook` (`HookService.ts:84-92`)
   never consults `supportedTokens`, and `HookService.test.ts:87-99` asserts the non-enforcing behaviour
   with `outputToken: '0x2222…'`.
2. Two contradictory changesets ship in the same release — `.changeset/flint-deposit-hook.md` (still
   unreleased, from #347) says "**The hook is not usable yet.**" while the new one says "activating
   `HookKind.FLINT_DEPOSIT` end to end".
3. Stale comment + dead gate in the example — `flint-deposit.ts:55-74` says "Wait for the SpokeAssetManager
   upgrade before running this", but the upgrade is live (see Refuted #1). Also a bytecode-substring
   heuristic that can false-negative on a future refactor.
4. `HOOK_MIN_DEPOSIT` is a hardcoded copy of an on-chain value (`flint-deposit.ts:37`) with no test pinning
   it — rots silently if the owner changes `minDeposit`.
5. The example hardcodes the asset manager at `:33` although it is available as
   `spokeChainConfig[ETHEREUM_MAINNET].addresses.assetManager` (`chains.ts:965`).
6. The example is undiscoverable — no `flint-deposit` script in `apps/node/package.json`, no mention in
   `apps/node/README.md:39-51` (which *is* mirrored to docs.sodax.com).

## Refuted

Claims that surfaced during the audit and did **not** survive verification. Do not re-derive these.

1. ❌ **"The PR activates a path that strands USDC in the hook contract."** Refuted by direct on-chain
   read (2026-08-11, publicnode): ERC-1967 impl slot of the Ethereum SpokeAssetManager
   `0x39E77f86C1B1f3fbAb362A82b49D2E86C09659B4` → `0x8a5276fc345bba81c8063911e307e069879cb17e`, whose
   runtime bytecode contains the `Hooked(address,address,uint256,uint256)` topic in a LOG sequence; the
   registered hook `0xDf376dE3…` has 4013 bytes of code. The script's hard gate **passes today**. No funds
   risk — what remains is a stale comment.
2. ❌ **"The minDeposit gate is evaluated against a projected quote."** `flint-deposit.ts:106` gates on
   `minOutputAmount` (`:101`), the enforced intent floor, not `quotedAmount` (`:100`).
3. ❌ **"The recipient is invisible to every API-side view."** `intent.data` is transmitted
   (`backendApiV2.ts:156-157`) and returned (`:195-196`), and the backend preserves it as
   `UnknownIntentData` (`common-utils.ts:86-90`). Real residue: no SDK helper decodes a DELIVERY entry back
   to an address — a DX nit.
4. ❌ **"Landing #364 requires a backend dependency bump."** The backend consumes a published pinned
   artifact; the bump is needed for API-side hook support, not for this merge.
5. ❌ **"`data` is the escape hatch and it's dead, so hand-rolling a hooked intent is blocked."** Half-right:
   `data` is genuinely discarded, but it could never have been a hook channel — `Intent.data` is a typed
   envelope built by `IntentDataService.composeIntentData` (`IntentDataService.ts:47-77`), not free-form
   calldata.
6. ❌ **"The quote endpoint is hook-blind and that is a compatibility problem."** Correct-by-design: the
   quoted USDC is right whether or not the hook lands (`SolverApiService.ts:94-99` sends only
   `{token_src, token_dst, amount, quote_type}`). It only matters because requirement 5's pre-flight does
   not exist anywhere else either.

### `/swaps/intents` hook-forwarding gap, precisely located (2026-08-12)

Deeper than the 2026-08-11 audit went — traced the actual call path in `sodax-backend` end to end instead
of grepping for absence.

- `swaps.service.ts:204-213` `createIntent(dto)` calls **the real `this.sodax.swaps.createIntent(action)`
  SDK function**, server-side — not a reimplementation. `HookService.resolveDelivery` is therefore fully
  live on this path; the backend is not "structurally incapable" of a hooked intent, contrary to how the
  2026-08-11 phrasing on ask (a) reads.
- The actual gap is one private mapper: `buildRawIntentAction` (`swaps.service.ts:488-510`), shared by all
  4 raw-tx endpoints (`isAllowanceValid` :178, `approve` :187, `createIntent` :206, limit-order :395) —
  builds `params` field-by-field from `CreateIntentParamsDto` and never reads a `hook` field, because
  `CreateIntentParamsDto` (`dto/create-intent.dto.ts:20-115`) never declares one.
- Fix is two small, precise edits, both in `sodax-backend`:
  1. `dto/create-intent.dto.ts` — add a `HookRequestDto` (`{ kind: HookKind }`, `@IsEnum(HookKind)`) and an
     optional `hook?: HookRequestDto` field on `CreateIntentParamsDto`, after `data` (`:114`).
  2. `swaps.service.ts:503` — add `...(dto.hook ? { hook: dto.hook } : {})` inside `buildRawIntentAction`'s
     `params` object.
  Optional third, different repo, contract-doc parity only (not required for the fix to work):
  `sodax-sdks/packages/types/src/backend/backendApiV2.ts:329-330` — add `hook?` to `CreateIntentParamsV2`.
- **Independent of the SDK-pin/registry gap.** Wiring the DTO/mapper makes `hook` reach
  `HookService.resolveDelivery` — but that still throws for `FLINT_DEPOSIT` until the backend's *pinned*
  `@sodax/sdk`/`@sodax/types` version actually contains the Ethereum registry entry (i.e. bumped past
  #364). Two separate prerequisites, both needed for Flint specifically; `HYPERCORE_DEPOSIT` may already
  work once the DTO/mapper fix lands, since that hook is registered wherever the backend is currently
  pinned.

### Correction to 2026-08-11 characterization

- "The API's own intent-building endpoints... genuinely cannot express one" (`outcome.md`, ask (a)) is
  right about today's behavior but overstates the ceiling — it reads as an architectural limit. It is a
  2-field mapping gap, not a structural one; see above.
- "`includeTxData` hardcodes `data: '0x'`" is about a **different** code path (`swaps.service.ts:143`, the
  quote endpoint). `buildRawIntentAction` (the one `createIntent`/`approve` actually use) *does* forward
  `dto.data` (`:502`) — moot in practice, because the SDK's own `IntentDataService.composeIntentData`
  overwrites `intent.data` downstream regardless of what's passed in.
- Confirmed (newly verified, not a correction): `/swaps/intents` returns **unsigned raw tx** only (`tx`,
  `intent`, `relayData` — `CreateIntentResponseDto`, `dto/create-intent.dto.ts:143-159`; the comment at
  `swaps.service.ts:174` labels this tier "Phase 1: write endpoints (raw-tx)"). It never signs or
  broadcasts on any of these endpoints.

### 2026-08-13 — Backend follow-up #11 implemented (sodax-backend#1081)

Verified the 2026-08-12 correction by hand (`sodax.swaps.createIntent` at `swaps.service.ts:207` is the
real SDK call, `this.sodax: Sodax` injected from `new Sodax(overrides)` in `sodax.provider.ts` — not a
mock; `buildRawIntentAction` at `:488-510` confirmed to never read `dto.hook`), then implemented the fix:

- `dto/create-intent.dto.ts` — `HookRequestDto` (`{ kind: HookKind }`, `@IsEnum`) + optional
  `hook?: HookRequestDto` on `CreateIntentParamsDto`, mirroring the existing nested-DTO pattern in
  `intent-extra-data.dto.ts`.
- `swaps.service.ts:504` — `...(dto.hook ? { hook: dto.hook } : {})` in `buildRawIntentAction`.
- `HookKind` confirmed as a real runtime export from `@sodax/sdk` (not type-only) by grepping the
  installed `index.mjs`.
- Installed pinned SDK (`@sodax+sdk@2.1.0-rc.3`) inspected directly: `hooks.js` still has
  `HookKind.FLINT_DEPOSIT` commented out — confirms the caveat that this fix alone does not unblock Flint.

Branch `feat/forward-hook-param-to-swaps-createintent` off `development` (not off the stale
`fix/sui-zklogin-signature-verification` checkout — caught and corrected via stash before committing).
Verification: `tsc --noEmit` 0 errors, `biome lint` clean, `vitest run swaps.service.spec.ts
intent-dto.transform.spec.ts` 92/92 green, full pre-commit gate (`checkTs`+`test`+`lint-staged`, 20
packages) green after `pnpm install --frozen-lockfile` (stale-install blocker from
[[backend-precommit-gate]] applied here too).

Opened icon-project/sodax-backend#1080 (tracking issue, links back to this root issue + #364) and
icon-project/sodax-backend#1081 (PR, `Closes #1080`, base `development`). Not yet merged.

### 2026-08-13 — Items 1-5 pushed directly to PR #364's branch

User directed pushing the pre-merge follow-ups straight onto AntonAndell's `feat/flint-hook-registry-entry`
branch (same repo, not a fork) rather than a suggestion-comment or stacked PR — confirmed via
`AskUserQuestion` before acting, since this touches someone else's open PR.

Checked out `origin/feat/flint-hook-registry-entry` locally, `pnpm i && pnpm build:packages`
(per [[sdks-precommit-needs-fresh-install-and-build]]), then:

- `.changeset/flint-hook-registry-entry.md` — reworded the "USDC only, matching the hook's on-chain
  behaviour" line: confirmed by reading `HookService.ts:84-93` that `resolveDeliveryHook` never calls
  `isHookSupportedToken`/consults `supportedTokens`, so the original wording overstated enforcement.
- `.changeset/flint-deposit-hook.md` — dropped "the hook is not usable yet" (confirmed still an unreleased
  pending changeset via `git log -- .changeset/flint-deposit-hook.md`, so it ships in the same release as
  #364's registry entry — the two would otherwise contradict in one changelog).
- `packages/sdk/src/swap/HookService.test.ts` — added a `FLINT_DEPOSIT` case to the `resolveDelivery`
  describe (production's actual call path), distinct from the existing `resolveDeliveryHook` Flint case.
- `apps/node/src/flint-deposit.ts` — `ETH_SPOKE_ASSET_MANAGER` now reads
  `spokeChainConfig[ETHEREUM_MAINNET].addresses.assetManager` (confirmed identical value to the old
  literal); added `fetchFlintHookMinDeposit()` (on-chain `readContract` against a minimal inline
  `minDeposit()` ABI — no existing ABI for this found anywhere in the repo) replacing the hardcoded
  `1_000_000n`; reworded the hook-support gate's JSDoc + thrown error since the SpokeAssetManager upgrade
  is confirmed live (the gate's on-chain check itself was already correct — only the "wait for the
  upgrade" wording was stale).
- `apps/node/package.json` + `README.md` — added a `flint-deposit` script (`tsx src/flint-deposit.ts`,
  matching the `stellar-sponsor`/`leverage-yield` convention for standalone flows) and a usage blurb.

Verification: `packages/sdk` `tsc --noEmit` clean; `apps/node` `tsc --noEmit` has pre-existing errors in
`stacks.ts`/`stellar.ts`/`sui.ts` (stale against current SDK exports — `git diff` confirms zero overlap
with this change, and `grep flint-deposit` on the tsc output returns nothing); `HookService.test.ts`
11/11 (was 10). Full repo pre-commit gate (`pnpm checkTs && pnpm build && pnpm test`, no `&&` in the
`.husky/pre-commit` file so only the LAST command's exit code actually gates the commit — same shape as
[[backend-precommit-gate]]) went green: 18/18 turbo tasks, `@sodax/sdk` 2080/2080 tests. Committed as
`a04d8afe6`, pushed to `origin feat/flint-hook-registry-entry` (fast-forward), and posted a courtesy
summary comment on the PR (`#issuecomment-5276095545`) since this is not the user's own PR.

### 2026-08-13 — `claude[bot]` review on #364 triaged (commit `4c5c7e63e`)

Read the bot review at `#issuecomment-5265431912` (posted 2026-08-12, i.e. **before** `a04d8afe6`), so
two of its three findings were already closed by that commit. Triage:

| Finding | Status |
| --- | --- |
| 🟢 nit: no `flint-deposit` script in `apps/node/package.json` | already fixed in `a04d8afe6` |
| 🟢 nit: 2 lines exceed Biome's 120-col width | half — the `minDeposit` line was rewritten in `a04d8afe6`; the `TX_SUBMIT_FAILED` line fixed here |
| 🟡 should-fix: `packages/skills` omits `hook` from `CreateIntentParams` | **was still open** — fixed here |

The skills gap is a real repo rule, not bot noise: root `AGENTS.md` mandates keeping `packages/skills` in
step when public behaviour changes, gated by `pnpm check:ai` in CI. Confirmed the gap by grepping
`HookKind|deliveryData|hook?` across `packages/skills` → zero hits, and that the documented
`CreateIntentParams<K>` block ends at `data`.

Added to `features/swap.md`: the two fields on the type block, plus a `### Delivery hooks` section
covering the registered kinds, the **`dstAddress`-is-the-recipient inversion** (the SDK overwrites the
on-chain `dstAddress` with the hook address), fail-closed on an unregistered kind, the zero-recipient
rejection, and the best-effort on-chain fallback. Deliberately described `supportedTokens` as
*metadata, not enforced client-side* so the docs don't repeat the overclaim the changeset had.

`pnpm check:ai` green (its `check:ai-imports` typechecks the `HookKind` import in the new snippet — 52
sdk import statements across 59 files). Note the pre-commit `pnpm test` was a turbo **cache hit**
(`FULL TURBO`, 18/18 cached) — legitimate here, since this diff touches only markdown plus a
comment/format change in `apps/node` (whose `test` is `true` anyway), so no `packages/sdk` test input
moved. Real coverage for this commit is `check:ai`, which CI also runs ("validate AI consumer docs").

Left alone deliberately, and said so in the PR comment: the bot's non-scored observation that
`isHookSupportedToken`/`getSpokeHooks` have zero call sites. Same conclusion as the 2026-08-11 audit —
enforcing it is a behaviour change whose existing fixture asserts the opposite, so it needs the author's
call (follow-up #9), not a drive-by.

### 2026-08-13 — Full skills sweep + kind-neutral rewrite (`d690a11f5`)

User feedback on the first docs pass: *don't force Flint* — the example used `FLINT_DEPOSIT` as the
worked case, which reads as "hooks = Flint" when more kinds are coming. Also asked for a thorough
sweep so nothing is left missing. Both are load-bearing, and the first also matches a root
`AGENTS.md` rule ("prefer broad durable patterns over volatile enumerations… point agents to source
files rather than copying values") — so the hand-copied per-kind descriptions came out too.

Rewrote `features/swap.md`'s hook section around the **mechanism**: discover via `HookKind` +
`getSpokeHook(dstChainKey, kind)` instead of hardcoding a kind per chain. Net −27 lines.

Sweep result — where `CreateIntentParams` is documented across `packages/skills`:

| File | Verdict |
| --- | --- |
| `sodax-sdk/…/features/swap.md` | fixed (type block + kind-neutral Delivery hooks section) |
| `sodax-sdk/…/features/swaps-api.md` | **fixed — the real remaining gap** (see below) |
| `sodax-sdk/…/reference/public-api.md` | fixed (added `HookKind`/`HookRequest`/`getSpokeHook` to the export list; the list is curated, not exhaustive — `spokeChainConfig` isn't in it either) |
| `sodax-sdk/swap/SKILL.md`, `swaps-api/SKILL.md` | clean — routers that link into the knowledge files, no param enumeration |
| `sodax-sdk/…/ai-rules.md` | clean — no `dstAddress`/hook guidance to contradict |
| `sodax-dapp-kit/…/recipes/swap.md:258` | **pre-existing bug, deliberately NOT fixed** (see below) |

**The swaps-api gap was self-inflicted and worth the sweep.** `CreateIntentParamsV2`
(`packages/types/src/backend/backendApiV2.ts:299-323`) has **no `hook` field**, so
`checkAllowance`/`approve`/`createIntent` on the API client cannot express one — and the swap.md edit
had just documented `hook` next to a file describing those methods, so an agent could reasonably
assume it works there. Now stated explicitly, pointing at `sodax.swaps` instead. Re-verified the
underlying claim on current source before writing: `SwapService.swap()` calls `createIntent` at
`:445` and only branches on `useBackendSubmitTx` at `:464`, so the hook is resolved client-side before
the backend sees anything.

**Not fixed, flagged in the PR thread instead** (per [[no-extra-tracker-issues]]):
`sodax-dapp-kit/integration/knowledge/recipes/swap.md:258` documents `CreateIntentParams` with **v1
field names** (`srcChain`/`dstChain: SpokeChainId`) while current source is
`srcChainKey`/`dstChainKey: SpokeChainKey`. Predates this PR, different package's skill, unrelated to
hooks — adding hook docs to an already-wrong block would be worse than leaving it.

`pnpm check:ai` green. Note its `check:ai-imports` genuinely typechecks markdown import statements
(52 sdk statements across 59 files), so it is real verification that `HookKind`/`HookRequest`/
`getSpokeHook` are reachable from `@sodax/sdk` — worth more than grepping the bundled `dist/index.d.ts`,
where an internal type can appear without being exported.

## Changes During Work

- 2026-08-11/12: review-and-scoping only, no code touched.
- 2026-08-13: `sodax-backend` — 2 files, +38/-2, PR #1081 open (see above).
- 2026-08-13: `sodax-sdks` — pushed directly to PR #364: `a04d8afe6` (6 files, +71/-18),
  `4c5c7e63e` (2 files, +49/-4, clearing the bot review), `d690a11f5` (3 files, +31/-27, skills sweep).
