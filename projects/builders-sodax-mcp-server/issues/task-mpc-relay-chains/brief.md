---
type: brief
repo: builders-sodax-mcp-server
github:
status: Active
next: agree backend MPC ownership and SDK validation/recovery prerequisites; keep source execution disabled
updated: 2026-11-26
related_decisions: [0001-mpc-settlement-ownership-and-launch-gate]
---

# MPC-relay chains in the MCP · brief

**The entry point. Read this, then open the one file the map points at.**

## State in five lines

- Research only, no code. Question (user, 2026-11-25): with the SDK's MPC-relay chains (Tron, XRP, TON,
  Zcash, Cardano, Monad), how heavy is MCP support if swap-api and bridge-api support them?
- First SDK with them: `2.4.0-rc.1` (`latest` is `2.3.0`; the MCP is on `2.3.0-rc.4`).
- Backend (`dc00438a`, re-fetched) only gates MPC access; its workers still use the intent relay.
- Final policy: SDK owns chain rules/shared proof; backend owns durable settlement; MCP stays an
  adapter. Keep source execution disabled until validation, backend ownership and recovery are ready.

## Blocked on

1. Backend: implement durable MPC notify/retry/status; current submit-tx does not provide it.
2. SDK: expose raw-mode sender validation and supported swap cancel/recovery (cancel is refused today).
3. Shared hub proof: align deployed ABI and add canonical-deposit, USDT swap and failure fixtures.

## Next action

Agree prerequisites from ADR 0001 before a deposit rollout. T1's real receipt is inspected: raw
mint and vault shares are distinct. The SDK's failure ABI differs from deployed
`HookFailed(address,string)` (MCP fixed in gh-147 `997f768`). T1 is a bridge mint, not proof of a successful USDT swap.

## Settled — do not re-litigate

- Prove an MPC deposit on the hub (the `hubMint` tx, read on Sonic), not on the source chain: one
  implementation for every MPC chain, no per-chain RPC, and the relay record is only a pointer. Same pattern
  as bridge track today (backend row → `dstIntentTxHash` → hub receipt).
- Don't refuse an unknown reserve: the relay doc says the reserve isn't constant; the SDK only warns.
- TRON to Arbitrum does not need MPC destination-release tracking.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The mechanism, flow, difficulty and provisional order (final policy supersedes it) | `plan.md` | 2.6k |
| The question as asked | `issue.md` | 0.1k |
| Swap vs bridge, MPC source vs destination: legs, checks, difficulty per case | `cases.md` | 2.4k |
| Final decision and launch gate | `../../decisions/0001-mpc-settlement-ownership-and-launch-gate.md` | 1.7k |
| Backend routing, real T1 receipt, ABI mismatch and limits | `process.md` | 1.6k |
| Relay code facts (verifier, ids, fees, hub executor) | `../../../sodax-sdks/issues/task-pr-372-tron-review-fixes/chain-evidence-2026-11-02.md` | 2.3k |

## Landmines

- A wrongly spelled relay id (a `0x` or uppercase Tron tx) reads `pending` forever, never 404.
- The relay verifier doesn't check the deposit amount; D is dropped unless the owner paid directly.
- Deployed `HookFailed` is `(address,string)`, confirmed on chain (7 logs, 0 of the bytes topic, blocks
  79.1M–83.1M). gh-147's bridge track used the bytes topic until `997f768`; the SDK ABI still declares
  bytes (checked on `2.3.0-rc.4` only) (`cases.md` item 3).
- A swap to an MPC chain is not paid at `solved`: the release must be read (`cases.md` S1).
