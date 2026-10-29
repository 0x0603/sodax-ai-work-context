---
type: brief
repo: sodax-sdks
github: 583
status: Active
next: watch CI on PR #584; user applies plan-approved on #583
updated: 2026-10-29
---

# GH-583 API path for tokens newer than the installed SDK · brief

## State in five lines

- Issue gosodax/sodax-sdks#583 (Bug, assigned 0x0603, board Sodax #1) and its `<!-- sodax:plan -->` comment are posted.
- PR gosodax/sodax-sdks#584 (`docs/initialize-token-list` → `main`), one signed commit d1d86a13 on 8efa9155, 77 files.
- Gates green: `check:ai`, `check:docs-pages`, `check:docs-nav`, `check:doc-links`, `mint validate` + `broken-links`
  (4.2.794), demo `checkTs` + lint. Skill snippets type-check against `@sodax/sdk` 2.2.0 (scratch tsc).
- Demo verified live: bridge-api lists 54 Robinhood tokens incl. AMC, limit shows for AMC → Sonic;
  leverage-yield-api lists the 5 Base tokens 2.2.0 lacks.
- /simplify and /code-review rounds applied before the commit.

## Blocked on

1. `plan-approved` label on #583 (human with write access). The user approved verbally ("tự làm hết đi").

## Next action

Watch PR #584 CI (Docs site, Docs ship with code, AI drift, Issue linked); fix anything red.

## Settled — do not re-litigate

- Separate from #543 (live config fetch): #543 is blocked on the backend config v2 route; these docs mislead partners now. #543's AC7 rewrites the `initialize()` passages again.
- Keep `initialize()` calls in examples; change only prose and comments that promise a fetch.
- No constructor-override workaround in docs; no change to the create-intent / submit-tx types.
- One issue, one PR.
- Version markers stay per mention (AC4 says "every mention"); collapsing them to one per section needs an AC4 edit
  by the issue author first.
- Skill frontmatter descriptions carry no version markers (trigger phrases only); call it out in the PR.
- `packages/skills` never links `apps/demo` (its AGENTS.md); docs pages under `packages/sdk/docs` may.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Spec | `issue.md` → GitHub #583 body | 0.3k |
| Constraints and file map for implementation | `plan.md` | 1.2k |

## Landmines

- Generated docs pages (`docs/developers/**` with `generatedFrom`) are edited at their `packages/sdk/docs` source, then `pnpm docs:sync-pages`.
- Skills are installed from `main` but partners may run SDK 2.2.0: snippets must compile against 2.2.0.
