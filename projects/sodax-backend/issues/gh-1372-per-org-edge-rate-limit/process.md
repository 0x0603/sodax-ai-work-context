---
type: process
repo: sodax-backend
github: 1372
updated: 2026-10-21
---

# Process sessions

Open the session relevant to the question; do not read the directory end to end.

| Session | Date | Scope | File |
| --- | --- | --- | --- |
| 1 | 2026-10-20 | Planning, probes, implementation, initial review, topology correction and divisor withdrawal | `process/01-2026-10-20-planning-and-implementation.md` |
| 2 | 2026-10-20 | Re-review of a88f7a7 / da77c015; stale-sync finding addressed | `process/02-2026-10-20-re-review.md` |

## Mechanism explanation — 2026-10-21

Verified the unchanged open PR heads through GitHub CLI and prepared a concise two-flow explanation
for the user. See `mechanism-overview.md` for policy synchronization, request processing and limits.

Follow-up: assessed the approach against current PR code and official HAProxy documentation. Keep
the architecture, settle rejected-attempt semantics and keyed/keyless counter interaction before
rollout, and distinguish local protection from strict global quota. No code changes or new test run.

Assessed the tier-only proposal: prefer its narrower scope, with caveats about Paul's exact intent,
unverified production tenant data and the mirrored dashboard tier vocabulary. Proposal only; no
upstream edit was requested. Details are in `mechanism-overview.md`.

Assessed map persistence: disk snapshots are appropriate; atomicity is per file/map, not across both
maps and RAM/disk. Documented the partial-apply/reload boundary from code; no new reproduction.

## Security assessment — 2026-10-21

See `security-assessment.md`: isolated HAProxy 2.8.31 + Node test reproduced org-cap bypass with a
valid NBSP-padded key; the actual transpiled `ApiKeyGuard` also accepted it in enforce mode. An exact
sidecar fetch probe forwarded a dummy verifier token across a host-changing redirect. Map/socket
injection probes were rejected. No production traffic, real credentials or upstream mutations.

Crash follow-up: distinguished sidecar failure, HAProxy restart and host power loss. Found that the
file is fsynced before replacement but the parent directory is not fsynced afterward; documented
this durability boundary in `mechanism-overview.md`. Code/docs reasoning only, no crash test or fix.

Monitoring follow-up: sidecar has status JSON, `--status` and optional stale/recovery Discord alerts;
dashboard Verification monitors swaps-api instead and has no sidecar integration. Documented the
independent host-check requirement and initial healthy-flag grace period in `mechanism-overview.md`.
