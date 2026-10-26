---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-14
updated: 2026-10-14
---

# 2026-10-14 — research session (idea capture input)

- Read #519 (R0bi7, idea capture, bullets per package, name prefix). User's v3 priority:
  lightweight; also wants non-weight ideas and competitor references.
- Read-only worktree of `origin/main` `77281f0c` in the session scratchpad (main checkout was on
  `feat/tron-spoke`; not touched).
- Installed the published `@sodax/*@2.2.0` packages in isolated scratch dirs with
  `--ignore-scripts`, bundled entry scenarios with esbuild, attributed bytes per package from the
  metafile, stubbed non-EVM libs for a what-if, timed Node imports, ran `tsc --extendedDiagnostics`
  and `npm audit --omit=dev`. Results → `measurements.md`; scripts → `artifacts/bundle-baseline/`.
- One agent reviewed dapp-kit / wallet-sdk-* / skills / API packages / types / libs; its
  load-bearing claims were re-checked by hand before landing in `ideas.md` (QueryClient shadowing,
  barrel re-export, chain registry imports, raw-tx schema copies, `http.ts` duplication, vendored
  typings, `useBitcoinBalance`, `useMMAllowance` key, zustand store, `isNativeToken`, ICON shim ×3,
  robinhood chain ×3, 52 `refetchInterval`s, snippet-check scope).
- One agent researched competitor SDK architectures → `competitors.md`; key facts re-checked with
  `npm view` / raw GitHub (LI.FI v4 deps + size budgets, Relay peers, anchor rename, Solana Kit
  numbers, web3.js v1 status, wagmi v3 optional connector peers, Node floors of chain libs).
- Cleanup: scratch worktree removed (`git worktree list` back to the original 6 entries), temp
  installs deleted. Re-measure with `artifacts/bundle-baseline/` (see `measurements.md` § Reproduce).
