---
type: process
repo: builders-sodax-mcp-server
github: 147
status: Review done, recommendations not implemented (one test import fixed, uncommitted)
updated: 2026-11-26
tags: [bridge, mcp, code-quality, maintainability, scale, agent-docs, kb]
source_commit: 3a06fb4
---

# Bridge branch: code quality, maintainability and agent-docs review

## Scope and method

Read-only review of `feat/147-bridge-tools` at `3a06fb4` plus the uncommitted working tree in
`repos/client/builders-sodax-mcp-server/.claude/worktrees/147-bridge-tools` (20 modified files, new
`src/services/trackWait.ts`). Read: `src/services/bridge/*`, `src/tools/bridge*.ts`, `actionTool.ts`,
`nextAction.ts`, `toolRegistry.ts`, `profiles.ts`, `swap/errors.ts`, `errorDecision` in `swapDecisions.ts`, the
bridge parts of `sodax.ts`, `server.ts`, README, the hub card. Code only: comments that state upstream behaviour
(bridge-api rate limit, "only submitTx answers 409") were not checked against bridge-api or the SDK, and no finding
below depends on them.

Verdict: the bridge logic is tight; the gaps are structure for scale and docs for agents, not correctness.

## Fixed in the working tree (uncommitted)

- `src/tools/swapHub.test.ts` imported `trackWait` from `swap/track.js` after the uncommitted refactor moved it to
  `src/services/trackWait.ts`: 30 tests failed with `TypeError: Cannot convert undefined or null to object`.
  Import corrected. Gates after: lint, checkTs, 66 files / 3393 tests green.

## Findings, by priority

1. **Tests are not typechecked.** `tsconfig.json` excludes `src/**/*.test.ts` and `__fixtures__`, so the broken
   import above passed `pnpm checkTs` and only showed at run time. Add a `tsconfig.test.json` (noEmit, includes
   tests and fixtures) to the `checkTs` script.

2. **The bridge store is in memory only** (`src/services/bridge/store.ts`): single instance.
   - A restart drops builds; an unsubmitted deposit goes to the operator (`unknown_bridge`).
   - `inFlight` and `stageSince` in `bridge/track.ts` are per process too.
   - Branch #125 already has `swap/quoteStore.ts` + `redisQuoteStore.ts`. The bridge should go through the same
     interface rather than add a second store to port later. Do it with #125.

3. **Bridge depends on `swap/` for things that are shared.** `services/bridge` has 53 import lines from `../swap/`.
   - Shared in practice: `errors`, `resolver`, `tokens`, `units`, `sources/*`, `alerts`, `sourceTx`, `balance`.
   - Names drifted with it: `SwapToolName` holds bridge tools, `SwapCatalog` / `SwapSource` / `SwapStep` serve
     bridge, bridge `AlertKind`s live in `swap/alerts.ts`.
   - Bridge borrows `QUOTE_NOT_FOUND` / `QUOTE_KEY_MISMATCH` for a bridgeId (`bridge/track.ts:108`, `:225`).
   - Extract a `services/action/` (or `shared/`) folder before a third module (money market) arrives.

4. **Swap wording is turned into bridge wording by regex** (`inBridgeWords`, `swap/errors.ts:98`; applied by
   `bridge/wording.ts` `forBridge`). Brittle: a new swap sentence phrased differently leaks through, and
   `hasDefaultNextStep` has to compare both spellings. Make `DEFAULT_NEXT_STEP` take `what: "swap" | "bridge"`, as
   `errorDecision` already does with `giveUp` / `helpFor`.

5. **`swapDecisions.ts` is 1031 lines and holds the shared `errorDecision`.** A new module edits the swap file:
   `AFTER_SEND` hardcodes the bridge track tool, `what` is inferred from `tool.startsWith("sodax_bridge_")`. Move
   `errorDecision` to its own file and let `ActionModule` (`actionTool.ts`) declare `afterSendTools` / `what`.

6. **Adding a toolset touches about 8 places.** `PROFILES`, `Toolsets`, `ToolModule`, both count functions in
   `toolRegistry.ts`, `toolGroup`, `STATIC_REGISTRARS`, and the `swapToolsEnabled, bridgeToolsEnabled` booleans
   threaded through 6 functions in `index.ts`. `describeProfiles` branches per combination. Replace with one
   toolset table (name, needs key, env flag, registrars, instructions) and pass one `enabled` object.

7. **Small:**
   - `follow()` and `fromRow()` in `bridge/track.ts` each carry 6-8 branches; split the submit step and the
     delivery proof into their own functions.
   - `proofOn` rescans `spokeChainConfig` on every call and casts `as never`; compute once at module scope.
   - `clearPollClock` is a test-only export.

## Docs for agents

- The repo has no `CLAUDE.md` / `AGENTS.md` and no `docs/kb/`. Knowledge sits in file-header comments (well
  written) and a 699-line README that mixes users, operators and contributors.
- Seed `docs/kb/invariants.md` from the existing comments (hub `docs/kb-standard.md`), e.g.:
  - Track trusts only the kept build and the chains, never the backend row as proof.
  - One build, one deposit.
  - No batch from Sonic.
  - Upstream text never reaches the agent.
  - Failures are returned, never thrown, so caller input stays out of analytics.
- Add a short `CLAUDE.md`: folder map, gate commands, an "add a tool / add a toolset" checklist.
- Hub card `docs/repos/builders-sodax-mcp-server.md` does not mention bridge: hub PR when the branch merges.
- Server-side agent docs (`BRIDGE_INSTRUCTIONS`, tool descriptions, `src/public/next-action.md`) agree with the code.

## Suggested order

(1) typecheck tests, CLAUDE.md + kb, (4) drop the regex reword; then (3) + (5) + (6) as one refactor PR after #147
merges, so PR #150 does not grow. (2) rides with #125.
