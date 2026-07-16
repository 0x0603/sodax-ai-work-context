# P3 Implementation Blueprint — bridge-api (standalone app, port 3009, backend `@sodax/sdk` rc.18)

Consolidated, code-ready plan derived from the 4 reader specs. Four sections: **Admin**, **Tests**, **Infra**, **Docs**. Everything is a relay-only bridge port of the swaps analog. P1 (scaffold + 5 discovery/build routes) and P2 (submit-tx insert/status + relay-only drainer/alerter/heartbeat) are already committed; `SubmitBridgeTxDbService` (findOrUpsert/exists/getSubmitTxStatus/getToProcess/claimForProcessing/updateStatus/getNewlySaturated/markAbandoned/getAbandonedUnalerted/markGivenUpAlerted/findByKey) and `relayBridgeTx` exist.

---

## Build order (do sections in this order)

1. **Infra first** (independent of app code; unblocks `make run-dev-bridge-api` and CI wiring). No app-source coupling.
2. **Admin** (adds 3 db-service methods + 5 new files + 2 modifications). Depends only on already-committed bridge pieces.
3. **Tests** (exercises P2 pipeline + the new Admin db methods once Admin lands). Do the db-service `markManuallyExecuted`/`markAddressed`/`unmarkAddressed` tests only after Admin's db edit is in.
4. **Docs last** (documents the union of P1/P2/P3; reflects the now-wired admin surface — flip the "no `/admin/bridge/*` yet" open-item to "wired").

Rationale: Docs' "Open items" list ("NO bridge admin endpoints wired yet") must be reconciled against the Admin section landing in the same P3 — see the **cross-section reconciliation** note at the end.

---

## Section 1 — Admin surface (relay-only `/admin/bridge`)

Port `apps/swaps-api/src/api/admin/*` into bridge-api, guarded by `AdminTokenGuard` (bearer) only — **NOT** `IPGuard`. Two endpoints: `POST relay` (manual recovery of an ABANDONED row) and `POST mark-addressed` (operator triage toggle). The swaps deadline / Situation-A/B / relay-for-refund / posted_to_solver / getStatus machinery is **DROPPED** — bridge is relay-only, so `manualRelay` collapses to a synchronous **4-outcome verdict**.

### 🚩 FLAG — the manual-relay outcome quartet

```
executed          → relay packet received AND the guarded terminal write landed (status → executed)
already_executed  → row was, or concurrently became, executed; left untouched
not_abandoned     → drainer still owns it — manual relay is only for given-up/abandoned rows
incomplete        → relay packet not found — row left abandoned & re-runnable; `error` carries specifics
```
Collapses swaps' 7 outcomes (`posted_to_solver|solved|relayed_for_refund|refund_in_progress|already_solved|not_abandoned|incomplete`, `manual-relay.dto.ts:37-45`). Mapping: `solved→executed`, `already_solved→already_executed`. Evidence: `swaps-admin.service.ts:87-266`.

### File-by-file

**1.1 `apps/bridge-api/src/api/admin/bridge-admin.controller.ts` — CREATE**
Mirror `swaps-admin.controller.ts:1-68` verbatim, swap swaps→bridge names.
- Header: `@ApiExcludeController()` `@Controller('admin/bridge')` `@UseGuards(AdminTokenGuard)` (`controller.ts:25-27`).
- Imports: `AdminTokenGuard` from `'../../shared/guards/bearer.guard'` (identical relative depth), `handleErrorAsHttpException` from `'@repo/shared-utils'`, the two bridge DTOs + `BridgeAdminService`.
- `private readonly logger = new Logger(BridgeAdminController.name)`; ctor `constructor(private readonly bridgeAdminService: BridgeAdminService){}`.
- Endpoint 1 (`controller.ts:33-46`): `@Post('relay') @Header('Cache-Control','no-store') @HttpCode(HttpStatus.OK) async manualRelay(@Body() body: ManualRelayRequestDto): Promise<ManualRelayResponseDto>` → try `return await this.bridgeAdminService.manualRelay(body.txHash, body.srcChainKey)` catch → `handleErrorAsHttpException(this.logger, \`Failed to manually relay submit-bridge-tx ${body.txHash} (${body.srcChainKey})\`, error)`.
- Endpoint 2 (`controller.ts:48-67`): `@Post('mark-addressed')` same decorators, `async markAddressed(@Body() body: MarkAddressedRequestDto): Promise<MarkAddressedResponseDto>` → try `return await this.bridgeAdminService.markAddressed(body.txHash, body.srcChainKey, body.addressed, body.addressedBy, body.addressedReason)` catch → `handleErrorAsHttpException` with `Failed to mark submit-bridge-tx ${body.txHash} (${body.srcChainKey}) addressed=${body.addressed}`.
- Doc-comment adapted from `controller.ts:9-24`: mounted at `/admin/bridge`, AdminTokenGuard-only (dashboard reaches it over internal network, no HAProxy `X-Real-IP`; bearer is the authoritative gate), `@ApiExcludeController` belt-and-suspenders because `main.ts:66` already builds Swagger with `include:[BridgeModule]`.

**1.2 `apps/bridge-api/src/api/admin/bridge-admin.service.ts` — CREATE**
Adapt `swaps-admin.service.ts:42-345`, **DROPPING** deadline/Situation-A/B/relay-for-refund/refund_in_progress/posted_to_solver/postExecution (service.ts:93-266 reduces to the quartet).
- Imports: `{Inject, Injectable, Logger}` (`@nestjs/common`); `NotFoundError` (`@repo/shared-utils`); `{Sodax, SpokeChainKey}` (`@sodax/sdk`); `IPacketDataDomain`, `ISubmitBridgeTx`, `SubmitBridgeTxStatus` from `'../../bridge/types/submit-bridge-tx'`; `SODAX` from `'../../../shared/providers/sodax.provider'`; `formatResultError` from `'../../../shared/utils/utils'` (utils.ts:21); `MANUAL_RELAY_OBSERVE_TIMEOUT_MS` from `'../../../tasks/submit-bridge-txs/constants'` (NEW — see 1.7); `relayBridgeTx` from `'../../bridge/relay-bridge-tx'`; `SubmitBridgeTxDbService` from `'../../bridge/submit-bridge-tx-db.service'`; DTO types.
- Module const `DEFAULT_ADDRESSED_BY='admin-api'` (service.ts:17).
- `@Injectable() class BridgeAdminService` + logger + ctor `constructor(private readonly submitBridgeTxDbService: SubmitBridgeTxDbService, @Inject(SODAX) private readonly sodax: Sodax){}` (service.ts:46-49).

`manualRelay(txHash, srcChainKey): Promise<ManualRelayResponseDto>` — no `relayForManual` helper (single call site):
1. `const row = await this.submitBridgeTxDbService.findByKey(txHash, srcChainKey); if(!row) throw new NotFoundError(...)` (service.ts:88-91).
2. local `respond(outcome, status, message, extra={})` returning `{ok:true, txHash, srcChainKey, outcome, status, message, ...extra}` — adapt service.ts:95-109 but **DROP the `deadline` field**.
3. `if(row.status==='executed')` → `respond('already_executed', row.status, 'Bridge already executed — nothing to recover.', { dstIntentTxHash: row.result?.dstIntentTxHash })` (analog service.ts:111-117).
4. `if(!row.abandonedAt)` → `respond('not_abandoned', row.status, 'Bridge is not abandoned — the drainer is still processing it, so no manual relay is needed.')` (analog service.ts:121-128).
5. Relay step: `this.logger.log('Manual relay started ...actor=admin-api'); const relayResult = await relayBridgeTx(row, this.sodax, MANUAL_RELAY_OBSERVE_TIMEOUT_MS);` — `relayBridgeTx` takes the `ISubmitBridgeTx` row DIRECTLY (relay-bridge-tx.ts:27), no shaping.
6. `!relayResult.ok`: `const error = formatResultError(relayResult.error.error); this.logger.warn('...found no packet: '+error+' — left abandoned'); return respond('incomplete', row.status, 'Relay packet was not received — the bridge was left abandoned. Try again later.', { error });` (analog service.ts:206-209).
7. `ok`: `const [dstIntentTxHash, packetData] = relayResult.value; const result = { dstIntentTxHash, packetData: packetData as IPacketDataDomain | undefined }; const persisted = await this.submitBridgeTxDbService.markManuallyExecuted(txHash, srcChainKey, result);` (cast mirrors drainer submit-bridge-txs.task.ts:285-288). `if(!persisted)` → `respond('already_executed', 'executed', 'Bridge had already been executed — left as executed.', { dstIntentTxHash })` (analog service.ts:249-255). Else `respond('executed', 'executed', 'Bridge relayed and executed — the destination packet landed.', { dstIntentTxHash })`.

`markAddressed(txHash, srcChainKey, addressed, addressedBy?, reason?)` — **copy swaps service.ts:279-327 VERBATIM** (pipeline-agnostic): findByKey→404; `const actor = addressedBy?.trim() || DEFAULT_ADDRESSED_BY`; respond closure `{ok:true, txHash, srcChainKey, addressed: isAddressed, outcome, message}`; `addressed=true`: `!row.abandonedAt`→`not_abandoned`/`false`/'Bridge is not abandoned — only given-up bridges can be marked addressed.'; `row.addressedAt`→`no_change`/`true`/'Bridge was already marked addressed — left untouched.'; else `markAddressed(...)` → `addressed`/`true`/'Bridge marked addressed — removed from Active Bridges.' or `concurrentNoChange(...)`; `addressed=false`: `!row.addressedAt`→`no_change`/`false`; else `unmarkAddressed(...)` → `unaddressed`/`false`/'Bridge un-addressed — returned to Active Bridges.' or `concurrentNoChange(...)`.

`private concurrentNoChange(txHash, srcChainKey)` — copy service.ts:331-344 verbatim (re-read via findByKey, return `no_change` with `addressed: !!fresh?.addressedAt`).

Doc-comments: relay-only bridge (drop solver/postExecution/deadline/refund/drainer-handoff refs).

**1.3 `apps/bridge-api/src/api/admin/bridge-admin.module.ts` — CREATE**
Mirror `swaps-admin.module.ts:1-16`:
```ts
import { Module } from '@nestjs/common';
import { BridgeModule } from '../bridge/bridge.module';
import { BridgeAdminController } from './bridge-admin.controller';
import { BridgeAdminService } from './bridge-admin.service';

@Module({ imports:[BridgeModule], controllers:[BridgeAdminController], providers:[BridgeAdminService] })
export class BridgeAdminModule {}
```
`BridgeModule` already exports `SubmitBridgeTxDbService + SODAX` (bridge.module.ts:28) → both inject with no re-registration; no `MongooseModule.forFeature`/`sodaxProvider`.

**1.4 `apps/bridge-api/src/api/admin/dto/manual-relay.dto.ts` — CREATE**
Adapt `manual-relay.dto.ts:1-95`, collapsing 7→4 outcomes.
- Imports: `{ApiProperty, ApiPropertyOptional}` (`@nestjs/swagger`); `{CHAIN_KEYS, SpokeChainKey}` (`@sodax/sdk`); `BridgeSubmitTxKeyDto` from `'../../bridge/dto/submit-bridge-tx-key.dto'`; `SubmitBridgeTxStatusValues` from `'../../bridge/schemas/stateful-submit-bridge-tx.schema'` (schema.ts:16); `SubmitBridgeTxStatus` from `'../../bridge/types/submit-bridge-tx'`.
- `export class ManualRelayRequestDto extends BridgeSubmitTxKeyDto {}` (dto.ts:8).
- `export const MANUAL_RELAY_OUTCOMES = ['executed','already_executed','not_abandoned','incomplete'] as const; export type ManualRelayOutcome = (typeof MANUAL_RELAY_OUTCOMES)[number];` + doc-comment describing each (see quartet above).
- `export class ManualRelayResponseDto`: `ok!: boolean`; `txHash!: string`; `srcChainKey!: SpokeChainKey` (`@ApiProperty({enum: Object.values(CHAIN_KEYS)})`); `outcome!: ManualRelayOutcome` (`@ApiProperty({enum: MANUAL_RELAY_OUTCOMES, example:'executed'})`); `status!: SubmitBridgeTxStatus` (`@ApiProperty({enum: SubmitBridgeTxStatusValues, example:'executed'})`); `dstIntentTxHash?: string` (`@ApiPropertyOptional`); `error?: string` (`@ApiPropertyOptional`); `message!: string`.
- **DROP swaps `deadline` and `intentHash`** (no intent deadline, no solver in relay-only bridge).

**1.5 `apps/bridge-api/src/api/admin/dto/mark-addressed.dto.ts` — CREATE**
Copy `mark-addressed.dto.ts:1-76` almost verbatim.
- Imports: `{ApiProperty, ApiPropertyOptional}`; `{CHAIN_KEYS, SpokeChainKey}`; `{Transform, Type}` (`class-transformer`); `{IsBoolean, IsOptional, IsString, MaxLength}` (`class-validator`); `toStrictBoolean` from `'../../../shared/validation/strict-boolean'` (exists in bridge-api, verified); `BridgeSubmitTxKeyDto`.
- `export class MarkAddressedRequestDto extends BridgeSubmitTxKeyDto` with `addressed` decorated `@Type(()=>String) @Transform(toStrictBoolean) @IsBoolean()` (the `Boolean('false')===true` trap, dto.ts:20-23); optional `addressedBy` (`@IsOptional() @IsString() @MaxLength(127)`) and `addressedReason` (`@IsOptional() @IsString() @MaxLength(512)`).
- `export type MarkAddressedOutcome = 'addressed' | 'unaddressed' | 'not_abandoned' | 'no_change';`
- `export class MarkAddressedResponseDto`: `ok!`, `txHash!`, `srcChainKey!` (enum CHAIN_KEYS), `addressed!: boolean`, `outcome!: MarkAddressedOutcome` (`@ApiProperty({enum:['addressed','unaddressed','not_abandoned','no_change']})`), `message!: string`.
- Reword doc-comments Active Swaps → Active Bridges.

**1.6 `apps/bridge-api/src/api/bridge/submit-bridge-tx-db.service.ts` — MODIFY** (append after `findByKey` at ~db.service.ts:248)

### 🚩 FLAG — three db-service additions (the task named only two)

**(A) `markAddressed` + (B) `unmarkAddressed`** — mirror `swaps submit-tx-db.service.ts:547-568` VERBATIM against `submitBridgeTxModel`:
```ts
async markAddressed(txHash: string, srcChainKey: SpokeChainKey, addressedBy: string, addressedReason?: string): Promise<boolean> {
  const result = await this.submitBridgeTxModel.updateOne(
    { txHash, srcChainKey, abandonedAt:{$exists:true}, addressedAt:{$exists:false} },
    { $set:{ addressedAt:new Date(), addressedBy, ...(addressedReason?{addressedReason}:{}) } });
  return result.matchedCount > 0;
}
async unmarkAddressed(txHash: string, srcChainKey: SpokeChainKey): Promise<boolean> {
  const result = await this.submitBridgeTxModel.updateOne(
    { txHash, srcChainKey, addressedAt:{$exists:true} },
    { $unset:{ addressedAt:'', addressedBy:'', addressedReason:'' } });
  return result.modifiedCount > 0;
}
```

**(C) `markManuallyExecuted`** — NEW guarded TERMINAL write (analog: swaps `markManuallyPostedToSolver` submit-tx-db.service.ts:218-247, but terminal not drainer-handoff):
```ts
async markManuallyExecuted(txHash: string, srcChainKey: SpokeChainKey, result: ISubmitBridgeTxResult): Promise<boolean> {
  const res = await this.submitBridgeTxModel.updateOne(
    { txHash, srcChainKey, status: NON_TERMINAL_SUCCESS_FILTER },
    { $set: { status: 'executed', result },
      $unset: { abandonedAt:'', alertedAt:'', addressedAt:'', addressedBy:'', addressedReason:'', failedAtStep:'', failureReason:'', lastAttemptAt:'' } });
  return res.matchedCount > 0;
}
```
Reuse the existing module const `NON_TERMINAL_SUCCESS_FILTER` (`{$ne:'executed'}`, db.service.ts:29) as the concurrency guard (matchedCount 0 → caller reports `already_executed`).

**Why (C) is required (gotcha):** the existing `updateStatus('executed')` (db.service.ts:187-191) filters `abandonedAt:{$exists:false}` — which **excludes** the abandoned rows the manual path targets — AND returns `void` (no concurrency signal). The task phrasing "`updateStatus('executed') guarded`" therefore cannot be satisfied by `updateStatus`; `markManuallyExecuted` gates on `status` (`$ne executed`) ONLY, not `abandonedAt` (the row IS abandoned), and clears the whole abandonment family (`abandonedAt`/`alertedAt`/`addressedAt`/`addressedBy`/`addressedReason`, honoring addressed ⊂ abandoned) + failure fields. Reviewer note: an alternative is to KEEP `abandonedAt` for audit (executed is inert to drainer/alerter), but clearing gives the dashboard a clean terminal row.

**1.7 `apps/bridge-api/src/tasks/submit-bridge-txs/constants.ts` — MODIFY**
Append `export const MANUAL_RELAY_OBSERVE_TIMEOUT_MS = 25 * 1000;` (name identical to swaps analog constants.ts:72). Doc-comment: relay-poll ceiling for `POST /admin/bridge/relay`; shorter than drainer `DEFAULT_RELAY_TX_TIMEOUT` (~120s) because SYNCHRONOUS (operator holds an open request); if packet unseen in-window the row is left abandoned and the operator retries (`submitIntent` idempotent, relay-bridge-tx.ts:19-20). Lives alongside `BRIDGE_TX_SUBMIT_INTENT_TIMEOUT_MS` (constants.ts:13).

**1.8 `apps/bridge-api/src/app.module.ts` — MODIFY**
Add `import { BridgeAdminModule } from './api/admin/bridge-admin.module';` near the `BridgeModule` import (app.module.ts:13), and insert `BridgeAdminModule,` immediately after `BridgeModule,` in the `@Module` imports array (app.module.ts:29) — mirroring swaps `app.module.ts:30-31`. No other wiring.

### Admin gotchas
- Guard is `AdminTokenGuard` **ONLY** — do NOT add `IPGuard` (health.controller.ts:78 pairs both, but the dashboard reaches `/admin/bridge` over the internal network with no HAProxy `X-Real-IP`, so IPGuard would reject). `AdminTokenGuard` reads `ADMIN_ACCESS_TOKENS` (bearer.guard.ts:3,34).
- `relayBridgeTx` defensively returns `ok` with `packetData` undefined for hub-origin source (relay-bridge-tx.ts:92-93). An abandoned hub-origin row → marked executed with `dstIntentTxHash=txHash`, no packetData — matches drainer behavior (submit-bridge-txs.task.ts:284-289); rare, acceptable.
- `NotFoundError` → 404 via `handleErrorAsHttpException` in the controller catch, same as swaps.

**Verification:** `pnpm --filter bridge-api exec tsc --noEmit` (checkTs) → `pnpm --filter bridge-api lint` → `pnpm --filter bridge-api test`.

---

## Section 2 — Test harness (unit + e2e)

The harness already exists 1:1 with swaps: `vitest.config.ts` (unit), `vitest.e2e.config.ts` (e2e, carries temporary `passWithNoTests: true` at line 11), `test/vitest.setup.ts` (mocks `@repo/shared-utils` buildMongoConfig/buildStatefulMongoConfig). `@repo/shared-test-utils` exposes `createTestMongoServer()` (test-utils.ts:33). This section is purely adding test files.

### 🚩 FLAG — mongodb-memory-server + `@nestjs/testing` setup snippet (db spec)
Bridge injects its model on `STATEFUL_CONNECTION_NAME` (db.service.ts:48-51). No IntentJournal (relay-only). Default `forRoot` kept for prod-split parity only.
```ts
import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { createTestMongoServer } from '@repo/shared-test-utils';
import { MAX_SWAP_TX_RETRIES, STATEFUL_CONNECTION_NAME, SWAP_TX_RETRY_BACKOFF_MS } from '@repo/shared-utils';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { Model } from 'mongoose';
import { StatefulSubmitBridgeTx, StatefulSubmitBridgeTxDocument, StatefulSubmitBridgeTxSchema }
  from 'src/api/bridge/schemas/stateful-submit-bridge-tx.schema';
import { SubmitBridgeTxDbService } from 'src/api/bridge/submit-bridge-tx-db.service';

beforeAll(async () => {
  mongod = await createTestMongoServer();
  module = await Test.createTestingModule({
    imports: [
      MongooseModule.forRoot(mongod.getUri()),
      MongooseModule.forRoot(mongod.getUri(), { connectionName: STATEFUL_CONNECTION_NAME }),
      MongooseModule.forFeature(
        [{ name: StatefulSubmitBridgeTx.name, schema: StatefulSubmitBridgeTxSchema }],
        STATEFUL_CONNECTION_NAME),
    ],
    providers: [SubmitBridgeTxDbService],
  }).compile();
  dbService = module.get(SubmitBridgeTxDbService);
  model = module.get<Model<StatefulSubmitBridgeTxDocument>>(
    getModelToken(StatefulSubmitBridgeTx.name, STATEFUL_CONNECTION_NAME));
});
afterAll(async () => { await module?.close(); await mongod?.stop(); });
beforeEach(async () => { await model.deleteMany({}); });
```

### 🚩 GOTCHA — where the DI (mongo-mem) spec must live
`vitest.config.ts` uses `swc.vite({ module:{type:'es6'} })` (no decorator metadata); `vitest.e2e.config.ts` enables `legacyDecorator+decoratorMetadata`. The DI spec needs `@Injectable/@InjectModel` metadata. **RECOMMENDATION: place the mongo-mem db spec at `test/e2e/submit-bridge-tx.db.e2e-spec.ts`** (matching swaps' `submit-swap-tx.db.e2e-spec.ts`, which is e2e for exactly this reason), and keep only pure-fn specs under `test/unit/`. Confirm by running the suite. (Filename hint in the reader said `unit/submit-bridge-tx-db.service.spec.ts` — override it per this gotcha unless you verify the unit swc config emits enough metadata for `getModelToken` resolution.)

### File-by-file

**2.1 `apps/bridge-api/test/fixtures/bridge-tx.fixtures.ts` — CREATE**
Bridge analog of `swap-tx.fixtures.ts:18-29`. Bridge has NO `intent`; `relayData` is an OBJECT (types:23-26, schema requires `address`+`payload` matching HEX_REGEX), not a Hex string.
```ts
export const MOCK_RELAY_DATA = { address: '0x1111111111111111111111111111111111111111', payload: '0xdeadbeef' };
export function makeBridgeTxDoc(overrides: Record<string, unknown> = {}) {
  return { txHash:'0xabc123', srcChainKey:'sonic', walletAddress:'0x1111111111111111111111111111111111111111',
    relayData: MOCK_RELAY_DATA, status:'pending', processingAttempts:0, ...overrides };
}
```
`relayData` values must satisfy HEX_REGEX (`/^(?:0x[a-fA-F0-9]*|[a-fA-F0-9]+)$/`, shared-utils constants.ts:16); `''` is invalid (deliberate negative case in the relay spec).

**2.2 `apps/bridge-api/test/e2e/submit-bridge-tx.db.e2e-spec.ts` — CREATE** (relocated from unit per the gotcha above)
Use the setup snippet. Helpers (bridge-scoped, from swaps db spec:26-28):
```ts
import { BRIDGE_TX_ABANDON_GRACE_MS, MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS } from '../../src/tasks/submit-bridge-txs/constants';
const PAST_BACKOFF = () => new Date(Date.now() - SWAP_TX_RETRY_BACKOFF_MS - 1000);
const PAST_GRACE  = () => new Date(Date.now() - BRIDGE_TX_ABANDON_GRACE_MS - 1000); // constants.ts:43
```
Cases (each mirrors a swaps analog, exercising `submit-bridge-tx-db.service.ts`):
1. **findOrUpsertSubmitBridgeTx** (analog submit-tx-db.service.spec.ts:48-95): (a) fresh insert → null + row materialized; (b) same key → returns pre-existing doc, no duplicate; (c) duplicate-key branch → **thin pure-mock micro-describe** (`mockModel.findOneAndUpdate` rejects `{code:11000}` → expect `'duplicate'`, submit-tx-db.service.spec.ts:81-88) to avoid index-race flakiness. dto = `{ txHash, srcChainKey:'sonic', walletAddress, relayData: MOCK_RELAY_DATA }`.
2. **getToProcess** dual gate (analog submit-swap-tx.db.e2e-spec.ts:72-218): pending/relaying/relayed/failed(attempts<MAX, PAST_BACKOFF) all selected; `executed` excluded (status `$in` excludes it, db.service.ts:123); attempts=MAX excluded (cap gate); `lastAttemptAt=now` excluded (backoff gate); abandoned excluded; raw-inserted row missing `processingAttempts`/`lastAttemptAt` (via `model.collection.insertOne`) still selected (`$exists`-OR); respects `MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS`; sorts createdAt asc.
3. **claimForProcessing +1** (analog :220-261): attempts 0→1 + `lastAttemptAt` a Date; monotonic to MAX (crash-safe); raw row w/no counter → `$inc` sets 1.
4. **updateStatus forward branch** (analog :541-605): `'relaying'` preserves failedAtStep/failureReason, never touches counter/lastAttemptAt; terminal `'executed'` clears failedAtStep/failureReason via `$unset` (db.service.ts:188-190) + persists result; forward write never sets abandonedAt. **KEY:** seed non-abandoned `'relayed'` row, call `updateStatus(...,'executed',{result})`, assert status becomes `'executed'` + result set — the forward-branch filter (db.service.ts:191) has NO status guard, only `abandonedAt:{$exists:false}`.
5. **updateStatus failed branch** (analog :607-729): (a) non-transient → counter unchanged, status/failedAtStep/failureReason written; (b) transient → refund one attempt (guarded `$gt:0`; seed 2→1; 0/1→0 never underflows, db.service.ts:179-181); (c) permanentFailure → jumps to `MAX_SWAP_TX_RETRIES` AND backdates `lastAttemptAt` to `new Date(0)` (db.service.ts:176-178) so getNewlySaturated selects it (assert); (d) failed write never touches abandonedAt. **executed-latch guard:** seed `'executed'`, `updateStatus(...,'failed',{permanentFailure:true})` → stays executed, counter not saturated, failureReason unset (`NON_TERMINAL_SUCCESS_FILTER` on failed branch, db.service.ts:170-174). **abandoned-latch guard:** seed abandonedAt+`'relaying'`, failed/executed both rejected (`abandonedAt:{$exists:false}`).
6. **getNewlySaturated grace** (analog :787-857): stale crash-orphan at MAX + PAST_GRACE, not executed/abandoned → included; below cap → excluded; executed at cap → excluded; already-abandoned → excluded; fresh-claim (attempts=MAX, `lastAttemptAt=now`) → excluded by grace gate (the load-bearing MAX-1→MAX overlap guard, db.service.ts:195-208).
7. **markAbandoned/getAbandonedUnalerted/markGivenUpAlerted CAS** (analog :859-924): latch + idempotent (2nd → false, db.service.ts:211-223); no latch below cap; no latch executed; getAbandonedUnalerted returns abandoned-unalerted only; markGivenUpAlerted sets alertedAt (idempotent 2nd → false, db.service.ts:236-242), no-op on non-abandoned.
8. **(OPTIONAL) getSubmitTxStatus static hint** (bridge-specific, db.service.ts:79-110): abandoned → ABANDONED_USER_HINT; failed non-abandoned → FAILED_USER_HINT; healthy `'relaying'` with stale failureReason → hidden (db.service.ts:88-93); genuinely `'failed'` → exposed; missing → null.

> **Cross-section:** once Admin (1.6) lands, extend this spec with `markAddressed`/`unmarkAddressed`/`markManuallyExecuted` cases (copy swaps db-spec describes at submit-tx-db.service.ts flow; assert `markManuallyExecuted` returns false on an already-executed row and clears the abandonment family on a fresh abandoned row).

**2.3 `apps/bridge-api/test/unit/relay-bridge-tx.spec.ts` — CREATE**
Copy the `vi.hoisted` + `vi.mock('@sodax/sdk')` scaffold verbatim from `relay-swap-tx.spec.ts:1-40` (spread `...orig` so `isHubChainKeyType`/`isSolanaChainKeyType`/`isBitcoinChainKeyType` stay GENUINE, stub only `waitUntilIntentExecuted`). `mockSodax = { config:{ getRelayChainIdMap:()=>({ solana:900n, bitcoin:20000n, ethereum:1n }) }, swaps:{ relayerApiEndpoint:'http://localhost', submitIntent: mockSubmitIntent } }`. beforeEach: `mockSubmitIntent.mockResolvedValue({ ok:true, value:{} })`; `mockWaitUntilIntentExecuted.mockResolvedValue({ ok:true, value:{ dst_tx_hash:'0xhubintent' } })`. Call `relayBridgeTx(row as never, mockSodax, DEFAULT_RELAY_TX_TIMEOUT)`.
Cases:
1. **SPLIT-TX** (`it.each(['solana','bitcoin'])`): `payload.action==='submit'`; `payload.params.tx_hash===row.txHash`; **`payload.params.chain_id===relayChainId.toString()`** (bridge includes chain_id, relay-bridge-tx.ts:52/61 — delta from swaps); `payload.params.data` DEEP-EQUALS `{ address: row.relayData.address, payload: row.relayData.payload }` (FULL stored envelope, relay-bridge-tx.ts:53-56, NOT rebuilt from `intent.creator`); `result.ok && result.value[0]==='0xhubintent' && result.value[1]` is the packet.
2. **SINGLE-TX** (`srcChainKey:'ethereum'`): `tx_hash` set, `data` UNDEFINED (relay-bridge-tx.ts:59-62); result.ok.
3. **UNMAPPED-CHAIN**: pass a non-hub spoke ABSENT from the mocked map (`'polygon'`/`'arbitrum'`); `relayChainId==null` → `result.ok===false`, `String(result.error.error)` matches `/No relay chain id mapping/` (relay-bridge-tx.ts:37-39); `mockSubmitIntent` NOT called (gate runs before split/single, :36-46).
4. **(OPTIONAL) relayer-error propagation**: `mockWaitUntilIntentExecuted.mockResolvedValue({ ok:false, error:new Error('RELAY_TIMEOUT') })` → `result.ok===false`, raw Error propagated (relay-bridge-tx.ts:83-86). **Do NOT port** the swaps missing-relayData guard (relayData is required in bridge).

**2.4 `apps/bridge-api/test/unit/is-relay-timeout.spec.ts` — CREATE** (no swaps analog file; replaces the swaps `is-transient-submit-error.spec.ts` focus)
`import { isRelayTimeout, isTransientSubmitError } from '../../src/shared/utils/utils'; import { SodaxError } from '@sodax/sdk';` No mongo/Nest.
`describe('isRelayTimeout')` (utils.ts:14-18): `Error('RELAY_TIMEOUT')`→true; `SodaxError('UNKNOWN','wedged',{feature:'swap',context:{relayCode:'RELAY_TIMEOUT'}})`→true (construct like is-transient-submit-error.spec.ts:167); `Error('RELAY_POLLING_FAILED')`→false; `Error('timed out')`→false; SodaxError w/ `relayCode:'RELAY_POLLING_FAILED'`→false; non-Error→false.
`describe('drainer classification')` — the exact predicate at submit-bridge-txs.task.ts:280, local helper `const classify = (e) => isTransientSubmitError(e) && !isRelayTimeout(e)`:
- `Error('RELAY_TIMEOUT')` → transient TRUE but isRelayTimeout TRUE → **classify FALSE (CONSUME)** — the load-bearing bridge-vs-swaps delta.
- `Error('RELAY_POLLING_FAILED')` → classify TRUE (REFUND).
- `Error('submitIntent timed out after 30000ms')` → classify TRUE (REFUND — withTimeout, constants.ts:13 + utils.ts:205).
- `Error('SUBMIT_TX_FAILED')` → transient FALSE → classify FALSE (CONSUME).
- `Error('503 Service Unavailable')`, `Error('socket hang up ECONNRESET')` → classify TRUE.
- `SodaxError(...relayCode:'RELAY_TIMEOUT')` → classify FALSE.

**2.5 `apps/bridge-api/test/e2e/submit-bridge-tx.task.e2e-spec.ts` — CREATE (OPTIONAL)** (drainer end-to-end; note: distinct filename from the db spec 2.2 — if you prefer one file, keep 2.2 as the db-only spec and add the drainer as a second e2e file)
Scaffold from `submit-swap-txs.task.e2e-spec.ts:1-178`, pipeline-collapsed. `vi.hoisted`+`vi.mock('@sodax/sdk', ...orig, stub waitUntilIntentExecuted)`. Module imports: `forRoot(uri)` + `forRoot(uri,{connectionName:STATEFUL_CONNECTION_NAME})` + `forFeature([StatefulSubmitBridgeTx],STATEFUL_CONNECTION_NAME)` + `forFeature([TaskExecutorHeartbeat])` (default conn) + `EventEmitterModule.forRoot()`. Providers: `SubmitBridgeTxsTask`, `SubmitBridgeTxHeartbeatService`, `SubmitBridgeTxDbService`, `{provide:SchedulerRegistry,useValue:new SchedulerRegistry()}`, `{provide:STATEFUL_LOCK_MANAGER,useValue:mockLocks(tryAcquireModelLease→{release,renew})}` (token from constants.ts:54), `{provide:CustomConfigService,useValue:{submitBridgeTxsTask:{isEnabled:false,intervalMs:60_000}}}`, `{provide:SODAX,useValue:mockSodax({config:{getRelayChainIdMap:()=>({ethereum:1n})},swaps:{relayerApiEndpoint:'http://localhost',submitIntent:mockSubmitIntent}})}`. `await module.init()` in beforeAll (registers `@OnEvent`). beforeEach: `model.deleteMany`, `vi.clearAllMocks`, `mockSubmitIntent→{ok:true,value:{}}`, reset task private `shuttingDown`/`pendingKick`.
Cases:
1. **HAPPY PATH**: seed `makeBridgeTxDoc({srcChainKey:'ethereum'})`; `mockWaitUntilIntentExecuted→{ok:true,value:{dst_tx_hash:'0xhub'}}`; `await task.tick()`; assert `status='executed'`, `result.dstIntentTxHash='0xhub'`, `processingAttempts=1`, failedAtStep/failureReason undefined.
2. **SATURATE→ABANDON** (headline): stub relay to always time out (`{ok:false,error:new Error('RELAY_TIMEOUT')}`). Loop `MAX_SWAP_TX_RETRIES` ticks, clearing backoff between ticks (`model.updateOne({txHash},{$set:{lastAttemptAt:new Date(0)}})`, submit-swap-txs.task.e2e-spec.ts:347). RELAY_TIMEOUT consumes (non-transient at task.ts:280, counter unchanged from claim +1). After MAX ticks: `processingAttempts===MAX_SWAP_TX_RETRIES`, `status='failed'`, `failedAtStep='relaying'`, abandonedAt undefined, getToProcess no longer returns it (cap gate). Then age: `lastAttemptAt: PAST_GRACE()`; assert `getNewlySaturated(50)` returns it; `markAbandoned`→true + latched; 2nd `markAbandoned`→false (CAS). (Optionally wire `SubmitBridgeTxAlerterTask`+IncidentManagerModule and assert ONE `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP` incident + `alertedAt` latched — keep optional to avoid incident-manager wiring.)
3. **(OPTIONAL) refund contrast**: stub `Error('RELAY_POLLING_FAILED')` → after a tick `processingAttempts` refunds to 0 (classify TRUE), row stays retryable.

**2.6 `apps/bridge-api/vitest.e2e.config.ts` — MODIFY**
Delete `passWithNoTests: true,` (line 11) + its two-line comment (lines 9-10). After removal, byte-identical to `apps/swaps-api/vitest.e2e.config.ts`. **ONLY do this together with creating at least one `test/e2e/*.e2e-spec.ts`** — otherwise `pnpm --filter bridge-api test:e2e` fails on empty match. If e2e specs are deferred, leave this file untouched.

### Test gotchas
- Duplicate-key branch: pure-mock micro-describe, not a real index race.
- `permanentFailure` backdates `lastAttemptAt` to `new Date(0)` (not PAST_GRACE); compare against `PAST_GRACE().getTime()` with `lessThan` (submit-swap-tx.db.e2e-spec.ts:656).
- getNewlySaturated grace gate is load-bearing: fresh-claim row (attempts=MAX, `lastAttemptAt≈now`) MUST be excluded — always seed `lastAttemptAt` explicitly.
- Spread `...orig` in `vi.mock('@sodax/sdk')` so class identity (SodaxError, `isHubChainKeyType`, etc.) stays genuine; stub only `waitUntilIntentExecuted`.
- Unmapped-chain: pick a plain EVM spoke (`'polygon'`/`'arbitrum'`) absent from the mocked map; cast row `as never`.

**Verification:** `pnpm --filter bridge-api test` (unit) → `pnpm --filter bridge-api test:e2e` (e2e) → `tsc --noEmit` + `lint`.

---

## Section 3 — Infra wiring (new deployable app, port 3009, Option A)

`apps/bridge-api` already exists as a complete NestJS app but has NO infra wiring. Env contract (config/configuration.ts): `BRIDGE_API_PORT` (default 3009, :23), `RUN_BRIDGE_API` (default true, :28), `RUN_SUBMIT_BRIDGE_TXS_TASK` (default false, :33), `SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS` (:34-35), `RPC_CONFIG` (:44), `ADMIN_ACCESS_TOKENS` (:50), `ALLOWED_IPS` (:46), `MONGO_URI` + `STATEFUL_MONGO_URI/DB`. **Does NOT read `SOLVER_CONFIG`** (grep-confirmed — the one swaps env to drop). Health route `/healthz/live` exists (health.controller.ts:57). No monitoring-service source edit needed. All paths absolute under `/Users/sangnguyen/Documents/GitHub/sodax/sodax-backend/`.

### 🚩 FLAG — exact infra insertions

**3.1 `Dockerfile` — MODIFY** — INSERT AFTER line 93 (after swaps-api CMD, before Dashboard stage at :95). Swaps analog Dockerfile:85-93:
```dockerfile
# ---- Bridge API image (final) ----
FROM base AS bridge-api
COPY ./apps/bridge-api ./apps/bridge-api
RUN pnpm --filter bridge-api install --frozen-lockfile
RUN pnpm --filter bridge-api run build
# Running-commit stamp for /healthz (see the `api` stage for the Coolify SOURCE_COMMIT note).
ARG SOURCE_COMMIT=unknown
ENV GIT_SHA=${SOURCE_COMMIT}
CMD ["pnpm", "--filter", "bridge-api", "run", "start:prod"]
```

**3.2 `docker-compose.yml` — MODIFY** — INSERT AFTER line 224 (before `sodax-data-aggregator:` at :226). Swaps analog :185-224. Same anchors `<<: [*global-env, *api-cache-env]`; rename SWAPS→BRIDGE on the 4 flag vars; **DROP `SOLVER_CONFIG` (compose :206)**:
```yaml
  sodax-bridge-api:
    build:
      context: .
      dockerfile: Dockerfile
      target: bridge-api
    environment:
      <<: [*global-env, *api-cache-env]
      MONGO_URI: ${MONGO_URI}
      # Shared stateful DB (#826) for stateful_submit_bridge_tx_v2. Unset → falls back to MONGO_URI
      # (no-op). Use a URI with directConnection=true against the remote single-node replica set.
      # ⚠️ Sharing this queue makes RUN_SUBMIT_BRIDGE_TXS_TASK=true safe on EXACTLY ONE deployment.
      # Multi-deployment draining is GATED on #837: the drainer lease still lives on each
      # deployment's LOCAL `locks` (LockManagerService), so two enabled drainers against the shared
      # queue would each take a local lease and double-drain. Keep it single-deployment until #837.
      STATEFUL_MONGO_URI: ${STATEFUL_MONGO_URI:-}
      STATEFUL_MONGO_DB: ${STATEFUL_MONGO_DB:-}
      BRIDGE_API_PORT: ${BRIDGE_API_PORT}
      RUN_BRIDGE_API: ${RUN_BRIDGE_API}
      RUN_SUBMIT_BRIDGE_TXS_TASK: ${RUN_SUBMIT_BRIDGE_TXS_TASK}
      SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS: ${SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS}
      RPC_CONFIG: ${RPC_CONFIG}
      ADMIN_ACCESS_TOKENS: ${ADMIN_ACCESS_TOKENS}
      ALLOWED_IPS: ${ALLOWED_IPS}
    labels:
      origin: ${ORIGIN}
    restart: on-failure # important to avoid restart when service is stopped due to configuration (RUN_BRIDGE_API=false)
    volumes:
      - ./apps/bridge-api/logs:/repo/apps/bridge-api/logs
      # Stateful Mongo TLS certs (#860) — see sodax-stateful-api for the full note. Absolute host path.
      - ${STATEFUL_MONGO_CERT_DIR:-/etc/sodax/certs}:/certs:ro
    ports:
      - "${BRIDGE_API_PORT}:${BRIDGE_API_PORT}"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${BRIDGE_API_PORT}/healthz/live"]
      interval: 30s
      timeout: 10s
      retries: 10
      start_period: 40s
    depends_on: *api-depends-on
```

**3.3 `Makefile` — MODIFY** — THREE edits (mirror `run-dev-swaps-api`; recipe lines MUST use literal TAB):
- (1) `.PHONY` at line 11: append token → `... run-dev-swaps-api run-dev-bridge-api \`.
- (2) help block: INSERT after line 57 (`run-dev-swaps-api` help line): `\t@echo "  run-dev-bridge-api    - Start bridge-api for dev"` (align: two spaces before dash — bridge-api is one char longer than swaps-api).
- (3) target: INSERT after line 129 (before `restart-dev-aggregator:` at :131):
```makefile
run-dev-bridge-api: run-dev-mongo
<TAB>@echo "Running bridge-api for development"
<TAB>@docker compose -f $(DOCKER_COMPOSE_FILE) --env-file $(DEV_ENV) up -d sodax-bridge-api --build
```

**3.4 `.env-example` — MODIFY** — TWO edits. Swaps analog :194-204.
- (1) INSERT after line 231 (after commented SOLVER_CONFIG example, before `# ─── Data Aggregator ───` at :233). Header uses U+2500 box chars matching :194. In `.env-example` the drainer is DISABLED:
```
# ─── Bridge API ──────────────────────────────────────────────────────────────
RUN_BRIDGE_API="true"           # Enable/disable the bridge API service
BRIDGE_API_PORT=3009

# Background task: drains stateful_submit_bridge_tx_v2 by relaying bridge intents. Must be enabled
# on exactly ONE deployment (like the swaps drainer) — the Mongo lease only serializes replicas
# sharing one DB, and the prod deployments have separate DBs, so nothing in code prevents
# cross-deployment double-processing if two deployments enable it.
RUN_SUBMIT_BRIDGE_TXS_TASK="false"
SUBMIT_BRIDGE_TXS_TASK_INTERVAL_MS=60000
```
- (2) `SERVICES_TO_MONITOR` at line 492: append `,sodax-bridge-api` → `'sodax-data-aggregator,sodax-data-transformator,sodax-api,sodax-redis,sodax-mongo,sodax-task-executor,sodax-stateful-api,sodax-swaps-api,sodax-bridge-api'`.

**3.5 `.env.dev` — MODIFY** — Same two edits, same anchors. **CRITICAL DIFFERENCE: dev ENABLES the drainer** — mirror `RUN_SUBMIT_SWAP_TXS_TASK="true"` (.env.dev:203). Insert the identical Bridge block after line 231 except `RUN_SUBMIT_BRIDGE_TXS_TASK="true"`. Append `,sodax-bridge-api` to SERVICES_TO_MONITOR at :492 (identical resulting value to `.env-example`).

### Infra gotchas
- **Per-file drainer flag divergence:** `.env-example` → `"false"`, `.env.dev` → `"true"`. Do NOT blindly copy `"false"` into both.
- Makefile recipe lines are TAB-indented (`cat -vt` shows `^I`); spaces break `make`.
- `SOLVER_CONFIG` is the only swaps env with no bridge parallel — dropping it is code-confirmed (no ref in `apps/bridge-api/src`). `RPC_CONFIG` IS retained.
- monitoring-service needs NO source edit: `SERVICES_TO_MONITOR` CSV entry `sodax-bridge-api` matches the container's `com.docker.compose.service` label (= the compose service key) automatically (configuration.ts:11-17 prefixes `${ORIGIN}:`; monitoring.service.ts:513,521 / :397,400 match on it).
- Both env files are line-for-line parallel (only line 203 differs) → same anchors (after :231; SERVICES_TO_MONITOR at :492).
- Keep the ARG SOURCE_COMMIT / ENV GIT_SHA stamp in the bridge stage (bridge-api also serves `/healthz`).

**Verification:** `docker compose -f docker-compose.yml --env-file .env.dev config` must parse cleanly and show the `sodax-bridge-api` service resolved (all `${...}` substituted, no YAML errors). Optionally `docker compose config --services | grep sodax-bridge-api`.

---

## Section 4 — Docs (`docs/bridge-api-sdk-mapping.md` + CLAUDE.md rows)

New endpoint→SDK-call mapping doc mirroring milktea's `docs/leverage-yield-api-sdk-mapping.md` (read via `git show origin/fix/leverage-swap-api:docs/leverage-yield-api-sdk-mapping.md` — NOT in the working tree; do not link it as a local sibling), plus exact CLAUDE.md architecture-invariant row edits. All committed → ENGLISH.

**4.1 `docs/bridge-api-sdk-mapping.md` — CREATE**
Mirror the leverage doc's 8-part structure. Concrete content (full spec — one row per route):
- **Title/intro:** `# Bridge API v2 — endpoint -> SDK-call mapping`; reference for `apps/bridge-api/src/api/bridge/`, one row per route of the 7-route contract `sodax.api.bridge.*` calls; cite bridge.controller.ts:26-30.
- **Base path:** `@Controller('bridge')` → `/bridge/*`; HAProxy adds external `/v1/bridge/*` (mirrors `/v1/swaps/*`); cite controller.ts:32.
- **## Why a separate app** (INVERT leverage's "why colocated"): bridge is its OWN app because relay-only — no solver/intent-journal/getStatus to reuse. Reuses only the feature-agnostic shared relay (`sodax.swaps.submitIntent` + `sodax.swaps.relayerApiEndpoint`; there is NO `sodax.bridge.submitIntent`), owns `stateful_submit_bridge_tx_v2` as sole writer. Submit-tx concurrency shell ported verbatim from `SubmitSwapTxsTask` but pipeline collapses to ONE step. Cite relay-bridge-tx.ts:17-26, submit-bridge-txs.task.ts:40-46.
- **## Design split:** Discovery (in-memory config, no RPC, service.ts:41-55); Raw-tx build (`sodax.bridge.*` via `buildBridgeAction(dto)` → `BridgeParams<K,true>`, service.ts:61-87,148-160); Durable submit pipeline (insert + status + relay-only drainer). `!result.ok` → `throwSdkError`; bigints → `stringifyBigInts`.
- **## Discovery table:** `GET /tokens` → getTokens() iterate `sodax.bridge.config.spokeChainConfig` → `projectBridgeTokens`, 60s cache; `GET /tokens/:chainKey` → `spokeChainConfig[chainKey]`, missing → NotFoundError(404). Cite controller.ts:38-74.
- **## Raw-tx build table:** `POST /allowance/check` → `sodax.bridge.isAllowanceValid` → `{valid}`; `POST /approve` → `sodax.bridge.approve` → `{tx}`; `POST /intents` → `sodax.bridge.createBridgeIntent` → `{tx, relayData}`. Shared body `CreateBridgeIntentParamsDto` (wire inputToken/outputToken/inputAmount/dstAddress → domain srcToken/dstToken/amount/recipient; no per-request partner-fee). Cite controller.ts:76-101, service.ts:61-87.
- **## Durable submit table:** `POST /submit-tx` → `findOrUpsertSubmitBridgeTx(dto)` (idempotent on `(txHash,srcChainKey)`, `new:false`) + emit `SUBMIT_BRIDGE_TX_CREATED_EVENT` kick → drainer → `relayBridgeTx` → `sodax.swaps.submitIntent` + `waitUntilIntentExecuted`. Throttled 10/60s. Response `{success, data:{status:'inserted'|'duplicate', message}}`; `GET /submit-tx/status` → `getSubmitTxStatus`, 404 when missing. Cite controller.ts:103-124.
- **## Status enum · lifecycle · terminal:** `SubmitBridgeTxStatus = 'pending'|'relaying'|'relayed'|'executed'|'failed'` (types:32). Lifecycle `pending → relaying → relayed → executed|failed`. RELAY-ONLY: NO `posting_execution`/`posted_execution`/`solved`. Terminal success = `executed` (`result.dstIntentTxHash` set). `relayed` is **reserved/defensive** — the atomic relay pipeline NEVER writes it. Cite task.ts:260-292, db.service.ts:119-134.
- **## Relay-only & the RELAY_TIMEOUT-consume rule** (load-bearing): `transient = isTransientSubmitError(err) && !isRelayTimeout(err)` (task.ts:280). RELAY_TIMEOUT CONSUMES (saturate→abandon); every other transient REFUNDS (`$gt:0`). Rationale (quote task.ts:276-279). Two bounds: `BRIDGE_TX_SUBMIT_INTENT_TIMEOUT_MS` (30s, refund) + `DEFAULT_RELAY_TX_TIMEOUT` (~120s).
- **## Row shape · relayData:** full envelope `relayData:{address,payload}` (required, no `intent.creator` to rebuild; needed for split-tx Solana/Bitcoin). `result = {dstIntentTxHash, packetData?}`. Static recovery hint (no journal).
- **## Topology / write-ownership / heartbeat:** cross-ref CLAUDE.md. Drainer `RUN_SUBMIT_BRIDGE_TXS_TASK` (default false); lease in SHARED stateful `locks` keyed by bridge model (distinct doc, #837); collection on `STATEFUL_CONNECTION_NAME` (#826); `BRIDGE_SUBMIT_TX` heartbeat on LOCAL conn (#880); raises `BRIDGE_SUBMIT_GIVE_UP` (playbook.ts:183).
- **## Open items:** HAProxy `/v1/bridge/*` route (external); empirical P0 validation (EVM-spoke + split-tx deposit end-to-end); tests mirror swaps. **⚠️ Reconcile the admin item** — see cross-section note below.
- Style: GitHub markdown tables, backticked identifiers, terse "why" prose between tables.

### 🚩 FLAG — CLAUDE.md row edits (FOUR edits, exact string replacement)

**EDIT 1 (required) — NEW write-ownership row**, insert AFTER the `stateful_submit_swap_tx_v2` row (CLAUDE.md:226), BEFORE `task_pause_overrides` (:227). Escape the pipe as `executed \| failed`:
```
| `stateful_submit_bridge_tx_v2` | bridge-api (sole writer — `POST /bridge/submit-tx` inserts via `SubmitBridgeTxDbService.findOrUpsertSubmitBridgeTx`; `SubmitBridgeTxsTask` drains + writes status/result and the retry-state fields `processingAttempts`/`lastAttemptAt`; `SubmitBridgeTxAlerterTask` latches `abandonedAt` on processing-budget exhaustion then `alertedAt` after the give-up page). bridge-api also raises `BRIDGE_SUBMIT_GIVE_UP` to `incidents` via `@repo/incident-manager` — see that row. **Relay-only** (NO solver / postExecution / getStatus, unlike swaps): lifecycle `pending → relaying → relayed → executed \| failed`; terminal success is `executed` (destination packet landed, `result.dstIntentTxHash` set — the relay-only analog of swaps' `solved`), terminal failure is `failed` OR `abandonedAt` latched (`relayed` is a reserved value the atomic relay pipeline never writes). Attempt accounting mirrors swaps EXCEPT a `RELAY_TIMEOUT` (packet non-delivery) CONSUMES the attempt (saturates to MAX → alerter abandons) while every other transient relayer-API error REFUNDS — relay-only bridge has no journal/solver terminal authority, so a never-delivered packet must consume, not refund forever. Operator-ack fields (`addressedAt`/`addressedBy`/`addressedReason`) are written by the `/admin/bridge/*` surface (relay + mark-addressed). **Lives in the SHARED stateful DB** (`STATEFUL_CONNECTION_NAME`, #826). **Topology**: the drainer (`RUN_SUBMIT_BRIDGE_TXS_TASK=true`) MAY run on MULTIPLE deployments — its lease lives in the SHARED stateful `locks` keyed by the bridge model (a DISTINCT `locks` doc from the swaps drainer, #837), serializing to exactly ONE active drainer with lease-TTL failover. **Precondition**: `STATEFUL_MONGO_*` point at the same shared server; if unset, lease + queue fall back to the local DB and the task must run on only ONE deployment. NOTE: the drainer's `BRIDGE_SUBMIT_TX` heartbeat is still on the LOCAL connection (#880), same as swaps. |
```
(⚠️ **Reconciliation:** the reader wrote "NO bridge admin endpoints wired yet" — but Admin lands in this same P3. The row above already reflects the wired admin surface. Do the same in the doc's Open items.)

**EDIT 2 (required) — extend `task_executor_heartbeats` row** (:228). Replace `for its self-scheduled drainer (`SubmitSwapTxHeartbeatService`, #705 — the drainer was ported out of task-executor in #568). Each writer owns disjoint` with `... #568); **bridge-api writes ONLY the `BRIDGE_SUBMIT_TX` label row** for its self-scheduled relay-only drainer (`SubmitBridgeTxHeartbeatService`, gh-268 — same producer/consumer precedent as swaps, on the LOCAL default connection, #880). Each writer owns disjoint`.

**EDIT 3 (required) — extend `service_runtime_flags` row** (:229). Replace `(data-aggregator, data-transformator, task-executor, stateful-api, swaps-api) upserts` with `(data-aggregator, data-transformator, task-executor, stateful-api, swaps-api, bridge-api) upserts`.

**EDIT 4 (recommended) — Directory Structure apps tree** (:55-61). After the `api/` line add `│   ├── bridge-api/             # Bridge v2 API (relay-only cross-chain bridge submit-tx pipeline)`; before the `task-executor/` line add `│   ├── swaps-api/              # Swaps v2 + leverage-yield intent submit-tx pipeline` (pre-existing gap). Keep `└──` on task-executor.

### Docs gotchas
- Writer label = `bridge-api` (matches app dir), not `bridge`.
- Table cells: escape `|` as `\|`.
- `relayed` is reserved/defensive — do not describe as an observable state.
- Heartbeat is LOCAL conn; queue is `STATEFUL_CONNECTION_NAME` — keep the two facts distinct.
- RELAY_TIMEOUT-consume INVERTS the transient=refund default — do not phrase as "refund on timeout".

**Verification:** none (docs only). Optionally a markdown-lint / link check.

---

## Cross-section reconciliation (important)

The **Tests** and **Docs** readers were written assuming the admin surface does NOT exist yet ("NO bridge admin endpoints wired", "no admin markAddressed/unmarkAddressed on the bridge db-service"). In this consolidated P3 the **Admin section lands in the same pass**, so:
1. The CLAUDE.md write-ownership row and the doc's Open items must describe the admin surface as **wired** (reflected in EDIT 1 above), not owed.
2. Once Admin 1.6 lands, add `markAddressed`/`unmarkAddressed`/`markManuallyExecuted` cases to the db e2e spec (2.2). The `markManuallyExecuted` concurrency guard (`NON_TERMINAL_SUCCESS_FILTER`, returns `matchedCount>0`) is the complement to db-spec case 5's executed-latch — assert it no-ops on an already-executed row and clears the abandonment family on a fresh abandoned row.
3. If Admin is deferred to a later P, keep the reader's original "owed" wording in Docs and skip the admin-specific test cases — but the three db-service methods (1.6) and the admin files are otherwise self-contained.

## Consolidated flags (single list)
- **Admin outcome quartet:** `executed | already_executed | not_abandoned | incomplete` (collapses swaps' 7).
- **THREE db-service additions**, not two: `markAddressed`, `unmarkAddressed`, and the NEW guarded terminal `markManuallyExecuted` (the existing `updateStatus('executed')` cannot serve the manual path — it filters out abandoned rows and returns void).
- **mongodb-memory-server setup snippet** (Section 2 flag) — dual-connection, forFeature on `STATEFUL_CONNECTION_NAME`, no IntentJournal; place the DI spec under `test/e2e/` for decorator metadata.
- **Exact infra insertions:** Dockerfile stage after :93; compose service after :224 (drop `SOLVER_CONFIG`); Makefile 3 edits (TAB recipe); `.env` blocks after :231 with the drainer flag divergent per file (`false`/`true`) + SERVICES_TO_MONITOR `,sodax-bridge-api` at :492.
- **CLAUDE.md rows:** new `stateful_submit_bridge_tx_v2` write-ownership row (:226), extend `task_executor_heartbeats` (:228) + `service_runtime_flags` (:229), add Directory-Structure lines (:55-61).