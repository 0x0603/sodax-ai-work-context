---
type: brief
repo: builders-sodax-mcp-server
github: 129
status: Active — draft PR #138 (feat/129-next-action, a7e7157) opened 2026-11-20 against development; 1932 tests green
next: mark #138 ready (and request review) once #127 is in development and `delivered` is mapped
updated: 2026-11-20
related_issues: [119, 125, 126, 127, 130, 132]
---

# GH-129 Next action · brief

## State

- Code on `feat/129-next-action` from development `e5c2450`, in `repos/client/builders-sodax-mcp-server-wt-129`.
  Uncommitted. Tests, biome, `tsc` (main, contract, scripts) and build pass.
- PR title should mark the break: `feat(swap)!:` (track's `failed.outcome` renamed `failure`; see below).
- PRs here squash-merge, so phase 1 and 2 as separate commits don't survive the merge; one commit is fine.

## Where the code departs from plan r5 (decided while coding)

- The continuation field is `next`, not `then`: an object with `then` reads as a promise in JavaScript (biome
  `noThenProperty`).
- Track's `failed.outcome` (backend's TrackOutcome) is renamed `failure`, freeing `outcome` for the contract.
- A result outside its own contract is caught in `registerActionTool` and returned as `INTERNAL`
  (`reason: output_contract`, handed off, alerted), so the SDK never swaps it for text and analytics logs it right.
- `consecutive: true` on retryable-error retries: only failures in a row count (code review: scattered blips over a
  long swap ended it as `unknown`). The key is the call (tool + args digest), not the code, so alternating codes
  still run out.
- `ActionError.retryable` (defaults to `RETRYABLE_CODES`) is the one place that says whether a failure may pass; the
  contract-check throw sets it false with its own `nextStep`, so sentence and action agree.
- The balance hint for `wallet_cannot_build` is attached in `swapsApi.ts` (`intentCall`), where every `/intents`
  call has the `IntentRequest`.
- `external` runs `next` only once the person says it's done; a poll's exhaustion is `still_in_progress` with no
  `next` (code review: the exhausted follow-up looped with no delay).
- `registerAppTool` uses `registerTool` only for tools with an output schema: `tool()` guesses overloads, and moving
  builder tools could change how an empty-shape handler gets its arguments.

## Cross review (2 agents, each verified the other's findings: 12/12 confirmed, all fixed)

- Reference runtime: a batch with no hash never restarts from `start` (no second swap); any cancel call carrying a
  hash is pending, wherever the hash came from; `ready` clears a pending cancel; an exhausted bound reports its outcome.
- `check_wallet` (unseen past `pollUntil`): once the user says it was sent, track in 15 s, at most 3 times (was: wait
  until `stopAfter`, past the deadline, so a late broadcast got refunded). The first fix (track at once, unbounded)
  looped with a runtime that always says yes: caught by a hung test run, now bounded.
- `cancel_awaiting_confirmation` exhausts to `check_wallet` → a new cancel; `cancel_failed` and
  `expired_awaiting_refund` ask the user to confirm a cancel; cancel `not_submitted` (spoke) retries cancel, then track.
- A contract break's "Tool call" record is the bug (error level, stack); balance token options stay on its chain;
  SWAP_INSTRUCTIONS point at nextAction; the live contract test expects the refusal's `reason`.

## Follow-up review (5 findings, all verified in code and fixed)

- A cancel never hands a swap with no record to track: with its quote, track submits a deposit it can now read
  (an unreadable receipt gives cancel `not_submitted`). It retries the cancel, then hands off. The old prose ("it
  won't submit anything here") was wrong for that case too.
- The runtime resumes a saved cancel first (with its hash, or its track once relayed); cancel results carry the
  checked `cancelTxHash`, and retries keep it, so a backend catching up never yields a second signature.
- A hub swap's held-looking deposit is `none` / `unknown`: the hub fills or refunds its intent without anyone.
- Serialization is inside the output guard: a bigint in a result is the same `output_contract` failure.

## Second follow-up review (2 findings, verified and fixed)

- A pending cancel is replaced only after an explicit `confirm` of kind `unsent_cancel` ("the wallet never sent
  it"): `external: check_wallet` + a yes only meant the user looked.
- The runtime saves every track call's arguments before making it, so a resume uses a corrected hash or chain.

## Known, left for the PR thread

- Payload: nested continuations repeat the swap's args (~180 tokens per poll); `confirm.summary` repeats quote fields.
- `solved` + in-transit polls to its bound until #127 maps `delivered` (merge gate).
- A relayed cancel can be offered again by track: only the runtime's pending-cancel rule stops it.

## Map

| Question | File |
|---|---|
| What the issue asks, as filed | `issue.md` |
| Scope, evidence, contract, runtime rules, mapping, tests | `plan.md` |
