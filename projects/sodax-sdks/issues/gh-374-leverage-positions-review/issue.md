---
type: issue
repo: sodax-sdks
github: 374
status: Active
updated: 2026-09-12
tags: [leverage-positions, review]
---

# PR 374 — feat(leverage): leverage positions, driven from any chain

- **PR:** https://github.com/icon-project/sodax-sdks/pull/374
- **Author:** AntonAndell · **State:** OPEN · `feat/leverage-positions` → `main`
- **Contracts side:** icon-project/sodax-contracts#701
- **Task given to me:** review the PR (comment
  https://github.com/icon-project/sodax-sdks/pull/374#issuecomment-5437927848 is a prior automated
  dual-agent review, not the task itself).

## What the PR adds

Leverage **positions** — the unpooled counterpart to the leverage-yield vaults. Each position is its
own AAVE account cloned by `LeveragePositionFactory`, so one owner can hold several at different
eMode categories and leverage tiers, which a pooled vault cannot express (AAVE allows one eMode
category per address).

- `LeverageYieldService` gains position reads, raw-transaction builders for every position write, and
  orchestrated entry points (`openPosition`, `openPositionFromDebtToken`, `operatePosition`).
- `@sodax/dapp-kit` gains matching read hooks; `@sodax/types` gains the position types.
- `positionSizing.ts` (`sizeLeverageBorrow`, `projectLeverageLeg`) exists because sizing from oracle
  parity **unwound two real mainnet fills** with Aave `'36'`.
- `apps/demo` gains a leverage-positions page.

## Review base

Original review ran against `10ff233e`. Merge base with `main` is `5e57a335` — 46 files,
+6432/−36. The prior bot review had run against `3197f92a`, two commits older, so its line numbers
were already stale.

## The prior automated review

Six findings, four "medium". My review agreed on its Bitcoin findings (A, B), the approve-receipt one
(C) and the doc-signature one (G). It **missed** the demo's raw-fetch quote path and the skills gaps,
and it ran no tests or gates (self-declared "static review"). I ran everything; all gates were green
on the branch as it stood, so none of my findings were CI-detectable.

## Baseline verification I ran

| Check | Result |
| --- | --- |
| `vitest src/leverageYield/` | 173/173 pass at review time |
| `pnpm checkTs` | pass |
| `pnpm check:docs-pages` / `check:doc-links` | pass |
| `pnpm --filter @sodax/skills check:ai` | pass |

Method note: a worktree of the PR head was built and probed with real RPC/API calls. Reading alone
produced wrong answers twice (see `brief.md` §3 things).
