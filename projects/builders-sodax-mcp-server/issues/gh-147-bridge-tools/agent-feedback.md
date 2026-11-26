---
type: process
repo: builders-sodax-mcp-server
github: 147
status: Feedback, recommendations not implemented
updated: 2026-11-26
tags: [bridge, mcp, agent-ux, onboarding]
source_commit: 83f411c
---

# Bridge MCP: first-time agent feedback

## Scope and method

The user asked for feedback as an agent unfamiliar with the bridge. Used an isolated worktree of PR #150
at `83f411c`: the active feature worktree initially had an in-progress merge, which this experiment did not
modify. Inspected MCP initialization instructions, tool descriptions/schemas and actual results rather than
using repository docs to choose the next workflow step. Existing conversation knowledge cannot be erased;
this is a contract-only walkthrough, not a separate blinded model evaluation.

Made 14 MCP calls through the SDK Client/InMemoryTransport. Discovery and validation used the SDK catalog;
Arbitrum/Base preview, balances, unsigned prepare, Solana/Sonic preview and an unseen-hash lookup used real
production API/public RPC reads. The example public address is test input, not a claim to own its wallet.
No transaction was signed or broadcast. Delivery after a real send was not tested. API-key onboarding and
the hosted HTTP/profile/transport connection were not tested by this in-process setup.

Evidence: `artifacts/agent-onboarding-2026-11-26.json`. The artifact summarizes every call, with large
calldata, wallet balances, duplicated text JSON and most choice options omitted explicitly.

## What worked

- Six relevant tools and initialization instructions explain discovery, preview, prepare, wallet execution
  and track. Token symbols and common chain names work; `Ethereum mainnet` resolved successfully.
- Arbitrum/Base discovery returned nine canonical pair choices. A known USDC pair can be selected without
  guessing addresses. A known intent can also go directly to preview instead of always listing pairs.
- ETH -> USDC was refused with an actionable ETH-on-Base alternative. Unsupported Bitcoin source, missing
  sender, same-chain input and comma-formatted amount each gave a bounded choose/provide recovery.
- The 5 USDC preview succeeded in 2,506 ms; unsigned prepare succeeded in 2,229 ms. Confirmation exposes
  source amount, destination amount, recipient, approval amount and spender. The ready result includes
  expiry, ordered approve/deposit steps, an optional batch, and the exact afterSend track arguments.
- Solana -> Sonic preview explicitly asked for both sender and recipient.

## Friction and proposed improvements

These are usability recommendations unless explicitly stated otherwise. No new implementation was made.

### 1. Make the wallet handoff explicit before preparing

The ready result reaches `confirm -> execute`, but this session exposes no signing/sending wallet tool.
The server instructions correctly say it never signs or moves funds. A new agent must nevertheless infer
which external wallet capabilities satisfy `execute` and when to stop and ask the user to connect a wallet.

Have MCP advertise execution requirements (source family/chain, signing+sending and receipt support,
optional atomic batching). The host should check available wallet capabilities before preparing, then hand
off to wallet setup when absent. Keep pure-signer transaction population/broadcast in the shared #151 scope.
For a batch, a wallet adapter should map the referenced steps into calls instead of each new agent inventing
that transformation; retain the individual-step fallback.

### 2. Publish the nextAction protocol where a new client discovers it

Initialization gives a helpful high-level workflow but does not define the custom action protocol.
The advertised output schema gives nextAction only `{ type: string, additionalProperties: true }`.
A new host still needs the meanings of sameArgs/args/answers, retryKey persistence, maxAttempts,
onExhausted, expiresAt and afterSend. Returning those fields does not itself implement their semantics.

Add a compact protocol guide in initialization or a discoverable MCP resource, plus useful action-type
schema descriptions. Explain how to preserve a sent hash and distinguish the terminal result of a balance
read from completion of the user's broader bridge request. Prefer one shared guide over repeating a large
recursive schema under every tool.

### 3. Mark fees and preflight checks explicitly

The successful preview says 5 USDC in and 5 USDC out; ready says only in prose that balances were not
checked. Neither result includes a network-fee estimate or an explicit not-estimated marker. A new agent
cannot answer the user's total-cost question just from that output. A balance read reports native/token
holdings but does not establish that gas is sufficient for the actual wallet execution.

Expose checked/unchecked balance state and fee components, including the native gas asset and a
wallet-estimate-required state when a quote cannot be provided. An ETA may likewise be explicitly unknown.
Do not invent a numeric fee or SLA. Solana preview returned a limit near 10^12 SOL: expose the kind and
meaning of the route limit so an agent does not present it as wallet balance or available liquidity.

### 4. Ask the wallet sooner when no node has seen the hash

A deliberately unbroadcast 32-byte hash returned `awaiting_source`, `seenOnChain: false`, and prose saying
it is not mined yet. The continuation polls every 15 seconds for up to 30 retries before `check_wallet`.
A copied wrong hash or wrong source network can therefore consume about 7.5 minutes before verification.

Use a short grace period, then verify the wallet's actual broadcast hash/source chain before continuing the
longer pending-transaction budget. Preserve the rule against resending. A hash unseen by a public RPC is
not proof that the transaction failed, especially with delayed/private propagation.

### 5. Cover protocol-level input errors in the client guidance

`txHash: "batch-123"` returned an SDK validation error with isError/text only, without nextAction,
nextStep or terminal. Invalid amount `"1,000"`, by contrast, reached the tool and returned bounded
`provide amount`. Initialization currently says every result, errors included, carries nextAction.

MCP distinguishes protocol errors from tool execution errors; this observation is not evidence of a
protocol violation. Qualify the instruction and test the host's fallback: correct explicitly invalid input
or ask the wallet for the actual transaction hash, keep any sent transaction reference, and hand off when
safe recovery is unclear. Never automatically reprepare or resend after losing the action contract.
Reference: https://modelcontextprotocol.io/specification/2025-06-18/server/tools#error-handling .

## Suggested order

First publish the compact action/error protocol and wallet requirements. Next make fee/check status
explicit and shorten unseen-hash verification. Existing happy-path discovery and bounded domain errors
already provide a usable path to an unsigned ready result. Full post-send feedback needs a separately
authorized funded wallet and real bridge run; that release gate remains open.
