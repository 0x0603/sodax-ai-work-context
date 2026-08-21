---
type: knowledge
area: operations
status: Stable
tags: [swaps-api, backend, docker, solver, stacks, runbook, env, mongo, redis, rpc-config, apps-demo, allowance]
updated: 2026-08-21
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

- Port: **3008** (`SWAPS_API_PORT`) via `.env.dev`. Swagger UI at `/docs`, OpenAPI at `/docs-json`.
- `make run-dev-swaps-api` → `docker compose -f docker-compose.yml --env-file .env.dev up -d sodax-swaps-api --build`.
- The `sodax-swaps-api` service `depends_on` mongo + redis, so one command brings up all three.
- Node engine wanted: `22.18.x` (Docker image handles it; only matters for the non-Docker `pnpm start:dev` path).

**Same thing via `.env` (`PROD_ENV`) instead of `.env.dev`** (e.g. to run the real prod docker
target, `Dockerfile` `target: swaps-api`, rather than the dev compose profile):

```bash
docker compose -f docker-compose.yml --env-file .env up -d --build sodax-swaps-api
curl http://localhost:3009/healthz/live   # SWAPS_API_PORT=3009 in this local .env — different from .env.dev's 3008
```

Verified end-to-end again on 2026-08-21 this way: `healthz/live → {"status":"ok"}`,
`/swaps/allowance/check → {"valid":true}` (no `/v1` prefix locally — that only exists on the
deployed gateway, `api.sodax.com/v1/...`). Hits the exact same gotchas below — same root causes,
this `.env` just happened to also be missing `BRIDGE_API_PORT` (gotcha #3).

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

Equivalent alternative fix, if you'd rather not touch the shared `MONGO_HOST`/`MONGO_PORT`
components (e.g. other host-side tooling in the same `.env` still relies on the `127.0.0.1`
values): set `MONGO_URI` directly instead, pointed at the compose service name on Mongo's real
internal port:

```bash
MONGO_URI=mongodb://root:localdev@sodax-mongo:27017/sodax?authSource=admin&directConnection=true
```

(user/password/db must match that `.env`'s `MONGO_USER`/`MONGO_PASSWORD`/`MONGO_DB`.) Same root
cause as above, just fixed at the URI level instead of the component level.

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

### 4. GOTCHA #3 — `BRIDGE_API_PORT` unset breaks `docker compose up` for EVERY service, not just bridge-api

Symptom: `docker compose ... up -d --build sodax-swaps-api` (targeting only swaps-api) fails
immediately with `no port specified: :<empty>` and nothing starts — no build, no container.

Root cause: compose interpolates env vars for the **whole file** up front, regardless of which
service you target. `sodax-bridge-api`'s `ports: "${BRIDGE_API_PORT}:${BRIDGE_API_PORT}"` resolves
to `":"` when `BRIDGE_API_PORT` is unset, which is invalid syntax → the entire `up` invocation
aborts before touching swaps-api at all. Neither `.env` nor `.env.dev` set `BRIDGE_API_PORT` by
default (bridge-api isn't expected to run in these local profiles).

Fix: set any value, e.g. `BRIDGE_API_PORT=3008` — bridge-api doesn't need to actually start for
this to work, the var just needs to resolve to something.

Same class of bug could in principle hit any other unset `${X_PORT}:${X_PORT}` mapping in the file
(`STATEFUL_API_PORT`, `API_PORT`, `SWAPS_API_PORT`, `SPONSORING_API_PORT`) — check
`grep -n '"\${.*_PORT}:\${.*_PORT}"' docker-compose.yml` against your `.env`/`.env.dev` if `up`
fails the same way for a different service.

### 5. Internal vs host port reference

| Service | Internal (app uses, in Docker) | Host mapping |
| ------- | ------------------------------ | ------------ |
| Mongo   | `27017`                        | `27017` (after fix; `27019` in default `.env-example`) |
| Redis   | `6379`                         | `6381` |
| swaps-api | `3008` (`.env.dev`) / `3009` (`.env`) | same as internal |

### 6. Verify

```bash
curl -sS http://localhost:3008/healthz/live          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3008/swaps/tokens   # 200
docker logs sodax-backend-sodax-swaps-api-1 | grep "Nest application successfully started"
```

Wait for boot with a retrying curl instead of guessing timing:
`curl --retry 30 --retry-delay 3 --retry-all-errors --retry-connrefused ...`.

### 7. SOLVER_CONFIG decides which solver → whether Stacks quotes work

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

### 8. Stacks quote / create specifics — `srcPublicKey`

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

### 9. Which RPC is swaps-api actually using per chain?

The startup log prints the resolved config under `context: "ConfigService"` — check
`"rpcConfig"` there first instead of guessing. Neither `.env` nor `.env.dev` set `RPC_CONFIG`
by default → `"rpcConfig": {}` → no override applied → `SodaxProvider` logs nothing about RPC
overrides and calls `new Sodax()` with the SDK's own packaged per-chain RPC
(`@sodax/types` `packages/types/src/chains/chains.ts`, e.g. `ChainKeys.ETHEREUM_MAINNET.rpcUrl`
= `https://eth.merkle.io`). Verified this is what the local backend actually hits: an independent
`eth_call` to the same RPC from outside the container returned the same allowance value the
backend's `/swaps/allowance/check` returned.

To override: `RPC_CONFIG` is a stringified JSON keyed by `SpokeChainKey`
(`apps/swaps-api/src/config/configuration.ts`, applied in `sodax.provider.ts`), e.g.
`RPC_CONFIG='{"ethereum":{"rpcUrl":"https://your-node"}}'`.

**Don't confuse this with `ARCHIVE_NODE_URLS`** — that's a *separate* env var that only feeds
**Sonic hub-chain** reads (data-aggregator / task-executor), not spoke-chain (Ethereum, etc.) swap
RPC calls. Both `.env` and `.env.dev` currently carry a placeholder second entry there:
`ARCHIVE_NODE_URLS="https://rpc.soniclabs.com,https://backup-rpc.example.com"` — `backup-rpc.example.com`
is not a real endpoint, so hub-chain read failover is currently broken locally (primary-only,
no actual backup). Worth fixing if the hub-chain aggregator/task-executor local dev ever needs it.

### 10. Point `sodax-sdks`' `apps/demo` at a local swaps-api

`apps/demo` has **two different swap pages that are easy to confuse**:

- **`/swaps-sdk`** — calls `sodax.swaps.*` **client-side**, straight from the browser to chain RPC.
  Never goes through `sodax-backend`'s REST API, no matter what env vars are set.
- **`/swaps-api`** (`components/swaps-api/SwapCard.tsx`) — calls `sodax.api.swaps.*` (via
  `@sodax/swaps-api`), which actually hits this backend's `/v1/swaps/*` REST endpoints. **This is
  the one to use** when the goal is to reproduce/debug the REST API, not the SDK's direct-RPC path.

Setup, in `sodax-sdks`:

```bash
pnpm build:packages   # only if packages/* has source newer than dist
pnpm dev:demo         # or: pnpm --filter sodax-demo-v2 dev
```

`apps/demo/.env` (gitignored, see `apps/demo/example.env`):

```
VITE_SWAPS_API_BASE_URL=http://localhost:3009   # bare origin — the SDK appends /swaps/* itself, no /v1
```

Open `http://localhost:3000/swaps-api`.

### 11. Verify allowance on-chain directly (bypass both backend and demo)

Useful when the API's own answer is in question. `isAllowanceValid`
(`packages/sdk/src/shared/services/erc-20/Erc20Service.ts`) is just
`allowance(owner, spender) >= amount` read via `eth_call` — reproduce with any public RPC:

```bash
# selector 0xdd62ed3e = allowance(address,address); pad each address to 32 bytes, no 0x prefix
OWNER="000000000000000000000000<owner>"
SPENDER="000000000000000000000000<spender>"
curl -s -X POST https://ethereum-rpc.publicnode.com -H 'content-type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"to\":\"<token address>\",\"data\":\"0xdd62ed3e${OWNER}${SPENDER}\"},\"latest\"]}"
```

For a spoke chain (e.g. Ethereum), `spender` is that chain's `assetManager`
(`packages/types/src/chains/chains.ts`, `<chain>.addresses.assetManager`) — **never** the hub
intents contract, and **never** a router/DEX address. Approving the wrong spender is the most
common cause of "I approved but `/swaps/allowance/check` still says false" — confirmed this by
decoding a user's actual `approve()` calldata (`0x095ea7b3` + spender + amount) and cross-checking
the spender against `assetManager` before/after their tx confirmed on-chain.

## Related

- Issues:
- Decisions:
- Code (sodax-backend): `apps/swaps-api/src/config/configuration.ts`,
  `apps/swaps-api/src/shared/providers/sodax.provider.ts`,
  `apps/swaps-api/src/api/swaps/error-mapper.ts`,
  `apps/swaps-api/src/api/swaps/swaps.service.ts`,
  `apps/swaps-api/README.md`, `docker-compose.yml`,
  `packages/shared-utils/src/utils/config-utils.ts`.
- Code (sodax-sdks): `packages/types/src/backend/backendApiV2.ts`,
  `packages/types/src/swap/swap.ts`,
  `packages/types/src/chains/chains.ts`,
  `packages/sdk/src/shared/services/spoke/StacksSpokeService.ts`,
  `packages/sdk/src/shared/services/erc-20/Erc20Service.ts`,
  `packages/sdk/src/swap/SwapService.ts`,
  `apps/demo/src/providers.tsx`, `apps/demo/src/components/swaps-api/SwapCard.tsx`.
