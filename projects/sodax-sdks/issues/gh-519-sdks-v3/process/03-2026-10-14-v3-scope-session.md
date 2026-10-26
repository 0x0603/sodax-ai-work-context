---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-14
updated: 2026-10-14
---

# 2026-10-14 — v3 scope session (work, packages, difficulty, points)

- User asked for a scope: difficulty, work, packages, points. Result → `plan-v3-scope.md`.
- Sized the code on `origin/main` `77281f0c` (extracted with `git archive`, no worktree): LOC per
  package and sdk area, the 208 chain-type branches in 14 feature files, chain-lib imports per package,
  dapp-kit hooks (214 files, 126 queries, 210 keys), wallet-react structure, error styles, `Buffer`
  uses, existing raw-tx support, docs / skills / apps size.
- Downstream usage, counted on each repo's default branch: sodax-frontend 132 files, sodax-backend 99
  (CommonJS, Node 22.18, `moduleResolution: node`), intents-whitelabel 42.
- Public-API checks that decide "breaking":
  - ABIs, `BigNumber` math utils and PancakeSwap `Price<Token, Token>` / `Token` are all exported from
    the sdk root.
  - `useSwapLifecycle` and EIP-5792 batching are not on main yet (PR 504).
- wagmi v3 breaking changes (context7, wagmi docs): `useAccount` → `useConnection`, `mutate` API,
  connector SDKs as optional peers.
- The New World project's `Estimate` field is unused (4 of 372 items), so the points use a proposed
  Fibonacci scale.
