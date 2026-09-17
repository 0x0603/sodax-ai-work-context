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

## Semantic note on `dst_tx_hash`

For swaps the relay's "dst" is the **hub** (`SwapService.ts:569` assigns it to `hubTxHash`, then
the solver leg follows). For bridge the same field is the **destination chain**
(`BridgeService.ts:604` → `dstChainTxHash`), and `sodax-backend`
`tasks/submit-bridge-txs/submit-bridge-txs.task.ts:307` agrees: "dstIntentTxHash is therefore
always the packet's destination hash". Same field, different meaning per feature — say so in
`BRIDGE.md` so nobody reads swap's docs onto bridge.

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
| unit tests | `SwapService.test.ts:1954-2322` (19 cases) + `useDetailedStatus.test.ts` | ~565 |
| e2e | `packages/sdk/src/e2e-tests/detailedStatus.e2e.test.ts` | 50 |

Bridge's version is smaller: no solver leg (−63 lines of `resolveSolverStatus`), no
`isHubChainKeyType` short-circuit, no `isHex` validation. Tests and docs are the bulk of the work,
not the method.

There is **no leverage-yield precedent** to reconcile against (`packages/sdk/src/leverageYield/`
has no `detailedStatus.ts`, and no `getDetailedStatus` anywhere under it) — swap is the single
reference, which makes the design cheaper than the hook count suggests.

## Changes During Work

None. No file in any `icon-project` repo was modified in this session; the work was read-only
scoping. Next session starts at `plan.md` § Step 1.

## Open questions

1. **Per-call `apiConfig` on the new SDK method** — add it (bridge already has the surface) or
   match swap's signature exactly? See `plan.md` § Step 2.
2. **Arm-2 payload shape** — raw `PacketData` + `dstTxHash`, or a narrowed bridge-specific view?
3. **Hook name and location** — `hooks/bridge/useDetailedStatus.ts` (mirrors swap) vs
   `hooks/bridgeApi/useBridgeApiDetailedStatus.ts` (mirrors the bridge folder).
4. **Generalise `getSwapStatusRefetchInterval` or write a bridge sibling?** Sibling is the smaller
   diff; generalising avoids a third copy when leverage-yield eventually wants one.
5. **Unverifiable from source:** whether `api.sodax.com/v1/relay` (a public HAProxy edge; the
   backend deliberately bypasses it via `RELAY_URL` → origin `xcall-relay.nw.iconblockchain.xyz`,
   see `sodax-backend packages/shared-utils/src/constants.ts:38-51`) will keep accepting
   unauthenticated reads. Swap already depends on it in production, so bridge adds no new
   exposure. Confirm with a live call only if the relay leg starts 401ing.
</content>
