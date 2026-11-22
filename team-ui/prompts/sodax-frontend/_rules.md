<!-- sodax-frontend: what this project adds to the default team rules (D67). Edit from the console (⋯ → Edit team rules). -->
Repo notes for sodax-frontend (CLAUDE.md comes first where they differ):
- Run the setup command before the first commit: `pnpm install --frozen-lockfile` (without `--ignore-scripts`: the
  `prepare` script wires husky into this worktree; CI skips it, agents must not).
- The pre-commit hook runs only lint-staged and gitleaks. The tests are not in it: run `pnpm checkTs && pnpm test`
  yourself just before the commit.
- The test suite is small: `apps/web/scripts/*.test.mjs` under `node --test` (CLAUDE.md). UI changes have no automated
  tests, so verify them with `pnpm lint`, `pnpm checkTs` and `pnpm build`, and say in plans/ what you checked by hand.
- `pnpm lint` is Biome with `--write`: it rewrites files across the app. Run it, then keep only the changes in files
  you touched.
- checkTs errors that name files you did not touch are local rot, not your change: delete `apps/web/.next/types` and
  run the setup command again. CI does a clean checkout and never sees them.
