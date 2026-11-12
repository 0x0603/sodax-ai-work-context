---
type: brief
repo: builders-sodax-mcp-server
github: 115
status: Active, in review — PR #117 on development (8d00e27, 6 commits), base development, body synced
next: R0bi7 reviews #117 (rebased 2026-11-12; one conflict, sodax.ts imports vs #121); rename sodax_swap_track after #123 merges; R0bi7 reviews #117; non-EVM sources moved to #118 (gh-118-swap-from-non-evm)
updated: 2026-11-12
related_issues: [79, 110, 116]
---

# GH-115 Swap from Sonic (the hub) · brief

## State
- Issues opened 2026-11-11 at the user's ask: #115 (Feature, sub of #79, In progress) and #116 (Task, sub of #79,
  Backlog: what an agent role-play stumbled on; list in `../gh-110-unified-logging-observability/agent-roleplay-findings.md`).
  Plan posted on #115 (`plan-posted.md`).
- PR #117 `feat/115-swap-from-hub` (MCP worktree `.claude/worktrees/115-swap-from-hub`, branched from #111's tip
  `99f83c1`), base `feat/110-unified-logging`. Commit `94feb43`. 1042 unit tests; contract tests on canary 20/20,
  including a Sonic-source quote. Body: `pr-body.md`.
- What it does: Sonic as a source (intents contract, approval to it); track proves a hub swap by the intents
  contract's `IntentCreated` (hash = first data word, topic constants checked against the SDK ABI), no relay past the
  deadline (the backend's intent canceller refunds expired hub intents); cancel built by the SDK (wallet router
  `route` running `cancelIntent`), confirmed by `IntentCancelled` (`cancel_confirmed`). Unseen tx: no in-call wait,
  10 s memo per chain+hash, `stopAfter`. `sodax_check_chain_support` says whether a swap can start on the chain.
- Backend facts checked (sodax-backend origin c69b50be): `submit-tx` takes a hub tx, relay is a no-op
  (`relay-swap-tx.ts:85,129`), the drainer marks it relayed and posts to the solver (`submit-swap-txs.task.ts:425`);
  the intent canceller refunds every expired orderbook intent with a non-zero deadline.
- sodax-sdks PR #577: `b0d714f5` makes `docs/builders-mcp.mdx` true before and after (no chain list; refund and cancel
  wording without "relay").
- Deferred to a builder-wide PR for #116: `sodax_get_swap_tokens` taking a chain name, `format: json` returning JSON
  only (34 builder tools prefix a markdown header).

- 2026-11-11 second commit `618b048` after /simplify (4 agents) and /code-review xhigh (14 findings): one source check
  (`pinnedSourceOf` in sodax.ts, used by `isSwapSource`), hub mismatch → `not_a_deposit` and no operator alerts for
  hub swaps, refusal near the deadline waits for it, hub cancel checked byte for byte (router `route` selector
  `0x65a3b0a5` + `cancelPayload`), in-call waiting restored with the 10 s seen/unseen TtlCache used only while the
  answer is to wait, no `stopAfter` for a claimed deposit, live contract test of real hub `IntentCreated` logs.
  1046 unit tests, contract 22/22 on canary. Deferred: early hub cancel before the backend row.

- 2026-11-11 later: scope grew to every non-EVM source except Bitcoin and Stacks (user). #115 retitled "Swap tools: start
  a swap from the hub and the non-EVM chains", plan v2 posted (comment 6791061784). README note on Bitcoin/Stacks
  uncommitted in the 115 worktree. Robi's #79 D2/D3 keep the Swaps API as the builder: the MCP checks its build per
  family. Track proves each deposit from chain data (Solana: relay revert mode if the payload hash differs).

- 2026-11-11 last: non-EVM split to #118 (user: follow-up after EVM merges, not a sub-issue of #79). #115 title back
  to "Swap tools: start a swap from Sonic, the hub"; the plan v2 comment now points to #118. Research moved there.
  Uncommitted in the 115 worktree: README note (Bitcoin, Stacks, ICON not sources) and the corrected submit-tx rate-limit
  comments in track.ts (per IP unless the key's org has a limit). Commit + push when the user asks.

- 2026-11-11 review round (4 agents on #117 + #118, user "review lại code sonic và non-evm"), pushed as `75bb627`:
  Sonic wording. An unsubmitted hub intent is on the hub already: track/cancel now say it's refunded once expired
  unless a solver fills it first (the backend orderbook is built from chain by data-transformator; whether a solver
  fills an unsubmitted intent is unverified), never "give support the tx hash". stopAfter nextStep: track until then,
  once more after. New tests: cancel without quote from Sonic, router cancel `from`, contract test on a real wallet
  `createIntent` on Sonic (0x01ff71f7…, hash of the calldata intent = logged hash). 1050 unit, contract 29/29.

- 2026-11-12 retest (user: "test every case, real Docker, real txs, no bugs"): 1050 unit, contract 29/29, Docker
  image on canary 27/27 scenarios, real Sonic createIntent txs proven by IntentCreated (4/4; a fifth, created by a
  third-party contract, has creator = srcAddress, not a hub wallet: track reports it, cancel won't build it). Senior
  review (agent + own). Fixed and pushed as `1112c9d` (PR body synced): cancel `not_submitted` on Sonic no longer says "never
  submitted, call track" (its intent is on chain; refunded once expired), `not_on_hub_yet` wording, quote text has no
  "starts its refund" for Sonic, `seenOnChain: seen || claimed`. Open, not done (team call): early hub cancel before a
  backend row; hub refusals never alert; `relayForRefund`/`handedOver` naming on the hub path; `pinnedSourceOf` in
  sodax.ts with a type-only import cycle; check_chain_support uses pinnedSourceOf, not the live catalog or kill switch.
  Live Sonic swap not run: the E2E wallet has no S on Sonic and 1.5 USDC on Arbitrum.

- 2026-11-12 chain coverage review (with #118): pushed `8d00e27`, chain support says the swap tools are off under
  SODAX_SWAP_TOOLS_ENABLED (was: "can start a swap"), README step 1 says to track even after expiresAt. 1099 unit,
  contract 29/29, Docker 27/27. PR body synced.

## Which file answers what
| Question | File |
|---|---|
| The issue as filed | `issue.md` (scaffold) and GitHub #115 |
| The posted plan | `plan-posted.md` |
| PR #117 body | `pr-body.md` |

- 2026-11-11: moved under the follow-up epic #119 ("Sodax MCP: agent-executable swaps (follow-up)"); #79 keeps phase 1 (#99, #103 stay there).
