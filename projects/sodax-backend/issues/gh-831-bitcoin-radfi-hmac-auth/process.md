---
type: process
repo: sodax-backend
github: 831
updated: 2026-07-31
---

# Process

## Log

- **2026-06-30** — Read issue #831 + both comments. Ran a background research workflow
  (6 parallel readers over `sodax-sdks` + `sodax-backend` + `sodax-frontend`, a synthesis
  agent, and 3 adversarial verifiers). Wrote `issue.md` / `plan.md` / `README.md`.
- Design discussed with matterhorn: rejected "secret-in-SDK-config" in favour of a
  **stateless signer hook injected by the backend provider** (SDK must stay stateless).

## Findings (verified against source / published artifacts)

- **Version model.** `sodax-sdks` releases via changesets on a `release` line; npm
  `@sodax/sdk@2.0.0-rc.N` ↔ git tag `@sdks@2.0.0-rc.N`; dev branches keep a placeholder
  `0.0.1-rc.5`. Backend pins **rc.14**.
- **rc.14 lacks `extras.bound.accessToken`.** Verified by downloading the published
  `@sodax/sdk@2.0.0-rc.14` tarball (sha512 matched `pnpm-lock.yaml` integrity): its
  `SwapExtras = { partnerFee? } & SrcPublicKeySlot<K>` — no `bound` slot. The token
  plumbing shipped in **rc.15** (commit `a2395f07` / #237), present through rc.18.
- **HMAC exists nowhere.** No `x-api-signature` / `secretKey` / `secretWord` in rc.14,
  rc.18, or local `feat/bridge-api-v2`. Net-new SDK source + a new release required.
- **`chains.bitcoin.radfi` config exists since rc.14** (`RadfiConfig` =
  `{ apiUrl, apiKey, umsUrl, accessToken, refreshToken }` + `walletMode?`); default
  `apiUrl = https://api.bound.exchange/api`, `umsUrl = https://api.ums.bound.exchange/api`.
  swaps-api simply isn't supplying it.
- **Build-time RadFi calls confirmed.** `createIntent({raw:true})` for a Bitcoin source in
  TRADING mode (the default, and the only mode where raw BTC is allowed) calls, at build:
  `GET /wallets/details/{addr}` (unauthenticated public GET) and `POST /sodax/transaction`
  (authenticated — `resolveAuth` throws 401 if neither a user token nor `config.apiKey`
  is present). `POST /sodax/transaction/sign` runs **client-side** in the browser. So the
  user token is required *during* swaps-api `createIntent`, not only at sign/submit.
  Evidence: `SwapService.ts:864-877,927-947`; `BitcoinSpokeService.ts:403-425,447-451`;
  `RadfiProvider.ts:271,324-358,588-601`.
- **Token transport contract.** The SDK's own backend convention (`BitcoinBoundExtrasV2`,
  `packages/types/src/backend/backendApiV2.ts:63-69`) carries the token as nested
  `bound: { accessToken }` in the request **body** — explicitly *not* a header, *not* a
  flat field. Frontend reference: `apps/demo/.../BridgeCard.tsx` does
  `if (accessToken) body.bound = { accessToken }`. swaps-api should mirror this.
- **`RadfiProvider.request()` (`:628-636`) is the chokepoint** for `apiUrl` calls; two
  `umsUrl` `fetch` calls (`:291`, `:409`) bypass it. `request()` only sets `Content-Type`
  + passed headers today — the natural place for a signer to merge `x-api-signature`.
- **swaps-api surface.** Public swaps routes (`swaps.controller.ts` getQuote `:161`,
  approve `:212`, createIntent `:230`) have **no** Authorization-consuming guard
  (only `submitTx` has `HaproxyThrottlerGuard`, keyed on X-Real-IP). Config uses
  `RPC_CONFIG`/`SOLVER_CONFIG` JSON-string env (`configuration.ts:42-50`);
  `config.service.ts:~31` strips mongo configs from the startup log (extend for radfi).

## Verification corrections (adversarial pass)

- ❌ Draft assumed rc.14 already had `extras.bound.accessToken` ("free with no bump").
  **Wrong** — rc.14 has neither token plumbing nor HMAC; both arrive only on the bump to
  ~rc.19. Corrected in `plan.md`.
- ❌ Draft suggested swaps-api might extract the token by splitting `Bearer <reason>:<token>`
  on `:`. **Wrong** — that split is a RadFi-side parsing detail for the header *it*
  receives; the SDK consumes `accessToken` as an opaque token (`Bearer ${accessToken}`,
  no split). swaps-api should take the token from the DTO body, not parse `:`.
- ✅ Confirmed: raw BTC build hits the RadFi endpoints at build time (see Findings).

## Design decision — HMAC injection (4 options weighed)

1. **Secret in `RadfiConfig`, SDK computes HMAC** — rejected: SDK holds a per-deployment
   secret as state; forces isomorphic crypto; leaks vendor specifics into the SDK.
2. **Signing-proxy** (`radfi.apiUrl` → backend proxy that adds the header) — rejected as
   primary: a whole network service + an extra hop for "add one header"; RadFi chose HMAC
   (not IP), so the proxy buys nothing extra here.
3. **Monkey-patch `globalThis.fetch`** in the backend — rejected for prod: global process
   mutation, fragile to SDK internals, "no escape hatches" rule. OK only as a temporary
   dev bridge while ~rc.19 is pending.
4. **✅ Stateless signer hook injected by the provider** — CHOSEN. SDK exposes a generic
   `RadfiSigner` runtime hook; the backend supplies the closure that holds the secret and
   computes the signature. SDK stores only a function reference (no secret, no per-user
   token state), stays isomorphic, and the HMAC detail stays testable in the backend with
   `node:crypto`.

## Changes During Work

- **2026-07-01** — Self-reviewed `plan.md` against the PR-review rubric. Verdict was
  `request-changes` (3 should-fix, no blocker; core approach sound). Folded the fixes in:
  1. Added the required failure path "Bitcoin-source createIntent without `bound.accessToken`
     → 400" (else a deep 401 from `resolveAuth`), mirroring the `includeTxData` guard.
  2. Lowered the altitude of the A1 `signRequest` hook to "proposed seam — verify against
     how `ConfigService` threads runtime options first"; added a seam test.
  3. Added the missing `@Type(() => BitcoinBoundExtrasDto)` for the nested `bound` DTO.
  Plus nits: concluded the umsUrl signing scope; justified flat env vars vs `*_CONFIG`;
  noted the rc.19 base must contain #237; added the HMAC body-independence security note.
- **2026-07-01** — Researched the open decisions (2nd background workflow: 5 decision
  agents + synthesis). Outcomes folded into `plan.md`:
  - **D2 seam VERIFIED** (matches an independent read): the signer rides the runtime
    `SodaxOptionalConfig.radfi` channel (like logger/analytics/fee) → `ConfigService` →
    `BitcoinSpokeService` passes `config.radfiSigner` to `RadfiProvider`; 6 edit sites.
    Not on the serializable `chains.bitcoin.radfi`.
  - **D1** ms + lowercase hex; pinned test vector independently re-verified via `node:crypto`
    AND `openssl`: `sk_abc123`/`sw_xyz789`/`1719396000000` → `f1cc0894…553e_1719396000000`.
  - **D3** sign only `apiUrl` `request()`; `umsUrl` calls are dapp-kit UI-only.
  - **D4** cut `@sdks@2.0.0-rc.19` from the live `release` branch (docs' `release/sdk` is
    stale); latest published is rc.18.
  - **D5** body-nested `bound.accessToken` confirmed by 3 code sources.
  - **D7** raw env vars (not SHA digest — must replay the key), Coolify, fail-fast, redact.
  - Two scope-widening finds: `forbidNonWhitelisted:true` makes the `bound` DTO mandatory;
    `getQuote?includeTxData` for BTC source is broken today (added step B4b).
  - Still external: RadFi byte-match + **possible `x-api-key` key-id header** (critical) +
    ums signing + dual-key rotation; SDK owner (branch/number); product (quote thread vs
    descope).
- **2026-07-01** — Reconciled the "ask RadFi" list against RadFi's actual response comment
  (re-read verbatim). RadFi already specified: hex digest, `message = secret_word_timestamp`,
  ms timestamp, 60 s, and the required headers = `x-api-signature` + `Authorization: Bearer`
  **only** (no `x-api-key`). Retracted the earlier "critical x-api-key key-id" flag — the
  single dedicated Sodax credential is how their server selects the secret. RadFi side now
  essentially settled; only the real credential pair, an optional test-vector byte-match, and
  dual-key rotation remain. Updated `plan.md` + `README.md`.
- Implementation still not started; awaiting plan review + the remaining decisions.
- **2026-07-01 (later)** — Implemented both sides. SDK `feat/radfi-backend-signer` (2 commits),
  BE `feat/swaps-api-radfi-hmac` (5 commits). Neither pushed, no PR (per instruction). See
  `outcome.md`.

### 2026-07-28 — second pass (duplicate), then reconciliation + PRs

- **Re-implemented the whole issue from scratch without noticing the 2026-07-01 branches.**
  The session read the issue and the source, but never ran `git branch -r` and never opened
  this folder. `origin/feat/radfi-backend-signer` was in the remote list under an obvious
  name. Caught only when the user asked "which branch did you cut from?" — after both halves
  had been written, tested and reviewed. **Check remotes and this folder first.**
- The second pass's SDK design put `secretKey`/`secretWord` directly on `RadfiConfig`. That
  is worse than the 07-01 signer hook and was discarded: `ConfigService.initialize()` assigns
  `this.sodax = next`, replacing `chains.bitcoin.radfi` wholesale, so a credential parked
  there is both clobberable and serializable into any config dump. Same conclusion the 06-30
  design discussion had already reached — re-derived the hard way.
- Rebase → merge. The 07-01 SDK branch was 25 commits behind `main`. A rebase was done first,
  then undone in favour of `git merge origin/main` so the push stayed fast-forward and no
  force-push was needed (user's standing rule). Two conflicts, both additive: `Sodax.ts`
  (`useBackendSubmitTx` from main vs `radfiSigner` from the branch — keep both) and
  `ConfigService.ts` (main had commented out the `api`/`userConfig` fields under
  `TODO(config-v2)`, so the branch's `this.api = api;` had to go).
- Local-link method that worked, and the two that did not:
  - ✗ Symlinking `node_modules/@sodax/sdk` at the SDK workspace — pulls the SDK repo's
    `node_modules` into the BE module graph; vitest then hits the `@coral-xyz/anchor`
    extensionless-ESM bug (same failure the 07-01 session hit).
  - ✗ Building the Docker image against the local SDK — the Dockerfile COPYs fixed paths, so
    `.local-sodax/*.tgz` never enters the build context.
  - ✓ `pnpm pack` all four packages → `pnpm.overrides` → `pnpm install` → **then
    `git checkout package.json pnpm-lock.yaml` without reinstalling**. `node_modules` keeps
    the local build while the tracked files stay clean, so `checkTs` passes and the commit
    carries no local paths.
  - Scoping matters: overriding `@sodax/types` monorepo-wide breaks `apps/api`, which pins it
    to v1 (`1.3.1-beta-rc1`) deliberately. Use `@sodax/sdk>@sodax/types` instead.
- **First real call to Bound** (see `outcome.md` for the full result):
  `sodax.apiSignatureMismatch` with placeholder secrets — header received, parsed and
  verified by Bound. The IP barrier is confirmed gone.
- Ran swaps-api natively (port 3009) against the Dockerised Mongo/Redis. The Mongo replica
  set advertises members by Docker hostname, so a host client seeded at `127.0.0.1` is
  redirected to `sodax-mongo` and fails DNS — `directConnection=true` is required.
- PRs opened: sodax-sdks#322 (ready), sodax-backend#1027 (draft, CI red until the SDK
  publishes). BE committed with `--no-verify` at the user's direction — the pre-commit hook
  runs `pnpm test` monorepo-wide and `packages/incident-manager`'s `unique_active_per_target`
  test fails whenever its three integration files share a `mongodb-memory-server` (2/2
  reproducible; 81/81 in isolation). Unrelated to the diff; left unfixed to keep it scoped.
- **Reconciled the fork the same day.** `feat/swaps-api-radfi-hmac` merged with `development`
  (60 commits behind; 4 conflicts, all resolvable by taking `development` plus re-applying the
  branch's signer block), the 07-28 additions folded in, `feat/bound-backend-hmac-auth` and
  PR #1027 deleted/closed. New PR: **#1028**. Full breakdown in `outcome.md`.
- Two decisions from the 07-01 branch were dropped as stale — the `getQuote?includeTxData`
  Bitcoin block (superseded by #854's token threading) and `assertBitcoinBoundToken` (replaced
  by a DTO validator that limit orders inherit via `OmitType`). Both had been correct when
  written. **Method: check whether the thing an old branch works around still exists before
  carrying its decision forward.** Reading the branch diff alone gave the wrong answer twice.

### 2026-07-30 — full re-review of both PRs, then an audit of that review

Reviewed sdks#322 and backend#1028 file-by-file against the checked-out branches (both repos
were already on the PR branch), deliberately **not** trusting either PR body. Actionable
output → the "Follow-up — review fixes" table in `plan.md`. What is worth keeping here is the
one thing the implementation missed, and the parts of the review that did **not** survive
scrutiny.

**The miss: the DTO validator over-applies to two endpoints that never call Bound.**

`IsBoundAccessTokenPresentForBitcoin` is attached to `srcChainKey` on `CreateIntentParamsDto`
(`create-intent.dto.ts:32`) — and that DTO is the request body of **four** routes, not one:

| Route | Service | Reaches Bound? | After the PR |
|---|---|---|---|
| `POST /swaps/allowance/check` | `isAllowanceValid` | **No** — `SwapService.isAllowanceValid` falls through to `{ok:true, value:true}` for Bitcoin (`SwapService.ts:678`) | 400s without the token — **false rejection** |
| `POST /swaps/approve` | `approve` | No (Bitcoin has no approve) | 400s, wrong reason |
| `POST /swaps/intents` | `createIntent` | Yes | correct |
| `POST /swaps/limit-orders` | `createLimitOrderIntent` | Yes | correct |

Evidence: `swaps.controller.ts:207` and `:225` both take `CreateIntentParamsDto`. So a client
checking allowance for a BTC source before the user has logged in to Bound now gets
`bound.accessToken is required` on a call that would have answered `{valid:true}` without
touching Bound.

Irony worth remembering: the 07-28 pass **moved** this rule from a service-level guard to a
DTO validator (recorded above as a stale-decision cleanup) — and that move is exactly what
over-applied it. Correct home is `createIntent` + `createLimitOrderIntent` sharing one helper
with the `getQuote` guard. **Not** `buildRawIntentAction` — `isAllowanceValid` and `approve`
call that too.

**Audit — review points that were wrong or overreaching.** Recorded so they are not re-raised:

- ❌ *"The signer misses the two `umsUrl` calls; route all three through one helper."*
  Contradicts **D3**, settled on 07-01 in this very folder: the Bound credential is scoped to
  the Sodax endpoints, so signing UMS is unverified and possibly meaningless. Reviewing from
  the diff without re-reading `plan.md`'s Decisions re-derived a settled call as a "bug".
  **Method: read the recorded decisions before reviewing the diff that implements them.**
  Only a clarifying comment survives (F9) — and it is worth writing because `RadfiProvider`
  **is** public API (`packages/sdk/src/index.ts` → `shared/index.js` → `entities/index.ts` →
  `btc/index.ts` → `RadfiProvider.js`), so third parties can hit the same confusion.
- ❌ *"A credential failure returns 422 and no alert fires."* The 422 is real
  (`error-mapper.ts:9`), but the alerting half is wrong: `throwSdkError` logs at
  `logger.error`, and the file's own comment says error-level blocks are forwarded to the
  pager. Residual issue is HTTP semantics, 5xx metrics and client UX only → kept as F5, not as
  a high-severity finding.
- ❌ *"Throw at boot whenever the credential is missing."* That converts a Bitcoin-only
  degradation into an outage for a service that fronts 10+ chains. Reconciled with D7's
  "fail-fast" as: throw only when **exactly one** of the pair is set (unambiguous typo), warn
  when both are unset (F4).
- ❌ *"Keep the secrets private in `CustomConfigService`, expose only the signer."* Near-zero
  benefit — the values live in `process.env` and stay readable in-process either way.
- ❌ *"Use `BITCOIN_CHAIN_KEYS_SET.has(...)`."* One Bitcoin key exists and the BE already uses
  `=== ChainKeys.BITCOIN_MAINNET` in four places; the change would break local idiom.
- ❌ *"Rename the type to `OutboundRequestSigner` so a second provider can reuse it."*
  Premature abstraction; no second consumer.

**Findings that did hold** (details + anchors in `plan.md`): the dead `body?: unknown` field
on the public `RadfiSignContext`; the missing changeset and the missing `radfi` entry in
`CONFIGURE_SDK.md`; the silent half-set-credential path; three doc-vs-code mismatches
(BE README + `outcome.md` say `quote?includeTxData` is descoped while the code threads it;
the BE PR body describes a masked `boundConfig` log line the code does not emit; the SDK PR
body says the signer is kept out of `this.sodax` while `deepMerge` copies it in).

**Safety properties verified as correct** (no action needed, do not re-audit): the per-user
Bound token is threaded per request and never seeded onto the shared `RadfiProvider.accessToken`
— no cross-request token bleed on the Sodax singleton; `bound.accessToken` never reaches the
Redis cache (the cache is only on the `submitTx` path); morgan's `common`/`dev` formats do not
log request bodies.

### 2026-07-31 — post-fix pass: F4 broke CI, and the release numbers went stale

Re-checked both branches after F1–F6 landed (BE `feat/swaps-api-radfi-hmac` = `origin`, 10
commits over `development`; SDK `feat/radfi-backend-signer` = PR #322, **not draft, CI green,
awaiting review**). F1–F6 are in and hold up. Two new blockers, both **consequences of things
that changed after the round-1 review**, not of the design. Round-2 fix list → `plan.md`
("Follow-up — round 2"). Method note that mattered: the CI item was found by *running* the
suites with the env unset, not by reading the diff — the diff looks harmless.

**1. F4's hard-required credential kills the e2e suite (and CI).** `configuration.ts` calls
`buildRadfiConfig()` at **module scope** (`:132`), and `require('dotenv').config()` on line 1
only finds a `.env` in cwd — which CI does not have and `apps/swaps-api/` does not ship
(`example.env.dev` only). So every module that transitively imports `configuration.ts` throws
on **import**. Reproduced with the credential env explicitly unset:

```
apps/swaps-api $ env -u BOUND_API_SECRET_KEY -u BOUND_API_SECRET_WORD npx vitest run
  → Test Files 17 passed (17) · Tests 337 passed (337)          # unit: fine

apps/swaps-api $ env -u … npx vitest run --config ./vitest.e2e.config.ts
  → Test Files 5 failed | 4 passed (9)
    Error: Missing required RadFi/Bound backend credential: BOUND_API_SECRET_KEY, BOUND_API_SECRET_WORD
      ❯ buildRadfiConfig src/config/configuration.ts:86:11
      ❯ src/config/configuration.ts:132:16
```

Failing: `health.admin-guards`, `swaps-admin.controller`, `submit-swap-tx-heartbeat.service`,
`submit-swap-txs.fast-lane`, `submit-swap-txs.task` — they reach it via `bearer.guard.ts:3`
(`ADMIN_ACCESS_TOKENS`) and `submit-swap-tx-heartbeat.service.ts:7` (`ORIGIN`), i.e. through
ordinary app imports, not through anything RadFi-related. `apps/swaps-api` `test` is
`vitest run && pnpm run test:e2e` and `ci.yml` sets only `MONGOMS_VERSION`, so `pnpm test`
in CI is red. `test/vitest.setup.ts` (shared by both configs) was **not** touched by the branch
— it already stubs `buildMongoConfig`/`buildStatefulMongoConfig` for exactly this class of
module-eval-time env dependency, which is where the placeholder pair belongs.
Why the earlier "336/336 green" claim missed it: that was the **unit** run, and unit specs do
not import `configuration.ts` (only `radfi-config.spec.ts` does, and it seeds its own env in a
`vi.hoisted()` block).
Same root cause, second consequence: local dev / any deployment now needs the pair to boot at
all — `docker-compose.yml` passes `${BOUND_API_SECRET_KEY:-}`, so an un-provisioned deploy
crash-loops swaps-api for all 10+ chains. That is the trade-off the user accepted when choosing
hard-required; the CI half is not.

**2. The release numbers this folder is written around no longer exist.** npm today:
`@sodax/sdk` `latest` = **2.0.0** (stable shipped), `rc` = **2.0.0-rc.21**. The changeset on
#322 is `minor` for both `@sodax/types` and `@sodax/sdk` ⇒ the hook lands as **2.1.0**, not the
`rc.19` written everywhere here. `61d4ba8b` ("bump pin to rc.19") was silently undone by the
merge with `development`: `apps/swaps-api/package.json` now pins `2.0.0-rc.21`, which has no
`radfi.signRequest` — so #1028's CI stays red by construction until #322 publishes and the pin
is re-bumped. Also worth knowing before trusting any local green run: `apps/swaps-api/node_modules/@sodax/sdk`
is a symlink to a **local tarball `2.0.0-rc.17`** built from `.local-sodax/` (untracked), so
local `checkTs`/tests are validating a build CI will never install.

**Tiers 1–2 of the round-2 order applied the same day** (F13a, F18, F12a, F11, F14 — see the
status column in `plan.md`). Two things worth carrying forward from doing them:

- **Both PR bodies had drifted further than the round-1 review caught.** #1028 still described
  the DTO validator F1 deleted and still said an unset credential is valid, which F4 reversed —
  i.e. the body documented the *pre-fix* behaviour on two separate points, either of which would
  mislead a reviewer into approving the wrong shape. #322 still ended with "no changeset yet".
  Fixing only the sentence the review flagged would have left both. **When a PR body is stale
  once, re-read it whole against the diff rather than patching the flagged line.**
- **A branch switch invalidates `packages/types/dist`.** `pnpm --filter @sodax/sdk checkTs`
  reported `RadfiSigner` / `radfi` as missing purely because `dist` was still the other branch's
  build; `pnpm --filter @sodax/types build` cleared all three errors. Rebuild types before
  believing a type error on this branch.
- Unrelated, noted not fixed: `RadfiProvider.ts:643` is not biome-**format** clean on this branch
  (the signer ternary from `be891fc5c`). CI runs `biome lint`, which passes, so it is invisible
  there; reformatting it now would only add noise to the PR diff.

**Checked and found fine** (recorded so the next pass skips them): `RadfiApiError` sets
`this.name = 'RadfiApiError'` as a string **literal** and `packages/sdk/tsup.config.ts` does not
minify, so `error-mapper`'s `name === 'RadfiApiError'` shape match is safe across the published
bundle; Bound's step 3 (`POST /sodax/transaction/sign`) is browser-side, so swaps-api's
`submitTx` queue path never needs a Bound token (it only stores + relays); the unit suite is
env-independent.
