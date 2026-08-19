---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-18
parent: plan.md
related: [plan-engineering-standards.md, plan-auth-api-security.md, plan-sdk-integration.md]
tags: [sodax-backend, auth-api, better-auth, nestjs, scaffold]
---

# `apps/auth-api` scaffold — exact templates to copy, verified against real source

Every snippet below comes from a currently-running sibling app
(`apps/stateful-api`, `apps/bridge-api`, `apps/swaps-api`, `apps/sponsoring-api`).
A block is verbatim **unless labelled "excerpt"** — an excerpt has had comments
stripped and/or fields elided, so diff it against the cited file:line
structurally, not character-for-character. Read-first note (S1/S9 in
[[plan-engineering-standards]]): `auth-api` reuses these exact patterns, it
does not invent new ones.

**Branch caveat**: every `apps/bridge-api/*` citation resolves only on the
unmerged branch `origin/feat/bridge-api-bound-auth-usdt-approve` (9f52532c).
`apps/bridge-api` exists on neither the working branch nor `development`, so a
reviewer diffing on the default branch finds nothing. Where a byte-identical
copy exists on `development` — notably `haproxy-throttler.guard.ts` in
`swaps-api` — the merged path is cited instead.

## 1. Better Auth wiring — mirror `stateful-api/src/auth/*` exactly, swap the prefix

Excerpt (comments stripped, `socialProviders` collapsed to one line) —
`apps/stateful-api/src/auth/auth.config.ts:1-92`:

```ts
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { organization } from 'better-auth/plugins';
import type { Db, MongoClient } from 'mongodb';
import type { StatefulApiConfigDto } from '@repo/shared-dtos';
import { AUTH_BASE_PATH, AUTH_COLLECTIONS } from './auth.constants';

type AuthConfig = StatefulApiConfigDto['authConfig'];

export function buildAuth(db: Db, client: MongoClient, cfg: AuthConfig) {
  const isProd = cfg.isProd;
  const hasGoogle = Boolean(cfg.googleClientId && cfg.googleClientSecret);

  const options = {
    appName: 'sodax-partner-portal',
    secret: cfg.secret,
    baseURL: cfg.baseUrl,
    basePath: AUTH_BASE_PATH,
    database: mongodbAdapter(db as never, { client: client as never }),
    trustedOrigins: cfg.trustedOrigins,
    emailAndPassword: { enabled: false },
    socialProviders: hasGoogle ? { google: { clientId: cfg.googleClientId as string, clientSecret: cfg.googleClientSecret as string, prompt: 'select_account' } } : {},
    session: {
      modelName: AUTH_COLLECTIONS.session,
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: { modelName: AUTH_COLLECTIONS.user },
    account: { modelName: AUTH_COLLECTIONS.account },
    verification: { modelName: AUTH_COLLECTIONS.verification },
    advanced: {
      cookiePrefix: 'sodax',
      useSecureCookies: isProd,
      ...(cfg.cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cfg.cookieDomain } } : {}),
    },
    plugins: [
      organization({
        sendInvitationEmail: async () => { /* no-op for V1 — link-based invites */ },
        schema: {
          organization: { modelName: AUTH_COLLECTIONS.organization },
          member: { modelName: AUTH_COLLECTIONS.member },
          invitation: { modelName: AUTH_COLLECTIONS.invitation },
        },
      }),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth(options);
}

export type StatefulAuth = ReturnType<typeof buildAuth>;
```

The `plugins` array is kept here rather than placeholdered because its shape is
the load-bearing precedent: plugin-level `schema.<model>.modelName`
(auth.config.ts:78-82) is how this repo pins a Better Auth **plugin's**
collection names, mirroring the top-level `user`/`session`/`account`/
`verification` `modelName` keys at auth.config.ts:53-60. That answers half the
`WAUTH_COLLECTIONS` TODO below — the pattern is plugin-level
`schema.<model>.modelName`; only the passkey plugin's own model **key name**
still needs confirming against its installed `.d.ts`. `auth-api` drops
`organization` and adds `passkey()` + `emailAndPassword` instead.

`apps/stateful-api/src/auth/auth.constants.ts:1-25`, code only — the file's
10-line header JSDoc and its two per-const doc comments are stripped here
(`AUTH_INSTANCE` is at :11, not :1):

```ts
export const AUTH_INSTANCE = Symbol('BETTER_AUTH_INSTANCE');
export const AUTH_BASE_PATH = '/api/auth';

export const AUTH_COLLECTIONS = {
  user: 'auth_user',
  session: 'auth_session',
  account: 'auth_account',
  verification: 'auth_verification',
  organization: 'auth_organization',
  member: 'auth_member',
  invitation: 'auth_invitation',
} as const;
```

The stripped header is the part `auth-api` must inherit, not just the values:
names are pinned (a) so Better Auth's default `user` collection can't collide
with the legacy wallet-registration `stateful_users` — the prefix keeps the two
auth planes disjoint — and (b) so they match CLAUDE.md's single-writer
ownership table. `WAUTH_COLLECTIONS` needs the same reasoning written down
against the now-existing `auth_*` plane.

**`auth-api`'s versions**, direct copy with the prefix swapped and the plugin
set changed — `WAUTH_COLLECTIONS`:

```ts
export const WAUTH_INSTANCE = Symbol('BETTER_AUTH_INSTANCE');
export const WAUTH_BASE_PATH = '/api/auth';

export const WAUTH_COLLECTIONS = {
  user: 'wauth_user',
  session: 'wauth_session',
  account: 'wauth_account',
  verification: 'wauth_verification',
  // passkey: 'wauth_passkey'  — add once @better-auth/passkey's own `schema.passkey.modelName`
  // option shape is confirmed (NOT verified this session — the package isn't installed
  // anywhere in either repo yet; check its actual .d.ts before wiring this in).
} as const;
```

`auth.module.ts` — copy `apps/stateful-api/src/auth/auth.module.ts:1-34` verbatim
except the injected connection name (auth-api gets its own Mongo connection,
not the shared `stateful` one) and swap `buildAuth`/`AUTH_INSTANCE` for the
`WAUTH_*` versions above. The `await connection.asPromise()` before capturing
`connection.db` (line 27) is load-bearing — don't drop it, or Better Auth
holds an `undefined` `Db`. The file's own comment (auth.module.ts:16-17) says
exactly this.

**Two things `auth-api` must NOT copy from `stateful-api`:**
- `emailAndPassword: { enabled: false }` — auth-api needs it **on**, with
  `password.hash`/`password.verify` overridden to the derived `authHash`
  scheme (plan-sdk-integration.md's KDF-split design), not Better Auth's
  default Scrypt (confirmed default: `create-context.mjs:156-157`,
  `hashPassword`/`verifyPassword` imported at `create-context.mjs:4` from
  `../crypto/password.mjs` — auth-api's
  server never sees a plaintext password at all, so this default is simply
  inapplicable, not something to disable/reconfigure).
- The `organization` plugin — replace with `passkey()` (once
  `@better-auth/passkey` is added as a real dependency and its options
  shape is read from its own installed `.d.ts`, not assumed) and
  `emailAndPassword`.

**Confirmed absent today, must be added explicitly for auth-api** (this is
the direct, source-confirmed answer to the earlier rate-limit question — see
[[plan-auth-api-security]] §Rate limiting for the full defaults):
`rateLimit: {...}` is not set anywhere in `stateful-api/src/auth/auth.config.ts`
(the full `options` object's key list, verified line-by-line, has no
`rateLimit` key) — it runs on Better Auth's library default (`enabled` only
in production, `window: 10s`, `max: 100`, `storage: 'memory'`). `auth-api`
must set this explicitly, including `secondaryStorage` — see the security doc.

## 2. `main.ts` bootstrap order — copy `stateful-api`'s sequence, not `bridge-api`'s

`auth-api` is cookie/session-based (like `stateful-api`), not bearer-token
based (like `bridge-api`/`swaps-api`), so it needs the `bodyParser:false` +
raw-mount-before-json-parser sequence, confirmed exact from
`apps/stateful-api/src/main.ts`:

```ts
const app = await NestFactory.create(AppModule, {
  logger: WinstonModule.createLogger({ instance: customLogger }),
  abortOnError: true,
  bodyParser: false,   // Nest's global body parser OFF so Better Auth reads the raw stream
});

const configService = app.get(CustomConfigService);

// 1. helmet FIRST
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
// auth-api difference from stateful-api: do NOT disable contentSecurityPolicy — this app
// serves a real login UI (the SDK modal), stateful-api disables it because it's an
// internal partner portal with different threat exposure. Tune a real CSP instead of `false`.

// 2. CORS — there is NO sibling to copy here; see [[plan-auth-api-security]] §Don't-hack-me
//    → CORS for the decision. stateful-api's own block (main.ts:62-79) hardcodes three inline
//    regexes (localhost:\d+, *.sodax.com, sodax-*.vercel.app), allows a missing Origin, and
//    sets NO `credentials` key — deliberately (main.ts:55-56: "no session cookie ever crosses
//    this boundary"), because the portal is served SAME-ORIGIN through a Next proxy so its
//    cookie traffic never triggers CORS. `trustedOrigins` is NOT its CORS source; it feeds
//    Better Auth's Origin/CSRF check only (configuration.ts:57). Those broad regexes are sized
//    for a public cookieless surface — do not paste them onto a credentialed one.

// 3. Better Auth handler mounted BEFORE express.json()/urlencoded — raw Express, named wildcard:
const auth = app.get<WauthAuth>(WAUTH_INSTANCE);
const expressApp = app.getHttpAdapter().getInstance();
const authUrlPath = new URL(configService.authConfig.baseUrl).pathname.replace(/\/+$/, '');
const authBasePath = authUrlPath || WAUTH_BASE_PATH;
expressApp.all(`${authBasePath}/*splat`, toNodeHandler(auth));   // Express 5 named-wildcard

// 4. THEN body parsers re-enabled for everything else:
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(requireJson);   // stateful-api/src/main.ts:98 — deliberately AFTER both parsers and
                        // after the Better Auth mount, so auth requests are never forced to be JSON

app.useGlobalFilters(new AllExceptionsFilter());
app.useGlobalPipes(new CustomValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
app.setGlobalPrefix('api');
```

The `authBasePath` derived from `configService.authConfig.baseUrl`'s URL
pathname (not hardcoded) is deliberate — keeps the Express mount and Better
Auth's own router path from ever drifting apart (`stateful-api/src/main.ts:81-87`'s
own comment). Reuse this derivation, don't hardcode `/api/auth`.

One middleware is deliberately **not** in this sequence: `requestContext` is
wired via `MiddlewareConsumer` in `AppModule.configure()`, not in `main.ts`
(`stateful-api/src/main.ts:99-101`) — registered here it would run *before*
Nest's body parser and POST/PUT/PATCH bodies would be `undefined` when
snapshotted. `auth-api` must keep that split.

## 3. Config validation — `class-validator` + `class-transformer`, not Zod/Joi

Shared helper, `packages/shared-utils/src/utils/validate-utils.ts`, full file:

```ts
import { plainToClass } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { ClassConstructor } from 'class-transformer';

export function validateUtil<Type extends object>(
  config: Record<string, unknown>,
  envVariablesClass: ClassConstructor<Type>,
) {
  const validatedConfig = plainToClass(envVariablesClass, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig as object, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
```

Config class pattern (`apps/bridge-api/src/shared/class/config.class.ts:35-48,
206-258`) — nested classes validated via `@ValidateNested()` + `@Type(() => X)`:

```ts
export class CacheConfigClass {
  @IsString()
  @IsNotEmpty()
  @Contains('redis://')
  uri!: string;

  @IsNumber()
  @IsNotEmpty()
  ttl!: number;

  @IsNumber()
  @IsNotEmpty()
  lruSize!: number;
}

export class ConfigClass {
  @IsEnum(EnvType)
  env!: EnvType;

  @IsNumber()
  @IsNotEmpty()
  port!: number;

  @IsObject()
  @IsDefined()
  @ValidateNested()
  @Type(() => MongoConfigClass)
  mongoConfig!: MongoConfigClass;

  @IsObject()
  @IsDefined()
  @ValidateNested()
  @Type(() => CacheConfigClass)
  cacheConfig!: CacheConfigClass;

  // ...auth-api adds its own nested classes here (WauthAuthConfigClass, AaguidWhitelistConfigClass)
  // following the identical @IsObject/@IsDefined/@ValidateNested/@Type(() => X) shape.
}
```

`ConfigModule` wiring (`apps/bridge-api/src/config/config.module.ts`, full,
17 lines — copy as-is):

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CustomConfigService } from './config.service';
import configuration from './configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [configuration],
    }),
  ],
  providers: [CustomConfigService],
  exports: [CustomConfigService],
})
export class CustomConfigModule {}
```

## 4. DTO style — `class-validator` decorators + `@ApiProperty`, 1:1 pairing

Real example, `apps/bridge-api/src/api/bridge/dto/submit-bridge-tx.dto.ts`
(86 lines) — excerpt: request DTOs only, doc comments and the two response
DTOs elided. The pattern to copy for
`keystore`/`passkey-registration`/`settings` DTOs:

```ts
import { ApiProperty } from '@nestjs/swagger';
import { IsHex } from '@repo/shared-utils';
import { CHAIN_KEYS, Hex, SpokeChainKey } from '@sodax/sdk';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class RelayDataRequestDto {
  @ApiProperty({ description: 'Relay envelope address (hex)', example: '0x...' })
  @IsHex({ requirePrefix: true })
  address!: Hex;

  @ApiProperty({ description: 'Relay envelope payload (hex)', example: '0x...' })
  @IsHex({ requirePrefix: true })
  payload!: Hex;
}

export class BridgeSubmitTxDto {
  @ApiProperty({ description: '...', example: '...', minLength: 1, maxLength: 127 })
  @IsString()
  @IsNotEmpty({ message: 'Tx hash is required' })
  @MinLength(1)
  @MaxLength(127)
  txHash!: string;

  @ApiProperty({
    description: 'Source chain key (spoke chain the tx was submitted from)',
    enum: Object.values(CHAIN_KEYS),
  })
  @IsNotEmpty({ message: 'Source chain key is required' })
  @IsIn(Object.values(CHAIN_KEYS), { message: 'Source chain key must be a valid spoke chain key' })
  srcChainKey!: SpokeChainKey;

  @ApiProperty({ description: 'Address of the wallet that broadcast the tx', example: '0x13b7...', minLength: 1, maxLength: 127 })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(127)
  walletAddress!: string;

  @ApiProperty({ description: 'Relay envelope received from createBridgeIntent', type: RelayDataRequestDto })
  @ValidateNested()
  @Type(() => RelayDataRequestDto)
  relayData!: RelayDataRequestDto;
}
```

Two things this excerpt is chosen for, and one it omits:

- **The enum-bounded field is the clearest instance of the 1:1 pairing this
  section is about**: `@ApiProperty({ enum: Object.values(CHAIN_KEYS) })` sits
  next to `@IsIn(Object.values(CHAIN_KEYS), { message: ... })` (real lines
  36-42), so Swagger and runtime validation are driven off one source of truth
  and cannot drift. Recommended — not required — wherever `auth-api` has a
  closed-set field.
- **The request contract is `{ txHash, srcChainKey, walletAddress, relayData }`**,
  not just `{ txHash, relayData }`; `srcChainKey` and `walletAddress` are both
  required, and the route is idempotent on `(txHash, srcChainKey)`.
- **Omitted here: the paired response DTOs** `BridgeSubmitTxDataResponseDto`
  and `BridgeSubmitTxResponseDto` (real lines 65-86) — the `{ success, data }`
  envelope, `@ApiProperty` on response fields too, and a literal-union status
  (`status!: 'inserted' | 'duplicate'`). Response-shape convention is otherwise
  undocumented across this issue folder; read those 22 lines before designing
  `auth-api`'s response DTOs.

For `auth-api`'s `keystore` upload DTO specifically: the `encryptedBlob` field
should be validated for **shape only** (via `@sodax/keystore-crypto`'s
envelope `validate.ts`, called inside the DTO's controller/service, not via a
`class-validator` decorator — the envelope's internal structure is defined by
that package, not re-declared here) plus ordinary `class-validator` bounds on
size (`@MaxLength`) to reject absurdly large payloads before they reach the
validator.

## 5. Rate-limit guard and Redis cache — reuse verbatim, see [[plan-auth-api-security]] for exact config values

`apps/swaps-api/src/shared/guards/haproxy-throttler.guard.ts` — the 25-line
file, JSDoc header elided below. Cited from `swaps-api` because that copy is on
`origin/development`; `bridge-api`'s is byte-identical but lives only on the
unmerged branch. Copy verbatim into `auth-api/src/shared/guards/`:

```ts
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class HaproxyThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    const realIp = req.headers['x-real-ip'];
    return Promise.resolve(typeof realIp === 'string' && realIp ? realIp : (req.ip ?? '127.0.0.1'));
  }
}
```

Registration is **per-route**, never `APP_GUARD` (confirmed: zero
`APP_GUARD` usage anywhere in `bridge-api`/`swaps-api`/`sponsoring-api`) —
`auth-api` follows the identical opt-in pattern, applied to every
registration/OTP-send/login/settings-fetch endpoint explicitly:

```ts
@Post('register')
@UseGuards(HaproxyThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: 10 } })   // tune tighter than this baseline per endpoint
```

`sponsoring-api`'s variant is worth considering instead of the inline header
read — it sources the IP through a shared `resolveClientIp(req)` utility
(`apps/sponsoring-api/src/shared/client-ip.ts`) so the rate-limit tracker and
any future IP-allowlist guard can never disagree about who's calling:

```ts
@Injectable()
export class HaproxyThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Request): Promise<string> {
    return Promise.resolve(resolveClientIp(req) || '127.0.0.1');
  }
}
```

`ThrottlerModule.forRoot()` — identical `{ttl: 60_000, limit: 10}` baseline
across all three sibling apps (`app.module.ts`), auth-api registers the same
module-level default and overrides per-route via `@Throttle(...)`.

Redis/cache dependency — exact versions already pinned in `bridge-api`/
`swaps-api` (`sponsoring-api` has none, it's stateless):

```json
"@keyv/redis": "4.6.0",
"@nestjs/cache-manager": "3.0.1",
"cache-manager": "6.4.3"
```

Wiring (`apps/bridge-api/src/app.module.ts`):

```ts
import { createKeyv } from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';
// ...
CacheModule.registerAsync({
  isGlobal: true,
  imports: [CustomConfigModule],
  inject: [CustomConfigService],
  useFactory: async (configService: CustomConfigService) => {
    const cacheConfig = configService.cacheConfig;
    return {
      store: createKeyv(cacheConfig.uri),
    };
  },
}),
```

The block body with the intermediate `const` is the sibling house style — it
matches the `MongooseModule.forRootAsync` factory directly below it, and
`swaps-api` is identical. Behaviour is the same either way; match the style.

This is the store `auth.config.ts`'s `secondaryStorage` option needs to
point at (per [[plan-auth-api-security]]) — `auth-api` needs its own adapter
bridging Better Auth's `secondaryStorage` interface to this same Keyv/Redis
store, not a second Redis connection.

## Files read this pass (source, not paraphrase — see the excerpt labels above)

- `sodax-backend/apps/stateful-api/src/auth/{auth.config.ts,auth.constants.ts,auth.module.ts}`
- `sodax-backend/apps/stateful-api/src/main.ts`
- `sodax-backend/apps/bridge-api/src/{main.ts,app.module.ts,shared/guards/haproxy-throttler.guard.ts,shared/class/config.class.ts,config/{config.module.ts,configuration.ts},api/bridge/{dto/submit-bridge-tx.dto.ts,bridge.module.ts,bridge.controller.ts}}`
- `sodax-backend/apps/sponsoring-api/src/shared/{guards/haproxy-throttler.guard.ts,configure-app.ts,cors.ts}`
- `sodax-backend/apps/swaps-api/src/{app.module.ts,main.ts,shared/guards/haproxy-throttler.guard.ts}`
- `sodax-backend/packages/shared-utils/src/utils/validate-utils.ts`
- `sodax-backend/node_modules/.pnpm/better-auth@1.4.18.../node_modules/better-auth/dist/{context/create-context.mjs, utils/get-request-ip.mjs, api/rate-limiter/index.mjs}`
- `sodax-backend/node_modules/.pnpm/@better-auth+core@1.4.18.../node_modules/@better-auth/core/dist/types/init-options.d.mts` — its own pnpm store entry, **not** nested under the `better-auth@1.4.18` one (re-reading it by the nested path returns not-found)
