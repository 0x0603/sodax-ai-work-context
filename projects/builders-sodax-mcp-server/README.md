# builders-sodax-mcp-server — context

Upstream: `github.com/gosodax/builders-sodax-mcp-server` (default branch `development`,
production `master`, release-please). Hosted at `https://builders.sodax.com/mcp`.

## Overview

Hosted MCP server for SODAX builders and agents. Express + `@modelcontextprotocol/sdk`
(stateless streamable HTTP, legacy SSE, stdio). Read tools proxy `api.sodax.com/v1/be`,
the solver (`/v1/intent`) and the intent relay; `docs_*` tools proxy docs.sodax.com's
Mintlify MCP. Epic #79 adds non-custodial swap tools (`swap` profile).

Local: `pnpm i && pnpm dev` (port 3000). Gates: `pnpm checkTs && pnpm lint && pnpm build && pnpm test`,
plus the CI Docker build. Feature branches squash-merge into `development` (`CONTRIBUTING.md`).

## Layout

- `issues/` — one folder per GitHub issue / task (`gh-<n>-<title>/`). Scaffold:
  `scripts/new-issue.sh builders-sodax-mcp-server <n> <title...>` (fix the `source:` URL —
  the script assumes the icon-project org).
- `decisions/` — repo-scoped ADRs.
