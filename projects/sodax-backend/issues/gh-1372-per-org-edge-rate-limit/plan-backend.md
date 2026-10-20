---
type: plan
repo: sodax-backend
github: 1372
updated: 2026-10-20
---

# PR 1 — sodax-backend

Contracts and decisions: `plan.md`. Paths are relative to the sodax-backend repo root.

## 0. Setup

```bash
git checkout development && git pull origin development
git checkout -b feat/1372-tier-limits
pnpm install                                   # a stale install breaks unrelated checkTs
pnpm --filter @repo/shared-enums build          # api-auth imports shared-enums from dist/
```

## 1. Vocabulary — `packages/shared-enums/src/enums/api-scopes.ts`

- `TIERS = ['base', 'pro'] as const`
- `TIER_SCOPES = { base: API_SCOPES, pro: API_SCOPES }` (both derived, full access)
- New:
  ```ts
  export const ORG_LIMIT_KEYS = ['rateLimitPerMinute'] as const;
  export type OrgLimitKey = (typeof ORG_LIMIT_KEYS)[number];
  export type OrgLimits = Partial<Record<OrgLimitKey, number>>;
  ```
- Update the tier doc comment: `base` is the column default, `pro` is what existing orgs carry until
  moved, both full access; tier default limits live in api-auth `tier_limits`, not here.
- Re-export `ORG_LIMIT_KEYS`/`OrgLimitKey`/`OrgLimits` from `apps/api-auth/src/db/schema.ts` like the
  other vocabulary.

## 2. Schema + migration — `apps/api-auth`

`src/db/schema.ts`:
- `tenants.tier` default `'base' satisfies Tier`; `tenants.limits` comment → "this org's overrides
  of its tier's default limits".
- New table:
  ```ts
  export const tierLimits = pgTable('tier_limits', {
    tier: text('tier').primaryKey(),
    limits: jsonb('limits').$type<Record<string, number>>().notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```
  No FK — the tier list is code. No row = no default limits.
- `auditLog.target` comment: "an org id, a key id, or `tier:<name>`". Header comment: four tables.

Generate (do not hand-write):
```bash
cd apps/api-auth && pnpm exec drizzle-kit generate --name base_tier_and_tier_limits
```
Expected `0003_base_tier_and_tier_limits.sql`: `CREATE TABLE "tier_limits" (...)` and
`ALTER TABLE "tenants" ALTER COLUMN "tier" SET DEFAULT 'base';` — plus `meta/0003_snapshot.json`
and a journal entry. **No seed rows** (dark launch). Migrations run before the app starts
(`docker-compose.api-auth.yml`, `db:migrate:prod`).

## 3. Validation — new `apps/api-auth/src/shared/is-org-limits.validator.ts`

`IsOrgLimits()` (class-validator `registerDecorator`, same shape as the current
`src/tenants/is-numeric-record.validator.ts`, which it replaces — delete that file; it has no other
user):
- value is a plain object (not null, not an array);
- every key is in `ORG_LIMIT_KEYS`;
- `rateLimitPerMinute` is `Number.isInteger` and within 1..1_000_000;
- `{}` is valid (means "no limits / clear overrides");
- message: `limits may only contain rateLimitPerMinute, an integer from 1 to 1000000`.

Use it in `src/tenants/tenants.dto.ts` (keep `@ValidateIf(v !== undefined)` so `null` → 400) and in
the new tiers DTO.

## 4. Tiers endpoints — new `apps/api-auth/src/tiers/` (copy the `tenants/` layout)

Files: `tiers.module.ts`, `tiers.controller.ts`, `tiers.service.ts`, `tiers.dto.ts`; import
`TiersModule` in `src/app.module.ts`.

Controller: `@ApiTags('tiers') @Controller('v1/tiers') @RequireServiceRole('provisioner')`.

**`GET /v1/tiers`** → 200, one element per `TIERS` entry, in `TIERS` order:
```json
[
  { "tier": "base", "scopes": ["swaps:read","swaps:write","bridge:read","bridge:write"], "limits": {} },
  { "tier": "pro",  "scopes": ["swaps:read","swaps:write","bridge:read","bridge:write"], "limits": { "rateLimitPerMinute": 1800 } }
]
```
`limits` = the row's limits, or `{}` when there is no row.

**`PATCH /v1/tiers/:tier`**, body `UpdateTierDto { limits }` (required, `@IsOrgLimits()`):
```json
{ "limits": { "rateLimitPerMinute": 1800 } }     // set
{ "limits": {} }                                   // clear
```
→ 200 with the same object shape as one GET element.
- `:tier` not in `TIERS` → 404 `Tier not found` (same style as `Tenant not found`).
- Invalid body → 400. Verifier token or no token → 401 (ServiceTokenGuard behaviour).

Service `update({ tier, limits, actor, source })` in ONE transaction, same pattern as
`TenantsService.update` and the lazy-tenant insert in `KeysService`:
1. `insert(tierLimits).values({ tier }).onConflictDoNothing()` — so the row exists to lock;
2. `select … for('update')` → `before`;
3. `update(...).set({ limits, updatedAt: new Date() }).returning()`;
4. `insert(auditLog)` with `action: 'tier.update'`, `target: 'tier:' + tier`,
   `before: { limits }`, `after: { limits }`, plus `...auditIdentity(req)` from the controller.

## 5. Keyset — `apps/api-auth/src/keyset/keyset.service.ts`

- Add `.leftJoin(tierLimits, eq(tenants.tier, tierLimits.tier))` to the existing query and select
  `tierLimits: tierLimits.limits`.
- `limits` in each `KeysetEntry` = effective limits:
  ```ts
  const merged = { ...(row.tierLimits ?? {}), ...row.limits };
  const limits = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  ```
  Sorted keys keep the `version` hash stable. A tier-limit edit changes the payload → new version →
  every consumer picks it up on its next poll.
- Update the `KeysetEntry.limits` doc comment (here and in
  `packages/api-auth-client/src/types.ts`): effective limits, tier defaults overlaid by org
  overrides. Today only `api-key.guard.ts` copies it into the principal; nothing reads it.

## 6. Dashboard — `apps/sodax-backend-dashboard` (no test suite; verify by checkTs, lint, manual run)

- `lib/api-scopes.ts` (a deliberate copy — the Next bundle cannot import shared-enums):
  `TIERS = ['base', 'pro']`, add `ORG_LIMIT_KEYS`, and a shared `isValidOrgLimits(value)` mirroring
  section 3.
- `lib/types.ts`: add `ApiKeyTierInfo { tier: string; scopes: string[]; limits: Record<string, number> }`.
- `lib/server/api-auth-client.ts`:
  - `updateTenant(input: { orgId; status?; tier?; limits? })` — drop the "limits stays out" comment;
  - `listTiers(actor)` → `GET /v1/tiers`; `updateTierLimits({ tier, limits }, actor)` →
    `PATCH /v1/tiers/:tier`. Same `request<T>()` helper (provisioner token + `x-actor`).
- Routes (copy `app/api/api-keys/orgs/[orgId]/route.ts`: `canActorWrite` → parse → allowlist →
  call → `logAdminAction` on success and failure):
  - `app/api/api-keys/orgs/[orgId]/route.ts` PATCH: also accept `limits` (validated with
    `isValidOrgLimits`); "requires status or tier" → "requires status, tier or limits"; remove the
    comment saying limits are excluded.
  - New `app/api/api-keys/tiers/route.ts` — GET → `listTiers`.
  - New `app/api/api-keys/tiers/[tier]/route.ts` — PATCH `{ limits }`; tier must be in `TIERS`.
- UI:
  - New `components/api-keys/tiers-view.tsx`: table Tier | Scopes | Rate limit (req/min per org) |
    edit (number input, Save, Clear). Helper text: "Enforced per org at the HAProxy edge. Empty =
    no org limit; per-IP limits apply." Use the same mutate/refresh pattern as `org-drawer.tsx`.
  - `app/api-keys/page.tsx`: add a tab `{ label: 'Tiers', node: <TiersView /> }`.
  - `components/api-keys/org-drawer.tsx` (read-only limits block ~L363–374): replace with "Rate
    limit override" — number input + Save + Clear (Clear sends `limits: {}`), showing the tier's
    default beside it.

## 7. Docs

- `docs/api-authentication.md`:
  - Decisions table, row 9 → "Tier gates scope and carries default limits. `TIER_SCOPES` in code;
    `tier_limits` in api-auth (editable); org `limits` override key by key."
  - Endpoints list → add `GET /v1/tiers`, `PATCH /v1/tiers/:tier` (provisioner).
  - Phase 5 notes (~L336–340, "limits is shown read-only…") → limits are now editable.
  - Not in scope → remove "HAProxy-level enforcement".
  - New section "Edge rate limit": contract (`plan.md` §Contracts), the gateway sidecar as a keyset
    consumer, dark launch (no limit set = no change), how to turn it off.
- `CLAUDE.md` §Postgres Ownership table → add `tier_limits`.
- `DEPENDENCIES.md` §sodax-unified-api → the keyset-sync sidecar consumes `/v1/keyset` fields
  `keyHash`, `orgId`, `orgStatus`, `limits.rateLimitPerMinute`; changing them needs a gateway PR.

## 8. Tests

Unit (`apps/api-auth/test/unit/`):
- `keyset.service.spec.ts`: the DB stub chain becomes `select → from → innerJoin → leftJoin →
  orderBy`; fixture rows carry `tierLimits`. Cases: tier default only; org override wins; org adds a
  key the tier lacks; keys sorted; version changes when only a tier limit changes; null tierLimits.
- `tenants.dto.spec.ts`: rewrite the `rps` cases to the vocabulary — reject unknown key, `0`, `1.5`,
  `"100"`, `null`, nested object, `1_000_001`; accept `{}` and `{ rateLimitPerMinute: 1800 }`. The
  old "zero means deny all" case goes away (decision in `plan.md`).
- New `tiers.dto.spec.ts`: same matrix for `UpdateTierDto`; `limits` required.

Integration (`test/integration/api-auth.pg.spec.ts`, needs Postgres — commands in the file header):
- lazy tenant gets `tier: 'base'` (update the `'pro'` assertion ~L111 and the comment ~L381);
- `GET /v1/tiers` lists `base`, `pro`; `PATCH /v1/tiers/base` sets and clears; unknown tier → 404;
  invalid limits → 400; verifier token → 401; audit row `tier.update` / `tier:base` with
  before/after;
- keyset: org on `base` gets the tier default; org override wins; clearing the tier limit removes it;
  `version` changes after a tier PATCH;
- add `TiersModule` to the test module imports.

## 9. Definition of done

```bash
pnpm --filter @repo/shared-enums build
pnpm --filter api-auth exec vitest run test/unit --maxWorkers=4
# integration (see the spec header):
docker run -d --name api-auth-test-db -e POSTGRES_USER=api_auth -e POSTGRES_PASSWORD=localtest \
  -e POSTGRES_DB=api_auth -p 55439:5432 postgres:17.6-alpine
API_AUTH_DATABASE_URL=postgres://api_auth:localtest@localhost:55439/api_auth pnpm --filter api-auth db:migrate
API_AUTH_TEST_DATABASE_URL=postgres://api_auth:localtest@localhost:55439/api_auth \
  pnpm --filter api-auth exec vitest run test/integration
pnpm --filter api-auth exec tsc --noEmit
pnpm --filter @repo/api-auth-client exec tsc --noEmit
pnpm --filter @repo/api-auth-client exec vitest run --maxWorkers=4
pnpm --filter sodax-backend-dashboard checkTs && pnpm --filter sodax-backend-dashboard lint
```
- All green; integration NOT skipped.
- Manual: run the dashboard against a local api-auth (`docs/partner-portal-local-dev.md`), set a
  tier limit and an org override in the UI, and confirm `GET /v1/keyset` shows the effective limit.
- PR body: what changed, the dark-launch note (no behaviour change until a limit is set), the known
  gap (submit-tx throttle), and that Paul runs the Base update after deploy.
