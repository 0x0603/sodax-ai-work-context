---
type: plan
repo: sodax-sdks
github: 425
status: Active
updated: 2026-09-08
---

# Evidence for the Bound svc/auth split plan

Companion to [`plan.md`](plan.md). Every claim there is cited here with the command that
produced it, so a reviewer can re-run rather than trust.

**Reading note.** All repo claims are stated against the **default branch**, not a
working tree. sodax-sdks default is `main`; sodax-backend default is `development`
(`main` points at the same commit `0dac3169`; there is no `develop`). Bound's `radfi-be`
default is `dev`, and the local clone at `~/Documents/GitHub/radfi-be` is stale at
`c1c1e06` (2026-08-18) — read current source through the API, not the clone.

Gathered 2026-09-08.

---

## 1. Bound's hosts — DNS

```bash
for h in api.bound.exchange svc.bound.exchange auth.bound.exchange \
         api.ums.bound.exchange svc.ums.bound.exchange auth.ums.bound.exchange ums.bound.exchange \
         signet.api.bound.exchange staging.api.bound.exchange \
         signet.svc.bound.exchange signet.auth.bound.exchange \
         staging.svc.bound.exchange staging.auth.bound.exchange \
         signet.api.ums.bound.exchange; do
  printf "%-34s " "$h"; dig +short "$h" | tr '\n' ' '; echo
done
```

| Host | Resolves to |
| --- | --- |
| `api.bound.exchange` | `prod-radfi-alb-ecs-419127908.us-east-1.elb.amazonaws.com` |
| `svc.bound.exchange` | same ALB |
| `auth.bound.exchange` | same ALB |
| `api.ums.bound.exchange` | `98.84.180.239` — **separate infra** |
| `svc.ums` / `auth.ums` / `ums.bound.exchange` | **NXDOMAIN** |
| `signet.api.bound.exchange` | `54.235.17.89` |
| `staging.api.bound.exchange` | `18.234.252.46` |
| `signet.svc` / `signet.auth` / `staging.svc` / `staging.auth` | **NXDOMAIN** |
| `signet.api.ums.bound.exchange` | `35.175.233.60` |

**Answers Q2** — UMS does not split; there is no `svc.ums` or `auth.ums`.
**Answers Q3** — no split hosts exist for signet or staging.

---

## 2. The hosts are NOT one backend — the decisive probe

Same-ALB DNS invites the inference "same backend". **It is false.** Pin one ALB IP and
vary only the `Host` header:

```bash
IP=3.215.246.204
for h in api.bound.exchange svc.bound.exchange auth.bound.exchange; do
  printf "%-24s -> " "$h"
  curl -s --max-time 8 --resolve "$h:443:$IP" "https://$h/.well-known/jwks.json" \
       -o /tmp/j -w "%{http_code}  "
  head -c 110 /tmp/j; echo
done
```

```
api.bound.exchange       -> 404  {"code":"404","message":"Cannot GET /.well-known/jwks.json","name":"NotFoundException",...
svc.bound.exchange       -> 404  {"code":"404","message":"Cannot GET /.well-known/jwks.json","name":"NotFoundException",...
auth.bound.exchange      -> 200  {"keys":[{"kty":"EC","crv":"P-256","x":"QxH9jJkrvFlz1R-0BLfpPJsJwZqHVB15hfbzQI_V5Lw",...
```

`radfi-be` sets `app.setGlobalPrefix('api')` (`src/main.ts:31`, dev HEAD), so it cannot
serve `/.well-known/*` — that 404 body is NestJS's own, i.e. radfi-be answering.

**Conclusion.** The ALB carries host-based listener rules to different target groups:

- `api.bound.exchange` → `radfi-be`
- `svc.bound.exchange` → `radfi-be` (byte-identical response ⇒ same target group)
- `auth.bound.exchange` → **a different service**, the ES256 issuer `bound-authentication`

This is why [`plan.md`](plan.md) moves `apiUrl` to svc but does **not** default `authUrl`.

### Nothing else can be learned from outside

```bash
IP=3.215.246.204
for p in /.well-known/openid-configuration /health /healthz /api / ; do
  for h in svc.bound.exchange auth.bound.exchange; do
    printf "%-24s %-38s -> " "$h" "$p"
    curl -s --max-time 8 --resolve "$h:443:$IP" "https://$h$p" -o /dev/null -w "%{http_code}\n"
  done
done
```

All `403`. `/api/*` paths likewise — real and nonsense alike, with or without a browser
`User-Agent` or `Origin`:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://svc.bound.exchange/api/sodax/transaction        # 403
curl -s -o /dev/null -w "%{http_code}\n" https://svc.bound.exchange/api/definitely-not-a-real-path # 403
curl -s -o /dev/null -w "%{http_code}\n" https://api.bound.exchange/api/transactions             # 403
```

`/.well-known/jwks.json` is the only unauthenticated path that reaches an application —
presumably an explicit ALB rule, since `radfi-be` must fetch that key set itself.

**So path-probing cannot answer Q1**, and it cannot tell us whether the auth host serves
BIP322. Only a call from a whitelisted environment with the real credential can.

### UMS is open

```bash
curl -s "https://api.ums.bound.exchange/api/utxos?address_eq=bc1qtest&isSpent_eq=false&isExpired_eq=true&page=1&pageSize=1"
# {"code":"1","message":"common.success","data":[],"metaData":{...}}
# Server: nginx/1.24.0 (Ubuntu), X-Powered-By: Express, Access-Control-Allow-Origin: *
```

Different stack from the ALB-fronted hosts, unauthenticated, `200`. Consistent with the
SDK's own comments that UMS takes no credential (`RadfiProvider.ts:302-303,417-418`).

---

## 3. Bound's backend source — `lydialabs/radfi-be`

Read via `gh api repos/lydialabs/radfi-be/contents/<path>?ref=dev | base64 -d`. Access is
via the `0x0603` token; the repo is private. See
`knowledge/external/bound-exchange-repos.md`.

### The split is already implemented upstream

```
c4663eb6  2026-08-25  feat: auth service split (#891)
71d44a0a  2026-09-07  fix(renew-utxo): stop double-subtracting satoshi of multi-rune utxos (#907)
```

PR #891 touched `src/guards/api-key.guard.ts`, `src/modules/auth/jwt.strategy.ts`
(+113), `jwt-auth.guard.ts`, `src/configs/app.config.ts`, `.env.example`, and added
`docs/api/*.md`.

### It is one monolith serving every prefix

`rg "@Controller\(['\"]"` across the tree returns 44 controllers, including:

| Prefix | File |
| --- | --- |
| `auth` | `src/modules/auth/auth.controller.ts:21` — `@Post('authenticate')` `:50`, `@Post('refresh-token')` `:74` |
| `wallets` | `src/modules/wallet/wallet.controller.ts:22` |
| `transactions` | `src/modules/transaction/transaction.controller.ts:33` |
| `sodax` | `src/partner/sodax/sodax.controller.ts:29` |
| `tokens` | `src/modules/token/token.controller.ts` |
| `which-first` | `src/modules/which-first/which-first.controller.ts` |

**Answers Q1** — `/transactions/*` is `radfi-be`'s, and `svc` reaches `radfi-be`.

### Two token issuers now coexist

`docs/authentication-guide.md` (dev HEAD):

| JWT header | Verified with | Issued by |
| --- | --- | --- |
| `kid` present, `alg: ES256` | key from the JWKS endpoint | `bound-authentication` |
| no `kid` | local `JWT_SECRET` (HS256) | `radfi-be` itself |

`src/modules/auth/auth.constant.ts` — `JWKS_ALG = 'ES256'` ("access tokens issued by
bound-authentication"), `LOCAL_JWT_ALG = 'HS256'` ("tokens this service still mints
itself"). `.env.example:200-204` adds `JWKS_URI`, `JWT_ISSUER=bound-authentication`.

So `bound-authentication` is the **email/keystore** plane. The BIP322 wallet login the
SDK uses is still `radfi-be`'s — but that is a statement about *code ownership*, not
about which host fronts it. **It does not prove the auth host serves BIP322.** That gap
is exactly what Phase 2 exists to close.

### Q4 — the HMAC guard

`src/app.module.ts:203-204` — the only `APP_GUARD` registrations:

```ts
{ provide: APP_GUARD, useClass: SodaxApiKeyGuard },
{ provide: APP_GUARD, useClass: SodaxRateLimitGuard },
```

`src/guards/sodax-api-key.guard.ts:27-31`:

```ts
const signature = request.headers['x-api-signature'];
if (!signature) {
  request.isSodaxPartner = false;
  return true;          // <- optional on every route
}
```

`src/guards/tx-rate-limit.guard.ts:36` — `if (req.isSodaxPartner === true) return true;`
But `TransactionRateLimitGuard` is **not** global: it is hand-applied on six controllers
(`sodax`, `transaction`, `etch`, `satflow`, `vm-transaction`, `refund`). Neither
`@Controller('auth')` nor `@Controller('wallets')` uses it — they carry `JwtAuthGuard`,
`RolesGuard`, `AccountEmailRateLimitGuard`.

`src/guards/sodax-rate-limit.guard.ts:32-34` — inverted: it is opt-**in** on the flag.

```ts
if (request.isSodaxPartner !== true) { return true; }   // unsigned = unlimited here
```

and when the flag is set it consumes from one shared bucket keyed
`SODAX_RATE_LIMIT_KEY = 'sodax-backend'` (`src/modules/cache/cache.constant.ts:31`).

**Therefore:** signing buys a bypass on svc, buys nothing on auth, and on auth actually
opts into the shared partner bucket. The plan keeps signing everywhere because that is
today's behaviour — not for a bypass. An earlier draft had this backwards; caught by the
adversarial audit and independently re-verified.

---

## 4. sodax-sdks — verified against `origin/main`

```bash
git -C sodax-sdks show origin/main:packages/types/src/sodax-config/sodax-config.ts | sed -n '41,47p'
git -C sodax-sdks show origin/main:packages/types/src/chains/chains.ts | sed -n '546,553p;863,869p'
git -C sodax-sdks show origin/main:packages/sdk/src/shared/entities/btc/RadfiProvider.ts | grep -n 'private async request\|this.config.apiUrl'
```

| Claim | Verified |
| --- | --- |
| `RadfiConfig` at `sodax-config.ts:41-47`, five required fields, no `authUrl` | ✅ |
| Inline duplicate at `chains.ts:546-553`, adds `walletMode?` | ✅ |
| Packaged default at `chains.ts:863-869`; `apiUrl` `:865`, `umsUrl` `:867` | ✅ |
| `request()` at `:650`; the `fetch` on `this.config.apiUrl` at `:657` | ✅ |
| Trailing-slash strip at `:145-152` | ✅ |
| `radfiApiUrl`/`radfiUmsUrl` (`common.ts:340-344`) read by nobody — `walletRpcConfig.ts` exports only `getEntryDefaults`, `getRpcUrl`, `resolveEvmDefaults` and reads only `rpcUrl`/`defaults` | ✅ |
| Zero tests assert which host a request reaches; the two signer assertions (`RadfiProvider.test.ts:213,228`) check `path`, not URL | ✅ |
| `CONFIG_VERSION` at `packages/types/src/index.ts:23`, never hand-edited (`AGENTS.md` §Rules, `RELEASE_INSTRUCTIONS.md:24,76`) | ✅ |
| `.github/workflows/docs-drift.yml` and `scripts/sync-docs-pages.mjs` exist; mapping at `scripts/docs-pages-map.json:124-128` | ✅ |
| `ApiConfig = BackendApiConfig \| CustomApiConfig` at `common/constants.ts:69-74` — the in-repo flat-or-split precedent | ✅ |
| `.github/workflows/ci.yml:61-84` runs an ungated `private-hosts` grep job | ✅ |

### The `.changeset` correction

The audit caught a wrong claim in an earlier draft.

```bash
git -C sodax-sdks ls-tree -r --name-only origin/main -- .changeset
# .changeset/add-lsoda-susds-vault.md
git -C sodax-sdks log origin/main --oneline -2 -- .changeset
# 0b8382ae feat: add lsodaUSDS vault (#387)
# 61d6cba3 refactor(release): replace changesets with a single pnpm release command (#407)
```

So: #407 removed changesets, #387 re-added one orphan file from a branch cut before it.
No `changeset` dependency in `package.json`, no CI reference. The directory exists; the
mechanism does not. **Do not write a changeset.**

> Method note: `git diff origin/main...HEAD` hides commits added to `main` after the
> branch point (it diffs from the merge base). That is how the earlier draft concluded
> `.changeset/` did not exist — the local branch really does lack it. Always
> `git ls-tree`/`git show` against the default branch ref.

### Branch state at time of writing

`sodax-sdks` is checked out on `chore/354-drop-private-iconblockchain-hosts`, which
differs from `origin/main` in 6 files, **none Radfi/Bound**. No branch or PR exists for
#425/#426.

---

## 5. sodax-backend — verified against `origin/development`

`development` and `main` are the same commit `0dac3169` (2026-09-06). There is no
`develop` branch.

### bridge-api's Radfi machinery is not there yet

```bash
git -C sodax-backend grep -in -E "radfi|RADFI_" origin/development -- apps/bridge-api
```

| Symbol | swaps-api on `development` | bridge-api on `development` |
| --- | --- | --- |
| `buildRadfiConfig` | ✅ `configuration.ts:125` | ❌ |
| `RadfiConfigClass` | ✅ `config.class.ts:361` | ❌ |
| `signRequest` (HMAC signer) | ✅ `sodax.provider.ts` | ❌ |
| `RADFI_*` in `example.env.dev` | ✅ | ❌ |
| `radfi-config.spec.ts` | ✅ | ❌ (file absent) |
| `assertBoundSignerForBitcoin` | ✅ | ❌ |
| `assertBoundAccessTokenForBitcoin` | ✅ | ✅ `bridge.service.ts:297` |

So bridge-api **does** have Bound code — the per-request user-token surface — but not the
backend-credential / base-URL machinery `#1215` wants to extend. That arrives with open
PR **#1097** (`feat/bridge-api-bound-auth-usdt-approve`, base `development`,
+1162/−31 across 26 files, `REVIEW_REQUIRED`), which touches **only** `apps/bridge-api`
plus shared env files — swaps-api is untouched by it.

**Consequence:** `#1215`'s line numbers were read off that branch and do not match
`development`. `.env-example` `RADFI_*` is at `:363-364` on `development` (not
`:305-306`), and `docker-compose.yml` has **one** service block with `RADFI_*`
(`:236-239`), not two.

### swaps-api specifics

`buildRadfiConfig` (`apps/swaps-api/src/config/configuration.ts:125-152`) reads exactly
four env vars, and refuses the **whole** credential if any supplied override is
malformed:

```ts
const apiUrl = radfiEndpointOverride('RADFI_API_URL', 'apiUrl', process.env.RADFI_API_URL);
const umsUrl = radfiEndpointOverride('RADFI_UMS_URL', 'umsUrl', process.env.RADFI_UMS_URL);
if (apiUrl === INVALID_OVERRIDE || umsUrl === INVALID_OVERRIDE) {
  configLogger.warn('Refusing the Bound credential because a supplied RADFI_* endpoint override is malformed — …');
  return undefined;
}
return { secretKey, secretWord, ...apiUrl, ...umsUrl };
```

The distinction is deliberate: `{}` = "not supplied, use the SDK default";
`INVALID_OVERRIDE` = "supplied but malformed". The comment at `:134-142` says why —
`apiUrl` and `umsUrl` must never straddle two environments. It never throws (#1069:
degrade, don't die).

`radfiEndpointOverride`'s signature is `field: 'apiUrl' | 'umsUrl'` (`:173`) — **the
union must be widened for `authUrl`.**

`RadfiConfigClass` (`config.class.ts:361-381`): `apiUrl`/`umsUrl` each carry
`@ValidateIf(... !== undefined)`, `@IsString()`, `@IsNotEmpty()`, `@IsUrl({require_tld:
false, require_protocol: true, protocols: ['http','https']})` — the same options as the
`isURL()` call above, deliberately coupled. `IsRadfiConfig` validates with
`forbidNonWhitelisted: true`, so **an undeclared field aborts the boot.**

`sodax.provider.ts:49-73` — the signer closure holds the credential and ignores its
`ctx`; the chains merge is a three-level spread that a third URL joins as one more
`...(authUrl ? { authUrl } : {})` term.

Redaction: swaps-api destructures `radfiConfig` out (`config.service.ts:34-35`);
bridge-api uses a `safeConfigForLog()` allowlist that excludes it by construction. Real
drift between the apps, but neither needs a change.

Specs: `ENV_KEYS` at `radfi-config.spec.ts:95` in both apps —
`['BOUND_API_SECRET_KEY','BOUND_API_SECRET_WORD','RADFI_API_URL','RADFI_UMS_URL']`.
Both `sodax.provider.spec.ts` assert the boot WARN string contains the var names.

### Dependency model

`pnpm-workspace.yaml` catalog: `@sodax/sdk: 2.2.0-rc.3`, `@sodax/types: 2.2.0-rc.3`.
Every v2 consumer declares `"@sodax/sdk": "catalog:"` — published npm, **not** a
workspace link (`pnpm-lock.yaml` resolves a registry tarball). The catalog comment
warns to keep it a single copy and to run
`pnpm --filter sodax-backend-dashboard gen:chains` after a `@sodax/types` bump.

`apps/api` separately pins `@sodax/types: 1.3.1-beta-rc1` to drive the v1 wire contract
via `SdkConfigV1ToV2Adapter`. That pin is deliberate and does not move with the catalog.

**This is why the SDK must ship first.** The published `RadfiConfig` today
(`node_modules/@sodax/types@2.2.0-rc.2/.../sodax-config.d.ts`) has no `authUrl`.

---

## 6. Consumers outside the two repos

### intents-whitelabel

- The only Bound URLs: `src/lib/rpc.ts:40-41`
  (`NEXT_PUBLIC_BOUND_API_URL`, `NEXT_PUBLIC_BOUND_UMS_URL`), mapped into
  `chains[bitcoin].radfi.{apiUrl,umsUrl}` at `src/lib/sodax-config.ts:25-27`.
- `src/providers/wallet-provider.tsx:51` also passes the raw `CHAIN_RPC` entry
  (`radfiApiUrl`/`radfiUmsUrl` keys) into the wallet SDK — **inert**, since nothing reads
  those keys.
- Pinned at `@sodax/* 2.0.0-rc.12`, exact, from npm. `authUrl` lands in `2.2.x`+, so
  adopting it is a two-minor bump — **not** the "one-line env change" `#425` claims.
- Neither env var appears in `.env`, `.env.example`, README, `CLAUDE.md`, or any deploy
  config. The only override path is a manually-set Vercel variable documented nowhere.
- Bitcoin is a selectable chain with the full Bound flow wired, but the repo describes it
  as runtime-untested.

### sodax-frontend

No Bound API config at all. Its only `bound.exchange` reference is a marketing link to
`app.bound.exchange` (`apps/web/components/holders/exchanges-bar.tsx:37`), unaffected.
Bitcoin is not connectable — the wallet modal has no BITCOIN group and
`lib/swaps-api-sign.ts:128` throws `sdk-gap` on it.

---

## 7. How this evidence was produced

Three parallel repo sweeps, direct probing of Bound's hosts and source, then a 21-agent
adversarial audit of the resulting plan (5 verification lenses → 8 findings put through
2 independent refuters each).

The audit changed two things in the plan: the Q4 rationale (§3) and the `.changeset`
claim (§4).

**One process caveat worth keeping.** The audit's single most important finding — the
host-based ALB routing in §2 — was *refuted* by both of its adversarial reviewers, on the
grounds that `/.well-known/jwks.json` is not a path the SDK calls. That objection is true
and beside the point: the probe was never about that path, it was a discriminator for
which backend answers. Re-running it by hand confirmed the original finding and
overturned both refutations. Agent verdicts are input, not authority — re-run the command
yourself when a conclusion is load-bearing.
