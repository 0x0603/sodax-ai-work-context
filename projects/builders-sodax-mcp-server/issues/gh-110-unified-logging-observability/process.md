---
type: process
repo: builders-sodax-mcp-server
github: 110
updated: 2026-11-10
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

- 2026-11-10: Reviewed [PR #111](https://github.com/gosodax/builders-sodax-mcp-server/pull/111) at `05d4b5c` against #110, the backend producer spec, and the collector's actual ingest configuration. GitHub Build and Test, API Drift Check, and Docker build were green. A detached worktree passed `checkTs`, `lint`, `build`, and all 998 tests under Node 22.15 with the frozen lockfile. Targeted checks used a local Express app, synthetic upstream responses, an in-memory OTel exporter, and a loopback protobuf receiver. No staging credentials or live swaps were used.

## Findings

- `httpGuards.ts:63`: The global limiter logs a caller-controlled path under `http.route` for its first 429, including on unmatched routes. A synthetic key in that path reached the exporter. The collector's key and bearer-pattern backstop does not mask it. Emit a fixed route label or omit it for unmatched routes.
- `swap/usd.ts:29` and `swap/tokens.ts:94`: The empty keyless context drops `request.id` for the quote's oracle fetch and both cold catalog calls. Keep correlation while removing credentials. For a shared refresh, retain a link for callers joining existing work if they also need to follow it.
- `analytics.ts:184`: SDK lookup and input validation run before the wrapped callback. Unknown and invalid tool calls returned HTTP 200 with `isError: true` but no tool outcome reached the exporter. Capture the sanitized result at the SDK or MCP transport boundary, including results returned over SSE.
- `http.ts:159`: `timedFetch` logs when headers arrive. A synthetic 200 with a body that times out logged a successful status and header latency with no upstream error code. Include response consumption in the measurement and record body failures without the payload.
- `httpGuards.ts:113`: A two-message batch after 59 requests bypassed the rate-limit warning, and the next rejected request was also silent at the default level. Share the first-crossing warning between single requests and batches.
- `index.ts:492`: Invalid `SODAX_ENV` or `SODAX_SWAP_USD_WARN` exits before OTLP attaches. The loopback receiver got no record for an invalid `SODAX_ENV`, while an invalid swap-tools flag after initialization shipped a fatal record. Initialize the exporter before those two startup checks so the existing fatal flush can send their records.

## Changes During Work
