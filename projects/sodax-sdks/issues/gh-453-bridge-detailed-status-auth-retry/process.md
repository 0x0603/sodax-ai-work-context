---
type: process
repo: sodax-sdks
github: 453
updated: 2026-09-17
---

# Process

## Log

### 2026-09-17 — scoping session (no code written)

Question asked: *what is this task, and does it touch the SDK only or the backend too?*

Method: a 12-agent workflow (6 read-only investigators, each adversarially verified by a
second agent), then every load-bearing number re-checked by hand against `origin/main`.
Dimensions: swap reference implementation · bridge current state · relay packet source ·
auth-retry blast radius · docs/skills surface · `sodax-backend` ownership.

Tree stamps at the time: `sodax-sdks` local HEAD `a10e50b4` on `test/450-leverage-yield-manual`
(2 commits behind `origin/main` `b5aaca0e`, both docs/types only — so the source read was
current); `sodax-backend` `9d3d8b06` on `development`; `sodax-frontend` `aa73a308` on
`chore/bump-sodax-sdk-2.2.0-rc.3`.

Answer: **`sodax-sdks` only.** Evidence below.

## Scoping evidence

### `sodax-backend` — nothing to do

| Fact | Evidence (`sodax-backend@9d3d8b06`) |
| ---- | ----------------------------------- |
| Bridge is its own NestJS service, not a swaps variant | `apps/bridge-api/` with its own Mongo collection and drainer; `apps/bridge-api/src/api/bridge/bridge.controller.ts:59` `@Controller('bridge')` vs `apps/swaps-api/src/api/swaps/swaps.controller.ts:76` |
| `POST /bridge/submit-tx` exists | `bridge.controller.ts:204` (`@RequireApiKey('bridge:write')`) |
| `GET /bridge/submit-tx/status` exists and is keyed by exactly `(txHash, srcChainKey)` | `bridge.controller.ts:219-225`, backed by a unique compound index — no index work needed |
| Missing record is a real 404, never a 200 | `@ApiNotFoundResponse({ description: 'No submit-bridge-tx found for the given (txHash, srcChainKey)' })` `bridge.controller.ts:223`; `NotFoundError → NotFoundException` |
| "Backend gave up" is already on the wire | `dto/submit-bridge-tx-status.dto.ts:63` `abandonedAt?`, `:42` `status` incl. `'failed'`; emitted at `bridge.service.ts:309` |
| The status record already carries the relay packet + dest hash | `dto/submit-bridge-tx-status.dto.ts:23` `dstIntentTxHash!: string` (required), `:26` `packetData?`; write path `tasks/submit-bridge-txs/submit-bridge-txs.task.ts:401-406` |
| The relay is **not** in this repo | 36 route controllers enumerated, none mounts `relay`; the backend is a *client* of it — `apps/bridge-api/src/api/bridge/relay-poll.ts:35-60` (`pollBridgePacket`) |
| Auth is per-service, and 401/403 match the SDK's `isAuthStatus` | each app registers `ApiAuthClientModule`; guard fires on `@RequireApiKey(scope)`. 401 = missing/invalid, 403 = suspended org / missing scope, 503 = cannot verify (SDK deliberately excludes 503) |

Caveat carried into the plan: rejection only happens in `mode === 'enforce'`. Under
`monitor`/`off` a bad key still gets a 200, so the new retry policy is a no-op on such a
deployment.

### The relay leg already exists, already keyed by src tx hash

- `getTransactionPackets({ action: 'get_transaction_packets', params: { chain_id, tx_hash } })`
  — `tx_hash` **is** the source tx hash; `chain_id` is `getIntentRelayChainId(srcChainKey)`.
  `packages/sdk/src/shared/services/intentRelay/IntentRelayApiService.ts` (invariants on both
  params), publicly exported from `@sodax/sdk`.
- One POST to the bare endpoint (action in the JSON body), headers `Content-Type` only — no
  `x-api-key`, and `extras.apiKey` / per-call `apiConfig` do not reach it.
- Default endpoint `https://api.sodax.com/v1/relay`
  (`packages/types/src/common/constants.ts:29` `DEFAULT_RELAYER_API_ENDPOINT`).
- Proven to answer for **bridge** txs, not just swaps: `sodax-backend`'s own
  `relay-poll.ts:47` calls that exact SDK function with a bridge deposit's src tx hash and reads
  `dst_tx_hash` off it. That is also a ready reference implementation of the same filter
  (`src_tx_hash` match → `status === 'executed'` → `dst_tx_hash`).
- Client-side wiring is already inside `BridgeService`: `BridgeService.ts:581`
  (`this.config.relay.relayerApiEndpoint`) and `:604` (`packetResult.value.dst_tx_hash`). No new
  config, no constructor plumbing.

### `sodax-frontend` — nothing to do

`rg "useBridgeApi|useDetailedStatus|getDetailedStatus|getSubmitTxStatus"` over
`sodax-frontend@aa73a308` (excluding `node_modules`) → zero hits. Its only `retry: 3` is a
comment. So no consumer repo change — and no existing caller for the new hook either.

### Hand-verified numbers (`origin/main` @ `b5aaca0e`)

- 11 hook files under `packages/dapp-kit/src/hooks/bridgeApi/` (excluding `index.ts` and the one
  test); **10** carry `retry: 3`, `useBridgeApiApproveAndBroadcast.ts` carries none.
- `retryUnlessAuthFailure` hits in `bridgeApi/`: **0**.
- `getDetailedStatus`/`DetailedStatus` hits in `packages/sdk/src/bridge/`,
  `packages/dapp-kit/src/hooks/bridgeApi/`, `BridgeApiService.ts`: **0** — the router genuinely
  does not exist.
- `401|403|Detailed Status` hits in `BRIDGE.md` + `BRIDGE_API.md`: **0**.
- Doc sizes: `BRIDGE.md` 35 039 B, `BRIDGE_API.md` 9 174 B, `SWAPS.md` 58 588 B,
  `SWAPS_API.md` 15 901 B.
- `e2e-relay.test.ts:11-14` carries the bridge deferral in-source.

## Corrections the verify pass produced

Recorded because each one would have shaped the diff wrongly.

1. **Hook count.** Investigators said 10, 11 and 12 in different dimensions. Hand-count on
   `origin/main`: **10 files with `retry: 3`**, 11 hook files total. Use 10.
2. **"Each arm returns its source's payload unmodified" is not strictly true for swap.** On solver
   `NOT_FOUND`, `SwapService.ts:412-416` reconciles against the durable intent record and returns a
   **synthesized** `{ status: SOLVED, fill_tx_hash }` still tagged `source: 'solver'`. Bridge has no
   equivalent third source, so the bridge contract *can* hold the invariant literally — but do not
   quote swap's docs as if the invariant were absolute.
3. **`isBackendSubmitTxAbandoned` is not literal reuse.** Its parameter is swap's
   `SubmitTxStatusDataV2` (closed `status` union, `backendApiV2.ts:710`); bridge widens `status` to
   `string` (`backendBridgeApiV2.ts:214`). Widen the signature to
   `BackendSubmitTxStatusEnvelope` (`pollBackendSubmitTx.ts:13-18`), whose doc comment already
   states both types are assignable.
4. **"The backend serves no relay packet" — too strong.** `GET /bridge/submit-tx/status` *does*
   expose the packet and the dest hash, via a record it owns (`dstIntentTxHash`, `packetData`).
   The accurate statement: there is **no endpoint that looks a packet up from a bare src tx hash
   when no record exists or the record was abandoned**. That is exactly why arm 2 is needed — and
   why arm 2 goes to the relay, not the backend.
5. **`packages/bridge-api/` is not a build artifact.** It is 20 tracked files on
   `origin/feat/bridge-api-package` (PR #308, ~61 commits ahead of main, unmerged). Only its
   `dist/` + `node_modules/` sit in the working tree. Does not change the scope; does create
   conflict risk.
6. **The status-hook fix is not one line.** Swap also stops the interval on auth failure
   (`useSwapsApiSubmitTxStatus.ts:53`). Swapping only `retry` leaves the exact defect the issue
   names.
7. **Docs scope shrinks, not grows.** The published 401/403 semantics already exist at
   `docs/developers/how-to/api-keys.md:181-184` (hand-authored, in nav at `docs/docs.json:158`,
   already names `sodax.api.bridge` at :128). The issue asks only for `BRIDGE_API.md`. No new
   `docs/developers/http-api/` bridge page — and `docs/bridge/index.mdx:19` still says "No Bridge
   write API yet", so adding one would be a launch-posture change.
8. **A backend-side alternative exists and was deliberately not taken.** `swaps-api` ships a relay
   proxy route `@Post('intents/packet')` (`apps/swaps-api/src/api/swaps/swaps.controller.ts:421`,
   and `leverage-yield.controller.ts:437`). A bridge equivalent is the *one* version of this task
   that would require `sodax-backend` work. #453 does not ask for it and the SDK reaches the relay
   unaided — so the correct framing is "an option not taken", not "no such pattern exists".

## Semantic note on `dst_tx_hash` — CORRECTED 2026-09-17

**The first version of this section was wrong** and would have shipped a false sentence in
`BRIDGE.md`. It said bridge's `dst_tx_hash` is the destination-chain hash. It is not:

- **Spoke-source bridge** (the common row): the packet's `dst_tx_hash` is the **hub settlement
  tx**, exactly as for swap. `BridgeService.ts:467-468` states it outright — "`srcChainTxHash`
  is the spoke deposit tx and `dstChainTxHash` is the hub settlement tx" — and `BRIDGE.md:171`
  describes the flow as "spoke deposit → relay → hub settlement". The hub→destination hop is a
  further leg the SDK's relay read does not cover, and the backend states it is not tracked for
  spoke→spoke.
- **Hub-source bridge** (first-class: `BridgeService.ts:217`, `:373`): the same field is a
  **destination spoke** tx.

So arm 2 proves "the deposit reached the hub", not "the funds landed". No field name is true in
both directions — which is why the corrected plan hoists no hash field at all and returns the
matched `PacketData` as-is.

Related non-issue checked: the relay can track a packet under a derived id instead of the submit
tx hash (`IntentRelayApiService.ts:544-547` `pollTxHash`; `BitcoinSpokeService.ts:273-277`
`od:<hash>`). Used only by MoneyMarket (Bitcoin on-demand borrow/withdraw) and swap cancel —
bridge never sets it, so a bridge router keyed on the real spoke tx hash is safe.

Related non-issue checked: the relay can track a packet under a derived id instead of the submit
tx hash (`IntentRelayApiService.ts:544-547` `pollTxHash`; `BitcoinSpokeService.ts:273-277`
`od:<hash>`). Used only by MoneyMarket (Bitcoin on-demand borrow/withdraw) and swap cancel —
bridge never sets it, so a bridge router keyed on the real spoke tx hash is safe.

## Findings — reference implementation, sized

| Piece | File | LOC |
| ----- | ---- | --: |
| pure contract | `packages/sdk/src/swap/detailedStatus.ts` | 43 |
| method + relay leg + error helper | `packages/sdk/src/swap/SwapService.ts:450-590` | ~140 |
| poll hook | `packages/dapp-kit/src/hooks/swap/useDetailedStatus.ts` | 70 |
| poll policy (solver-coupled) | `packages/dapp-kit/src/hooks/swap/getSwapStatusRefetchInterval.ts` | 126 |
| unit tests | `SwapService.test.ts:1954-2321` (**13** cases) + `useDetailedStatus.test.ts` | ~565 |
| predicate test | `packages/sdk/src/swap/detailedStatus.test.ts` (2 cases) | 24 |
| e2e | `packages/sdk/src/e2e-tests/detailedStatus.e2e.test.ts` | 50 |

Bridge's version is smaller: no solver leg (−63 lines of `resolveSolverStatus`), no
`isHubChainKeyType` short-circuit, no `isHex` validation. Tests and docs are the bulk of the work,
not the method.

**Corrected:** the first version of this section said "19 cases" (hand-recount: 13 `it(` between
`:1954` and the next top-level `describe(` at `:2323`) and claimed there is "no leverage-yield
precedent … swap is the single reference". The second claim was the plan's worst error — see
§ Review of revision 1, item 1. `detailedStatus.test.ts` is the cheap fence on the one predicate
the bridge work widens, and revision 1 never mentioned it.

## Review of revision 1 — 2026-09-17, second session

Revision 1 of `plan.md` was reviewed by a 9-agent workflow (3 source probes → 2 competing
architectures → 3 judges on distinct lenses: reviewability, scalability, correctness) and every
load-bearing finding was then re-verified by hand. The panel produced **19 defects**. One
proposal agent died on a malformed structured output; its thesis survives in the record because
the scalability winner argued the same extraction, and its one unique argument (below, item 2)
was recovered from its transcript and verified independently.

Judge outcome: 2-1 for "bridge owns its own router, reuse by import, never parameterize"
(reviewability 9, correctness 9) over "extract the relay leg into `backendApi/`" (scalability 8).
The corrected plan takes the winner's stance plus the loser's one extraction, which both winning
judges explicitly grafted.

### The three defects that changed the design

1. **"No leverage-yield precedent" was false, and it was the premise driving the architecture.**
   #452 is OPEN, assigned to the same person, filed 2026-09-14T10:03:50Z — eight minutes before
   #453 — and its body names `LeverageYieldService.getDetailedStatus({ srcChainKey, srcTxHash })`,
   the same routing rules, both symbols (`DETAILED_STATUS_NOT_DELIVERED`,
   `isBackendSubmitTxAbandoned`) and `useLeverageYieldDetailedStatus` "(or generalize
   `useDetailedStatus` to take a feature)". A shared core has 2 callers today and 3 in the filed
   backlog — and a hard ceiling of 3 (`ConfigService.ts:502/506/512`).
2. **The block revision 1 planned to copy is already the second copy.**
   `SwapService.ts:533-539` says so in a comment ("Same envelope, attribution and delivery guards
   `pollForExecutedPacket` applies"), duplicating `IntentRelayApiService.ts:412-426`. And the
   `backendAnswered` rule is already written twice inside `SwapService.ts` alone — `:423`
   (comment at `:418`: "Same reading as `getDetailedStatus`") and `:477`. Bridge would be the
   third copy, #452 the fourth. Hence the one narrow extraction in § Step 2a.
3. **A design bug that reintroduced the defect this issue exists to fix.**
   `GET /swaps/submit-tx/status` carries **no** `@RequireApiKey`; `GET /bridge/submit-tx/status`
   carries `@RequireApiKey('bridge:read')` (`bridge.controller.ts:219`). So on bridge a rejected
   key → `record.ok === false` with `context.status` 401 → `backendAnswered === false` →
   `DETAILED_STATUS_NOT_DELIVERED` never set → the new hook polls every 3s forever, with the 401
   invisible because the outer `LOOKUP_FAILED` wraps the *relay* error as cause. Swap cannot hit
   this; bridge can. Fixed by the arm-1 auth branch in § Step 2c, following the repo's own
   precedent at `pollBackendSubmitTx.ts:105`.

### Compile-level defects (all verified by hand)

4. Re-declaring `DETAILED_STATUS_NOT_DELIVERED` in `bridge/detailedStatus.ts` → ambiguous star
   export: `sdk/src/index.ts:5` and `:8` are both flat `export *` over the swap and bridge
   barrels, and `swap/index.ts:11` already exports it.
5. `PacketData` is in `@sodax/sdk` (`shared/types/relay-types.ts:24`), **not** `@sodax/types`
   (which has only `PacketDataV2`, `backendApiV2.ts:665`). Revision 1's snippet showed no import
   line and implied swap's single `@sodax/types` import would do.
6. `useDetailedStatus` is already exported from `hooks/swap/index.ts:4`, and `hooks/index.ts`
   flat-exports both `swap/` and `bridge/` → the bridge hook must be `useBridgeDetailedStatus`.
7. `DetailedStatusError` is swap's unprefixed alias (`swap/errors.ts:24,:43`), already imported
   by dapp-kit under that name → a bridge twin collides; use a prefixed alias.

### Wrong public claims it would have shipped

8. `dstTxHash` documented as the destination chain — see § Semantic note above. Arm 2 proves the
   deposit reached the **hub**, and for hub-source rows the field is a destination *spoke* tx.
   No hoisted field name is true in both directions.
9. "Arm 1 already answers where it landed" — `dstIntentTxHash` is required only inside the
   optional `result?`, "present when executed" (`backendBridgeApiV2.ts:223-224`,
   `bridgeApiSchemas.ts:114`). Pending/relaying/abandoned records carry no hash.

### Execution defects

10. **Wrong template for Step 1.** `useLeverageYieldApiSubmitTxStatus.ts` already contains all
    four changes verbatim, including the exact `@remarks` sentence revision 1 proposed to author
    (`:2`, `:4`, `:30`, `:48`, `:51`). `leverageYieldApi/` has 32 files on the helper and zero on
    `retry: 3` — bridge is the last feature, not the second.
11. **The dapp-kit reusability table contradicted itself.** `advanceNotFoundStreak` and
    `nextNotFoundStreak` are typed on `SwapStatusResult`, i.e. as solver-coupled as the
    `toNotFoundBudgetRead` the plan rejected. "Sibling is the smaller diff" was also backwards:
    the module is package-internal with two consumers and its own test file, so parameterizing is
    ~8 lines while a sibling re-copies the streak machinery. Moot now — arm 2 is terminal by
    construction, so bridge needs no streak at all and that module is untouched.
12. `hooks/bridge/` already exists with five `sodax.bridge.*` hooks; revision 1 framed a settled
    convention as an open question, and its stated reason was inverted.
13. `BRIDGE_API.md` is in `docs-pages-map.json`'s **`unpublished`** array (`:5-14`, line 9), not
    "the map's flat list". Per `:3`, editing it is not a Docs Drift signal — no sync output.
14. `SWAPS.md` headings are at `:1066` / `:1081`, not `:1061` / `:1075`.
15. "19 test cases" → 13. `detailedStatus.test.ts` (2 cases) was never mentioned and is the
    cheapest proof that widening `isBackendSubmitTxAbandoned` is safe.
16. The `#451` fixture-harvest suggestion was this plan's own inference. #451's body is one
    sentence and mentions no fixture.
17. Do not propagate the stale "SwapsApiService and BridgeApiService both satisfy it" comments
    (`runBackendSubmitTx.ts:7-9`, `SwapService.ts:869`, `BridgeService.ts:622`) into `BRIDGE.md`
    — leverage-yield is a live third caller and only `LeverageYieldService.ts:1342` says so.
18. `backendApi/index.ts` is a **curated** barrel (25 lines; `pollBackendSubmitTx` deliberately
    absent). The new shared module must not be added to it.
19. Revision 1 scheduled the docs while leaving the arm-2 union — the contract everything else
    waits on — as an open question. The corrected plan settles the contract in Step 2b, before
    the router and before the docs.

## Changes During Work

None. No file in any `icon-project` repo has been modified; both sessions were read-only.
Next session starts at `plan.md` § Step 1.

## Open questions

Revision 1's questions 2, 3 and 4 are now closed in source (arm-2 shape, hook name/location, and
the refetch-policy question, which the terminal-by-construction finding deletes). Remaining:

1. **Enforcement mode for bridge-api** — `@RequireApiKey` rejects only in `mode === 'enforce'`;
   under `monitor`/`off` a bad key still returns 200. Not stated in source for bridge-api (the
   swaps controller says enforcement is not yet on for *its* deployment). Affects only how
   visible Step 1 and the arm-1 auth branch are in practice, not whether they are correct.
2. **Whether swap should get the same arm-1 auth branch.** Its route is unguarded today, so the
   bug is latent, not live. Raise in the PR thread; belongs to #452, not here.
3. **Unverifiable from source:** whether `api.sodax.com/v1/relay` (a public HAProxy edge; the
   backend deliberately bypasses it via `RELAY_URL` → origin `xcall-relay.nw.iconblockchain.xyz`,
   `sodax-backend packages/shared-utils/src/constants.ts:38-51`) keeps accepting unauthenticated
   reads. Swap's shipped router already depends on it, so bridge adds no new exposure.
</content>
