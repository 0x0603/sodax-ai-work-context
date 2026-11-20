---
type: plan
repo: builders-sodax-mcp-server
github: 129
status: r5 (+ round 6 locks) — the plan to implement (2026-11-20); phase 1 + phase 2 (outputSchema) in one PR
updated: 2026-11-20
related_issues: [119, 125, 126, 127, 130, 132]
---

# GH-129 Next action · plan (r5)

Written against `development` at `e5c2450` (#133 merged; includes #124, #128, #134, #114, #136). The plan comment on
the issue predates #134 (`sodax_swap_quote` → `sodax_swap_price` + `sodax_swap_prepare`) and ten new statuses; it is
updated with §0's AC changes before the PR opens.

Tags: **[verified]** read in code at the cited line; **[derived]** follows from verified facts; **[judgement]** a call.

## 0. Scope and AC changes (to post on the issue before the PR)

- **In:** `nextAction` + `terminal` (+ `outcome`) on every result `registerActionTool` returns, errors included; the
  runtime rules of §2.1; a tested reference runtime quoted in the README.
- **AC changes**, each with its reason in §3:
  1. "Every result, errors included" becomes "every result the tool's handler returns". A refusal the MCP SDK makes
     before the handler runs (bad arguments) has no `nextAction`; the README says how a runtime hands it off (§3.11).
  2. `terminal` = no tool call can move the result on: `none`, or an `external` that hands off (§3.2).
  3. Outcomes: `succeeded`, `cancelled`, `refunding`, `failed`, `held` (verified deposit, SODAX recovers), `unknown`;
     `refunded` / `delivered` come with #127 (§3.3).
  4. Retries: `until` only where the server holds a real time; elsewhere `maxAttempts` + a `retryKey` the runtime
     counts per workflow (§3.5).
  5. `outputSchema` stays, as phase 2: a second commit in the same PR (the user, 2026-11-20). The SDK-refusal
     interception that made it heavy is gone (§3.11); what remains is §5 step 7.
- **Merge gate:** after #127 is in `development` (`solved` + in-transit keeps a `call_tool`, §3.9).
- **Out:** rewording `nextStep` except where its action changed (§3.13); the builder profile's tools.

## 1. What the code says

### MCP server (`builders-sodax-mcp-server@e5c2450`)

- All six swap tools go through `registerActionTool` (`src/tools/actionTool.ts:25-69`); `toResult` puts the output in
  `structuredContent` and as compact JSON in `content[0].text` (`actionTool.ts:72-80`). [verified]
- Prose comes from `resolveNextStep`, `balanceNextStep`, `quoteNextStep`, `trackNextStep` (+ `notSubmittedNextStep`,
  `failedNextStep`), `cancelNextStep` (+ `NOT_CANCELLABLE`) and `afterSendAdvice` (`src/tools/swap.ts`), plus
  `DEFAULT_NEXT_STEP` (`src/services/swap/errors.ts:49-82`). [verified]
- 69 `new ActionError(` sites; about 21 pass a custom `nextStep`. Details aren't uniform: UNSUPPORTED_CHAIN has
  `supportedChains`/`didYouMean` but no `field` (`resolver.ts:57-58`); UNKNOWN_TOKEN only `side`
  (`resolver.ts:104-106`) though `resolveExactly` holds the resolution (`ambiguous` candidates; `not_found`
  suggestions and `otherChains`, either possibly empty, `resolver.ts:20-26,125-173`); RESTRICTED_TOKEN's first site has
  no `side` and never any options (`quote.ts:342`); UNSUPPORTED_SOURCE's `sourceChains` can be absent (`source.ts:68`);
  SECRET_REJECTED names the `field` it was pasted into, which can be any field (`secrets.ts:101,116,157`). [verified]
- SWAP_REJECTED is five refusals: no route, no liquidity, amount too large ("try a smaller amount or another token"),
  `INTENT_CREATION_FAILED` ("check the balance"), all from the Swaps API (`swapsApi.ts:281-317,353-355`); Stellar's
  trustline room ("raise the limit, prepare again", `stellar.ts:136`); and an unexplained 400/422. [verified]
- PRICE_OFF_MARKET is thrown in `quoteSwap`, shared by price and prepare (`quote.ts:229`). [verified]
- AMOUNT_TOO_LOW has `suggestedAmount` only when the token is priced and worth < $1.5 (`quote.ts:114-122`; absence
  pinned at `swapQuote.test.ts:866`). `DEFAULT_DEADLINE_MINUTES` is 15 (`quote.ts:59`); DEADLINE_TOO_SHORT means the
  builds ate the time (`quote.ts:291-293`). [verified]
- After a send, errors come from `resolveSource` (QUOTE_KEY_MISMATCH `source.ts:95`, QUOTE_MISMATCH, QUOTE_NOT_FOUND
  before the chain is known `source.ts:104-108`, INVALID_TX_HASH), the status read (API_KEY_REQUIRED, RATE_LIMITED,
  UPSTREAM_UNAVAILABLE), and cancel's intent checks (SWAP_MISMATCH `cancel.ts:118,126`). `configDisagrees()`
  (`source.ts:80`) is called from the quote flow only (`quote.ts:158,251,253,358`). [verified]
- Retry caps today: `MAX_CALLS = 10` for retryable errors after a send, `MAX_POLLS = 30` per step (`swap.ts:219,429`).
  The only server-held times: the unseen tx's `pollUntil`/`stopAfter` (`track.ts:309-329`) and the quote deadline.
  [verified]
- Refund timing: `submit_refused` and cancel `deposit_unsubmitted` return `retryAfterSec = ceil(deadline − now) + 15`
  (`track.ts:306-307`, `cancel.ts:168`); the first call after the deadline takes the refund path, never
  `submit_refused` again (`track.ts:186-191,226-229`). [verified]
- `alertOperator` returns `false` once its budget and held list are spent (`alerts.ts:96-136`, `117`). [verified]
- A spoke cancel that was relayed leaves no mark on the quote (`cancel.ts:146-148`); only a hub cancel confirmed on
  chain does (`markHubOutcome`, `cancel.ts:279`). Until the hub processes a relayed cancel, track can read the backend
  row as `failed` + `canCancel` (`track.ts:505-509`) and offer a second cancel. [verified]
- `SwapRef` = `{ txHash, chain, quoteId?, intentHash? }` (`source.ts:25`), on every track and cancel result. [verified]
- The batch's calls are "left to the agent so the calldata isn't returned twice" (`sources/types.ts:112-115`); a batch
  is tracked by the tx hash `wallet_getCallsStatus` reports, never the batch id (README step 4). [verified]
- No `docs/kb/` in this repo. [verified]

### MCP SDK 1.32.2 (`src/server/mcp.ts` at tag `1.32.2`)

- Input is parsed before the handler; a failure becomes a plain text `isError` result with no `structuredContent`
  (`mcp.ts:282-289,338-346`). With an `outputSchema`, a mismatch does the same after the handler ran
  (`mcp.ts:365-385`). [verified; the reviewer reproduced both]

### Backend (`sodax-backend@origin/development c22136df`, `apps/swaps-api`)

- Lifecycle `pending → relaying → relayed → posting_execution → posted_execution → solved | failed`
  (`types/submit-swap-tx.ts:35`); a solver-reported `failed` with a cancel-to-recover message "MAY rarely reconcile to
  `solved`" until `abandonedAt`, and a cancel is always safe (`dto/submit-tx-status.dto.ts:55`). No ETA or delivery
  state in the response (`dto/submit-tx-status.dto.ts:55-110`). [verified]

### SDK (`sodax-sdks@origin/main 312e47b2`)

- Its poll: `solved` success, `failed` or `abandonedAt` terminal (`packages/sdk/src/backendApi/pollBackendSubmitTx.ts:93-97`);
  no ETA. Delivery is a relay packet (`IntentRelayApiService.ts:424-425`): #127's work. [verified]

## 2. The contract

```ts
nextAction: NextAction;
terminal: boolean;          // no tool call can move this result on
outcome?: Outcome;          // only when terminal AND the result is about a swap that was sent

type NextAction =
  | { type: "call_tool"; tool: SwapToolName; args?: object; sameArgs?: true; afterSec: number;
      until?: string; maxAttempts?: number; retryKey?: string; onExhausted?: Exhausted }
  | { type: "choose";   field: string; options: { label: string; args: object }[]; then?: NextAction }   // ≥ 1 option
  | { type: "provide";  fields: { name: string; format?: string; optional?: true }[]; then?: NextAction;
      onDecline?: Exhausted }
  | { type: "confirm";  summary: ConfirmSummary; then: NextAction }
  | { type: "execute";  chain: string; stepsAt: "steps"; batchAt?: "batch"; waitFor: "receipt_success";
      expiresAt?: string; afterSend: CallTool & { on: "broadcast"; needs: ["txHash"] | ["cancelTxHash"] } }
  | { type: "external"; reason: ExternalReason; then?: NextAction }
  | { type: "none" };

type ConfirmSummary =
  | { kind: "swap"; quoteId: string; expiresAt: string; send; receiveAtLeast; expected; recipient; partnerFee?;
      usdValue; usdOut; approve?; warnings: ("usd_unchecked" | "above_warn_level" | "rate_unchecked"
      | "own_address_other_chain")[] }
  | { kind: "cancel"; chain: string; txHash: string }
  | { kind: "amount"; amount: string; symbol: string };
type Exhausted = { nextAction: NextAction; terminal: boolean; outcome?: Outcome };
type Outcome = "succeeded" | "cancelled" | "refunding" | "failed" | "held" | "unknown";
type ExternalReason = "help_desk" | "check_wallet" | "still_in_progress" | "destination_not_ready" | "wallet_setup"
                    | "api_key" | "secret_exposed" | "service_unavailable";
```

### 2.1 Runtime rules

1. **Arguments.** Results that found the swap (every non-error track and cancel result, which carry a `SwapRef`) give
   complete explicit `args`: `txHash`, `quoteId`, `chain` key, and a checked `cancelTxHash` where one applies, so no
   field needs removing (`cancel_failed`'s retry just has none). Every error, from any tool, and every result of
   price, prepare, balance and resolve uses `sameArgs`: the arguments of the call that returned the action, as the
   runtime kept them, with only the named field replaced. Build order: `sameArgs` base, then `args`, then the
   person's answer (a `choose` option's `args`, or `provide`'s values by field name). The server never echoes a value
   it rejected; it names fields and how to fix them.
2. **Sending.** Don't start an `execute` past `expiresAt`: prepare again and confirm again. Send `stepsAt` in order;
   before each step after the first the previous receipt must succeed (`waitFor`); a failed approve or reset stops with
   a handoff (nothing was swapped). With a batch, `reset_approve` still goes first; persist the **batch id** the moment
   the wallet returns it, then read `wallet_getCallsStatus` until it reports the tx hash: a resumed session reads the
   status again and never resends the batch. `afterSend.on` is `"broadcast"`: as soon as the last step (swap or
   cancel) is broadcast, persist `afterSend.args` plus the hash and make the call, even if the quote just expired or
   the receipt later fails (a NEAR tx can fail after its deposit ran, `swapNonEvm.test.ts:289`). The persisted
   `{ args, hash }` resumes the swap.
3. **Bounds.** A `call_tool` without `until` / `maxAttempts` is allowed only when (a) the server's own clock forces a
   different answer by the time it's due (the post-deadline calls), or (b) it hands over to another tool whose
   actions are bounded (cancel → track). A call behind a person is bounded too (#138 review: an agent answering
   yes looped): 3 per reason under `<tool>:ask:<reason>`, a key the answers don't change; past it `none` before a
   send, `help_desk` after. A cancel's `afterSend` is counted before the wallet signs (3 per swap), and
   `unsent_cancel` is a `confirm` with `by: "wallet"`. The runtime counts attempts per `retryKey` across the whole
   workflow, so a new server instance or an expired cache never grants a fresh budget.
4. **Declining.** A person declining a `confirm`, `choose` or `provide` ends the loop, not terminal; the runtime keeps
   any sent `{ args, hash }` so the user can resume later. Only where declining leaves funds needing recovery does an
   action carry `onDecline` (`deposit_mismatch`, §4).
5. **A pending cancel.** After a cancel's `afterSend`, the runtime keeps `{ args, cancelTxHash, relayed }` with the
   swap. A relayed spoke cancel leaves the server no mark (§1), so the runtime holds this state:
   - **not yet relayed** (`cancel_awaiting_confirmation`): a `confirm` of `kind: "cancel"` isn't shown; the runtime
     calls `sodax_swap_cancel` with the pending `cancelTxHash` (bounded, 10);
   - **relayed** (`cancel_relayed` seen): no cancel call at all. `cancel_relayed`'s action polls track under a
     `retryKey` keyed on the `cancelTxHash`; a track `failed` + `canCancel` meanwhile (the backend not caught up) counts
     as one more attempt of that same key, never a new cancel or a re-relay; exhausted → `external: help_desk`
     keeping both hashes. [review round 6: r5 re-called cancel with the old hash, which re-relays and loops
     `cancel_relayed → track → failed + canCancel`]
   - a new cancel is offered only once the pending one is `cancel_failed`, `not_a_cancel_tx`, or the wallet confirms it
     was never sent.
6. **The loop.** `call_tool` → call; `execute` → the wallet, then `afterSend`; `none` → stop; anything else, including
   an unknown `type`, → a person, then `then`. On `terminal`, finish the handoff (show the `external`) before
   stopping. A result with no `nextAction` has no contract (an SDK refusal before or after the handler, an older
   server, another tool): fix the arguments only when the message says the input was invalid; otherwise hand off,
   keeping any hash already sent.

## 3. Decisions

1. **`execute` points at the steps instead of copying them** (`stepsAt`, `batchAt`): calldata is kilobytes and every
   result is sent twice already (`sources/types.ts:112-115`). [judgement]
2. **`terminal` = no tool call can move it on; invariant `none` ⇒ terminal ⇒ `none` | `external`.** A stranded deposit
   nobody was paged about is final for the tools, yet the user writing to the help desk is what recovers it. [judgement;
   reviewer agreed, given rule 6's handoff]
3. **`held` only for a verified deposit**: the server read the deposit on chain or the backend has its row. A tx whose
   events couldn't all be read (`unverified`, track and cancel) is `unknown` + `external: help_desk`. [judgement]
4. **`outcome` only on results about a sent swap** (track, cancel, and errors after a send that end it). [judgement]
5. **No new server state for bounds.** `until` only from times the server really holds: `pollUntil` for an unseen tx,
   the quote deadline. Everything else polled carries `maxAttempts` + `retryKey`, counted by the runtime per workflow:
   30 for a swap at one step (today's `MAX_POLLS`), 10 for retryable errors and refund retries (`MAX_CALLS`), 1 for
   DEADLINE_TOO_SHORT and the non-EVM `source_not_found` retry. `retryKey = <tool>:<txHash, or a hash of the
   arguments before a send>:<status or code>[:<stage>]`. Post-deadline calls (`submit_refused`, cancel
   `deposit_unsubmitted`, the unseen tx past `pollUntil`) are single scheduled calls with no bound. `onExhausted`
   follows `alerted`: `{ none, terminal, held }` if paged, else `{ external: help_desk, terminal, held }`; retryable
   errors exhaust to `service_unavailable` before a send, `help_desk` after. [reviewer round 5: r4's stage clock and
   TTL cache were more state than a poll limit is worth, and a clock per instance hands out fresh budgets]
6. **Errors carry what their action needs, from the catalog only.** UNKNOWN_TOKEN its resolution; UNSUPPORTED_CHAIN /
   UNSUPPORTED_SOURCE / RESTRICTED_TOKEN their `field`; SWAP_REJECTED a `reason` (`no_route`, `no_liquidity`,
   `amount_too_large`, `wallet_cannot_build`, `trustline_room`, `rejected`). **A `choose` with no options becomes a
   `provide` of the same field**, so RESTRICTED_TOKEN, an empty UNKNOWN_TOKEN and a bare UNSUPPORTED_SOURCE all work.
   Every `then` returns to the tool that failed. [judgement + review]
7. **`args` hold only server-canonical values** (chain keys, token addresses, checked hashes, `quoteId`); nothing the
   server writes back is built from caller free text (`swap.ts:276-279`). [derived]
8. **`confirm.summary` has a `kind`** (`swap`, `cancel`, `amount`), and the swap one is machine-readable: amounts,
   recipient, fee, USD values, the approve, and warnings that exist only as prose today (`swap.ts:337-364`). [judgement]
9. **`solved` + in-transit keeps a `call_tool`, and track is the only producer of `succeeded`.** Cancel's
   `not_cancellable: solved` (the fill won) is `call_tool track`. The PR merges after #127 maps `delivered`. [review]
10. **Prepare's `afterSend` carries `{ quoteId, chain }`.** Without Redis a restart loses the quote; with the chain,
    track still checks the deposit instead of answering QUOTE_NOT_FOUND (`source.ts:96-108`). [derived]
11. **SDK refusals stay outside the contract in this PR.** Reshaping them meant turning `withAnalytics`' refusal record
    into a classifier that re-parses input and builds responses: the hardest part to maintain, for calls a client
    that reads `tools/list` rarely makes. The zod shapes and secret screening stay as they are; rule 6 says how to hand
    such a result off; a test pins that boundary. [reviewer round 5; r3-r4's interception dropped]
12. **Errors after a send keep the hash and point at recovery, never `none`.** `errorDecision(failure, tool, sent)`;
    after a send: SWAP_MISMATCH (cancel) → `external: help_desk`; QUOTE_KEY_MISMATCH, API_KEY_REQUIRED →
    `external: api_key`; an unexplained SWAP_REJECTED → `external: help_desk`; input codes → `provide` as before
    (`sameArgs`); retryable → bounded, `onExhausted` `help_desk`. Each `nextStep` ends "the user must not send it
    again", as `afterSendAdvice` does today. [review round 4, corrected in round 5: only cancel throws SWAP_MISMATCH
    after a send]
13. **`nextStep` changes only where its action changed**, so the two never disagree (AC): cancel `not_on_hub_yet`
    (retry the cancel, not track), cancel `not_cancellable: solved` (track until delivered, not "already complete"),
    track `solved` in transit (track, not "check the balance"), DEADLINE_TOO_SHORT at 15 min or more (hand off),
    track `failed` + `canCancel` (adds "unless a cancel was already sent"). Everything else stays byte for byte, and
    the existing `nextStep` tests stay the safety net. [review]

## 4. Mapping

| Result | `nextAction` | terminal / outcome |
|---|---|---|
| resolve resolved | `none` | yes / – |
| resolve ambiguous / not_found with suggestions or other chains | `choose` (catalog options; an other-chain option sets chain + token) | no |
| resolve not_found with neither | `provide` chain + token | no |
| balance | `none` | yes / – |
| price | `provide` the `prepareNeeds` fields, `then` prepare `sameArgs` | no |
| prepare ready | `confirm` `swap` → `execute` → `afterSend` track `{quoteId, chain}` needs `txHash` | no |
| track `awaiting_source_confirmation`, unseen with `pollUntil` | `call_tool` track, `until` = `pollUntil`, `onExhausted` one `call_tool` track at or after `pollUntil`, then follow its result (the `check_wallet` row below) | no |
| … seen, or without a quote | `call_tool` track, `maxAttempts` 30 + `retryKey` | no |
| … past `pollUntil` (has `stopAfter`) | `external: check_wallet`, `then` single `call_tool` track, `afterSec` = `retryAfterSec` | no |
| track `queued`, `in_progress` | `call_tool` track, `maxAttempts` 30 + `retryKey` (per stage), `onExhausted` `external: still_in_progress` → `then` track | no |
| track `submit_refused` | single `call_tool` track, `afterSec` = `retryAfterSec` (after the deadline) | no |
| track `solved` complete | `none` | yes / `succeeded` |
| track `solved` in transit | `call_tool` track, bounded (#127 maps `delivered`) | no |
| track `failed` `canCancel` | `confirm` `cancel` → `call_tool` cancel (rule 5 applies) | no |
| track `failed` cancelled / refunding | `none` | yes / `cancelled` / `refunding` |
| track `failed` abandoned / unknown | `none` | yes / `held` |
| track `expired_refunding`, `expired_awaiting_refund` | `none` | yes / `refunding` |
| track `expired_unsubmitted` | `call_tool` track, `maxAttempts` 10; `onExhausted` per `alerted` | no |
| track `intent_closed`, `unknown` | `none` | yes / `unknown` |
| track `source_failed` (no deposit) | `none` | yes / `failed` |
| track `source_failed` depositHeld | alerted ? `none` : `external: help_desk` | yes / `held` |
| … `notThisQuote` | `provide` txHash | no |
| track `source_not_found`, EVM | `provide` txHash | no |
| … non-EVM | `call_tool` track, `afterSec` 15, `maxAttempts` 1, `onExhausted` `external: check_wallet` → `provide` txHash | no |
| track `not_submitted` `not_a_deposit` | `provide` txHash | no |
| … `deposit_mismatch` | `provide` quoteId → track; `onDecline` alerted ? `none`/`held` : `external: help_desk`/`held` | no |
| … `other_sender`, `quote_used`, `multiple_deposits` | alerted ? `none` : `external: help_desk` | yes / `held` |
| … `unverified` | `external: help_desk` | yes / `unknown` |
| track `not_submitted_unknown_quote` | deposit + quoteId: as `other_sender`; deposit: `provide` quoteId; else `provide` txHash | per branch |
| cancel `ready` | `execute` → `afterSend` cancel `{txHash, quoteId, chain}` needs `cancelTxHash` | no |
| cancel `deposit_unsubmitted` | single `call_tool` cancel, `afterSec` = `retryAfterSec` (after the deadline) | no |
| cancel `expired_unsubmitted` | `call_tool` cancel, `maxAttempts` 10; `onExhausted` per `alerted` | no |
| cancel `cancel_awaiting_confirmation` | `call_tool` cancel `{…, cancelTxHash}`, `maxAttempts` 10 | no |
| cancel `cancel_failed` | `call_tool` cancel `{txHash, quoteId, chain}` | no |
| cancel `not_a_cancel_tx` | `provide` cancelTxHash | no |
| cancel `cancel_relayed` | `call_tool` track, `maxAttempts` + `retryKey = track:<txHash>:cancel:<cancelTxHash>` (unverified: first `afterSec` 180), `onExhausted` `external: help_desk` (rule 5) | no |
| cancel `cancel_confirmed` | `none` | yes / `cancelled` |
| cancel `not_cancellable` solved | `call_tool` track | no |
| … cancelled / refunding / closed | `none` | yes / `cancelled` / `refunding` / `unknown` |
| … `not_submitted` (hub) | `none` | yes / `unknown` |
| … `not_submitted` | `call_tool` track | no |
| … `not_on_hub_yet` | `call_tool` cancel, `afterSec` 15, `maxAttempts` 10, `onExhausted` handoff | no |
| … `not_sent` | `call_tool` cancel, `afterSec` 15, `maxAttempts` 10, `onExhausted` `external: check_wallet` | no |
| … `not_this_swap` | `provide` txHash | no |
| … `unverified` | `external: help_desk` | yes / `unknown` |
| UNSUPPORTED_CHAIN / UNSUPPORTED_SOURCE / UNKNOWN_TOKEN with options | `choose`, `then` same tool `sameArgs` | no |
| … without options, RESTRICTED_TOKEN | `provide` the field, `then` same tool `sameArgs` | no |
| INVALID_AMOUNT, INVALID_ADDRESS (`missing`), INVALID_TX_HASH, QUOTE_MISMATCH, QUOTE_NOT_FOUND | `provide` the field(s), `then` same tool `sameArgs` | no |
| AMOUNT_TOO_LOW with `suggestedAmount` | `confirm` `amount` → same tool `sameArgs` + `{amount}` | no |
| AMOUNT_TOO_LOW without it | `provide` amount → same tool `sameArgs` | no |
| DEADLINE_TOO_SHORT, the call's deadline < 15 | `call_tool` prepare `sameArgs` + `{deadlineMinutes: 15}`, `maxAttempts` 1, `onExhausted` `service_unavailable` | no |
| … ≥ 15 | `external: service_unavailable` | no |
| PRICE_OFF_MARKET | `provide` amount → same tool `sameArgs` | no |
| SWAP_REJECTED `no_route` / `no_liquidity` / `amount_too_large` | `provide` amount (token optional) → same tool `sameArgs` | no |
| … `wallet_cannot_build` | `call_tool` balance `{chain, address, token}` (canonical) | no |
| … `trustline_room` | `external: wallet_setup` → prepare `sameArgs` | no |
| … `rejected` (before a send) | `none` | yes / – |
| SWAP_MISMATCH before a send | `none` (don't sign) | yes / – |
| DESTINATION_NOT_READY | `external: destination_not_ready` → same tool `sameArgs` | no |
| API_KEY_REQUIRED, QUOTE_KEY_MISMATCH | `external: api_key` | no |
| SECRET_REJECTED | `external: secret_exposed` → `provide` `details.field` | no |
| RATE_LIMITED, CHAIN_UNAVAILABLE, UPSTREAM_UNAVAILABLE, INTERNAL | `call_tool` same tool `sameArgs`, `afterSec` = `retryAfterSec`, `maxAttempts` 10 + `retryKey` | no |
| any error after a send | as above, but per §3.12: never `none`, `onExhausted` `help_desk` | per §3.12 |
| SDK refusal (no handler result) | no `nextAction`: rule 6 | – |

## 5. Steps (branch `feat/129-next-action`, one PR, Closes #129)

1. `src/tools/nextAction.ts`: the types, small builders, `Decision = { nextAction, terminal, outcome?, nextStep }`.
2. Each `*NextStep` becomes a `*Decision` with a `never`-checked switch; `errorDecision(failure, tool, sent)` absorbs
   `DEFAULT_NEXT_STEP` and `afterSendAdvice`. `nextStep` text changes only in §3.13's rows.
3. Error details at the throw sites: §3.6's fields, options and reasons; RESTRICTED_TOKEN gets its `side`.
4. `registerActionTool` spreads the decision on both paths; `ActionOutput` requires `nextAction` and `terminal`;
   prepare keeps its top-level `afterSend` (marked for removal in the README).
5. Tests:
   - table: one fixture per status, reason and error code (before and after a send): type, `terminal`, `outcome`;
   - invariants on every fixture: `none` ⇒ terminal ⇒ `none` | `external`; `choose` ≥ 1 option; a bounded
     `call_tool` has `retryKey` (with `maxAttempts`) and `onExhausted`; every unbounded one is case (a) or (b), and every call after a person's answer is bounded;
     `held` never on an `unverified` branch; no error after a send is `none`; explicit args on `SwapRef` results,
     `sameArgs` on errors; nothing the caller sent appears in `args` or `nextStep`;
   - text: each `call_tool`'s `nextStep` names its tool (catches a §3.13 row left behind);
   - fake clock: `submit_refused` and cancel `deposit_unsubmitted` get their refund call after the deadline;
   - `expired_unsubmitted` with `alerted: false` exhausts to `help_desk` (track and cancel);
   - AMOUNT_TOO_LOW both ways; DEADLINE_TOO_SHORT below and at 15; each SWAP_REJECTED reason; SECRET_REJECTED in a
     txHash field asks for a tx hash; PRICE_OFF_MARKET from price returns to price;
   - the SDK boundary: a malformed argument through `client.callTool` returns the SDK's text with no
     `structuredContent` (pins §3.11);
   - the reference runtime (its own file, quoted by the README), using `nextAction` alone, never `nextStep`: price →
     continue → prepare → confirm → sign → track to the end (EVM with an approve; non-EVM); a declined confirm stops
     and resumes from the saved hash; an interruption after broadcast resumed from `{ args, hash }`; **a batch
     interrupted between the batch id and the tx hash resumes through `wallet_getCallsStatus` without resending**; a
     NEAR receipt failing after the deposit (tracked, `held`); a cancel; **a relayed cancel with the backend held at
     `failed` + `canCancel` across every poll: no second signature, no re-relay, the poll stops at its bound and hands
     off to `help_desk`**; **an unseen tx on a fake clock past `pollUntil` (one more track → `check_wallet`) and past
     `stopAfter` (→ `source_not_found`)**; a fill that beats
     the cancel (track until delivered); `not_on_hub_yet → ready`; a lost quote that keeps the hash and asks for the
     chain; a non-EVM `source_not_found` retried once; an UNKNOWN_TOKEN with no candidates back to a quote.
6. README "Next actions": the types, §2.1's rules, the reference-runtime excerpt (a test checks it matches the file
   verbatim), unknown `type` → a person, no `nextAction` → no contract.
7. **Phase 2, second commit, after phase 1's tests pin the contract:** `outputSchema`.
   - `withAnalytics` wraps `registerTool` as it wraps `tool` (the handler is the last argument of both): today it
     wraps only `server.tool` (`analytics.ts:197-243`), and `registerTool()` bypasses it (`mcp.ts` 1061 vs 1120-1140),
     which would lose `request.id`, the "Tool call" record and the PostHog event.
   - `registerAppTool` moves to `server.registerTool` with an optional `outputSchema`; `seedToolRegistry`'s recording
     stub gains `registerTool` in the same commit, since it has only `tool()` (`server.ts:128-130`) and runs before
     `listen()` (`index.ts:176`).
   - The swap tools declare the contract loosely: `{ status, nextAction: { type }, terminal, outcome?, nextStep }`,
     each object `.passthrough()`; the per-type shapes stay in tests and the README, not in `tools/list`. **It must
     accept the structured error shape too**: the SDK client validates any `structuredContent`, `isError` or not, once
     `listTools()` has cached the schema (`client/index.ts:729-750` at 1.32.2, despite its comment), while the server
     skips errors (`mcp.ts:365-367`) — a server-side test alone would miss it. [verified; review round 6]
   - A mismatch replaces the result with SDK text (`mcp.ts:378-385`); rule 6 then hands it off, which is also right
     for prepare, whose retry would hold another quote (`quoteCache.ts:58`).
   - Tests: through a real SDK `Client`, `listTools()` then `callTool()` for a success and for structured errors
     (before and after a send) of every swap tool; every fixture, errors included, parses with its tool's schema; a
     forced output mismatch leaves the runtime keeping the hash, handing off, and never calling prepare again; the
     analytics test runs through `registerTool` (record, `request.id` on stdio, PostHog); the registry test and an HTTP
     boot test run with the swap profile on.

## 6. Order and risks

- Branch from `development` now; merge `development` in when #137 lands (merge, never rebase). Post §0 on the issue
  before opening the PR. Merge only after #127.
- #130's signing guides can fill `execute` later; a Solana `sendBy` waits until the builder or wallet exposes a reliable
  expiry ("about a minute" isn't one). #132 changes no action type.
- Docs: a "Next actions" section in the batched sodax-sdks docs PR (#645 / #644); that issue needs its label from the
  user before any commit.
- Risk: the shape becomes a contract once a client depends on it; the swap tools aren't in production yet.
- Phase 2 can be dropped from the PR without touching phase 1 if review finds it heavy: it is one commit on top.
