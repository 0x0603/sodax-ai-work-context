---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [review, security, sidecar, ci, rate-limit]
---

# Review of both PRs and the local quality fixes

**Pushed-head follow-up:** both P1s below are resolved at gateway `d1015b1`. No new P0/P1 was found
in the changed code. See "Re-review of the pushed fixes" at the end for independent verification and
the remaining non-blocking description wording. The original findings below are historical.

Scope: backend HEAD `5c46060431441f900b1ce6db70a000944cb2498a`, gateway HEAD
`856743ec8e53369ab3f7ac8ea17a760c425c00ae`, and the local gateway changes to the sidecar,
runbook, CI, CLAUDE.md and new `tests/edge-rate-limits.sh`. Application source was read, not edited.
No GitHub comment, commit to an upstream repository, or deployment was performed.

## P1: a malformed verifier token is exposed through error reporting

Location: `scripts/keyset-sync.py:412-413`. The fetch handler includes the full exception/reason in
`SyncError`. `load_config` accepts a `KEYSET_TOKEN` environment override containing CR/LF. Python's
HTTP header validation then includes the Authorization header in its exception text. This reaches
the journal log, `status.json`'s `lastError`, and the stale Discord alert description.

Independent probe used `load_config` with an explicit dummy token ending in a newline and a loopback
URL. It failed before sending an HTTP request. The journal output and status contained:

```text
cannot reach api-auth: Invalid header value b'Bearer review_dummy_verifier_0123456789\n'
```

A second probe with an injected clock advanced past the stale threshold and a fake notifier confirmed
the dummy token also appears in the alert description. No real token, production endpoint or Discord
webhook was used. The normal env-file parser strips a trailing newline on a line; the demonstrated
input path is an environment override, which the script explicitly supports.

Reject invalid token/header characters before request construction using a generic configuration error,
and avoid copying credential-bearing HTTP exceptions into logs or notifications. Add a regression that
asserts the token is absent from logs, status and alert payloads. This is a remaining issue in the PR's
sidecar, not a claim that the latest Config refactor introduced it.

## P1: the new CI flood check fails on a valid concurrent run

Location: `tests/edge-rate-limits.sh:185-188`. The flood is sent with `P=16`, while the assertion requires
at most exactly 100 admitted requests. The limiter reads and increments the org counter in separate
actions; simultaneous requests can cross that boundary together. The ordinary current-code run failed:

```text
pass=101 org=1399 ip=0 jail=100
```

The flood jail worked, as did the subsequent keyless jail probe, but the new CI job exited 1. All other
25 checks passed. A later mutation run had `pass=100`, showing the boundary varies across executions.
Test exact organization admission sequentially, and test the parallel flood/jail behavior separately,
or otherwise use a justified concurrency bound rather than an exact upper cap of 100.

## Feedback status and remaining wording

- Typed frozen `Config`, parsing numeric settings once: implemented.
- Initial failure no longer reports healthy; `--status` exits 1 before the first success: implemented.
  An independent HTTP-401 probe confirmed it; reverting only the healthy predicate made the new test fail.
- A partial runtime apply keeps the last fully successful keyset version and retries: covered by new tests.
- An actual flock prevents a service and `--once` from writing maps together; runbook also says stop/start
  the service. The self-test covers refusal, later acquisition, waiting and a read-only lock file.
- Real HAProxy integration is wired into CI and exercises the sidecar runtime protocol and limiter order.
  Moving `track-sc3` before the write-cap return in a temporary config caused exactly the two expected
  accounting checks to fail: org_e was charged 10, then a GET from another IP was org-limited.
- `tests/edge-rate-limits.sh:158` still calls the second `--once` a 304. Each call starts a fresh Syncer
  with no ETag, so both requests are 200. An independent loopback HTTP probe confirmed two fresh Syncers
  send no If-None-Match; reusing one Syncer yields 200 then 304. Rename this case or exercise/observe a
  real 304. The existing unit-style self-test still covers a simulated 304.
- ADR-004 still says both "any failure falls back to per-IP" (line 60) and "keeps the last maps on any
  failure" (line 75). Neither is the whole partial-apply contract. Distinguish fetch failures (keep
  existing runtime maps), partial apply (mixed state until reconciliation), and lookup misses (per-IP).
  The new module text's "every such mixed state is safe" also needs a narrower policy/auth distinction.
- The module and CI self-test label still say "no network, no socket", although the redirect test uses
  a loopback HTTP server. No external service is required; that is the accurate claim.
- File splitting remains deferred as previously agreed. No larger rewrite is needed to address the P1s.

## Verification performed

- Sidecar: 66/66 on host Python 3.14.8 and Python 3.8 in Linux Docker as UID/GID 65534.
- api-auth: 106/106, including 25 integration tests against a fresh, dedicated Postgres 17.6 container;
  the actual migration runner applied all migrations first. Snapshot 0003 adds only `public.tier_limits`.
- Actual ApiKeyGuard test file: 21/21.
- Typechecks: api-auth, api-auth-client and dashboard all pass.
- Current real-HAProxy integration: 25/26; failure documented above. The separate temporary write-cap
  mutation run failed its two intended accounting checks while its parallel flood happened to pass.
- Initial-health mutation: 65/66, with the intended first-failure-health case failing.
- Shell syntax and diff whitespace checks pass. Runtime containers were removed by the harnesses.
- Node tests ran on available Node 22.15.0, rather than the repository's required 22.18.x. No browser UI
  session or live gateway was tested, and systemd unit validation was not rerun in this macOS review.

## Fingerprints of reviewed files

| File | SHA-256 |
| --- | --- |
| `scripts/keyset-sync.py` | `95707a12d2bb9aa1c309389bff1aec2a16ed27653ae27a94313201ddce8e82ea` |
| `tests/edge-rate-limits.sh` | `91763467b0f82271f51fa33c1dd7827e6316e39966708e280b623ac042296516` |
| `.github/workflows/ci.yml` | `b5359d73e77ffaea45fb81b3e78c35eaabc395879c60aae6b627d117f8716859` |
| `gateway-configs/haproxy/haproxy.cfg` | `6dd79026c1699e938a4e89b000e5d460acdc185ce0c0e827c12a324f0276b002` |
| Backend keyset service | `e3a9b41eb7e264389f7c5dd84c7f64be724f306df6f5354e2478c958ae65e687` |
| ApiKeyGuard | `4062341e281c8e91145d6f7a67617808262d5a8f8b1aeab408466adbc6dd296f` |

## Re-review of the pushed fixes

Verified GitHub and local HEAD agree: gateway #136 is
`d1015b1e61fa7f23415459c2fc1c3ffe12cd9b14`; backend #1380 remains unchanged at
`5c46060431441f900b1ce6db70a000944cb2498a`. Both application working trees are clean. Reviewed the
two newly pushed gateway commits (`aaa4c6a`, `d1015b1`) against the prior review; no upstream sources
were changed or comments posted.

### Previous P1s: resolved

- Invalid-token leak: startup requires visible ASCII without spaces/control characters; request-building
  ValueError has a generic message; stored errors and unexpected tracebacks are scrubbed, as are `--once`
  errors. Independently tried seven invalid suffixes (LF, CR, CRLF, space, tab, NUL, NBSP), all rejected
  without echoing the dummy secret. Bypassing validation to exercise the real request error still left
  no token in logs, status or a fake stale alert. A synthetic unexpected exception containing a valid
  dummy token also kept it out of all three reporting sinks, including the traceback.
- Flaky flood assertion: exact organization admission remains sequential in step 3; the P=16 flood
  now permits a bounded race overshoot and verifies the org cap followed by jail. The current integration
  script passed all 26 checks locally. The earlier false "second sync is a 304" label is also corrected.

### Verification in this follow-up

- Sidecar: 70/70 on host Python and Linux Python 3.8, the latter as UID/GID 65534.
- Real HAProxy 2.8 integration: 26/26, including runtime updates, write-cap accounting, IP isolation,
  flood jail, policy removal, reload and cold restart.
- The GitHub gateway CI run at exactly `d1015b1` is successful: runtime integration, config validation,
  sidecar self-test and promotion-path guard all pass. Backend Build and Test also passes.
- Shell syntax and diff whitespace checks pass. No broader backend rerun: its HEAD has not changed
  since the prior 106-test Postgres run and three typechecks documented above.
- No live gateway, production API key or real Discord webhook was used. The integration harness removed
  its temporary container and files.

### Remaining wording, not a new blocking code finding

The PR body still claims every mixed-map state falls back to per-IP and is repaired by the next poll.
An old key can still resolve against the newly committed limit; the next poll retries, and repair depends
on the failure clearing. Suggested wording: "A partial apply can leave new limits with old keys. Lookup
misses use the per-IP limits, and subsequent polls retry synchronization." The module's broad "every such
mixed state is safe" should carry the same policy/auth distinction. The self-test's "no network, no socket"
label also still means no external dependency; its redirect case uses loopback HTTP.

These are wording corrections, not additional P0/P1 findings. Per-gateway approximate counters,
non-transactional map pairs, last-map retention and the same-host watchdog boundary remain unchanged.
