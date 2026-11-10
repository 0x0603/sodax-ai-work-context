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

# GH-112 Clear the open Dependabot alerts (body as filed, 2026-11-10)

### What needs to be done

Dependabot lists 30 open alerts on `pnpm-lock.yaml` (2026-11-10: 3 critical, 12 high, 11 medium, 4 low). None is in code of this repo. They fall into three groups with different fixes; work through them in this order and document what stays open.

Group 1: refresh the lockfile inside the ranges we already have (`pnpm update <package>`).

| Alert | Package | Installed | Patched | Pulled by |
|---|---|---|---|---|
| 142 critical | proxy-addr | 2.0.7 | 2.0.8 | express (`~2.0.7`) |
| 146 high | body-parser | 1.20.4 | 1.20.9 | express (`~1.20.5`) |
| 147 medium | qs | 6.15.2 | 6.16.1 | express 4.22.3 pins `~6.16.0`, so bump express to 4.22.3 first |
| 161 high | follow-redirects | 1.16.1 | 1.16.2 | axios 1.20.0 (`^1.16.0`) under @sodax/sdk |
| 131, 132, 133 | fast-uri | 3.1.2 | 3.1.9 | ajv 8.18.0 (`^3.0.1`) under @modelcontextprotocol/sdk |
| 136, 138, 143, 144, 145 | vite | 6.4.2 | 6.4.4 | vitest 3 (peer `^6`), dev only |

Group 2: bump direct dependencies (one commit each).

| Alert | Package | Fix | Note |
|---|---|---|---|
| 137 high, 139 medium | @modelcontextprotocol/sdk 1.26.0, with its @hono/node-server 1.19.14 | 1.30.1 or later (1.32.2 is from 2026-10-23); it accepts @hono/node-server 2.x, so refresh that too | the 100 kb body limit already covers 137; hono's serveStatic is not used here |
| 134, 135 high | zod 3.25.76 | the advisory covers every version below 4.6.6, so this is a migration to zod 4 in our six schema files (the MCP SDK accepts `^3.25 \|\| ^4.0`); the SDK's own zod 3 copies stay until upstream moves | input is capped at 100 kb before zod sees it |
| 140, 141 critical, dev | tinypool 1.1.1 | vitest 3 pins tinypool 1.x and vitest 4 and 5 dropped it: bump vitest and @vitest/coverage-v8 to 5.0.5 (2026-10-15; 5.1.0 is from 2026-11-02, too new before 2026-11-16) | test runner only |
| 149 medium, dev | minimatch 9.0.9, 10.2.5 | test-exclude 8.0.0 pins `^10.2.2`; 11.0.1 (2026-10-27) needs an override or a newer test-exclude | coverage tooling only |

Group 3: transitive through @sodax/sdk 2.2.0, outside this repo's ranges.

| Alert | Package | Installed | Patched | Pulled by | Path |
|---|---|---|---|---|---|
| 154, 155, 158, 159, 160 high | toml | 3.0.0 | 5.0.1 | @coral-xyz/anchor 0.30.1 (`^3.0.0`, still in anchor 0.32.1); @stellar/stellar-sdk 15.1.0 (17.x no longer uses it) | anchor only reads Anchor.toml for local workspaces, so a pnpm override to 5.0.1 is low risk; run the Solana and Stellar swap tests after |
| 153, 156, 157 medium | stream-json | 1.9.1 | 3.6.0 | jayson 4.3.0 under @solana/web3.js 1.98.0 (jayson 5 dropped it) | major jump; prefer the SDK moving solana web3 / jayson; an override needs the Solana paths tested |
| 152 medium | uuid | 8.3.2, 9.0.1 | 11.1.1 | jayson, rpc-websockets (14.0.3 is fine) | jayson uses v4 only, so not reachable; override or upstream |
| 150 high | bigint-buffer | 1.1.5 | none | anchor, @solana/spl-token, @pancakeswap/* | no patched release; needs upstream to drop the package |
| 151 low | elliptic | 6.6.1 | none | @injectivelabs/sdk-ts, icon-sdk-js | no patched release |

The clean fix for group 3 is in sodax-sdks (newer anchor, stellar, injective and solana dependencies). File it there and link it here.

### Why it needs to be done

The server runs on a public host and moves funds through the swap tools. Most of these alerts are not reachable from a request today, but a list of 30 hides the one that will be. Closing the fixable ones and documenting the rest lets a new alert stand out.

### Acceptance Criteria

- [ ] Groups 1 and 2 closed: lockfile refreshed, @modelcontextprotocol/sdk at 1.30.1 or later, vitest 5 for dev, zod 4 or a written decision to wait; unit, lint, build and contract tests pass.
- [ ] Group 3: an issue in sodax-sdks for the upstream bumps, linked here; overrides in this repo only for what the Solana and Stellar tests cover.
- [ ] Alerts with no patch (bigint-buffer, elliptic) dismissed on Dependabot with a reason, or left open with a note here.
- [ ] Every bump follows the repo rule: exact pin, version at least 14 days old, reason in the PR.
- [ ] After the PRs, the open alerts are only the group 3 ones waiting on upstream.

### Additional Information

- Dependabot: https://github.com/gosodax/builders-sodax-mcp-server/security/dependabot (needs write access on the repo).
- Why 142, 137 and the zod alerts are not exploitable from a request today: `trust proxy` is set to 1 hop in `src/index.ts` (the proxy-addr bug needs an IPv4-mapped IPv6 subnet), and request bodies are capped at 100 kb (#104).
- Patched versions and their dates, checked 2026-11-10 against the 14-day rule: proxy-addr 2.0.8 (09-15), body-parser 1.20.9 (10-22), qs 6.16.1 (10-14), follow-redirects 1.16.2 (10-25), fast-uri 3.1.9 (10-19), vite 6.4.4 (10-06), MCP SDK 1.32.2 (10-23), zod 4.6.6 (10-11), toml 5.0.1 (10-12), stream-json 3.6.0 (08-28), uuid 11.1.1 (04-29), minimatch 11.0.1 (10-27), vitest and coverage-v8 5.0.5 (10-15).
