---
type: issue
repo: sodax-sdks
github: 358
status: Active
tags: [sui, grpc, json-rpc, dapp-kit, deprecation, breaking-change]
updated: 2026-08-10
related_decisions: [2]
---

# GH-358 Sui Grpc Migration

- Source: https://github.com/icon-project/sodax-sdks/issues/358
- Started: 2026-08-10
- Related PR:

## Problem

Raw issue body (parent issue, sub-issues track per-repo work):

> Sui turned off JSON-RPC on their public fullnodes on 2026-07-27. `https://fullnode.mainnet.sui.io`
> and `https://fullnode.testnet.sui.io` now answer every method with:
>
> ```json
> {"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found. JSON-RPC on public fullnodes has been deprecated. Please migrate to gRPC or GraphQL endpoints."}}
> ```
>
> That host is our default in the SDK, the frontend and the whitelabel app, and the backend inherits
> it from the SDK — so Sui reads and transaction submission are broken anywhere it isn't explicitly
> overridden.
>
> Migration notice: https://docs.sui.io/develop/accessing-data/json-rpc-migration
>
> Sub-issues track the per-repo work.

Prior work: #359 / PR #360 (merged) was a **stopgap** — it repointed the packaged default at
`https://sui-rpc.publicnode.com`, a third party running `sui-node` with JSON-RPC still enabled.

## Context

Sui's published decommission schedule makes the stopgap short-lived:

| Milestone | Date |
| --- | --- |
| Disabled on Sui Foundation mainnet fullnodes | week of 2026-07-27 (done) |
| Snapshots stop being published | end of 2026-08 |
| Fallback paths disconnected | end of 2026-09 |
| **JSON-RPC code removed from fullnodes** | **mid-2026-10** |

Once the code leaves `sui-node`, publicnode dies too — no operator can keep JSON-RPC alive. Every
JSON-RPC path is on a ~2-month fuse from 2026-08-10.

User's framing for this work: switch the SDK to gRPC, safe, minimal diff, but *think long term* —
"sau PR này không cần quan tâm đến issue này nữa" (after this PR I never want to see this issue again).
That goal is what forced the scope from "SDK only" to the whole Sui stack.

## Acceptance Criteria

- No JSON-RPC anywhere in the repo — no transport flag, no deprecation window, no follow-up ticket.
- Packaged default back on first-party Sui Foundation infrastructure (drops the publicnode dependency).
- SDK read path, wallet sign/submit path, and React balance path all on gRPC.
- Live mainnet values identical to `origin/main`'s JSON-RPC output.
- Manual browser test with a real wallet extension (connect / disconnect / sign / deposit).

## Related

- Knowledge:
- Decisions: [`0002-sui-grpc-whole-stack.md`](../../decisions/0002-sui-grpc-whole-stack.md)
