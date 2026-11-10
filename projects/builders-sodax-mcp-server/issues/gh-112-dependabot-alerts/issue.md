---
type: issue
repo: builders-sodax-mcp-server
github: 112
url: https://github.com/gosodax/builders-sodax-mcp-server/issues/112
title: Clear the open Dependabot alerts
status: Open
created: 2026-11-10
updated: 2026-11-10
---

# GH-112 Clear the open Dependabot alerts (body as corrected, 2026-11-10 evening)

### What needs to be done

Dependabot lists 91 open alerts on `pnpm-lock.yaml` and `package.json` (2026-11-10: 3 critical, 32 high, 49 medium, 7 low; 24 packages). None is in code of this repo. They fall into three groups with different fixes; work through them in this order and document what stays open.

Group 1, 65 alerts: refresh the lockfile inside the ranges we already have (`pnpm update <package>`). Every patched version below is at least 14 days old.

| Alerts | Package | Installed | Patched | Pulled by |
|---|---|---|---|---|
| 142 (1 critical) | proxy-addr | 2.0.7 | 2.0.8 | express 4.22.1 (`~2.0.7`) |
| 64, 72, 129, 146 (4 high at worst) | body-parser | 1.20.4, 2.2.2 | 1.20.9, 2.4.0 | express 4 (`~1.20.5`); express 5.2.1 under @modelcontextprotocol/sdk (`^2.2.0`) |
| 95, 98, 147 (3 medium at worst) | qs | 6.15.2 | 6.16.1 | express 4.22.3 pins `~6.16.0`, so bump express to 4.22.3 first |
| 161 (1 high) | follow-redirects | 1.16.1 | 1.16.2 | axios 1.20.0 (`^1.16.0`) under @sodax/sdk |
| 69, 70, 83, 94, 96, 97, 108, 117, 131, 132, 133 (11 high at worst) | fast-uri | 3.1.2 | 3.1.9 | ajv 8.18.0 (`^3.0.1`) under @modelcontextprotocol/sdk |
| 57, 58, 59, 60, 61, 65, 67, 68, 81, 84, 85, 86, 99, 100, 101, 118, 123 (17 high at worst) | hono | 4.12.21 | 4.13.7 | @modelcontextprotocol/sdk (`^4.11.4`) |
| 91, 139 (2 medium at worst) | @hono/node-server | 1.19.14 | 1.19.15 (2.1.3 once the SDK is bumped) | @modelcontextprotocol/sdk (`^1.19.9`) |
| 78, 79, 82, 106, 107, 115, 116, 130 (8 high at worst) | ip-address | 10.2.0 | 10.7.4 | express-rate-limit 8.5.2 (`^10.2.0`) |
| 55, 56, 136, 138, 143, 144, 145 (7 high at worst) | vite | 6.4.2 | 6.4.4 | vitest 3 (peer `^6`), dev only |
| 75, 90 (2 high at worst) | postcss | 8.5.15 | 8.5.23 | vite (`^8.5.3`), dev only |
| 121 (1 high) | source-map-js | 1.2.1 | 1.2.2 | postcss (`^1.2.1`), dev only |
| 63, 77, 113, 114 (4 high at worst) | brace-expansion | 2.1.0, 5.0.6 | 2.1.7, 5.0.12 | minimatch 9 / 10 under test-exclude (`^2.0.2`, `^5.0.5`), dev only |
| 62, 71, 87, 105 (4 high at worst) | js-yaml | 4.1.1 | 4.3.2 | cosmiconfig under @commitlint/load (`^4.1.0`), dev only |

Group 2, 15 alerts: bump direct dependencies (one commit each).

| Alerts | Package | Fix | Note |
|---|---|---|---|
| 120, 124, 125, 126, 127, 137 (6 high at worst) | @modelcontextprotocol/sdk 1.26.0 | 1.32.2 (2026-10-23); the alerts need 1.30.1, 1.31.0 and 1.32.0 | the 100 kb body limit already covers the body alert; the SDK's own express 5, hono and express-rate-limit copies refresh with it |
| 134, 135 (2 high at worst) | zod 3.25.76 | the advisory covers every version below 4.6.6, so this is a migration to zod 4 in our six schema files (the SDK accepts `^3.25 \|\| ^4.0`); the SDK's own zod 3 copies stay until upstream moves | input is capped at 100 kb before zod sees it |
| 103, 104 (2 medium at worst), 102, 128 (2 medium at worst), 140, 141 (2 critical at worst) | vitest 3.2.6, @vitest/mocker 3.2.6, tinypool 1.1.1 (dev) | vitest and @vitest/coverage-v8 5.0.5 (2026-10-15; 5.1.0 is from 2026-11-02, too new before 2026-11-16): vitest 5 dropped tinypool and brings its own mocker | test runner only |
| 149 (1 medium) | minimatch 9.0.9, 10.2.5 (dev) | test-exclude 8.0.0 pins `^10.2.2`; 11.0.1 (2026-10-27) needs an override or a newer test-exclude | coverage tooling only |

Group 3, 11 alerts: transitive through @sodax/sdk 2.2.0, outside this repo's ranges.

| Alerts | Package | Installed | Patched | Pulled by | Path |
|---|---|---|---|---|---|
| 154, 155, 158, 159, 160 (5 high at worst) | toml | 3.0.0 | 5.0.1 | @coral-xyz/anchor 0.30.1 (`^3.0.0`, still in anchor 0.32.1); @stellar/stellar-sdk 15.1.0 (17.x no longer uses it) | anchor only reads Anchor.toml for local workspaces, so a pnpm override to 5.0.1 is low risk; run the Solana and Stellar swap tests after |
| 153, 156, 157 (3 medium at worst) | stream-json | 1.9.1 | 3.6.0 | jayson 4.3.0 under @solana/web3.js 1.98.0 (jayson 5 dropped it) | major jump; prefer the SDK moving solana web3 / jayson; an override needs the Solana paths tested |
| 152 (1 medium) | uuid | 8.3.2, 9.0.1 | 11.1.1 | jayson, rpc-websockets (14.0.3 is fine) | jayson uses v4 only, so not reachable; override or upstream |
| 150 (1 high) | bigint-buffer | 1.1.5 | none | anchor, @solana/spl-token, @pancakeswap/* | no patched release; needs upstream to drop the package |
| 151 (1 low) | elliptic | 6.6.1 | none | @injectivelabs/sdk-ts, icon-sdk-js | no patched release |

The clean fix for group 3 is in sodax-sdks (newer anchor, stellar, injective and solana dependencies). File it there and link it here.

### Why it needs to be done

The server runs on a public host and moves funds through the swap tools. Most of these alerts are not reachable from a request today, but a list this long hides the one that will be. Closing the fixable ones and documenting the rest lets a new alert stand out.

### Acceptance Criteria

- [ ] Groups 1 and 2 closed: lockfile refreshed, @modelcontextprotocol/sdk at 1.32.2 or later, vitest 5 for dev, zod 4 or a written decision to wait; unit, lint, build and contract tests pass.
- [ ] Group 3: an issue in sodax-sdks for the upstream bumps, linked here; overrides in this repo only for what the Solana and Stellar tests cover.
- [ ] Alerts with no patch (bigint-buffer, elliptic) dismissed on Dependabot with a reason, or left open with a note here.
- [ ] Every bump follows the repo rule: exact pin, version at least 14 days old, reason in the PR.
- [ ] After the PRs, the open alerts are only the group 3 ones waiting on upstream.

### Additional Information

- Dependabot: https://github.com/gosodax/builders-sodax-mcp-server/security/dependabot (needs write access on the repo).
- Why the critical and the high ones on the request path are not exploitable today: `trust proxy` is set to 1 hop in `src/index.ts` (the proxy-addr bug needs an IPv4-mapped IPv6 subnet), request bodies are capped at 100 kb (#104, which covers the SDK body alert and zod), and the hono alerts are in `serveStatic` and request parsing paths the SDK's transport does not use for this server.
- Patched versions and their dates, checked 2026-11-10 against the 14-day rule: proxy-addr 2.0.8 (09-15), body-parser 1.20.9 (10-22) and 2.4.0 (10-22), qs 6.16.1 (10-14), follow-redirects 1.16.2 (10-25), fast-uri 3.1.9 (10-19), hono 4.13.7 (09-04), @hono/node-server 1.19.15 (07-24), ip-address 10.7.4 (10-11), vite 6.4.4 (10-06), postcss 8.5.23 (07-24), source-map-js 1.2.2 (09-30), brace-expansion 2.1.7 and 5.0.12 (09-14), js-yaml 4.3.2 (08-26), MCP SDK 1.32.2 (10-23), zod 4.6.6 (10-11), toml 5.0.1 (10-12), stream-json 3.6.0 (08-28), uuid 11.1.1 (04-29), minimatch 11.0.1 (10-27), vitest and coverage-v8 5.0.5 (10-15).
