---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [code-quality, sidecar, review, observability]
---

# Sidecar code quality and claim boundaries

Reviewed gateway HEAD `856743ec8e53369ab3f7ac8ea17a760c425c00ae` and the current PR bodies;
backend HEAD is `5c46060431441f900b1ce6db70a000944cb2498a`. Both application working trees are clean.
The previous write-cap ordering finding is fixed: organization tracking now follows the write refusal.
This review focuses on the custom Python sidecar; it is not a new full security or backend review.

## Assessment

The core is readable and appropriate for a small system service. Keyset validation and rendering are
separate from HTTP and runtime-socket I/O; time, HAProxy and notifications can be substituted for tests.
No third-party runtime dependency or new framework is needed. Positive security measures include
strict map values, redirect refusal, unprivileged execution and durable per-file replacement.

The file is 957 lines, including 346 lines from `self_test` through `watchdog_cases`. A single deployed
file simplifies installation, so file length alone is not a reason to redesign it. Maintainability
would benefit from a small typed configuration object parsed once, a clearer status model, and a
separation between policy reconciliation and status/notification bookkeeping. These are incremental
improvements, not an argument for a larger service architecture.

## Claims that need narrower wording

- `keyset-sync.py:13` says any failure keeps the maps HAProxy already has; the exception docstring and
  ADR-004 repeat that guarantee. `push` writes disk and commits runtime maps sequentially, limits first.
  A failure after one map commit can leave a mixed generation; disk and runtime can differ too.
  Per-file/per-map atomicity is accurate. Whole-keyset rollback or atomicity is not implemented.
- The test label at line 678 says `keysetVersion` is the version HAProxy holds. It is the last fully
  successful keyset version, not proof of both current runtime maps after a partial apply. The status
  should name that distinction or report a degraded/partial apply condition.
- `healthy` is a grace-period staleness flag, not confirmed readiness. A process that has never synced
  can report healthy and pass `--status` during its initial 300 seconds. An initializing state or
  explicit first-success requirement would make an operator's interpretation safer without changing
  when Discord alerts begin.
- The self-test is labelled "no network, no socket" in the module and CI, but `redirect_cases` starts
  a loopback HTTP server. "No external service required; uses loopback HTTP" describes it accurately.

## Independent verification

The unmodified `--self-test` passed 55/55. Two additional temporary probes imported the actual module
and supplied a fake HAProxy transport and dummy keysets; no production endpoint or credential was used.

1. Apply v1: key A, org_a limit 10. Apply v2: key B, org_a limit 20, with an injected failure on the
   second runtime map replacement. Result: sync failed; runtime limit was 20 with old key A; disk held
   new key B; status reported v1 and healthy true. Removing the failure and retrying converged to v2.
2. On a fresh status path, fail the first fetch with HTTP 401. Result: `lastSuccessAt: null`,
   `healthy: true`, and `--status` exit 0 during the grace period.

These probes confirm the wording/status boundaries. They do not establish a live outage or a new
authentication vulnerability, and the transport was a fake rather than real HAProxy in these probes.

## Improvement order

1. Clarify the partial-apply contract and initial/readiness status. Add tests failing between the two
   runtime commits and between disk replacement and runtime commit, including next-tick recovery.
2. Promote a small real-HAProxy behavior smoke test into upstream CI. Current CI parses the config
   and runs the sidecar self-test; the Python fake transport does not exercise the real prepare/add/
   commit protocol or limiter ordering. Existing local e2e evidence is useful but does not automate
   regression protection in this repository.
3. Parse configuration into typed values once, and name status fields around what they measure.
4. Enforce one writer when `--once` is used alongside the service, or document stopping the service
   first. `write_atomic` uses a fixed temporary filename and there is no lock between those modes;
   overlapping invocations can race. This was identified by source inspection, not reproduced.
5. Consider extracting the larger tests while preserving a lightweight installed smoke test if that
   helps deployment checks. Avoid turning a small polling service into a framework for this cleanup.

No application code was changed, no GitHub comment was posted and nothing was deployed.
