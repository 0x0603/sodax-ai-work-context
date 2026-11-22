<!-- sodax-backend: what this project adds to the default team rules (D67). Edit from the console (⋯ → Edit team rules). -->
Repo notes for sodax-backend (CLAUDE.md comes first where they differ):
- Node 22.23.x is required (package.json engines, .nvmrc); the console puts it first on PATH. If `node -v` says
  something else, stop and report.
- Run the setup command before the first commit: `pnpm install --frozen-lockfile && pnpm build:packages`. Apps
  type-check against the packages' built dist (`main: ./dist/index.js`) and turbo's `checkTs` does not build them first,
  so a checkTs or test failure in a package you did not touch means a stale install or dist: run the setup command again.
- While working, check only what the change reaches: `pnpm checkTs --filter='...[{{BASE}}]'` and
  `pnpm test --filter='...[{{BASE}}]'` (turbo counts staged, unstaged and untracked files and adds the packages that
  depend on them). The repo-wide checks run once, in the hook at the Commit step.
- The pre-commit hook (.husky/pre-commit) runs `pnpm checkTs`, `pnpm test` and lint-staged repo-wide, so the commit takes
  long: give it a 30 min timeout (CLAUDE.md uses 20 min for install, build, checkTs and test). Some integration tests run
  against a real Postgres container (turbo.json, `apps/api-auth`), so Docker must be running; if it is not, report it
  instead of skipping tests.
- On a laptop the hook's parallel `pnpm test` starts many in-memory MongoDBs at once, and one of them can fail with
  `Instance failed to start within 30000ms` in a different file each run (2026-11-03). That is the machine: reply
  COMMIT CHECK as the team rules say.
- Do not add a `.env` to any app folder: `apps/bridge-api/test/unit/radfi-config.spec.ts` asserts that the config
  throws when the Bound secrets are missing, and dotenv loads the app's .env at test time.
- Never change pnpm-lock.yaml unless the task is a dependency change (`--frozen-lockfile` keeps it untouched).
