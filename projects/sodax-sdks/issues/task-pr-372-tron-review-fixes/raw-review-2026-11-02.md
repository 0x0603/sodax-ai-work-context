---
type: review
repo: sodax-sdks
github:
status: Active
updated: 2026-11-02
---

# Local raw-mode review

Scope: uncommitted diff against `665a215e` in hub worktree
`repos/client/sodax-sdks-wt-534`, branch `feat/tron-mpc-integration`.
Read-only code review; no implementation changes, commits, pushes or PR comments in the SDK repo.

## Findings

1. **P2 — operation-specific raw return types.** `packages/types/src/tron/tron.ts:48-52`
   adds `TronRawWithdraw` to every raw Tron return. A consumer calling
   `tron.deposit<true>(params)` cannot pass the result to `wallet.signTransaction`;
   `tron.sendMessage<true>(params)` cannot access `.digest` or pass its result to
   `submitSignedWithdraw`. Reproduced three TypeScript diagnostics using the public
   method signatures. The new test casts the result to `TronRawWithdraw`, hiding this.
   Keep the broad union only where the operation is actually unknown; narrow each
   known operation with appropriate return types/overloads and test a consumer without casts.
2. **P2 — incomplete browser-signing contract.** `TronRawTransaction` permits omission
   of `raw_data`, and `signAndSendTransaction` passes it unchanged to `trx.sign`.
   The browser test's signer simply attaches signatures to arbitrary bytes. Actual
   TronWeb 6.1.0 reads `transaction.raw_data.contract[0]` before signing. Require a
   usable decoded body for browser handoff (consistent with the serialized bytes),
   or reconstruct it before handing the transaction to the wallet. No live wallet test.
   Source: https://github.com/tronprotocol/tronweb/blob/v6.1.0/src/lib/trx.ts#L555-L585
3. **P2 — raw deposit signing lifetime.** `TronSpokeService.ts:193-196` now builds the
   node transaction before returning raw, preserving the node expiration with no
   configurable extension/refresh API. Deferred signing can expire it before broadcast;
   the new fixtures use expiration=1 and mocked broadcasts never enforce it. Define
   expiration/rebuild behavior for deferred signing, update bytes and txID together
   before signing, and cover delayed/expired cases. Never mutate a signed transaction.
   Default deadline is about 60 seconds, maximum 24 hours:
   https://developers.tron.network/docs/tron-protocol-transaction

## Verification

- SDK 3,313 tests, wallet-sdk-core 196 tests, types 1,197 tests pass.
- Workspace checkTs passes after dependency builds (15/15 cached final run);
  initial concurrent run saw stale wallet-sdk-react declarations in swap-api-example.
- Lint, check:ai, check:ai-dev-files, check:doc-links, check:docs-pages,
  check:docs-nav and diff whitespace checks pass.
- Live E2E: 9 passed / 9 failed; network-dependent calls fail with DNS errors.
- Mintlify validation unavailable: `mint` command missing.
- Architecture is appropriate: separate on-chain deposit bytes and off-chain withdraw
  authorization; no reverse package dependency added. Duplicate raw/unsigned shapes can
  use an alias. Digest recomputation at submit is optional defensive validation, not a
  demonstrated signature-verification bypass; do not claim it as one.
