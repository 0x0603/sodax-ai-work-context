---
type: brief
repo: builders-sodax-mcp-server
github: 79
status: Active, in review — ADR #90, #91, #100 ready; #92–#98, #102, #104 draft (GitHub stack)
next: wait for R0bi7's review, then merge in the order under Next action
updated: 2026-10-29
---

# GH-79 Agent-executable swaps (Builders MCP) · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Code: hub submodule `sodax-command-center/repos/client/builders-sodax-mcp-server` (the standalone clone
  `sodax/builders-sodax-mcp-server/` is legacy). After checking out a branch, run `pnpm install --frozen-lockfile`:
  the pre-commit hook runs every test, and they need the SDK.
- PRs (tips checked 2026-10-29):

| PR | What | Branch @ tip | State |
|---|---|---|---|
| #90 | ADR (#80) | `feat/agent-executable-swaps` @ `1dc6dfc` | ready, R0bi7 requested |
| #91 | #81 key forwarding, `SODAX_ENV` | `feat/81-forward-api-key` @ `bab68bf` | ready, R0bi7 requested |
| #92–#98 | #82–#88 | `feat/82…88-*` @ `5a78943` `cf4f806` `084f8b9` `98c1335` `947f0fe` `11a2e67` `ce952d2` | draft |
| #102 | #89 docs; drops the rollout switch | `feat/89-swap-docs` @ `02ede6c` | draft |
| #100 | SSE hotfix (Closes #99) | `fix/sse-start-once` @ `66c80da` | ready, R0bi7 requested |
| #104 | Hardening (issue #103, incl. markdown tables keeping addresses whole), on #100 | `fix/server-hardening` @ `d93146b` | draft, R0bi7 requested |
| sodax-sdks #577 | Docs page + skill pointer (issue #576) | `docs/builders-mcp-swap` | draft |

- GitHub stack: #91 targets `development`, each later PR the branch below it; CI runs only on PRs into
  `development`/`master`. Keep the upper PRs draft.
- Sync by merge only, never rebase or force-push (since 2026-10-29): a change on one PR is merged up into each
  branch above it in order. After a squash-merge, merge `origin/development` into the next branch (through an
  intermediate branch if the squash makes it conflict), push, `gh pr edit <next> --base development`.
- Local branches: keep only `development` and the branch in use; `git fetch` then `git switch <branch>` recreates
  one from origin. Before pushing, check ahead/behind; a branch both ahead and behind is a stale copy, so stop.
  Stale tips from the 10-27/28 restack are kept under `refs/backup/stale-2026-10-29/` on the machine that cleaned up.
- Live test on canary 2026-10-28 passed: two real swaps solved (`test-run-2026-10-28.md`).
- #79–#89 are assigned to the user; "@0xmatterhorn" is the user's Discord handle. R0bi7 (Discord 2026-10-23): the
  epic is a draft and the user may adjust it; the agent signs and broadcasts, the MCP gets the hash (D1).
- PR #101 (hazy2go, MCP Registry publish) clashes with #102's `server.json` test. Parked: whichever merges second
  merges the two tests.
- Hub branch `docs/builders-mcp-swap-sdk` @ `eb1f30d`: open its PR once #94 merges.
- `improvement-ideas.md` predates the ADR revision and isn't re-mapped.

## Blocked on

1. R0bi7's review of #90, #91, #100, #104.
2. Edge and BE limits (a key counted twice, per-IP write cap and jail on the MCP's IP, `submit-tx` 10/min per IP):
   asked R0bi7 2026-10-28; parked, don't raise again until it comes back.
3. E2E (#88): a gosodax admin adds the funded wallet and canary key as `canary-e2e` secrets and sets staging
   `SODAX_ENV=canary`.

## Next action

1. Merge order: #100 → #104 (retarget to `development`) → release to master → #90 any time → #91…#98 in order
   (expect `index.ts` conflicts with #104) → first green canary E2E → #102 → release → sodax-sdks #577.
2. Before #102's release: `SODAX_RPC_URL_<id>` with a paid key for every EVM source, Coolify memory (the SDK adds
   ~230 MB RSS), staging boots.
3. sodax-sdks #576 is docs-only, so `no-plan` fits (`.github/issue-workflow.md` §no-plan); a maintainer applies it.
   Then add the wallet text and a Claude Code `"type": "http"` hint to the page.
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
