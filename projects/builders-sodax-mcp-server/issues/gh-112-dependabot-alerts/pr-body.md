---
type: draft
repo: builders-sodax-mcp-server
github: 112
status: Posted as PR #114 (2026-11-11)
updated: 2026-11-11
---

Title: `chore(deps): clear the open Dependabot alerts`

Refs #112.

Clears 84 of the 91 open Dependabot alerts. Every new version in the lockfile is at least 14 days old (cutoff 2026-10-27).

Direct dependencies, pinned exactly:

- `@modelcontextprotocol/sdk` 1.26.0 to 1.32.2: the alerts on the SDK itself, and it lets `@hono/node-server` move to 2.x.
- `express` 4.22.1 to 4.22.3: its `qs` range now admits the patched `qs`.
- `vitest` and `@vitest/coverage-v8` 3.2.6 to 5.0.5 (dev): drops `tinypool` and brings a patched `@vitest/mocker`. `vite` 6.4.5 is pinned as a devDependency because vitest 5 declares it only as a peer.

The transitive fixes live in the lockfile, not in overrides. Each patched version is inside the range its parent declares, so the lockfile pins it and a later `pnpm update` can still move it: proxy-addr, body-parser, qs, follow-redirects, fast-uri, hono, ip-address, postcss, source-map-js, js-yaml, fast-copy. Overrides change only where they must:

- The `follow-redirects` 1.16.1 hold is gone. 1.16.2 is the fix and is old enough now.
- `@hono/node-server`'s floor moves to 2.1.3. The old `^1.19.14` floor kept it on 1.x.
- `toml` 5.0.1 and `uuid` 11.1.1 sit outside their parents' ranges. anchor and stellar-sdk call only `toml.parse`, jayson only `uuid.v4`. Checked by loading the SDK and making a live Solana RPC call through jayson.

Tests: vitest 5's `restoreAllMocks` restores `vi.spyOn` spies only, so `vitest.config.ts` sets `mockReset: true` (a mocked oracle leaked from one quote test into the next). MCP SDK 1.32 words input validation errors as "<message> at <field>", and `swapSafety.test.ts` matches that.

Still open, on purpose:

- zod 3.25.76 (2 high). zod 4.6.6 passes everything except the builder tools snapshot: every published input schema loses `additionalProperties: false`, which strict-mode clients rely on. Moving to zod 4 means declaring each tool's input as a strict object, a change of its own. Request bodies are capped at 100 kb before zod sees them.
- stream-json (3 medium). jayson requires its internals two majors back, so the fix is jayson or `@solana/web3.js` moving, upstream in sodax-sdks.
- bigint-buffer and elliptic have no patched release; they can be dismissed with that reason.

Checked: `checkTs`, lint, 949 unit tests, build, the contract tests against canary (26/26), the built server over `/mcp` and SSE, and the combination with #111 (1011 tests).

Follow-up, not here: the cooldown holds from #94 (core-js, viem and others) stay until someone lifts them. A Dependabot `cooldown` block or pnpm 10's `minimumReleaseAge` would make them unnecessary.
