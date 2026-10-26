---
type: process
repo: sodax-sdks
github: 519
session: 2026-10-14
updated: 2026-10-14
---

# 2026-10-14 — scope revision (approach + feasibility per item)

- The user rejected the size-based scope: an item should be shown only once its approach is worked out
  and checked for feasibility. Every item was reworked with an approach checked in code (`77281f0c`,
  via `git archive`).
- Probes:
  - CommonJS `require()` of the sdk ESM build + `new Sodax()` (Node 22.15) ✓;
  - an ESM-only `package.json` ✓;
  - TS 5.8 `commonjs` + `node` typechecks the root import ✓; subpaths need `typesVersions` ✓ or
    `nodenext` ✓;
  - PancakeSwap ABIs-only import pulls 447 KB (incl. `@solana/web3.js`);
  - stellar `/minimal` covers all 11 imported names;
  - Privy has no wagmi peer; `@privy-io/wagmi` 4 peers `wagmi >=2`.
- Things the code reading changed:
  - features reach chains through the `SpokeService` dispatcher (direct access is only bitcoin ×20 and
    stellar ×1);
  - chain libs sit in 20 sdk files;
  - wallet-sdk-react already has a per-chain `chainRegistry.ts`;
  - raw (unsigned) tx already exists everywhere;
  - `SodaxError` already has 26 codes;
  - Anchor builds only 3 instructions and fetches the IDL on-chain twice per call;
  - `@sodax/types` is inlined only for the CJS build;
  - the backend v2 config endpoint exists (sdk fetch disabled in `ffb3e7e3f`);
  - the backend has tested Swagger specs.
- Result: 260 points (P0 116, P1 92, P2 52), down from 348. Dropped: unsigned-tx-first (exists),
  viem-style actions, bigint, Injective trim, ABI fragments. ~18 points ship non-breaking in 2.x.
