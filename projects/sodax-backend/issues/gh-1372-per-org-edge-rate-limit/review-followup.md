---
type: review
repo: sodax-backend
github: 1372
status: Complete
updated: 2026-10-20
related_issues: [gh-1372]
tags: [api-auth, haproxy, rate-limit, review]
---

# Re-review after the topology discussion

Reviewed backend #1380 at `da77c0158af978f51d2834ab94480deae6f52f4e` and gateway #136 at
`a88f7a7b8ed19f091f7dc1dd53a026bf872cc185`, both matching GitHub. Compared with the previous
reviewed heads (7d1621ec / be53347), read the changed code and callers, and exercised the new
failure/recovery lifecycle. No upstream source, PR body, GitHub comment or deployment was changed.

## Verdict

No new P0/P1 findings. The stale-sync finding from `review.md` is addressed for a running sidecar.
The full per-gateway budget matches the revised topology decision; do not restore the divisor
based on the old IPv4/IPv6 probe. This is still a local HAProxy counter, not a cross-instance quota.

## Scope and behavior

- Backend's new commit changes only `docs/api-authentication.md`. The backend implementation from
  the earlier review is unchanged, so its 94 previously run tests were not repeated for this delta.
- `build_rows` writes the effective org limit unchanged (`scripts/keyset-sync.py:218`). A legacy
  `KEYSET_LIMIT_DIVISOR` setting produces a warning and has no effect.
- The live HAProxy rules changed only comments; authentication stays in apps, org identity stays
  shared across keys, and the write cap/IP jail are retained.
- `run_tick` marks success only after fetch AND any required runtime apply succeed. A 304 refreshes
  the successful-sync timestamp; an apply failure retains the previous successful timestamp and
  keyset version while increasing the failure count (`scripts/keyset-sync.py:391-408`).
- The status and alert state survive restarts. Both stale and recovery notifications retry when
  the webhook fails. `--once` does not overwrite the daemon's status or alert state.
- `StateDirectory=sodax-keyset-sync` supplies the daemon's writable status directory while retaining
  the existing least-privilege socket and map permissions.

## Verification performed

- Shipped self-test: 43/43 on the host and on Python 3.8.
- Independent HTTP harness used localhost only: API 200/304/401, webhook 500-to-204 retry,
  restart during outage and pending recovery, failed map commit, unexpected exception, status
  healthy/stale/dead/missing/corrupt, and absence of token/webhook-URL leakage; all checks passed.
- Real HAProxy 2.8.31 used a temporary config with test binds and every origin server disabled.
  Operator socket updates worked; a limit of 7 remained 7 even with the obsolete divisor setting.
  On each host test, seven requests passed the limiter and the next returned 429. Socket refusal
  preserved the prior map/version and recorded failure; reconnect applied the new policy and
  restored healthy status. Config parsing passed.
- Gateway CI is green at the reviewed head. Backend Build and Test was still in progress at the
  final status check; this delta is documentation only. No new backend runtime behavior was tested.
- Temporary containers were removed and both upstream worktrees remained clean.

## Rollout boundaries

- Configure `KEYSET_DISCORD_WEBHOOK_URL` before relying on automatic alerts; it is optional.
- Nothing currently schedules `--status`. A process or host that is completely dead needs an
  external check; an in-process alert cannot run after its own process exits. This boundary is
  explicit in `scripts/README.md:461-464` and is not a new regression.
- The issue's implementation-plan comment still says the limit is divided by 2. Both current PR
  bodies already omit that premise. Align the issue comment separately; this review did not post.
- The topology re-probe is prior-session evidence in the process history. This review did not probe
  production or independently establish that every possible Cloudflare route reaches one counter.
