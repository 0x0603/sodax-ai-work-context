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
the **same backend** as `svc` (same `radfi-be` NestJS 404 shape on `/.well-known/jwks.json`),
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

Two new **optional** base URLs, the host declared at each call site, and — the load-bearing
part — **the packaged default carries `apiUrl` only.**

```ts
// packages/types/src/sodax-config/sodax-config.ts:41-47  (and the chains.ts duplicate)
export type RadfiConfig = {
  apiUrl: string;              // api host — /sodax/* on the packaged default
  authUrl?: string;            // auth — /auth/*, /wallets/*
  transactionsUrl?: string;    // radfi.co — /transactions/*
  apiKey: string;
  umsUrl: string;              // unchanged
  accessToken: string;
  refreshToken: string;
};
```

```ts
// packages/types — the packaged Bound host set, shipped as one literal
export const BOUND_HOSTS = {
  api:          'https://svc.bound.exchange/api',
  auth:         'https://auth.bound.exchange/api',
  transactions: 'https://api.radfi.co/api',
} as const;
```

```ts
// packages/sdk/src/shared/entities/btc/RadfiProvider.ts
export type RadfiHost = 'api' | 'auth' | 'transactions';

private readonly hosts: Record<RadfiHost, string>;

constructor(config: RadfiConfig, options?: RadfiProviderOptions) {
  // …existing token seeding…
  const api = stripTrailingSlash(config.apiUrl);
  const split = api === BOUND_HOSTS.api; // apiUrl is still the packaged svc host

  this.hosts = {
    api,
    auth:         stripTrailingSlash(config.authUrl)         ?? (split ? BOUND_HOSTS.auth         : api),
    transactions: stripTrailingSlash(config.transactionsUrl) ?? (split ? BOUND_HOSTS.transactions : api),
  };
}

// `host` is REQUIRED and first: every existing call fails to compile until it declares one.
private async request(host: RadfiHost, endpoint: string, options?: RequestInit) {
  const signed = this.signer ? await this.signer({ method: options?.method ?? 'GET', path: endpoint }) : undefined;
  return fetch(`${this.hosts[host]}${endpoint}`, { ...options, headers: { … } });
}
```

Call sites declare their own host — eleven of them, one word each:

```ts
await this.request('auth', '/auth/authenticate', { method: 'POST', … });
await this.request('auth', `/wallets/details/${userAddress}`, { method: 'GET' });
await this.request('api',  '/sodax/transaction', { method: 'POST', … });
await this.request('transactions', '/transactions/max-spent', { method: 'POST', … });
```

### Resolve once, then look up

One flat constant, one named boolean, one record. `request()` contains no decision at all —
`this.hosts[host]` is a lookup into something resolved once in the constructor.

`split` reads as the sentence it encodes: *if `apiUrl` is still the packaged svc host, use the
packaged companions; otherwise every family follows the host the consumer named.* Everything
the design needs falls out of that:

| `radfi.apiUrl` | `split` | auth | transactions |
| --- | --- | --- | --- |
| unset → packaged svc | true | `auth.bound.exchange` | `api.radfi.co` |
| `https://svc.bound.exchange/api` | true | `auth.bound.exchange` | `api.radfi.co` |
| `https://api.bound.exchange/api` (old) | false | old host | old host |
| signet / staging / a proxy | false | same as `apiUrl` | same as `apiUrl` |
| anything, with a companion set explicitly | — | the explicit value wins | |

Naming the svc host explicitly therefore *opts you into* the split, which is what makes the
whitelabel migration a single env line after its SDK bump.

An earlier revision keyed a nested `Record<string, {auth, transactions}>` by api host to avoid
the ternary. It bought a future signet host set at the cost of a second constant, a nesting
level and an `?.` — speculative for a table with one row. If Bound does split signet/staging
(asked, unanswered), turn `split` into that lookup then: an internal five-line change that
touches no caller.

**The `split` comparison is an exact string match** after the trailing-slash strip. A value
differing any other way — cased host, different path suffix — is `false` and falls to
single-host mode. That fallback is safe (no straddle is possible) but *silently un-migrated*,
so an operator typo reads as "nothing happened" rather than an error. Two things bound it:
the chains-config test pins the packaged default to `BOUND_HOSTS.api`, and the canary probe
in §Verification shows which host each family actually hit.

### Guard: warn when a resolved host is one Bound is retiring

Setting `apiUrl` to the old host is legal and stays legal — the migration window is open on
purpose. But it is currently *silent*, and `intents-whitelabel` lands there by accident:
`rpc.ts:40` has a literal fallback to `https://api.bound.exchange/api`, so after its SDK
bump it would sit on the dying host with no signal at all.

```ts
// packages/types — announced retirements, and where to go instead
export const DEPRECATED_BOUND_HOSTS: Record<string, string> = {
  'https://api.bound.exchange/api': BOUND_HOSTS.api,
};
```

```ts
// RadfiProvider constructor, after this.hosts is resolved
for (const url of new Set(Object.values(this.hosts))) {
  const replacement = DEPRECATED_BOUND_HOSTS[url];
  if (replacement) {
    this.logger.warn(
      `Bound is retiring ${url}. Point radfi.apiUrl at ${replacement} before the deprecation date.`,
    );
  }
}
```

Three decisions inside that:

- **Warn, do not throw.** Throwing would break consumers deliberately staying on the old
  host, which is exactly what `#426` asked us to preserve for a release. It becomes a throw
  in a later release once Bound sets a date — a one-line change, recorded as a follow-up
  rather than done now.
- **Deduplicate on the URL, not the host key.** An `apiUrl` set to the old host resolves all
  three hosts to it; without the `Set` that is three identical warnings per provider.
- **Only known-deprecated hosts warn.** An `apiUrl` that simply misses the companion table —
  signet, staging, a proxy — is legitimate and must stay quiet, so "not in the table" is not
  a warning condition. Announced retirement is the only signal specific enough to act on.

Route it through the SDK logger rather than `console`: add `logger` to `RadfiProviderOptions`
(whose JSDoc already says it exists so the next runtime dependency is not a third positional
argument) and pass `config.logger` from `BitcoinSpokeService.ts:94`. That also gives
consumers a way to silence it. `RadfiProvider` currently reaches for bare `console.warn`
(`:202`) and `console.error` (`:338`); converting those two is a tidy-up for a different PR.

Maintenance is a data edit, not a code edit: if Bound moves `/transactions/*` again, change
one string in `BOUND_HOSTS`.

This also removes the config-mutation landmine for the URL fields: the trailing-slash strip
now feeds `this.hosts` instead of writing back into `this.config.apiUrl` (`:145-152`), which
today mutates the packaged `spokeChainConfig` singleton that `deepMerge` shallow-copied.
`umsUrl` keeps its current handling to keep the diff scoped — a follow-up, not this PR.

### Why the host is declared, not derived

An earlier revision routed by matching the path — first a prefix table, then a
first-segment map. Both work, and both are the wrong shape for this problem.

A path→host map is a **derivation**: a second source of truth that has to be kept in sync
with the call sites. Declaring the host at the call site is a **statement of fact** — there
is nothing to keep in sync, and nothing to match.

Concretely, declaration wins on four counts:

| | path matching | host declared at call site |
| --- | --- | --- |
| A new call left without a host | silent fall-through to `apiUrl`; needs a test to catch | **does not compile** |
| `/wallets-export`-style collisions | needs segment-aware matching to avoid | not a category that exists |
| Path with a query string | needs `split(/[/?#]/)` care | irrelevant |
| Reading `withdrawToUser()` | must cross-reference the map | the host is on the line |

The first row is the one that matters. Path matching leaves exactly one hole — an unmatched
segment falls through to `apiUrl` silently, and `/sodax/*` *relies* on that fall-through, so
it cannot be made fail-closed. A required `host` parameter closes it at **compile time**,
which is strictly stronger than the exhaustiveness test the map version needed.

It also dissolves a landmine this plan has been carrying: `/api/wallets/balance` lives on
the UMS host and is safe today only because `getBalance` bypasses `request()`. Under path
matching, a refactor routing it through `request()` would silently send it to the auth host.
Under declaration the refactorer must name a host, and there is no `'ums'` member — so the
mistake surfaces immediately.

Cost: eleven call sites gain one argument, and moving a family later means editing the
affected sites rather than one map entry. Both are acceptable — arguably the second is a
feature, since a family move *should* appear in the diff at every call it changes.
`request()` is `private` and has no caller outside the class, so this is an internal change
with no public API impact.

### Why the default carries `apiUrl` only

An earlier draft put all three hosts in the packaged `chains.ts` default and called the
resulting straddle an accepted risk. **That was wrong, and it silently falsified the
plan's own fallback claims.** `deepMerge`
(`packages/sdk/src/shared/utils/deepMerge.ts:12-35`) merges plain objects key by key, so a
consumer — or the backend — overriding only `radfi.apiUrl` would *keep* the packaged
mainnet `authUrl` and `transactionsUrl`. Every "falls back unchanged" statement about the
old host, signet, staging and the backend was therefore false.

Keeping the companions out of the merged config removes the hazard **by construction**
rather than by documentation:

| Consumer does | Result |
| --- | --- |
| nothing (packaged default) | `apiUrl` = svc; companions resolve to auth + radfi.co. Full four-host routing |
| sets `apiUrl` = `api.bound.exchange` (old host) | every family goes there, matching today's host behaviour |
| sets `apiUrl` = signet / staging / a proxy | every family follows it. No cross-environment split is possible |
| sets `apiUrl` **and** the companions | honoured exactly as given |

There is nothing left to leak, so no runtime guard, no comparison heuristic, and no
"override all or none" doc contract are needed. This also makes the backend safe with a
single `RADFI_API_URL` — see PR 2 §2.

### Packaged default

```ts
// packages/types/src/chains/chains.ts:863-869
radfi: {
  walletMode: 'TRADING',
  apiUrl: BOUND_HOSTS.api,   // https://svc.bound.exchange/api
  // authUrl / transactionsUrl are deliberately NOT set here. They are resolved from
  // BOUND_HOSTS in RadfiProvider, so a partial override cannot inherit a mainnet
  // companion host. See "Why the default carries apiUrl only".
  apiKey: '',
  umsUrl: 'https://api.ums.bound.exchange/api',
  accessToken: '',
  refreshToken: '',
},
```

Other properties of this shape:

- **The companion table stays internal.** No consumer-facing routing table; the public
  surface stays at the explicit URL fields callers already understand.
- **Optional in both type copies** (`sodax-config.ts:41-47` and the inline duplicate at
  `chains.ts:546-553`), so nothing hand-constructing either shape breaks. Strictly additive.
- **Naming.** `transactionsUrl` over `txUrl` — inside a `RadfiConfig` where every field is
  RadFi's, naming the *path family* is the only unambiguous option. Reviewer may prefer
  `txUrl`; pick one and pin it in the docs.
- Precedent for flat-or-split host config: `ApiConfig = BackendApiConfig | CustomApiConfig`
  (`packages/types/src/common/constants.ts:69-74`).

### Signing does not change

`request()` changes only which base URL it prefixes. Bound confirms auth methods are
unchanged. See §Q4 for why the original rationale for this was wrong even though the
conclusion holds.

## Breaking changes

**Type surface: none.** Both new fields are optional, nothing is renamed or removed, and
neither type copy changes an existing member. Anything constructing a `RadfiConfig` or a
`BitcoinSpokeChainConfig` today still compiles.

**Runtime: two real vectors, both on upgrade.** The packaged default changes, so a
consumer who bumps `@sodax/*` and relies on defaults moves hosts. That is the intended
migration, but it is a behaviour change and must be prominent in the release notes.

### 1. New hostnames — CSP `connect-src`, egress and proxy allowlists

Every host in the mapping is new except UMS. What breaks depends on how a consumer wrote
their allowlist:

| Allowlist shape | svc | auth | api.radfi.co | Net effect |
| --- | --- | --- | --- | --- |
| `https://api.bound.exchange` (exact host) | blocked | blocked | blocked | **everything Bitcoin breaks** |
| `https://*.bound.exchange` (wildcard) | ok | ok | **blocked** | withdraw + renew-utxo break |
| no CSP / no allowlist | ok | ok | ok | nothing breaks |

The exact-host row is the severe one and it is not exotic — a CSP naming one API host is a
normal thing to write. The wildcard row is the one `api.radfi.co` introduces on its own,
because it is a different *registrable domain*, not a subdomain.

Concretely, the wildcard row blocks exactly these five calls, all browser-side:
`withdrawToUser`, `signAndBroadcastWithdraw`, `buildRenewUtxoTransaction`,
`signAndBroadcastRenewUtxo`, `getMaxWithdrawable` — i.e. **BTC withdrawal and UTXO renewal**.
Swaps and sign-in survive. The exact-host row takes those too.

The same reasoning applies to corporate egress rules and any server-side proxy allowlist.
**Put this at the top of the release notes**, with both rows spelled out — it is the only
failure mode a consumer cannot diagnose from our types or our errors.

### 2. CORS on `api.radfi.co`

Same three calls, same reason: a different origin from the browser's point of view. If
Bound's origin allowlist on `api.radfi.co` does not match `api.bound.exchange`, BTC
withdrawal breaks for every consumer on the new default. Untestable from outside — see
§Risks. This is not our bug, but it is our outage.

### 3. The partial-override straddle — eliminated, not accepted

An earlier draft listed this as the third vector and accepted it. With the companion hosts
out of the packaged default (§Why the default carries `apiUrl` only) it cannot occur: a
consumer overriding `radfi.apiUrl` alone has no packaged `authUrl`/`transactionsUrl` to
inherit, so every family follows the host they named. Recorded here because the earlier
plan shipped the opposite claim, and a reviewer comparing revisions should see why it moved.

### Consumers who stay on an old SDK

Unaffected. Nothing we publish reaches them — their bundled `@sodax/types` still carries
`apiUrl: 'https://api.bound.exchange/api'` and the single-host `request()`. They keep
working until **Bound** retires that host, which is Bound's event, not this release's.
`intents-whitelabel` (pinned `2.0.0-rc.12`) is in this group today.

Worth noting for their eventual upgrade: because an `apiUrl` that is not `BOUND_HOSTS.api`
sends every family to itself, upgrading changes nothing for them
until they *also* point `apiUrl` at the packaged svc host — at which point the companions
switch on and they are fully migrated. So after the SDK bump their migration really is the
one env line `#425` claimed; the ticket was only wrong that no bump was needed.

### Not breaking

These are now true by construction, not by convention:

- **Any consumer who sets `radfi.apiUrl` explicitly** keeps working exactly as on the old
  SDK: an `apiUrl` other than `BOUND_HOSTS.api` resolves all three hosts to itself,
  which is precisely the old single-host behaviour. That covers the old host, signet,
  staging, proxies and the backend. This is `#426`'s "keep `apiUrl` working for one
  release", obtained for free.
- **signet / staging** consumers: no `svc.`/`auth.` hosts exist there, they set `apiUrl`
  alone, and every family follows it.
- **The backend**: sets its URLs by env and calls two endpoints. `RADFI_AUTH_URL` is
  additive; `RADFI_API_URL` alone is safe.
- **Type surface**: additive optional fields only.

### Version semantics

Additive types plus a default-host change. Under this repo's lockstep versioning that is a
minor, not a major — but the release notes carry the weight, because the risky part is a
*default* moving, not an API changing. The CSP item above is the one that deserves the
changelog headline: it is the only failure a consumer cannot diagnose from our types.

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
3. `svc.bound.exchange` serves `/sodax/*` — and, as a fallback check, answers the other
   families if a companion must be withheld.

| Step 0 result | What ships |
| --- | --- |
| all three hosts serve their families | the full plan, `BOUND_HOSTS` as written |
| a companion host returns `ROUTE ABSENT`, and the same family is `route present` on `[SVC]` | point that `BOUND_HOSTS` entry at `BOUND_HOSTS.api` — the family then resolves to svc. Tell Bound |
| a companion host returns `ROUTE ABSENT`, and `[SVC]` is absent too | block the migration for that family. Do not silently point it at svc; ask Bound, or consciously keep the old host if product accepts that temporary dependency |

The runtime routing shape does not change between outcomes: no `if`, no `switch`, no route
matcher. Step 0 only decides the three values in `BOUND_HOSTS`.

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
(`sodax-config.ts:41-47`) and to the inline duplicate (`chains.ts:546-553`). Both optional.

Export `BOUND_HOSTS` and `DEPRECATED_BOUND_HOSTS` from `@sodax/types`. `BOUND_HOSTS` is the
single place the packaged host set lives; keeping it out of the `chains.ts` default is what
stops a partial override inheriting a companion. Document that intent where it is defined,
not only here.

### 2. Routing — `RadfiProvider.ts`

Add `BOUND_HOSTS` to `@sodax/types`, resolve `this.hosts` in
the constructor per §Design, then change `request()` (`:650`) to take `host` as a
**required first parameter** and prefix with `this.hosts[host]` at `:657`. Fold the `apiUrl` trailing-slash strip (`:145-152`) into that
resolution rather than writing back into `this.config`; add an optional-strip helper for
`authUrl` and `transactionsUrl`; leave the `umsUrl` strip as it is.

Making it required and first is the point: all eleven `this.request(...)` call sites stop
compiling until each declares its host, so the compiler — not a test — enforces that every
call is routed. Declare them per §Endpoint inventory: `'auth'` for the two `/auth/*` and two
`/wallets*` calls, `'transactions'` for the five `/transactions*` calls, `'api'` for the two
`/sodax/*` calls. Leave `getBalance` (`:310`) and `getExpiredUtxos` (`:431`) alone — they
bypass `request()` and build from `umsUrl`, and there is deliberately no `'ums'` host member.
Extend the constructor's trailing-slash strip (`:145-152`) to both new fields, following the
optional shape already used for `umsUrl`. Keep signing semantics unchanged; using an
optional signer call is fine if the request body is already being touched for routing.

**Pre-existing hazard, partially cleaned here:** the constructor does `this.config = config`
then writes back into `this.config.apiUrl` / `this.config.umsUrl`, mutating the caller's
object — the packaged `spokeChainConfig` singleton, since `deepMerge` shallow-copies
untouched branches. This PR should stop mutating `apiUrl` because the host map needs the
stripped value anyway. Do not extend the mutation pattern to `authUrl` or `transactionsUrl`;
they feed `explicitHosts` only. Leave the existing `umsUrl` write-back scoped out and note it
in the PR body so a reviewer does not read it as new.

### 3. Packaged default — `chains.ts:863-869`

Change exactly one value: `apiUrl` → `BOUND_HOSTS.api`. **Do not add `authUrl` or
`transactionsUrl` here** — that is the whole point of §Why the default carries `apiUrl` only.
Leave `umsUrl`. Add a comment saying the companions are resolved in `RadfiProvider` and why,
so the next reader does not "helpfully" inline them.

Step 0 gates the *values* in `BOUND_HOSTS`: if a companion host does not serve its family,
point that entry at `BOUND_HOSTS.api` only after the `[SVC]` rows prove the same family is
present there. Otherwise block that family and tell Bound.

### 4. Stale JSDoc

`sodax-config.ts:78,88,119` and `RadfiProvider.ts:123,130` say the signer runs on "each
outbound `apiUrl` request". Reword to name all three routed hosts and state UMS stays unsigned.

### 5. Tests

Currently **zero** coverage that a request reaches the right host — the two existing signer
assertions (`RadfiProvider.test.ts:213,228`) check the `path` handed to the signer, not the
URL fetched, so they stay green through a total misroute.

In `RadfiProvider.test.ts`:

- **packaged `apiUrl`, companions unset** — `/auth/*` and `/wallets*` → the table's `auth`;
  `/transactions*` → `.transactions`; `/sodax/*` → `.api`. This is the shipped default;
- **`apiUrl` overridden, companions unset** — *all nine* go to the overridden host. This is
  the anti-straddle test and the most important case in the file. Cover it with the old host
  (`https://api.bound.exchange/api`) and with a signet host;
- **companions set explicitly** — honoured, including alongside an overridden `apiUrl`;
- **per-host resolution** — `this.hosts.auth` and `this.hosts.transactions` resolve to the
  explicit field, else the packaged companion, else `apiUrl`; `this.hosts.api` is `apiUrl`;
- the signer fires on every routed host;
- `getBalance` / `getExpiredUtxos` still bypass `request()`, hit `umsUrl`, stay unsigned —
  this is what pins `/wallets/balance` on the UMS host;
- trailing slashes stripped on all three fields, and a trailing-slash `apiUrl` still still makes `split` true (the strip runs before the comparison);
- an **unknown** `apiUrl` resolves all three hosts to it — the anti-straddle property, and
  the row that fails if someone reintroduces a packaged companion;
- **the retirement guard** — `apiUrl` set to `https://api.bound.exchange/api` warns **once**,
  names the replacement, and still routes (no throw); signet / staging / a proxy warn **not
  at all**; an injected logger receives it instead of `console`.

Plus a chains-config test asserting the packaged default sets **only** `apiUrl` — it fails
loudly if someone inlines the companions and reintroduces the straddle.

No exhaustiveness test is needed: with `host` required on `request()`, an unrouted call does
not compile.

`baseConfig` (`RadfiProvider.test.ts:9-15`) is typed `: RadfiConfig`; the fields are
optional, so no existing construction site needs touching.

### 6. Docs

Edit the source only — `packages/sdk/docs/BITCOIN_INTEGRATION.md:11,62-63` — then
`node scripts/sync-docs-pages.mjs` regenerates `docs/developers/how-to/bitcoin-integration.md`
(mapping at `scripts/docs-pages-map.json:124-128`). Editing the `docs/` copy alone fails
`.github/workflows/docs-drift.yml`. Document two things: that overriding `radfi.apiUrl`
moves **every** family to that host unless the companions are set explicitly, and that the
default set now includes `api.radfi.co`, a different registrable domain — relevant to
anyone with a CSP `connect-src` or an egress allowlist written against `*.bound.exchange`.

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

Two notes:

- **`RADFI_AUTH_URL` is optional, and omitting it is safe.** The refusal above is
  all-or-nothing over *malformedness*, not over *presence* — a supplied `RADFI_API_URL` with
  no `RADFI_AUTH_URL` simply omits the field. That would have straddled under the earlier
  design; under §Why the default carries `apiUrl` only it resolves to the supplied `apiUrl`,
  or to the packaged companion when `apiUrl` is still the packaged mainnet host. Setting it
  explicitly in production is still recommended for legibility, and it is the escape hatch
  if Bound ever needs the auth host to differ.
- `RADFI_UMS_URL` already configures a host the backend never calls (verified:
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
| A companion host does not serve its family | Step 0 measures each independently; point that `BOUND_HOSTS` entry at `.api` only if `[SVC]` proves the same family is present there. Otherwise block and tell Bound |
| ~~Consumer overrides `apiUrl` alone and straddles~~ | **Eliminated by design** — the packaged default carries no companion hosts, so there is nothing to inherit. Pinned by a chains-config test and the anti-straddle routing tests |
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

1. **Field naming.** `transactionsUrl` vs `txUrl`. Pick one, pin it in the docs.
2. **CI host guard.** `.github/workflows/ci.yml:61-84` runs an ungated `private-hosts` grep.
   An `api.bound.exchange` guard would stop the old host creeping back, but should land only
   once it is deprecated. If added, simulate the grep locally before every push in that PR —
   a text guard can match its own documentation.
3. **Observability.** `radfiFailureKind` (`apps/*/src/api/*/error-mapper.ts`) discriminates
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
