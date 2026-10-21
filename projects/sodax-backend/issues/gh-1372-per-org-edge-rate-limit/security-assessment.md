---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [security, haproxy, api-key, rate-limit]
---

# Security assessment

Scope: backend PR #1380 at `da77c0158af978f51d2834ab94480deae6f52f4e` and gateway PR #136
at `a88f7a7b8ed19f091f7dc1dd53a026bf872cc185`; both remained open at these heads.
No upstream changes, posts, deployment or production probes were made. All probes used dummy
credentials, local HTTP servers and temporary local HAProxy 2.8.31 containers, cleaned up afterward.

## P1 candidate: API-key normalization mismatch bypasses the org limiter

Sources:

- Gateway `gateway-configs/haproxy/haproxy.cfg:297` hashes the header sample before its org lookup.
- Backend `packages/api-auth-client/src/api-key.guard.ts:24-25,80` trims the presented header with
  JavaScript `String.trim()` before lookup.

A valid key surrounded by U+00A0 NO-BREAK SPACE is accepted by the app guard after trimming, while
HAProxy hashes the extra byte and misses the org map. The request takes the existing per-IP path
instead of the org limiter. This requires a valid key; it does not forge another org's identity or
bypass authentication. The IP flood and write protections remain applicable.

Local evidence:

1. Started HAProxy 2.8.31 with the exact org-lookup/count/429 rules extracted from the pinned config,
   dummy key/org maps, and an org limit of 2. The rest of the production config was omitted; this
   test isolated the org cap rather than validating the complete gateway flow.
2. A Node 22 HTTP origin used the same header-normalization expression as the app guard and returned
   whether the normalized dummy key matched and whether HAProxy had resolved an org.
3. Three normal requests returned `200,200,429`; both admitted requests resolved `org_probe`.
4. Three requests with byte `0xA0` around the same dummy key returned `200,200,200`; the app accepted
   the key, while the edge org was absent. Ordinary ASCII-space padding remained rate-limited.
5. Separately transpiled the exact pinned `ApiKeyGuard` source with the installed TypeScript and
   invoked it in `enforce` mode with fake Reflector/snapshot/usage dependencies. Both the normal and
   NBSP-padded keys were authorized as `org_probe`; an invalid key raised 401. This confirms the
   backend behavior is present in the actual guard, beyond the small origin stub.

Cloudflare's treatment of this header was not tested. End-to-end public exploitability therefore
depends on that perimeter forwarding the value. Fix the inconsistent trust boundary regardless:
define one ASCII key grammar and consistent normalization/rejection at the edge and app; reject
malformed/non-ASCII keys and handle duplicate/comma headers consistently. Replacing `req.hdr` with
`req.fhdr` alone does not fix the Unicode trimming difference. Add a regression covering this exact
edge/app interaction.

## Conditional hardening: verifier token follows cross-host redirects

`scripts/keyset-sync.py:323-333` puts Authorization in ordinary Request headers and calls
`urllib.request.urlopen` with its default redirect handling. An exact `Syncer.fetch()` probe against
two owned local HTTP servers confirmed that a 302 from `127.0.0.1` to `localhost` forwarded the dummy
Bearer token to the destination and returned 200.

This is not a demonstrated attack available to an ordinary API caller: someone must influence the
configured URL, its authenticated response or a redirecting proxy. The documented production URL
uses HTTPS. A verifier token reads the keyset; the service-role guard does not let it provision keys
or edit tiers. Do not describe this as arbitrary credential minting.

Prefer a fixed HTTPS endpoint and fail on redirects, or enforce strict same-origin HTTPS redirects
without forwarding credentials to a different origin. Retest using the production Python version.

## Invalid-entry fallback probe

An exact sidecar `run_tick()` probe with local temporary files and a fake runtime socket applied a
valid limit of 10, then a keyset containing the same org with limit 0. The second tick removed both
map entries, returned success and wrote `healthy: true` with zero consecutive failures. This confirms
the mechanism behind the earlier review's invalid-limit concern: invalid individual entries are
skipped rather than preserving the previous policy. By the gateway ACLs, the affected key then takes
the per-IP path. A wholly malformed keyset or fetch exception instead leaves the current maps alone.
This used synthetic invalid input; it does not establish that production has invalid tenant limits.

The current API validators reject this zero value on new writes. Any fix must distinguish an invalid
row from intentional removal, suspension or no-limit configuration and make skipped-invalid data
visible to monitoring. A generic keep-last-row policy must not silently resurrect revoked entries.

## Existing shared-key availability risk

An attacker who knows an org's plaintext key can consume its shared rate budget, including by
requests to non-portal routes the app does not authorize. All such requests count before app auth.
Tracking also precedes the org-rate rejection, so repeated rejected attempts can prolong the org's
lockout. The existing local reproduction is in `review-2026-10-21.md`; it was not rerun here.
Charging only admitted requests to the business budget reduces the retry amplification, while
separate counters should continue measuring all attempts for abuse protection. No rate-limiter
policy makes a leaked shared credential harmless.

## Map-file threat boundary

- Maps store hashes, not plaintext keys. Minting uses 32 random bytes, and app authentication hashes
  the presented plaintext, so possessing a map hash is not enough to authenticate.
- Exact `build_rows()` probes rejected newline/socket-command payloads in both `orgId` and
  `keyHash`. Strict full-match regexes and bounded integer limits prevent these fields from becoming
  arbitrary runtime socket commands.
- Documented ownership allows only the sidecar user to write the map directory. The unit runs
  unprivileged, uses a root-owned script, limits writable paths and has a separate operator socket
  instead of the admin socket. Live host permissions were not inspected.
- A compromised sidecar can change rate policies, as its role necessarily allows, but changing
  these maps does not change the application's independently held authorization snapshot.
- Retained stale files and partial RAM/disk updates can leave an old or mixed rate policy in force;
  they are availability/policy-consistency boundaries, not proven remote file-write vulnerabilities.

## References

- [HAProxy 2.8 header fetch semantics](https://docs.haproxy.org/2.8/configuration.html#7.3.6-req.hdr)
- [Python redirect implementation](https://github.com/python/cpython/blob/3.14/Lib/urllib/request.py)
- [Gateway PR](https://github.com/icon-project/sodax-unified-api/pull/136)
- [Backend PR](https://github.com/icon-project/sodax-backend/pull/1380)
