---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — feasibility check

- **Question:** the user asked whether the plan is feasible.
- **New facts:**
  - downstream repos construct `SpokeService` / `EvmHubProvider` directly 0 times;
  - sdks `main` received 135 non-merge commits in 90 days, mostly from three people;
  - remote branches `feat/ton-mpc-integration` and `feat/zcash-mpc-integration` exist besides the
    open chain PRs.
- **Written up in `plan-v3-order.md` §10:** proven vs code-read vs unverified, capacity (5–8 months
  alongside feature work), coordination risk, and a de-risking order.
- **Added rule:** CJS consumers use only the root entry in 2.x, to avoid the dual-package hazard.
