Based on my verification of the actual source, here is the consolidated blueprint.

---

# Bridge-API Relay-Only Drainer — Implementation Blueprint (P2 Slice 2)

Relay-only port of the swaps submit drainer into `apps/bridge-api`. The concurrency/safety shell is copied verbatim; the solver half (postExecution / getStatus / journal / deadline) is amputated; the pipeline collapses to one step: **relay-submit + wait-packet → `executed` (terminal) | classify refund-vs-consume**. The one genuinely new decision is **RELAY_TIMEOUT must CONSUME** (not refund) because relay-only bridge has no journal/solver terminal authority.

Verified ground truth: bridge status union is already `pending|relaying|relayed|executed|failed` (`types/submit-bridge-tx.ts:32`, `schemas/stateful-submit-bridge-tx.schema.ts:16`); `ISubmitBridgeTx.relayData` is a required full envelope `{address,payload}` (`types:23-26,43`); `SubmitBridgeTxDbService` currently has only `findOrUpsertSubmitBridgeTx`/`exists`/`getSubmitTxStatus` (`submit-bridge-tx-db.service.ts:39-92`); all 4 drainer indexes already exist (`schema:96-108`); `EventEmitterModule` is wired (`app.module.ts:36-38`); config `submitBridgeTxsTask`/`RUN_SUBMIT_BRIDGE_TXS_TASK` already exist (`configuration.ts:32-36,81-84`, `config.service.ts:49-51`); `DEFAULT_RELAY_TX_TIMEOUT = 120000` (`@sodax/sdk index.mjs:3335`); `RELAY_ERROR_CODES.RELAY_TIMEOUT = 'RELAY_TIMEOUT'` (`@sodax/sdk index.d.ts:9958-9972`).

---

## 1. File list (build order)

Cross-cutting registrations first (they must compile before the consumers), then DB, then relay helper, then task/alerter/heartbeat/module, then wiring.

| # | File | Create/Modify | Purpose |
|---|------|--------------|---------|
| 1 | `packages/shared-enums/src/enums/enums.ts` | Modify | Add `TaskLabel.BRIDGE_SUBMIT_TX = 'BRIDGE SUBMIT TX'`; update action-taker comment. NOT added to `GUARDABLE_TASK_LABELS`. (`enums.ts:265,272,279-286`) |
| 2 | `packages/incident-manager/src/constants.ts` | Modify | Add `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP` key. (`constants.ts:35`) |
| 3 | `packages/incident-manager/src/playbook.ts` | Modify | Add `ALERT_ONLY_PLAYBOOK[BRIDGE_SUBMIT_GIVE_UP] = { anchor: STATEFUL_SUBMIT_BRIDGE_TX_V2 }` to keep `_AssertExhaustivePartition` green. (`playbook.ts:178-180,220-223`) |
| 4 | `packages/shared-utils/src/constants.ts` | (Optional) Modify | Add `MAX_BRIDGE_TX_RETRIES=3` / `BRIDGE_TX_RETRY_BACKOFF_MS=60_000`, OR reuse `MAX_SWAP_TX_RETRIES`/`SWAP_TX_RETRY_BACKOFF_MS` verbatim (recommended — generic per-tx knobs). (`shared-utils/constants.ts:18-19`) |
| 5 | `apps/bridge-api/src/tasks/submit-bridge-txs/constants.ts` | **Create** | Bridge-local drainer constants + `STATEFUL_LOCK_MANAGER` DI token. |
| 6 | `apps/bridge-api/src/api/bridge/constants.ts` (event) | **Create** (or add to existing bridge constants) | `SUBMIT_BRIDGE_TX_CREATED_EVENT` + `SubmitBridgeTxCreatedEvent` payload type. (mirror `swaps/constants.ts:26-33`) |
| 7 | `apps/bridge-api/src/shared/utils/utils.ts` | Modify | Add `isRelayTimeout(err)` predicate. |
| 8 | `apps/bridge-api/src/api/bridge/submit-bridge-tx-db.service.ts` | Modify | Add 9 drainer/alerter methods + `NON_TERMINAL_SUCCESS_FILTER` const + imports. |
| 9 | `apps/bridge-api/src/api/bridge/relay-bridge-tx.ts` | **Create** | Relay-only submit+wait-packet helper (envelope from stored `relayData`). |
| 10 | `apps/bridge-api/src/tasks/submit-bridge-txs/submit-bridge-tx-heartbeat.service.ts` | **Create** | Heartbeat service, `LABEL = TaskLabel.BRIDGE_SUBMIT_TX`. |
| 11 | `apps/bridge-api/src/tasks/submit-bridge-txs/submit-bridge-txs.task.ts` | **Create** | The relay-only drainer. |
| 12 | `apps/bridge-api/src/tasks/submit-bridge-txs/submit-bridge-tx-alerter.task.ts` | **Create** | Single-cause give-up alerter (Slice-3 scope; include if landing together). |
| 13 | `apps/bridge-api/src/tasks/submit-bridge-txs/submit-bridge-txs.module.ts` | **Create** | Module + `STATEFUL_LOCK_MANAGER` factory. |
| 14 | `apps/bridge-api/src/api/bridge/bridge.module.ts` | Modify | Add `SODAX` to `exports` (drainer injects it). (`bridge.module.ts:28`) |
| 15 | `apps/bridge-api/src/api/bridge/bridge.service.ts` | Modify | Inject `EventEmitter2`; emit `SUBMIT_BRIDGE_TX_CREATED_EVENT` on fresh insert (`result === null` branch). (`bridge.service.ts:90-96`) |
| 16 | `apps/bridge-api/src/app.module.ts` | Modify | Add `SubmitBridgeTxsModule` to `imports` (unconditional; self-gated). (`app.module.ts:26-28`) |

> Note the task's constants reference `DEFAULT_RELAY_TX_TIMEOUT` from `@sodax/sdk` directly; no local copy.

---

## 2. `apps/bridge-api/src/api/bridge/relay-bridge-tx.ts` (create)

Ported from `apps/swaps-api/src/api/swaps/relay-swap-tx.ts:27-136`. **Key divergences:** envelope is the full stored `params.relayData.{address,payload}` (bridge has no `intent.creator`); `relayData` is required so the swaps missing-relayData guard (`relay-swap-tx.ts:59-69`) is dropped (a payload-presence assert is fine); returns SDK `PacketData` which is structurally `IPacketDataDomain` (`types:5-16`) — store directly.

```ts
import {
  IntentRelayRequest,
  PacketData,
  RelayExtraData,
  Result,
  Sodax,
  SpokeChainKey,
  isBitcoinChainKeyType,
  isHubChainKeyType,
  isSolanaChainKeyType,
  waitUntilIntentExecuted,
} from '@sodax/sdk';
import { ISubmitBridgeTx } from './types/submit-bridge-tx';
import { withTimeout } from '../../shared/utils/utils';
import { BRIDGE_TX_SUBMIT_INTENT_TIMEOUT_MS } from '../../tasks/submit-bridge-txs/constants';

/**
 * Relay a submitted bridge tx to the intent relay and wait (up to `relayTimeoutMs`) for the packet
 * to land on the hub. Returns [dstIntentTxHash, packetData?] (packetData undefined on a hub-origin
 * source, which never happens for bridge spokes but is kept for shape parity). Re-running is
 * idempotent: the relay submit is a notify keyed off the source tx hash.
 *
 * Relay-only: the envelope is the FULL stored `relayData` ({ address, payload }) — bridge has no
 * intent.creator to rebuild the relay address from. Uses the SHARED relay layer
 * (sodax.swaps.submitIntent + sodax.swaps.relayerApiEndpoint) — there is no sodax.bridge.submitIntent.
 */
export async function relayBridgeTx(
  params: ISubmitBridgeTx,
  sodax: Sodax,
  relayTimeoutMs: number,
): Promise<Result<[string, PacketData | undefined], { error: unknown }>> {
  try {
    const srcChainKey = params.srcChainKey as SpokeChainKey;

    if (!isHubChainKeyType(srcChainKey)) {
      const relayChainId = sodax.config.getRelayChainIdMap()[srcChainKey];
      if (relayChainId == null) {
        // Unmapped chain = config error, never retry-recoverable. Clear error → consumes toward abandon.
        return { ok: false, error: { error: new Error(`No relay chain id mapping for srcChainKey ${srcChainKey}`) } };
      }
      const intentRelayChainId = relayChainId.toString();

      // Solana + Bitcoin are split-tx chains: the relay submit REQUIRES the createBridgeIntent
      // envelope (the relayer can't reconstruct it from the source tx). For every VM we send the
      // FULL stored envelope; relayData is required on the row so no missing-payload guard is needed.
      const isSplitTxChain = isSolanaChainKeyType(srcChainKey) || isBitcoinChainKeyType(srcChainKey);
      const submitPayload: IntentRelayRequest<'submit'> = isSplitTxChain
        ? {
            action: 'submit',
            params: {
              chain_id: intentRelayChainId,
              tx_hash: params.txHash,
              data: {
                address: params.relayData.address,
                payload: params.relayData.payload,
              } satisfies RelayExtraData,
            },
          }
        : {
            action: 'submit',
            params: { chain_id: intentRelayChainId, tx_hash: params.txHash },
          };

      // Bound the otherwise-unbounded relay submit POST. On timeout withTimeout rejects with an
      // Error whose message carries "timed out" → classified transient → refund + re-relay.
      const submitResult = await withTimeout(
        sodax.swaps.submitIntent(submitPayload),
        BRIDGE_TX_SUBMIT_INTENT_TIMEOUT_MS,
        'submitIntent',
      );
      if (!submitResult.ok) {
        // Propagate the raw structured error so isTransientSubmitError can read its code/relayCode.
        return { ok: false, error: { error: submitResult.error } };
      }

      // The ONLY delivery signal for relay-only bridge — must stay bounded (relayTimeoutMs).
      const packet = await waitUntilIntentExecuted({
        intentRelayChainId,
        srcTxHash: params.txHash,
        timeout: relayTimeoutMs,
        apiUrl: sodax.swaps.relayerApiEndpoint,
      });
      if (!packet.ok) {
        // Propagate raw so the caller can distinguish RELAY_TIMEOUT (packet non-delivery → CONSUME)
        // from RELAY_POLLING_FAILED / transport errors (relay-API outage → REFUND).
        return { ok: false, error: { error: packet.error } };
      }

      return { ok: true, value: [packet.value.dst_tx_hash, packet.value] };
    }

    // Defensive: a hub-origin source has no relay hop.
    return { ok: true, value: [params.txHash, undefined] };
  } catch (error) {
    return { ok: false, error: { error } };
  }
}
```

`packetData` (`PacketData`) is stored directly as `result.packetData` (`ISubmitBridgeTxResult.packetData?: IPacketDataDomain`, `types:35`). A thin `as IPacketDataDomain` cast at the store site keeps types honest (schema expects `IPacketDataDomain`, `schema:23-25`).

---

## 3. `SubmitBridgeTxDbService` additions

Add to `apps/bridge-api/src/api/bridge/submit-bridge-tx-db.service.ts`. Mechanical port of the swaps DRAINER-side methods (`submit-tx-db.service.ts`), with the terminal-success literal `solved → executed` and the solver-poll phases dropped from `getToProcess`.

**New module-scope const** (mirror `submit-tx-db.service.ts:43`):
```ts
const NON_TERMINAL_SUCCESS_FILTER = { $ne: 'executed' as SubmitBridgeTxStatus } as const;
```

**New imports:**
```ts
import { MAX_SWAP_TX_RETRIES, SWAP_TX_RETRY_BACKOFF_MS } from '@repo/shared-utils'; // add to existing import
import { MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS, BRIDGE_TX_ABANDON_GRACE_MS } from '../../tasks/submit-bridge-txs/constants';
import {
  ISubmitBridgeTx, ISubmitBridgeTxResult, SubmitBridgeTxStatus, // + existing SubmitBridgeTxStatusResponse
} from './types/submit-bridge-tx';
```
(`@repo/shared-utils` re-exports the retry knobs — `shared-utils/index.ts:13`; both are generic per-tx values `=3`/`=60_000` at `shared-utils/constants.ts:18-19` — reuse by their swaps names, do not alias.)

### Methods

**`getToProcess(): Promise<ISubmitBridgeTx[]>`** — port of swaps `275-313`. Status set drops `posting_execution`/`posted_execution` (vs swaps `292`); `executed` is excluded because it's never in the `$in` set.
```ts
const backoffCutoff = new Date(Date.now() - SWAP_TX_RETRY_BACKOFF_MS);
find({
  status: { $in: ['pending', 'relaying', 'relayed', 'failed'] },
  abandonedAt: { $exists: false },
  $and: [
    { $or: [{ processingAttempts: { $exists: false } }, { processingAttempts: { $lt: MAX_SWAP_TX_RETRIES } }] },
    { $or: [{ lastAttemptAt: { $exists: false } }, { lastAttemptAt: { $lt: backoffCutoff } }] },
  ],
}).limit(MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS).sort({ createdAt: 1 }).exec()
// → result.map(item => item.toJSON() satisfies ISubmitBridgeTx)
```
Plain query operators (NOT `$expr`) so the compound index (`schema:98`) stays usable; each gate is "absent OR compare" so legacy rows still match.

**`claimForProcessing(txHash, srcChainKey: SpokeChainKey): Promise<void>`** — verbatim swaps `322-327`.
```ts
await this.submitBridgeTxModel.updateOne(
  { txHash, srcChainKey },
  { $inc: { processingAttempts: 1 }, $set: { lastAttemptAt: new Date() } },
);
```
The +1-before-work claim is what bounds in-flight orphan loops.

**`updateStatus(txHash, srcChainKey, status: SubmitBridgeTxStatus, extras?: { result?: ISubmitBridgeTxResult }): Promise<void>`** — port of the swaps forward/else-branch only (`627-645`). Guard is abandonedAt-absent ONLY (the terminal `executed` write goes through this path — do NOT add `{$ne:'executed'}` here or the terminal write no-ops).
```ts
const update: Record<string, unknown> = { $set: { status, ...(extras?.result && { result: extras.result }) } };
if (status === 'executed') { update.$unset = { failedAtStep: '', failureReason: '' }; } // clear last failure only on terminal-success (swaps 641-643, 'solved'→'executed')
await this.submitBridgeTxModel.updateOne({ txHash, srcChainKey, abandonedAt: { $exists: false } }, update);
```
Intermediate forward writes (`relaying`) PRESERVE `failedAtStep`/`failureReason` so a mid-pickup kill leaves a meaningful reason for the alerter.

**`markFailed(txHash, srcChainKey, extras?: { failedAtStep?; failureReason?; permanentFailure?: boolean; transient?: boolean }): Promise<void>`** (aka `failWith` on the DB side) — port of the swaps failed-branch only (`585-626`), split into its own method. This is the ONLY attempt-refund path in bridge (no `keepAwaitingSolver`).
```ts
const update: Record<string, unknown> = {
  $set: { status: 'failed', failedAtStep: extras?.failedAtStep, failureReason: extras?.failureReason },
};
const filter: Record<string, unknown> = {
  txHash, srcChainKey,
  abandonedAt: { $exists: false },
  status: NON_TERMINAL_SUCCESS_FILTER, // never flip a concurrently-executed row executed→failed (swaps 602-607, #824)
};
if (extras?.permanentFailure) {
  (update.$set as any).processingAttempts = MAX_SWAP_TX_RETRIES; // jump to cap
  (update.$set as any).lastAttemptAt = new Date(0);              // backdate so alerter grace doesn't hold it (swaps 609-615)
} else if (extras?.transient) {
  update.$inc = { processingAttempts: -1 };  // refund the CLAIM's +1 (swaps 616-623)
  filter.processingAttempts = { $gt: 0 };    // guarded underflow (CLAIM guarantees >=1)
} // else unknown/non-transient: CLAIM's +1 stands (consume the cap, swaps 624)
await this.submitBridgeTxModel.updateOne(filter, update);
```

**`getNewlySaturated(limit: number): Promise<ISubmitBridgeTx[]>`** — port of swaps `466-483`. `{$ne:'executed'}` filter + grace gate.
```ts
const graceCutoff = new Date(Date.now() - BRIDGE_TX_ABANDON_GRACE_MS);
find({
  status: NON_TERMINAL_SUCCESS_FILTER,
  abandonedAt: { $exists: false },
  processingAttempts: { $gte: MAX_SWAP_TX_RETRIES },
  lastAttemptAt: { $lt: graceCutoff }, // excludes a row whose CLAIM just stamped lastAttemptAt≈now
}).limit(limit).sort({ createdAt: 1 }).exec()
```
The grace gate is the one overlap between the drainer's `< MAX` set and the alerter's `>= MAX` set — never abandon a row mid-relay.

**`markAbandoned(txHash, srcChainKey): Promise<boolean>`** — port of swaps `492-505`. CAS latch, returns `matchedCount > 0`.
```ts
const result = await this.submitBridgeTxModel.updateOne(
  { txHash, srcChainKey, processingAttempts: { $gte: MAX_SWAP_TX_RETRIES }, status: NON_TERMINAL_SUCCESS_FILTER, abandonedAt: { $exists: false } },
  { $set: { abandonedAt: new Date() } },
);
return result.matchedCount > 0;
```

**`getAbandonedUnalerted(limit: number): Promise<ISubmitBridgeTx[]>`** — port of swaps `514-521`. Backed by the partial index (`schema:104-107`).
```ts
find({ abandonedAt: { $exists: true }, alertedAt: { $exists: false } }).limit(limit).sort({ abandonedAt: 1 }).exec()
```

**`markGivenUpAlerted(txHash, srcChainKey): Promise<boolean>`** — port of swaps `530-536`. CAS set `alertedAt`, returns `matchedCount > 0`.
```ts
const result = await this.submitBridgeTxModel.updateOne(
  { txHash, srcChainKey, abandonedAt: { $exists: true }, alertedAt: { $exists: false } },
  { $set: { alertedAt: new Date() } },
);
return result.matchedCount > 0;
```

**`findByKey(txHash, srcChainKey): Promise<ISubmitBridgeTx | null>`** — port of swaps `190-193`. Used by the future admin manual-relay endpoint.
```ts
const doc = await this.submitBridgeTxModel.findOne({ txHash, srcChainKey }).exec();
return doc ? (doc.toJSON() satisfies ISubmitBridgeTx) : null;
```

> Existing `findOrUpsertSubmitBridgeTx`/`exists`/`getSubmitTxStatus` are unchanged. `markAddressed`/`unmarkAddressed` (swaps `547-568`) are NOT in this slice but port verbatim later if the admin dashboard needs them (schema already has `addressedAt`/`addressedBy`/`addressedReason`).

---

## 4. `submit-bridge-txs.task.ts` (create)

**Shell kept verbatim** (rename swaps→bridge), from `submit-swap-txs.task.ts`:

- **Self-guard fields** (`62-77`): `holderId = 'bridge-api:submit-bridge-txs:${randomUUID()}'`, `isProcessing`, `pendingKick`, `shuttingDown`.
- **Constructor deps:** `config: CustomConfigService`, `scheduler: SchedulerRegistry`, `@Inject(STATEFUL_LOCK_MANAGER) locks: LockManagerService`, `submitBridgeTxDb: SubmitBridgeTxDbService`, `@InjectModel(StatefulSubmitBridgeTx.name, STATEFUL_CONNECTION_NAME) submitBridgeTxModel`, `@Inject(SODAX) sodax: Sodax`, `heartbeat: SubmitBridgeTxHeartbeatService`. **Drop `IntentJournalApiClient`** (swaps `90`).
- **`onModuleInit`** (`93-106`): `void heartbeat.refreshMeta({enabled,intervalMs})`, isEnabled gate → skip, `setInterval(()=>void this.tick(), intervalMs)` + `scheduler.addInterval(INTERVAL_NAME)` where `INTERVAL_NAME='submit-bridge-txs-tick'`. Config = `this.config.submitBridgeTxsTask`.
- **`onModuleDestroy`** (`108-134`): `deleteInterval`, `shuttingDown=true`, `pendingKick=false`, bounded drain `while (isProcessing && Date.now()<drainDeadline) await delay(100)` with `SUBMIT_BRIDGE_TXS_SHUTDOWN_DRAIN_MS`, warn-if-still-processing, NO heartbeat write.
- **`@OnEvent(SUBMIT_BRIDGE_TX_CREATED_EVENT) onSubmitTxCreated(payload)`** (`148-164`): isEnabled gate, shuttingDown gate, `if isProcessing → pendingKick=true else void this.tick()`.
- **`tick()`** (`166-241`): verbatim — shuttingDown/isProcessing guards, `isProcessing=true`, `await heartbeat.recordTick(intervalMs)`, `completed=false`, `lease=null`, `lease = await locks.tryAcquireModelLease(this.submitBridgeTxModel, SUBMIT_BRIDGE_TXS_LOCK_TTL_MS, this.holderId)`, `if(!lease) return`, `recordProcessingStart`, `completed = await processSubmitBridgeTxs(lease)`, nested-finally `recordProcessingEnd(completed)` + `lease.release()` + `isProcessing=false`, then `pendingKick` re-run.
- **`processSubmitBridgeTxs(lease)`** (`248-321`): `rows = await submitBridgeTxDb.getToProcess()`; `batches = createBatches(rows, SUBMIT_BRIDGE_TXS_BATCH_SIZE)`; per-batch shuttingDown bail (return false), `lease.renew(SUBMIT_BRIDGE_TXS_LOCK_TTL_MS)` for `batchIndex>0` (return false on failure), `results = await Promise.allSettled(batch.map(x=>this.submitTxTask(x)))`. **Rewrite only the per-result log** — single terminal branch:
  ```ts
  if (r.status === 'fulfilled') {
    if (r.value.ok) {
      this.logger.log(`Executed bridge tx ${item?.txHash} on ${item?.srcChainKey} (dstIntentTxHash=${r.value.value.result.dstIntentTxHash})`);
    } else {
      const err = r.value.error.error;
      this.logger.error(`Failed to submit bridge for tx ${item?.txHash} on ${item?.srcChainKey}: ${err instanceof Error ? err.message : String(err)}`, err instanceof Error ? err.stack : undefined);
    }
  } else {
    this.logger.error(`Unknown error submitting bridge for tx ${item?.txHash} on ${item?.srcChainKey}`, JSON.stringify(r.reason));
  }
  ```
  No `awaiting_solver` debug branch (swaps `298-304`).
- **`getResumeStep`** (`914-920`), **`markFailed`** (`922-934`), **`failWith`** (`937-945`): verbatim (typed to `SubmitBridgeTxStatus`). `markFailed`/`failWith` call `submitBridgeTxDb.markFailed(...)` (the split-out DB method), passing `{ failedAtStep, failureReason: reason, transient, permanentFailure }`.

**Outcome type** collapses:
```ts
type SubmitBridgeTxOutcome = { phase: 'executed'; result: ISubmitBridgeTxResult };
```

### `submitTxTask` (mirror swaps `323-402` MINUS the terminal pre-check `346-370`)

```ts
private async submitTxTask(params: ISubmitBridgeTx): Promise<Result<SubmitBridgeTxOutcome, { params: ISubmitBridgeTx; error: Error }>> {
  // Step 1 — CLAIM (crash-safe +1), outside the pipeline try (swaps 331-341)
  try {
    await this.submitBridgeTxDb.claimForProcessing(params.txHash, params.srcChainKey);
  } catch (claimError) {
    this.logger.warn(`Failed to claim tx ${params.txHash} (${params.srcChainKey}); will retry next tick: ${...}`);
    return { ok: false, error: { params, error: claimError instanceof Error ? claimError : new Error(String(claimError)) } };
  }
  // Step 2 — resume point
  const progress: { step: SubmitBridgeTxStatus } = { step: this.getResumeStep(params) };
  // NO terminal pre-check (bridge rows have no intent/deadline) — go straight into the pipeline
  // Step 3
  try {
    return await this.executeSubmitBridgeTxPipeline(params, progress);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    this.logger.error(`Unexpected error for tx ${params.txHash} on ${params.srcChainKey}: ${errorMsg}`, error instanceof Error ? error.stack : undefined);
    // An unexpected throw is infra, NOT a RELAY_TIMEOUT (that only comes from the classified relay Result),
    // so no isRelayTimeout override here — plain isTransientSubmitError.
    const transient = isTransientSubmitError(error);
    if (!transient) this.logger.warn(`Consuming budget for unclassified error on tx ${params.txHash} (${params.srcChainKey}): ${errorMsg}`);
    try { await this.markFailed(params, progress.step, `Unexpected error: ${errorMsg}`, { transient }); }
    catch (markErr) { this.logger.warn(`Failed to mark tx ${params.txHash} failed after unexpected error: ${...}`); }
    return { ok: false, error: { params, error: error instanceof Error ? error : new Error(errorMsg) } };
  }
}
```

### `executeSubmitBridgeTxPipeline` — THE REPLACEMENT (collapses swaps `404-476` to one step)

```ts
private async executeSubmitBridgeTxPipeline(
  params: ISubmitBridgeTx,
  progress: { step: SubmitBridgeTxStatus },
): Promise<Result<SubmitBridgeTxOutcome, { params: ISubmitBridgeTx; error: Error }>> {
  const startStep = progress.step;

  // relay is atomic (submit + wait-packet). No 'relayed' checkpoint: a crash from 'relaying'
  // (or legacy 'relayed') re-runs the whole idempotent call. 'executed' is excluded by getToProcess;
  // defensively treat any other value as 'relaying'.
  progress.step = 'relaying';
  await this.submitBridgeTxDb.updateStatus(params.txHash, params.srcChainKey, 'relaying');

  const relayResult = await relayBridgeTx(params, this.sodax, DEFAULT_RELAY_TX_TIMEOUT);
  if (!relayResult.ok) {
    const err = relayResult.error.error;
    const reason = `Failed to relay bridge tx: ${formatResultError(err)}`;
    // REFUND-vs-CONSUME: transient EXCEPT RELAY_TIMEOUT. A relayer-API outage
    // (RELAY_POLLING_FAILED / 'timed out' / econnreset / 5xx / rate-limit) refunds to back off;
    // a RELAY_TIMEOUT (packet non-delivery) CONSUMES so it saturates to MAX and the alerter abandons it.
    const transient = isTransientSubmitError(err) && !isRelayTimeout(err);
    return await this.failWith(params, 'relaying', reason, { transient });
  }

  const [dstIntentTxHash, packetData] = relayResult.value;
  const result = { dstIntentTxHash, packetData: packetData as IPacketDataDomain | undefined } satisfies ISubmitBridgeTxResult;
  await this.submitBridgeTxDb.updateStatus(params.txHash, params.srcChainKey, 'executed', { result });
  progress.step = 'executed';
  return { ok: true, value: { phase: 'executed', result } };
}
```

**Why RELAY_TIMEOUT must consume (the crux):** `claimForProcessing` does +1, transient `markFailed` does −1 → net zero, so a purely-refunded error class never reaches MAX and never abandons. Swaps gets away with refunding RELAY_TIMEOUT (swaps `426-432`) only because its journal/deadline path is the real terminal authority. Bridge has neither, so an undeliverable packet must consume. Do NOT reuse swaps' rule.

**`isRelayTimeout(err)`** (add to `apps/bridge-api/src/shared/utils/utils.ts`):
```ts
import { RELAY_ERROR_CODES, isSodaxError } from '@sodax/sdk';
// RELAY_TIMEOUT surfaces two ways: a plain Error whose message IS the bare code
// ('RELAY_TIMEOUT', low-level relay layer, utils.ts:173-176), or a SodaxError with
// context.relayCode === 'RELAY_TIMEOUT' (orchestrator shape, utils.ts:141).
export function isRelayTimeout(err: unknown): boolean {
  if (isSodaxError(err)) return err.context?.relayCode === RELAY_ERROR_CODES.RELAY_TIMEOUT;
  if (err instanceof Error) return err.message === RELAY_ERROR_CODES.RELAY_TIMEOUT;
  return false;
}
```
(`RELAY_ERROR_CODES.RELAY_TIMEOUT === 'RELAY_TIMEOUT'`, SDK `index.d.ts:9958-9972`.) Import `isTransientSubmitError`/`formatResultError`/`withTimeout`/`isRelayTimeout` from `../../shared/utils/utils`; do NOT import `isIntentDeadlineExpired` (deadline logic dropped).

**Dropped from swaps entirely:** `postToSolver` (`494-540`), `resolveSolverStatus` (`564-682`), `resolveNotFound` (`698-739`), `handleExpiredTerminal`/`isRefundableSituationA`/`relayForRefund`/`markRelayedForRefund` (`768-871`), `classifyTerminallyUnprocessable` + terminal pre-check (`349-370,751-756`), `markSolvedFromJournal`/`intentHashOf`/`warnIfJournalDegradedAtTerminal` (`881-912`), the `awaiting_solver` outcome member, and all solver/journal constants.

---

## 5. Alerter + heartbeat + constants + module

### `constants.ts` (bridge) — exact values

```ts
export const MAX_SUBMIT_BRIDGE_TXS_TO_PROCESS = 100;      // swaps constants:2
export const SUBMIT_BRIDGE_TXS_BATCH_SIZE = 10;           // swaps:5
export const BRIDGE_TX_SUBMIT_INTENT_TIMEOUT_MS = 30 * 1000; // swaps:14
export const SUBMIT_BRIDGE_TXS_LOCK_TTL_MS = 5 * 60 * 1000;  // swaps:98 (comment rewritten: item = submit 30s + relay ~120s = ~150s << 5min; 10-batch cumulative needs lease.renew)
export const SUBMIT_BRIDGE_TX_ALERTER_INTERVAL_MS = 5 * 60 * 1000; // swaps:101
export const SUBMIT_BRIDGE_TXS_SHUTDOWN_DRAIN_MS = 10 * 1000;      // swaps:130
export const BRIDGE_TX_ABANDON_GRACE_MS = 3 * 60 * 1000;  // RECOMPUTED: worst pickup submit 30s + DEFAULT_RELAY_TX_TIMEOUT 120s = 150s, ~30s margin
export const STATEFUL_LOCK_MANAGER = 'STATEFUL_LOCK_MANAGER'; // DI token, jsdoc s/stateful_submit_swap_tx_v2/stateful_submit_bridge_tx_v2/, #837
```
No cause-marker/solver/postExecution/getStatus/stuck/journal-lookup constants (single cause). Retry knobs (`MAX_SWAP_TX_RETRIES=3`, `SWAP_TX_RETRY_BACKOFF_MS=60_000`) come from `@repo/shared-utils`, not this file. `BRIDGE_TX_ABANDON_GRACE_MS=3min` (not swaps' 5min) because the worst-case pickup dropped from ~255s to ~150s.

### `submit-bridge-tx-heartbeat.service.ts` — byte-for-byte swaps heartbeat

Copy `submit-swap-tx-heartbeat.service.ts:1-101` with ONE change: `private static readonly LABEL = TaskLabel.BRIDGE_SUBMIT_TX;` (line 42). `@InjectModel(TaskExecutorHeartbeat.name)` WITHOUT a connection name → LOCAL default connection (#880). All methods (`refreshMeta`/`recordTick`/`recordProcessingStart`/`recordProcessingEnd`/`meta`/`metaUpdate`/`write`) unchanged; best-effort `handleErrorAndContinue`; upsert keyed on `{_id: LABEL}`. Update the class jsdoc (SWAPS→BRIDGE, swaps-api→bridge-api).

### `submit-bridge-tx-alerter.task.ts` — single-cause give-up (Slice-3 scope; wire now if landing together)

Port `submit-swap-tx-alerter.task.ts` with these collapses:
- **Constructor** (`49-54`): `config`, `scheduler`, `submitBridgeTxDbService: SubmitBridgeTxDbService`, `incidentManagerService: IncidentManagerService`. Lease-free. `ACTOR = 'bridge-api:submit-bridge-tx-alerter'`, `INTERVAL_NAME = 'submit-bridge-tx-alerter-tick'`.
- **`onModuleInit`/`onModuleDestroy`** (`56-72`): verbatim, `config.submitBridgeTxsTask.isEnabled` + `SUBMIT_BRIDGE_TX_ALERTER_INTERVAL_MS`.
- **`tick()`** (collapse `74-102`): single-phase — `if (isProcessing) return; isProcessing=true; try { await scanAndAlert(); } catch(...) finally { isProcessing=false }`. DROP the second wrapped `alertStuckPostedExecution` phase.
- **`scanAndAlert()`** (port `104-204`): Phase 1 latch (`getNewlySaturated` → `markAbandoned` loop, verbatim `104-118`). Phase 2 alert (`getAbandonedUnalerted` → summarize → page). **`summarize`** keeps only bridge fields: `${row.txHash} (srcChainKey=${row.srcChainKey}, status=${row.status}, failedAtStep=${row.failedAtStep ?? 'n/a'}, attempts=${row.processingAttempts ?? 0}, reason=${row.failureReason ?? (row.status==='failed'?'n/a':`interrupted during ${row.status}`)})` (verbatim reason-derivation `130-136`). **Non-pageable arm keeps ONLY `addressedAt`** (drop `relayedForRefundAt` — no such field on `ISubmitBridgeTx`). Build reason WITHOUT a cause marker: 1 row → `` `SubmitBridgeTxsTask gave up on submit-bridge-tx ${summarize(first)} after exhausting the processing-attempt budget.` ``; N rows → `` `SubmitBridgeTxsTask gave up on ${pageable.length} submit-bridge-txs this tick. First: ${summarize(first)}. See bridge-api logs for the full list.` ``. Raise `{ flow: IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP, code: IncidentCodeTypes.INVARIANT_BROKEN, actor: this.ACTOR, reason }`; on catch log + return (NO rollback, #739). **DROP `raiseDeliveredCause`/`delivered` gate** (`22-25,181-195`) — single cause means a reused active incident is always the give-up cause, so mark alerted unconditionally after a successful raise.
- **`markAlertedSafely(row)`** (`206-217`): verbatim, `ISubmitBridgeTx`.
- **DROP `alertStuckPostedExecution`** (`219-309`) entirely.

### `submit-bridge-txs.module.ts` — port of `submit-swap-txs.module.ts`

```ts
@Module({
  imports: [
    BridgeModule,        // SODAX + re-exported statefulBridgeTx model + SubmitBridgeTxDbService
    CustomConfigModule,
    MongooseModule.forFeature([{ name: TaskExecutorHeartbeat.name, schema: TaskExecutorHeartbeatSchema }]), // default conn (#880)
    MongooseModule.forFeature([{ name: LockSchemaClass.name, schema: LockSchema }], STATEFUL_CONNECTION_NAME),
  ],
  providers: [
    SubmitBridgeTxsTask,
    SubmitBridgeTxAlerterTask,       // include in Slice 3
    SubmitBridgeTxHeartbeatService,
    {
      provide: STATEFUL_LOCK_MANAGER,
      useFactory: (locksModel: Model<LockDocument>) => new LockManagerService(locksModel),
      inject: [getModelToken(LockSchemaClass.name, STATEFUL_CONNECTION_NAME)],
    },
  ],
  exports: [SubmitBridgeTxsTask, SubmitBridgeTxAlerterTask],
})
export class SubmitBridgeTxsModule {}
```
Drop `IntentJournalApiClient` (swaps module `10,36`). The lease keys on the BRIDGE model → a distinct `locks` doc from the swaps drainer (they never contend). `SharedServicesModule`/`IncidentManagerModule` stay @Global (not imported here). Register unconditionally in `AppModule`; gating is the `onModuleInit` isEnabled self-check.

---

## 6. Cross-cutting edits

**`packages/shared-enums/src/enums/enums.ts`** (append-only, `enums.ts:246` note): add as last `TaskLabel` member after `SWAPS_SUBMIT_TX` (`265`), with owned-by-bridge-api comment:
```ts
BRIDGE_SUBMIT_TX = 'BRIDGE SUBMIT TX',
```
Value string is the heartbeat `_id` — must be new/distinct. Do NOT add to `GUARDABLE_TASK_LABELS` (`279-286`) — it's an action-taker, never pausable, like `SWAPS_SUBMIT_TX`. Update the action-taker comment (`272`) to list the fourth never-pausable task. `TASK_LABELS` auto-derives (`268`). No new `CollectionNames` entry — `STATEFUL_SUBMIT_BRIDGE_TX_V2` already exists (`204`).

**`packages/incident-manager/src/constants.ts`**: add key inside `IncidentFlowTypes` after `SWAP_SUBMIT_GIVE_UP` (`35`), before `ORACLE_UNTRACKED_SYMBOL`, with a doc comment mirroring `29-34` (submit-bridge drainer exhausting its processing-attempt budget on `stateful_submit_bridge_tx_v2`):
```ts
BRIDGE_SUBMIT_GIVE_UP: 'BRIDGE_SUBMIT_GIVE_UP',
```
`INCIDENT_FLOWS` auto-derives (`44`).

**`packages/incident-manager/src/playbook.ts`**: add to `ALERT_ONLY_PLAYBOOK` after the `SWAP_SUBMIT_GIVE_UP` entry (`178-180`):
```ts
[IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP]: { anchor: CollectionNames.STATEFUL_SUBMIT_BRIDGE_TX_V2 },
```
**Load-bearing:** without this, `_AssertExhaustivePartition` (`220-223`) fails to typecheck. `AlertOnlyFlow`/`ALERT_ONLY_FLOWS`/`isAlertOnlyFlow`/`getFlowSurface`/`getFlowWriteTargets` all auto-pick-up. No `DESTRUCTIVE`/`TARGETED` entry (alert-only). The `unique_active_per_target` index (`schema:58-65`) gives one-active-incident-per-anchor dedup automatically.

**`apps/bridge-api/src/api/bridge/bridge.module.ts`**: add `SODAX` to `exports` (currently `[BridgeService, SubmitBridgeTxDbService, statefulBridgeTxMongooseModule]`, `bridge.module.ts:28`) so the drainer can `@Inject(SODAX)`. `sodaxProvider` is already in `providers`.

**`apps/bridge-api/src/api/bridge/bridge.service.ts`**: inject `EventEmitter2`; add `emitCreated` (mirror `swaps.service.ts:461-467`) and call it in `submitTx` on the fresh-insert branch (`result === null`, `bridge.service.ts:92-93`):
```ts
if (result === null) { this.emitCreated({ txHash: dto.txHash, srcChainKey: dto.srcChainKey }); }
```
Add `SUBMIT_BRIDGE_TX_CREATED_EVENT = 'submit-bridge-tx.created'` + `SubmitBridgeTxCreatedEvent { txHash: string; srcChainKey: string }` (mirror `swaps/constants.ts:26-33`). `EventEmitterModule.forRoot()` already registered (`app.module.ts:36-38`).

**`apps/bridge-api/src/app.module.ts`**: add `SubmitBridgeTxsModule` to `imports` (unconditional; the module self-gates via `onModuleInit` isEnabled). `RUN_SUBMIT_BRIDGE_TXS_TASK` / `submitBridgeTxsTask` config already wired (`configuration.ts:32-36,81-84`, `config.service.ts:49-51`) — no config edits needed.

**Exhaustiveness sites checked:** only `_AssertExhaustivePartition` (playbook) is a compile gate — covered by the playbook entry. No exhaustive `Record<IncidentFlow>`/switch over flows exists. `TaskLabel` is consumed only via `Partial<Record<TaskLabel,...>>` in `apps/task-executor/.../task-catchup-deps.ts` — omission is legal; the sync test asserts `keys(deps) ⊆ GUARDABLE_TASK_LABELS`, and `BRIDGE_SUBMIT_TX` is in neither, so it stays green.

---

## 7. Verification plan

**Static (all workspaces):**
- `pnpm -w checkTs` (or per-package `tsc --noEmit`) — must pass. The playbook partition gate is the highest-signal check: if you added `IncidentFlowTypes.BRIDGE_SUBMIT_GIVE_UP` without the `ALERT_ONLY_PLAYBOOK` entry, `packages/incident-manager` fails here.
- `pnpm -w lint` (biome/eslint per repo).
- Build order matters: `packages/shared-enums`, `packages/incident-manager`, `packages/shared-utils` must build before `apps/bridge-api` picks up `TaskLabel.BRIDGE_SUBMIT_TX` / `BRIDGE_SUBMIT_GIVE_UP` / the retry constants.

**Unit tests (mirror swaps test files where they exist):**
- `SubmitBridgeTxDbService`: `getToProcess` status set + dual-gate (absent-OR-compare) with mongo-mem; `claimForProcessing` +1; `markFailed` three branches (permanent jump-to-cap+backdate, transient −1 guarded `$gt:0`, non-transient consume); `updateStatus` `executed` `$unset` + abandonedAt-absent guard (assert an `executed` write is NOT blocked by `{$ne:'executed'}`); `getNewlySaturated` grace gate; `markAbandoned`/`markGivenUpAlerted` CAS `matchedCount`.
- `relayBridgeTx`: split-tx vs single-tx payload shape; envelope from `params.relayData.{address,payload}`; unmapped-chain → clear error; propagate raw relay error.
- Drainer classification: assert **RELAY_TIMEOUT consumes** (`isTransientSubmitError(err) && !isRelayTimeout(err)` = false) and **RELAY_POLLING_FAILED / 'timed out' / 5xx refunds** — the single most important new behavior. Feed both a plain `new Error('RELAY_TIMEOUT')` and a SodaxError with `context.relayCode='RELAY_TIMEOUT'` to `isRelayTimeout`.
- Alerter: single-cause path marks alerted unconditionally after raise; addressedAt non-pageable arm; no `relayedForRefundAt` reference.

**Boot-smoke (local, mongo-mem or docker mongo):**
- Set `RUN_SUBMIT_BRIDGE_TXS_TASK=true` and boot bridge-api. Assert: `SubmitBridgeTxsModule` resolves (the `STATEFUL_LOCK_MANAGER` factory binds to the stateful `locks` model), `onModuleInit` registers `submit-bridge-txs-tick`, and the heartbeat row `_id='BRIDGE SUBMIT TX'` is upserted in `task_executor_heartbeats` on the default connection.
- Insert a row via `POST /bridge/submit-tx` and confirm the immediate-kick fires (`onSubmitTxCreated` debug log) and the drainer picks it up (`claimForProcessing` bumps `processingAttempts` to 1, status → `relaying`).
- With `RUN_SUBMIT_BRIDGE_TXS_TASK` unset/false, boot and confirm the task logs "Disabled by config — skipping interval registration" and no interval is registered (the unconditional import is inert).

**Can be smoked locally:** module resolution, interval registration, heartbeat write, event kick, claim/status transitions up to the `relayBridgeTx` call, DB-method behavior against mongo-mem, and the refund-vs-consume classification (inject fake relay errors — no network).

**Cannot be smoked locally (needs network/relayer):** a real `submitIntent` + `waitUntilIntentExecuted` round-trip landing an actual `executed` packet, and a genuine RELAY_TIMEOUT saturating a row to MAX then the alerter latching `abandonedAt`. Cover the latter with a unit/integration test that stubs `relayBridgeTx` to return a `RELAY_TIMEOUT` error and asserts, over `MAX_SWAP_TX_RETRIES` ticks, that `processingAttempts` climbs to 3 (net +1/tick, no refund), `getToProcess` stops selecting it, `getNewlySaturated` returns it after the grace, and `markAbandoned` latches — proving the never-delivered packet actually abandons rather than refund-looping forever.