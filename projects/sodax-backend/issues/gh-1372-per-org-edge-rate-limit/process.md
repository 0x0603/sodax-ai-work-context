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
