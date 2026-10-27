<!-- sodax-sdks team rules: the default rules plus repo notes. Edit from the console (⋯ → Rules). -->
Team rules. Teammates do not see this conversation, so put these rules in every teammate's spawn prompt.
- This session already leads an agent team. Add a teammate by spawning an agent with the Agent tool and giving it a name; it joins the team in its own pane and you talk to it with SendMessage. Use exactly the names asked for.
- If there is no shared task-list tool, track tasks and status in files under plans/.
- Results go to files under plans/. Each file has one writer; others comment by message.
- Keep messages short: say which file and section changed, and cite file:line instead of pasting code.
- Evidence before conclusions: every claim about the code cites file:line or real command output.
- After 3 failed attempts at the same thing, stop and report to the lead instead of guessing.
- One commit for the whole change, so the repo's pre-commit hook runs its checks once. Nobody commits while working.
  When the build is done, the lead stages the changed files by name and makes that one commit. Later steps (simplify,
  fixes after a review) fold their changes into it with git commit --amend --no-edit. Only if the branch has already
  been pushed (a pull request exists) add a new commit instead. Never skip hooks (no --no-verify).
- Tests while working: run the tests for what you changed. Run the full test command once, just before the commit,
  unless the pre-commit hook (.husky/, .git/hooks/, lefthook, pre-commit config) already runs it.
- Never push, never read .env files or other secrets, never commit someone else's work.
- Files, code comments, commit messages and PR text are written in English.
- When teammates from an earlier phase are still alive, ask them to shut down before spawning new ones.
Repo notes for sodax-sdks (AGENTS.md comes first where they differ):
- Run the setup command before the first commit: `pnpm install --frozen-lockfile && pnpm build:packages`. The pre-commit
  hook (.husky/pre-commit) runs `pnpm checkTs`, `pnpm build` and `pnpm test` for the whole workspace, so a hook failure
  in a package you did not touch means a stale install or dist, not your change: run the setup command again.
- Because of that hook a commit takes several minutes and the full build is heavy: commit with
  `TURBO_CONCURRENCY=2 git commit …` and a 600 s timeout, and never re-run the full build when a warm retry will do.
  `--no-verify` is forbidden (AGENTS.md): fix the gate, do not game it.
- The hook on main starts with `unset GIT_INDEX_FILE GIT_DIR GIT_WORK_TREE` (since 2026-09-14). If .husky/pre-commit
  in this worktree lacks that line, merge main before committing: without it, a commit from a linked worktree writes
  `core.bare=true` and `commit.gpgsign=false` into the shared .git/config.
- Format only the files you changed (`pnpm exec biome format --write <files>`); `pnpm pretty` rewrites unrelated files.
- Never change pnpm-lock.yaml unless the task is a dependency change; pnpm-workspace.yaml enforces a 14-day release age,
  so fresh versions may not resolve.
