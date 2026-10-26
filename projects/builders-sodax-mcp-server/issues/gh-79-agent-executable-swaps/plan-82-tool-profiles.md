---
type: plan
repo: builders-sodax-mcp-server
github: 82
related_issues: [79, 81]
tags: [mcp, profiles, api-key]
updated: 2026-10-26
---

# #82 — Tool profiles (`builder` / `swap` / `all`), the swap-tool key gate, the rollout switch

Status: draft PR #92, `feat/82-tool-profiles` @ `1757a9e` (off `feat/81-forward-api-key` @ `0930893`; merge `development` in once #91 lands). Drafted by a planning agent on 2026-10-26 from `c0f11f1`; adjusted after #81's review
fixes (`f27de38`) and reviewed against the code and SDK 1.26.0 the same day (see §Review). Line references are at
`c0f11f1`; `src/index.ts` has shifted since, so find code by function name.

## Context

ADR 0001 D2 and D4; `plan.md` decisions 6 and 9 and the rollout gate. Today every connection gets the same 38
registered tools (30 in `sodaxApi.ts`, 5 in `solverRelay.ts`, 3 docs meta-tools) plus proxied `docs_*` tools. Swap
tools arrive in #83–#85, so after #82 every accepted connection still gets today's list.

What an agent sees after #82: no profile (`all`) or `?profile=builder` → no change; `?profile=swap` → refused ("not
enabled yet" or "API key required"); `?profile=bogus` → HTTP 400.

**Departs from the issue text** (ADR and `plan.md` win):
- No per-tool profile tag: `registerAppTool` already tags a `module` (toolRegistry.ts:40-53). A new `swap` module is
  the swap profile; every other module is `builder`.
- The key requirement and the rollout switch aren't in the issue; they come from ADR D2 and `plan.md`.
- "List profiles in server.json" stays out of the URL: no `?profile={profile}` template yet (see design 9). The
  profiles go in the `x-api-key` header description and the README.
- "Clear error" becomes HTTP 400 with JSON-RPC `-32602`.

## Scope

In: `src/services/profiles.ts`; `createServer` moves to `src/server.ts` and takes toolsets; the gate on `/mcp`,
`GET /sse` and stdio; `SODAX_SWAP_TOOLS_ENABLED`; a `swap` registry module; profiles in `/health`, `/api` and a
landing card; `server.json`, README, `.env.example`.

Out (owner): swap tools and their registrar (#83–#85) · re-checking the key per call in `registerActionTool` (#84) ·
partner-fee connection params (#84) · analytics `tool_group` for swap tools (#87; `analytics.ts:27-34` would file
them under `api`) · swap entries in `server.json` `tools`, README walkthrough, removing the switch (#89) · turning
the switch on in staging (gosodax admin).

## Design

1. **Pick toolsets where each transport builds its server.** `/mcp` builds one per request (index.ts:311-321),
   `/sse` one per `GET /sse` (326-339), stdio one per process (155-165). Each resolves toolsets first, then
   `createServer(toolsets, clientId)` runs only the allowed registrars. No post-registration filtering; builder
   registration code unchanged.
2. **Profile source.** HTTP: `?profile=`, else `x-sodax-profile` (query wins: URL-only clients can only set the
   query). stdio: `--profile`, else `MCP_PROFILE`; read with `node:util` `parseArgs({ args, options: { profile: {
   type: "string" } }, strict: false, allowPositionals: true })` so unrelated argv never stops the server. Trim +
   lowercase; unset or empty → `all`. HTTP ignores `MCP_PROFILE`.
3. **`selectToolsets(requested, { hasApiKey, swapToolsEnabled })`, in order:**
   - unknown profile (including a repeated `?profile=`, which Express parses as an array) → 400 / `-32602`,
     `Unknown profile. Use builder, swap or all.` Don't echo the value back: it is caller input of any size.
   - `swap` with the switch off → 400 / `-32602`, `The swap profile is not enabled on this server yet. Use builder or
     all.` (A McpServer with no tools declares no `tools` capability — sdk `server/mcp.js:56-64,650` — so an empty
     `swap` server would tell the agent nothing.)
   - `swap` without a key → **403** / `-32000`, `API key required for the swap profile. … https://docs.sodax.com/developers/how-to/api-keys`.
     Not 401: on 401 the SDK client starts OAuth when an auth provider is set and our message is lost; on a 403
     without `insufficient_scope` it throws `Error POSTing to endpoint: <body>` (sdk `client/streamableHttp.js:314-364`).
     `-32000` with `id: null` matches the SDK's own 403s (`server/webStandardStreamableHttp.js:86-95,118`).
   - else `{ builder: profile !== "swap", swap: profile !== "builder" && swapToolsEnabled && hasApiKey }`, so keyless
     `all` gets exactly the builder tools.
4. **Key presence reuses #81.** HTTP: `callerApiKey(req) !== undefined`; stdio: the `apiKey` `runStdio` passes to
   `setFallbackRequestContext`. Both go through `parseApiKey` (only `sodax_…`), so a malformed key counts as none —
   consistent, since it isn't forwarded either.
5. **Refusal per transport.** HTTP: send the JSON-RPC error before building a server. SSE: same on `GET /sse` (SDK
   SSE clients only see `Non-200 status code (403)`; acceptable, swap users connect to `/mcp`). stdio: throw
   `ConnectionError` at the top of `runStdio`, before `warmDocsCache`; `fatalExit` logs and exits 1.
6. **Rollout switch `SODAX_SWAP_TOOLS_ENABLED`.** `true` → on; unset, empty or `false` → off; anything else stops
   boot (a typo must not flip the gate). Parsed in `main()` so a bad value goes through `fatalExit`, like `SODAX_ENV`.
   Off: swap tools never registered or recorded, landing card hidden, `/api` says "not enabled".
7. **Registry.** Add `"swap"` to `ToolModule`. `getStaticToolCounts` returns `{ api, relay, swap }` and keeps swap out
   of `api` (today `api` counts everything not `relay`/`sdkDocs`, toolRegistry.ts:114-122).
8. **No swap tools yet.** `createServer` gets a comment where #83 adds its registrar. Filtering is tested on the pure
   `selectToolsets` and on what `createServer` serves; no placeholder tool in production code.
9. **`server.json` keeps the plain URL.** The schema allows a `{profile}` URL variable, but a registry client that
   doesn't substitute it would send the literal `?profile={profile}`, get our "unknown profile" 400, and lose the
   builder tools too. The default `all` already gives builder tools, plus swap tools with a key, so the plain URL
   loses nothing. Add the template only once registry clients are known to substitute variables.

## Changes

**New `src/services/profiles.ts`** (pure; reads no env):
```ts
export const PROFILES = ["builder", "swap", "all"] as const;
export interface Toolsets { builder: boolean; swap: boolean }
export class ConnectionError extends Error { constructor(readonly httpStatus: 400 | 403, readonly rpcCode: -32602 | -32000, message: string) }
export function parseSwapToolsEnabled(value: string | undefined): boolean;                  // throws on junk
export function selectToolsets(requested: unknown, opts: { hasApiKey: boolean; swapToolsEnabled: boolean }): Toolsets;
export function profileFromRequest(req: Pick<Request, "query" | "get">): unknown;           // query.profile ?? header
export function profileFromArgs(argv: string[], env: NodeJS.ProcessEnv): unknown;           // --profile ?? MCP_PROFILE
```
The key message is defined here (#81 no longer exports `API_KEY_HINT`).

**New `src/server.ts`:** move `SERVER_VERSION`, `SERVER_INSTRUCTIONS`, `createServer` from index.ts:37-86 unchanged
(own `__dirname`; index.ts keeps its own for lines 235, 262). Then `createServer(toolsets: Toolsets, clientId?)`,
the three registrar calls under `if (toolsets.builder)`, a comment for #83's swap registrar under `toolsets.swap`.
Why: index.ts calls `main()` on import (index.ts:441), so tests can't import it.

**`src/index.ts`:**
- `main()`: `const swapToolsEnabled = parseSwapToolsEnabled(process.env.SODAX_SWAP_TOOLS_ENABLED)`; pass to
  `runStdio` / `runHTTP`; add to the "running on" log line.
- `runStdio`: first `selectToolsets(profileFromArgs(process.argv.slice(2), process.env), { hasApiKey: apiKey !== undefined, swapToolsEnabled })`,
  then `createServer(toolsets)`.
- `runHTTP`: helper `connectionToolsets(req, res)` → `selectToolsets(profileFromRequest(req), …)`; on `ConnectionError`
  send `res.status(e.httpStatus).json({ jsonrpc: "2.0", error: { code: e.rpcCode, message: e.message }, id: null })`
  and return `undefined`. Call first in `/mcp` and `GET /sse`.
- `/health`: `tools.swap`, included in `total`. `/api`: `tools.swap`, and `profiles: { default: "all", select:
  "?profile=<name> or the x-sodax-profile header", builder, swap, all }` with one-line descriptions ("Not enabled on
  this server yet." when off). `serveLandingPage`: pass `swapToolsEnabled`.

**`src/services/toolRegistry.ts`:** `"swap"` in `ToolModule`; `swap: []` / `swap: 0` in `getToolNamesByModule` /
`getToolCountsByModule`; `getStaticToolCounts` per design 7; header comment.

**`src/services/landingPage.ts` + `src/public/index.html`:** `swapToolsEnabled` in `LandingPageData`; placeholders
`SWAP_TOOLS`, `SWAP_CARD_HIDDEN` (`"hidden"` / `""`); `TOTAL_TOOLS` adds swap. A `<details class="tool-module"
{{SWAP_CARD_HIDDEN}}>` card after "Partners & Token" — "Swaps", "Quote, track and cancel cross-chain swaps; your
wallet signs", `{{SWAP_TOOLS}} tools`, tag "SODAX API"; body: connect to `/mcp?profile=swap` with `x-api-key`, plus
the get-a-key link. `hidden` works (`.tool-module` sets no `display`, index.html:586-590). No literal counts
(toolRegistry.test.ts:76-81).

**`server.json` `remotes[0]`:** `url` unchanged (design 9). #81 already added the `x-api-key` header; change its
description to "Optional for builder tools, required for swap tools (connect with ?profile=swap, or the default
all)".

**Docs:** README "Profiles" subsection under Quick Start (table, selection by URL / header / stdio, keyless `all` =
builder, swap needs a key); "API Key" section says it's required for swap tools; env table `MCP_PROFILE` (stdio),
`SODAX_SWAP_TOOLS_ENABLED`; `?profile=` note under API Endpoints. `.env.example`: both vars, commented.

## Tests

Commit 1 moves `createServer` and records the builder snapshot against today's behavior, with the snapshot file
committed (vitest in CI fails on a missing snapshot instead of writing it); no later commit may change that file.

- `src/server.test.ts`: `Client` ↔ `createServer` over `InMemoryTransport.createLinkedPair()`
  (`@modelcontextprotocol/sdk/inMemory.js`). `vi.spyOn(globalThis, "fetch").mockRejectedValue(…)` so only the 3
  docs meta-tools register (`fetchDocsTools` returns `[]` on failure, docsProxy.ts:236-240).
  - builder: `toMatchFileSnapshot("__snapshots__/builder-tools.json")` on `JSON.stringify(tools, null, 2)` (names,
    descriptions, schemas, annotations of all 38).
  - keyless `all` (`selectToolsets(undefined, { hasApiKey: false, swapToolsEnabled: true })`) → same file.
  - `{ builder: false, swap: true }` → `getServerCapabilities()?.tools` undefined (no builder tool leaks into swap).
- `src/services/profiles.test.ts`: `selectToolsets` matrix — profile (unset, `""`, `" Swap "`, `builder`, `swap`,
  `all`, `bogus`, `["swap","all"]`) × key × switch → toolsets or `ConnectionError` status / code / message (403 message
  has "API key required" and the docs URL; switch-off wins over missing key). `profileFromRequest` (query, header,
  both → query, neither). `profileFromArgs` (`--profile swap`, `--profile=builder`, `MCP_PROFILE`, flag beats env).
  `parseSwapToolsEnabled` (unset / `""` / `false` → false; `true` / `" TRUE "` → true; `yes` throws).
- `toolRegistry.test.ts`: "at least one tool per module" skips `swap` until #83; count-sum includes `swap`; expected
  placeholders include `SWAP_TOOLS`, `SWAP_CARD_HIDDEN`; switch off → card `hidden`, on → not.

## Verification

1. `pnpm checkTs && pnpm lint && pnpm build && pnpm test`; `git diff origin/development -- src/tools` empty.
2. HTTP smoke (`TRANSPORT=http PORT=3100 node dist/index.js`, `tools/list` on `/mcp`, key `sodax_smoke`):
   - switch off: no profile, `?profile=builder`, keyed `all` → same names as `development`; `?profile=bogus` → 400
     `-32602`; keyed `?profile=swap` → 400 "not enabled"; `/` card has `hidden`; `/api` `.profiles.swap` "Not enabled".
   - `SODAX_SWAP_TOOLS_ENABLED=true`: keyless `?profile=swap` and keyless `x-sodax-profile: swap` → 403 with message
     and docs URL; keyed `initialize` → 200, no `tools` capability; keyless `GET /sse?profile=swap` → 403.
   - `SODAX_SWAP_TOOLS_ENABLED=yes` → exits 1 with the message.
3. stdio: `initialize` + `tools/list` into `TRANSPORT=stdio node dist/index.js --profile builder` → same list;
   `MCP_PROFILE=bogus`, and `--profile swap` with the switch on and no `SODAX_API_KEY` → exit 1, message on stderr.
4. `jq '.remotes[0]' server.json`: plain URL, header description updated.
5. stdio with an unrelated extra argument (`node dist/index.js --foo`) still starts.

## Ship

- Branch `feat/82-tool-profiles` off `feat/81-forward-api-key` (after its commits are pushed). When #91
  squash-merges, **merge** `origin/development` into the branch — never rebase; if that merge is noisy, route through
  an intermediate branch. Then open the PR into `development` (not a GitHub stacked PR).
- Commits (conventional, no `#N`): `refactor: move createServer to src/server.ts` · `test: snapshot the builder tool
  list` · `feat: add tool profiles and the swap-tool key gate` · `docs: document tool profiles`.
- PR title `feat: add tool profiles (builder, swap, all)`; body `Closes #82`, what changed, where it departs from the
  issue, why keyless swap gets 403 not 401. Public repo: no internal hosts or teammates.
- After merge: ask a gosodax admin to set `SODAX_SWAP_TOOLS_ENABLED=true` on staging; update `plan.md` row 82 and
  `brief.md`.

## Open questions

1. **Server instructions for `swap`.** `SERVER_INSTRUCTIONS` (index.ts:50-66) names builder tools a `swap` connection
   won't have. Proposed: profile-specific instructions with the first swap tool (#83/#84), not in #82.

(Publishing `server.json` is no longer a question: with the plain URL it carries no swap choice. Nothing publishes it
automatically anyway — release-please bumps only `$.version`, release-please-config.json:22-28.)

## Review (2026-10-26)

Checked against the code at `0930893` and `@modelcontextprotocol/sdk` 1.26.0 in `node_modules`:
- 401 vs 403: `client/streamableHttp.js` starts an auth flow on 401 when an auth provider is set, and on 403 without
  `insufficient_scope` throws `Error POSTing to endpoint: <body>`. 403 holds.
- An McpServer registers the `tools` capability only on its first tool (`server/mcp.js:56-66`, called at `:650`).
- `createJsonErrorResponse` builds `{ jsonrpc: "2.0", error, id: null }` (`server/webStandardStreamableHttp.js`).
- `.tool-module` sets no `display` (index.html:586-590), so `hidden` on the card works.
- `seedToolRegistry` uses a recording fake, not `createServer`, so #82 leaves it alone; `fetchDocsTools` returns
  `cachedTools || []` on failure, so the snapshot test is stable with `fetch` rejected.
- Changed in review: no `server.json` URL template (design 9), `parseArgs` with `strict: false`, snapshot file
  committed in commit 1, find code by function name.

**Security** (what the design already gets right, and what it accepts):
- Fails closed: switch default off and junk stops boot; unknown profile is an error; no key → no swap tools.
- Profile, key and (in #84) partner fee are connection settings, never tool input, so a prompt can't switch them.
- A refused connection does no work: the error is sent before `createServer`, after `mcpLimiter` counted it.
- The 400 doesn't echo the requested profile (design 3).
- Accepted (ADR D2): the gate checks presence only, so `sodax_anything` gets swap tools until the backend enforces
  keys on `/v1/swaps`.
- Accepted: on SSE, #81 binds the `GET /sse` key to the session, so whoever holds the session id can call with that
  key. The id is `randomUUID()` (`server/sse.js:20`) and only the connecting client sees it.
- Never log the key or the raw profile value on a refusal.

**Architecture**:
- Three layers with one job each: `profiles.ts` decides (pure, env-free), `server.ts` composes the toolsets,
  `index.ts` wires transports. Keep env reads in `main()` and pass values down.
- Changed in review: `ProfileError` → `ConnectionError`. #84 validates the partner fee at the same point (HTTP 400
  on a bad value), so one error type and one refusal path serve every connection setting.
- The gate sits at connection time on purpose: tools are chosen per connection. The per-call key check #84 adds is
  for SSE, where calls carry their own key.

## Notes for later sub-issues

- #83: add the swap registrar under `toolsets.swap` in `createServer` and in `seedToolRegistry` (index.ts:103-107)
  under the switch; remove the `swap` skip in `toolRegistry.test.ts`; test the first swap tool shows only with
  `swap: true`.
- #84: on SSE the gate reads the key on `GET /sse` but calls may carry their own on `POST /messages`; the action
  template should re-check key presence at call time.
