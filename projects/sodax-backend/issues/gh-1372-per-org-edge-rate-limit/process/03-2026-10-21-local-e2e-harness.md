---
type: process
repo: sodax-backend
github: 1372
session: 3
updated: 2026-10-21
---

# Reusable local e2e harness

- Added `../e2e-local.sh`: Postgres 17.6 + api-auth from the backend checkout + `keyset-sync.py --once`
  + the PR's `haproxy.cfg` in haproxy:2.8, probed with curl. 22/22 checks pass at backend da77c015,
  gateway a88f7a7. API unit 76/76 (integration 25 skipped without a DB), sidecar self-test 43/43.
- Local-only cfg edits: plain `bind :8080`, keyset socket on TCP :9999, origin servers `disabled`.
  So the unix socket group/mode is not covered here (CI `haproxy -c` covers it).
- Harness pitfalls hit on the first run: parallel curls interleave bodies on one pipe (classify by
  status + Retry-After instead); `kill` on a `( cd && node )` subshell orphans node (use `exec node`).
- Existing behaviour, not this PR: the service-token guard answers 401 (not 403) for a verifier token
  on a provisioner route.
- Later the same day: split setup into `../e2e-lib.sh`, added a jail scenario (24 checks pass), and
  `../manual-env.sh` (service sidecar at 5s, dashboard on :3010, `probe`/`maps`/`status` helpers).
  Exact-count bursts run sequentially: parallel ones race on HAProxy's shared counters (one extra 429).
- Full automated run at the same heads: api-auth 101/101 incl. 25 integration on Postgres 17.6,
  api-auth-client 45/45, checkTs + Biome clean (api-auth, client, dashboard, shared-enums), CI
  `haproxy -c` valid (and fails without the `sodax-keyset` group, as intended), self-test 43/43 on host
  and Python 3.8, `ensure_map_files` creates/keeps/ignores correctly, deploy agent self-test only
  missing gateway host tools in a container.
- /code-review results and the scope check against the Paul chat: `../review-2026-10-21.md`.
- `manual-env.sh` now starts a throwaway Mongo (:27051, db `e2e`) with 3 fake Better Auth orgs, so the
  dashboard's Organisations tab lists them (it needs `auth_organization` with ObjectId `_id`s; without
  Mongo the tab is empty). `DASHBOARD_MONGO_URI=... up` reads a real Mongo instead; the dashboard then
  writes each admin action to that Mongo's `dashboard_audit_log`.
- Pitfall: a backgrounded shell function is a bash subshell, so `$!` was not the python pid and `down`
  left old sidecars polling with stale tokens; they shared the status file and flipped it to unhealthy.
  Fixed with `(exec env ... nohup python3 ...) &` plus a `pkill` in `down`.
- Fixed findings 1, 2, 14 (uncommitted). cfg: `rl_over_org` reads `table_http_req_rate(st_rl_org)` before
  `track-sc3`, so only allowed requests count; `st_rl_rate` also stores `gpc0_rate(10s)`, bumped by
  `sc-inc-gpc0(0) if !rl_portal !rl_keyed`, and the rate cap reads it, while the jail keeps
  `http_req_rate`. Design doc 4.1 + ADR-004 updated. Dashboard: both PATCH routes 400 on a non-object
  body. Verified: `haproxy -c` valid (only the old prometheus warning), e2e 26/26 incl. two new checks,
  lockout replay 7/10 pass (was 0), dashboard checkTs + Biome clean, curl null/5/"x" → 400.
- Resilience pass (user worried a sidecar crash blocks users; it does not). Manual env: SIGKILL the
  sidecar -> edge keeps enforcing the last maps (keyed 400/400, keyless 300/310); a policy change while
  dead stays unapplied and `--status` says STALE; HAProxy cold restart with the sidecar dead and a junk
  `.tmp` left behind loads the maps from disk; sidecar back -> change applied within one poll, tmp gone.
  e2e now 28 checks (cold restart added). `edge-boot-matrix.sh`: HAProxy 2.8 REFUSES to start only on a
  missing map file / dir or a non-integer limit (hand edit); empty, header-only, 50k keys all start.
  The sidecar cannot produce those states (validated rows, tmp + fsync + rename), and a failed reload
  keeps the old workers; the outage path is a human deleting the files then a cold start/reboot.
- Second fix batch (uncommitted): guard key shape, keyset valid-only limits, sidecar no-redirect + https +
  dir fsync + quiet-200 drift + `--watchdog` (own systemd timer, liveness only), deploy agent refuses a
  missing maps dir, docs/help text (#7, #10, #11, #15, #3, runbook "never delete map files"). Verified:
  api-auth 106/106 incl. integration, client 48/48, tsc/lint/format clean, self-test 55/55 (host + 3.8)
  with each new case killed by a mutant, `systemd-analyze verify` clean, e2e all pass, boot matrix 8/8,
  NBSP old-vs-new guard on a real HTTP parse (`security-assessment.md` status section).
- Committed and pushed: backend 5c460604 (one commit; the full-monorepo pre-commit hook flaked twice on
  MongoMemoryServer start timeouts in apps/api and task-executor under load, passed with
  TURBO_CONCURRENCY=2), gateway 0a0cecd + 6abc75d + 856743e. Codex's review of the uncommitted fixes
  found a P1: track-sc3 ran before the write-cap refusal, so write-cap 429s still charged the org.
  Fixed in 856743e by tracking after the last limiter rule; e2e scenario 10 covers it and fails on
  6abc75d (checked in a throwaway worktree). Both PR bodies rewritten in plain wording.
- Final pass at the pushed heads (backend 5c460604, gateway 856743e, clean trees): e2e all pass, boot
  matrix 8/8, self-test 55/55, backend CI Build and Test pass (runs on the merge with development, which
  is 2 commits ahead and also touches dashboard lib/types.ts; no conflict). New `manual-checks.sh` runs
  the hand-test checklist through the dashboard BFF on a fresh manual stack: 41/41.
- A code-quality review (`code-quality-review.md`) of keyset-sync.py: confirmed in code that the docstring
  over-claims ("any failure keeps the maps"; a failed second map leaves new limits + old keys until the
  next tick re-pushes), `keysetVersion` is the last fully applied version, and `healthy` is true for up
  to KEYSET_STALE_SECONDS before any successful sync (line 472). Status/wording only; no traffic impact.
- Gateway aaa4c6a + d1015b1. Code-quality review: `healthy` only after the first success, docstring/ADR/README
  describe the per-map apply, partial-apply self-test, frozen `Config` parsed once, flock on
  `.keyset-sync.lock` in the maps dir ("wait" for the service, "try" for --once, opened O_RDONLY so a root-made
  file never blocks the service, opt-in so the self-test's in-process restarts do not deadlock - the first
  attempt did). Codex's next review: a CR/LF token leaked through http.client's ValueError into log, status
  and alert (reproduced); now refused at load, ValueError gets a generic message, recorded errors are
  scrubbed (only secrets >= 8 chars - a 1-char test token blanked every "t"). Flood check relaxed to
  pass <= 100 + P (concurrent reads can cross the org limit together); exact limits stay sequential.
  New CI job tests/edge-rate-limits.sh (fake keyset + real haproxy:2.8 + --once) fails on 6abc75d and
  a88f7a7. Final regression: self-test 70/70 (host + 3.8), edge test 3/3, e2e, boot 8/8, manual-checks
  2/2 on a fresh stack (made rerunnable by revoking org D's keys).
- /simplify (4 agents) + /code-review (12 findings), uncommitted: push() folds the drift check (but every push
  still rewrites the file - skipping it was a /simplify regression the review caught), 304 guard restored,
  shared alert-transition and status-freshness helpers, one FakeHaproxy, shared systemd hardening lines,
  one-branch body parsing in all three api-keys routes (keys/[keyId] still 500'd on null). Security: map
  writes never follow symlinks (O_EXCL|O_NOFOLLOW + fchmod; lock O_NOFOLLOW); the deploy agent refuses a
  non-regular map - the old filter used realpath(ref), which let a symlinked map pass unchecked (shown on
  HEAD's validate.py). Edge now hashes req.fhdr only when fhdr_cnt eq 1 (brief's settled rule updated).
  Skipped: removing scrub, dropping the guard regex, a limits data migration, gpc0 for the org counter,
  CI speedups, #4/#8/#10/#12. Regression: self-test 74/74 (host + 3.8), systemd verify, edge test 2/2 and
  failing on d1015b1's cfg, e2e, boot 8/8, manual-checks, api-auth 106/106, tsc/lint/format clean.
- Pushed: gateway 27d64ef (simplify + review fixes) and deadcab (CI test: 50k-key push in 2s, raw header
  bytes, per-IP cap bursts sent in parallel - sequential 310 spanned >10s under load and flaked); backend
  b849435d (routes) and 24b0f192 (guard over a real HTTP parse; fails on the old trimming guard). HAProxy
  trims spaces/tabs around x-api-key like Node (checked with raw bytes). CI green on both heads.
- Discord alerts checked against a fake webhook (scratchpad fake_discord.py: validates Discord's embed
  limits, 403s Python-urllib's UA like Cloudflare, can answer 500/429) on the live manual stack: 0 posts
  while healthy; one stale + one recovered per outage; 500 and 429 retried each poll until delivered, then
  exactly one; watchdog one "not running" (none on rerun) + one "running again"; every payload valid; the
  webhook URL never in a log. Same request shape as the deploy agent's notifier, which already posts from
  the gateways. Not covered: real Discord and egress from a gateway - a one-shot real post is the check.
- Rollout comment (#1372 issuecomment-6309961777) steps 5-6 now name the envs: API_AUTH_VERIFIER_TOKENS
  (append), /etc/sodax-keyset-sync.env with KEYSET_URL / KEYSET_TOKEN / KEYSET_DISCORD_WEBHOOK_URL, plus a
  one-shot test-alert command (verified against the fake webhook). Both PR bodies link to that comment;
  their previous versions were diffed first, only the link paragraph changed.
- Paul's 3 comments (2026-10-21): starting tiers base 3000 / pro 6000 (#1372 6314132913); doc reword
  "one HAProxy -> one counter per org" (#1380 6313490851); skip the in-app submit-tx 10/60s throttle for a
  key whose org has an effective rateLimitPerMinute (#1380 6313756107). Implemented, uncommitted:
  OrgLimitAwareThrottlerGuard in @repo/api-auth-client (opt-in on the 3 submit-tx routes, so
  sponsoring-api's HaproxyThrottlerGuard is untouched); isOrgLimit moved to shared-enums. Corrections for
  Paul: prod swaps/bridge each have ONE origin, so the throttle is 10/min not ~20; the edge write cap
  (120 POST/60s per IP) still bounds keyed submits - kept on purpose. "Exact" overstated: a reload
  (every gateway deploy) zeroes the counter. Tests: guard unit 6, e2e swaps+leverage 8, bridge 4, all
  mutation-checked; api-auth 106 incl. real-Postgres (throwaway container), swaps-api 553 unit + 93
  controller e2e, bridge-api 176 unit + 37 controller e2e, tsc clean x4. Lockfile +6 lines only (pnpm
  re-derived unrelated @solana peer ids; reverted those).

## Review pass before push (2026-10-22)

- Checked: ApiKeyGuard is the only APP_GUARD in swaps-api/bridge-api; HaproxyThrottlerGuard does not
  override shouldSkip, so the subclass loses nothing; principal is set only on outcome ok, and mode off or
  an unconfigured poller leaves it unset (throttle stays). One @nestjs/throttler 6.4.0 in the lockfile, no
  package cycle. `limits` has shipped in the keyset since #1048. CI runs the new specs (`test` chains
  `test:e2e`; turbo test dependsOn ^build). (V)
- Fixed: @nestjs/throttler moved to api-auth-client devDependencies (test-only), lockfile edited by hand,
  frozen install passes; haproxy.cfg comments at the fe_edge header and the write tier updated (comment
  lines only, haproxy -c valid); bridge.controller.ts import order (pre-existing biome check failure).
- Open: Paul says one HAProxy serves all prod, but the gateway repo says gateway-a/b are both prod
  (Hetzner + AWS, geo-steered) and gateway-c takes 10% of prod (CLAUDE.md, README:14, design doc §6), and
  our own rollout step 7 tests prod keys through gateway-c. The 2026-10-20 single-egress measurement also
  fits per-client affinity. Design doc §4.1 bullet now contradicts itself. Ask Paul/Fidel before calling
  the limit exact. (D)
- Rollout addition: the skip only works where swaps-api/bridge-api run the key guard (mode monitor or
  enforce, poller configured); prod bridge-api's mode is not known. Setting a `base` limit lifts the
  10/min throttle for every base org with a write key at once.
- Decision (user, 2026-10-22): follow Paul — one HAProxy serves all prod. sodax-backend wording kept;
  gateway repo made consistent: design doc §4.1 bullet rewritten (was self-contradictory), README:122 and
  the haproxy.cfg fe_edge comment no longer claim the Cloudflare LB spreads a client over gateways
  (comment-only, haproxy -c valid). §6 / CLAUDE.md / README:14 topology (gateway-a/b prod, gateway-c 10%
  prod) left alone; flagged to Paul as possibly stale.
- Finding (2026-10-22): Paul's tier comment says "Everyone starts on base, so pro affects nobody", but
  every existing org is `pro` (0002 backfilled all tenants to 'pro'; api-scopes.ts: "`pro` predates it and
  is what every existing org carries until it is moved"). `base` only reaches orgs first minted after the
  deploy (KeysService.mint -> DEFAULT_TIER). So pro=6000 is what today's partners get, and the
  api_usage check should compare them to 6000. Raise with Paul. (V)
- Why not seed tier limits in a migration: a limit in the keyset lifts the app submit throttle within
  ~15s of the api-auth deploy, while the edge org cap only exists once #136 + sidecar are live (rollout
  steps 2-6); seeding would drop the 10/min throttle with only the 120/min/IP write cap in its place.
  Also: the usage check comes first, limits are audited dashboard data, a migration would also seed
  canary/local/test DBs, and rollback would need a deploy instead of a click.
- Done (user chose automatic over manual): api-auth migration 0004_move_existing_tenants_to_base
  (`UPDATE tenants SET tier = 'base' WHERE tier = 'pro'`, drizzle-kit --custom, snapshot = 0003 schema).
  Tested on a throwaway postgres:17.6-alpine from both the 0002 state (prod today) and 0003: pro -> base,
  limits and key scopes untouched, re-run no-op, documented rollback SQL works; api-auth 106/106 incl. the
  real-Postgres spec. Docs: api-scopes.ts comment, api-authentication.md decision 9, re-scope step,
  "`base` and rollback". Applies itself: the api-auth image CMD and docker-compose.api-auth.yml run
  db:migrate:prod before start:prod; the image is built on push to main, the redeploy is manual (step 1).
- Correction: Paul's "everyone starts on base" assumed rollout step 2 (manual `UPDATE tenants SET tier =
  'base'`, already in the rollout comment and the #1380 body); it was not a misunderstanding. 0004 automates it.
- Shipped 2026-10-22: sodax-backend dcf4f0b7 (pre-commit gate passed only with TURBO_CONCURRENCY=2; the first
  run hit MongoMemoryServer start timeouts in api/data-transformator/task-executor under full parallelism;
  apps/api partners-volume passed 34/34 alone), sodax-unified-api cd05f43. #1380 body updated (guard,
  migration 0004, tests; dropped the "throttle still applies" line); rollout comment steps 2/7/8 + rollback
  SQL updated; reply to Paul posted (#1380 issuecomment-6333330834) with the bridge-api mode question.
- Second review (2026-10-22, after dcf4f0b7; CI Build and Test passed 19m37s): ApiKeyGuard tests never
  asserted the principal (the "attaches the principal" test only checked the usage row), and nothing
  asserted it stays unset for off mode, suspended, scope-short, unknown or unwired. Added those asserts;
  mutation-checked (attach for any known key -> 2 fail; never attach -> 1 fail). Guard unit test now covers
  limits 1 and MAX_ORG_LIMIT. api-auth-client 61/61. Uncommitted. No migration test: a global UPDATE in the
  shared pg-spec DB could rewrite other tests' tenants; 0002 has none either; verified by hand instead.
