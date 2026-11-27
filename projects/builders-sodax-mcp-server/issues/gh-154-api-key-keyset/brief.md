---
type: brief
repo: builders-sodax-mcp-server
github: 154
status: Active
next: branch feat/154-api-key-keyset pushed at 1dff915, no PR yet; the hand test against the gh-1372 api-auth stack is still to do
updated: 2026-11-27
---

# GH-154 Verify API keys against the api-auth keyset · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Code written (2026-11-27), uncommitted, in worktree `sodax-command-center/repos/client/builders-sodax-mcp-server-wt-154`
  on `feat/154-api-key-keyset` (from `origin/development` a36489d). Gates: checkTs, build, 1438 tests green.
  `/simplify` and `/code-review` fixes applied:
  - `API_KEY_UNKNOWN` is now 403, because a 401 starts OAuth in MCP SDK clients;
  - the URL and poll values are bounded;
  - the interval survives a throwing `onPoll`;
  - a failed poll cancels its body;
  - stdio no longer parses the mode. Lint fails only on `server.json`, which is pre-existing: development CI is red at a36489d.
  The repo has no `docs/kb`.
- A plan review (`process.md`) is folded into `plan.md`:
  - a valid empty keyset is accepted;
  - SSE messages are re-checked in `monitor` too;
  - revocation takes effect after the next successful poll;
  - the boot 503 applies in `enforce` only;
  - a 304 resets freshness;
  - refusals log their outcome.
- Default `enforce`. A failed first poll never stops the server. A post-release check uses curl.
- The follow-up review found no remaining blocker. Its one test clarification is in `plan.md`:
  `caller.org_id` appears only when the key matched.
- The issue body and the plan comment (issuecomment-7185920687) were synced to this plan on 2026-11-27:
  default `enforce`, the boot criterion, revocation after the next successful poll, an empty keyset
  accepted. Synced again after the code review: 403 for `API_KEY_UNKNOWN`, the URL and poll bounds,
  `/health` without `keyCount`/`version`, no `stop()` on shutdown.

## Waiting on

- Robi (R0bi7): the verifier token, which blocks the release. Also ask whether prod sets
  `DISCORD_WEBHOOK_URL`, and whether Coolify keeps the old container when a new one fails.

## Next action

1. Hand test against the gh-1372 local api-auth (plan step 9). Migrate that stack to 0006 first.
2. On the user's word: open the PR against `development`. Its lint job fails on the pre-existing `server.json`
   format drift (red on `development` at a36489d too).

## Watch

- #146 (drop SSE) merges last, so this PR keeps the SSE re-check. PR #150 (bridge) touches the same
  files; whichever merges second resolves the conflict.

## Files

| File | Answers |
|---|---|
| `plan.md` | behaviour, keyset contract, steps with file:line, tests, release and post-release check, open |
| `process.md` | the original and follow-up plan reviews; resolved findings and the org-attribution test clarification |
