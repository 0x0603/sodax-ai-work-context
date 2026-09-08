---
type: plan
repo: sodax-sdks
github: 425
status: Active
updated: 2026-09-08
related_issues: [gh-330-bound-exchange-endpoint-inventory, gh-1024-bound-auth-email-provider]
related_decisions: []
---

# Plan — Bound Exchange domain split (svc / auth)

Parent `icon-project/sodax-sdks#425`. Sub-issues: `sodax-sdks#426` (SDK),
`sodax-backend#1215` (swaps-api + bridge-api).

**Evidence and reproduction commands live in [`plan-evidence.md`](plan-evidence.md).**
This file is the design and the execution steps. Every factual claim here is cited
there.

## Goal

Move the SDK's Bound Exchange calls off the single `api.bound.exchange` host onto
Bound's split `svc.bound.exchange` / `auth.bound.exchange` hosts, **without changing
observable behaviour in the release that ships the mechanism**, and without blocking on
answers Bound has not given.

Non-goal: completing the migration. Phase 2 (actually sending `/auth/*` to the auth
host) is deliberately deferred to an env-var flip on canary — see §Phase 2.

## Scope

| Repo | In scope | PR |
| --- | --- | --- |
| sodax-sdks | `authUrl` field, per-prefix routing, packaged `apiUrl` flip, tests, docs | 1 |
| sodax-backend | `RADFI_AUTH_URL` override in swaps-api **and** bridge-api, catalog bump | 1 |
| intents-whitelabel | **out** — see §Out of scope | — |
| sodax-frontend | **out** — no Bound config exists there | — |

Two PRs total, as decided: one per repo.

## The problem, precisely

`RadfiConfig` carries a single `apiUrl`
(`packages/types/src/sodax-config/sodax-config.ts:41-47`) and
`RadfiProvider.request()` prefixes every endpoint with it
(`packages/sdk/src/shared/entities/btc/RadfiProvider.ts:657`). Bound's split puts
`/auth/*` + `/wallets/*` on one host and `/sodax/*` on another, so one base URL can no
longer serve both halves.

That makes it a `@sodax/types` shape change, which reaches the backend's env overrides
and every consumer that sets the URL by hand.

### What the SDK actually calls

All from `RadfiProvider.ts`. Nine endpoints go through `request()` (signed, `apiUrl`);
two bypass it with a bare `fetch` (unsigned, `umsUrl`).

| Endpoint | Line | Base URL today | Routes to, after |
| --- | --- | --- | --- |
| `POST /auth/authenticate` | `:225` | `apiUrl` | **auth** |
| `POST /auth/refresh-token` | `:248` | `apiUrl` | **auth** |
| `POST /wallets` | `:271` | `apiUrl` | **auth** |
| `GET /wallets/details/:addr` | `:288` | `apiUrl` | **auth** |
| `POST /sodax/transaction` | `:353` | `apiUrl` | svc |
| `POST /sodax/transaction/sign` | `:395` | `apiUrl` | svc |
| `POST /transactions` | `:452`, `:517` | `apiUrl` | svc *(not in Bound's mapping — see Q1)* |
| `POST /transactions/sign` | `:482`, `:543` | `apiUrl` | svc *(idem)* |
| `POST /transactions/max-spent` | `:583` | `apiUrl` | svc *(idem)* |
| `GET /wallets/balance` | `:310` | `umsUrl` | **unchanged** |
| `GET /utxos` | `:429` | `umsUrl` | **unchanged** |

Note `/wallets/balance` is on `umsUrl` and does **not** pass through `request()`, so the
`/wallets` routing prefix cannot capture it. Verified at `:306-310`.

## Design decision — one optional field, and a default that changes nothing

```ts
// packages/types/src/sodax-config/sodax-config.ts:41-47
export type RadfiConfig = {
  apiUrl: string;
  authUrl?: string;   // Bound's auth host; falls back to apiUrl when unset
  apiKey: string;
  umsUrl: string;
  accessToken: string;
  refreshToken: string;
};
```

```ts
// packages/sdk/src/shared/entities/btc/RadfiProvider.ts — internal, not consumer-configurable
/** Prefixes Bound serves from the auth host after the svc/auth domain split. */
const AUTH_HOST_PREFIXES = ['/auth/', '/wallets'] as const;

private baseUrlFor(endpoint: string): string {
  return AUTH_HOST_PREFIXES.some((p) => endpoint.startsWith(p))
    ? (this.config.authUrl ?? this.config.apiUrl)
    : this.config.apiUrl;
}
```

```ts
// packages/types/src/chains/chains.ts:863-869 — the packaged default
radfi: {
  walletMode: 'TRADING',
  apiUrl: 'https://svc.bound.exchange/api',   // was api.bound.exchange
  // authUrl is deliberately NOT set. Until an authenticated probe confirms
  // auth.bound.exchange serves the BIP322 /auth/* + /wallets/* plane, everything
  // falls back to apiUrl — which is the same radfi-be that serves them today.
  apiKey: '',
  umsUrl: 'https://api.ums.bound.exchange/api',
  accessToken: '',
  refreshToken: '',
},
```

### Why the default ships `apiUrl` only

This is the load-bearing decision, and it reverses an earlier draft of this plan.

1. **`svc` is provably the same backend as `api`; `auth` is provably not.** Pinning one
   ALB IP and varying only the `Host` header, `api` and `svc` both return `radfi-be`'s
   NestJS 404 for `/.well-known/jwks.json` while `auth` returns a live ES256 key set —
   which `radfi-be` cannot serve, because it sets `app.setGlobalPrefix('api')`. Full
   reproduction in [`plan-evidence.md`](plan-evidence.md) §2.
2. **Therefore moving `apiUrl` to svc is a rename, not a migration.** Zero behaviour
   change, and it puts us on the new hostname immediately.
3. **Therefore defaulting `authUrl` would be a leap of faith.** Nobody has established
   that `bound-authentication` serves BIP322 `POST /api/auth/authenticate` or the
   `/api/wallets/*` family. `radfi-be` still owns those routes
   (`auth.controller.ts:21,50,74`, `wallet.controller.ts:22`). Bound's mapping says they
   *will* live there; it does not prove they do. Every `/api/*` path is gated `403` from
   outside, so we cannot check. If we default it and Bound has not cut over, **every
   Bitcoin user's sign-in breaks the moment their dApp upgrades the SDK.**
4. **With `authUrl` unset, `/auth/*` and `/wallets/*` fall back to `apiUrl` = svc =
   radfi-be** — exactly the service serving them today. The release is dormant
   machinery plus a hostname rename.
5. **The cutover becomes an env var, not a release.** `RADFI_AUTH_URL` lets ops point
   auth traffic at the auth host on one canary deployment, verify with the real
   credential, and roll back by unsetting it. No SDK release, no partner coordination,
   instant revert.

### The straddle trap this avoids

Had the default shipped a matched `apiUrl` + `authUrl` pair, a consumer overriding only
`radfi.apiUrl` — pointing at signet, staging, or a proxy — would keep the packaged
**mainnet** `authUrl`, because `deepMerge` merges plain objects key by key
(`packages/sdk/src/shared/utils/deepMerge.ts:12-35`). Their auth traffic would silently
go to a different environment from everything else.

That hazard does not exist today (one URL means overriding it moves everything) and this
design must not introduce it. Not defaulting `authUrl` removes it **by construction**,
not by documentation. This is strictly better than the "documented and accepted"
mitigation an earlier draft proposed.

### Why the prefix list stays internal

`AUTH_HOST_PREFIXES` is a module constant in `RadfiProvider`, not config. There is no
consumer asking for a configurable routing table, and exposing one would be API surface
for a hypothetical caller. If Bound later says `/transactions/*` belongs on auth, it is
a one-line edit here.

### Why signing does not change

`request()` changes only which base URL it prefixes. The signer still fires on every
call it fires on today. See §Q4 below for why the earlier rationale for this was wrong
even though the conclusion was right.

## What recon settled — the four blocking questions

`#425` recorded the work as blocked on four questions to Bound. Three are answered from
evidence; the fourth is answered but its reasoning in the ticket (and in an earlier draft
of this plan) was inverted. Reproduction commands in
[`plan-evidence.md`](plan-evidence.md).

| # | Question | Answer | Confidence |
| --- | --- | --- | --- |
| Q1 | Where do `/api/transactions/*` go? | Stay on svc. `radfi-be` owns `@Controller('transactions')` and svc reaches `radfi-be`. Our routing sends them to `apiUrl` anyway, so any later answer is a one-line change | High |
| Q2 | Does `api.ums.bound.exchange` split? | No. `svc.ums`, `auth.ums`, `ums.bound.exchange` do not resolve. UMS is separate infra (nginx/Express, own IP) and answers `200` unauthenticated | High |
| Q3 | Testnet/staging hosts? | None exist. `signet.svc`, `signet.auth`, `staging.svc`, `staging.auth` do not resolve; `signet.api` and `staging.api` still do. The fallback handles this for free | High |
| Q4 | Is HMAC svc-only? | Neither — the signature is optional everywhere. See below | High |

### Q4, stated correctly

`SodaxApiKeyGuard` is the one global `APP_GUARD` (`radfi-be/src/app.module.ts:203`) and
treats a missing `x-api-signature` as "not a partner, proceed"
(`sodax-api-key.guard.ts:27-31`). So signing is optional on every route.

What signing buys differs by host:

- **On svc** it buys a real bypass. `TransactionRateLimitGuard` is *not* global — it is
  hand-applied on six controllers (`sodax`, `transaction`, `etch`, `satflow`,
  `vm-transaction`, `refund`) and its `isSodaxPartner === true` early return
  (`tx-rate-limit.guard.ts:36`) is the bypass.
- **On auth it buys nothing.** Neither `@Controller('auth')` nor `@Controller('wallets')`
  applies that guard. Instead a signature *opts the request into* the global
  `SodaxRateLimitGuard`, which is inert for non-partners
  (`sodax-rate-limit.guard.ts:32-34`) and otherwise draws from one shared bucket keyed
  `SODAX_RATE_LIMIT_KEY = 'sodax-backend'` (`cache.constant.ts:31`).

**Decision: keep signing every host** — because that is byte-identical to today's
behaviour, *not* because it buys a bypass. The SDK already signs `/auth/*` and
`/wallets/*` today (they all go through `request()`), so the shared-bucket consumption is
the status quo and the split changes nothing about it.

Two watch-items worth carrying into ops notes:

- auth-host chatter and `/sodax/transaction` draw on the same partner budget;
- a **signed** request hard-fails with `partnerDisabled` if Bound flips
  `setting.enabled` / `partnerAuth.isActive` off, where an unsigned one would still work.

## Corrections the tickets need

Found while verifying `#425` / `#426` / `#1215` against the default branches. Each is a
statement in a ticket that is false.

1. **`#426` item 4 is a dead surface.** `BitcoinRpcConfig.radfiApiUrl` / `radfiUmsUrl`
   (`packages/types/src/common/common.ts:340-344`) is described as "read by
   wallet-sdk-react". It is read by **nobody**: `walletRpcConfig.ts` exports only
   `getEntryDefaults`, `getRpcUrl`, `resolveEvmDefaults`, and reads only `rpcUrl` and
   `defaults`. Skip the item entirely.
2. **`#426`'s "needs a changeset" is wrong**, and so is the blunt "there is no
   `.changeset/`". PR #407 (`refactor(release): replace changesets with a single pnpm
   release command`) removed changesets; PR #387 then re-added one orphan file,
   `.changeset/add-lsoda-susds-vault.md`, from a branch cut before #407. Nothing consumes
   it — no `changeset` dependency, no CI reference. **Do not write a changeset.**
   Deleting the orphan is a tidy-up for a different PR.
3. **`#426`'s "`CONFIG_VERSION` bump" is wrong.** `packages/types/AGENTS.md` §Rules and
   `packages/RELEASE_INSTRUCTIONS.md:24,76` both say never hand-edit it;
   `scripts/bump-versions.sh` increments it once per release on the `release` branch.
4. **The radfi shape exists twice and `#426` names only one.** `RadfiConfig`
   (`sodax-config.ts:41-47`) and an inline structural duplicate at
   `chains.ts:546-553` — the latter carries `walletMode`, the former does not. Both need
   `authUrl?: string`.
5. **`#1215`'s "swaps-api and bridge-api are mirrors" is not true yet.** On
   `origin/development`, bridge-api has only the per-request token surface
   (`assertBoundAccessTokenForBitcoin`, `bridge.service.ts:297`). `buildRadfiConfig`,
   `RadfiConfigClass`, the HMAC signer, `RADFI_*` env and `radfi-config.spec.ts` exist
   **only on open PR #1097**. Note `development` and `main` are the same commit; there is
   no `develop` branch.
6. **`#425`'s "whitelabel is a one-line env change" is wrong.** It pins `@sodax/*` at
   `2.0.0-rc.12`; `authUrl` lands in `2.2.x`+. That is a two-minor SDK bump, i.e. real
   work. Out of scope here.
7. **`#425`'s central risk framing is wrong** — "only the domain moves" understates it.
   `auth.bound.exchange` is a different service, not a different name for the same one.

## Sequencing

```
PR 1 (sodax-sdks) ──► SDK release published ──► PR 2 (sodax-backend, both apps)
```

The SDK must ship first: both backend apps consume `@sodax/sdk` through
`pnpm-workspace.yaml`'s catalog (`2.2.0-rc.3` today), a published npm package, not a
workspace link. The backend cannot reference `authUrl` until the field exists in a
published `@sodax/types`.

**PR #1097 is therefore not on the critical path.** It is an open bridge-api PR that
introduces the very config machinery PR 2 extends. By the time the SDK release exists it
will have merged, so PR 2 can touch swaps-api and bridge-api in one pass — which is what
"one PR for the backend" requires. Do **not** stack PR 2 on #1097's branch.

## Steps — PR 1, sodax-sdks (`#426`)

Branch off `main`: `feat/426-bound-svc-auth-hosts`. One branch for the whole feature.

### 1. Type — both copies

- `packages/types/src/sodax-config/sodax-config.ts:41-47` — add `authUrl?: string` to
  `RadfiConfig`, with a comment saying it falls back to `apiUrl`.
- `packages/types/src/chains/chains.ts:546-553` — add the same optional field to the
  inline `BitcoinSpokeChainConfig.radfi` duplicate.

Optional in **both** places. That keeps the change strictly additive: no consumer
hand-constructing either shape breaks, and the `as const satisfies` on the packaged
default still passes.

### 2. Routing — `RadfiProvider.ts`

- Add the `AUTH_HOST_PREFIXES` module constant and the private `baseUrlFor()` shown in
  §Design.
- `:657` — replace `` `${this.config.apiUrl}${endpoint}` `` with
  `` `${this.baseUrlFor(endpoint)}${endpoint}` ``.
- `:145-152` — the constructor strips trailing slashes from `apiUrl` and `umsUrl`; add
  the same for `authUrl`. Follow the existing `?.endsWith('/')` shape used for `umsUrl`,
  since `authUrl` is optional.

Do not touch the signer block at `:653-656`.

**Pre-existing hazard, do not fix here:** the constructor does `this.config = config`
then writes back into `this.config.apiUrl`, mutating the caller's object — which is the
packaged `spokeChainConfig` singleton, since `deepMerge` only shallow-copies untouched
branches. Adding `authUrl` follows the same pattern for consistency. Fixing the mutation
is a separate change; flag it in the PR body so a reviewer does not think it is new.

### 3. Packaged default — `chains.ts:863-869`

Change exactly one value: `apiUrl` → `https://svc.bound.exchange/api`.
Leave `umsUrl`. **Do not add `authUrl`.** Add the comment shown in §Design so the next
reader does not "fix" the omission.

### 4. Stale JSDoc

Several comments say the signer runs on "each outbound `apiUrl` request", which stops
being accurate once two hosts exist:
`sodax-config.ts:78,88,119` and `RadfiProvider.ts:123,130`. Reword to name both hosts
and state that UMS stays unsigned.

### 5. Tests

There is currently **zero** coverage that a request reaches the right host — the two
existing signer assertions (`RadfiProvider.test.ts:213,228`) check the `path` handed to
the signer, not the URL fetched, so they would stay green through a total misroute.

Add to `RadfiProvider.test.ts`:

- **with `authUrl` set** — `/auth/authenticate`, `/auth/refresh-token`, `/wallets`,
  `/wallets/details/:addr` fetch from `authUrl`; `/sodax/transaction`,
  `/sodax/transaction/sign`, `/transactions`, `/transactions/sign`,
  `/transactions/max-spent` fetch from `apiUrl`;
- **with `authUrl` omitted** — all nine fetch from `apiUrl`. *This is the test that pins
  "the shipped default changes nothing"*;
- the signer fires on both hosts;
- `getBalance` and `getExpiredUtxos` still bypass `request()`, hit `umsUrl`, and stay
  unsigned;
- a trailing slash on `authUrl` is stripped like the other two.

Plus a chains-config test asserting the packaged default has **no** `authUrl`, and that
`apiUrl` / `umsUrl` name one environment. It fails loudly if someone defaults `authUrl`
without running the Phase 2 probe.

`baseConfig` at `RadfiProvider.test.ts:9-15` is typed `: RadfiConfig`; because the field
is optional, no existing construction site needs touching.

### 6. Docs

Edit the **source** only: `packages/sdk/docs/BITCOIN_INTEGRATION.md:11,62-63`. Then run
`node scripts/sync-docs-pages.mjs` to regenerate
`docs/developers/how-to/bitcoin-integration.md` (mapping at
`scripts/docs-pages-map.json:124-128`). Editing the `docs/` copy alone fails
`.github/workflows/docs-drift.yml`.

Document the override contract explicitly: when you set `radfi.apiUrl` yourself, set
`umsUrl` (and `authUrl`, if you use it) to the same environment.

### 7. apps/node — leave alone

`apps/node/src/bitcoin-radfi.ts:18-23` and `btc.ts:52,54` hardcode signet/staging hosts
and bypass `RadfiProvider` entirely (raw `fetch`). No split hosts exist for those
environments, so **do not touch the URLs**. `bitcoin-raw-intent-check.ts:102` gates a
diagnostic logger on `url.includes('bound.exchange')`, which still matches svc/auth.

`btc.ts:51-55` is already broken on `main` (writes `url:` where `RadfiConfig` needs
`apiUrl`, imports a removed `BitcoinSpokeProvider`); `apps/node` is excluded from
`checkTs`. Out of scope — do not get drawn in.

### Do not touch

- `common.ts` `radfiApiUrl` / `radfiUmsUrl` — dead surface (Correction 1).
- `CONFIG_VERSION` — the release script owns it (Correction 3).
- `apps/demo`, `apps/wallet-modal-example`, `apps/swap-api-example` — their `radfi*`
  keys sit on `SodaxWalletConfig` and are never read. `apps/demo/src/providers.tsx:175`
  copies them into `SodaxOptions.chains` where they are also never read, so the demo's
  `RADFI_API_URL` env override is already a no-op. Worth a PR-body note, not a fix.

## Release

`pnpm release` per `packages/RELEASE_INSTRUCTIONS.md`. Not a one-liner:

1. merge PR 1 into `main`;
2. `git checkout release`, `git fetch origin --tags`, `git pull --ff-only origin release`,
   `git pull --no-ff origin main` — a stale `release` reuses the previous
   `CONFIG_VERSION`;
3. `pnpm release` (or `pnpm release <version>`) — sets every manifest, increments
   `CONFIG_VERSION` once, writes gitignored `release-notes.md`. It commits nothing;
4. inspect, then `git add packages/`, `git commit -m "chore: release @sdks@<version>"`,
   push;
5. `gh release create "@sdks@<version>" …` — the tag is what triggers
   `.github/workflows/sdks-publish.yml`.

Release notes come from conventional commits, so PR 1's commit messages are the changelog.

## Steps — PR 2, sodax-backend (`#1215`)

Branch off `development` **after PR #1097 merges**: `feat/1215-radfi-auth-url`.
Every edit applies **twice** — `apps/swaps-api` and `apps/bridge-api` — and the two
apps' files are byte-identical in this area apart from comments, so keep them in step.

### 1. Catalog bump

`pnpm-workspace.yaml`: `@sodax/sdk` and `@sodax/types` to the new release. Then
`pnpm install` (a stale install produces phantom `checkTs` errors), then
`pnpm --filter sodax-backend-dashboard gen:chains`, which the catalog comment requires
after a `@sodax/types` bump.

Leave `apps/api`'s own `@sodax/types: 1.3.1-beta-rc1` pin alone — it is deliberate, drives
the v1 wire contract via `SdkConfigV1ToV2Adapter`, and does not move with the catalog.

### 2. `configuration.ts` — swaps `:125-185`, bridge equivalent

`radfiEndpointOverride`'s `field` parameter is typed `'apiUrl' | 'umsUrl'`. **Widen the
union to include `'authUrl'`** — this is easy to miss and is a compile error, not a
silent bug.

Then add the third override and fold it into the existing refusal:

```ts
const apiUrl  = radfiEndpointOverride('RADFI_API_URL',  'apiUrl',  process.env.RADFI_API_URL);
const authUrl = radfiEndpointOverride('RADFI_AUTH_URL', 'authUrl', process.env.RADFI_AUTH_URL);
const umsUrl  = radfiEndpointOverride('RADFI_UMS_URL',  'umsUrl',  process.env.RADFI_UMS_URL);

if (apiUrl === INVALID_OVERRIDE || authUrl === INVALID_OVERRIDE || umsUrl === INVALID_OVERRIDE) {
  configLogger.warn(/* … */);
  return undefined;
}
return { secretKey, secretWord, ...apiUrl, ...authUrl, ...umsUrl };
```

The new URL must join the refusal **inside** the check, not sit beside it. The comment at
`:134-142` explains why (a malformed override must disable the capability rather than
silently fall back to production Bound); extend it to say three URLs now straddle.

### 3. `config.class.ts` — swaps `:361-381`, bridge equivalent

Add `authUrl?: HttpUrl` with the same four decorators as `apiUrl`:
`@ValidateIf((o) => o.authUrl !== undefined)`, `@IsString()`, `@IsNotEmpty()`,
`@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })`.

**This is mandatory, not cosmetic.** `IsRadfiConfig` validates with
`forbidNonWhitelisted: true`, so an `authUrl` emitted by `buildRadfiConfig` without a
matching DTO field aborts the boot. The `@IsUrl` options must match the `isURL()` call in
`configuration.ts` exactly, or the two disagree about what is acceptable.

Note the deliberate use of `@ValidateIf(... !== undefined)` rather than `@IsOptional()`:
a present-but-`null` must be rejected, and a test pins that.

### 4. `sodax.provider.ts` — swaps `:49-73`, bridge equivalent

- destructure `authUrl` alongside `apiUrl` / `umsUrl`;
- widen the guard from `if (apiUrl || umsUrl)` to include `authUrl`;
- add `...(authUrl ? { authUrl } : {})` to the `radfi` merge object;
- update the boot WARN string, which names the env vars and is asserted by the specs.

The three-level spread already preserves a bitcoin `rpcUrl` set earlier; a third URL
slots in without structural change. The signer is untouched.

### 5. Env surface

Verified against `origin/development` — note the line numbers differ from those in
`#1215`, which were read off PR #1097's branch.

| File | Where |
| --- | --- |
| `.env-example` | `RADFI_*` at `:363-364`, secrets at `:354-355` |
| `apps/swaps-api/example.env.dev` | RADFI block |
| `apps/bridge-api/example.env.dev` | arrives with #1097 |
| `docker-compose.yml` | swaps service `:236-239`. **The bridge service block arrives with #1097** — on `development` only one service carries `RADFI_*` |
| `apps/swaps-api/README.md` | env doc block |
| `apps/bridge-api/README.md` | env table row |

No CI workflow, Caddyfile, Makefile, k8s or helm file references `RADFI_` — verified.
Coolify deployment secrets live outside the repo: **say so in the PR body**, because
`RADFI_AUTH_URL` has to exist there before Phase 2 can be run.

While in `apps/swaps-api/example.env.dev:19-21`, note it still claims the credential pair
is "REQUIRED … refuses to boot without both", contradicted by #1069 and by every other
doc. bridge-api's wording is already correct. Fixing it is a one-line drive-by; call it
out rather than silently changing it.

### 6. Specs

Add `RADFI_AUTH_URL` to the `ENV_KEYS` save/restore array (`radfi-config.spec.ts:95`,
both apps) — omit it and env state leaks across tests.

Mirror the existing case shapes:

- a valid value lands in the returned record with trailing slashes stripped;
- an `it.each` of the four malformed shapes (no scheme, typo'd scheme, non-http scheme,
  not a URL) each refuses the **whole** credential;
- one-of-three malformed refuses;
- unset is fine and yields no key;
- a `RadfiConfigClass` accept + reject-invalid pair;
- a provider test asserting `authUrl` lands on `chains.bitcoin.radfi` without clobbering
  the bitcoin `rpcUrl`;
- both `sodax.provider.spec.ts` WARN assertions updated in lockstep — they assert the
  var names the WARN string contains, so they fail if the string is not updated.

### No change needed

Log redaction. swaps-api drops `radfiConfig` wholesale via a destructure deny-list
(`config.service.ts:34-35`); bridge-api's `safeConfigForLog()` allowlist excludes it by
construction. The two apps use different mechanisms — real drift, but neither needs
touching.

## Phase 2 — flipping `authUrl`, later and separately

Not part of either PR. Recorded so the mechanism is not left dangling.

1. Set `RADFI_AUTH_URL=https://auth.bound.exchange/api` on **one** canary deployment.
2. Exercise Bitcoin sign-in end to end: BIP322 `POST /auth/authenticate` → the returned
   token shape → `POST /auth/refresh-token` → `POST /wallets` →
   `GET /wallets/details/:addr`.
3. If any 404s, or returns a token `radfi-be` will not accept, then
   `bound-authentication` does not yet serve the BIP322 plane. Unset the var — rollback
   is one env change, no release, no partner impact — and tell Bound.
4. Only once that passes: add `authUrl` to the packaged default in a normal SDK release,
   and update the chains-config test that currently asserts it is unset.

## Verification

### SDK, before pushing

- `pnpm i && pnpm build:packages` on the fresh branch, with `TURBO_CONCURRENCY=2` — the
  pre-commit hook runs a full build and can exhaust RAM.
- `pnpm --filter @sodax/sdk test` — the new host-routing cases are the point of the PR.
- `pnpm checkTs`.
- `node scripts/sync-docs-pages.mjs`, then confirm `docs-drift` is clean.
- Format only the files touched — `main` carries Biome drift and `pnpm pretty` will
  rewrite unrelated files.

### Backend, before pushing

- `pnpm install` immediately after the catalog bump.
- `pnpm --filter swaps-api test` and `--filter bridge-api test`, focused on
  `radfi-config.spec.ts` and `sodax.provider.spec.ts`.
- The `incident-manager` index test is flaky and can block a commit; re-run before
  treating it as a real failure.

### End to end — not possible from a laptop

Every `*.bound.exchange` `/api/*` path returns a fixed gate `403` to non-whitelisted
callers, on real and nonsense paths alike, with or without browser headers.
`/.well-known/jwks.json` is the sole exception and is what proved the hosts differ.

What this release actually needs, from a whitelisted environment (canary swaps-api) with
the real credential: a Bitcoin-source quote/intent, a wallet-details call, and a
balance/UTXO read — all against `svc.bound.exchange`, all behaving exactly as they do
today on `api.bound.exchange`. That is the whole test: a rename with no behaviour change.

`api.ums.bound.exchange` is the only host testable locally (`200` unauthenticated).

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| `auth.bound.exchange` does not serve the BIP322 plane | Unknown — unverifiable externally | Not defaulting `authUrl`. Phase 2 finds out on canary, with an env-var rollback |
| `svc.bound.exchange` is not in fact the same target group as `api` | Low — the JWKS probe returns byte-identical radfi-be 404s for both | Canary smoke test before the release is announced |
| Bound retires `api.bound.exchange` before consumers upgrade | Medium | They break loudly, and Bound is waiting on **our** timeline for the date |
| Consumer overrides `apiUrl` alone and straddles environments | Eliminated | `authUrl` absent from the packaged default |
| A partner's allowlist is per-hostname at Bound's gate | Unknown | Add to the Bound questions; canary smoke test would surface it |
| PR 2 conflicts with #1097 | Low, if sequenced | Do not branch off #1097; wait for the merge |
| Backend catalog bump breaks unrelated apps | Low | Single-copy catalog is enforced by design; run the full backend test suite |

## Ticket housekeeping

- Comment on `#425` with the Q1–Q4 answers, their sources, and the reproducible
  `curl --resolve` probe. State our timeline so Bound can set a deprecation date. **Post a
  comment — do not rewrite the body.**
- Note on `#426`: the changeset and `CONFIG_VERSION` lines are dropped, item 4 is a dead
  surface, the packaged default moves `apiUrl` only, and the shape exists twice.
- Note on `#1215`: bridge-api's config machinery arrives with #1097; the PR covers both
  apps in one pass afterwards; the cited line numbers are from that branch, not
  `development`.
- **Ask Bound**, and it matters more than the ticket assumed: does `auth.bound.exchange`
  serve BIP322 `POST /api/auth/authenticate`, `/api/auth/refresh-token` and the
  `/api/wallets/*` family **today**, or only after a later cutover? Are partner
  credentials and allowlists identical across `svc` and `auth`? Plus written confirmation
  of Q1/Q4 and the deprecation date.
- No new tracker issues. No `#nnn` refs in commit messages — link from the PR body.

## Open decisions for the reviewer

1. **CI host guard.** `.github/workflows/ci.yml:61-84` runs a `private-hosts` job that
   greps for one banned domain and is deliberately ungated so no diff can skip it. An
   analogous `api.bound.exchange` guard would stop the old host creeping back — but it
   should land only once the host is actually deprecated, or it blocks legitimate
   references. Decide either way and record it. If added, simulate the grep locally
   before every push in that PR: a text guard can match its own documentation.
2. **Observability.** `radfiFailureKind` (`apps/*/src/api/*/error-mapper.ts`)
   discriminates only `service-credential` (`apiSignature`) from `user-token` (`auth.`).
   A misrouted host returns the ALB's HTML `403`, which surfaces as
   `RadfiApiError: Bound Exchange returned a non-JSON response (HTTP 403)` and matches
   **neither** branch. Worth deciding whether a misroute deserves its own discriminator
   before Phase 2, since Phase 2 is exactly when a misroute becomes possible.
3. **Whitelabel timing.** Out of scope now, but it is the only live consumer that sets
   Bound URLs by hand and it is two minors behind. Decide when the SDK bump gets
   scheduled rather than discovering it at Bound's deprecation date.
