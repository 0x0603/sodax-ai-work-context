<!-- sodax-frontend team rules: the default rules plus repo notes. Edit from the console (⋯ → Rules). -->
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
