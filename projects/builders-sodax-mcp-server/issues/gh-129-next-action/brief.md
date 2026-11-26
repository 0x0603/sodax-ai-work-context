---
type: brief
repo: builders-sodax-mcp-server
github: 129
status: In review — PR #138; R0bi7's 2026-11-25 review fixed in 01b6187, pushed 2026-11-26; 2255 tests green
next: await R0bi7 on #138 (body updated, replied 2026-11-26); #145 must turn in_transit into a poll
updated: 2026-11-26
related_issues: [119, 125, 126, 127, 130, 132]
---

# GH-129 Next action · brief

## State

- Code on `feat/129-next-action` from development `e5c2450`, in `repos/client/builders-sodax-mcp-server-wt-129`:
  `a7e7157` (the contract) + `33e9e24` (bounds), pushed. Tests, biome, `tsc` (main, contract, scripts) and build
  pass; `test:contract` not run.
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

## Third review, on #138 (3 findings, verified and fixed in 33e9e24)

- Loops through a person are bounded: an agent answering yes for the user looped (cancel_failed sent cancels without
  end, destination_not_ready re-prepared, source_not_found took a new hash forever). Every call a person's answer
  leads back to is bounded, 3 per reason, under a key without the args (`<tool>:ask:<reason>`). Past it: `none`
  (terminal) before a send, `help_desk` after.
- Cancels are counted at the wallet: a cancel `ready`'s `afterSend` is bounded (`sodax_swap_cancel:send`, 3), and the
  runtime counts it before signing; every cancel confirm shares `sodax_swap_cancel:ask:cancel`.
- `unsent_cancel` is `confirm` with `by: "wallet"` (new contract field): only the wallet's record (nonce reused,
  blockhash expired) replaces a pending cancel; the runtime's `Host.walletShows`.
- The runtime saves a pending cancel's latest args (a chain added after a lost quote), keeping its `follow`.
- Tests: a check that every call after a person's answer is bounded (price → prepare excepted, a step forward), and a
  harness guard of 200 calls so a runaway fails instead of hanging.

## R0bi7 review on 57f1996 (2026-11-25): all findings verified and fixed

- A non-retryable failure with its code's default advice gets its own hand-off sentence (`wontPass`); evm.ts's
  hub cancel build is non-retryable too (pure encoding, no read). Fixture builds `retryable: false`; every hand-off
  is checked never to say retry.
- In transit stays final at the fill (57f1996's call); the check is `!== "in_transit"`, so a later `delivered`
  reads as complete. PR body's "merge after #127" note is stale: #145 must turn `in_transit` into a poll.
- README cancel line fixed (not_submitted does hand to track, which submits nothing there).
- Poll sentence names its 15 s wait (30 polls ≈ 17 min); Sui/non-EVM CHAIN_UNAVAILABLE text tells, not asks;
  UNSUPPORTED_CHAIN options = close matches first, then every chain.
- `not_this_swap` / `not_sent` from `checkSwapTx` carry `cancelTxHash`, and the ask for the right hash keeps it.

## Known, left for the PR thread

- Payload: nested continuations repeat the swap's args (~180 tokens per poll); `confirm.summary` repeats quote fields.
- A relayed cancel can be offered again by track: only the runtime's pending-cancel rule stops it.

## Map

| Question | File |
|---|---|
| What the issue asks, as filed | `issue.md` |
| Scope, evidence, contract, runtime rules, mapping, tests | `plan.md` |
