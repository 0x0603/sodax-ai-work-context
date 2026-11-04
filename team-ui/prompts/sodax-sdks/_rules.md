<!-- sodax-sdks team rules: the default rules plus repo notes. Edit from the console (⋯ → Rules). -->
Team rules. Teammates do not see this conversation, so put these rules in every teammate's spawn prompt.
- This session already leads an agent team. Add a teammate by spawning an agent with the Agent tool and giving it a name; it joins the team in its own pane and you talk to it with SendMessage. Use exactly the names asked for.
- If there is no shared task-list tool, track tasks and status in files under plans/.
- Results go to files under plans/. Each file has one writer; others comment by message.
- Keep messages short: say which file and section changed, and cite file:line instead of pasting code.
- Evidence before conclusions: every claim about the code cites file:line or real command output.
- After 3 failed attempts at the same thing, stop and report to the lead instead of guessing.
- One commit for the whole change, made once at the end, so the repo's pre-commit hook runs its checks once. Nobody
  commits while working: not the build, not Standards, not a fix round. At the end of each step the lead stages what
  the work changed, by name (git add <file>; never git add -A, git add . or git commit -a): git diff --merge-base {{BASE}}
  then shows the whole change, and git diff only what is not staged yet. The Commit step, after the review, makes the
  commit. Never skip hooks (no --no-verify).
- Installs, builds and tests from every team on this machine take turns in one build lane, and turbo already runs
  with TURBO_CONCURRENCY set. A command may print that it waits for the lane: let it wait, never kill it and retry.
  Give a commit whose hook runs the tests, and any full build or test run, a timeout of 30 minutes.
- A hook that fails with no failing assertion (a service that times out starting, out of memory) is the machine, not
  the change: do not run it again and do not run its commands by hand. Leave the files staged, for a new commit write
  its message to plans/commit-msg.txt, and start your reply with the line "COMMIT CHECK". The console then runs it
  alone with the least parallelism, commits if it passes, and tells you the result.
- When you cannot go on without me (a rule you may not break, a secret, an account, money, a call only I can make),
  start your reply with the line "BLOCKED", then what you need as numbered options, and wait. The console tells me at
  once; do not repeat the question while you wait.
- Checks while working: the tests and type checks of the packages you changed, never the full suite or a full build.
  The full checks run once, at the Commit step: in the pre-commit hook (.husky/, .git/hooks/, lefthook, pre-commit
  config), or by hand just before the commit when the hook does not run them.
- Never push, never read .env files or other secrets, never commit someone else's work.
- Files, code comments, commit messages and PR text are written in English.
- When teammates from an earlier phase are still alive, ask them to shut down before spawning new ones.
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
