---
type: draft
repo: sodax-command-center
github: 110
status: Posted as the hub PR (2026-11-11)
updated: 2026-11-11
---

Title: `docs(repos): builders MCP swap tools and unified logging, IF-25 and IF-37 consumers`

Refs gosodax/builders-sodax-mcp-server#110. Merge after gosodax/builders-sodax-mcp-server#111, whose code these lines describe.

- `docs/repos/builders-sodax-mcp-server.md`: the swap tools (on `development` since 2026-11-09) and optional unified logging, Node ≥22.15, IF-25 and IF-37 under the interfaces it consumes, a gotcha on which logging variables it reads, and one that a swap test on the test server spends real funds.
- `docs/interfaces.md`: the MCP added to IF-25's consumers (its zod schemas are hand-aligned, so the change-impact column now says to update them) and to IF-37's producers, with its three tokens from icon-project/sodax-observability#25. The "pending" on sodax-debug-mcp's #24 is dropped, since #24 is merged.
- `unified-logging-connect` skill: how the MCP is configured (the endpoint as the full `/v1/logs` URL or the base URL; it refuses the `*_HEADERS` variables), and the rule that a producer quiet for 10 minutes needs a heartbeat or an alert exclusion (icon-project/sodax-observability#25 excludes the MCP's `staging` and `dev`).
- `docs/repos/sodax-observability.md`: the producer list points at IF-37's consumers instead of copying them. The copy had already missed sodax-debug-mcp.
- Regenerated indexes.
