---
type: process
repo: builders-sodax-mcp-server
github: 79
updated: 2026-10-22
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-10-21 — orientation
The user asked what the epic is and how to test it. I found it as `gosodax/builders-sodax-mcp-server#79`, with
sub-issues #80–#89, all assigned to R0bi7. The "@0xmatterhorn" in the handoff note returns 404 as a GitHub user.

### 2026-10-22 — plan v1 → throwaway prototype → plan v2
- Plan v1 was built from code reads in three repos and live API probes. Two Explore agents covered sodax-sdks and
  sodax-backend at origin/main 6ce004cd.
- After ExitPlanMode approval I implemented #80–#87 in a fresh clone (uncommitted, ~4k lines). The user stopped this:
  they wanted plan and notes only. **The code was deleted.** The prototype's findings went into plan v2 and are listed
  below.
- I then audited plan v1 against the user's bar (optimised, easy to use, standard code, reuse) and wrote plan v2.

## Findings (prototype and probes, 2026-10-22)

All of these are verified by a live probe unless marked otherwise.

**Swaps API (canary)**
- `POST /swaps/quote?includeTxData=true` produced `deadline: "0"` and `minOutputAmount == quotedAmount`.
- `POST /swaps/intents` keeps an explicit `minOutputAmount` and `deadline`.
- `POST /swaps/approve` returns ERC-20 `approve(assetManager, exactAmount)`.
- `checkAllowance` returned `{valid:false}` for a fresh address.
- The minimum amount for Arbitrum USDC → Base USDC sits between 1 and 5 USDC.

**Package weight and advisories**
- `npm audit`: `@sodax/sdk@2.2.0` has 35 advisories (11 high, 13 moderate, 11 low). `@sodax/swaps-api` +
  `@sodax/types` + viem has 0.
- Import cost: the full SDK takes 1.2 s and adds 242 MB RSS. The light set takes 8 ms and adds 40 MB. These match
  the user's v3 `measurements.md` (2026-10-14).

**Chain readers (read-only, live)**
- All 9 families returned a balance, a receipt with `success`, and `pending` for an unknown hash.
- Sui: public fullnode JSON-RPC answers "JSON-RPC on public fullnodes has been deprecated". GraphQL at
  `https://graphql.mainnet.sui.io/graphql` works:
  - `address(address){balance(coinType){totalBalance}}`
  - `transaction(digest){effects{status executionError{message}}}`
- ICON and NEAR return JSON-RPC errors with HTTP 400. Read the body before the status.
- NEAR `tx` needs `{tx_hash, sender_account_id}`. An unknown tx comes back as `cause.name UNKNOWN_TRANSACTION`, with
  the real reason in `error.data`.
- ICON: `icx_getTransactionResult` only has a result for a tx about 1 block after it lands. Before that it reports
  pending.
- Solana: `getTokenAccountsByOwner` with a mint filter can exceed 1 MB for program-authority addresses. Normal wallets
  are fine.
- Injective: the LCD answers an unknown tx with HTTP 400.

**Resolver**
- Name-substring matching hit "Tether" for "eth". Plan v2 uses symbol substring or a name word that starts with the
  query.

**EVM calldata**
- Decoding a built swap tx with the SDK's `spokeAssetManagerAbi` showed that `relayData.payload` sits verbatim in the
  calldata, and the payload holds the intentId, minOut and deadline. So intent recovery from chain is feasible. Plan
  v2 proposes it as backend follow-up (c).

**End-to-end smoke (prototype, local server on canary, MCP SDK client)**
- Default profile showed 45 tools, builder 40, swap 5.
- An unknown profile returned 400 `-32602`.
- A price-only quote worked.
- `AMOUNT_TOO_LOW` mapped correctly.
- A quote with an address returned approve + swap steps.
- A seed phrase in `fromAddress` was rejected.
- An untracked hash raised a false alert. Plan v2 fixes this.

## Changes During Work

- Plan v1 → v2: see plan.md §2 (audit table).
- The prototype clone at `sodax/builders-sodax-mcp-server` was deleted on the user's request.
