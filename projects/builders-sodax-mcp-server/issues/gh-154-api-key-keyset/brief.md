---
type: brief
repo: builders-sodax-mcp-server
github: 154
status: Active
next: on the user's word, branch feat/154-api-key-keyset off origin/development and build plan.md steps 1-9
updated: 2026-11-27
---

# GH-154 Verify API keys against the api-auth keyset · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- The plan is final (2026-11-27). No code and no branch yet.
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
  accepted.

## Waiting on

- Robi (R0bi7): the verifier token, which blocks the release. Also ask him whether prod sets
  `DISCORD_WEBHOOK_URL`, and whether Coolify keeps the old container when a new one fails.

## Next action

1. On the user's word, branch, then build steps 1-9.
2. Commit only on the user's word.

## Watch

- #146 (drop SSE) merges last, so this PR keeps the SSE re-check. PR #150 (bridge) touches the same
  files; whichever merges second resolves the conflict.

## Files

| File | Answers |
|---|---|
| `plan.md` | behaviour, keyset contract, steps with file:line, tests, release and post-release check, open |
| `process.md` | the original and follow-up plan reviews; resolved findings and the org-attribution test clarification |
