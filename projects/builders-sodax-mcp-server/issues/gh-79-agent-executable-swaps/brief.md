---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active, fixing — R0bi7 (2026-11-07) listed fixes on #104, #93, #95, #96, #97; plan re-scoped 2026-11-09
next: stack synced with #104 and pushed (CI green on #91…#102, 2026-11-09); user sends R0bi7 the dev-deploy + release-plan drafts; then #76 release, dev deploy of `feat/89-swap-docs`, #91 → #98 in order
updated: 2026-11-09
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
| #90 | ADR (#80) | `feat/agent-executable-swaps` @ `197e515` (2026-11-09) | ready, R0bi7 re-requested 2026-11-05 |
| #91 | #81 key forwarding, `SODAX_ENV` | `feat/81-forward-api-key` @ `d35c990` (has #100, #101, #104) | ready, R0bi7 re-requested 2026-11-05, CI green |
| #92–#98 | #82–#88 | `feat/82…88-*` @ `3cd2b8d` `538c381` `447a39c` `14ba697` `24be1fb` `b1fe28e` `032b642` (2026-11-09 sync) | ready, CI green on each, no reviewer requested (merge in order after #91) |
| #102 | #89 docs; kill switch kept (default true), `/health.swapQuotes`, ops README, release note in its body | `feat/89-swap-docs` @ `7b3c88e` (2026-11-09 sync) | ready, CI green, no reviewer requested |
| #100 | SSE hotfix (Closes #99) | squash `98226dd` on `development` | merged 2026-10-29 |
| #101 | hazy2go: MCP Registry publish (Closes #106) | squash `80b8ad0` on `development` | merged 2026-11-05 |
| #104 | Hardening (issue #103, incl. markdown tables keeping addresses whole) + route-level test (`createHttpApp`, `src/index.test.ts`), MERGED 2026-11-09 as `d734aed` (R0bi7 approved; release PR #76 needs a review) | `fix/server-hardening` @ `645b3b9` (has #101), base `development`, CI green | ready, R0bi7 re-requested 2026-11-05 |
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

- Fixes for R0bi7's 11-07 list, pushed 2026-11-09 (no merge-up yet), one worktree per branch under
  `sodax-command-center/repos/client/builders-sodax-mcp-server-wt-r{104,93,95,96,97}`; each new test fails on the
  old code. Gates green: #104 154 tests (4 commits, `ci.yml` now runs on every PR base), #93 279, #95 619 (3
  commits, contract tests in `checkTs`), #96 652, #97 806 (3 commits). CI runs on #104 only until the sweep brings
  the `ci.yml` change up. `/simplify` and `/code-review` done, findings fixed. Decisions taken in the fixes:
  - #95: after the claim, a refusal of the swap (amount, 400/422) alerts and refunds at the deadline; a key or WAF
    401/403 is retried as `UPSTREAM_UNAVAILABLE` (never "get a new key"), refunded at the deadline if it never
    passes. Alerts over the hourly cap are held (12 per budget) and listed with tx hash and deadline in the
    end-of-hour post; `alerted` on every state is posted-or-held; one that reached only the log says so and is
    retried after the hour. Retry advice: 10 retries then stop; polls: 30 (~10 min) then "still in progress".
  - #97: a 64-hex token query that is a valid account (NEAR, Sui) is still refused, worded "a token SODAX doesn't
    swap, or a private key"; a Solana-signature shape is refused with the same hedge. Redaction (`redact`,
    `redactErr`) covers URLs (not `file:` frames), request bodies, viem call details, SODAX keys (also cut-off
    ones) and bearer tokens.
  Skipped: restructuring `countBatch`, logger-wide redaction via pino hooks, flushing held alerts on shutdown,
  typechecking all tests (21 errors in unit tests: say so in the #95 thread).
  Sweep notes: at #94 use `ZERO_ADDRESS_PATTERN` (with `i`) for #93's sentinel; at #97 format held alert lines with
  `truncate(redact(…))` and cover `swap_error`'s fields; at #102 give `swap_error` its own alert budget.
- Posted 2026-11-09 (user: no reply to R0bi7, no separate pre-release ask):
  - PR bodies #104, #93, #95, #96, #97: test counts, false claims fixed, an "Update 2026-11-09" section. #104's
    body carries `BEGIN_COMMIT_OVERRIDE` (release-please-action v4.4.1) so the `/mcp` 429 shape change reaches the
    CHANGELOG, and says the SSE cap stays because #108 drops SSE.
  - #79 merge-plan comment 6464424485 edited: #101 merged, hold master, port + merge-up, no rebase, the pre-release
    list (owners, RPC 1/137/295, gateway check incl. builder tools, one replica without overlap, webhook) and the
    `/health` check before later releases.
  - #90: ADR fixed and pushed (`197e515`, `docs:`), body posted:
    the 12 items in `review-2026-11-07/pr90-91-92.md` plus the 11-09 fixes (oracle keyless, post-claim errors,
    secret hedges, redaction). Its body = that file's draft, D4/D5 tightened, plus an "Update 2026-11-09" line.
- 2026-11-09, `/simplify` + `/code-review` on the ADR diff (15 findings, verified in code), pushed in `197e515` (#90)
  and `bbc22fb` (#95; its body now says 621 tests and names the three fixes):
  - ADR: decision level, no stale details; fixed claims (drift check covers only the data API, contract tests are
    `continue-on-error`, `toml` has a fix but no override, the switch also removes track/cancel, alert budgets,
    lost entry needs chain + quoteId, aged-out quotes too). Skipped: the switch's boot failure on a bad value
    (README says so).
  - #95 code (621 tests, each fix mutation-checked): a 401/403 on the opening status read after the claim is
    retried, not "new key"; a claimed deposit whose receipt goes missing waits instead of `source_not_found`;
    the refund-relay retry (track and cancel) is bounded at 10 calls.
  - The hub-RPC gap (`SODAX_RPC_URL_146` never reached the SDK's hub provider) lives on #95, not #94
    (`parseRpcOverrides` starts there): fixed in round 2.
- 2026-11-09 round 2 ("fix what the plan still allows"), then `/simplify` + `/code-review` (10 findings: 8 fixed; the
  shared data-API cache not keyed by API key is #91's design, left), pushed; each new test fails on the old code:
  - #94 (`-wt-r94`, 455 tests): Stellar recipient: Horizon 404 = not ready, a token missing from `trustlineConfigs`
    = `RESTRICTED_TOKEN` at quote time (`stellarRecipientCheckable`, SDK `requiresTrustline`); XLM needs an existing
    account (read via `getWalletBalance`); all-uppercase partner address
    refused; `encodeRecipient` refuses Stellar `C…`/`M…` and Bitcoin testnet (quote `toAddress` and, after the sweep,
    balance); the native-approve test asserts no `/allowance/check`.
  - #95 (`-wt-r95`, 624): `initSodax` passes `hub: { rpcUrl }` from the Sonic override (README notes 146); submit
    throttle (`submitRetryAt`: no POST before the wait the agent was told, capped at 15 s); `quoteId` lowercased; dropped the
    vacuous `dEaD` alert assertion.
  - #98 (`-wt-r98`, 836): canary refuses a minimum under 97% of the amount, `AMOUNT` ≤ 20, `if: always()` leak check
    (API key, wallet key without `0x`, RPC URL host/path) before either log is printed (script output goes to a file),
    Discord stage `a secret in the logs`; contract tests red on scheduled and push runs.
  - #102 (main checkout, 841): README RPC 1/137/295 + 146, merge-deploys wording, 30-min refund window, 90% floor
    warns when unpriced; `.env.example` 295; batch next step waits for a step it doesn't replace.
  - Sync done the same day (merge only): #91 merged `development` (guards; route test that each call's own key goes
    upstream), #92 resolves the connection before the SSE slot (refused-`/sse` slot test), #93 keeps `pathParam` with
    `cache.get`, #94 uses `ZERO_ADDRESS_PATTERN` (now `/i`) for #93's sentinel, #96 refuses a failed read of an
    unlisted Stellar token without a retry and shares `isHorizonNotFound`, #97 gives `swap_error` its own budget (5/h)
    and redacts held lines (post cut to 4096), `quoteIdArg()` lowercases, #102 README: CI on every PR, alert caps.
    Tests: #91 182, #92 243, #93 342, #94 522, #95 695, #96 735, #97 892, #98 935, #102 941. PR bodies and the #79
    merge-plan comment updated.
  - Drafts for R0bi7 (dev deploy of `feat/89-swap-docs` + env, release plan): `drafts-r0bi7-2026-11-09.md`; the
    user sends them, then deletes the file.

## Blocked on

1. Our fixes. R0bi7 rechecked the stack 2026-11-07 (Discord): kill switch, cancel binding and route test are
   addressed; fixes remain on #104, #93, #95, #96 (main blocker), #97, plus #90's body, the merge plan, the guard
   port and a CI rerun. Our pre-review the same day confirmed all of it and added 2 blockers (#96 NEAR, #95
   post-deposit errors) and more should-fix items: `review-2026-11-07-pre-r0bi7.md` (checklist). His older open
   asks (owners for `SODAX_RPC_URL_1/137/295`, gateway fake-key check, alerts, drain) are on that checklist's
   pre-release list. #104's guards reach the stack only when #104 merges and #91 syncs again.
2. Edge and BE limits (a key counted twice, per-IP write cap and jail on the MCP's IP, `submit-tx` 10/min per IP):
   asked R0bi7 2026-10-28; parked. Update 2026-11-09: sodax-backend #1380 (on `main`) lets a valid key whose org
   has a limit skip `submit-tx`'s per-IP throttle when `ApiKeyGuard` isn't `off`; the edge parts stay open
   (`plan-2026-11-09-scope-and-gaps.md`).
3. E2E (#88): a gosodax admin adds the funded wallet and canary key as `canary-e2e` secrets and sets staging
   `SODAX_ENV=canary`.

## Next action

0. Follow `plan-2026-11-09-scope-and-gaps.md` (tiers + order): "Must" items from the 11-07 checklist, each PR
   fixed on its own branch (#104 first, with the `ci.yml` trigger), one sweep #91 → #102 after #104 merges. Then
   post the #90 body + merge-plan edits (drafts in `review-2026-11-07/pr90-91-92.md`) and reply to R0bi7. Ask
   for the pre-release items now.
1. Merge order: #100, #101 (done) → #104 → release to master, then hold master → #90 any time → sync #91 with
   `development` again for #104 (port guards by hunk, `plan-review-2026-11-02.md` step 6) → #91…#98 in order →
   first green canary E2E → #102 → real canary run on `development` → release → sodax-sdks #577.
   Each PR's diff was fingerprinted before/after the 2026-11-05 sync: #91–#98 unchanged, #104 only the
   `id: release` context, #102 only the server.json test merge.
   `development`'s daily Drift Check fails since ≥2026-10-30 (live API added money-market `is*` fields and an
   `open` param on `/intent`): pre-existing, not from #101. Filed as #107 (Bug, user, 2026-11-05).
   Dropping the legacy SSE transport (`/sse` + `/messages`, the SSE guards in #104, the SSE key test in #91, the
   sdks docs lines) is #108 (Task, user, 2026-11-05), to do after #91 and #104 merge. Gemini CLI, the reason SSE
   was added, speaks streamable HTTP via `httpUrl`.
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
| **Start here.** Which of the 11-07 items to do (Must / Should / Deferred), the order (one sweep after #104), the CI trigger gap, and what is left to finish the MCP outside the code list (ops, BE #1380 throttle, fake keys, non-EVM RPCs, wallet MCP test) | `plan-2026-11-09-scope-and-gaps.md` | 2k |
| R0bi7's 2026-11-07 fix list + our pre-review of every PR: 2 blockers, the work checklist in merge order, and a map to the per-PR detail files in `review-2026-11-07/` (his verbatim words, fixes with code, tests, guard-port plan, #90/merge-plan drafts, pre-release gaps, #577) | `review-2026-11-07-pre-r0bi7.md` | 2.3k |
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
