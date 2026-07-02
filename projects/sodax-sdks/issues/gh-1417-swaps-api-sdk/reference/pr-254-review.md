---
type: reference
repo: sodax-sdks
github: 1417
pr: 254
tags: [swaps-api, sdk, code-review, direction, pr-254]
updated: 2026-07-02
related_decisions: [0001-swaps-api-throwing-minimal]
---

# PR #254 Review — `@sodax/swaps-api` + `apps/swap-api-example`

Review of OPEN PR `icon-project/sodax-sdks#254`
("feat(swaps-api): add @sodax/swaps-api and apps/swap-api-example",
branch `feat/swaps-api-sdk`, +3387/-0, 39 files) against source issue
`icon-project/sodax-frontend#1417`.

Method: 5-dimension multi-agent review (direction, package core, schemas/contract,
example app, tests/packaging), each finding adversarially verified against the PR
HEAD worktree, plus a deterministic trial-merge typecheck against post-#210 `main`.

## Bottom line

**Direction is sound and (per author) deliberate; engineering is high-quality; the
PR is a WIP that should not merge yet.** The library faithfully meets the literal
#1417 ask — a standalone, throwing `SwapsApi implements ISwapsApiV2` depending only
on `@sodax/types` + valibot, all 21 methods, response-validated, central bigint
boundary. Blocking the merge are completeness gaps (missing publish workflow, stale
README, dead code, 8/21 example coverage), a mechanical rebase (CONFLICTING), a few
low/medium edge-case bugs, and the need for a maintainer sign-off on carrying two
swaps clients alongside #210. No blocker/high correctness bug in the package core.

## Decisive technical check — survives the #210 contract change ✅

The PR branch was cut **before** PR #210 (`ffb3e7e3`, landed 2026-07-01) merged.
#210 evolved the contract `ApproveResponseV2 / CreateIntentResponseV2 /
CancelIntentResponseV2 / QuoteResponseV2` from `tx: unknown` → `tx: RawTxReturnType`
and added `packages/sdk/src/backendApi/rawTxSchemas.ts`. The author anticipated this
and relaxed the tx-bearing drift guards to `Extends`.

Verified by trial-merging current `main` into the PR and building:

```
git merge -X theirs origin/main   # only pnpm-lock.yaml + pnpm-workspace.yaml conflict (catalog)
pnpm --filter @sodax/types build  # ok
pnpm --filter @sodax/swaps-api checkTs   # PASS (0 errors)
pnpm --filter @sodax/swaps-api test      # 69/69 PASS
```

So the package **compiles and its tests pass against the post-#210 contract**; the
`Extends` relaxation holds (and regains full meaning post-merge, since both sides
become `RawTxReturnType`). The only merge conflict is a one-line catalog pick
(`valibot` 1.2.0 on the PR vs 1.4.1 on main) — a routine rebase.

## Status snapshot

| Aspect | State |
| --- | --- |
| CI (Build/Test, CodeQL, E2E, security scans) | ✅ green |
| Mergeable | ❌ CONFLICTING / DIRTY — `pnpm-lock.yaml` + `pnpm-workspace.yaml` (valibot catalog) |
| Human review | ❌ REVIEW_REQUIRED, zero human reviews (only Vercel bot) |
| Survives #210 merge | ✅ checkTs + 69 tests green (trial-merge) |
| Publish workflow | ❌ `sodax-swaps-api-publish.yml` absent; not in `sdks-publish.yml` PACKAGES |
| Example coverage | ⚠️ UI drives 8/21 methods; all 21 covered only in mocked unit tests + ad-hoc canary sweep |

## Direction

The standalone package is a **faithful literal fit** for #1417 ("super minimalistic",
"only depends on the backend swaps api type", "solely request/response logic",
valibot validation). `package.json` declares exactly `@sodax/types` + `valibot`;
`client.ts` is a thin 21-method `implements ISwapsApiV2`.

**Duplication vs #210 — CONFIRMED fact, author-confirmed as intentional.**
`main` already carries #210's `SwapsApiService` (in-SDK, `Result<T>`, 21 methods) +
its own `rawTxSchemas`. This PR adds a second 21-method client + a second
`rawTxSchemas`. Author's position (2026-07-02): the split is **deliberate** —
`@sodax/sdk` keeps the integrated `Result<T>` client for heavy consumers;
`@sodax/swaps-api` is the standalone, zero-SDK, throwing client for lightweight
consumers, which is exactly what #1417 asked for. This is a legitimate two-products
architecture. Residual action, not a blocker:

- Get an explicit maintainer (R0bi7) sign-off that the standalone package is still
  wanted post-#210, recorded on the PR.
- Decide the anti-drift strategy for the two `rawTxSchemas` / two clients (e.g.
  eventually have one back the other, or accept + document dual-maintenance).

Dropped finding: "Closes #1417" cross-repo reference — author confirms this is
intentional (manual/linked close), **not** a defect.

## Findings (severity after adversarial verification)

Legend: `[C]` confirmed, `[P]` plausible/conditional, `[R]` refuted as stated.

### Package core — solid, no high/blocker bug

| Sev | Verdict | Finding | Location |
| --- | --- | --- | --- |
| low | [C] | POST header merge can corrupt a caller-supplied `Content-Type` (case-sensitive object key vs case-insensitive header → `Content-Type: …, application/json`); caller can never override it | `http.ts:76-82` |
| low | — | `estimateGas` passes `body` unserialized; `rejectBigint` throws on the bigint `tx.value` the client's own schemas emit — natural round-trip `getQuote(txData)`→`estimateGas` throws before HTTP | `client.ts:245-254` |
| nit | — | Constructor `globalThis.fetch.bind(...)` throws an opaque `TypeError` when no global fetch and none injected | `client.ts:67` |

All 21 methods map to correct path+verb; path params `encodeURIComponent`-escaped;
idempotency allowlist correct (every mutation non-idempotent; `getStatus` POST-poll
marked idempotent); `serialize.ts` covers all 6 `IntentRequestV2` bigint fields + all
4 intent-carrying request bodies; retry logic correct.

### Schemas & contract fidelity

| Sev | Verdict | Finding | Location |
| --- | --- | --- | --- |
| med | [C] | Bitcoin raw-tx falls to permissive `AnyRawTxSchema` (no `BITCOIN` case) → no decimal→bigint transform, no validation; `tx.value` is a string at runtime while typed `bigint`. (Practical impact bounded: Bitcoin signing isn't wired here yet.) | `rawTxSchemas.ts:97-98,129-130` |
| low | [C] | `BytesFromIndexRecord` (Injective) accepts sparse/gap indices, negatives, floats, >255 → silently corrupted `Uint8Array`; only contiguous happy path tested | `rawTxSchemas.ts:22-25` |
| low | [C] | `BigintFromString = pipe(string, toBigint)` — `BigInt('')===0n`, `BigInt('0x1a')` accepted; empty/hex silently coerced despite decimal-string contract | `rawTxSchemas.ts:16` |
| low | — | `Extends` relaxation makes the 6 tx-bearing drift guards a no-op *on this branch* (tx=unknown); real tx enforcement is the `GenericSchema<unknown,RawTxReturnType>` pin. Regains meaning post-#210 (verified). | `schemas.ts:215-230` |
| low | — | `Address`/`Hex` schemas accept any string (nominal passthrough) → malformed `0x`-less values pass and are branded valid | `rawTxSchemas.ts:12-13` |
| nit | — | `SolanaRawTxSchema`/`StellarRawTxSchema` byte-identical; EVM/Sui differ only by branding — extract a `makePlainRawTxSchema` helper | `rawTxSchemas.ts:38-59` |

The 21 response schemas otherwise match the contract field-for-field; `v.object`
tolerates additive backend fields; `getChainType` uppercase returns match the switch.

### Example app

| Sev | Verdict | Finding | Location |
| --- | --- | --- | --- |
| med | [C] | `lib/signAndBroadcast.ts` (109 lines) is **entirely dead** (never imported) and its chain matrix *contradicts* SwapCard's inline `signTx`. Survived `check:knip` because `apps/*` has no knip config. | `signAndBroadcast.ts:1-109` |
| low | [P] | Non-EVM sign branches (Solana/Sui/Stacks/ICON) are unverified casts AND skip the approval-finality wait (gated `if EVM`) → latent allowance race for a non-EVM approve→createIntent | `SwapCard.tsx:204` |
| low | [P] | `getXChainType(srcChain)` called unguarded in render; an unmapped backend `chainKey` throws `TypeError` → white-screens the card (no error boundary) | `SwapCard.tsx:104` |
| low | — | `EVM_CHAIN_KEYS`/`isEvmChainKey` dead + stale "EVM-only execution" doc contradicting the 5-chain UI; list omits `hyperevm` | `swapsApi.ts:13-26` |
| low | [P→low] | UI drives only 8/21 methods; core swap happy path only. All 21 are covered in mocked unit tests + an ad-hoc canary sweep (uncommitted), not the demo. Interpretation of "proving all flows & methods" (#1417) is the open question. | `SwapCard.tsx:119-229` |
| opinion | — | Scope creep vs "super minimalistic": themed UI, radix combobox, multi-chain modal, 9-family provider wiring — dilutes the example's reference value | `providers.tsx:14-53` |
| low | — | Button label hardcodes "Connect an EVM wallet" though 5 chain types are signable | `SwapCard.tsx:334` |
| low | — | Example has no tests; `"test": "true"` no-op stub | `package.json:13` |

Structural criterion met: example depends only on `@sodax/swaps-api` +
`@sodax/wallet-sdk-react` (connect+sign), zero `@sodax/sdk`/dapp-kit. Slippage→
minOutputAmount basis-point math and EVM approval-receipt wait are correct.

### Tests & packaging

| Sev | Verdict | Finding | Location |
| --- | --- | --- | --- |
| high | [C] | **No release path** — `sodax-swaps-api-publish.yml` absent and package not in `sdks-publish.yml` PACKAGES, yet `private:false`/public/`0.0.1-rc.0`. (Self-admitted TODO.) | `.github/workflows/` |
| med | [C] | README says the runtime "is not shipped yet / not available yet" while `index.ts` exports the full `SwapsApi` + `SwapsApiError` + `SwapsApiConfig`; README ships in the tarball → published docs contradict shipped code | `README.md:11-37` |
| med | — | Retry-safety guarantee (mutations never retried) asserted only on the http primitive, never on the 21 real client methods — a regression adding `idempotent:true` to `createIntent` would pass all tests | `client.test.ts:150-159` |
| med | — | Runtime schema fixtures cover ~6/18 responses; the 3 most complex (SubmitTxStatus, IntentPacket, SubmitTx) untested at runtime | `schemas.test.ts:53-137` |
| low | — | rawTxSchemas tests only EVM + Injective; Solana/Sui/Stellar/Near/Icon/Stacks + key routing untested | `rawTxSchemas.test.ts:46-58` |
| low | — | `vitest.config.ts` left in scaffold state: `passWithNoTests:true`, `// @ts-nocheck`, stale comment (6 test files now exist) | `vitest.config.ts:1-11` |
| low | — | Per-endpoint body serialization asserted for only 1/4 intent-carrying POSTs (getIntentHash); cancelIntent/submitTx/extra-data unasserted | `client.test.ts:170-178` |
| nit | — | README `pnpm add … valibot` but valibot is a regular dependency | `README.md:24-26` |
| nit | — | Coverage script + dep present, no thresholds, never run in CI | `package.json:47` |
| nit | — | `packages/swaps-api/AGENTS.md` missing (self-admitted TODO) | — |

Tests that exist are strong: `client.test.ts` is genuinely table-driven over all 21
endpoints; `http.test.ts` covers retry/error/query/URL/stray-bigint; `serialize.test.ts`
fully covers the bigint contract; `SchemaDriftGuards` is a real compile-time strength.
Packaging (dual ESM/CJS via tsup, exports map, attw, engines, publishConfig) is correct.

## Action list before merge

Blocking:
1. Rebase on `main`; regenerate `pnpm-lock.yaml`; hand-merge the `valibot` catalog pick.
2. Add `.github/workflows/sodax-swaps-api-publish.yml` (mirror `sodax-types-publish.yml`),
   or set `private:true` until the release path exists.
3. Rewrite `README.md` to document the real shipped `SwapsApi` runtime (drop
   "not shipped yet" / "not available yet").
4. Maintainer (R0bi7) sign-off on the standalone-vs-#210 direction + the anti-drift plan.

Should-fix:
5. Delete dead `lib/signAndBroadcast.ts` and `EVM_CHAIN_KEYS`/`isEvmChainKey`
   (or wire them in as the single source of truth); add a knip config covering `apps/*`.
6. Add a `case 'BITCOIN'` raw-tx schema (or restrict `AnyRawTxSchema` to truly-unmapped keys).
7. Either extend the example to demonstrate the remaining 13 methods / add the planned
   run-all-flows script, or scope the README to "happy-path swap only" and drop any
   "all methods" claim so deliverable and demo agree.
8. Fix the `Content-Type` header merge (case-insensitive; only default when unset).
9. Test the retry-safety property at the client-method layer (mutations = 1 fetch on 503).

Nice-to-have:
10. Harden `BytesFromIndexRecord` (integer 0-255 + contiguity) and `BigintFromString`
    (decimal regex before `toBigint`); add non-EVM rawTx + complex-response fixtures.
11. Add `packages/swaps-api/AGENTS.md`; clean `vitest.config.ts` scaffold flags.
12. Guard `getXChainType` in render / filter `chainOptions` to known keys.
