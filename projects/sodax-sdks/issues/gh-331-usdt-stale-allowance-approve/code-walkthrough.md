---
type: walkthrough
repo: sodax-sdks
github: 331
updated: 2026-08-04
tags: [erc20, approve, usdt, sdk-api, before-after]
---

# `@sodax/sdk` — code walkthrough

Before/after for every change in PR #341. Four source files plus two one-line wire changes.
`approve()` is untouched at all three layers — everything here is additive.

Commit: `3dc8dc067`.

---

## 1. `shared/services/erc-20/Erc20Service.ts` — the brain

### 1a. Pull the allowance read out so it can be shared

`isAllowanceValid` read the allowance and then threw the number away, returning only a boolean. The
planner needs the number.

```ts
// BEFORE — read inline, value swallowed
static async isAllowanceValid(params) {
  const allowedAmount = await params.publicClient.readContract({
    address: params.token, abi: erc20Abi,
    functionName: 'allowance', args: [params.owner, params.spender],
  });
  return { ok: true, value: allowedAmount >= params.amount };
}
```

```ts
// AFTER — the read is a public method; isAllowanceValid reuses it
public static async getAllowance(params: Erc20GetAllowanceParams): Promise<bigint> {
  return params.publicClient.readContract({
    address: params.token, abi: erc20Abi,
    functionName: 'allowance', args: [params.owner, params.spender],
  });
}

static async isAllowanceValid(params) {
  const allowedAmount = await Erc20Service.getAllowance(params);   // one line
  return { ok: true, value: allowedAmount >= params.amount };
}
```

### 1b. `planApproval` — entirely new

```ts
export type Erc20ApprovalPlanReason =
  | 'native-token' | 'zero-allowance' | 'probe-passed'
  | 'reset-required' | 'reset-not-viable' | 'allowance-read-failed';

export type Erc20ApprovalPlan = {
  readonly steps: readonly [bigint, ...bigint[]];   // NON-EMPTY tuple
  readonly reason: Erc20ApprovalPlanReason;
};

public static async planApproval(params: Erc20PlanApprovalParams): Promise<Erc20ApprovalPlan> {
  const single = (reason) => ({ steps: [params.amount], reason });

  if (params.token.toLowerCase() === params.nativeToken.toLowerCase()) return single('native-token');

  let allowance: bigint;
  try {
    allowance = await Erc20Service.getAllowance(params);
  } catch {
    // Without the current allowance there is no basis for a reset. Keep today's single-approve
    // behaviour rather than charging every caller an extra transaction on a transport blip.
    return single('allowance-read-failed');
  }

  if (allowance === 0n) return single('zero-allowance');    // the common path stops here

  if (await Erc20Service.canApprove(params, params.amount)) return single('probe-passed');

  // The approve reverted, but a reset only helps when the token accepts approve(0). A paused token
  // or a blacklisted owner reverts on both, and the reset would be gas spent on a certain failure.
  if (!(await Erc20Service.canApprove(params, 0n))) return single('reset-not-viable');

  return { steps: [0n, params.amount], reason: 'reset-required' };
}
```

Decision table:

| State | Plan | Reads |
| --- | --- | --- |
| native token | `[amount]` | 0 |
| allowance read throws | `[amount]` | 1 |
| allowance `== 0` | `[amount]` | 1 |
| allowance `!= 0`, probe A passes | `[amount]` | 2 |
| probe A reverts, probe B passes | `[0n, amount]` | 3 |
| both revert | `[amount]` | 3 |

`steps` is a **non-empty tuple**, not `bigint[]`. That makes `steps[0]` a plain `bigint` even under
`noUncheckedIndexedAccess`, and makes "empty plan" unrepresentable — which is what let the execution
loop drop an unreachable error branch (§ 2b).

### 1c. `canApprove` — the two details that are easy to get wrong

```ts
private static async canApprove(params: Erc20PlanApprovalParams, amount: bigint): Promise<boolean> {
  const { data } = Erc20Service.encodeApprove(params.token, params.spender, amount);
  try {
    await params.publicClient.call({ account: params.owner, to: params.token, data });
    return true;
  } catch {
    return false;
  }
}
```

- **`call`, not `simulateContract`.** USDT's `approve` returns no value, so ABI decoding fails even
  when the call succeeds.
- **`account: params.owner` is load-bearing.** The guard reads `allowed[msg.sender][spender]`;
  without it `msg.sender` is the zero address and the revert never reproduces.

Calldata reuses the existing `encodeApprove` — nothing new was written to build it.

---

## 2. `shared/services/spoke/SpokeService.ts` — the muscle

### 2a. `approve` — merge two duplicated branches, split raw from signed

```ts
// BEFORE — hub and EVM spoke were near-identical, differing only in the final annotation
if (isSpokeApproveParamsHub(params)) {
  const result = await Erc20Service.approve<Raw>({ ...params, from: params.owner, spender: params.spender } as ...);
  return { ok: true, value: result satisfies TxReturnType<HubChainKey, Raw> as TxReturnType<K, Raw> };
}
if (isSpokeApproveParamsEvmSpoke(params)) {
  const result = await Erc20Service.approve<Raw>({ ...params, from: params.owner, spender: params.spender } as ...);
  return { ok: true, value: result satisfies TxReturnType<EvmChainKey, Raw> as TxReturnType<K, Raw> };
}
```

```ts
// AFTER — one branch, raw and signed clearly separated
if (isSpokeApproveParamsHub(params) || isSpokeApproveParamsEvmSpoke(params)) {
  if (params.raw) {
    // A two-step plan cannot be expressed as a single `tx`, so the unsigned path is left exactly
    // as it was; buildApproveTxs is the entry point that returns the whole plan.
    const tx = await Erc20Service.approve<Raw>({ ...params, from: params.owner, spender: params.spender } as ...);
    return { ok: true, value: tx satisfies TxReturnType<EvmChainKey, Raw> as TxReturnType<K, Raw> };
  }

  const result = await this.executeErc20ApprovalPlan<Raw>(params);
  if (!result.ok) return result;
  return { ok: true, value: result.value satisfies TxReturnType<EvmChainKey, Raw> as TxReturnType<K, Raw> };
}
```

The merge is sound because `HubChainKey ⊂ EvmChainKey`, so both `TxReturnType`s resolve to the same
`EvmReturnType<Raw>` — the original duplication was redundant, not deliberate.

### 2b. `executeErc20ApprovalPlan` — new, private

```ts
private async executeErc20ApprovalPlan<Raw extends boolean>(params): Promise<Result<TxReturnType<EvmChainKey, Raw>>> {
  const { walletProvider } = params;
  invariant(walletProvider !== undefined && isEvmWalletProviderType(walletProvider), '...');

  const plan = await this.planErc20Approval(params, 'approve');
  const sendApprove = (amount: bigint): Promise<Hex> =>
    Erc20Service.approve<false>({ token: params.token, amount, from: params.owner,
                                  spender: params.spender, raw: false, walletProvider });

  // The plan is non-empty by construction, so the first step always exists. Every later step is a
  // real approval that only becomes valid once the one before it has landed.
  let txHash = await sendApprove(plan.steps[0]);

  for (const amount of plan.steps.slice(1)) {
    const receipt = await this.waitForTxReceipt({ txHash, chainKey: params.srcChainKey });
    if (!receipt.ok || receipt.value.status !== 'success') {
      return { ok: false, error: new Error(
        `[SpokeService.approve] allowance reset transaction ${txHash} did not confirm. Retry the approval — once the reset has landed it takes a single transaction.`) };
    }
    txHash = await sendApprove(amount);
  }

  return { ok: true, value: txHash satisfies TxReturnType<EvmChainKey, false> as TxReturnType<EvmChainKey, Raw> };
}
```

Three properties worth keeping in mind when reading it:

- **Returns the last hash** → `Promise<Hash>` is unchanged, so a consumer already doing
  `waitForTransactionReceipt(result.value)` stays correct.
- **Aborts before the next step** if a reset does not confirm — no transaction is sent that is
  certain to revert.
- **Self-healing.** Once the reset has landed the allowance is zero, so a retry plans one step.

An earlier draft of this loop tracked `lastTxHash: Hex | undefined` and ended with an
`if (lastTxHash === undefined)` error that could never fire. Typing `steps` as a non-empty tuple
removed the need for it.

### 2c. Two helpers extracted from what was duplicated

```ts
/** The one place that knows how to map SpokeApproveParams onto the planner's input. */
private async planErc20Approval(params, caller: 'approve' | 'buildApproveTxs'): Promise<Erc20ApprovalPlan> {
  const plan = await Erc20Service.planApproval({
    token: params.token, owner: params.owner, spender: params.spender, amount: params.amount,
    nativeToken: this.config.getChainConfig(params.srcChainKey).nativeToken as Address,
    publicClient: this.getEvmPublicClient(params.srcChainKey),
  });
  this.logApprovalPlan(caller, params.srcChainKey, params.token, plan);
  return plan;
}

/** The read client for an EVM chain, whether it is the hub or a spoke. */
private getEvmPublicClient(chainKey: HubChainKey | EvmSpokeOnlyChainKey): PublicClient {
  return isHubChainKeyType(chainKey) ? this.sonic.publicClient : this.evm.getPublicClient(chainKey);
}
```

`logApprovalPlan` only writes a line when the plan says something — an extra transaction the user
will have to sign, or a probe that reached no verdict. The ordinary path stays silent instead of
logging on every approve.

### 2d. `buildApproveTxs` — new, public

```ts
public async buildApproveTxs<K extends SpokeChainKey>(
  params: SpokeApproveParams<K, true>,
): Promise<Result<{ txs: TxReturnType<K, true>[] }>> {
  if (isSpokeApproveParamsHub(params) || isSpokeApproveParamsEvmSpoke(params)) {
    const plan = await this.planErc20Approval(params, 'buildApproveTxs');
    const txs = await Promise.all(
      plan.steps.map(amount =>
        Erc20Service.approve<true>({ token: params.token, amount, from: params.owner,
                                     spender: params.spender, raw: true })),
    );
    return { ok: true, value: { txs: ... } };
  }
  // Stellar → its single trustline tx; any other chain → error
}
```

---

## 3. `swap/SwapService.ts` — the feature-layer mirror

`approve` is unchanged. `buildApproveTxs` mirrors it, including the same spender resolution:

```ts
public async buildApproveTxs<K extends SpokeChainKey>(_params: SwapActionParams<K, true>) {
  const { params } = _params;
  if (isHubChainKeyType(params.srcChainKey) || isEvmSpokeOnlyChainKeyType(params.srcChainKey)) {
    const spender = isHubChainKeyType(params.srcChainKey)
      ? this.solver.intentsContract                                             // hub
      : this.config.getChainConfig(params.srcChainKey).addresses.assetManager;  // spoke
    const result = await this.spoke.buildApproveTxs<HubChainKey | EvmSpokeOnlyChainKey>({
      srcChainKey: params.srcChainKey, owner: params.srcAddress as ...,
      token: params.inputToken as ..., amount: params.inputAmount, spender, raw: true,
    });
    if (!result.ok) return { ok: false, error: approveFailed('swap', result.error) };
    return { ok: true, value: { txs: ... } };
  }
  // Stellar, then the unsupported-chain error
}
```

Not wrapped in `trackResult`: `SwapService.approve` is not either — only `swap()` carries analytics.

---

## 4. `leverageYield/LeverageYieldService.ts` — the last bypass removed

This was the only caller reaching `Erc20Service.approve` without going through `SpokeService`, so it
never got the planner.

```ts
// BEFORE — direct call, dead-ends on a guarded token
const tx = await Erc20Service.approve<false>({ ...baseApprove, raw: false, walletProvider: params.walletProvider });
return { ok: true, value: tx as TxReturnType<HubChainKey, R> };
```

```ts
// AFTER — through SpokeService, gets the planner for free
const result = await this.spoke.approve<HubChainKey, false>({
  srcChainKey: this.hubProvider.chainConfig.chain.key,
  token: baseApprove.token, amount: baseApprove.amount,
  owner: from, spender: baseApprove.spender,
  raw: false, walletProvider: params.walletProvider,
});
if (!result.ok) return { ok: false, error: approveFailed('leverageYield', result.error, baseCtx) };
return { ok: true, value: result.value as TxReturnType<HubChainKey, R> };
```

The `raw` branch still calls `Erc20Service.approve<true>`. The error code stays `APPROVE_FAILED`.

---

## 5. Wire contract — two lines

```ts
// packages/types/src/backend/backendApiV2.ts
export interface ApproveResponseV2 {
  tx: RawTxReturnType;
  resetTx?: RawTxReturnType;      // added, optional
}

// packages/swaps-api/src/schemas.ts
v.object({ tx: txSchema })                                  // before
v.object({ tx: txSchema, resetTx: v.optional(txSchema) })   // after
```

---

## Public surface, before and after

| | Before | After |
| --- | --- | --- |
| `Erc20Service.approve` | 1 tx | **unchanged** |
| `Erc20Service.getAllowance` | — | new |
| `Erc20Service.planApproval` | — | new |
| `SpokeService.approve` (raw) | 1 tx | **unchanged** |
| `SpokeService.approve` (signed) | 1 tx, 0 reads | 1–2 tx, 1–3 reads, returns the last hash |
| `SpokeService.buildApproveTxs` | — | new |
| `SwapService.buildApproveTxs` | — | new |
| `ApproveResponseV2.resetTx` | — | new, optional |

**No export removed, no signature changed.** Verified by inspecting every removed line in
`packages/{sdk,types,swaps-api}/src` — all of them sit inside method bodies or imports. SemVer
`minor`, matching the changeset.

## Behavioural changes that are not type-level

1. **A signed approve can prompt the wallet twice**, on a guarded token where the wallet already
   holds an allowance. The return value is still one hash — the last transaction's.
2. **Every signed approve now costs at least one extra read.** The path used to touch the chain zero
   times. Native token = 0, ordinary wallet = 1, stale allowance = 2–3.

Neither breaks a caller. Callers that assume "one approve = one transaction" for gas estimation, and
UI that renders a single "Approving…" from `isPending`, are the two places worth a second look.
