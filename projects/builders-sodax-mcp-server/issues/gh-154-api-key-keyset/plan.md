---
type: plan
repo: builders-sodax-mcp-server
github: 154
tags: [api-key, api-auth, keyset, enforcement, mcp]
related_issues: [sodax-backend#1372, builders-sodax-mcp-server#147, builders-sodax-mcp-server#146]
updated: 2026-11-27
---

# GH-154 Verify API keys against the api-auth keyset · plan

Upstream `gosodax/sodax-mcp#154`. Line numbers are at `origin/development` **a36489d**. The reference
implementation is `icon-project/sodax-debug-mcp@f578673` `src/server/auth/keyset.ts`. The contract is
sodax-backend `dcb1796b`: `apps/api-auth/src/keyset/`, `packages/api-auth-client/`.

## Behaviour

- **HTTP only.** The server polls `GET {API_AUTH_URL}/v1/keyset` every 15s with a verifier token and
  keeps the result as an in-memory map from sha256 hex to entry. Each request is a map lookup; api-auth
  is never on the request path. stdio keeps today's shape check.
- **`API_KEY_ENFORCEMENT`**, `enforce` by default:
  - `enforce` refuses a failing key;
  - `monitor` records the outcome and refuses nothing;
  - `off` keeps today's shape check.
- **A key passes** when it is in the keyset, its org is not `suspended`, and it has both `swaps:read`
  and `swaps:write`. The swap tools call read routes (`/quote`, `/allowance/check`, `/approve`, `/tokens`)
  and write routes (`/intents`, `/submit-tx`, `/intents/submit`, `/intents/cancel`). Every tier grants both
  scopes.
- **Only a well-shaped key is checked.** Missing and malformed keys keep today's path:
  `API_KEY_REQUIRED`, `API_KEY_MALFORMED`.
- **In `enforce`:**

  | Outcome | `swap` profile | `all` profile |
  |---|---|---|
  | `unknown_key` | 403 `API_KEY_UNKNOWN` | builder tools only, hint says why |
  | `suspended` | 403 `ORG_SUSPENDED` | same |
  | `insufficient_scope` | 403 `API_KEY_SCOPE` | same |
  | `snapshot_unavailable` | 503 `KEY_CHECK_UNAVAILABLE` | same |

  Each refusal is JSON-RPC `-32000`. Messages name the case, never echo the key, and end with
  `GET_A_KEY`. The 503 message says to reconnect in a minute. Never 401: the MCP SDK client answers a 401 by
  starting OAuth (`streamableHttp.js:328`, `sse.js:189`, when an auth provider is set, as Claude Code does), so the
  agent would never see the message. An SSE session that has swap tools gets every message refused once its key
  fails, until it reconnects.
- **Boot:**
  - A failed first poll never stops the server, in any mode. It starts, and the interval keeps polling.
  - Until a poll succeeds, the outcome is `snapshot_unavailable`. In `enforce`, `swap` gets 503 and `all`
    gets the builder tools. In `monitor`, the toolsets stay as they are today and only the outcome is
    recorded.
  - Missing or invalid config does stop it: a mode other than `off` without `API_AUTH_URL` or
    `API_AUTH_TOKEN`, a URL that is not https, or a bad poll value.
- **A failed poll keeps the last good snapshot.** These count as a failed poll:
  - a 5xx, a timeout, or a 3xx (redirects are refused, so the token never leaves);
  - a body that fails validation;
  - a 304 with no snapshot.

  A valid empty keyset (every key revoked) is a success and replaces the snapshot. A 304 with a
  snapshot is a success: it resets the age, the failure count and the last error.
- **Revocation** takes effect once the next successful poll is applied. While api-auth is reachable,
  that is the poll interval (15s) plus request latency. While polls fail, the last snapshot keeps
  answering with no fixed bound. This is availability first, as in swaps-api, and the stale alert covers
  it. Revocation reaches open SSE sessions too (see SSE).
- **SSE:** while the mode is not `off`, every `POST /messages` with a valid key is re-checked. The check
  updates the message's outcome and org for the logs and analytics. Only `enforce` refuses, and only on
  a session that has swap tools.
- **Stale alert:** if no poll has succeeded for 300s, counted from boot or from the last success (200 or
  304), the server sends one Discord alert, and one message when it recovers.

## Keyset contract

- `GET /v1/keyset` with `Authorization: Bearer <token>`. The token is one of api-auth's
  `API_AUTH_VERIFIER_TOKENS`, at least 32 characters.
- Response: `{ version, generatedAt, keys: [{ keyHash, keyId, prefix, orgId, scopes, orgStatus, tier, limits }] }`.
  - `keyHash` is the sha256 hex of the whole key.
  - Revoked keys are absent. Suspended orgs stay in, with `orgStatus: "suspended"`.
- The server sends `ETag: "<version>"`. Send it back as `If-None-Match`; a 304 means unchanged.

## Steps

One branch `feat/154-api-key-keyset` off `origin/development`, signed commits. It is not based on the
bridge branch: #154 needs nothing from it, the bridge tools are off by default, and #150 is stacked on #138,
which is unmerged too. When another PR lands first, merge `development` in; never rebase.

### 1. Verifier: new `src/services/apiKeyVerification.ts`

Port the debug MCP's verifier.

- `createKeysetVerifier({ baseUrl, verifierToken, pollIntervalMs, requestTimeoutMs, fetch?, onError?, now? })`
  returns `{ refresh, start, stop, hasSnapshot, lookup, stats }`.
- Fetch:
  - `GET ${baseUrl}/v1/keyset` with a Bearer header, plus `if-none-match` once an ETag is held.
  - `signal: AbortSignal.timeout(requestTimeoutMs)` and `redirect: "error"`.
- Validate with zod: `{ version: string, keys: [{ keyHash, keyId, orgId, scopes: string[], orgStatus }] }`.
  Extra fields are stripped. One bad entry fails the poll.
- Build a new `Map`, then assign it in one step and update the ETag. A snapshot is never mutated, and
  an empty one is valid.
- A 304 with no snapshot is a failure. A 304 with a snapshot is a success: it resets `lastSuccessAt`,
  `consecutivePollFailures` and `lastPollError`.
- Single-flight: `inFlight ??= pollOnce().finally(...)`.
- Timer: `setInterval` plus `unref()`, with the rejection swallowed, because `onError` has already
  reported it.
- `stats()` returns `{ hasSnapshot, version, keyCount, snapshotAgeMs, consecutivePollFailures, lastPollError }`.
  `lastPollError` is a message only and never carries a header.
- `checkApiKey(lookup, key, scopes)` returns `{ outcome, orgId? }`:
  1. no snapshot → `snapshot_unavailable`
  2. not found → `unknown_key`
  3. `suspended`
  4. a scope missing → `insufficient_scope`
  5. otherwise `ok`

  `orgId` is set whenever the key matched.
- `SWAP_SCOPES = ["swaps:read", "swaps:write"] as const`. The scope list is a parameter, so the bridge
  tools (#147) add `BRIDGE_SCOPES` in one line.

### 2. Config

- `parseApiKeyEnforcement` goes next to `parseSwapToolsEnabled` (`src/services/profiles.ts:63`), in the
  same style: trim, lowercase, unset or empty means `enforce`, anything else throws.
- `parseKeyCheckConfig(env)` lives in `apiKeyVerification.ts`. Unless the mode is `off`:
  - `API_AUTH_URL` is required and must be `https:`; `http:` is allowed only on a loopback host. No
    credentials, query or fragment: fetch refuses credentials, and the poll appends its path.
  - `API_AUTH_TOKEN` is required.
  - `API_AUTH_POLL_INTERVAL_MS` (15000) and `API_AUTH_POLL_TIMEOUT_MS` (5000) must be whole numbers from 1 to
    2147483647. Above that, Node's timers fire at once.
- Errors throw into `fatalExit("Server failed to start")` (`src/index.ts:720`). The message names the fix:
  "set API_AUTH_URL and API_AUTH_TOKEN, or API_KEY_ENFORCEMENT=off".
- HTTP path only.

### 3. Decision: `src/services/profiles.ts`

- `ConnectionError` (`:48-60`): `httpStatus` becomes `400 | 403 | 503`. Everything except 400 maps
  to `-32000`.
- `SelectOptions` (`:74-77`) gains `keyCheck?: { mode, outcome }`. `selectToolsets` (`:87-117`) applies
  the Behaviour table when the mode is `enforce` and the outcome is not `ok`.
- Order: the existing refusals come first: `UNKNOWN_PROFILE`, `SWAP_PROFILE_OFF`, `API_KEY_REQUIRED`,
  `API_KEY_MALFORMED`. The keyset outcome is applied after them, and only to a `valid` key.
- `keyHintFor` (`:120-126`) names the failed check in `all`.
- `off` and `monitor` leave the toolsets as they are today.

### 4. Connection: `src/connection.ts`

- `resolveConnection` (`:37-58`): with a `valid` key and a mode other than `off`, it runs
  `checkApiKey(verifier, key, SWAP_SCOPES)`.
  1. `noteKeyCheck(res, outcome, orgId)` comes first, before `selectToolsets` can throw, so a 403/503
     record keeps its outcome and org. It uses the same pattern as `noteRefusal`
     (`httpGuards.ts:50-56`).
  2. The result goes into `selectToolsets`.
  3. `keyCheck` and `orgId` go on the returned context.
- `messageContext` (`:27-34`) keeps the session-key ownership check (`SSE_KEY_MISMATCH`). Then, when the
  mode is not `off` and the key is valid:
  - re-check it, and replace `keyCheck` / `orgId` in the returned context and in `res.locals`;
  - if the mode is `enforce`, the session has swap tools and the outcome is not `ok`, refuse with the
    same status and code as at connect.
- `src/index.ts`: the SSE session map (`:427-430`, `:488`) also stores `swap: connection.toolsets.swap`.
  #146 (drop SSE) merges after this, so the SSE part stays in scope.

### 5. Wiring: `src/index.ts`

- Exported `startKeyCheck(config, deps)`, so the boot logic is testable:
  1. Create the verifier.
  2. `refresh()`. On failure, warn and continue.
  3. `start()`.
  4. Start the stale-alert watch (`notifyError` / `postToDiscord`, `src/services/discord.ts:62`, `:124`).
- `runHTTP` (`:160-179`): call it inside the existing `Promise.all([initSodax, warmDocsCache])` (`:174`)
  when the mode is not `off`, and pass the verifier into `createHttpApp`.
- `runStdio` (`:124`): if `API_KEY_ENFORCEMENT` is set and not `off`, log one warn line that stdio
  ignores it.
- `createHttpApp(swapToolsEnabled, keyChecker?)` (`:278`): the new parameter is optional and threads into
  `resolveConnection` (`:407`, `:437`) and `messageContext` (`:510`).
- Shutdown needs no `stop()`: the poll timer is `unref()`'d.

### 6. Observability

Never use attribute names under `api_key.*`: the log gateway masks those values.

- Request log, `logMcpRequests` (`:232-275`): `caller.key_check` and `caller.org_id`, read from `res.locals`.
- `RequestContext` (`requestContext.ts:13-20`) gains `keyCheck?` and `orgId?`. `withoutCredentials`
  already drops them.
- `logToolCall` (`analytics.ts:144-178`): `caller.key_check` and `caller.org_id`. `trackToolCall`
  (`:69-85`): `key_check` on the PostHog event.
- `/health` (`:353-399`): `apiKeyVerification: { mode, hasSnapshot, snapshotAgeMs, consecutivePollFailures }`.
  It is read from memory and never fails the check.
  - `keyCount` and `version` stay out of it: `/health` is public, and the key count says how many active
    API keys SODAX has. They go to the logs instead.
- `bootConfig` (`:597-607`): `key_check.mode`. `serverGauges` (`:612-630`): `keyset.age_s` and
  `keyset.poll_failures`.
- Each failed poll logs a warn with `keyset.poll_failures`, `keyset.age_ms` and the message.
- A 200 whose version differs logs an info record `Keyset updated` with `keyset.version` and
  `keyset.key_count`, as the backend client does.

### 7. Docs and CI

- `.env.example`, after `:27-28`:
  - the five variables, with the two poll variables commented out;
  - `API_KEY_ENFORCEMENT=off` set, with a note that the default is `enforce`, so a local run needs no token.
- `.github/workflows/e2e-canary.yml` (`:56-57`): add `API_KEY_ENFORCEMENT: off`, because a canary key is
  not in prod's keyset.
- README:
  - "API Key" (`:59`): the server checks keys.
  - Env table (`:392-418`): the five rows.
  - Docker sections: a self-hosted HTTP server needs `off` or its own token.
  - "Operating the swap tools" (`:455`): the post-release check below, and the stale alert.
  - Logging (`:491-492`): the four new codes, plus `caller.key_check` and `caller.org_id`.

### 8. Tests

vitest, with an injected `fetch` and `vi.useFakeTimers`.

- Verifier:
  - a 200 loads the snapshot, and the next poll sends the ETag;
  - a 304 keeps the snapshot, and a 304 with no snapshot fails;
  - 200, then failures, then a 304 resets the age, the failure count and the last error;
  - sustained 304s past 300s raise no stale alert;
  - a 5xx, a timeout, a malformed entry or a refused 3xx keeps the snapshot and counts a failure;
  - a full replacement drops a revoked key, and an empty keyset replaces the snapshot, so the last
    revoked key becomes `unknown_key`;
  - a concurrent refresh joins the poll in flight, and a slow older response never wins;
  - the slot is freed after a failure;
  - `stats()` reports the right age.
- `checkApiKey`: every outcome, with both scopes required, and `orgId` set when the key matched.
- Config:
  - unset means `enforce`, and an invalid mode is refused;
  - a missing URL or token is refused unless the mode is `off`;
  - http is refused on a non-loopback host and accepted on loopback;
  - bad poll values are refused.
- Connection: the matrix of mode × profile × outcome, checking status, code, toolsets and hint. The
  existing tests pin `off`.
- `createHttpApp` with a fake lookup:
  - `/mcp` 403 and 503, each record carrying `caller.key_check`. `caller.org_id` appears only when
    the key matched (the 403s), and is absent for `unknown_key` and `snapshot_unavailable`;
  - SSE, key revoked between two messages: in `enforce`, the next message fails; in `monitor`, it passes
    and its record says `unknown_key`. A session opened before the first snapshot records `ok` once one
    arrives;
  - the last revoked key, emptying the keyset, fails on an open swap SSE session in `enforce`;
  - the `/health` block, without `keyCount` or `version`.
- `selectToolsets`: an existing refusal wins over a keyset outcome. For example, `swap` with the switch
  off and an unknown key gets `SWAP_PROFILE_OFF`.
- `startKeyCheck`, with a failing first poll:
  - the server starts in both modes;
  - in `enforce`, `swap` gets 503 and `all` gets builder tools;
  - in `monitor`, the toolsets stay as they are today, with outcome `snapshot_unavailable`;
  - after a successful poll, keys are checked;
  - the stale alert fires once after 300s, and the recovery message once.
- Redaction: the token and the key never appear in captured logs, on any path.

### 9. Verify

1. `pnpm checkTs && pnpm lint && pnpm build && pnpm test`.
2. Hand test against a local api-auth: the gh-1372 stack
   (`projects/sodax-backend/issues/gh-1372-*/manual-env.sh`, api-auth on :3122). Migrate it to 0006 first.
   - Revoke a key: `/mcp` and an open SSE session refuse it after the next poll (about 15s).
   - Stop api-auth: the snapshot is kept and the stale alert fires.
   - Boot with api-auth down: the server starts, `swap` gets 503, and builder works.
3. `/simplify`, `/code-review`, fix, retest, then wait for "commit push".

## Release

1. Robi mints a verifier token, appends it to api-auth's `API_AUTH_VERIFIER_TOKENS` and redeploys
   api-auth.
2. Before the release reaches `master`, set `API_AUTH_URL=https://auth.sodax.com` and `API_AUTH_TOKEN`
   on prod. Without them the new version refuses to start.
3. Deploy, then run the post-release check.

Rollback: set `API_KEY_ENFORCEMENT=off` and redeploy.

### Post-release check

```bash
# 1. Polling works: mode "enforce", hasSnapshot true, snapshotAgeMs < ~15000, consecutivePollFailures 0
curl -s https://mcp.sodax.com/health | jq .apiKeyVerification

# 2. A made-up key is refused: 403, API_KEY_UNKNOWN
curl -s -X POST 'https://mcp.sodax.com/mcp?profile=swap' \
  -H 'x-api-key: sodax_thisIsNotARealKey000000' \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# 3. A real key passes: same request with the team's prod key → 200, swap tools listed
```

Optional: mint a temporary key on the portal, connect, revoke it, and check that it gets 403 after the
next poll (about 15s).

On the first day, watch the refusals (`error.type` `API_KEY_UNKNOWN` / `ORG_SUSPENDED` / `API_KEY_SCOPE`).
If there are unusually many, roll back.

## Open

- Robi: the verifier token, which blocks the release. Also ask whether prod sets `DISCORD_WEBHOOK_URL`,
  and whether Coolify keeps the old container when a new one fails `/health`.
- Merge order: #146 (drop SSE) merges last, and removes this PR's SSE re-check along with SSE. #150
  (bridge) and this PR touch the same files; whichever merges second resolves the conflict and adds
  `BRIDGE_SCOPES`.
