---
type: brief
repo: builders-sodax-mcp-server
github: 147
status: Active
next: merge feat/129-next-action (57f1996) in on the user's word; docs page; kill switch off until a real bridge is tracked end to end
updated: 2026-11-26
---

# GH-147 Bridge tools · brief

**The entry point. Read this, then open the one file the map points at.**

## State

- Steps 1-7 pushed to `feat/147-bridge-tools` (`001d6a4`..`d85bf5c`, signed); draft PR #150 (base
  `feat/129-next-action`, `Closes #147`). Worktree `sodax-command-center/repos/client/builders-sodax-mcp-server-wt-147`.
- `/simplify` + `/code-review` fixes pushed as `9ef5d54` on top of `d85bf5c`. `BridgeRequest` takes the SDK's
  field names and the wire body comes from `toCreateBridgeIntentParamsV2`. The swap helpers are reused (approve
  checks, `resolveSide`, `addressesNeeded`, `depositTerms`). Swap wording is reworded once at the tool boundary
  (`actionTool` `reword`). Track proves each step past the source on the hub or the relay: from Sonic, the user's
  own tx's packet; to Sonic, the delivery Transfer/Withdrawal in the hub receipt. A reverted hub tx is not a success.
  HookFailed counts only for this bridge's wallet. `failed || abandonedAt` is relay_failed (the SDK's rule), and
  alerts without a build spend the public budget. SDK `VALIDATION_FAILED` maps to AMOUNT_TOO_LOW / BRIDGE_REJECTED.
  Relay packets are zod-validated. The store checks room before upstream calls; `/health` has `openBridges`.
  Gates: lint, checkTs, 2321 tests, live contract 55 green; each fix mutation-checked.
- #138 and #145 still open. GitHub redirects the repository to `gosodax/sodax-mcp`; local paths are unchanged.

## Blocked on

1. Bridge PR targets `feat/129-next-action` until #138 merges, then retarget to `development`.

## Next action

The base `feat/129-next-action` moved to `57f1996` after `9ef5d54`: merge it in (never rebase) on the user's word.

## Settled — do not re-litigate

- Base on #138 (user, 2026-11-23). Not on #137 (conflicting) or #145 (merge in when tracking).
- Scope (user, 2026-11-26): every source the swap tools start from (EVM, Sonic, NEAR, Stellar, Sui, Solana,
  Injective), reusing their source adapters (`plan.md` D3b); not Bitcoin, Stacks, ICON. Destinations: any chain.
- No story points until (a) and (b) have a worked-out approach.
- SDK first (user, 2026-11-25): types, chains, tokens, ABIs come from the SDK; no chain/token list in bridge code.
- Backend builds, MCP rebuilds with `sodax.bridge.createBridgeIntent` raw and compares byte for byte (ADR 0001
  D3/D5; bridge-api simulates every build on the hub). "MCP builds itself" was tried and dropped 2026-11-25.
- Own `bridge` profile + `SODAX_BRIDGE_TOOLS_ENABLED` (ADR D4); the connection's partner fee applies; no recovery
  tool; record 10' + 30' grace, resume from the source tx is a main path (`plan.md`).

## Open

- **Bug in `9ef5d54`:** the deployed hub asset manager emits `HookFailed(address,string)` (topic `0xfc062a14…`;
  7 logs, 0 of the bytes topic, blocks 79.1M–83.1M, checked 2026-11-25). `src/services/swap/sourceTx.ts:27` and
  the SDK ABI use `HookFailed(address,bytes)`, so track never reports `held_on_hub` (safe: in_transit, then a
  person). Fixed in `997f768` (pushed 2026-11-25): the string topic, tested against that signature; a real log's
  emitter is the configured asset manager and its data word 0 the wallet. Gates green. SDK ABI still wrong upstream.
- Kill switch stays off until one real bridge is tracked end to end (needs funds).
- Docs page in sodax-sdks.
- Without the build, a spoke→Sonic bridge can't be shown delivered (stays in_transit, then a person): accepted,
  never a false "delivered". No unsent deposit is submitted without its build (any source); resume deferred.
- Optional before the switch: evict unsent builds past the sign window when the store is full (swap's `makeRoom`).

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| What the backend/SDK give, with file:line | `issue.md` | 0.6k |
| Review findings and decisions needed before planning | `process.md` | 2.0k |
| Design decisions with code refs, route/failure tables, build order | `plan.md` | 3.3k |

## Landmines

- `HookFailed` rests on the hub asset manager ABI only (`sodax-contracts` unreadable); 0 events on chain in ~56 days.
