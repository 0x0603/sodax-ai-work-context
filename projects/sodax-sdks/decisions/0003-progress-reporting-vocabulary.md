---
type: decision
scope: sodax-sdks
status: Accepted
tags: [dapp-kit, progress, ux, approvals, api-design, yagni]
date: 2026-08-17
related_issues: [376, 375]
---

# 0003 — Approval progress: one flat event, local to dapp-kit

> Status and scope live in the frontmatter above (single source of truth).

## Context

`useBridgeApiApproveAndBroadcast` (PR #379) can broadcast two transactions: an `approve(0)` that must
be mined first, then the real approval. The consumer only gets `isPending`, so the UI shows one
undifferentiated "Approving…" across **two wallet prompts** — and the first is an approval for zero,
which reads like a bug or a double charge. `apps/demo` did exactly that.

Checked before deciding:

- `SpokeService.approve` on the **signed** path (`packages/sdk/.../SpokeService.ts:397-413`) also sends
  reset → wait → approve, so the same UX gap exists inside the SDK.
- In dapp-kit, `utils/approvalPlan.ts` is the only client-side broadcaster; everything else delegates
  to the SDK.
- `rg 'onProgress|onStep|onStatus'` across sdk + dapp-kit found no prior art.

A first implementation generalised for those future emitters: a `SodaxProgressEvent` union in
`@sodax/types` with a `planned` announcement event, `runId`, `flow`, `chainKey` and a `skipped` phase.
It type-checked and passed tests, but the consumer paid for it — the demo needed a `useRef` to
remember the announced plan and a branch on `event.kind` just to render one line of text.

## Decision

**One flat event, defined in `packages/dapp-kit/src/utils/approvalPlan.ts` next to `ApprovalPlan` and
`ApprovalHashes`.**

```ts
type ApprovalProgress = {
  step: 'allowance-reset' | 'approve';
  phase: 'signing' | 'broadcast' | 'confirmed' | 'failed';
  index: number;   // 1-based
  total: number;   // 1 or 2
  hash?: string;   // from `broadcast` on
  error?: unknown; // `failed` only
};
```

Passed as `onProgress` in the **mutation vars** (never a stale closure), emitted by a three-line local
`report()` helper inside `runApprovalPlan`, wrapped in `try/catch` so a listener that throws cannot
abort a broadcast the user has already paid for. Consumer code is one line:
`onProgress: p => setLabel(...)`.

Dropped from the first implementation, each for the same reason — the caller already has it, or
nothing emits it yet:

| Dropped | Why |
| --- | --- |
| `runId` | The listener is per-call; the caller owns the closure and can correlate itself |
| `planned` event + `kind` union | `index`/`total` carry the same information without a second shape or a `useRef` |
| `flow` | The caller chose the hook, so it knows whether this is swap or bridge |
| `chainKey` | The caller passed `srcChainKey` in the body |
| `skipped` phase | Nothing emits it; a step the token does not need is simply absent |
| Types in `@sodax/types` | No consumer outside dapp-kit today |

## Consequences

- The consumer-side cost is one line, which is the number that decides whether this gets used.
- No public API added to `@sodax/types`, the lowest layer, for a single in-package consumer.
- Promoting it later is cheap and non-breaking: dapp-kit re-exports `@sodax/sdk` wholesale, so moving
  the type down and re-exporting keeps every `@sodax/dapp-kit` import working.
- Lost: a stepper cannot render both steps greyed-out before the first prompt, because nothing is
  announced up front. "1/2" and "2/2" still appear at the right moments, which is what the copy needs.
- The `try/catch` is the one piece of defensiveness kept on purpose: a UI bug between the reset and
  the approve would otherwise leave the user having paid for the reset with nothing sent after it.
- If the SDK's signed approve path ever emits progress, revisit this ADR rather than copying the type
  — that is the moment the shared-vocabulary argument actually applies.

## Alternatives considered

- **Shared `SodaxProgressEvent` vocabulary in `@sodax/types`** (the first implementation) — designed
  for emitters that do not exist yet, and charged the only real consumer a `useRef` plus a union
  branch for the privilege.
- **Return the current step from the hook** — breaks the uniform `SafeUseMutationResult` shape every
  dapp-kit mutation hook returns, and re-renders consumers that only wanted a toast.
- **Reuse the `analytics` tracker** — wrong lifetime and wrong consumer: global, aggregate, routinely
  switched off, and impossible to correlate to one button click without threading an id anyway.
- **Drop the `try/catch`** — one line shorter, but a throwing listener would strand the user between
  the two transactions.

## Related

- Issues: icon-project/sodax-sdks#376, icon-project/sodax-sdks#375
- PRs: icon-project/sodax-sdks#379
- Code: `packages/dapp-kit/src/utils/approvalPlan.ts`, `apps/demo/src/components/bridge-api/BridgeCard.tsx`
