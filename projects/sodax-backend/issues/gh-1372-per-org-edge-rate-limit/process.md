---
type: process
repo: sodax-backend
github: 1372
updated: 2026-10-20
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

- 2026-10-20 — read the issue, api-auth, api-auth-client, the gateway repo; probed the live edge;
  wrote the plan. No code yet. Code read at sodax-backend `origin/development` 985959e9 (2026-10-08)
  and sodax-unified-api `development` 0db34ec4 (2026-10-05).

## Findings

Tags: V = verified (command or file:line), D = derived.

1. **HAProxy config lives in `icon-project/sodax-unified-api`** (private, owner FidelVe),
   `gateway-configs/haproxy/haproxy.cfg`, HAProxy 2.8 (CI pins `haproxy:2.8`). Deployed by a
   root systemd agent per gateway that pulls its branch every ~1 min, runs `haproxy -c`, installs,
   reloads, health-checks, rolls back. (V)
2. **Per-IP edge limiting already shipped** in `fe_edge` (#128 2026-10-04, #129, #132 2026-10-05).
   Key = CF-Connecting-IP (else src), IPv6 grouped by /64. Tables `st_rl_rate` (>300/10s),
   `st_rl_write` (POST submit-tx|intents/submit >120/60s), `st_rl_jail` (>1500/10s -> 10 min,
   gpc0), `st_rl_portal` (>3000/10s). sc0 = rate|portal, sc1 = write, sc2 = jail. This is the
   "general per-IP limit" the issue means. (V)
3. **Three gateways, not one, no `peers`.** gateway-a/b on `master` (prod), gateway-c on `canary`
   (100% canary-api + 10% api.sodax.com), behind a Cloudflare LB. Counters are per gateway and
   cleared on every reload (= every deploy). (V, design doc v1.3.1 §4.1, §6.2)
4. **The issue reverses two written decisions.** Gateway design doc §4.1: "Business limits per
   route or per API key stay in the apps. This layer is flood protection only."
   `docs/api-authentication.md` "Not in scope": "HAProxy-level enforcement". The api-auth
   architecture diagram even draws "Redis ← per-key rate limit" inside the app. (V)
5. **No limit number exists anywhere.** `TIERS = ['pro']` (shared-enums `api-scopes.ts:77`);
   `tenants.limits` defaults `{}` and nothing reads it (`git grep` for `limits.x` / `limits[`
   found no consumer); the dashboard deliberately does not expose `limits`
   (`apps/sodax-backend-dashboard/lib/server/api-auth-client.ts:137`). (V)
6. **Keyset side is ready.** `auth.sodax.com` is public (DNS-only, Caddy TLS); `/healthz` 200,
   `/v1/keyset` 401 without a token (probed). Bearer token; `API_AUTH_VERIFIER_TOKENS` is a list,
   each >= 32 chars, so the gateway can get its own rotatable token. Entry: `keyHash` (sha256 hex
   lowercase, `keys.service.ts:22`), `orgId`, `orgStatus`, `tier`, `limits`. Suspended orgs ARE
   included with `orgStatus: 'suspended'`. ETag/304 supported. (V)
7. **Canary api-auth is internal only** (`API_AUTH_URL=http://api-auth:3012` over the Coolify
   network, `.env-example:956`), so gateway-c cannot fetch the canary keyset. (V)
8. **App guard takes the FIRST `x-api-key` and trims** (`api-auth-client/src/api-key.guard.ts:25`).
   HAProxy `req.hdr()` defaults to the LAST occurrence -> must use `req.hdr(x-api-key,1)`. (V)
9. **Client keyset parsing is not strict** (no schema validation in `keyset-snapshot.service.ts`;
   `prefix` was added the same additive way, `types.ts:52`) — a new keyset field is safe. (V)
10. Out of scope: edge 429 bodies end in a literal `\n` (`lf-string` does not interpret it). Note in
    the gateway PR, do not open an issue.

## Live edge probe (2026-10-20, egress 116.111.185.106)

Method: GETs to `/zz-probe-1372`, an unmatched path answered by `be_404` at the gateway (never
reaches an origin), `curl --parallel --parallel-max 32 --http2`. Kept under the 1500/10s jail.

| Host | Sent | 404 (passed) | 429 | First 429 | Elapsed |
| --- | ---: | ---: | ---: | ---: | ---: |
| canary-api.sodax.com (gateway-c only) | 400 | 300 | 100 | #296 (parallel) | 6.7s |
| api.sodax.com (gateway a/b/c) | 900 | 609 | 291 | #599 | 14.2s |

- canary: exactly the configured 300/10s; 429 body `{"ok":false,"error":"rate_limited"}\n`,
  `Retry-After: 10`. (V)
- prod: ~2x the cap -> one client is spread over >= 2 gateways. (V for the numbers; D for ">= 2
  gateways" — the run exceeded 10s, so some decay inflates the count slightly.)
- A random `x-api-key` changes nothing today (gateway never reads it outside CORS). (V)

Consequence: a per-org counter per gateway gives an org ~2x its budget on prod.

Clean re-run (same day, `--parallel-max 96`, inside the 10s window): 590/900 in 4.2s and 600/900
in 4.0s -> exactly 2 x 300. (V) The design doc says gateway-c takes 10% of prod; no third counter
showed up, so either that weight is not live or this client never lands on gateway-c. (D)

## Re-verification of the questions for Paul (2026-10-20)

- Deployed config = what was read: `haproxy.cfg` blob `7906a9e1` is identical on `development`,
  `canary` and `master` of sodax-unified-api. No `peers` section. (V)
- #1372: still assigned to paulrouge, no activity since 2026-10-05, no branch or PR in either repo. (V)
- Paul built api-auth (#1048 control plane, #1104 verification, #1165 tier-gated scopes) — he owns
  the keyset/tier side. Gateway scripts: Fidel + Roshan (0xrpj). (V, git log)
- #1371 thread: Paul wrote "Check whether HAProxy already limits at the edge before adding app
  guards" and closed it with "@FidelVe updated the haproxy config to fix this" -> Paul leans edge. (V)
- Gateway #128 (Fidel): "Does not replace the app-level per-route/per-API-key throttling in
  sodax-backend". No gateway issue exists for per-org limits. (V)
- Legacy tiers ('default', 'enterprise', 'partner_pro') were collapsed into 'pro' by migration
  `0002_backfill_legacy_tier_to_pro.sql`. `limits` reaches `request.apiKeyPrincipal.limits`
  (`api-key.guard.ts:90`) but controllers use only `orgId`/`keyId` (`swaps.controller.ts`,
  `leverage-yield.controller.ts`). (V)
- App throttle 10/60s per IP, in-memory per deployment, still applies to keyed callers on
  submit-tx: `swaps.controller.ts:584`, `leverage-yield.controller.ts:537`,
  `bridge.controller.ts:207`. An org budget at the edge does not lift it. (V)
- Enforcement: unkeyed `POST /v1/swaps/submit-tx` and `/v1/bridge/submit-tx` on api.sodax.com ->
  400, not 401 -> not in `enforce` (one request each). `@RequireApiKey` routes: swaps-api 28,
  bridge-api 11, apps/api 0, sponsoring-api 0. (V)
- Canary api-auth: Coolify predefined network, nothing published on the host
  (`docs/api-authentication.md` §Co-locating api-auth on the canary node). (V, docs — measured by
  the authors 2026-08-17)

## Is Fidel aware of #1372? (2026-10-20)

No GitHub evidence that he is. Outside channels (chat, calls) are not visible.

- 2026-10-04 timeline (UTC): 10:45 #1371 (Paul) -> 10:56 gateway #128 (Fidel, cross-refs the
  backend throttler issue) -> 11:05 PR #129 + design doc v1.3.0 with "Business limits per route or
  per API key stay in the apps" -> 11:10 #1372 (Paul; body says "Discussed with Paul", not Fidel).
  The tight timing suggests a conversation that morning, but the per-key line predates #1372. (V)
- #1372 timeline: no mention, subscription or cross-reference involving Fidel. Fidel is only
  mentioned on #1371's closing comment (2026-10-05 02:49). No gateway issue/PR/commit references
  #1372. (V)
- PR #129 discussion (to merge 2026-10-05 05:43) never mentions per-key/per-org or #1372. Design
  doc v1.3.1 (2026-10-05 06:04, after #1372) keeps the line — weak signal, that edit was narrow. (V)
- Fidel's own epics: #862 C3 puts "per-key rate limiting" in `ApiKeyGuard` (app); #740 Q3 left
  OPEN "partner API-key auth + rate limiting at the gateway (out-of-repo) or in apps/swaps-api?" —
  no answer in its comments. #1372 is effectively that answer. (V)
- api-auth decision 9 (Paul's doc): "Tier gates scope, not quota (yet)" — #1372 turns tier into a
  quota. (V)
- Partner requirement in #740 (Bitcoin.com spec): >= 100 req/min per key + `X-RateLimit-*`
  headers + per-key and per-IP limits. Relevant to N and to whether the edge must emit headers. (V)

## HAProxy 2.8 spike (2026-10-20)

`haproxy:2.8` = 2.8.31, same major as CI and the gateways. Spike config mirrors the `fe_edge`
rate-limit shape with small thresholds (IP 20/10s, flood 100/10s, org from map). Runtime API on a
TCP stats socket, driven from Python. Local only; no repo touched.

| Check | Result |
| --- | --- |
| `opt@` / `virt@` / `file@` map prefixes | **Not supported on 2.8** — "failed to open pattern file". Map files must exist (empty is fine) |
| `tune.stick-counters 4` + `track-sc3` | Works |
| `req.hdr(x-api-key,1),sha2(256),hex,lower,map_str(...)` | Matches Python `hashlib.sha256().hexdigest()` = api-auth's hash |
| `map_str_int`, `sc_http_req_rate(3),sub(txn.var)` | Works |
| `prepare map` / `add map @ver` / `commit map` | Works; atomic replace |
| No key, 30 req | 20 pass, then `rate_limited` |
| Keys A + B of org_1 (limit 30) | Shared budget: 30 pass then `org_rate_limited`; keyed traffic passed the 20/10s IP cap |
| Unknown key / org with no limit | Fall to IP cap (20) |
| Two `x-api-key` headers, first unknown | Keyless — first occurrence is used, like the app guard |
| Keyed flood 130 | Org 429s, and the IP is jailed (`temporarily_blocked` on a following keyless request) — sc0 per IP works |
| Runtime-only map entries + reload | **Lost** (3,1 -> 0,0) |
| Map files written (tmp + rename) + reload | Loaded (3,2). A first attempt read empty files — Docker Desktop bind-mount sync lag from macOS; writing inside the container and reloading immediately loaded correctly |

Consequence for the gateway: map files must exist before any config that references them is
validated. CI already stubs cert/errorfile paths before `haproxy -c` (`.github/workflows/ci.yml`);
the deploy agent runs `haproxy -c` on the host (`scripts/sodax_deploy/validate.py`) and checks
`crt`/`ca-file` existence in `static_checks`.

## Architecture review -> plan v2 (2026-10-20)

- Open-source HAProxy `peers` do not aggregate counters across active-active nodes — the latest
  update overwrites; aggregation needs HAProxy Enterprise's Global Profiling Engine (`.agg`
  tables). Sources: onelogin.com/blog/rate-limiting-haproxy, haproxy.com docs "Global Profiling
  Engine". So the gateway design doc's "a peers section would fix both" only fixes reload loss. (V)
- Redis is per deployment: `sodax-redis` service in `docker-compose.yml`, `REDIS_HOST=sodax-redis`
  in `.env-example`. No shared Redis across the two prods. (V)
- Industry pattern (sources in the 2026-10-20 chat research): HAProxy Data Plane API and the HAProxy
  Kubernetes Ingress Controller keep maps in RAM via the Runtime API and persist to
  `/etc/haproxy/maps`; Kong `local` counters are per node and "less accurate", `redis`/`cluster`
  are accurate but add a call per request and fail open; Tyk keeps keys + quotas in Redis; Envoy
  calls an external RLS backed by Redis.
- `ApiKeyGuard` is the global `APP_GUARD` (`api-auth-client.module.ts:53`) and runs before
  route-level guards, so `request.apiKeyPrincipal` is set before `HaproxyThrottlerGuard`. Outcome
  union in `types.ts`; consumers: `shared-schemas` api-usage-event schema, dashboard
  `components/api-keys/shared.tsx`, `usage-view.tsx`, `app/api/api-keys/usage/route.ts`.
  `@nestjs/throttler` 6.4.0. (V)
- Decision: plan v2 — per-org limiter in `@repo/api-auth-client`, edge unchanged. v1 kept as
  fallback. Needs Paul's agreement because the issue names HAProxy.

## Paul's reply (2026-10-20, chat)

- On the #128 / design-doc line ("per-key limits stay in the apps"): "right, yea that will be
  changed indeed" — Paul wants the HAProxy layer to know "the ratelimit of a given api key".
- Not yet answered: whether Fidel agreed, limit source (`tenants.limits` vs tier default), N for
  pro, verifier token. The plan v2 counter-proposal (app-side) had not been sent at that point.
- Full thread (14:44–15:51): the user's first message already told Paul that prod's two gateways
  count separately (~2x). Paul then: HAProxy should poll the auth-server every N seconds like the
  backend; tiers/limits "not sure at the moment, but should be flexible" (easy to add a tier, edit
  limits); asked to verify tier setting lives on the auth-server; default tier "Base" with Paul
  moving existing orgs via a DB command; "updating this docs should be part of the work". ->
  plan v3. The tier-verification answer had not been sent yet.

## Issue comment (2026-10-20)

Plan summary posted on the issue at the user's request:
https://github.com/icon-project/sodax-backend/issues/1372#issuecomment-6288895315
The detailed specs (`plan-backend.md`, `plan-gateway.md`) were not posted; if they are, strip the
references to this repo's files first.

## Implementation (2026-10-20, uncommitted)

- sodax-backend branch `feat/1372-tier-limits-for-edge-rate-limit` (off development 13b186bc):
  `base` tier + `ORG_LIMIT_KEYS`; migration 0003 (`tier_limits`, default `base`, no seed);
  `IsOrgLimits` replaces `IsNumericRecord`; `/v1/tiers` GET/PATCH (audited `tier.update`);
  keyset ships effective limits (sorted); dashboard Tiers tab + org override field + routes;
  docs (`api-authentication.md`, `CLAUDE.md`, `DEPENDENCIES.md`).
  Verified: api-auth unit 77/77, integration 25/25 on postgres:17.6 (incl. 6 new tier cases),
  api-auth-client 45/45, tsc clean (api-auth, client, dashboard), Biome clean on changed files.
- sodax-unified-api branch `feat/1372-per-org-rate-limit` (off development 0db34ec): cfg org cap
  (`tune.stick-counters 4`, operator socket, maps, `sc3`, `st_rl_org`); deploy agent
  `ensure_map_files` (deploy + rollback, `_REQUIRED_API`, `SODAX_MAPS_DIR`); `keyset-sync.py`
  (+ `--self-test` 18 cases); systemd unit; CI map stubs + self-test job; README section; design
  doc v1.4.0 + ADR-004 (v1.3.1 moved to versions/ with plain `mv`, not `git mv`).
  Verified: CI validate block run verbatim; both doc snippets; py3.8 compile of all 14 scripts;
  agent `--self-test` API surface (27 names) passes (env/haproxy/systemctl missing on macOS only).
- Local end-to-end (real api-auth + real gateway cfg in haproxy:2.8 + real sidecar): 10/10 —
  no key 300/10s; two keys of one org share 500/60s past the IP cap; unknown key and no-limit org
  on the IP cap; suspended org dropped after one sync; keyed flood still jails; drift re-apply;
  clearing the tier limit empties the maps. Reload persistence re-verified strictly (sidecar
  stopped, new worker pid) → maps loaded from files alone.
- Finding: the 2.8 CLI accepts multi-line `add map @ver <map> <<` payloads; one payload is bounded
  by `tune.bufsize`, so the sidecar batches 100 lines.

## Post-PR review (2026-10-20)

PRs: sodax-backend #1380, sodax-unified-api #136. One adversarial review agent + /simplify (4 agents).
Fixed (backend 7d1621ec, gateway be53347):
- Rollback hazard: migration had set `tenants.tier` default to `base`; an api-auth rolled back to a
  build without `base` would mint zero-scope keys for new orgs. Now the column default stays `pro`
  and `KeysService.mint` inserts `DEFAULT_TIER` (`base`); migration 0003 only creates `tier_limits`.
- Privilege: `admin.sock` can end up group `haproxy` (setgid /run/haproxy on Debian), so a sidecar in
  group haproxy would get admin. keyset-sync.sock now has its own group `sodax-keyset`; the service
  has no `SupplementaryGroups=haproxy`. haproxy -c fails if that group is missing → gateway prep
  step (`groupadd --system sodax-keyset` + map files) before the cfg reaches it; CI creates it.
- Sidecar runs a root-owned copy (`/usr/local/lib/sodax-keyset-sync/`) installed/restarted by
  `systemd-units.py install-keyset-sync` (home dirs may be 0750; agent rollback can't delete it).
- Org lookup moved after the jail refusal: e2e shows org rate 1500 after 1700 keyed flood requests.
- Sidecar: map names read from `show map` (KEYSET_HAPROXY_MAPS_DIR dropped), KEYSET_MAX_LIMIT
  dropped (constant bound), push only changed maps, forced re-push every 20 ticks, catches
  http.client/ValueError.
- Simplify: MAX_ORG_LIMIT in shared-enums, unused exports dropped, one dashboard validator +
  error message, Clear inside RateLimitInput, keyset merge as a plain spread.
- Docs: pre-rollout `SELECT org_id, limits FROM tenants WHERE limits <> '{}'`; per-IP jail ceiling
  (~9000/min per gateway from one IP); rollback note for Paul's Base UPDATE.
Skipped: sharing the deploy agent's env parser (agent's self-test gate wouldn't cover it), removing
the dashboard routes' own validation (house convention), drawer tier select from /v1/tiers
(pre-existing), merge-semantics PATCH (behaviour change; revisit with a second limit key).
Re-verified: api-auth unit 76/76, integration 25/25 on a fresh Postgres, tsc (api-auth, client,
dashboard), Biome; gateway CI block + both doc snippets, py3.8 compile, self-test 18/18, e2e 6/6.

## Independent review of both PRs (2026-10-20)

- Read backend #1380 at 7d1621ec and gateway #136 at be53347 against issue #1372. No upstream
  code edits or GitHub review/comment posts. Findings and scope are in `review.md`.
- Backend targeted verification passed: 44 unit, 25 real-Postgres integration, 25 guard/snapshot
  client tests; api-auth/dashboard typechecks passed.
- P1 operational gap: sidecar poll/apply failures stay inside a live daemon without an exposed
  freshness/failure signal or alert. Keep-last-good is correct; detecting indefinite staleness
  is the missing counterpart of the snapshot pattern.
- Gateway-c also receives prod traffic, so a/b divisor 2 is not an exact fleet-wide quota.
  Treat this as a rollout/accounting limitation of the accepted local-counter design.

## Global quota follow-up (2026-10-20)

- User confirmed divisor 2 remains intentional on a/b, with documented failover/skew tradeoffs;
  today's IP-limit probe observed doubling and did not show c carrying production traffic.
- Compared a shared atomic limiter, org ownership, quota reservation batches, Durable Objects,
  Enterprise aggregation and active/passive. See `design-global-quota.md` for sources and boundaries.
- Recommendation if exact global accounting becomes required: a separate data-plane limiter
  with atomic shared state; keep api-auth off the request path. Fail-open and asynchronous store
  failover are incompatible with an absolute failure-inclusive cap.
- Architecture discussion only; the selected PR implementation and deployment remain unchanged.

## Changes During Work

- 2026-10-20 — plan correction: the first draft reused sc0 for `st_rl_org` on keyed requests.
  Wrong — `rl_flood` reads `sc_http_req_rate(0)`, so a keyed flooder would be judged on the org's
  60s rate instead of its own IP and the jail would stop working per IP. sc0 now stays per-IP for
  every request; org moves to sc3 via `tune.stick-counters 4` (documented upstream; confirm on
  2.8 in the spike).
