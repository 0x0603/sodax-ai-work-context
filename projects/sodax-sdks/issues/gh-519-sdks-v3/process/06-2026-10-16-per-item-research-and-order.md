---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — per-item research, work order and sub-issues

- **The request:** research how each of the 36 items is done; order them so nobody steps on anyone
  and every dependency is explicit; split the big ones into sub-issues.
- **Fan-out.** Four background research agents, one per cluster, all read-only:
  - each worked on an extracted `git archive cc053fef` tree in the scratchpad;
  - each probed only in its own scratch dir, with npm `--ignore-scripts` and never pnpm;
  - no GitHub writes.

  The checkout and the worktrees were not touched; the main clone stayed on `main` at cc053fef.
- **In-flight work mapped from `gh pr diff --name-only`:**
  - #534 Tron + MPC settle; it replaced #372;
  - drafts #497 XRP and #498 Monad (stacked on #497); #95 Aleo; #163 wallet-hw;
  - #483 (`!`, conflicting); #488; #501;
  - the user's #509, #511, #512, #523; issues #529, #531, #532, #533.
- **Release flow read.** One forward line, `main` → `release`, with the four checks in `release.mjs`.
  The `PACKAGES` list is hard-coded in three places.
- **Verification.** About 40 load-bearing claims re-checked by hand (`plan-v3-order.md` §9). Two
  probes went to live endpoints:
  - CORS preflight: the relay allow-list excludes `x-request-id`; swaps echoes it;
  - `GET /v2/be/config/all`: 200, version 2020008.

  Corrections found: `spoke.bitcoin` 21 (not 20); `walletProvider` in 55 hook files (not ~70); Aleo
  WASM 55 MB (not 43).
- **Reconciliation across clusters:**
  - wallet boundary H (no `./react` in chain packages);
  - one `WalletProviderSource`: D's T22.1 defines it, with C's `subscribe()`;
  - viem peers: sdk `^2.29.2`, wallet-sdk-react `>=2.43` (wagmi v3);
  - the T4.2 ↔ T13.3 cycle broken: T4.2 first, then T13.3.
- **Lead-added gaps:**
  - T13.5: dapp-kit chain hooks use the spoke getters;
  - T17.3 and T17.7: B/C codemod transforms;
  - T19.6: backend log capture;
  - T7.0: TS 5.9 and a current viem.
- **Synthesis data.** `artifacts/v3-probes/subissues.psv`, validated by `check.py`: no unknown
  dependencies, no backwards waves, no cycles. `gen.py` produces the critical path and the totals.
- **Totals.** 413 pts across 148 sub-issues; 229 required for 3.0.0; 17 breaking (62 pts).
- **Files:**
  - `plan-v3-order.md`, `plan-v3-subissues.md`;
  - `research/*.md` (the agent reports, with reconciliation headers);
  - `artifacts/v3-probes/`.
- **Not done.** Nothing filed on GitHub: #519 is R0bi7's board. Nothing posted, no icon-project code
  changed.
