---
type: brief
repo: sodax-backend
github: 1372
status: Active
next: wait for Paul (bridge-api API_KEY_ENFORCEMENT, write cap, rollout inputs); post nothing more on the PRs
updated: 2026-10-22
---

# GH-1372 Per-org rate limit · brief

**State (2026-10-22).** Code done and pushed; Paul's three remarks addressed. PRs open, CI green, waiting
for review: sodax-backend #1380 (`432d4070`) and sodax-unified-api #136 (`cd05f43`). The #1380 body, the
plan comment and the rollout comment on #1372 match the code. Reply to Paul posted
(#1380 issuecomment-6333330834); the user said not to comment further.

**Waiting on.** Paul: bridge-api's prod `API_KEY_ENFORCEMENT`, keep or lift the 120/min write cap, the
verifier token and gateway access, someone to run the usage check, reviewers.

**Next action.** Report Paul's answers to the user. After merge, the owners run the rollout
(`plan.md` → Rollout).

**Local stack.** `./manual-env.sh` runs dashboard :3010, api-auth :3122, edge :18090, Postgres :55450,
Mongo :27051 and the sidecar; migrated to 0004 on 2026-10-22. `./manual-env.sh info` prints tokens and keys;
`./manual-env.sh down` stops it.

## Files

| File | Answers |
|---|---|
| `plan.md` | decisions, contracts, what shipped, rollout, open questions, verification, risks |
| `issue.md` | the issue as written |
| `manual-env.sh` + `e2e-lib.sh` | long-running local stack for hand tests |
| `manual-checks.sh` | hand-test checklist against that stack (~3 min) |
| `e2e-local.sh` | self-contained edge e2e (22 checks) |
| `edge-boot-matrix.sh` | which map-file states stop HAProxy 2.8 from starting |
