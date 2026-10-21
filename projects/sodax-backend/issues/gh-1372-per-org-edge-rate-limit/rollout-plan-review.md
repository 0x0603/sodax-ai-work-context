---
type: review
repo: sodax-backend
github: 1372
updated: 2026-10-21
tags: [rollout, operations, rate-limit]
---

# Review of the seven-step post-merge rollout

The user supplied a table covering backend deployment, moving tenants to base, gateway preparation,
config promotion, verifier-token provisioning, sidecar installation and tier-limit activation.
The overall ordering is sound, subject to the corrections below. This is a plan review only;
no production access, messages, token provisioning or deployment was performed.

## Merge prerequisites

GitHub still showed both PRs open: backend #1380 at `da77c015`, gateway #136 now at `6abc75d`.
Backend fixes are staged locally. The gateway is clean and its latest commit contains the sidecar
hardening/watchdog changes, but org tracking still precedes the write-cap rejection. The remaining
P1 from `review-fixes-2026-10-21.md` must be addressed before treating the rollout as ready.
The proposed backend service list correctly includes the shared guard's consumers, swaps-api and
bridge-api, alongside api-auth and the dashboard.

## Corrections to the steps

1. Before the first sidecar starts, check both tier defaults and existing tenant overrides. Seeing
   `base: {}` and `pro: {}` does not prove the keyset has no effective limits. Run the owner-approved
   preflight query `SELECT org_id, limits FROM tenants WHERE limits <> '{}'::jsonb;` and inspect any
   rows. An existing override becomes enforced at step 6, not step 7.
2. Gateway preparation should create missing groups/directories/files without truncating existing
   maps. Before installing the service, explicitly assign the map directory and files to
   `sodax-keyset:sodax-keyset`, as the runbook requires. A root-owned 0755 directory prevents writes.
   The env file should be `0640 root:sodax-keyset`.
3. Adding the verifier token to api-auth's environment requires a restart/redeploy to load it;
   configuration reads the token list at startup. Check `/v1/keyset` returns 200 with the new token
   before installing the sidecars. Do not print credentials or the full keyset in rollout logs.
4. Validate an actual first successful sync (`lastSuccessAt`, zero failures, expected map contents)
   and that the watchdog timer is enabled. The initial grace period can make `healthy` alone
   insufficient. Expect zero mapped entries only after confirming the no-limit preflight above.
5. Step 7 changes central policy for every gateway polling the same api-auth. Config promotion via
   canary is separate from feature activation; setting the shared base-tier limit is fleet-wide.
   For a controlled smoke test, first use a dedicated test org and its existing override mechanism,
   validate on gateway-c, then clear the test override before enabling general tier limits.
6. Use a key from the keyset source the sidecar actually polls. The proposed URL is production
   api-auth on every gateway, so an unrelated canary API key will take the per-IP path. An innocuous
   GET to a deliberately unmatched edge path can demonstrate 404-then-429 without executing a
   transaction or confusing the edge test with a different app-auth environment. Pin the address
   family and verify prod traffic as well as canary before declaring completion.

## Add a rollback section

- Clearing tier limits does not clear org overrides. Account for both when disabling through
  central policy, and verify map removal rather than relying only on the dashboard save.
- If sync is broken, stop the sidecar and its watchdog timer, empty both maps while keeping the
  files, validate and reload HAProxy, and confirm per-IP behavior. Stopping the sidecar alone leaves
  existing org limits in RAM and on disk.
- Before rolling api-auth back to a version without base, move every base tenant back to pro,
  including tenants first created after deployment. The documented statement is
  `UPDATE tenants SET tier = 'pro' WHERE tier = 'base';`.

The runbook owns the exact host commands; do not silently execute this review as a rollout plan.
