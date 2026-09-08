---
type: plan
repo: sodax-sdks
github: 425
status: Active
updated: 2026-09-08
related_issues: [gh-330-bound-exchange-endpoint-inventory, gh-1024-bound-auth-email-provider]
related_decisions: []
---

# Plan — Bound Exchange domain split

Parent `icon-project/sodax-sdks#425`. Sub-issues: `sodax-sdks#426` (SDK),
`sodax-backend#1215` (swaps-api + bridge-api).

**Probe: [`artifacts/probe-bound-hosts.sh`](artifacts/probe-bound-hosts.sh) · Evidence: §Appendix**

## Goal

Migrate off `api.bound.exchange` in one pass. Bound completed the mapping on 2026-09-08,
so every endpoint we call now has a named host — **and the answer is four hosts, not two.**

## The mapping, complete

Bound's final message. `api.bound.exchange` is the only domain being deprecated.

| Host | Endpoints | Status |
| --- | --- | --- |
| `svc.bound.exchange` | `/api/sodax/*` | new |
| `auth.bound.exchange` | `/api/auth/*`, `/api/wallets/*` | new |
| `api.radfi.co` | `/api/transactions/*` | **existing legacy domain, new to us** |
| `api.ums.bound.exchange` | `/api/wallets/balance`, `/api/utxos` | unchanged |
| `api.bound.exchange` | — | **deprecated, date TBD** |

The `/api/transactions/*` answer is the surprise. Bound is retiring the newer brand host
and routing that family back to the older RadFi domain. Verified: `api.radfi.co` reaches
the **same backend** as `svc` (identical `radfi-be` NestJS 404 on `/.well-known/jwks.json`),
on the same ALB, under its own `*.radfi.co` certificate. Technically consistent — but see
§Risks: it looks transitional, and we do not want to migrate this family twice.

Our config therefore goes from **2 base URLs to 4**.

## Endpoint inventory

Verified exhaustively against `origin/main`: every Bound HTTP call in the workspace lives
in `RadfiProvider.ts` — 13 call sites over 11 endpoints. Nothing else in `packages/` calls
Bound; `sodax-backend` and `intents-whitelabel` reach it only through the SDK.
`apps/node/src/bitcoin-radfi.ts` hand-builds 6 of the same paths with raw `fetch`, a subset.

### Backend — swaps-api + bridge-api, identical

Two endpoints, two hosts. Server-to-server, HMAC `x-api-signature`.

| Endpoint | Line | SDK path | New host |
| --- | ---: | --- | --- |
| `GET /api/wallets/details/{address}` | 288 | `getEffectiveWalletAddress` → `getTradingWallet` (`SwapService.ts:1255`, `BridgeService.ts:782`) | **auth** |
| `POST /api/sodax/transaction` | 353 | `BitcoinSpokeService.deposit` TRADING mode (`:459`) | **svc** |

The backend never reaches `/api/transactions/*` or UMS. Both apps pin `raw: true`, and
`deposit()` returns at `:470-472` **before** `requestRadfiSignature` — the backend builds
the PSBT, the client signs it. Confirmed by grep: `radfi`, `signAndSubmitRawTransaction`,
`getTradingWalletAddress`, `encodeWithdrawalData` all appear **0 times** in `apps/*/src`.

### Client — dapp-kit in the browser, user JWT

Nine endpoints, three hosts.

| Endpoint | Line | Used for | New host |
| --- | ---: | --- | --- |
| `POST /api/auth/authenticate` | 225 | BIP322 sign-in | **auth** |
| `POST /api/auth/refresh-token` | 248 | renew token | **auth** |
| `POST /api/wallets` | 271 | create trading wallet *(no in-repo caller)* | **auth** |
| `POST /api/sodax/transaction/sign` | 395 | co-sign + submit swap | **svc** |
| `POST /api/transactions` | 452, 517 | withdraw BTC · renew-utxo | **radfi.co** |
| `POST /api/transactions/sign` | 482, 543 | co-sign + broadcast | **radfi.co** |
| `POST /api/transactions/max-spent` | 583 | max withdrawable | **radfi.co** |
| `GET /api/wallets/balance` | 310 | trading balance | ums |
| `GET /api/utxos` | 429 | expired UTXOs | ums |

**The entire four-host burden falls on the browser.** Callers:
`useRadfiAuth`, `useRadfiSession`, `useRadfiWithdraw`, `useRenewUtxos`,
`useTradingWalletBalance`, `useExpiredUtxos` — and through them, `intents-whitelabel`.

### `/api/wallets/balance` is not captured by the `/wallets` prefix

It lives on the UMS host and does not appear anywhere in `radfi-be`'s OpenAPI spec, so
`/api/wallets/* → auth` cannot cover it. In the SDK this is safe by accident, not design:
`getBalance` (`:306-310`) and `getExpiredUtxos` (`:424-429`) bypass `request()` and build
from `umsUrl` directly. **A refactor routing either through `request()` would silently move
it to the auth host.** A test pins this — PR 1 §5.

### Two different `transactions`

| Path | Host | Do we call it? |
| --- | --- | --- |
| `/api/sodax/transactions` (+ `/{txId}/status`) | svc | no |
| `/api/transactions` (+ `/sign`, `/max-spent`) | **radfi.co** | yes, 5 call sites |

Different controllers, different hosts. Reading "`/api/sodax/*` → svc" as covering our
`/transactions` calls is the easy mistake.

## Design

Two new **optional** base URLs, each falling back to `apiUrl`, and an internal prefix table.

```ts
// packages/types/src/sodax-config/sodax-config.ts:41-47  (and the chains.ts duplicate)
export type RadfiConfig = {
  apiUrl: string;              // svc — /sodax/* and anything unrouted
  authUrl?: string;            // auth — /auth/*, /wallets/*
  transactionsUrl?: string;    // radfi.co — /transactions/*
  apiKey: string;
  umsUrl: string;              // unchanged
  accessToken: string;
  refreshToken: string;
};
```

```ts
// packages/sdk/src/shared/entities/btc/RadfiProvider.ts — internal, not consumer-configurable
/** Bound serves these prefixes from hosts other than `apiUrl` after the domain split. */
const HOST_PREFIXES = [
  { prefixes: ['/auth/', '/wallets'], pick: (c: RadfiConfig) => c.authUrl },
  { prefixes: ['/transactions'],      pick: (c: RadfiConfig) => c.transactionsUrl },
] as const;

private baseUrlFor(endpoint: string): string {
  const route = HOST_PREFIXES.find((r) => r.prefixes.some((p) => endpoint.startsWith(p)));
  return route?.pick(this.config) ?? this.config.apiUrl;
}
```

Why this shape:

- **Optional + fallback keeps every awkward case free.** Omit both and behaviour is
  byte-identical to today. That is what signet/staging need — no `svc.`/`auth.` hosts
  exist for those environments — and what lets a partner stay on the old host for a
  release.
- **The prefix table stays internal.** No consumer-facing routing config; nobody is asking
  for one and it would be API surface for a hypothetical caller.
- **Optional in both type copies** (`sodax-config.ts:41-47` and the inline duplicate at
  `chains.ts:546-553`), so nothing hand-constructing either shape breaks. Strictly additive.
- **Naming.** `transactionsUrl` over `txUrl` — inside a `RadfiConfig` where every field is
  RadFi's, naming the *path family* is the only unambiguous option. Reviewer may prefer
  `txUrl` for symmetry with `apiUrl`/`authUrl`/`umsUrl`; either is fine, pick one and pin
  it in the docs.
- Precedent for flat-or-split host config: `ApiConfig = BackendApiConfig | CustomApiConfig`
  (`packages/types/src/common/constants.ts:69-74`).

### Packaged default

```ts
// packages/types/src/chains/chains.ts:863-869
radfi: {
  walletMode: 'TRADING',
  apiUrl: 'https://svc.bound.exchange/api',
  authUrl: 'https://auth.bound.exchange/api',            // gated on Step 0
  transactionsUrl: 'https://api.radfi.co/api',           // gated on Step 0
  apiKey: '',
  umsUrl: 'https://api.ums.bound.exchange/api',
  accessToken: '',
  refreshToken: '',
},
```

### Accepted risk — the override straddle

With four hosts in the default, a consumer overriding **only** `radfi.apiUrl` keeps the
packaged mainnet `authUrl` and `transactionsUrl`, because `deepMerge`
(`packages/sdk/src/shared/utils/deepMerge.ts:12-35`) merges plain objects key by key.
Their traffic then straddles environments, silently.

This is a new hazard — today one URL means overriding it moves everything — and four hosts
make it worse than the two-host version. Accepted, with three mitigations:

1. **The backend cannot straddle** — `buildRadfiConfig`'s all-or-nothing refusal extends to
   every `RADFI_*` override it accepts.
2. **Docs state the contract**: override all of them or none.
3. **A chains-config test** pins the packaged hosts as one environment set.

Exposed set: `intents-whitelabel` (out of scope, and on an SDK old enough to have no new
fields to inherit) plus any partner pinning `apiUrl` by hand. See §Open decisions for a
runtime guard we deliberately did not build.

### Signing does not change

`request()` changes only which base URL it prefixes. Bound confirms auth methods are
unchanged. See §Q4 for why the original rationale for this was wrong even though the
conclusion holds.

## Breaking changes

**Type surface: none.** Both new fields are optional, nothing is renamed or removed, and
neither type copy changes an existing member. Anything constructing a `RadfiConfig` or a
`BitcoinSpokeChainConfig` today still compiles.

**Runtime: three real vectors, all on upgrade.** The packaged default changes, so a
consumer who bumps `@sodax/*` and relies on defaults moves hosts. That is the intended
migration, but it is a behaviour change and must be prominent in the release notes.

### 1. `api.radfi.co` is a new registrable domain — CSP and egress allowlists

The sharpest one, and it only appeared with the four-host mapping. `svc.` and `auth.` are
subdomains of `bound.exchange`, so a consumer whose CSP says
`connect-src https://*.bound.exchange` keeps working. **`api.radfi.co` does not match
that.** Same for corporate egress allowlists and any proxy rule written against the
`bound.exchange` domain.

The three affected calls are all browser calls — BTC withdraw, renew-utxo, max-spent — so
the failure lands on end users, not on our servers, and it fails as a blocked request
rather than a clean error. **Call this out at the top of the release notes**, not in a
migration appendix.

### 2. CORS on `api.radfi.co`

Same three calls, same reason: a different origin from the browser's point of view. If
Bound's origin allowlist on `api.radfi.co` does not match `api.bound.exchange`, BTC
withdrawal breaks for every consumer on the new default. Untestable from outside — see
§Risks. This is not our bug, but it is our outage.

### 3. Partial overrides silently straddle

A consumer who overrides **only** `radfi.apiUrl` — pointing at a proxy, signet, or their
own gateway — used to move *all* their Bound traffic with that one value. After this
change they keep the packaged `authUrl` and `transactionsUrl`, so auth and transaction
traffic goes to Bound production while `/sodax/*` goes to their host. Silent, and worse
with four hosts than it would have been with two.

Mitigations are in §Accepted risk. The consumer-visible half is the docs contract: **set
all four or none.**

### Not breaking

- Consumers who explicitly pin `radfi.apiUrl` to `https://api.bound.exchange/api` keep
  working unchanged until Bound retires it — the fallback sends every family to that one
  host, exactly as today. This is what `#426` asked for as "keep `apiUrl` working for one
  release", and the design gets it for free rather than as extra work.
- signet/staging consumers: no `svc.`/`auth.` hosts exist there, they set `apiUrl` alone,
  and the fallback preserves today's behaviour.
- The backend: it sets its own URLs by env and calls two endpoints. `RADFI_AUTH_URL` is
  additive, and an unset value falls back.

### Version semantics

Additive types plus a default-host change. Under this repo's lockstep versioning that is a
minor, not a major — but the release notes carry the weight, because the risky part is a
*default* moving, not an API changing. Reviewer should decide whether the CSP item alone
justifies calling it out as breaking in the changelog headline.

## Step 0 — measure before writing code (blocking)

Run [`artifacts/probe-bound-hosts.sh`](artifacts/probe-bound-hosts.sh) **from a whitelisted
environment** (canary swaps-api's host). Every `/api/*` path answers a gate `403` from
anywhere else, so a laptop run tells you nothing — the script says so when it detects that.

It sends deliberately invalid bodies and reads the reply shape: `404 "Cannot POST …"` means
the route is not served on that host, `400/401` with a JSON app error means it is. No valid
payload is ever sent, so nothing is created, signed or broadcast.

Now that the mapping is complete, Step 0 confirms **three** things:

1. `auth.bound.exchange` serves the four `/auth/*` + `/wallets/*` routes.
2. `api.radfi.co` serves the three `/transactions/*` routes.
3. `svc.bound.exchange` serves `/sodax/*` — and, as a fallback check, still answers the
   other families while the old host lives.

| Step 0 result | What ships |
| --- | --- |
| all three hosts serve their families | the full plan. Both new defaults set |
| a host returns `ROUTE ABSENT` for its family | ship everything **except** that host's default value; the family falls back to `apiUrl`, where it is served today. Tell Bound |

Either branch is a complete, shippable pass — the fallback is the same code with one
config value withheld.

## What recon settled

Reproduction in §Appendix.

| # | Question | Answer |
| --- | --- | --- |
| Q1 | Where do `/api/transactions/*` go? | **`api.radfi.co`** — answered by Bound 2026-09-08. Same backend as svc, own certificate |
| Q2 | Does UMS split? | No — `svc.ums` / `auth.ums` / `ums.bound.exchange` are NXDOMAIN; confirmed by Bound |
| Q3 | Testnet/staging hosts? | None exist — `signet.svc`, `signet.auth`, `staging.svc`, `staging.auth` are NXDOMAIN. **Still unanswered by Bound: does the `api.bound.exchange` deprecation cover `signet.api.` and `staging.api.`?** |
| Q4 | Is HMAC svc-only? | Neither — the signature is optional everywhere. See below |

### Q4, stated correctly

An earlier draft had this backwards. `SodaxApiKeyGuard` is the one global `APP_GUARD`
(`radfi-be/src/app.module.ts:203`) and a missing `x-api-signature` means "not a partner,
proceed". What signing buys differs by host:

- **On svc** it buys a real bypass — `TransactionRateLimitGuard` is hand-applied on six
  controllers (`sodax`, `transaction`, `etch`, `satflow`, `vm-transaction`, `refund`) and
  its `isSodaxPartner === true` early return (`tx-rate-limit.guard.ts:36`) is the bypass.
- **On auth it buys nothing** — neither `@Controller('auth')` nor `@Controller('wallets')`
  applies that guard. A signature instead opts the request into the global
  `SodaxRateLimitGuard`, inert for non-partners (`sodax-rate-limit.guard.ts:32-34`) and
  otherwise drawing from one shared bucket keyed `SODAX_RATE_LIMIT_KEY = 'sodax-backend'`
  (`cache.constant.ts:31`).

**Keep signing every host**, because it is byte-identical to today's behaviour — not
because it buys a bypass. Watch-items for ops: auth-host chatter shares the partner budget
with `/sodax/transaction`, and a *signed* request hard-fails `partnerDisabled` if Bound
flips `setting.enabled`/`partnerAuth.isActive` off, where an unsigned one would still work.

## Corrections the tickets need

1. **`#426` item 4 is a dead surface.** `BitcoinRpcConfig.radfiApiUrl` / `radfiUmsUrl`
   (`common.ts:340-344`) is described as read by wallet-sdk-react. It is read by **nobody**
   — `walletRpcConfig.ts` reads only `rpcUrl` and `defaults`. Skip it.
2. **Do not write a changeset.** PR #407 replaced changesets with `pnpm release`; PR #387
   left one orphan file (`.changeset/add-lsoda-susds-vault.md`) from a branch cut before it.
   Nothing consumes it.
3. **Never hand-edit `CONFIG_VERSION`** — `packages/types/AGENTS.md` §Rules and
   `RELEASE_INSTRUCTIONS.md:24,76`. `scripts/bump-versions.sh` owns it.
4. **The radfi shape exists twice** and `#426` names one. Both need the two new fields.
5. **`#1215`'s "swaps-api and bridge-api are mirrors" is not true yet.** On
   `origin/development` bridge-api has only the per-request token surface; `buildRadfiConfig`,
   `RadfiConfigClass`, the signer, `RADFI_*` env and `radfi-config.spec.ts` arrive with open
   PR #1097. `development` and `main` are the same commit; there is no `develop`.
6. **`#425`'s "whitelabel is a one-line env change" is wrong** — it pins `@sodax/* 2.0.0-rc.12`.
7. **"only the domain moves" understates it** — it is now a two-host split *plus* a third
   host on a different registrable domain.

## Sequencing

```
Step 0  probe from canary  ─────────────────────► gates everything below
   │
   ├── PR 1  sodax-sdks     ──► SDK release ──┐
   │                                          │
   └── PR 2  sodax-backend  ─── coded in parallel against a locally-linked SDK,
                                merged after the release with the catalog bump
```

PR 2 does not wait idle. Develop it against the local SDK build with a temporary
`pnpm.overrides` entry in `sodax-backend`'s root `package.json` (the block exists at
`package.json:9-16`):

```jsonc
"pnpm": {
  "overrides": {
    "@sodax/sdk":   "file:../sodax-sdks/packages/sdk",
    "@sodax/types": "file:../sodax-sdks/packages/types"
  }
}
```

Build the SDK first (`pnpm build:packages`) so the `dist/` exists, then `pnpm install` in
the backend. **Revert the override before committing** — replace it with the catalog bump.
Check `git diff origin/development -- package.json` before every push on that branch.

PR #1097 is not on the critical path: it will have merged before the SDK release lands.

---

## PR 1 — sodax-sdks (`#426`)

Branch off `main`: `feat/426-bound-svc-auth-hosts`.

### 1. Type — both copies

Add `authUrl?: string` and `transactionsUrl?: string` to `RadfiConfig`
(`sodax-config.ts:41-47`) and to the inline duplicate (`chains.ts:546-553`). Both optional,
each documented as falling back to `apiUrl`.

### 2. Routing — `RadfiProvider.ts`

Add the `HOST_PREFIXES` table and `baseUrlFor()` from §Design. At `:657` replace
`` `${this.config.apiUrl}${endpoint}` `` with `` `${this.baseUrlFor(endpoint)}${endpoint}` ``.
Extend the constructor's trailing-slash strip (`:145-152`) to both new fields, following the
optional shape already used for `umsUrl`. Leave the signer block (`:653-656`) alone.

**Pre-existing hazard, do not fix here:** the constructor does `this.config = config` then
writes back into `this.config.apiUrl`, mutating the caller's object — the packaged
`spokeChainConfig` singleton, since `deepMerge` shallow-copies untouched branches. The new
fields follow the same pattern. Note it in the PR body so a reviewer does not read it as new.

### 3. Packaged default — `chains.ts:863-869`

Set `apiUrl` → svc, `authUrl` → auth, `transactionsUrl` → `https://api.radfi.co/api`.
Leave `umsUrl`. **Each of the two new values is conditional on its Step 0 row** — omit any
that came back `ROUTE ABSENT` and comment why, so the next reader does not "fix" it.

### 4. Stale JSDoc

`sodax-config.ts:78,88,119` and `RadfiProvider.ts:123,130` say the signer runs on "each
outbound `apiUrl` request". Reword to name all three routed hosts and state UMS stays unsigned.

### 5. Tests

Currently **zero** coverage that a request reaches the right host — the two existing signer
assertions (`RadfiProvider.test.ts:213,228`) check the `path` handed to the signer, not the
URL fetched, so they stay green through a total misroute.

In `RadfiProvider.test.ts`:

- **all three routed hosts set** — `/auth/authenticate`, `/auth/refresh-token`, `/wallets`,
  `/wallets/details/:addr` → `authUrl`; `/transactions`, `/transactions/sign`,
  `/transactions/max-spent` → `transactionsUrl`; `/sodax/transaction`,
  `/sodax/transaction/sign` → `apiUrl`;
- **each optional field omitted independently** — that family falls back to `apiUrl` while
  the others keep their host. Three cases; this is what pins the Step-0 fallback branch;
- **both omitted** — all nine hit `apiUrl`, byte-identical to today;
- the signer fires on every routed host;
- `getBalance` / `getExpiredUtxos` still bypass `request()`, hit `umsUrl`, stay unsigned —
  this is what pins `/wallets/balance` out of the `/wallets` prefix;
- trailing slashes stripped on both new fields.

Plus a chains-config test pinning the packaged hosts as one environment set.

`baseConfig` (`RadfiProvider.test.ts:9-15`) is typed `: RadfiConfig`; the fields are
optional, so no existing construction site needs touching.

### 6. Docs

Edit the source only — `packages/sdk/docs/BITCOIN_INTEGRATION.md:11,62-63` — then
`node scripts/sync-docs-pages.mjs` regenerates `docs/developers/how-to/bitcoin-integration.md`
(mapping at `scripts/docs-pages-map.json:124-128`). Editing the `docs/` copy alone fails
`.github/workflows/docs-drift.yml`. Document the override contract: all hosts or none, and
that `api.radfi.co` is a different registrable domain — relevant to anyone with a CSP or
egress allowlist.

### 7. apps/node — leave the URLs alone

`bitcoin-radfi.ts:18-23` and `btc.ts:52,54` hardcode signet/staging hosts and bypass
`RadfiProvider` with raw `fetch`. No split hosts exist for those environments.
`bitcoin-raw-intent-check.ts:102` gates a diagnostic logger on
`url.includes('bound.exchange')` — **note this now misses `api.radfi.co`**, so the logger
goes quiet for `/transactions/*`. One-word fix if anyone still uses that script; out of
scope otherwise (`apps/node` is excluded from `checkTs` and `btc.ts:51-55` is already broken).

### Do not touch

`common.ts` `radfiApiUrl`/`radfiUmsUrl` (dead), `CONFIG_VERSION` (release script), and the
three browser demo apps — their `radfi*` keys sit on `SodaxWalletConfig` and are never read.

## Release

`pnpm release` per `packages/RELEASE_INSTRUCTIONS.md`:

1. merge PR 1 into `main`;
2. `git checkout release && git fetch origin --tags && git pull --ff-only origin release &&
   git pull --no-ff origin main` — a stale `release` reuses the previous `CONFIG_VERSION`;
3. `pnpm release` — sets every manifest, increments `CONFIG_VERSION` once, writes gitignored
   `release-notes.md`. Commits nothing;
4. inspect, `git add packages/`, `git commit -m "chore: release @sdks@<version>"`, push;
5. `gh release create "@sdks@<version>" …` — the tag triggers `sdks-publish.yml`.

## PR 2 — sodax-backend (`#1215`)

Branch off `development` after #1097 merges: `feat/1215-radfi-auth-url`. Every edit applies
**twice** — swaps-api and bridge-api.

**Scope shrank.** The backend calls exactly two endpoints, on **svc** and **auth**. It never
touches `/api/transactions/*` or UMS. So it needs **one** new override, `RADFI_AUTH_URL` —
**not** a transactions override for a call it does not make.

### 1. Catalog bump

`pnpm-workspace.yaml`: `@sodax/sdk` and `@sodax/types` to the new release. Then
`pnpm install`, then `pnpm --filter sodax-backend-dashboard gen:chains`. Remove the local
`pnpm.overrides` first. Leave `apps/api`'s own `@sodax/types: 1.3.1-beta-rc1` pin alone.

### 2. `configuration.ts` — swaps `:125-185`

`radfiEndpointOverride`'s `field` parameter is typed `'apiUrl' | 'umsUrl'` (`:173`).
**Widen the union to include `'authUrl'`** — a compile error, easy to miss.

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

The new URL joins the refusal **inside** the check. Extend the comment at `:134-142` to say
three URLs now straddle.

Note `RADFI_UMS_URL` already configures a host the backend never calls (verified:
`BitcoinSpokeService` has zero UMS references). Harmless and correct — leave it.

### 3. `config.class.ts` — swaps `:361-381`

`authUrl?: HttpUrl` with the same four decorators as `apiUrl`:
`@ValidateIf((o) => o.authUrl !== undefined)`, `@IsString()`, `@IsNotEmpty()`,
`@IsUrl({ require_tld: false, require_protocol: true, protocols: ['http','https'] })`.

Mandatory: `IsRadfiConfig` validates with `forbidNonWhitelisted: true`, so an undeclared
field aborts the boot. The `@IsUrl` options must match the `isURL()` call in
`configuration.ts` exactly. Use `@ValidateIf(… !== undefined)`, not `@IsOptional()` — a
present-but-`null` must be rejected, and a test pins that.

### 4. `sodax.provider.ts` — swaps `:49-73`

Destructure `authUrl`; widen `if (apiUrl || umsUrl)`; add `...(authUrl ? { authUrl } : {})`
to the radfi merge; update the boot WARN string, whose var names the specs assert.

### 5. Env surface

Verified against `origin/development` — these differ from the line numbers in `#1215`,
which were read off PR #1097's branch.

| File | Where |
| --- | --- |
| `.env-example` | `RADFI_*` at `:363-364`, secrets at `:354-355` |
| `apps/swaps-api/example.env.dev` | RADFI block |
| `apps/bridge-api/example.env.dev` | arrives with #1097 |
| `docker-compose.yml` | swaps service `:236-239`; the bridge block arrives with #1097 |
| `apps/swaps-api/README.md`, `apps/bridge-api/README.md` | env doc block / table row |

No CI workflow, Caddyfile, Makefile, k8s or helm file references `RADFI_`. Coolify secrets
live outside the repo — **say so in the PR body**.

`apps/swaps-api/example.env.dev:19-21` still claims the credential pair is "REQUIRED …
refuses to boot without both", contradicted by #1069. Call it out rather than silently changing it.

### 6. Specs

Add `RADFI_AUTH_URL` to `ENV_KEYS` (`radfi-config.spec.ts:95`, both apps) or env state leaks
across tests. Mirror the existing case shapes: valid value lands with slashes stripped; four
malformed shapes each refuse the whole credential; one-of-three malformed refuses; unset is
fine; DTO accept + reject-invalid pair; a provider test asserting it lands on
`chains.bitcoin.radfi` without clobbering the bitcoin `rpcUrl`; both `sodax.provider.spec.ts`
WARN assertions updated in lockstep.

### No change needed

Log redaction: swaps-api drops `radfiConfig` wholesale (`config.service.ts:34-35`),
bridge-api's `safeConfigForLog()` allowlist excludes it by construction.

## Out of scope

- **intents-whitelabel** — pinned at `@sodax/* 2.0.0-rc.12`, two minors behind. It is the
  only live consumer of `useRadfiWithdraw`, so **BTC withdrawal is the first thing that
  breaks** when the old host dies. Schedule its SDK bump against the deprecation date.
- **sodax-frontend** — no Bound config; Bitcoin is not connectable there.
- `apps/node`, the browser demo apps, `common.ts` `radfiApiUrl`/`radfiUmsUrl`.

## Verification

### SDK, before pushing
- `pnpm i && pnpm build:packages` on the fresh branch, `TURBO_CONCURRENCY=2`.
- `pnpm --filter @sodax/sdk test` — the host-routing cases are the point of the PR.
- `pnpm checkTs`.
- `node scripts/sync-docs-pages.mjs`, then confirm `docs-drift` is clean.
- Format only the files touched — `main` carries Biome drift.

### Backend, before pushing
- Confirm `pnpm.overrides` is gone: `git diff origin/development -- package.json`.
- `pnpm install` immediately after the catalog bump.
- `pnpm --filter swaps-api test` / `--filter bridge-api test`.
- The `incident-manager` index test is flaky; re-run before treating it as real.

### End to end, on canary
1. Re-run `probe-bound-hosts.sh` after PR 2 deploys.
2. A Bitcoin-source quote/intent → `/sodax/*` on svc, `/wallets/details` on auth.
3. **From a browser**, not curl: Bitcoin sign-in, then a BTC withdraw → exercises
   `/auth/*` on auth and `/transactions/*` on `api.radfi.co`. This is the CORS test; see §Risks.
4. A balance/UTXO read → UMS untouched.

## Risks

| Risk | Mitigation |
| --- | --- |
| **CORS on `api.radfi.co`.** All three `/transactions/*` are browser calls with a user JWT, and `api.radfi.co` is a *different registrable domain*. Our own code records that radfi.co URLs once stopped answering and broke Bound sign-in (`intents-whitelabel/src/lib/rpc.ts:38-39`). Preflight cannot be tested from outside — all hosts gate `OPTIONS` with 403 | Ask Bound to confirm the origin allowlist matches `api.bound.exchange`. Test from a real browser on canary, step 3 above. **This is the highest-severity item in the plan** |
| **`api.radfi.co` may itself be deprecated later.** Bound is retiring the newer brand host and sending this family to the older one — that reads as transitional | Ask before shipping. If it is transitional, consider leaving `transactionsUrl` unset and letting `/transactions/*` fall back to `apiUrl` until the destination is stable |
| A host does not serve its family | Step 0 measures each independently; ship without that one default |
| Consumer overrides `apiUrl` alone and straddles | Backend all-or-nothing; docs; chains-config test. Accepted |
| The local `pnpm.overrides` reaches a PR | Pre-push diff check, called out in §Sequencing and §Verification |
| `signet.`/`staging.` deprecated with no replacement | Unanswered by Bound — asked |
| Whitelabel breaks first when the old host dies | Schedule its SDK bump against the deprecation date |
| PR 2 conflicts with #1097 | Do not branch off it; wait for the merge |

## Reply to Bound — outstanding items

The mapping is complete; these three remain.

> Thanks, that completes the mapping. Three follow-ups before we lock a date:
>
> 1. Is `api.radfi.co` on the same deprecation path, or is it staying? We'd rather not
>    migrate `/api/transactions/*` twice.
> 2. All three `/api/transactions/*` calls run from the browser with a user JWT, so we need
>    `api.radfi.co` to allow our dApp origins via CORS. We have a note in our own code that
>    radfi.co URLs stopped answering for us at some point and broke Bound sign-in —
>    presumably an allowlist change. Could you confirm the origin allowlist on
>    `api.radfi.co` matches `api.bound.exchange` today?
> 3. Our examples use `signet.api.bound.exchange` and `staging.api.bound.exchange`. Does the
>    `api.bound.exchange` deprecation cover those, and is there a `svc.`/`auth.` equivalent
>    planned? We don't see one in DNS.
>
> On timeline: our SDK ships to npm, so consumers upgrade on their own schedule — that
> adoption window, not our release, is what determines when `api.bound.exchange` can go
> dark. Rather than a fixed date now, could you tell us the **minimum notice** you can give
> between the final endpoint list and the shutdown? We'd rather size our window to that.

## Ticket housekeeping

- Comment on `#425` with the completed four-host mapping and the timeline. **Comment — do
  not rewrite the body.**
- Note on `#426`: the changeset and `CONFIG_VERSION` lines are dropped, item 4 is a dead
  surface, the shape exists twice, and there are now **two** new fields, not one.
- Note on `#1215`: bridge-api's machinery arrives with #1097; the PR needs only
  `RADFI_AUTH_URL`, since the backend never calls `/api/transactions/*`.
- No new tracker issues. No `#nnn` refs in commit messages.

## Open decisions for the reviewer

1. **A runtime straddle guard.** The packaged hosts are exported constants, so
   `RadfiProvider` could detect "`apiUrl` overridden but the others still packaged values"
   and fall back. Three lines, fail-safe, no new config surface — deliberately not built,
   because it silently overrides a consumer who genuinely wants that combination. Four hosts
   make the straddle likelier than two did; worth re-deciding.
2. **Field naming.** `transactionsUrl` vs `txUrl`. Pick one, pin it in the docs.
3. **CI host guard.** `.github/workflows/ci.yml:61-84` runs an ungated `private-hosts` grep.
   An `api.bound.exchange` guard would stop the old host creeping back, but should land only
   once it is deprecated. If added, simulate the grep locally before every push in that PR —
   a text guard can match its own documentation.
4. **Observability.** `radfiFailureKind` (`apps/*/src/api/*/error-mapper.ts`) discriminates
   only `service-credential` from `user-token`. A misrouted host returns the ALB's HTML
   `403`, surfacing as `RadfiApiError: … non-JSON response (HTTP 403)` and matching neither.

## Appendix — evidence, and how to re-run it

Everything below was measured, not assumed. Re-run any of it before trusting a claim.

**Method.** Verify against the **default branch**, never the working tree.
sodax-sdks is `main`; sodax-backend is `development` (`main` is the same commit
`0dac3169`; there is no `develop`); Bound's `radfi-be` is `dev`, and the local clone at
`~/Documents/GitHub/radfi-be` is stale at `c1c1e06` (2026-08-18) — read current source via
`gh api repos/lydialabs/radfi-be/contents/<path>?ref=dev | base64 -d`.
Do not use `git diff main...HEAD`: the three-dot form diffs from the merge base and hides
everything `main` gained after the branch point.

### The hosts are not one backend

DNS puts `api`, `svc`, `auth` and `api.radfi.co` on one ALB
(`prod-radfi-alb-ecs-419127908.us-east-1.elb.amazonaws.com`). That does **not** make them
one backend. Pin an IP and vary only the `Host` header:

```bash
IP=3.215.246.204
for h in api.radfi.co api.bound.exchange svc.bound.exchange auth.bound.exchange; do
  printf "%-24s " "$h"
  curl -s --resolve "$h:443:$IP" "https://$h/.well-known/jwks.json" -w " %{http_code}\n" | head -c 90
done
```

| Host | `/.well-known/jwks.json` | Backend |
| --- | --- | --- |
| `api.radfi.co` | `404` NestJS | `radfi-be` |
| `api.bound.exchange` | `404` NestJS | `radfi-be` |
| `svc.bound.exchange` | `404` NestJS | `radfi-be` |
| `auth.bound.exchange` | **`200`** ES256 key set | **a different service** |

`radfi-be` sets `app.setGlobalPrefix('api')` (`src/main.ts:31`), so it cannot serve
`/.well-known/*` — that 404 is `radfi-be` answering. This is what proves `api.radfi.co`
and `svc` share a backend while `auth` does not.

`/.well-known/jwks.json` is the **only** unauthenticated path that gets through. `/`,
`/api`, `/health`, `/healthz` and every `/api/*` route return a gate `403` from outside,
with or without browser headers — which is also why CORS cannot be tested from here.

### DNS

```bash
for h in api.ums.bound.exchange svc.ums.bound.exchange auth.ums.bound.exchange \
         signet.svc.bound.exchange signet.auth.bound.exchange \
         staging.svc.bound.exchange staging.auth.bound.exchange; do
  printf "%-30s " "$h"; dig +short "$h" | tr '\n' ' '; echo
done
```

- `svc.ums`, `auth.ums`, `ums.bound.exchange` → **NXDOMAIN**. UMS does not split, and
  `api.ums` is separate infra (nginx/Express, own IP) answering `200` unauthenticated.
- `signet.svc`, `signet.auth`, `staging.svc`, `staging.auth` → **NXDOMAIN**. No split hosts
  exist for testnet/staging; `signet.api.` and `staging.api.` still resolve.
- `api.radfi.co` carries its own `*.radfi.co` certificate — a different registrable domain,
  which is what makes the CSP item in §Breaking changes real.

### Bound's source — `lydialabs/radfi-be` at `dev`

- One monolith owns every prefix we call: `@Controller('auth')` (`auth.controller.ts:21`,
  `authenticate` `:50`, `refresh-token` `:74`), `('wallets')` (`wallet.controller.ts:22`),
  `('transactions')` (`transaction.controller.ts:33`), `('sodax')`
  (`partner/sodax/sodax.controller.ts:29`).
- `SodaxApiKeyGuard` is the only global `APP_GUARD` (`app.module.ts:203`) and a missing
  `x-api-signature` means "not a partner, proceed" (`sodax-api-key.guard.ts:27-31`).
- `TransactionRateLimitGuard` is **not** global — hand-applied on six controllers, none of
  them `auth` or `wallets`. `SodaxRateLimitGuard` is opt-**in** on the partner flag
  (`sodax-rate-limit.guard.ts:32-34`) and draws from one shared bucket
  (`cache.constant.ts:31`). That is the basis for §Q4.
- `docs/swagger/openapi-bound.yaml` lists 130 paths and declares one server,
  `https://api.bound.exchange`. It is auto-generated and last regenerated **2026-07-03** —
  before the auth-service split and before the domain-split announcement. A route
  inventory, not evidence about hosts.

### Our side

- Every Bound HTTP call in the workspace is in `RadfiProvider.ts`: 13 call sites, 11
  endpoints. `packages/` has no other caller; `sodax-backend` and `intents-whitelabel`
  reach Bound only through the SDK.
- `apps/node/src/bitcoin-radfi.ts` hand-builds 6 of the same paths with raw `fetch`
  (`:214, :283, :374, :479, :539, :648, :748`) — a subset, no new endpoints.
  `btc.ts:125` is the relayer, not Bound; `bitcoin-raw-intent-check.ts:102` is a logger
  predicate.
- `api.radfi.co` appears in **no** repo as an endpoint — only in a comment at
  `intents-whitelabel/src/lib/rpc.ts:38-39` claiming the radfi.co URLs "no longer answer".
  Measurably they do; that was almost certainly an allowlist change, and it is the reason
  the CORS risk is not hypothetical.
- `.changeset/` still exists on `origin/main` with one orphan file
  (`add-lsoda-susds-vault.md`) — PR #407 removed changesets, PR #387 re-added it from a
  branch cut before that. Nothing consumes it.
