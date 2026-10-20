---
type: review
repo: sodax-backend
github: 1372
status: Active
updated: 2026-10-20
related_issues: [gh-1372]
tags: [api-auth, haproxy, rate-limit, review]
---

# Review of backend #1380 and gateway #136

Reviewed at backend `7d1621ec24775efee05babcdf1743e9e309ed0bc` and gateway
`be53347e9d15f008be80b6525493d6fdb8ca21cf`. Sources: issue #1372 and its design/plan
comments, current PR diffs, surrounding source, repository instructions and local probes.
Both upstream checkouts were clean. No upstream code, GitHub comments, PR reviews or deployments
were changed. Existing unrelated context-repo changes were left untouched.

## Verdict

The implementation follows the requested architecture and covers the principal behavior. No P0
or P1 functional defect was found in backend #1380. Gateway #136 needs an explicit sync-staleness
signal and alert before production rollout. Fleet-wide rate accounting remains approximate by
the accepted unpeered design; gateway-c's production share must be accounted for operationally.

## P1: a permanently failing sidecar can look healthy while enforcing stale policy

Location: gateway `scripts/keyset-sync.py:308-312`, with `main` at `387-389` and the service unit
in `scripts/systemd-units.py:159-167`.

After an initial successful sync, revoke/rotate the verifier token or break gateway-to-api-auth
connectivity. Every `tick` logs an error and returns `False`, which the daemon loop ignores. The
process stays alive, so `Type=simple` and `Restart=always` do not report or repair a failure. The
last maps correctly stay in force, but dashboard limit edits and newly minted keys cease to
reach that gateway indefinitely. On an initial failed sync, empty maps can leave all traffic
on the IP fallback indefinitely.

The PR exposes no last-success time, snapshot age, consecutive failures or alert hook. Its
documented detection path is manually reading `journalctl`; generic HAProxy health/traffic
metrics cannot distinguish a healthy unchanged keyset from a stale one. This is the missing
half of the existing backend pattern, `docs/PATTERNS.md:220-237`, especially point 5: keeping
the last good snapshot indefinitely requires observable staleness and an alert.

Recommendation: retain the last good maps; publish the last successful fetch/apply and failure
count, and connect a sustained-failure alert. A status file plus an existing monitoring agent is
sufficient; no new request-path dependency is needed. A successful 304 must count as a fresh
fetch, and a failed Runtime API apply must remain unhealthy even when the HTTP fetch succeeded.
If deployed infrastructure already alerts on this service's journal errors, document and verify
that integration; the repository alone does not establish its existence.

## Accepted limitations and rollout details

- `scripts/README.md:449` prescribes divisor 2 on gateway-a/b and otherwise defaults to 1, while
  line 496 says gateway-c serves about 10% of production. Those are three independent counters.
  At fixed 45/45/10 distribution the a/b caps bind near 1.11 times the nominal global rate;
  their possible budgets sum to twice the configured limit if traffic can redistribute freely
  (`L/2 + L/2 + L`). These are arithmetic implications of the documented configuration, not
  production measurements. Confirm gateway-c's share/divisor or remove its production share;
  do not advertise the current design as an exact global quota. Hostnames share the same local
  org counter, so production-key traffic on the canary hostname spends that gateway's budget too.
- The submit-tx application throttle remains 10/min per IP, and the edge write cap and flood jail
  still apply. Increasing a tier limit does not remove those separate limits. This is explicitly
  out of scope, not a regression in these PRs.
- Canary-specific API keys keep the IP fallback because the sidecar polls the production keyset.
  This is already documented in the issue plan.
- Rollout must pre-create the map files and socket group; backend/dashboard ship together; change
  existing orgs to lowercase `base` only after backend deploy. Before rollback to a build without
  `base`, reset base tenants to `pro`, including tenants created after this deploy.

## Code assessment

- Backend ownership stays with api-auth/Postgres. Tier names/scopes remain reviewed code and
  limits are editable data. The effective-limit merge has the correct precedence. The provisioner
  guard, closed limit vocabulary, row lock and transactional audit are consistent with existing code.
- The additive migration leaves the old `pro` column default intact, while mint explicitly inserts
  `base`; this is a sensible rollback safeguard.
- The dashboard reuses one rate-limit input and validator. The separate Tiers module is small and
  clear. No additional generic policy framework is needed for the single limit key.
- The gateway keeps authentication in the apps, tracks the org on a separate stick counter, and
  preserves the write cap and IP flood jail. The sidecar uses stdlib only, validates map content,
  batches Runtime API payloads, and runs without root or access to the admin socket.
- Self-tests and CI are useful, but the sidecar's network/socket/disk/reload scenarios would benefit
  from a repeatable integration harness; the committed self-test primarily validates pure helpers.

## Verification performed for this review

- Relevant api-auth unit tests: 44/44.
- api-auth integration suite: 25/25 on a fresh isolated PostgreSQL 17.6 database, migrated with
  the actual Drizzle runner.
- API client guard/snapshot tests: 25/25.
- TypeScript checks: api-auth and dashboard passed. Local Node was 22.15.0 versus the repository's
  22.18.x pin; backend PR CI also reported success.
- Gateway CI reported success at the reviewed head; sidecar self-test passed 18/18 and all 14
  Python scripts compiled with Python 3.8.
- HAProxy 2.8.31 runtime probes used temporary bind replacements and disabled every origin server,
  retaining the limiter/ACL rules. Two keys shared one org budget; both hostnames used that local
  budget; 310 keyed requests passed beyond the IP cap. Keyless/unknown/suspended/no-limit traffic
  allowed 300 requests then rejected 10; the write cap allowed 120 then rejected 5. Portal traffic
  ignored the org cap. Flood traffic hit the jail after 1500 requests and 6 jailed requests left the
  org counter unchanged at 1500.
- The operator socket accepted prepare/add/commit map commands. Three injected HTTP 401 failures
  retained the exact previous runtime map and reset the ETag. A 304 repaired a manually cleared
  runtime map. A full HAProxy process restart loaded the correct saved maps before sidecar/API use.
- All temporary containers were removed and both upstream worktrees remained clean.
