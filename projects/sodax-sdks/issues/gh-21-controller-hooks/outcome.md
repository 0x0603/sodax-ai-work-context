---
type: outcome
repo: sodax-sdks
github: 21
status: Design drafted — needs a funding/priority decision
updated: 2026-08-12
---

# Outcome

- PR: none
- Commits: none
- Tests: n/a

## Summary

Design only, as intended. The problem is real and measurably larger than the ticket states:
**~161 exported hooks across 16 feature directories**, with swap and bridge each existing twice
(on-chain vs backend-HTTP families), and one swap form in `apps/demo` costing **23 imported
symbols, 19 wiring steps, five conditional buttons, four error states and a six-clause
`disabled` expression**.

The strongest evidence turned up during the measurement and is not in the ticket: **a consumer
already reimplemented an SDK primitive because wiring it was harder than redoing it.**
`useStatus` is exported and has zero usages in `apps/demo`, which instead hand-rolls
`useSolverStatus.ts` with its own fetch and polling — and says so in its own header comment.

## What Changed

Nothing in the repo. The proposal is in `plan.md`, the measurements in `process.md`.

## Follow-ups

- **Decide whether to fund one controller.** The recommendation is `useSwapController` only,
  proven by rewriting `SwapCard.tsx` against it — that diff is both the "before vs after" the
  ticket asks for and the honest test of its success criteria. Generalise afterwards.
- **Decide the swap lane first** — `swap/` (on-chain) or `swapsApi/` (backend HTTP). The demo
  currently uses both, and one call site bypasses the hooks entirely to call
  `sodax.swaps.createIntent` on the SDK.
- Follow `useWalletModalStore`'s discriminated-union shape rather than inventing one; it is the
  only state machine in the workspace and it is documented.
- Budget the docs: no `docs/` in `dapp-kit`, so every new public hook lands in
  `packages/skills` under `pnpm check:ai`, and mutations must register in
  `_mutationContract.test.ts`.
- FezBox's "Look at this next week" is from 2026-06-09 and nothing has moved since. This
  document is what should make the next conversation short.

## Draft comment for the issue — NOT POSTED

> Measured this before proposing anything, since "hooks are fragmented" is easy to assert.
>
> **The numbers:** ~161 exported hooks across 16 feature directories, and swap and bridge each
> exist *twice* — `swap/` (on-chain `SwapService`) alongside `swapsApi/` (backend HTTP), same
> for bridge. Any controller has to pick a lane.
>
> **One swap form costs:** `apps/demo/.../SwapCard.tsx` is 792 lines and imports 17 symbols from
> `@sodax/dapp-kit` plus 6 from `@sodax/wallet-sdk-react`. The consumer ends up owning five
> conditional buttons, four separate error `useState`s, two manual Bitcoin-readiness booleans,
> and a six-clause `disabled` expression on the Swap button (`:726-741`). That expression is
> the clearest statement of the problem in the repo.
>
> **The best evidence isn't in the issue:** `useStatus` is exported from dapp-kit and has
> **zero usages in `apps/demo`** — the demo hand-rolls `useSolverStatus.ts` with its own
> `fetch`, `MAX_POLLS` and interval, and its header comment says it "mirrors the SDK's
> SolverApiService.getStatus contract". A consumer reimplementing an SDK primitive because the
> wiring was easier to redo than to find is exactly what this issue predicts.
>
> **There's prior art to copy:** no controller/state-machine abstraction exists in dapp-kit
> (zero `useReducer`/`xstate`/`createMachine` anywhere in `packages/`), but
> `wallet-sdk-react/src/useWalletModalStore.ts` is a documented discriminated-union flow
> machine. Worth following rather than inventing a shape.
>
> My suggestion: fund **one** controller — `useSwapController` — and prove it by rewriting
> `SwapCard.tsx` against it. That diff is the before/after this issue asks for, and it's the
> only honest test of "a new partner integrates in ~30 minutes". Strawman design in my notes;
> happy to write it up on the issue if there's appetite.
