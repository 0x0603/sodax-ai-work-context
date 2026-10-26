---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-16
updated: 2026-10-16
---

# 2026-10-16 — every package rethought

- **Request:** research and rethink all packages.
- **Facts gathered:**
  - workspace manifests and dependency graph;
  - `@sodax/assets` is private and unpublished;
  - `@sodax/libs` has 3 Turbopack-workaround subpaths, imported by the sdk, wallet-sdk-core and
    wallet-sdk-react (3 files each);
  - downstream imports: sdk 122/97/22, dapp-kit 42/0/18, wallet-sdk-react 51/0/26, types 3/3/14, and
    0 for wallet-sdk-core, swaps-api, bridge-api and libs;
  - npm weekly downloads (some transitive);
  - wallet-sdk-react builds each chain's signer from wallet-sdk-core.
- **Result:** `plan-v3-packages.md` — principles, the target map, dependency picture, persona
  matrix, peer comparison, timeline, risks.
- **Changed decisions:**
  - the API hooks go to `@sodax/api/react` (renumbered T13.6–T13.9 → T28.5–T28.8);
  - wallet-sdk-core folds into `@sodax/sdk/wallet` with a shim (T6.7, new);
  - `@sodax/libs` is retired into chain-stacks and chain-injective (T1.30, new);
  - kept separate on purpose: dapp-kit vs wallet-sdk-react, types vs api, api vs sdk.
- **Totals:** 453 pts / 162 sub-issues; 239 required for 3.0; 19 breaking.
