---
type: process
repo: builders-sodax-mcp-server
github:
status: Review done, nothing implemented
updated: 2026-11-26
tags: [mcp, code-quality, maintainability, scale, agent-docs, kb, tests]
source_commit: 3a06fb4
related_issues: [gh-147, gh-125]
---

# Repo-wide code quality review (sodax-mcp)

## Scope and method

Read-only review of the whole repo at `feat/147-bridge-tools` `3a06fb4` plus that worktree's uncommitted changes
(`repos/client/builders-sodax-mcp-server/.claude/worktrees/147-bridge-tools`). Bridge files were read directly; the
transport/infra, builder-tools and swap/test areas were read by three sub-reviews, and every finding kept below was
then re-opened in the code and confirmed. Code only: comments and README claims about upstream services (bridge-api,
solver, relay, SDK internals under `node_modules`) were not checked against those services.

Gates at review time: lint, checkTs, 66 files / 3393 tests green (after one stale test import was fixed in the
worktree, see `gh-147-bridge-tools/code-quality-review.md`).

Bridge-specific findings live in `../gh-147-bridge-tools/code-quality-review.md` and are not repeated here.

## A. Cross-cutting (highest leverage)

A1. **Tests and fixtures are not typechecked.** `tsconfig.json` excludes `src/**/*.test.ts` and `__fixtures__`. A
    moved export broke 30 tests and still passed `pnpm checkTs`. Add a noEmit `tsconfig.test.json` to `checkTs`.

A2. **No agent docs in the repo.** No `CLAUDE.md` / `AGENTS.md`, no `docs/kb/`. Knowledge is in file-header comments
    and a 699-line README mixing users, operators and contributors. Seed `docs/kb/invariants.md` from the comments
    (hub `docs/kb-standard.md`); add a short `CLAUDE.md` with a folder map, gate commands, and "add a tool / a
    toolset / a chain family" checklists. The hub card does not mention bridge.

A3. **Single-instance by construction.** Per-process state, by file:
    - Stores: swap quote cache, `bridge/store.ts` (`bridges`, `claimed`, `openByKey`, `openByClient`).
    - Submit dedupe: `inFlight` in `swap/track.ts:119` and `bridge/track.ts`; `stageSince` poll clock.
    - Alerts: `sent`, `postsThisHour`, `held` in `swap/alerts.ts:83-86` (N instances = N times the Discord budget).
    - Transport: `sseSessions` (`index.ts:446`), SSE limiter counts and `MemoryStore` (`httpGuards.ts:108`), the
      global rate limiter's default store (`index.ts:320`).
    - Callers mutate store records by reference (`holdForTrack(record)`, `markSubmitted(bridge)`), which a remote
      store would turn into stale snapshots.
    Either assert single-instance at boot and document it, or move stores, dedupe and alert budget behind the #125
    store interface and make mutators take an id.

A4. **Adding a toolset touches about 8 places** (`PROFILES`, `Toolsets`, `ToolModule`, two count functions and
    `toolGroup` in `toolRegistry.ts`, `STATIC_REGISTRARS`, booleans threaded through 6 functions in `index.ts`,
    `describeProfiles` branching per combination). One toolset table and one `enabled` object.

A5. **Adding a chain family touches about 12 places; the compiler flags two.** Enforced: `NON_EVM` Record
    (`swap/sources/index.ts:17`), `SIGN_NON_EVM_TX` (`swapDecisions.ts:342`). Silent: `isMissingAccount` with
    `default: false` (`sodax.ts:571-580`), `encodeRecipient` guards, `destination.ts`, `balance.ts`, `quote.ts`,
    `tokens.ts`, `secrets.ts`, `swapsApi.ts`, `swapDecisions.ts`. Move per-family quirks into one
    `Record<family, {...}>` so a missing entry fails to compile.

A6. **Adapters hard-code one chain per family.** `callsPinned` reads `spokeChainConfig.solana.addresses`
    (`sources/solana.ts:116`), same for sui and near; hence `CHAINS_OF_TYPE.get(type) !== 1` returns undefined
    (`sources/index.ts:52`): a second chain of a family disables both. Pass `source` into `callsPinned`.

## B. Transport and infra

B1. **`/health` awaits an upstream call.** `index.ts:386` awaits `getIntegratedNetworksCount()`; on a cache miss
    that is `fetchJson` with the 30 s default timeout (`http.ts:25`), while the compose healthcheck times out at
    10 s (`docker-compose.yml:25`). Failures are not cached. A hung SODAX API can mark the container unhealthy, and
    a restart drops open quotes and bridges. Read the cached value only, or pass a 2 s timeout.

B2. **Shutdown never closes the listener.** `app.listen`'s return value is discarded (`index.ts:590`);
    `gracefulShutdown` (`index.ts:721-736`) notifies Discord, flushes analytics and calls `process.exit(0)`. New
    requests are accepted and in-flight tool calls cut. Keep the `http.Server`, `close()` first, exit on drain or a
    deadline.

B3. **Raw error text goes to PostHog.** `error_message: String(err)` (`analytics.ts:252`), while the log path strips
    messages on purpose. viem/SDK errors can carry RPC URLs and caller input. Drop the field or `redact()` it.

B4. **Unkeyed IP hash as PostHog `distinctId`.** Without `POSTHOG_CLIENT_ID_SECRET`, `hashClientIp` is a
    constant-salt SHA-256 cut to 16 hex (`analytics.ts:63-66`), reversible over IPv4. Fall back to `DISTINCT_ID`
    when unkeyed.

B5. **`index.ts` is 757 lines; `createHttpApp` spans ~290** (CSP, landing page, health, `/mcp`, SSE, `/api`). Split
    into route modules; pass `otel` and gauges in instead of module state.

B6. **Config parsing is scattered.** `process.env` is read in six files, some at import time. `tools/sodaxApi.ts:68`
    re-parses `SODAX_SWAP_TOOLS_ENABLED` instead of using the threaded flag. One `loadConfig(env)` returning a typed
    object, called from `main()`.

B7. **Dependency pinning is mixed.** Exact for most, carets for `express-rate-limit`, `helmet`, `pino`,
    `posthog-node`, `zod` (`package.json`). `@types/express ^5` against `express 4.22.3`. Violates the hub's
    pin-exactly rule.

B8. **CI gaps.** `ci.yml` pins actions by tag (`@v4`, `@v3`, `@v6`) while other workflows pin by SHA; the docker job
    builds the image but never starts it.

B9. **SDK internals patched for analytics** (`analytics.ts:263-274`, `server.ts:209` recording stub with only `tool`
    and `registerTool`). A new MCP SDK registration method would bypass analytics or throw at boot. Add a test that
    fails when `McpServer` gains a `register*` method. Not checked against the SDK source.

B10. Small: JSON-RPC error body hand-built in `connection.ts:32` while `jsonRpcError` exists in `httpGuards.ts`;
     `BRAND_COLORS` (`constants.ts:138`) has no references.

## C. Builder / data tools

C1. **Upstream failure reasons are dropped.** `services/sodaxApi.ts` throws `new Error("Failed to fetch …", { cause })`
    and `failedResult` prints only `error.message` (`toolFailure.ts:37-42`). The agent cannot see why a 400 happened.
    Append the `HttpError` code from the cause chain (never raw upstream text).

C2. **A wrong shape becomes a silent empty list.** `|| []` fallbacks across `services/sodaxApi.ts`;
    `getSwapTokens` caches the empty result (`:142`) although `getSupportedChains` deliberately does not (`:75`).
    The agent reports "0 tokens" as fact. One shared `expectArray` that throws.

C3. **No output cap.** `formatResponse` returns `JSON.stringify(data, null, 2)` whole (`formatters.ts:21`); the
    markdown object branch dumps nested values whole (`formatters.ts:57-65`); tables silently drop columns past
    `TABLE_MAX_COLUMNS`. Config dumps and wide lists land in the agent's context uncapped. Add a character cap with
    a truncation line.

C4. **Boilerplate.** 35 tool registrations (`tools/sodaxApi.ts` 30, `solverRelay.ts` 5) each repeat the `format`
    param and a `try/catch failedResult`; the service repeats cache get/set and query building. A `dataTool({...})`
    helper and `cachedGet(key, path)`.

C5. **`TOOL_CONTRACT` is hand-copied and has drifted.** `apiDriftCheck.ts:214` lists `requiredParams: []` for
    `/solver/volume`, but the tool requires `inputToken` / `outputToken` (`tools/sodaxApi.ts:291-292`). Add a test
    comparing each contract entry with the registered zod schema's keys.

C6. **Dead and drifted types in `types.ts`.** `FilledIntent` and `RelayPacketData` have no users outside the file.
    Other hand-written response types may not match what the drift contract lists (not confirmed field by field).

C7. **Input validation gaps.** `z.number()` without `.int()` or bounds on block/limit/offset; unbounded strings into
    queries; `p.symbol.toLowerCase()` on unvalidated oracle rows (`solverRelay.ts:113`) turns one bad row into an
    INTERNAL for the whole tool.

C8. **`chainId` means different things across tools** (chain key or name, EVM number, relay id). Rename or share
    named schemas.

C9. **No handler-level tests for the 35 data tools** (helpers are tested, handlers are not).

## D. Swap layer and tests

D1. **Swap partner-fee maths is reimplemented** (`quote.ts:218`, fee envelope at `quote.ts:403`) while bridge uses
    the SDK's `calculateFeeAmount`; the test builds its expectation with its own encoder. Use the SDK function.

D2. **Two selectors are not pinned to an ABI.** `MESSAGE_TOPIC` and `SEND_MESSAGE_SELECTOR`
    (`swap/sourceTx.ts:16,18`) are absent from the pin test (`sourceTx.test.ts:144-151`).

D3. **Long branch-heavy functions.** `quoteSwap` (`quote.ts`, ~170 lines), `cancelSwap`, `trackDecision` and
    `errorDecision` in the 1031-line `swapDecisions.ts`.

D4. **Tests assert on prose.** `nextStep` appears 47 times in `swapTrack.test.ts` and 43 in `swapQuote.test.ts`; one
    rewording breaks dozens. Assert `nextAction` / `status` / `outcome` there; keep prose in the decisions tests.

D5. **Test setup is copy-pasted.** `vi.mock("../services/sodax.js")` appears in 9 test files with differing
    subsets; per-file manual reset lists; `trackWait` restored with copied literals. One shared mock factory and a
    `resetSwapState()` in `setupFiles`.

D6. **Very large test files** (`swapQuote.test.ts` 1450 lines, `swapTrack.test.ts` 1000).

D7. **`as never` casts into the SDK** (`sodax.ts:593-637`) hide drift on an SDK bump until run time.

## E. Agent-friendliness of `nextAction`

For an LLM agent following `nextStep`, nothing has to be guessed: every result, errors included, carries the
sentence, `nextAction`, `terminal` and `outcome`, both built by one decision (`nextAction.ts` `ongoing` / `final`);
`choose` options carry complete `args`. For an automated runtime, these still need knowledge or memory on the
caller's side:

E1. **`sameArgs: true` makes the caller remember its own arguments.** The server does not echo them (by design: it
    never writes back a value it refused). An agent that lost context cannot rebuild the call.

E2. **Retry bounds are enforced by the caller.** `maxAttempts`, `retryKey`, `consecutive` are rules for the runtime.
    Bridge track is the exception: it uses `until` from the server's clock (`stageSince`, `bridge/track.ts`) and
    stops returning `pollUntil` once past it.

E3. **The full shape is not in `tools/list`.** Tool output schemas state only `nextAction: { type: enum }`
    (`nextActionSchema.ts` `nextActionField`); the fields and rules are the resources `sodax://next-action/schema`
    and `sodax://next-action` (`server.ts` `registerNextActionContract`). A client that reads no MCP resources has
    only `nextStep`. Server instructions only point at the resource.

E4. **`execute` is prose for the wallet.** `stepsAt: "steps"`, `afterSend.needs: ["txHash"]`; how each chain family
    signs is a sentence (`SIGN_NON_EVM_TX`), not a field.

E5. **Nested continuations** (`choose` → `provide` → `call_tool`, `confirm` → `execute` → `afterSend`) must be walked
    within one result.

E6. **No `nextAction` when the MCP SDK refuses the arguments before the tool runs** (wrong type, missing field). The
    contract names this case ("No contract"); the agent has only the SDK's message. `txHash` already avoids it by
    being checked in the handler.

E7. **The reference runtime lives under test fixtures** (`src/tools/__fixtures__/nextActionRuntime.ts`); the README
    quotes its loop but it is not shipped as an example.

## Checked and found fine

Request context via AsyncLocalStorage; API key forwarded only to allow-listed base URLs; shared log redaction;
`pathParam` allow-list; all data-API routes present in the drift contract; relay error classification; docs proxy
allow-list and single-flight; other topics pinned to SDK ABIs; `bridgeAmounts` pinned against the SDK's payload;
non-EVM parsers tested against recorded transactions.
