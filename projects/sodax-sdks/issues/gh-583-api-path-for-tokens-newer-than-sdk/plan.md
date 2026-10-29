---
type: plan
repo: sodax-sdks
github: 583
updated: 2026-10-29
---

# Plan

The executable plan is the GitHub plan comment on #583 (steps 1-8, AC mapping). This file holds the facts the
implementation must respect.

## Constraints (true on 2.2.0, rc.2 and main 8efa9155)

- `ConfigService.initialize()` returns ok without fetching (`packages/sdk/src/shared/config/ConfigService.ts:158-185`).
- Feature services validate tokens against the bundled `chains[*].supportedTokens` before any request:
  swaps `SolverApiService.ts:68-74`, `SwapService.ts` createIntent; bridge `BridgeService.ts` createBridgeIntent /
  getBridgeableAmount / isBridgeable; leverage yield `getQuote` and `createVaultIntent`.
- `sodax.api.{swaps,bridge,leverageYield}` are thin clients; the backend validates with its own SDK (2.3.0-rc.2).
  Only response-shape and chain-type schema checks run client-side (`packages/swaps-api/src/rawTxSchemas.ts`).
- The API clients, their types and the `useSwapsApi*` / `useBridgeApi*` / `useLeverageYieldApi*` hooks are the same
  in 2.2.0 and main.
- create-intent returns `IntentResponseV2` (decimal strings); submit-tx takes `IntentRequestV2` (bigint).
  Convert `intentId`, `inputAmount`, `minOutputAmount`, `deadline`, `srcChain`, `dstChain`.
- Signing an API-built tx, per chain family (reference: `apps/demo/src/components/swaps-api/lib/signAndBroadcast.ts`):
  EVM `sendTransaction(tx, { expectedChainId })`; Solana / Stellar / Stacks / Injective `signAndSendTransaction(tx)`
  (optional on the interface, present in 2.2.0 types); Sui `signAndExecuteTxn({ toJSON: async () => tx.data })`;
  ICON `sendTransaction(tx)`; NEAR `signAndSubmitTxn(tx)`; Bitcoin via
  `sodax.spoke.getSpokeService(BITCOIN).signAndSubmitRawTransaction(...)` with a Bound access token.
- Submit-tx status polling stops on success, `failed`, or `abandonedAt` set (bridge and swaps status types).
- Bridge: gate on the API bridgeable amount's limit; backend `isBridgeable` is config-only and a zero-limit pair
  returns 422 at create.
- Not in 2.2.0 (first in 2.3.0-rc): `swapWithApproval`, `bridgeWithApproval`, `vaultSwapWithApproval`,
  `getApprovalStrategy`, `useSwapWithApproval`, `useBridgeWithApproval`, `useLeverageYieldVaultSwapWithApproval`,
  `use*ApprovalStrategy`, `useSwapsApiBroadcastWithApproval`.
- Vault registry is the same four lsoda* vaults in 2.2.0 and on the backend; only tokens drift.
