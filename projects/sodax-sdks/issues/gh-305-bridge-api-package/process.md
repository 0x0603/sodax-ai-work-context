---
id: gh-305-bridge-api-package
type: process
repo: sodax-sdks
github: 305
status: Active
created: 2026-07-23
updated: 2026-07-23
tags: [bridge, bridge-api, standalone-package]
---

# Process log

## 2026-07-23 — full implementation on feat/bridge-api-package

- Branch created off origin/feat/bridge-api-v2 tip `c441b87d` (pulled 3 behind
  commits first; verified they touch none of the affected paths).
- Discoveries during implementation:
  - `swaps-api/src/schemas.test.ts` also imported `EvmRawTxSchema` from the local
    rawTxSchemas (missed by initial "only rawTxSchemaForChainKey needed" analysis) →
    `@sodax/raw-tx-schemas` index exports `EvmRawTxSchema` too; both consumers'
    schemas.test.ts pin factories to the EVM variant through the package.
  - sdk knip lists `@sodax/swaps-api` in `ignoreDependencies` even though it's a real
    prod import — mirrored for `@sodax/bridge-api`.
  - swaps-api `http.ts` has a committed "Decision F" comment (private-context ref that
    slipped through gh-1417); the bridge-api copy drops the prefix. Left the swaps-api
    original untouched (out of scope).
  - Forgot `pnpm i` after adding `@sodax/bridge-api` to sdk deps → dts build
    "Cannot find module" — install fixed it.
  - `RELEASE_INSTRUCTIONS.md` was stale ("all 5 packages", missing swaps-api/skills
    rows) — fixed counts + added swaps-api/bridge-api/skills rows while adding
    bridge-api (flag in PR description).
- Verification (all green): per-package tests (raw-tx-schemas 13, bridge-api 57,
  swaps-api 75, sdk 1763/53 files), repo `pnpm test` 21 tasks, `lint`, `checkTs`,
  `check:circular-deps`, `check:knip`, `check-exports` (attw), `check:ai`,
  `check:ai-dev-files`, full `pnpm build` (apps + node-cjs), sdk tarball 731KB,
  grep leak check: zero `raw-tx-schemas` refs in either published dist.

## 2026-07-23 — adversarial review round (16-agent workflow: 5 finders → verify)

11 raw findings, 10 confirmed, 1 refuted. Fixed 6:

1. [high] No test failed if approve/createBridgeIntent gained `idempotent: true`
   (regression of PR #254 finding #8) → added `idempotent` column to the client.test.ts
   ROUTES table + a persistent-503 attempt-count test per method (idempotent → 3
   attempts, mutation → 1). Verified by mutation testing: flipping approve's flag
   fails exactly 1 test. Lesson: the sdk-level submitTx retry test guards through the
   BUILT DIST only — the standalone package needs the guard in its own suite because
   its publish workflow (`pnpm ci`) never runs sdk tests.
2. [medium] same, for the package's own CI gate — covered by fix 1.
3. [low] positive retry map pinned for every idempotent method — covered by fix 1.
4. [low] RETRYABLE_STATUS matrix untested beyond 503 → parameterized http.test.ts
   over 408/429/500/502/503/504 (retry) and 400/404/501 (no retry).
5. [low] `context.endpoint` static-path delta unpinned → assert added in sdk
   getSubmitTxStatus validation test.
6. [low] raw-tx-schemas README said "only public entry point" while the barrel also
   exports `EvmRawTxSchema` (consumers' tests use it) → reworded.
7. [low] BRIDGE_API.md Result section said "transport failure on error.cause",
   contradicting the new Implementation note → dropped "transport" (matches SWAPS_API.md).

Noted (NOT fixed — identical to the shipped SwapsApiService pattern; fixing bridge
alone would drift the two clients; candidates for a joint follow-up + PR-description
deltas):
- `Result.error.message` sentinel strings changed (HTTP_REQUEST_FAILED/REQUEST_TIMEOUT →
  BridgeApiError messages); `context.code` is the new discriminator.
- A throwing consumer `logger.error` now rejects the public promise (logger.error is
  called unguarded in toResult's catch — same as SwapsApiService.ts:150).
- Consumer-supplied Content-Type is clobbered to `application/json` on body-carrying
  calls (http.ts sets it after header merge — same as swaps-api http.ts).

Refuted: "skills error-codes reference omits 'bridge' in context.api" — verifier found
the reference already covers it.

Post-fix: bridge-api 76 tests, repo suite 21 tasks green, checkTs 14 tasks green.

## 2026-07-23 — scope revision: drop the shared raw-tx-schemas package (copy-only)

User revised the sharing decision (after a side conversation with the background Plan
agent): drop `packages/raw-tx-schemas` entirely; bridge-api carries its own verbatim
copy of the hardened swaps-api `rawTxSchemas.ts` + the identical 149-line test file
(drift fence until a follow-up extraction issue); swaps-api goes back to 100%
untouched (smaller PR blast radius). Rework executed:

- `git checkout HEAD -- packages/swaps-api` (all Step-1 edits there were revertible
  in one shot); `rm -rf packages/raw-tx-schemas`.
- bridge-api: copied `rawTxSchemas.ts` (header comment adapted for bridge) +
  `rawTxSchemas.test.ts` verbatim; client.ts/schemas.test.ts import `./rawTxSchemas.js`;
  removed the `@sodax/raw-tx-schemas` devDep / noExternal entry / knip ignore.
- Root AGENTS.md: removed the raw-tx-schemas row + dependency line; swaps-api and
  bridge-api lines now read identically ("depends on @sodax/types (and valibot)").
- Re-verified everything green: bridge-api 89 tests (6 files — rawTxSchemas tests now
  in-package), swaps-api untouched, repo test 19 tasks, checkTs/lint/knip/madge,
  attw "No problems found", check:ai + check:ai-dev-files, full `pnpm build` 13 tasks.
- Commit plan reduced to 3 (bridge-api / sdk refactor / docs).

Lesson: the interactive Plan agent kept its own conversation with the user going —
scope decisions can arrive through that side channel; always reconfirm with the user
(AskUserQuestion) before reworking, since background notifications are not consent.

## 2026-07-23 — Second adversarial audit round + Group A fixes (uncommitted on feat/bridge-api-package)

Full 38-agent workflow audit of the extraction (7 dimensions → 3-lens verify panel →
completeness critic). contract + consumers dimensions returned ZERO findings — the
extraction has no runtime bug. 8 confirmed findings, all test-guard/doc strength.

Applied (user: drop the release-order doc warning; the rest = "Group A"):
1. client.test.ts — approve happy-path test (only executor of makeBridgeApproveResponseSchema).
2. client.test.ts — non-EVM wiring test (srcChainKey 'near'): kills src→dst swap and
   hardcoded-EVM mutants at client.ts rawTxSchemaForChainKey call sites.
3. client.test.ts — ROUTES table now typed and pins the JSON body per route (5 POSTs
   were body-unasserted).
4. http.test.ts — network-retry pair (retry-then-success 2 calls; exhaustion 3 calls).
5. BridgeApiService.test.ts — request-side VALIDATION_ERROR is NOT tagged
   invalid_response_shape (pins the `issues !== undefined` guard).
6. schemas.ts — factory drift guards upgraded Extends → Equal (audit agent proved via
   tsc harness both Equal variants compile today; unlike swaps, both bridge contract
   types declare `tx: RawTxReturnType` exactly).
7. types/backendApiV2.ts:24 — comment now points at the wire clients' rawTxSchemas
   (this PR deleted the last `@sodax/sdk` copy the old text referenced).

All 5 targeted mutants killed (schema swap, src→dst, dropped body, no-net-retry,
dropped issues guard). Gates: bridge-api 93/93, sdk adapter 34/34, repo lint 13/13,
checkTs 13/13, test 19/19, circular-deps + knip clean.

Critic follow-ups (hand-verified, NOT fixed here):
- npm registry: @sodax/bridge-api E404 while sdk deps workspace:* — solo sdk republish
  before the first bridge-api release would publish an uninstallable sdk. User decided
  no doc warning needed (releaser's responsibility).
- rawTxSchemas drift fence is not mechanical (no CI cross-package diff) — fold into the
  raw-tx-schemas extraction follow-up issue.
- dapp-kit bridge hooks RQ retry:3 × wire retry 3 attempts = up to 12 reqs per poll on
  persistent 429/503 — needs a design decision; swaps hooks identical, fix jointly.
- skills swaps-api.md:161 still documents pre-extraction sentinels
  (HTTP_REQUEST_FAILED/REQUEST_TIMEOUT) — contradicts the new bridge-api.md; follow-up.

Rejected by the panel (1/3 votes): bridge-api tsconfig omits explicit moduleResolution —
harmless, `module: NodeNext` forces it (a mismatched pair is TS5110).
