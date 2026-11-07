---
type: review
repo: builders-sodax-mcp-server
github: 104
status: Open — findings only
created: 2026-11-07
updated: 2026-11-07
tags: [review, hardening, rate-limit, docs-proxy, sse, guard-port]
related_issues: [79, 91, 92, 104]
---

# #104 pre-review and the guard port plan (2026-11-07)

Reviewed at `fix/server-hardening` @ `102e6d8`. All three of R0bi7's 11-01 points are still open. Typecheck, lint
and all 153 tests pass at the tip. The local `builders-sodax-mcp-server-hardening` worktree is at `bc03e46`, behind
origin's `102e6d8`: pull before working there.

## R0bi7's points

### 1. `/mcp` 429 body shape: not addressed

- `httpGuards.ts:35-37` unchanged. No compat note in the PR body; the README endpoint table (README.md:259-269)
  says nothing about error bodies.
- Second gap: the global limiter (`index.ts:211-217`) still answers `/mcp` with the old string shape. Proven:
  100 `GET /health` calls, then `POST /mcp`, gets 429 `{"error":"Too many requests, please try again later."}`.
  So `/mcp` can return either shape. Fix: give the global limiter a message function,
  `(req) => isMcpPath(req) ? jsonRpcError(...) : {error}`.
- Documenting it: the repo squash-merges with commit messages as the body, and release-please reads only commit
  subjects, so the PR body alone never reaches the CHANGELOG. Use release-please's `BEGIN_COMMIT_OVERRIDE` block in
  the PR body (not yet checked that this repo's release-please honors it), or add a `docs:` commit for the README.
  The README should list the `/mcp` error bodies for 400, 405, 413, 429 and 500 next to the `{error}` bodies on the
  other routes.

### 2. `docs_refresh` reports success on failure: still broken

- `refreshDocsTools` (`services/docsProxy.ts:211-216`) returns `fetched: true`; `fetchAndApply` swallows the error
  and returns the stale cache (lines 254-259).
- Ran the failed-refresh test with logging: the tool says `✅ Refreshed. 2 SDK documentation tools available`. The
  test (`tools/docsProxy.test.ts`, last case) never checks the text.
- Fix: return `ok: lastFailedFetchAt === 0` after awaiting the fetch, on both the in-flight and the new-fetch
  branch (that value is set before the promise resolves, so it is reliable). In the tool (around line 235): when
  `fetched && !ok && tools.length > 0`, say `⚠️ Refresh failed; serving N cached SDK documentation tools`.
- Test: in "keeps serving the cached tools when a refresh fails", assert the text matches `/^⚠️ Refresh failed/`
  and does not contain `Refreshed.`.

### Batch 429 headers (11-07 message)

In `httpGuards.ts:72-79` the express-rate-limit middleware sets its headers after its single count; `countBatch`
then adds N-1 hits straight on the store:

- `RateLimit-Remaining` and `RateLimit-Reset` reflect only the first message. Limit 5, a 3-message batch returns
  remaining 4 instead of 2.
- When `countBatch` itself sends the 429, the response says remaining 1 and has no `Retry-After` (the library sets
  it only in its own over-limit branch).
- A single-message 429 correctly carries `Retry-After: 60`. The counting itself is right; the oversized-batch 400
  counts once and its headers are accurate.

Fix, prototyped (tsc, lint, 20/20 pass; the new asserts fail on the old code with "expected '4' to be '2'"):

```ts
let { key, used, resetTime } = (req as Request & { rateLimit: RateLimitInfo }).rateLimit;
for (let i = 1; i < req.body.length; i++) ({ totalHits: used, resetTime } = await store.increment(key));
const resetSeconds = resetTime ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : 60;
res.set({ "RateLimit-Remaining": String(Math.max(limit - used, 0)), "RateLimit-Reset": String(resetSeconds) });
if (used > limit) {
  res.set("Retry-After", String(resetSeconds)).status(429).json(limitBody(req));
  return;
}
```

Test: in "counts each message of a batch", assert the first batch has `ratelimit-remaining` "2"; the second must be
429 with remaining "0" and a numeric `retry-after` equal to `ratelimit-reset`.

### 3. SSE global cap: not fixed

Same limits (200 total, 10 per client, 1 h idle; `httpGuards.ts:16-18`), still keyed by /56 (line 114), no eviction
(line 116). One IPv6 /48 alone holds the 20 /56s needed to fill it. Not a blocker for him, but answer it (fix, or
say why not).

## New findings

- should-fix: the route tests don't guard the idle reaper. Removing `session.lease.touch()` (`index.ts:371`) or
  replacing `() => res.end()` (line 335) with a no-op leaves `index.test.ts` and `httpGuards.test.ts` green.
  Removing `{ limit: "100kb" }` also passes, because express.json's default is already 100kb. That contradicts the
  PR body's "Removing any of them fails a test". Fix: let `createHttpApp` take the SSE idle time as an option and
  add a route test; for the body limit, set a non-default value or test the exact boundary.
- nit, PR body stale or misleading: "Based on #100 … targets fix/sse-start-once" (base is now `development`, #100
  merged); "126 tests" (now 153); "HTTP errors come back as JSON" (unknown routes still get Express's HTML 404,
  verified).

## Checked and fine

- Trust proxy: a spoofed `X-Forwarded-For` doesn't change the rate-limit key on builders.sodax.com. It only would on
  a self-host published without a proxy, which was already true before this PR.
- Path-parameter regex is linear and rejects `.` and `..`. All 22 live chain keys pass. Sui (`::`) and Injective
  (`/`) token addresses would fail, but no path-parameter tool takes a token address.
- The SDK's SSE transport refuses batches, so counting `/messages` once is correct.
- JSON parse errors and oversized bodies (413) are handled correctly.

## Guard port plan (#104 → #91 … #102)

Correction to the old assumption: on every stack tip the Express routes are still in `index.ts` `runHTTP`. #92
moved only the server build (`server.ts`) and connection checks (`connection.ts`). All guards go into
`createHttpApp` in `index.ts`. Every tip lacks all of #104. Port once into #91, then merge up one PR at a time.

Conflicts (`git merge-tree` of #104 into each tip):

- #91: `src/index.ts` (the `/mcp` and `/messages` blocks). Take #104's side and wrap both handlers in
  `runWithRequestContext({apiKey: callerApiKey(req)}, …)`.
- #92: `src/index.ts`, as below.
- #93-#96: `src/index.ts`, `src/services/sodaxApi.ts` (3 blocks). Keep `pathParam` and use `cache.get`.
- #97, #98, #102: the above plus `src/services/analytics.test.ts` (both sides added it). Keep both test blocks.

From #92 up:

- `createHttpApp(swapToolsEnabled)`, and `listen(app, swapToolsEnabled)` on the tip.
- `/mcp`: `asyncHandler(resolveConnection → createServer(toolsets, clientId) → runWithRequestContext(connection.context, …))`.
- `/sse`: call `resolveConnection` before `sseLimiter.open()`; the session holds `{transport, server, context, lease}`.
- `/messages`: run `messageContext` first, then `lease.touch()`.
- `index.test.ts`: call `createHttpApp(true)`.
- Keep #104's `createHttpApp()` + `isEntryPoint()` structure: #92 runs `main()` on import (`index.ts:396`).
- Keep `app.get("/mcp", mcpGetNotAllowed)` before `app.all("/mcp")` (#92 resolves the profile first, so
  `GET /mcp?profile=bogus` would get 400 instead of 405).

Risks:

- Type errors only tsc sees: on the tip, the auto-merged `/api` handler and the `listen()` log use
  `swapToolsEnabled`, which `createHttpApp()` doesn't have. vitest passes (the route test never hits `/api`). CI's
  `checkTs` catches it, so don't trust a local `pnpm test` alone.
- Leaked SSE slots: if `resolveConnection` lands between `open()` and `res.on("close", release)`, a refused `/sse`
  (400/403) never frees its slot. Ten keyless `GET /sse?profile=swap` lock that IP out; 20 IPs lock out all SSE
  until restart. Add a route test: 11 refused `/sse` calls, then a valid one from the same IP gets 200.
- Order and keying: keep `mcpLimiter` ahead of the 403 so refused calls (and refused batches, N each) cost budget;
  no test checks this today. Keep limits per IP: `parseApiKey` only checks the format, so per-key buckets would be
  free to mint. Agent hosts with many keys behind one IP share 60/min and 10 SSE sessions; worth a README line.
- Error handling: without `asyncHandler`, any throw in the stack's handlers crashes the process (unhandled
  rejection, then `fatalExit`). The route test's throwing-handler cases catch this.
- Mixed error shapes: in the stack, `/sse` and `/messages` answer 403/400 as JSON-RPC but the SSE-cap 429 as
  `{error}`. Document both together with point 1. `GET /mcp?profile=swap` changes from 403 to 405, which is intended.
- Reuse `jsonRpcError` (`httpGuards.ts:31`) instead of the inline body in `connection.ts:36-38` and #94's
  `messageContext`.
