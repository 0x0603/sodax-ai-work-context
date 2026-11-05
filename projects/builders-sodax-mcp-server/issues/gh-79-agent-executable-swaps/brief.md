---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active, in review — #100 and #101 merged; #104 and the whole stack synced with development 2026-11-05
next: wait for R0bi7 (#104, #90, #91 re-requested 2026-11-05; owners for RPC/gateway/alerts); then release, port guards at #91's #104 sync
updated: 2026-11-05
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Code: hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server` (the standalone clone
  `sodax/builders-sodax-mcp-server/` is legacy). After checking out a branch, run `pnpm install --frozen-lockfile`:
  the pre-commit hook runs every test, and they need the SDK.
- PRs (tips after the 2026-11-05 sync):

| PR | What | Branch @ tip | State |
|---|---|---|---|
| #90 | ADR (#80) | `feat/agent-executable-swaps` @ `1dc6dfc` | ready, R0bi7 re-requested 2026-11-05, CI green |
| #91 | #81 key forwarding, `SODAX_ENV` | `feat/81-forward-api-key` @ `31a3f68` (has #100, #101) | ready, R0bi7 re-requested 2026-11-05, CI green |
| #92–#98 | #82–#88 | `feat/82…88-*` @ `f5105bc` `cd3ea00` `520e484` `8d60529` `3b038e0` `35fd941` `2cee78b` | ready, no reviewer requested (merge in order after #91) |
| #102 | #89 docs; kill switch kept (default true), `/health.swapQuotes`, ops README, release note in its body | `feat/89-swap-docs` @ `c665c75` (server.json tests merged) | ready, no reviewer requested |
| #100 | SSE hotfix (Closes #99) | squash `98226dd` on `development` | merged 2026-10-29 |
| #101 | hazy2go: MCP Registry publish (Closes #106) | squash `80b8ad0` on `development` | merged 2026-11-05 |
| #104 | Hardening (issue #103, incl. markdown tables keeping addresses whole) + route-level test (`createHttpApp`, `src/index.test.ts`) | `fix/server-hardening` @ `102e6d8` (has #101), base `development`, CI green | ready, R0bi7 re-requested 2026-11-05 |
| sodax-sdks #577 | Docs page + skill pointer (issue #576) | `docs/builders-mcp-swap` @ `eb2affb9` (`"type": "http"` in all 20 config snippets, Claude Code `--header` line) | ready, R0bi7 requested 2026-11-05 |

- GitHub stack: #91 targets `development`, each later PR the branch below it; CI runs only on PRs into
  `development`/`master`. The user marked the whole stack ready for review on 2026-11-01; it still merges in order.
- Sync by merge only, never rebase or force-push (since 2026-10-29): a change on one PR is merged up into each
  branch above it in order. After a squash-merge, merge `origin/development` into the next branch (through an
  intermediate branch if the squash makes it conflict), push, `gh pr edit <next> --base development`.
- Local branches: keep only `development` and the branch in use; `git fetch` then `git switch <branch>` recreates
  one from origin. Before pushing, check ahead/behind; a branch both ahead and behind is a stale copy, so stop.
  Stale tips from the 10-27/28 restack are kept under `refs/backup/stale-2026-10-29/` on the machine that cleaned up.
- Live test on canary 2026-10-28 passed: two real swaps solved (`test-run-2026-10-28.md`).
- #79–#89 are assigned to the user; "@0xmatterhorn" is the user's Discord handle. R0bi7 (Discord 2026-10-23): the
  epic is a draft and the user may adjust it; the agent signs and broadcasts, the MCP gets the hash (D1).
- PR #101 (hazy2go, MCP Registry publish) @ `70e6779`: reviewed 2026-11-05, valid as-is (clean on `development`,
  release-please already bumps `server.json` `$.version`, OIDC login and pinned publisher correct). The registry
  model has no `tools` field, so the tool list never reaches it (wording in its body/test only). R0bi7 (Discord
  2026-11-05) asked the user to merge it first, then absorb it (plan A, chosen 2026-11-05).
  - Fixes go on hazy2go's branch, not on #104 (user, 2026-11-05). Pushed `f3c991f` (checkout pinned
    `11d5960a` v4.4.0, comments: the registry keeps no tool list); maintainer push + courtesy comment.
    After `/simplify` + `/code-review`, pushed `680d8b6`: publisher `1.8.1` (1.8.5 was 10 days old, hub
    supply-chain 14-day cooldown; 1.8.1 has `validate` and `github-oidc`), `curl --retry 3`, publish job
    `timeout-minutes: 10` + `persist-credentials: false`, ci.yml comment, `.gitignore` `/bin/`. CI green, the
    Linux job logs the checksum OK and `server.json is valid`. The validate step stays in `ci.yml` (user: don't
    split it). Courtesy comment 6649956827 covers both commits. Worktree `repos/client/builders-sodax-mcp-server-wt-pr101`.
  - Hub hygiene `linked-issue` is strict: opened #106 (Task, gosodax board #1), appended `Closes #106` to
    #101's body. Next: approve + squash-merge #101 (user's word).
  - #104 then has only the `release-please.yml` hunk (keep pins + `id: release` + outputs).
  - #91…#98 merge clean.
  - #102: keep its own `server.json` (superset, live `/v0/validate` ok), drop `serverJson.test.ts`, add its
    description + version checks to `src/server.test.ts` (each mutation-checked), un-export
    `DOCS_META_TOOL_NAMES` again (its only outside user is gone).
  - All tested 2026-11-05 on a scratch merge of #101 `70e6779` (#104: actionlint, 153 tests; #102: 841 tests).
  R0bi7 also floated a dev deploy (e.g. `dev-mcp.sodax.com`) to test the stack.
- Hub branch `docs/builders-mcp-swap-sdk` @ `eb1f30d`: open its PR once #94 merges.
- `improvement-ideas.md` predates the ADR revision and isn't re-mapped.

## Blocked on

1. R0bi7's review of #90, #91, #104. His 9-point merge-plan review (#79, 2026-11-02) is answered (comment
   6624748212, 2026-11-04); open asks there: owners for `SODAX_RPC_URL_1/137/295`, the gateway fake-key check,
   alerts; one replica and `DISCORD_WEBHOOK_URL` confirmed; hard drain wanted or not. The stack has #100 since 2026-11-05;
   #104's guards reach it only when #104 merges and #91 syncs again (port by hunk, the route test guards it).
2. Edge and BE limits (a key counted twice, per-IP write cap and jail on the MCP's IP, `submit-tx` 10/min per IP):
   asked R0bi7 2026-10-28; parked, don't raise again until it comes back.
3. E2E (#88): a gosodax admin adds the funded wallet and canary key as `canary-e2e` secrets and sets staging
   `SODAX_ENV=canary`.

## Next action

1. Merge order: #100, #101 (done) → #104 → release to master, then hold master → #90 any time → sync #91 with
   `development` again for #104 (port guards by hunk, `plan-review-2026-11-02.md` step 6) → #91…#98 in order →
   first green canary E2E → #102 → real canary run on `development` → release → sodax-sdks #577.
   Each PR's diff was fingerprinted before/after the 2026-11-05 sync: #91–#98 unchanged, #104 only the
   `id: release` context, #102 only the server.json test merge.
   `development`'s daily Drift Check fails since ≥2026-10-30 (live API added money-market `is*` fields and an
   `open` param on `/intent`): pre-existing, not from #101. Filed as #107 (Bug, user, 2026-11-05).
2. Before #102's release: the checklist in #102's body (RPC 1/137/295, gateway check, one replica, webhook, alert
   owner, real canary run), Coolify memory (the SDK adds ~230 MB RSS), staging boots.
3. sodax-sdks #577: the Claude Code `"type": "http"` fix is in (`eb2affb9`, 2026-11-05: the docs page and all 16
   network pages + blog; Cursor accepts the field too). "Spec and plan" passes now.
4. Not run live yet (real funds): cancel, EIP-5792 batch, native source, restart before the first track.
5. Follow-up PR: pnpm 10 + `minimumReleaseAge` instead of the hand pins (`plan-84-swap-quote.md` §Follow-up PR).

Workflow per sub-issue (user): plan → review → implement → `/simplify` → `/code-review` → fix → explicit
"commit push" → draft PR. Live probes and contract tests use `0x…dEaD` and never sign or submit.

## Settled — do not re-litigate

1. Full SDK (`@sodax/sdk` + `@sodax/types`), chosen 2026-10-23 for later features, with overrides for `axios`,
   `toml`, `ws`; `bigint-buffer` is the one with no fix (corrected 2026-10-26, `plan-84-swap-quote.md` §Review).
   Only the NEAR/Stellar recipient check uses it in #84; the Swaps API stays REST. Chain reads (balances #86,
   source-tx receipts #85) go through the SDK from this server; SDK bugs are fixed in `sodax-sdks`, not worked
   around (user, 2026-10-26). That amends ADR D6 for phase 1; done on PR #90 in `21d9017`.
2. Build the intent with `createIntent` and an explicit minimum output and deadline. Never use `includeTxData`.
3. Check the EVM source tx on chain before calling `submit-tx`: the receipt succeeded and holds the `connection`
   contract's log carrying the cached relay payload. Matching the tx input is not enough.
4. Phase 1 sources are the EVM spoke chains; Sonic (the hub) is refused since #85: no `connection` log proves a
   deposit there (ADR D5 updated 2026-10-27). No per-call `rpcUrl`; RPC defaults come from the SDK's packaged
   `spokeChainConfig` (user, 2026-10-26), overrides from env only. A client-supplied RPC was asked for and dropped
   again on 2026-10-26 for security (SSRF; it could fake the receipt #85 checks), so ADR D5 holds.
5. Swap tools require an API key (user's call, 2026-10-26; presence check only, BE decides validity). Builder
   tools stay keyless; a key, when sent, is forwarded on every BE call. ADR D2 says so (`3c9b00b`).
8. #81 keeps `solver.ts` / `relay.ts` on REST: the SDK changes the builder tools' inputs and outputs
   (`plan.md` §Constraints). `@sodax/types` and `engines` land in #83, `@sodax/sdk` in #84.
6. Partner fee is set by the builder at connection level (header, URL query or stdio env), never as a tool input.
7. One PR per sub-issue (user's call, 2026-10-26), each on its own branch off `development`, in `plan.md` order;
   #90 is the ADR. A boot-time switch keeps the swap tools off in production until #85, #87 and #88 are in. The
   sodax-sdks docs and skill go in a separate PR with its own issue.
9. #85: an on-time deposit tracked after its deadline is relayed by the MCP so the backend canceller refunds it
   (user, 2026-10-26; `plan-85-swap-track.md` §Relay-for-refund).
10. #85: quote, track and cancel need the same API key; another key gets `QUOTE_KEY_MISMATCH`, never an alert or a
   "quote not found" (user, 2026-10-26; `plan-85-swap-track.md` design 5).
11. One job per tool (user, 2026-10-26): `sodax_get_balance` reads balances only (no allowance); the quote reads no
   balance. It does read the user's hub wallet (Sonic) and NEAR/Stellar recipient readiness, and asks the backend's
   `/allowance/check` (`plan-86-get-balance.md` §Scope cut; ADR D5/D6 updated 2026-10-27).
12. Fewer agent calls (user, 2026-10-26): the quote takes names and symbols directly, resolve only on
   `UNKNOWN_TOKEN`, the address on the first quote (`plan-84-swap-quote.md` §Follow-up commit, on PR #94). A missed
   track stays an agent risk, accepted (user, 2026-10-29; no BE deposit watcher, too heavy across chains): the
   deposit doesn't refund itself (the canceller needs a hub intent); a later track with its hash, or an operator
   relay, rescues it.

14. No change to the SDK's default Ethereum RPC (user, 2026-10-28): production sets `SODAX_RPC_URL_<id>` with a paid key for every EVM source before #102's release; without it Ethereum track/balance fail.
15. `AMOUNT_TOO_LOW` suggests ≈ $1.5 of the token (user, 2026-10-29); a hint, never an MCP refusal.
16. Kill switch `SODAX_SWAP_TOOLS_ENABLED` kept, default `true` (R0bi7 point 4, user 2026-11-04). Master is held
   after the #100/#104/#101 release until #102 ships the stack in one release (point 3, user 2026-11-04).
13. The public profile stays `swap` (user, 2026-10-28), as R0bi7's epic, #82 and the AC name it; phase 2 adds its own profile(s), which is additive. Not `actions`.
## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The epic as written (goal, locked decisions, tools, safety rules, AC), what each sub-issue solves | `issue.md` | 3.5k |
| Decisions, constraints, SDK fit, per-sub-issue work, verification, prerequisites, follow-ups, risks | `plan.md` | 4.5k |
| #82 implementation plan (reviewed): profiles, swap key gate (403), rollout switch, snapshot test, 1 open question | `plan-82-tool-profiles.md` | 4k |
| #83 implementation plan (reviewed): live token list + chain config, resolver rules, action-tool template, restricted-token rule; no new dependency | `plan-83-resolve-token.md` | 4.5k |
| #84 implementation plan (reviewed): quote build path, partner fee, REST over `SwapsApiService`, errors, cache, SDK commit after the cooldown; §After implementation | `plan-84-swap-quote.md` | 4.5k |
| #85 implementation plan (reviewed): track state machine, deposit check from the `connection` Message log, RPC env, alerts, cancel flow, relay-for-refund on expired deposits, same-key rule (`QUOTE_KEY_MISMATCH`), 1 open question (backend asks, for the PR thread) | `plan-85-swap-track.md` | 9k |
| #86 implementation plan (reviewed, cut 2026-10-26): `sodax_get_balance` reads balances through the SDK (`getWalletBalance`), no allowance, quote reads no chain; error wrapping, SDK follow-ups | `plan-86-get-balance.md` | 3.5k |
| #87 implementation plan (reviewed 2026-10-26): secret screening, USD value + warning, analytics outcomes, Discord on unexpected and integrity errors, URL-free error logs, a test per ADR rule; 2 open questions (USD warning, its default), 2 deferred | `plan-87-safety-analytics.md` | 4k |
| #88 plan (reviewed 2026-10-26) and how the code differs (§Implementation, PR #98): built server in the runner over `/mcp?profile=swap`, viem EOA signer in `scripts/e2e/`, 5 USDC Arbitrum↔Base (richer side sends), `canary-e2e` environment, `curl` Discord alert with the stage, leak check on green and red runs; 4 open questions (reviewer agrees with each) | `plan-88-canary-e2e.md` | 6k |
| #89 plan (2026-10-27): drop the switch, README walkthrough, `server.json` (no `tools` field in the registry schema; profile header; drift test), Glama has only `maintainers`; sodax-sdks page + skill under their own issue, merging once production serves the swap tools | `plan-89-docs-registry.md` | 1.5k |
| Live test on canary 2026-10-28 with a blank agent (Claude Code headless, MCP from the README + a stand-in wallet): two real swaps solved (AC met), error cases, partner fee; 9 findings | `test-run-2026-10-28.md` | 2.5k |
| Hands-on test plan per sub-issue (2026-10-28): levels A–E, smoke checklist per PR tip, the live canary scenarios with their risk, order | `plan-test.md` | 3k |
| Whole-project review 2026-10-28 (4 agents at #102's tip): funds-safety tier, security / backend exposure (private channel), agent UX, structure and process; open | `review-2026-10-28-project.md` | 5k |
| Fixes from the 2026-10-28 review: what is fixed where (per-PR map for splitting commits), research for the open items with owners, decisions for the user | `plan-fixes-2026-10-28.md` | 4.5k |
| Stack review 2026-10-27, PR #91–#98: must-fix, mediums per PR, low/nits, out-of-date decisions, what was verified fine | `review-2026-10-27-stack.md` | 4k |
| R0bi7's merge-plan review 2026-11-02: each of the 9 points checked against code (restack conflicts, live changes before #102, switch, ops, cancel no-quote gap, #101) | `review-2026-11-02-r0bi7-merge-plan.md` | 1.5k |
| Plan to handle that review: decisions D-a..D-d, 10-step order with owners, route test cases, cancel fix, restack recipe, #102 changes, pre-release checklist (RPC probe 2026-11-03), reply draft | `plan-review-2026-11-02.md` | 3.5k |
| Discussion log: balance in BE, custom RPC, full SDK vs light, rate limit, API key, cancel, partner fee | `process.md` | 2k |
| Candidate changes from before the ADR revision, not re-mapped | `improvement-ideas.md` | 1.9k |

## Landmines

- Canary runs on mainnet chains, so canary swaps move real funds.
- The intent canceller was seen disabled on canary (2026-10-20), so #85's relay-for-refund may not refund there.
- `submit-tx` allows 10 per 60 s per IP for the whole MCP.
- `/swaps/intents/:txHash` takes the **hub** tx hash.
- Repo is public (hub `repos.yaml`): keep PR text free of internal detail.
- SDK / viem error text carries RPC URLs (paid ones embed keys) and request bodies: call the SDK only through the
  wrappers in `src/services/sodax.ts`, never log or return its errors.
- After pulling #84, run `pnpm install`: the pre-commit hook runs the whole test suite, which needs the SDK.
