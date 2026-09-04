---
type: issue
repo: sodax-backend
github: 1090
status: Active
tags: [bridge-api, radfi, bound, bitcoin, usdt, allowance, swaps-parity]
updated: 2026-09-04
related_decisions: []
---

# GH-1090 bridge-api Bound auth + USDT approve

- Source: https://github.com/icon-project/sodax-backend/issues/1090
- Started: 2026-08-17 (resumed 2026-09-04)
- Related PR: https://github.com/icon-project/sodax-backend/pull/1097
- Parent: icon-project/sodax-sdks#375

## Problem

Two pieces of swaps-api parity `apps/bridge-api` deferred, both independent.

1. **RadFi/Bound backend HMAC auth.** `BitcoinSpokeService` builds its Bound client with
   `config.radfiSigner`, which is only populated when the consumer passes `radfi.signRequest` to
   `new Sodax(...)`. swaps-api does (#1028); bridge-api did not, so every outbound Bound request went
   unsigned and Bitcoin-source bridging never worked. Distinct from `bound.accessToken`, which
   identifies the END USER and which bridge-api already forwards.
2. **Allowance reset on `POST /bridge/approve`.** A 2017-TetherToken-lineage token (Ethereum USDT)
   rejects a non-zero → non-zero allowance change, so a wallet holding a stale allowance cannot
   approve at all. `sodax.bridge.approve` returns one transaction and cannot express the `approve(0)`
   that has to come first.

## Context

Both halves mirror work already shipped in `apps/swaps-api` — #1028/#831 for the auth, #1045 for the
reset — so the implementation is a port, and its correctness depends on what swaps-api looks like
**now**, not when the port was written. That is exactly where this one went wrong; see `process.md`.

## Acceptance Criteria

- A bitcoin-source bridge signs its Bound requests, and a deployment without the credential boots,
  serves every other chain, and answers 503 for a bitcoin source.
- `POST /bridge/approve` returns `{ tx, resetTx? }`, additive on the wire, `tx` unchanged.
- Parity with today's swaps-api in code, flow, env and docker wiring.

## Related

- Knowledge: the squash-merge merge-base trap and the "ported from X expires" rule, both in
  `process.md` — promote to `knowledge/` if either recurs.
- Decisions: none recorded separately; the two live ones (merge-not-rebase, follow swaps-api) are in
  `brief.md` § Settled.
