---
type: plan
repo: sodax-sdks
github: 21
updated: 2026-08-12
---

# Plan

## Goal

Turn "we should have controllers" into a concrete, costed proposal for **one** controller, so
the decision to fund it is a short conversation rather than an open-ended one.

## Approach

**Design from the real consumer, not from the ticket's wish list.**
`apps/demo/src/components/swaps/SwapCard.tsx` is 792 lines and imports **17 symbols from
`@sodax/dapp-kit` and 6 from `@sodax/wallet-sdk-react`** to ship one swap form. That file is
the specification: everything it does that is not rendering is what `useSwapController` has to
absorb. The measurements are in `process.md`.

**Copy the pattern that already exists in the workspace, don't invent one.**
`packages/wallet-sdk-react/src/useWalletModalStore.ts:9` is a documented discriminated-union
flow machine (`closed → chainSelect → walletSelect → connecting → success | error`,
Zustand-backed, `docs/WALLET_MODAL.md`). There is no controller/state-machine abstraction in
`dapp-kit` at all — zero `useReducer`, `xstate` or `createMachine` anywhere in `packages/` —
so this is the nearest prior art and the shape to follow.

**Ship one, prove it, then generalise.** Swap first: it is the most fragmented, it is the one
with a real consumer to diff against, and the "before vs after" in `apps/demo` that the ticket
asks for is only meaningful for a feature someone has actually wired by hand.

## Proposed shape for `useSwapController`

Sketch, to be argued rather than accepted as-is:

- **State** — a discriminated union, not a bag of booleans:
  `idle | needsChainSwitch | needsSetup(reason) | needsApproval | approving | ready |
  submitting | pending | settled | failed(error)`. `needsSetup` covers the three quirks the
  ticket names (Bitcoin trading wallet, Stellar trustline, NEAR storage) behind one branch, so
  the consumer renders one "resolve this" affordance instead of five conditional buttons.
- **One action** — `next()`, which does whatever the current state requires: switch chain,
  register storage, establish trustline, approve, or submit.
- **Escape hatches** — the underlying hooks stay exported and the controller exposes the raw
  sub-results, so an advanced consumer can drive any single step directly. The ticket requires
  this and it is what makes the controller additive rather than a fork.
- **Typed result** — one `error` surface rather than the four separate `useState`s the demo
  carries today.

## Steps

1. Agree the state union and the `next()` contract (this document is the strawman).
2. Build `useSwapController` in `packages/dapp-kit`, composing the existing hooks — no changes
   to them.
3. Rewrite `SwapCard.tsx` against it; the diff **is** the before/after the ticket asks for, and
   the honest measure of the success criteria.
4. Only then generalise the shared building blocks and sketch the other four.

## Verification

- The rewritten `SwapCard.tsx` is dramatically shorter, and specifically loses the six-clause
  `disabled` expression, the four error states and the two manual readiness booleans.
- `pnpm check:ai` green — `packages/skills` must be updated for any new public hook.
- New mutation hooks registered in `packages/dapp-kit/src/hooks/_mutationContract.test.ts`.
- `pnpm check:doc-links` if any mirrored doc changes.

## Risks

- **Scope.** Five controllers is a large surface; one controller that demonstrably shrinks a
  real consumer is the honest first deliverable.
- **The swap feature is split in two** — `swap/` (on-chain `SwapService`) and `swapsApi/`
  (backend HTTP). A controller has to pick a lane or abstract over both, and that decision
  should be made explicitly, not discovered mid-build.
- **Docs cost is real**: `packages/dapp-kit` has no `docs/` directory; all consumer docs live in
  the `packages/skills` tree and `pnpm check:ai` gates them.
