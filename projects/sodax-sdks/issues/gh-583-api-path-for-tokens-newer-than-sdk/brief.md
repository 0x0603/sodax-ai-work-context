---
type: brief
repo: sodax-sdks
github: 583
status: Active
next: refresh the PR #584 body, watch CI after the main merge
updated: 2026-11-05
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

Nothing. `plan-approved` is on #583 (checked 2026-11-01).

## Next action

Merged `origin/main` (8e02d9ad) as signed d9699663, pushed 2026-11-05; PR is MERGEABLE.
Only conflict was `BridgeCard.tsx`: main #586 made the same switch to API tokens + API limit with symbol-keyed picks,
so the PR's `isSameToken` effects and `isPairSettled` were dropped; kept the review-pair guard and the dialog's
`!isBridgeable` gate. Watch CI, then update the PR body (its "Bridge API page lists 29 Robinhood tokens"
before-state is now fixed by #586).

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
