---
type: draft
repo: sodax-observability
github: 110
status: Superseded, Robi opened and merged icon-project/sodax-observability#25 (2026-11-10), with a dev token too
updated: 2026-11-11
---

Title: `feat(collector): add builders-sodax-mcp-server staging and prod producer`

Refs gosodax/builders-sodax-mcp-server#110

Runbook section 5 for a new producer: builders-sodax-mcp-server (`service.namespace=builders-sodax-mcp-server`) gets `OTEL_TOKEN_BUILDERSMCP_STAGING` and `OTEL_TOKEN_BUILDERSMCP_PROD` from `SERVICE_HEX_64_TOKENBUILDERSMCPSTAGING` and `…PROD`, in the collector environment, `bearertokenauth.tokens`, the validate-collector job, `.env.example` and the README's Coolify table.

Staging is the test server deployed from the MCP's `development` branch; prod is builders.sodax.com/mcp. Both run on `ubuntu-24gb-12vcpu-1`, which isn't on `otel-allowlist` yet, so the runbook listing in section 2 gets its IPv4 from the hub registry and the Coolify proxy config needs the same line. Its egress address is unverified; check it from the container first.

The prod token is here so production needs no second release. Hand its value over only when production turns logging on: tokens aren't bound to a namespace yet (ADR 014).

Runbook, also: step 5 no longer counts the tokens (it said eight, now ten) and points at the README table, and step 3 says a producer that can be quiet for 10 minutes needs a heartbeat or an exclusion in `producer-liveness.yaml`. The MCP sends a heartbeat every 5 minutes, so it needs no exclusion.

Verified: `otelcol validate` with the pinned image as `ci.yml` runs it; the local stack with `docker-compose.ci.yml`, smoke test 23/23 and e2e 3/3; the MCP's PR build shipping with each new token (rows land in ClickHouse, a wrong token gets 401); `yamllint --strict`; gitleaks.

After merge: release `main` to `production`, send the staging value through the secret channel, and add the IPv4 to `otel-allowlist` in Coolify.

Two things noticed on the way, not changed here:

- Any token can write records under any `service.namespace`, so a leaked token can impersonate another producer. This PR adds the first producer on a host that serves a public repo's code.
- The connect check in the hub skill posts with the real namespace and `deployment.environment=dev`, so the liveness alert will fire for that pair about 15 minutes later. Excluding `dev` from the alert, or running the check under `sodax-observability`, would avoid it.
