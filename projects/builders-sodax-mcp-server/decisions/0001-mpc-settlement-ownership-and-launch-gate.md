---
type: decision
scope: builders-sodax-mcp-server
status: Accepted
tags: [mpc-relay, tron, settlement, recovery, maintenance]
date: 2026-11-25
updated: 2026-11-25
related_issues: [task-mpc-relay-chains, gh-147, gh-118]
---

# 0001 — Keep MPC chain mechanics in the SDK and durable settlement in the backend

## Context

The user requested a checked final decision prioritizing safety and low MCP maintenance.
The first route is 100 USDT from TRON to Arbitrum. Destination token, recipient, minimum output
and deadline must also be part of its prepared quote.

Checked on 2026-11-25: SDK `@sdks@2.4.0-rc.1` (`684962d5`), backend `origin/development`
(`dc00438a`), MCP `feat/147-bridge-tools` (`9ef5d54`), and a real TRON-origin hub transaction.
See the task's [verification record](../issues/task-mpc-relay-chains/process.md).

- SDK already validates TRON's built transfer, hub wallet and memo. Its notify retries last only
  while the client is waiting. They do not survive a process restart.
- Backend MPC support is an org gate; its durable submit workers still use the intent relay.
  SDK deliberately bypasses that backend path for MPC sources. MPC-source swap cancel is refused.
- The observed hub mint has distinct underlying-token and vault-share transfers. Deployed
  `HookFailed(address,string)` also differs from the SDK/MCP `HookFailed(address,bytes)` ABI.
  A mint alone or an absent failure event cannot prove that the swap ran.

## Decision

**MCP stays an adapter. SDK owns chain mechanics and the shared hub proof; backend will own
durable MPC settlement. New MPC source execution remains disabled until those upstream
contracts and supported recovery are ready.** This is the chosen MCP policy, not a claim that
backend work has already been implemented or agreed by its team.

1. **Reuse SDK behavior.** Build raw deposits with an exactly pinned, verified SDK. Sender
   ownership and withdraw-signature capability checks must be reusable SDK operations available
   to raw callers. If missing, implement them upstream before enabling that source. An address
   check or a caller's capability boolean is insufficient. Do not sign an executable withdrawal
   authorization as a harmless capability probe. MCP still binds the returned transaction and
   intent to its stored quote; it does not copy protobuf, address or signature rules.
2. **Extend one durable backend pipeline.** Backend submission must persist canonical source
   transaction, org, prepared request and progress, then own notify, bounded retry, hub/solver
   handoff and status. Reuse the existing claimed-row/drainer pattern. MCP calls this contract
   and reads status; it adds no MPC worker and no process-local settlement fallback. Abandonment
   means escalation, never proof of a refund. Notify must precede the hub proof it initiates.
3. **Implement hub verification once, shared through the SDK.** Backend and MCP consume the same
   decoder/verifier. Require a successful, sufficiently final receipt and the trusted receiver's
   call binding canonical deposit ID, source chain, token, sender, hub wallet, raw amount and
   payload to the prepared request. Match actual mint evidence separately from vault shares.
   A swap also requires the exact expected intent at the trusted intents contract, followed by
   solver and destination-delivery tracking. Relay `hubMint` is only a lookup pointer. Unknown
   execution shapes remain unverified. Align deployed ABI and fixtures before using this proof.
4. **Gate execution on readiness, not catalog membership.** Org access and SDK chain listing do
   not enable deposits. Require raw-mode sender validation, durable settlement, shared proof,
   and a demonstrated SDK-supported recovery path for held funds and expired/cancelled intents.
   Signing capability alone is not recovery; help-desk intervention is not the normal launch
   plan. Refuse unsupported Prepare before relay registration or returning payable steps.
   Keep read-only information and tracking of existing transfers separate from new execution.
5. **Resume one transfer across retries.** Persist its prepared intent, amounts, identities and
   tracking identifiers before handoff. Timeout means unknown outcome: resume the same transfer,
   never build another deposit or fresh withdraw authorization just because a request timed out.
   Report verified stages and supported recovery actions. Complete only on verified delivery
   to the quoted destination recipient.

Reserve addresses remain dynamic. Use the SDK/relay trust boundary and the address returned for
this payload, not a copied reserve allowlist. A memo commitment checks payload consistency; it
does not independently authenticate the relay's reserve. Reject inconsistent responses, but do
not reject a legitimate rotation solely because it differs from an old static address.

## Consequences

- **Current result: no public TRON-source Prepare/Submit rollout.** Backend MPC settlement and
  supported swap cancel/recovery are still prerequisites. Dependency upgrades, gated catalog/
  preview work and proof fixtures can proceed without enabling deposits.
- First enable one route, TRON to an already supported destination such as Arbitrum. MPC
  destination release is separate work and is not required by this route.
- New chains mostly need SDK capability support and route fixtures, rather than another MCP
  RPC verifier, withdrawal implementation and worker. Per-chain acceptance and ABI compatibility
  tests remain necessary; low maintenance does not mean no maintenance.
- Initial delivery waits for upstream readiness. This cost is chosen over a second settlement
  lifecycle and routine manual recovery.
- The inspected transaction is a 10 TRX bridge mint, not a USDT swap. It establishes available
  mint evidence, not end-to-end readiness of the requested route.

## Alternatives considered

- **SDK waits plus MCP per-chain checks:** rejected; process-local settlement and duplicated rules.
- **Trust relay status or org access alone:** rejected; neither proves the requested swap/delivery.
- **Launch with help-desk recovery:** rejected for public execution without a supported recovery path.

## Related

- [Task brief](../issues/task-mpc-relay-chains/brief.md)
- [Integration analysis](../issues/task-mpc-relay-chains/plan.md)
- [Verification record](../issues/task-mpc-relay-chains/process.md)
