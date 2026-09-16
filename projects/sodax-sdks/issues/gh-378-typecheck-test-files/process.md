---
type: process
repo: sodax-sdks
github: 378
updated: 2026-08-25
---

# Process

## Session 1 — 2026-08-24 (plan + full implementation)

### Research (plan mode)

- Dry-ran `tsc` with the exclude removed via a scratchpad tsconfig (`extends` + `exclude: []`): 140 errors / 29 of 76 test files. After fresh `pnpm i && pnpm build:packages`, re-run gave the authoritative **138 errors** — only the 2 `hook`-on-QuoteRequestV2 errors were stale-dist phantoms (`packages/types` dist predated `SwapExtrasV2.hook`).
- Repo precedent: `wallet-sdk-core` and `libs` already typecheck tests with the single-tsconfig pattern. All 76 test files import `vitest` explicitly. Nothing but `tsc --noEmit` consumes the sdk tsconfig include/exclude.
- `as never` census: 395 in tests, dominated by `.mockResolvedValueOnce(x as never)` partial-fixture stubs — user confirmed scope = fix surfaced errors only, no cast audit.

### Root causes found (worth remembering)

- **`Raw` generic is non-inferrable**: `DepositParams`/`SendMessageParams` intersect `WalletProviderSlot<C, Raw>` (a conditional type in `@sodax/types` common.ts), so `raw: true` in an object literal never infers `Raw` — the `= false` default pins it and `raw: true` then errors "true not assignable to false". Test-side fix: explicit generic (`deposit<true>({...})`) or an annotated params variable. Same for `requestTrustline<Raw>` (no default → falls to `boolean` → union return).
- **`GetAddressType` wart** (source-level, NOT fixed here): STELLAR → `Hex`, SOLANA → `Hex`, NEAR → `Address`, but real addresses are G-strkeys / base58 / `user.near`. Runtime consumes the real strings fine. Tests now carry documented `as unknown as` casts at the fixture constants. Flagged for a follow-up type correction in `@sodax/types` (`packages/types/src/common/common.ts:84`).
- **`ReturnType<typeof vi.spyOn>`** as a helper-param/let type erases the generic to `MockInstance<(this: unknown, ...args: unknown[]) => unknown>`, which rejects every real spy (contravariance) — 28 of the 138 errors. Fix: `MockInstance<Horizon.Server['loadAccount']>` / `MockInstance<typeof sodax.spoke.deposit>`.
- **`tiny-invariant.test.ts`**: one missing `.js` extension (NodeNext) made the module unresolvable, so `invariant` lost its `asserts` signature and 5 downstream errors cascaded from that single import line.
- **Error-fixture drift**: tests stubbed `Result.error` with plain `new Error('CREATE_INTENT_FAILED')` (a code that does not exist in any union — real codes are `INTENT_CREATION_FAILED` etc. per `src/errors/codes.ts` `CreateIntentErrorCode`). Replaced with real `SodaxError`s; assertions read `message` off the fixture so nothing weakened.
- **`verifyTxHash` stubs** returned `{ ok: true, value: undefined }` where `Result<boolean>`; every service (bridge/migration/staking) only checks `.ok`, so `value: true` is behavior-identical (verified in BridgeService.ts:568, MigrationService.ts:555).
- Narrowing idiom for `noUncheckedIndexedAccess` in tests: reuse `invariant` from `src/shared/utils/tiny-invariant.js` (no `!`, per AGENTS "no escape hatches"); `?.` where the assertion tolerates undefined.
- `ApiConfig` union narrowing needs all three `in` checks (`baseApiConfig`/`swapsApiConfig`/`sponsoringApiConfig`) — each `CustomApiConfig` variant REQUIRES a different slice, and `in`-false only excludes members where the prop is required.

### Dead-ends / incidents

- **Accidental `git stash`** during a verification one-liner (`git stash -q` in a compound command) stashed the whole working tree mid `pnpm test` run; popped immediately, all 29 files intact, the two pre-existing parked stashes untouched. Lesson: never put `git stash` in a "probe" command; the first `pnpm test` pass was discarded and re-run.

### Follow-up sizing (measured 2026-08-24, after PR #395 opened)

- Sibling packages, dry-run tsc with tests included (same scratchpad-extends method):
  dapp-kit **24** errors / 22 test files · swaps-api **28** / 6 · wallet-sdk-react **20** / 15 · types **2** / 8.
  ≈74 errors total — about half the sdk effort. Do as a separate PR after #395 review validates the fix patterns.
- `GetAddressType` wart blast radius: **62 non-test refs across 12 files** (all sdk feature services + types).
  Public-API change needing team buy-in; must land AFTER #395 (it removes the documented casts #395 adds).

### Session 1b — cast sweep (user expanded scope: "PR must complete ALL issue requirements")

User directed that the issue's cast clause be fully honored in PR #395. Method — compiler as
referee, AST-driven (`scratchpad/cast-sweep.mjs`, typescript API): strip every `as never` /
`as any` / `as unknown as T` in `*.test.ts` (span → same-length spaces so tsc line numbers stay
stable), run `tsc`, restore only sites implicated by errors (node range, enclosing-statement
range, declared-fixture-name appearing in the erroring statement), iterate to fixpoint; files
where attribution stalls get a conservative blanket-restore. Finalize rebuilds from git HEAD
with dead casts truly deleted.

Results: 532 sites → **153 deleted** (127 never, 26 unknown2), **377 kept** (256/116/5 —
compiler-proven load-bearing), 2 `(event as any).detail` → `as CustomEvent`; 2 imports that
became unused dropped; biome formatted the 17 touched files. All 36 `@ts-expect-error` are
active (self-proving). tsc 0 errors, 2297/2297 tests pass (identical count — casts are erased).

Attribution gotchas hit: (1) tsc reports errors at the START of a multi-line expression, so the
site's line range must be the whole AsExpression node, not the cast-suffix span; (2) fixture
consts consumed inside other multi-line statements need declared-name matching against the
ENCLOSING STATEMENT text of the error line, not just the error line; (3) ignore TS6133/TS6196
during attribution (unused imports are consequences of removal, fixed at the end).

### Session 1c — enforcement + multi-agent audit (ultracode)

- User chose to ship enforcement in the PR: commit 506bc05ed adds
  `packages/sdk/scripts/check-tests-typechecked.mjs` (tsc --showConfig must list every
  src/**/*.test.ts; wired as the second half of `checkTs`, so CI+husky inherit it with zero
  workflow changes — negative-tested: re-adding the exclude fails loudly with the 76-file list)
  plus a `packages/sdk/AGENTS.md` §Build And Tests paragraph stating both rules (tests are
  typechecked; a stub cast is allowed only while removing it breaks the typecheck).
  Rejected: a cast-count ratchet in CI (noisy, gameable; the strip-sweep stays a periodic tool).
- 7-agent audit workflow (6 dimensions + adversarial verify) over the PR: **0 blockers,
  0 should-fix**. Key proofs: verifyTxHash consumers branch only on .ok (BridgeService.ts:568,
  MigrationService.ts:555, StakingService.ts:418, MoneyMarketService.ts:548, SwapService.ts:788);
  SodaxError fixture swaps hit guard-free pass-throughs (guards only in catch blocks); every PR-body
  number re-derived exactly; sweep hunks all classify into the 4 expected classes. Two nits, both
  cosmetic, parked for review-feedback time: SwapService.test.ts:2534 baseQuoteRequest cast lacks
  its why-comment (13/14 commented); MigrationService.test.ts:310 `?.address` expected value could
  co-degrade — harden with invariant like BridgeService.test.ts does. The completeness-critic agent
  died on a session limit; its charter items were covered elsewhere (guard now pins vitest⊆tsc-program;
  0 .test.tsx/.spec; status fixtures verified in-program by the issue-compliance agent).
- Mid-audit scare resolved: working tree "reverts" were the user checking out their own new branch
  `fix/near-default-rpc-url` (NEAR RPC swap in types+wallet-sdk-react) — unrelated WIP, untouched.
  PR branch intact at 506bc05ed, CI green on it (guard ran in CI's checkTs).

### Session 1d — cast-comment ratchet (user: improvement #1 into the PR)

- Commit c95c0dccd (amended once to consolidate per user's "gom lại"): the guard script
  `check-tests-typechecked.mjs` grew a second check — every `as unknown as` in a test needs a
  why-comment on/within 2 lines above; 87 pre-existing undocumented casts grandfathered per file
  in `test-cast-comment-baseline.json` (shrink-only, `--update-baseline` regenerates). Chain stays
  two-leg: `tsc --noEmit && node ./scripts/check-tests-typechecked.mjs`.
- Design call: strict rule would have demanded 89 guess-written comments (rejected — wrong comments
  are worse than none); ratchet makes new casts fail loudly while legacy documents opportunistically.
- 3 PR-added casts that leaned on distant context got in-place comments (SwapService:2534 — closing
  the audit nit — SolanaSpokeService getDeposit #2, BridgeService negative-test closing line).
- Validated: exit 1 on re-excluded tests, exit 1 on over-baseline, exit 0 clean; check:ai-dev-files
  passes; hook (checkTs+build+test) passed twice (original + amend).

### Session 1e — sibling packages folded into PR #395 (user: "PR gốc đi")

- Commit 2c40b3043: dropped the test excludes in dapp-kit/swaps-api/wallet-sdk-react and fixed the
  74 surfaced errors (24/28/20/2) — 3 fixer agents in parallel (workflow) + types by hand. Notable:
  ChainKeys.SONIC → SONIC_MAINNET drift caught; mocks typed at source (vi.fn<typeof fetch>); zero
  new escape hatches; 3 documented casts.
- **types is the special case**: its `tsc` emits dist (checkTs doubles as the dependency build for
  turbo ^checkTs), so the build tsconfig keeps excluding tests and a new `tsconfig.check.json`
  (tests + noEmit) carries the check; verified 0 test files land in dist.
- Guard generalized to root `scripts/check-tests-typechecked.mjs` (--project flag, .test.tsx) wired
  into all five packages; sdk-local copy folded in (git shows R063 rename); per-package shrink-only
  cast-comment baselines, all grandfathered casts verified pre-existing on main.
- PR #395 retitled `test: typecheck .test files in every package`; body rewritten; two new
  source-improvement notes recorded (swaps-api schema factory generics, wallet-sdk-react
  chainRegistry Record<ChainType,…>).
- Gates: per-package checkTs chains PASS ×5, tests 539+89+182+333 (+2297 sdk), root checkTs 13/13,
  biome clean on changed files, pre-commit hook green.
- Oddity noted: the scratch branch ref pointed at ff345adac (an old main commit) at deletion —
  provably an ancestor of main with 0 unique commits, so nothing was lost; cause unknown.

### Session 1f — 2026-08-25 (CI confirmation)

- Final commit 2c40b3043 CI green: Build and Test pass (8m18s, run 32716193116); the log shows the
  guard ran in all five packages (76/22/15/8/6 test files in the tsc program + 5× "cast comments ok").
  Changeset check skips correctly via `no-changeset` label; title lint pass. Nothing left but review.

## Session 2 — 2026-08-25 (full re-research: "research lại hết")

- Branch gained **d6eb127b9** `test(wallet-sdk-core): guard test typechecking and tighten test casts`
  — authored by the user's own account (login 0x0603, verified; author name "0xILTW") from the second
  machine, with no context-repo session note. Strip-tested wallet-sdk-core's 17 casts (all
  load-bearing, none deleted), converted `as any` → type-only annotations / `as never` / `CustomEvent`,
  added why-comments, wired the shared guard; no baseline needed. CI green on that head
  (run 32736448879, 14:04 UTC).
- **Main advanced 6 commits** past merge-base 79659b891: NEAR RPC #397 (the user's other PR, merged),
  2 dependabot bumps, speed-tier #280, x-api-key #394, ai-drift-check #365. #394 (15:21 UTC) and
  #365 (19:41 UTC) landed AFTER that CI run — the green check does not cover current main. GitHub
  now reports the PR **CONFLICTING / DIRTY**.
- **Worktree merge probe** (scratchpad worktree, no commits, removed after): only conflict =
  `packages/swaps-api/src/http.test.ts` (ours: 8× `vi.fn<typeof globalThis.fetch>` + instanceof
  narrowing; main: apiguard-503 retry suite + renamed it-title + new imports). Resolved with main's
  version + retyped vi.fn, then install + build + checkTs ×6: **types / wallet-sdk-core /
  wallet-sdk-react OK; swaps-api 13, dapp-kit 12, sdk 1 = 26 tsc errors**, all in main's new tests,
  all the familiar untyped-fetch `mock.calls` tuple pattern (client.test.ts ×10, _apiKeyWire ×8,
  SodaxProvider ×4) + http.test.ts err-unknown ×3 (vanishes if our instanceof line is kept) +
  BridgeService.test.ts:1159 `value: undefined` vs boolean.
- Hidden behind the tsc failures: main added **6 undocumented `as unknown as`** in tests
  (PartnerFeeClaimService.apiKeyWire.test.ts ×4, http.test.ts ×2 partial-Response stubs) — the
  cast-comment guard will fail until they get why-comments. 4 new `as never` partial stubs are
  guard-legal.
- Coverage census: guard wired in all 6 test-bearing packages; `libs` has checkTs but **0 test
  files** (guard wiring moot); `apps/node` has 6 test files but is pre-existing excluded from root
  checkTs (`--filter=!./apps/node`) — apps out of issue scope. No `.spec.*` files, no tests outside
  `src/`. Unswept never/any casts: dapp-kit 4, wallet-sdk-react 21 (sdk + wallet-sdk-core swept;
  types/swaps-api/libs zero).
- New `ai-drift-check` workflow (#365) triggers on synchronize and has never run on this PR (opened
  before it landed); it will fire on the next push. PR edits 5 AGENTS.md files, all verified accurate
  by the Claude-bot review, so expect pass; `no-ai-drift` label is the escape hatch.
- Claude-bot PR review (user-triggered `@claude PR review`, Aug 24): re-ran builds/checkTs/tests
  independently, **no blocking issues**; 3 cosmetic notes (same-line `//` heuristic looseness,
  multi-line-cast blind spot, types' double typecheck cost) — deliberately not acted on.
- Live working tree: mid-session the user switched to a new branch `fix/demo-staging-solver-submit`
  (tracking origin/main) and staged `apps/demo/src/providers.tsx` (+5 lines: staging opt-out of
  backend submit-tx) — untouched by us. `test/sdk-typecheck-tests` local ref was ff'd to d6eb127b9
  before the switch. All probe work stayed in the scratch worktree.

### Session 2b — 2026-08-25 (main merged + fixed, user: "fix đi")

Done in scratch worktree `<scratchpad>/gh378-merge` with the REAL branch checked out (the user's main
checkout stayed on their demo branch, by then 4 modified files, pushed to origin). Merge staged,
**deliberately uncommitted** — commit/push waits for the user's explicit word.

- `git merge --no-commit origin/main`: single conflict, `packages/swaps-api/src/http.test.ts` —
  resolved as main's renamed it-title ('…on a plain 503') + our `vi.fn<typeof globalThis.fetch>`
  typing. Everything else auto-merged, pnpm-lock included (we add no deps).
- Correction to Session 2's estimate: http.test.ts's two `as unknown as Response` casts are the SAME
  two grandfathered in the baseline (main only shifted their lines) — so only 4 casts needed
  comments, not 6.
- Fixes (all in main's pre-gate test files): typed fetch mocks at source — client.test.ts ×4
  (`vi.fn<typeof globalThis.fetch>`), _apiKeyWire.test.ts fetchMock, SodaxProvider.test.ts fetchMock
  (kills all 22 mock.calls tuple errors); BridgeService.test.ts sodaxKeyed verifyTxHash stub
  `value: undefined` → `true`; PartnerFeeClaimService.apiKeyWire.test.ts 4 why-comments (comment
  above EVM_WALLET; same-line markers on the ConfigService/HubProvider/SpokeService closers).
- Gates in the worktree: pnpm i + build:packages OK; **checkTs OK ×7** (types libs swaps-api
  wallet-sdk-core sdk dapp-kit wallet-sdk-react) with guards green — coverage grew to **sdk 80,
  dapp-kit 28** test files (main's new files auto-covered); tests OK for swaps-api / dapp-kit / sdk;
  root checkTs + full root test run kicked off after. Biome on the 6 edited files: our lines clean;
  1 format error + 3 unused-suppression warnings are pre-existing inside #394's _apiKeyWire code —
  left untouched to keep the merge diff minimal.
- 6 files staged beyond the auto-merge: http.test.ts, client.test.ts, _apiKeyWire.test.ts,
  SodaxProvider.test.ts, BridgeService.test.ts, PartnerFeeClaimService.apiKeyWire.test.ts (explicit
  paths, never directories).
- Commit plan when the user triggers: merge commit (all fixes folded in — an intermediate red merge
  could not pass the husky hook anyway), default merge subject + short body listing the fix-ups;
  English, no attribution, no issue refs.

### State at session end

- `packages/sdk` checkTs: **0 errors** with all 76 test files included.
- Biome on changed files: clean except 2 pre-existing warnings on main (noTemplateCurlyInString in BitcoinSpokeService.test.ts it-titles).
- Diff audit: 0 new `as never` / `as any` / `@ts-*`; 14 documented `as unknown as` deliberate casts.
- Unit suite re-run pending completion at write time; root checkTs/build after.

## Session 3 — 2026-08-25 (dual-agent review findings verified + fixed)

Bot comment 5406493167 (`R0bi7-sodax-worker`) on PR #395: 3 low findings. All
three verified true in code; fixed 1 and 2 in the `gh378-merge` scratch worktree
(on top of the still-staged main merge, left **unstaged** so the merge can be
committed first, fixes as a separate commit):

1. **Cast scanner gaps** (`scripts/check-tests-typechecked.mjs`) — `indexOf` once
   per line missed 2nd+ casts; `//` inside a string after the cast counted as
   documentation. Fixed: line-local quote-aware `commentStart` scanner, counts
   every cast occurrence, casts after a real `//` are commented-out code. Scanner
   extracted as exported `undocumentedCastLines` + `isMain` guard (check-doc-links
   idiom). New `scripts/check-tests-typechecked.test.mjs` (6 cases) registered in
   root `test:ci-scripts`. Verified: counts match baseline in all 6 packages
   (no baseline churn — repo had no multi-cast lines or string-`//` masks).
2. **Turbo cache blind to guard script** — `checkTs` cacheable, root `scripts/**`
   not hashed. Fixed in `turbo.json`: `checkTs.inputs =
   ["$TURBO_DEFAULT$", "$TURBO_ROOT$/scripts/check-tests-typechecked.mjs"]`
   (turbo 2.9.14 supports `$TURBO_ROOT$`). Verified empirically: sdk checkTs
   dry-run hash changes when the guard script changes.
3. **`GetAddressType` maps NEAR→`Address`, Solana/Stellar→`Hex`**
   (`packages/types/src/common/common.ts:84`) — factually correct but
   pre-existing and a public-API change rippling through every service; left as
   follow-up per the review's own disposition. NOT fixed in this PR.

Verification: new tests 6/6, full `test:ci-scripts` 51/51, guard green e2e in
swaps-api and types (incl. `--project` path), biome clean on the 4 changed files.

### Session 3 addendum — committed and pushed

User asked to commit + push. Merge commit `bbc4d6c70` (--no-edit), fixes commit
`d41cf0fb7` (4 files, explicit paths staged). Pre-commit gate (checkTs + build +
test, TURBO_CONCURRENCY=2) green both times. Pushed `d6eb127b9..d41cf0fb7`;
PR flipped CONFLICTING → MERGEABLE (BLOCKED = review/CI pending). First-ever
ai-drift-check run triggered on this push.
