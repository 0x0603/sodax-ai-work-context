---
type: review
repo: builders-sodax-mcp-server
github: 79
status: Open — changes requested
created: 2026-11-07
updated: 2026-11-07
tags: [review, r0bi7, feedback]
related_issues: [90, 91, 93, 95, 96, 97, 104, sodax-sdks-577]
---

# R0bi7's feedback, verbatim

## 2026-11-07 (Discord, pasted by the user)

> Rechecked the MCP stack. The kill switch, cancellation binding and route tests are addressed. These fixes remain:
>
> #104: failed docs refresh still reports success; fix batch 429 headers and document the response-shape change.
> #93: exclude native-address sentinels from cross-chain hints when metadata is missing.
> #95: fix the contract-test import, bound retry advice and reserve alert capacity for stranded deposits.
> #96: preserve NEAR token balances when the native account is missing. This is the main blocker.
> #97: isolate oracle reads from caller keys, warn on unpriced outputs, and fix redaction and false secret rejections.
>
> Also update #90's description and the merge plan. Then propagate the HTTP guards through the stack and rerun CI on the integrated heads.
>
> Before release, confirm owners, RPC overrides for 1/137/295, gateway checks, single-replica/drain/webhook setup, and a real non-dry-run canary through arrival. SDK #577 waits for release and conflict resolution.

Not mentioned, so presumably fine on his side: #91, #92, #94, #98, #102.
No GitHub review or comment from him after 2026-11-05 on any of these PRs; this came by Discord.

## 2026-11-01 GitHub reviews (still relevant)

### #104 (review, COMMENTED)

> Looked at this closely, the guards, path-param validation and SSE leasing are solid and well tested. Three things I'd fix or decide before merging:
>
> 1. **`/mcp` 429 body changes shape (`httpGuards.ts:36`).** `error` used to be a string and is now a JSON-RPC object on `/mcp` only (`/sse` and `/messages` keep the string). I ran the real response code: a consumer doing `body.error.includes(...)` throws `TypeError`. The new shape matches the MCP SDK's own 4xx bodies, so spec-following clients are fine. I lean towards keeping it, but please call it out as a compat change in the changelog/release notes (or keep `error` as a string on `/mcp`).
> 2. **`docs_refresh` reports success when the refresh failed (`tools/docsProxy.ts:245`).** With a warm cache and a failing upstream it prints "✅ Refreshed. N SDK documentation tools available" while `/health` says `healthy:false`. `refreshDocsTools` returns `fetched: true` whenever a fetch was started, and `fetchAndApply` swallows the error and returns the stale tools. Before this PR the cache was cleared first, so this showed the "Could not connect" warning. Impact is a misleading message only. Please return fetch success separately, say the tools are cached, and assert it in the failed-refresh test (which only checks cache retention now).
> 3. **Global SSE cap of 200 can be filled by one actor (`httpGuards.ts:116`).** Limits are per IPv4 or per IPv6 /56, so ~20 addresses (or 20 /56s inside one /48) holding 10 streams each fill all 200 slots. Idle timeout is 1h and `/messages` refreshes it, so SSE-only clients are locked out. Not a blocker, but consider keying IPv6 by /48, a much shorter idle reap near the cap, or evicting the oldest idle session at the cap.
>
> Not covered on my side: vitest wasn't run, I haven't checked that express-rate-limit v8 exposes `req.rateLimit.key` and `MemoryStore.increment`, or that the pinned action SHAs match their tag comments. `index.ts` route wiring (SSE lease/close order, `GET /mcp` before `app.all`) has no test, so it relies on your manual curl run.

Inline: `httpGuards.ts:36` (429 shape, note as compat change), `httpGuards.ts:116` (global SSE cap, /48 keying or eviction).

### #91 (review, COMMENTED)

> No blocking findings. I went through the key forwarding closely:
> - The key goes only to `/v1/be/` and `/v1/intent/`. `forwardedApiKey` (`http.ts:29-34`) checks `new URL(url).href`, so `..`, `%2e%2e`, backslashes and tab/newline splits are resolved before the allow-list check, the same way `fetch` parses them. Keyed requests use `redirect: 'error'`. The relay never gets the key.
> - Concurrent HTTP/SSE callers are isolated via `AsyncLocalStorage` (`requestContext.ts:18-25`). The stdio fallback is set only in `runStdio` (`index.ts:164`), so HTTP never falls back to it. Two concurrent calls with different keys keep their own keys.
> - The key doesn't leak via analytics, the docs proxy or error strings.
> - `SODAX_ENV` unset means production, an invalid value fails at startup, and `check:drift` stops on it too. No semver/response-shape break.
>
> One suggestion: `txHash`, `userAddress`, `poolId` etc. are plain `z.string()` and go into the path unencoded (`sodaxApi.ts:249,278,632`). A value like `..%2F..%2F..%2Frelay%2F` keeps the href under `/v1/be/`, so the key is attached. If the gateway decodes `%2F` before routing, the key could reach the relay route. I couldn't verify gateway behaviour, so I'm not calling it a bug, but `encodeURIComponent` on path params closes it either way. (#104 adds path-param validation and encoding in `sodaxApi.ts`; worth checking the stack together.)
>
> Not covered: vitest wasn't run. `index.ts` wiring (`callerApiKey` on the real express `/mcp` and `/messages` routes, the node transport wrapper, stdio fallback) has no test, and async-context propagation through MCP SDK 1.26 / `@hono/node-server` was reasoned from the synchronous call site only. Live behaviour wasn't checked: the `api.sodax.com/v1/relay/` route, whether canary accepts production keys, and whether a keyed endpoint returns a 3xx (which `redirect: 'error'` would now break for keyed callers). Responses are cached module-wide regardless of key, which is fine for public data; please confirm no endpoint returns key-dependent data.

### #90 (review, COMMENTED)

> Docs-only, no code changes, and I found nothing blocking. The ADR is internally consistent (D2 and D4 agree on profiles and API keys: no key means only the builder tools, default `all` is unchanged today), the README link resolves, and it's marked Proposed so it doesn't claim swap tools exist yet.
>
> One thing to fix: the PR description is out of date. It still says the server uses `@sodax/swaps-api` + `@sodax/types` + `viem` and lists the gateway move as an open question, but the ADR now decides the other way (D3 picks the full `@sodax/sdk`, D2 puts it behind the HAProxy edge). Please update the description so reviewers don't read the wrong decision. I haven't verified the external claims (Swaps API contracts, SDK capabilities, the 82 MB/0 advisories vs 777 MB/35 figures, `builders.sodax.com` gateway status) or sanity-checked the partner fee bps and slippage bounds.

### sodax-sdks #577 (review, COMMENTED)

> Docs-only and I found nothing wrong in the diff. The `/builders-mcp#swaps` anchor exists (new `## Swaps` heading), the "40 tools" count is gone from every page that repeated it (`faq.md`, `solana/faq.mdx`, `solana/index.mdx`, `builders-mcp.mdx`), the API-key guidance keeps keys required only for the swap tools and public solver quotes keyless, the api-keys link resolves, and the skills routing only sends no-code requests to the MCP and points implementation work back to skills.
>
> Two things before merge:
> 1. Hold the merge until the swap tools (#102, issue #89) are released. The page describes swap tools production doesn't serve yet, and nothing enforces the ordering.
> 2. I didn't verify the swap tool names, headers (`x-api-key`, `x-sodax-profile`, `x-sodax-partner-*`), `partnerFeeBps`, profile behaviour or expiry handling against that server, and I didn't rerun `pnpm check:*` / `mint validate` / `mint broken-links`. The PR body says everything was checked against #89's code, so a quick second look from whoever owns that server would be good. #576 also still needs `plan-approved` or `no-plan`.

## Earlier rounds

- 2026-11-02 merge-plan review (9 points) on #79: `../review-2026-11-02-r0bi7-merge-plan.md`, answered in comment
  6624748212 (2026-11-04). Its open asks (owners, RPC 1/137/295, gateway fake-key check, drain) are repeated in the
  2026-11-07 message above.
