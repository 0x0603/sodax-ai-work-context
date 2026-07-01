---
type: knowledge
area: operations
status: Stable
tags: [swaps-api, backend, docker, solver, stacks, runbook, env, mongo, redis]
updated: 2026-07-01
related_issues: []
related_decisions: []
---

# Run swaps-api (sodax-backend) locally

## Summary

`apps/swaps-api` is the swap-domain REST service in `sodax-backend`. It wraps
`@sodax/sdk` `SwapService` and exposes `/swaps/*` (quote, raw-tx builders,
submit-tx state machine). This runbook covers running it locally with Docker and
the two port gotchas that make it fail on a fresh `.env.dev`, plus the
`SOLVER_CONFIG` behavior that decides whether Stacks quotes succeed.

Verified end-to-end on 2026-07-01: `healthz/live → {"status":"ok"}`,
`/swaps/tokens → 200`, `/swaps/quote (STX→POL) → {"quotedAmount":"..."}`.

## Details

### 1. Run it (Docker)

```bash
cd sodax-backend
cp .env-example .env.dev          # Makefile uses DEV_ENV=.env.dev at repo root
make run-dev-swaps-api            # depends_on pulls up sodax-mongo + sodax-redis
```

- Port: **3008** (`SWAPS_API_PORT`). Swagger UI at `/docs`, OpenAPI at `/docs-json`.
- `make run-dev-swaps-api` → `docker compose -f docker-compose.yml --env-file .env.dev up -d sodax-swaps-api --build`.
- The `sodax-swaps-api` service `depends_on` mongo + redis, so one command brings up all three.
- Node engine wanted: `22.18.x` (Docker image handles it; only matters for the non-Docker `pnpm start:dev` path).

### 2. GOTCHA #1 — Docker-network port mismatch (the "Connection reset by peer" failure)

Symptom: `curl http://localhost:3008/healthz/live` → `curl: (56) Recv failure: Connection reset by peer`.
The container is `Up (health: starting)` with **0 restarts** (not crashing) — it is
stuck retrying Mongo, so the HTTP server never starts listening. Logs show:

```
Unable to connect to the database. Retrying (1)...
MongooseServerSelectionError: connect ECONNREFUSED 172.18.0.3:27019
```

Root cause: `.env-example` mixes **Docker service names** with **host-mapped
ports**. It sets `MONGO_HOST=sodax-mongo` / `REDIS_HOST=sodax-redis` (container
DNS names — correct for in-network) but `MONGO_PORT=27019` / `REDIS_PORT=6381`
(the **host** side of the port mapping). Inside the Docker network the app must
use the **container-internal** ports.

- Mongo container maps `27019:27017` → mongod listens on **27017** internally.
- Redis container runs `redis-server` (default) → listens on **6379** internally;
  maps `${REDIS_PORT}:6379`.

Fix in `.env.dev` (when running IN Docker):

```bash
MONGO_PORT=27017     # was 27019 (host-mapped)
REDIS_PORT=6379      # was 6381  (host-mapped)
```

(If instead you run the app on the HOST via `pnpm --filter swaps-api start:dev`,
do the opposite: `MONGO_HOST=127.0.0.1` + `MONGO_PORT=27019`, `REDIS_HOST=127.0.0.1`
+ `REDIS_PORT=6381`. But host mode also needs `directConnection=true` on the Mongo
URI because the RS advertises the `sodax-mongo` member name, which the host can't
resolve — Docker mode is simpler.)

Mongo URI is assembled by `buildMongoConfig()` → `buildMongoConfigFromEnv()` in
`packages/shared-utils/src/utils/config-utils.ts` (~L284):
`mongodb://user:pass@${MONGO_HOST}:${MONGO_PORT}/?replicaSet=rs0&authSource=admin`.
It prefers a full `MONGO_URI` if set (so a full URI can override the components).

### 3. GOTCHA #2 — Redis host-port collision with a local redis-server

If the host already runs a `redis-server` on `6379` (common on dev macs — check
`lsof -nP -iTCP:6379 -sTCP:LISTEN`), then setting `REDIS_PORT=6379` makes Compose
map host `6379:6379`, which collides and the Redis container won't bind. But the
app needs `6379` for the in-network connection. `${REDIS_PORT}` is used for BOTH
the host mapping and the app connection (`x-api-cache-env` reads `REDIS_PORT`), so
one variable can't satisfy both.

Fix: pin the Redis host-side port in `docker-compose.yml` and keep `REDIS_PORT=6379`
for the app:

```yaml
# docker-compose.yml → sodax-redis.ports
- "6381:6379"        # was "${REDIS_PORT}:6379"
```

This is a local dev edit to a git-tracked file — revert with
`git checkout docker-compose.yml` if not wanted (then you must stop the host's
local redis-server to free 6379). Alternatively, stop the local redis and use
`REDIS_PORT=6379` for both.

### 4. Internal vs host port reference

| Service | Internal (app uses, in Docker) | Host mapping |
| ------- | ------------------------------ | ------------ |
| Mongo   | `27017`                        | `27017` (after fix; `27019` in default `.env-example`) |
| Redis   | `6379`                         | `6381` |
| swaps-api | `3008`                       | `3008` |

### 5. Verify

```bash
curl -sS http://localhost:3008/healthz/live          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3008/swaps/tokens   # 200
docker logs sodax-backend-sodax-swaps-api-1 | grep "Nest application successfully started"
```

Wait for boot with a retrying curl instead of guessing timing:
`curl --retry 30 --retry-delay 3 --retry-all-errors --retry-connrefused ...`.

### 6. SOLVER_CONFIG decides which solver → whether Stacks quotes work

The quote flow is: `POST /swaps/quote` → `SwapsService.getQuote`
(`apps/swaps-api/src/api/swaps/swaps.service.ts` ~L85-101) → `this.sodax.swaps.getQuote()`
(SDK translates spoke→hub addresses) → `POST ${solverApiEndpoint}/quote` (the
**solver**, a service outside this repo). swaps-api only forwards and maps errors.
A `"No path was found between 0x… and 0x…"` string is the **solver's** deterministic
rejection (code `-1`), mapped to **HTTP 422** in
`apps/swaps-api/src/api/swaps/error-mapper.ts` (~L64-73). It is NOT a bug in
swaps-api/SDK and has nothing to do with the request format or `srcPublicKey`.

The solver endpoint comes from env `SOLVER_CONFIG` (`apps/swaps-api/src/config/configuration.ts`
~L50) → `SodaxProvider` merges it as `overrides.solver` and calls `new Sodax(overrides)`
(`apps/swaps-api/src/shared/providers/sodax.provider.ts` ~L37-49). If `SOLVER_CONFIG`
is empty/unset the SDK default applies:

| Field | Default |
| ----- | ------- |
| `solverApiEndpoint` | `https://api.sodax.com/v1/intent` (**prod** solver) |
| `intentsContract` | `0x6382D6ccD780758C5e8A6123c33ee8F4472F96ef` |
| `protocolIntentsContract` | `0xaFf2EDb3057ed6f9C1dA6c930b8ddDf2beE573A5` |

Consequences:

- **Local BE with empty `SOLVER_CONFIG` → uses prod solver → Stacks (STX) quotes
  succeed** (prod solver has an STX route; hub asset `0x30b3b1a3e4f1235472772e60a8cd9c0165db641e`).
- **Canary (`canary-api.sodax.com`) returns "No path" for any STX-source quote**
  because canary is a separate deployment whose `SOLVER_CONFIG.solverApiEndpoint`
  points at a different solver that has no STX route yet. Non-Stacks pairs quote
  fine on canary, and prod's legacy solver (`api.sodax.com/v1/intent/quote`)
  returns a quote for the same STX hub pair — proving the two environments hit
  different solvers, not different code. STX is a **production** swap token
  (`@sodax/types` `packages/types/src/swap/swap.ts` `swapSupportedTokens[STACKS_MAINNET].STX`),
  so it is not a token-registration issue.
- **To reproduce the canary failure locally**, point the local BE at the canary
  solver:
  ```bash
  # in .env.dev
  SOLVER_CONFIG={"solverApiEndpoint":"https://<canary-solver>/v1/intent"}
  docker compose -f docker-compose.yml --env-file .env.dev up -d sodax-swaps-api
  ```
  The canary solver URL lives only in the canary deployment's env (Coolify), not
  in source.

The fix for the canary STX failure is operational (point canary at a solver that
has the STX route, or add STX liquidity/oracle to canary's solver) — not a code
change.

### 7. Stacks quote / create specifics — `srcPublicKey`

- The field is **`srcPublicKey`** (not `publicKey`), a top-level field on both
  `QuoteRequestV2` and `CreateIntentParamsV2` (both extend `SwapExtrasV2` in
  `@sodax/types` `packages/types/src/backend/backendApiV2.ts` ~L76-92, L240, L299).
- **Required** only when actually building a raw Stacks source tx:
  - `POST /swaps/quote` (plain price quote, no `includeTxData`) → NOT needed.
  - `POST /swaps/quote?includeTxData=true` with a Stacks source → needed.
  - `POST /swaps/intents` (create) with a Stacks source → needed.
  - `POST /swaps/gas/estimate` → NOT needed (tx already built).
- **Format**: compressed secp256k1 public key, hex, 66 chars, prefix `02`/`03`,
  **no `0x`**. Must derive to `srcAddress` (the `SP…` address) via
  `getAddressFromPublicKey`, else the SDK throws
  `srcPublicKey does not match srcAddress` or `not a valid Stacks public key`
  (`packages/sdk/src/shared/services/spoke/StacksSpokeService.ts` ~L140-169).
  The Stacks wallet provider exposes `getPublicKey(): Promise<string>`.
- Reason it exists: a Stacks `SP…` address can't be derived at raw-tx build time,
  so the unsigned `makeUnsignedContractCall` needs the signer's public key.

## Related

- Issues:
- Decisions:
- Code (sodax-backend): `apps/swaps-api/src/config/configuration.ts`,
  `apps/swaps-api/src/shared/providers/sodax.provider.ts`,
  `apps/swaps-api/src/api/swaps/error-mapper.ts`,
  `apps/swaps-api/README.md`, `docker-compose.yml`,
  `packages/shared-utils/src/utils/config-utils.ts`.
- Code (sodax-sdks): `packages/types/src/backend/backendApiV2.ts`,
  `packages/types/src/swap/swap.ts`,
  `packages/sdk/src/shared/services/spoke/StacksSpokeService.ts`,
  `packages/sdk/src/swap/SwapService.ts`.
