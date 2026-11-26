---
type: process
repo: builders-sodax-mcp-server
status: Design research complete
updated: 2026-11-26
tags: [mcp, wallet, research]
---

# Evidence · 2026-11-26

## Local source snapshots

Hub card is stale about read-only behavior/domain, so actual local git objects were used.

- Development: `a36489d1fb1fed615f3f3045696c13562119c94a` (2026-11-23 snapshot).
- Bridge feature: `a78690e830315236397d1360f2637adf67788745`; not assumed merged.
- `src/tools/swap.ts`: prepare returns ordered steps; `afterSend.needs` is txHash. Submit-and-track expects the wallet to have broadcast first.
- `src/services/swap/sources/types.ts`: NEAR, Stellar, Sui, Solana, Injective non-EVM sources. Provider signing support alone does not enable other source chains.
- `src/services/swap/sources/nonEvm.ts`: raw SDK objects converted to JSON; bigints as decimal strings, byte arrays as base64. Adapter must interpret actual family shape.
- Bridge `src/tools/bridge.ts` and `src/services/bridge/prepare.ts`: same source-hash tracking model, bridge ID and ordered steps.
- Source evidence preserves NEAR successful receipts despite later failures.

## Primary references

- https://docs.privy.io/wallets/overview/chains — different signing/broadcast support tiers.
- https://docs.privy.io/controls/authorization-keys/owners/overview — owner versus scoped signer authority.
- https://docs.privy.io/recipes/tier-2-wallet-integration — Sui/Stellar/NEAR signing examples.
- https://docs.privy.io/recipes/tier-1-wallet-integration — TON cells and wallet contract assumptions.
- https://docs.privy.io/wallets/using-wallets/tron/sign-a-transaction — structured sign-only API.
- https://docs.privy.io/wallets/using-wallets/other-chains — raw-sign parameters.
- https://docs.privy.io/controls/policies/example-policies/sui — parsed versus opaque signing policies.
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports — stdio subprocess versus HTTP deployment.

Sui example mentions blake2b256 while generic raw-sign reference lists fewer hash algorithms. Resolve against actual API/SDK before enabling. Provider examples are research input, not verified payload interoperability. No provider credentials used, wallet setup, live signing or transactions.

## Scope and sync

Git pull failed: github.com DNS resolution unavailable. Existing unrelated gh-118 brief and source-adapter-plan edits were left untouched. No source branch/checkout changes, code edits or hub-pointer commits. Personal notes remain only in this private context repo, following the user's explicit workspace rule.
