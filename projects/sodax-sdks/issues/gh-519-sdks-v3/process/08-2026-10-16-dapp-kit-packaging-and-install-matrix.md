---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — dapp-kit packaging and install matrix

- **Question:** should dapp-kit be split into many packages, and how can users of the API or of the
  SDK install only what they need?
- **dapp-kit at cc053fef:**
  - dependencies are `@sodax/sdk` and viem;
  - 88 API-lane hook files go through `sodax.api.*` / `sodax.backendApi.*`;
  - 81 of them import types (and `isAuthFailure`) from `@sodax/sdk`;
  - the leverage-yield and backend clients exist only inside the sdk.
- **Measured (npm, `--ignore-scripts`):**
  - swaps-api + bridge-api: 5.2 MB;
  - the same plus react-query, react and react-dom: 21 MB, 0 advisories.
- **Recommendation** (`plan-v3-order.md` §11):
  - split only along install-weight axes (SDK vs API, chain, wallet); features stay subpaths;
  - add an sdk-free API-hooks package on `@sodax/api`, re-exported by dapp-kit, so nothing breaks;
  - move chain-specific dapp-kit hooks to per-chain subpaths in 3.0;
  - per-persona install fixtures in CI;
  - an install matrix in the docs.
- **New sub-issues (proposed):** T28.4, T13.6–T13.10, T24.3. Totals are now 432 / 155; 231 are
  required for 3.0.
