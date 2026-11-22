<!-- sodax-sdks: what this project adds to the default team rules (D67). Edit from the console (⋯ → Edit team rules). -->
Repo notes for sodax-sdks (AGENTS.md comes first where they differ):
- Run the setup command before the first commit: `pnpm install --frozen-lockfile && pnpm build:packages`. The pre-commit
  hook (.husky/pre-commit) runs `pnpm checkTs`, `pnpm build` and `pnpm test` for the whole workspace, so a hook failure
  in a package you did not touch means a stale install or dist, not your change: run the setup command again.
- While working, check only what the change reaches:
  `pnpm turbo run test --filter='...[{{BASE}}]' --filter='!./apps/node'`, then the same with `checkTs` (test builds the
  packages it depends on, and dependents type-check against that dist). turbo counts staged, unstaged and untracked
  files. The full hook runs once, at the Commit step.
- Because of that hook the commit takes several minutes and the full build is heavy: give the commit a 30 min timeout,
  and never re-run the full build when a warm retry will do. When the hook dies from memory pressure, reply COMMIT
  CHECK as the team rules say. `--no-verify` is forbidden (AGENTS.md): fix the gate, do not game it.
- The hook on main starts with `unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE` (since 2026-09-14). If .husky/pre-commit
  in this worktree lacks that line, merge main before committing: without it, a commit from a linked worktree writes
  `core.bare=true` and `commit.gpgsign=false` into the shared .git/config.
- Format only the files you changed (`pnpm exec biome format --write <files>`); `pnpm pretty` rewrites unrelated files.
- Never change pnpm-lock.yaml unless the task is a dependency change; pnpm-workspace.yaml enforces a 14-day release age,
  so fresh versions may not resolve.
