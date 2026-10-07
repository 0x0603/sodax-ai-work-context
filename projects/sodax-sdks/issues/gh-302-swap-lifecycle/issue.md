---
type: issue
repo: sodax-sdks
github: 302
status: Active
tags: [swap, dapp-kit, eip-5792, atomic-batch, approve, status, detailed-status, submit-tx, lifecycle-hook, controller-hooks]
updated: 2026-10-07
related_issues: [gh-328, gh-329, gh-21, gh-208]
related_decisions: []
---

# GH-302 Swap Lifecycle (+ #328, #329)

One task, one PR, three issues — grouped by the user as "Lifecycle hook in dApp Kit (swaps)".

## #302 — feat(sdk,dapp-kit, demo): evm batch approve + transfer, swap pilot

- https://github.com/icon-project/sodax-sdks/issues/302 · opened 2026-07-20 · unassigned · project "New World" (Ready, SDK)
- One-signature approve + create-intent on EVM spokes via EIP-5792 (`wallet_getCapabilities` +
  `wallet_sendCalls`), transparent fallback to the 2-step flow. New explicit swap method, existing
  `approve` + `createIntent` untouched.
- AC (verbatim gist): `IEvmWalletProvider` exposes atomic-capability check + batch send (+ wait),
  implemented in core over viem's stable EIP-5792 actions; new `swaps.*` method does approve +
  create-intent in one signature on an atomic-capable wallet, verified end-to-end; per-chain capability
  boolean; native token = single tx; graceful fallback; viem pin resolved to stable 5792; unit tests both
  paths; no `any`/`@ts-ignore`; `packages/skills` updated; build/checkTs/lint/test/check:ai green.
- Stale claims (verified 2026-10-07): "installed viem 2.45.1" — false, 2.29.2 everywhere and it already
  ships stable 5792; "add an error code" — conflicts with `packages/sdk/AGENTS.md`.

## #328 — feat(sdk,dapp-kit): universal status method + hook

- https://github.com/icon-project/sodax-sdks/issues/328 · opened 2026-07-30 · assignee R0bi7
- Swaps service `getStatus` (solver) and swaps API status return different shapes; a client polling the
  API may get not-found when the SDK fell back to the client relay. Ask: core method that tries the swaps
  API first, falls back to solver; wrap as a universal dapp-kit status hook.
- Core delivered by PR #371 (2026-08-16): `getDetailedStatus` + `useDetailedStatus`. Issue never closed.

## #329 — refactor(sdks, demos): deprecate SwapsClientOptions and useBackendSubmitTx

- https://github.com/icon-project/sodax-sdks/issues/329 · opened 2026-07-30 · assignee R0bi7
- Deprecate `SwapsClientOptions` in favor of `SwapsOptions`, backward compatible type- and logic-wise
  in v2; make submit-tx to API the default; update tests and docs.
- Core delivered by PR #362 (2026-08-09). Issue never closed. Title's "deprecate useBackendSubmitTx"
  read as the legacy `swapsOptions.useBackendSubmitTx`, not removing the flag.

## Added scope (user, 2026-10-07)

`useSwapLifecycle` in dapp-kit composing strategy → gates → approve/batch → swap → status, plus the demo
`SwapCard` rewritten on it — the first instance of the gh-21 controller-hooks design.
