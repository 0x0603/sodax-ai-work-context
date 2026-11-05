# GH-1424 local wallet test · recipe

Runs PR #1439's stateful-api and the web app locally, so a real Stellar wallet can sign the terms.
Nothing here touches prod. Each script in `local-test/` takes the backend worktree path as its first
argument and loads its dependencies from there. `<wt>` below is
`sodax-command-center/repos/backend/sodax-backend/.claude/worktrees/1424-stellar-register-users-rejects`.

## 1. Mongo and Redis

Docker was off and `mongod` was not installed, so Mongo runs from `mongodb-memory-server`:

```bash
node local-test/mongo-1424.cjs <wt> <empty-data-dir>   # rs0 on 127.0.0.1:27027, prints "MONGO READY"
```

Redis must be up on `localhost:6379`.

## 2. stateful-api from the PR branch

`pnpm i && pnpm build:packages` in `<wt>`, then `pnpm run build` in `apps/stateful-api`. Make an env
file outside every repo (`umask 077`) with these keys:

```
NODE_ENV=dev  LOG_LEVEL=info  CHAIN_ID=146  REDIS_HOST=localhost
MONGO_URI=mongodb://127.0.0.1:27027/?replicaSet=rs0  MONGO_DB=sodax-stateful
RUN_STATEFUL_API=true  STATEFUL_API_PORT=3007
BETTER_AUTH_SECRET=<fresh random, e.g. openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3001/portal/api/auth
```

`CHAIN_ID` and both `BETTER_AUTH_*` keys are required, or boot throws. Start it with
`set -a && . <env> && set +a && node dist/src/main`. The app has a global `api` prefix, so the routes
are `POST /api/users/register` and `GET /api/users/<address>/chain/STELLAR`.

## 3. Web app

Create a detached `sodax-frontend` worktree at `origin/main` and run `pnpm install`. In
`apps/web/apis/users.ts`, set `BASE_URL = 'http://localhost:3007/api'`. This edit is local only: never
commit it. Run `pnpm --filter web dev` (serves `localhost:3001`). CORS already allows `localhost:*`.
The `DATABASE_URI` log line comes from the CMS case studies and does not affect this test.

## 4. Test

- `node local-test/verify-1424-vectors.cjs <wt>`: the two Discord payloads. Expect old `false`,
  new `true`. Needs `shared-utils` built.
- `node local-test/smoke-1424.cjs <wt>`: expect SEP-53 201, legacy 201, wrong key 400,
  duplicate 400, CORS echoing `http://localhost:3001`.
- Real wallet: open `localhost:3001/exchange/swap`, connect a Stellar wallet, tick the terms box,
  accept and sign.
  - The modal closes: 201, pass.
  - The button spins, then returns to idle: 400, the bug.
  - Try Freighter (SEP-53) and the current Hana release (legacy).
- `node local-test/check-users-1424.cjs <wt>`: lists the Stellar users with
  `format=SEP-53|legacy` and `oldCodeWouldAccept`.
- `check-users-1424.cjs <wt> --wipe`: empties the users so the modal shows again. Each address
  registers only once.
