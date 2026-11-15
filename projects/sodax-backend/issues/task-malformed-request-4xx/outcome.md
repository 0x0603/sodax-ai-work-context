---
type: outcome
repo: sodax-backend
github:
status: Not shipped (stashed)
updated: 2026-11-15
---

# Outcome

- PR: none yet
- Commits: none; work is in stash `f8fd0e0ce40608a6b5ba2a214494ea032697d205`
- Tests (2026-11-15): swaps-api 662 unit / 493 e2e, bridge-api 189 unit / 137 e2e, tsc + biome lint clean

## What Changed (files in the stash)

- shared-dtos: `src/index.ts`, new `src/validation/address-for-chain-key.ts`
- swaps-api src: `swaps/{constants,error-mapper,swaps.controller,swaps.service}.ts`,
  `swaps/dto/submit-tx.dto.ts`, `leverage-yield/{leverage-yield.controller,leverage-yield.service}.ts`
- swaps-api tests: `test/e2e/{swaps,leverage-yield}.controller.e2e-spec.ts`,
  `test/unit/{error-mapper,swaps.service}.spec.ts`
- bridge-api src: `bridge/{bridge.service,error-mapper}.ts`
- bridge-api tests: `test/unit/{error-mapper,bridge-bound-guard}.spec.ts`, new
  `test/unit/bridge-intent-addresses.spec.ts`

## PR body notes (consumer-visible, only for already-bad requests)

- Bad src/dst address on intent paths: 422 → 400. submit-tx without `intent`: 500 → 400.
- `intent/:txHash`, `/fill` with a hash not on the hub: 404 after ~2–4s instead of 502 after 180s;
  a tx pending longer than the re-read window now gets 404 (retry).
- New `@ApiNotFoundResponse` on getIntent/getFilledIntent (swaps, leverage-yield).
- DEPENDENCIES.md asks for an issue per affected consumer repo on contract changes; checked consumers
  need no code change. Whether to file them is the user's call (open).

## Follow-ups

- sodax-sdks issue: encodeAddress failures → VALIDATION_FAILED; receipt timeout option.
- Team decision: Hedera `0.0.x` token-id support.
- Observability: alert on 4xx rate so WARN-level VALIDATION_FAILED floods are still seen.
