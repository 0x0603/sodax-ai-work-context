---
type: plan
github: 89
repo: builders-sodax-mcp-server
status: Active
created: 2026-10-27
updated: 2026-10-27
related_issues: [79, 88, 99]
tags: [mcp, swap, docs, registry, skills, rollout]
---

# #89: docs, registry metadata and skills for the swap profile

Two PRs. Part A in builders-sodax-mcp-server (`feat/89-swap-docs` on `feat/88-e2e-canary`, `Refs #89`). Part B in
sodax-sdks under its own issue (sub-issue of #89, gosodax board #1), branched off `origin/main`.

## Facts checked (2026-10-27)

- MCP registry `server.schema.json` (2025-12-11) has no `tools` field; `ServerDetail` is `$schema, _meta,
  description (<=100 chars), icons, name, packages, remotes, repository, title, version, websiteUrl`. Extra fields are
  allowed, so the existing `tools` list is ours, and it is already stale (no `sodax_check_chain_support`, relay
  tools, ...). Header inputs (`KeyValueInput`) take `choices`.
- Glama's schema has only `maintainers`; Glama lists tools by introspecting the server. `glama.json` stays as is.
- `initSodax` only imports the SDK and builds `Sodax` (no network), so loading it on every boot is safe.
- sodax-sdks already has `docs/builders-mcp.mdx` (hardcodes "34 live-system tools", no swap tools) and an
  "MCP or `@sodax/skills`?" section. No Builders MCP skill exists in `packages/skills`.

## Part A: builders-sodax-mcp-server

1. Drop the rollout switch (plan.md: "#89 drops the switch"). Remove `SODAX_SWAP_TOOLS_ENABLED`,
   `parseSwapToolsEnabled` and every `swapToolsEnabled` parameter (profiles, connection, index, tool registry seed,
   landing card toggle, `/api` text, the "not enabled" 400), load the SDK on every boot, drop the env from
   `e2e-canary.yml`, `.env.example` and README. Tests follow. Merging this ships the swap tools to staging, and to
   production on the next release, so the PR merges only after #88's first green canary run.
2. README: a "Swap tools" table, a swap walkthrough (resolve, balance, quote, the user's wallet signs and sends each
   step, track until final, cancel), swap example prompts, the Swaps API in Data Sources, and the stale `pnpm test`
   row. Wording follows the tools' own descriptions and next steps.
3. `server.json`: description names the swap tools, `x-sodax-profile` header with `choices`, `x-api-key` text without
   "once they are enabled", every registered tool in `tools`, and a unit test that the names match the registry
   (builder + swap), so the list can't drift again.

## Part B: sodax-sdks (add-docs skill rules)

1. Issue in `gosodax/sodax-sdks`, sub-issue of builders-sodax-mcp-server#89 (type set by name from gosodax).
2. `docs/builders-mcp.mdx`: the swap profile (key, profiles, partner fee, the quote, sign, track flow at a glance)
   and no tool counts. Skill entry telling agents when to use the MCP versus the SDK, placed per
   `packages/skills/AGENTS.md`. Docs gates green.
3. Merges only once production serves the swap tools (the page would be false before).

## Not done

- No SSE entry in `server.json` remotes, no profile URLs: out of scope; `?profile=` stays documented in the README.

## Implementation (2026-10-27, uncommitted)

- Part A on local `feat/89-swap-docs` (on `feat/88-e2e-canary` @ `ee662f7`): switch gone; `selectToolsets(profile,
  apiKey)`, `resolveConnection(req, res)`, `seedToolRegistry()` with no toolsets, `PROFILE_DESCRIPTIONS` constant.
  The SDK loads at HTTP boot always and over stdio only when the profile has swap tools (a stdio builder session
  skips the ~230 MB SDK and the RPC-override check). README Swapping walkthrough covers `reset_approve`, the batch's
  `replaces`, the batch tx hash for track and `toAddress` for non-EVM destinations. The quote's next step now says
  "(or the batch for the steps it replaces)". `server.json` lists all 43 tools (12 were missing), validated with ajv
  against the 2025-12-11 schema; the test also caps the description at 100 chars. 748 tests.
- Review (fresh agent): no blockers. Before the master release: check the production `SODAX_RPC_URL_*` values (now
  parsed on every boot, fatal if bad), the Coolify memory limit (SDK ~230 MB RSS), that staging boots, and run
  `pnpm test:contract` once with `SODAX_ENV=production`. No env off-switch remains: pulling the swap tools means a
  Coolify rollback to before #89.
- Part B in worktree `sodax/sodax-sdks-89-docs`, branch `docs/builders-mcp-swap` off `origin/main` `26e45cde`:
  `docs/builders-mcp.mdx` (key, Swaps steps, profiles, partner fee, MCP vs skills; no counts), "40 tools" removed
  from `developers/faq.md` and the two Solana pages, the blog note's "one tool that touches a transaction",
  a routing row in `packages/skills/AGENTS.md` and a pointer in `skills/sodax-sdk/SKILL.md` (no new granular skill:
  the MCP isn't an SDK feature service). Gates green under Node 24. The issue needs a maintainer's `plan-approved` or
  `no-plan` label before the PR passes the Plan check.
- /simplify (4 agents): RPC overrides parsed in `main()` for every transport (README's "stops the server" holds on
  stdio builder too); HTTP loads the SDK alongside the docs warm-up (`Promise.all`); the batch clause appears only
  when the quote has a batch; the server.json test moved to `server.test.ts` against the tools a keyed default
  connection is served (no exported meta-tool list) and checks `choices` against the profiles; a drift test names
  every registered tool in README and `index.html`; duplicate switch-era tests folded. Skipped: making
  `checksumValid` SDK-free via viem (a dependency move; the stdio order is commented instead). 749 tests.
- /code-review (15 findings), fixed: `expiresAt` is the deadline to mine and track (a first track after it refunds;
  README, quote type doc, the quote's next step "..., all before it expires"); "every result carries a nextStep"
  scoped (schema rejections don't); README one-liner, `SODAX_API_KEY` row, test comment, `/api` and package.json
  descriptions mention swaps; stdio skips the docs warm-up without builder tools; the README/landing drift test now
  also fails on a stale `sodax_` row; sodax-sdks: track before expiry, EVM-not-Sonic sources, no "three groups"
  count, blog "No API key" line. Left: the SSE crash (comes with #100 via the rebase), boot risks (release
  checklist), kill switch (user's call), SDK-free checksum (dependency move), fee range on the docs page (README
  link), proxied docs tools in server.json (dynamic by design).
