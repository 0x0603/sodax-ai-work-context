---
type: plan
repo: builders-sodax-mcp-server
github:
updated: 2026-11-26
---

# Plan

## Goal

Turn `review.md` into small PRs, cheapest and safest first. Proposal only: no order was agreed with the user.

## Suggested order

1. **Guard rails** (one small PR): typecheck tests (A1), pin deps exactly and fix `@types/express` (B7), SHA-pin CI
   actions (B8), pin the two selectors (D2), contract-vs-schema test (C5).
2. **Agent docs** (one PR, plus a hub card PR): `CLAUDE.md`, `docs/kb/invariants.md` seeded from header comments,
   add-a-tool / toolset / family checklists (A2).
3. **Operational safety**: `/health` off the upstream call (B1), close the listener on shutdown (B2), stop sending
   raw error text and unkeyed IP hashes to PostHog (B3, B4).
4. **Agent-facing data tools**: failure reasons (C1), no silent empties (C2), output cap (C3), input bounds (C7).
5. **Structure, after #147 merges**: shared `services/action/`, `errorDecision` out of `swapDecisions.ts`, typed
   wording instead of the regex reword, toolset table (A4), per-family Record (A5, A6), `dataTool` helper (C4),
   split `index.ts` (B5), `loadConfig` (B6).
6. **Multi-instance** with #125: one store interface for quotes and bridges, dedupe and alert budget behind it (A3).
7. **Tests**: shared mock factory and reset (D5), structural assertions instead of prose (D4), split big files (D6).

## Agent-friendliness of `nextAction` (review.md section E)

Idea: move what the agent must remember or know onto the server. Cheapest first.

1. **Core rules in the server instructions** (E3). Add the seven-row action table and three rules (`sameArgs`, walk
   the `next` chain, save the hash at broadcast) to `ACTION_RULES` in `server.ts`. Add a small tool (for example
   `sodax_next_action_help`) returning the contract, for clients without resource support.
2. **Never let the SDK refuse arguments** (E6). Loosen input schemas and validate in the handler, as `txHash` already
   is, so every failure is an `ActionError` with a `nextAction`.
3. **Echo complete arguments** (E1). On success the server knows the canonical values: emit full `args` (preview →
   prepare with all five fields). On failure emit the accepted fields and omit only the refused one. Keep `sameArgs`
   for existing runtimes.
4. **Count retries on the server** (E2). As bridge track does with `stageSince`: count per (API key, tool, args
   digest) in a `TtlCache` and return `external("help_desk")` / `service_unavailable` once exhausted. `maxAttempts`
   and `retryKey` become advisory.
5. **Machine-readable `execute`** (E4). Per step a `walletMethod` (`eth_sendTransaction`, `wallet_sendCalls`, the
   family's sign-and-send) and where the hash comes from in the wallet's answer.
6. **Ship the reference runtime and a naive-agent test** (E7). Move the runtime to `examples/`, link it from the
   README and the contract. Add a test that follows only `nextStep` / `nextAction`, keeps no counters and knows no
   contract, through the bridge flow and its error branches: it fails exactly where an agent still has to guess.

Scope: `nextAction` is shared by swap and bridge and based on #129 (PR #138). Items 1, 2, 6 fit the bridge branch;
3, 4, 5 change shared code and fit a PR of their own after #138 merges.

## Quick starts on the bridge branch (measured 2026-11-26)

- Fits `feat/147-bridge-tools`, all code that branch introduced: replace the regex reword (`inBridgeWords`,
  `forBridge`; about 16 uses in non-test code, 3 test files) with `DEFAULT_NEXT_STEP` entries taking
  `what: "swap" | "bridge"`; let `ActionModule` declare `afterSendTools` instead of `errorDecision` inferring from
  the tool name; small cleanups in `bridge/track.ts` (`proofOn` computed once, split `follow` / `fromRow`).
- Does not fit: typechecking tests. A trial `tsc` over tests reported 144 errors in 27 test files (about 19 in
  bridge tests; most in `server.test.ts`, `swapNonEvm.test.ts`, `discord.test.ts`, `actionTool.test.ts`,
  `swapQuote.test.ts`). Its own PR from `development`.
- Does not fit: the shared-folder move and renames, the toolset table, the per-family Record.

## State of the 147 worktree (2026-11-26, late)

- Another session was editing the worktree while this review ran (files changed minutes apart), so nothing there
  was committed by this task. It held about 20 uncommitted files plus this task's one-line import fix in
  `src/tools/swapHub.test.ts`.
- Committed and pushed on the branch: approve steps and their wording, Stellar trustline refusal, wallet-on-chain
  note, the `wallet_cannot_build` pointer to `sodax_get_balance`. Uncommitted only: prepare reading the balance,
  the `balance` field and the `balance_short` / `no_gas` / `balance_unchecked` / `different_token` warnings.

## Open

- Each step needs an issue before a PR (hub rule: every PR links an issue).
- A3: decide between "assert single-instance and document it" and the shared store.
