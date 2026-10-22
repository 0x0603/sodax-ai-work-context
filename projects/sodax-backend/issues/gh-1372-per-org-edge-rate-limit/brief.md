---
type: brief
repo: sodax-backend
github: 1372
status: Active
next: wait for Paul's answers on #1380 (bridge-api API_KEY_ENFORCEMENT, write cap, topology docs); no further PR comments
updated: 2026-10-22
---

# GH-1372 Per-org rate limit · brief

**State (2026-10-22):** Paul's three remarks are done and pushed. #1380 `dcf4f0b7` (+ a principal-assertion
test commit after it): `OrgLimitAwareThrottlerGuard` skips the in-app 10/60s submit-tx throttle for a key whose
org has a limit (opt-in on the 3 submit routes; sponsoring-api untouched); `isOrgLimit` moved to shared-enums;
migration `0004` moves every existing org from `pro` to `base`; docs say one HAProxy, one counter per org. #136
`cd05f43`: docs/comments only. CI green on both. #1380 body and the rollout comment (#1372 issuecomment-6309961777,
steps 2/7/8 + rollback SQL) updated; reply to Paul posted (issuecomment-6333330834). The user said: post no
further comments. Details: `process/03-2026-10-21-local-e2e-harness.md`, last sections.

**New local follow-up:** post-simplify changes are being edited. The twelve-finding triage is in
`finding-triage-2026-10-21.md`: privileged temp-symlink writes were reproduced in a dummy container,
and a fresh 304 can incorrectly report healthy with zero applied maps. The earlier pushed-head
assessment below does not approve the new working-tree changes or close these follow-up concerns.

**Latest independent verification:** pushed heads #136 `d1015b1` and #1380 `5c460604` match local
clean working trees. Both previous P1s are resolved; no new P0/P1 found. Sidecar 70/70 on host and
Linux Python 3.8, real HAProxy integration 26/26, and GitHub CI pass. See the final section of
`review-quality-fixes-2026-10-21.md`; a mixed-map fallback sentence in the PR body still needs narrowing.

**State (2026-10-21):** all review, security and code-quality fixes are committed and pushed: backend
#1380 at `24b0f192`, gateway #136 at `deadcab` (later batches: /simplify + /code-review fixes, a real-HTTP guard
test, a 50k-key push and raw header bytes in the CI test). Since the first push: write-cap P1 (`856743e`), honest
sidecar status, typed config, an flock so `--once` never runs beside the service, the verifier token kept out
of errors (`aaa4c6a`), and a real-HAProxy CI job `tests/edge-rate-limits.sh` (`d1015b1`) that fails on the
earlier limiter-order bugs. Reviews: `review-fixes-2026-10-21.md`, `code-quality-review.md`,
`review-quality-fixes-2026-10-21.md` (all addressed). Both PR bodies match the pushed code.

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

Earlier local reviews are historical; their blocking findings are addressed in the pushed heads above.
File splitting remains deferred. Typed Config, initial-success health, partial-apply tests, flock,
runbook changes and the real-HAProxy CI job are committed.

## State in five lines

- The user owns this task. PRs open: sodax-backend #1380 (`dcf4f0b7`+) and sodax-unified-api #136
  (`cd05f43`). Paul's remarks addressed; open questions to Paul are listed in the reply on #1380.
- Direction set by Paul: HAProxy + a sidecar polling `/v1/keyset`; default tier Base; flexible
  tiers/limits; gateway docs update is in scope.
- Implemented: auth-server tier defaults + org overrides, effective limits in the keyset, dashboard
  editors, and the gateway sidecar/HAProxy limiter. Gateway prep still needs socket group + map files.
- HAProxy 2.8 mechanics verified locally (map files must pre-exist on 2.8).
- No divisor: one HAProxy counts a client's prod traffic. The earlier "2x" was IPv4 + IPv6 counted as
  two IPs (session 1, "Divisor withdrawn"). canary-api is a separate HAProxy.

## Blocked on

Nothing blocks coding. Deploy needs a verifier token from Paul and gateway access.

## Next action

Wait for Paul's answers (bridge-api `API_KEY_ENFORCEMENT` on prod, keep or lift the 120/60s write cap for
keyed orgs, whether the gateway repo's topology docs are stale); report them to the user, post nothing.
Then reviewer sign-off and the rollout in the #1372 comment. Rollout still needs gateway access and
verifier/webhook provisioning.

## Settled — do not re-litigate

- HAProxy is the enforcement point (Paul). One HAProxy serves all prod, so one counter per org (Paul,
  2026-10-21; the user chose to follow him over the gateway repo's topology docs); no divisor, no Redis.
- The submit-tx throttle skip is a separate opt-in guard, not a change to `HaproxyThrottlerGuard`; the
  edge write cap stays. Tier limits are set by hand after the sidecar runs, never seeded by migration.
- Existing orgs move to `base` by migration `0004`, not by a manual UPDATE (the user, 2026-10-22).
- Tier names/scopes in code; tier limits as data in api-auth; org override in `tenants.limits`.
- Limit must be a positive integer; 0/missing = no org limit. Never a 401 from the limiter.
- Hash input = the whole value of the only `x-api-key` header (`req.fhdr`, `fhdr_cnt eq 1`); a repeated or
  comma-joined header is keyless at the edge and `unknown_key` at the app guard. Was "first header" until
  2026-10-21 (/code-review #5).
- Per-org override (`tenants.limits` over the tier default) stays: the user expects special cases
  (2026-10-21). So findings #4, #9, #10 in `review-2026-10-21.md` are fixed, not removed.
- The org cap stays route-agnostic (every non-portal route), like the per-IP cap it replaces for keyed
  callers (2026-10-21). Finding #5 is an FYI for Paul (size tier limits for all keyed traffic), not a fix.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the issue asked | `issue.md` | 0.6k |
| The plan: decisions, contracts, rollout | `plan.md` | 1.6k |
| Implementation spec, sodax-backend PR | `plan-backend.md` | 2.6k |
| Implementation spec, sodax-unified-api PR | `plan-gateway.md` | 3.3k |
| Session index: planning, implementation and reviews | `process.md` | 0.2k |
| Initial review (historical; findings since addressed) | `review.md` | 2k |
| Latest review at a88f7a7 / da77c015 and verification | `review-followup.md` | 1k |
| Review of the uncommitted fixes; remaining write-cap accounting P1 | `review-fixes-2026-10-21.md` | 1.2k |
| Review of the user's seven-step post-merge rollout table | `rollout-plan-review.md` | 1k |
| Sidecar maintainability, overclaims and partial-apply/initial-health probes | `code-quality-review.md` | 1k |
| Latest pushed-head review: both P1s resolved, 70 self-tests and 26 HAProxy checks pass | `review-quality-fixes-2026-10-21.md` | 2k |
| Twelve-finding triage: privileged symlinks, first-304 readiness and header/test contract | `finding-triage-2026-10-21.md` | 1k |
| Short mechanism explanation and architecture assessment | `mechanism-overview.md` | 0.9k |
| Security assessment: org-cap bypass reproduction, redirect token handling and map-file boundary | `security-assessment.md` | 1.3k |
| Test both PRs end to end on this machine (`./e2e-local.sh`, Docker; setup in `e2e-lib.sh`) | `e2e-local.sh` | 2k |
| Hand-test stack: dashboard + service sidecar (`./manual-env.sh up`) | `manual-env.sh` | 1.5k |
| The hand-test checklist as a script, run against that stack (`./manual-checks.sh`, 41 checks) | `manual-checks.sh` | 2k |
| Which map-file states stop HAProxy from starting (`./edge-boot-matrix.sh`) | `edge-boot-matrix.sh` | 0.8k |
| 2026-10-21 /code-review: 15 findings, 3 reproduced; scope vs the Paul chat | `review-2026-10-21.md` | 1.5k |
| Shared-counter designs (not needed: premise withdrawn) | `design-global-quota.md` | 1.5k |
| Result | `outcome.md` | 0k |

## Landmines

- Tier names are lowercase; an unknown tier fails closed to zero scopes — `Base` != `base`.
- Paul's Base UPDATE must run after the backend with `base` is deployed, or minting breaks.
- HAProxy 2.8 has no `opt@`/`virt@` map prefixes — the deploy agent must create map files first.
- Open-source HAProxy `peers` overwrite counters, they do not sum them.
- The edge counts IPv4 and IPv6 as two clients: pin `curl -4` / `curl -6` when probing a cap.
- zsh: `git show $R:path` breaks (`:a` is a modifier) — write `"${R}:path"`.
