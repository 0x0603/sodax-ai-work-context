---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [review, filesystem, security, sidecar, triage]
---

# Triage of twelve post-simplify findings

The user supplied a classification, not the full original review. Assessed those descriptions against
the current local working trees, which are changing during another editing session. This is not a final
review of all resulting fixes and does not approve the new uncommitted changes.

## Priority and correction

- Agree with restoring disk writes whenever a map is pushed (#3), including drift/periodic repair.
  The periodic disk I/O is a reasonable cost for keeping restart/reload snapshots recoverable.
- Move the privileged symlink paths (#1/#2) into the immediate-fix group. A Linux Python 3.8 container
  probe used the actual pre-hardening `write_atomic`: UID/GID 65534 owned the maps directory and planted
  `.org_limit.map.tmp` as a symlink to a root-owned dummy file outside it. Root called `write_atomic`;
  the outside file was overwritten, changed from 0600 to 0644, and the published map became a symlink.
  No host file or real credential was targeted. This proves the privileged write/chmod path, not a remote
  exploit or an HAProxy secret-exfiltration path.
- Refusing links/non-regular files is useful, but check-then-open alone races with a directory owner.
  Use safe opens and descriptor-based fstat/fchmod for Python operations. O_NOFOLLOW only protects the
  final pathname component; parent directories need an appropriate trust boundary. A later root
  HAProxy open is a separate pathname operation and can race again. A Python guard does not by itself
  establish a complete privilege boundary for HAProxy; trusted publication or a narrower reader
  privilege model is needed for that stronger claim.
- For #6, a complete-map guard must not turn an unsolicited first 304 into a successful sync. The local
  guard version was independently probed: `run_tick` returned true, zero maps were applied, healthy
  became true and `--status` exited 0. Refetch without an ETag or fail the tick so readiness remains false.
  The new test expecting a "quiet tick" only checks return success and misses that readiness issue.
- For #5, req.fhdr_cnt(x-api-key) == 1 plus req.fhdr(x-api-key) matches the intended single-field
  contract and preserves commas in the value. Keep the existing strict bare-ASCII guard without trim;
  full-header extraction alone is not a substitute for its NBSP defense. Duplicate-header tests must
  change: neither header order may attribute the request to the org. Edge fallback does not authorize
  it; the app guard still rejects the malformed request.
- #7 is reasonable for any test depending on a just-exhausted org budget: place it adjacent to the
  exhaustion step. With #5, the duplicate-header assertions' old exhausted-budget dependency can be
  removed altogether; moving them alone does not update the expected behavior.
- #9 (JSDoc adjacency) and #11 (tier clear preserves org overrides) are appropriate small corrections.

## Accepted deferrals

- #4: a 1M org bound can serve multiple egress IPs; a per-IP flood ceiling is a separate control.
- #8: the actual Better Auth Mongo adapter is configured without a custom ID generator, defaults to
  ObjectId and serializes it as hex, which fits the current validation. This is a fact about this setup,
  not a guarantee about every possible Better Auth deployment.
- #10: duplication across language/bundle boundaries is acceptable; keep the same key names and bounds.
  Cross-language generation would be possible but is not necessary just to remove a few constants.
- #12: a JSON response body does not require a trailing newline.

References checked: HAProxy's req.fhdr/req.fhdr_cnt documentation via Context7; Linux open(2) and
openat2(2) for no-follow semantics; the installed Better Auth Mongo adapter source. No upstream code was
edited, no full test suite was run, no GitHub comment was posted and nothing was deployed.
