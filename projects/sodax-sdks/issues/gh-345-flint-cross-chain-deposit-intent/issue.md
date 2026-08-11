---
type: issue
repo: sodax-sdks
github: 345
status: Active
tags: [flint, hooks, delivery-hook, erc-7540, lagoon, swaps-api, review]
updated: 2026-08-11
related_decisions: []
related_knowledge: [delivery-hooks-are-sdk-only]
---

# GH-345 Flint Cross Chain Deposit Intent

- Source: https://github.com/icon-project/sodax-sdks/issues/345
- Started: 2026-08-11 (review only — the implementation PRs predate this folder)
- Related PR:
  - https://github.com/icon-project/sodax-sdks/pull/347 — merged 2026-08-06, `HookKind.FLINT_DEPOSIT` + payload codec
  - https://github.com/icon-project/sodax-sdks/pull/364 — open, registers the deployed hook address (**the PR under review**)
- Upstream: icon-project/sodax-contracts#691 (hook design), #693 (deployment), icon-project/ICON-Projects-Planning#730

**My role here is review, not implementation.** The issue is closed on GitHub but the work it describes
is not finished — see `outcome.md`.

## Problem

Raw issue body (author: AntonAndell):

> Part of icon-project/ICON-Projects-Planning#730 — Flint vault `requestDeposit` integration.
> Pairs with icon-project/sodax-contracts#691 (the on-chain hook).
>
> ## Description
>
> SDK support for starting a Flint deposit from any supported asset on any spoke: route to USDC on
> Ethereum, deliver it to the `FlintDepositHook`, and have the hook fire `requestDeposit` for the user.
>
> The SDK's job is to construct that intent correctly. The on-chain contract is a thin adapter —
> everything about *which* asset, *how much*, and *who* is decided here.
>
> ## Requirements
>
> - [ ] Flint service/module exposing a deposit builder: `(fromChain, fromToken, amount, recipient) -> intent`
> - [ ] Route any supported spoke asset to USDC on Ethereum on the deposit leg (reuse the existing
>       solver/intent routing — this is not new routing machinery)
> - [ ] Destination is the `FlintDepositHook` address, with `data = abi.encode(address recipient)` — a bare
>       32-byte address, same payload shape as the HyperCore hook
> - [ ] Address-book entries for the hook, the Flint vault (`0x7f35dEa44a192764aa50d50e5f0eCE1d5a8b0e45`) and flUSD
> - [ ] Pre-flight quote that predicts whether the deposit will actually land, and surfaces it before the
>       user commits
> - [ ] Type-safe params + validation (non-zero recipient, supported source asset, amount above the hook's
>       `minDeposit`)
>
> ## Pre-flight is the interesting part
>
> The hook is deliberately **best-effort**: if the vault refuses the request it hands the user plain USDC
> on Ethereum instead of reverting (which would wedge the cross-chain message). That is the right on-chain
> behaviour but a bad surprise if the UI promised flUSD. The SDK should read live vault state and warn
> *before* the user commits:
>
> - [ ] `paused()` — vault paused
> - [ ] `isAllowed(recipient)` — access mode is blacklist today (no KYC gate), but it can be flipped to
>       whitelist or gain an external sanctions list
> - [ ] `maxCap()` vs `totalAssets()` — uncapped today
> - [ ] `pendingDepositRequest(0, recipient)` — a recipient with an unsettled request from an **earlier
>       epoch** is rejected (`OnlyOneRequestAllowed`); one from the *current* epoch just tops up, which is fine
> - [ ] amount ≥ the hook's on-chain `minDeposit`
>
> Each of these maps to a distinct "this will fall back to USDC, not shares" warning.
>
> ## Acceptance Criteria
>
> - [ ] A deposit started with a non-USDC asset on a non-Ethereum spoke ends with a pending Flint request
>       against the user, with no manual step in between
> - [ ] The intent is built against the USDC amount the routing leg will actually deliver, never a projected figure
> - [ ] Pre-flight correctly predicts each fallback case against live vault state
> - [ ] A routing-leg failure leaves funds recoverable and never leaves an orphaned `requestDeposit`
> - [ ] Unit tests + an integration test against a mainnet fork
>
> ## Notes
>
> - Flint is Ethereum-only, ~$512.8k TVL as of 2026-08-06
> - flUSD shares are 18 decimals; USDC is 6 — the SDK must not carry a single decimal assumption across the pair
> - The hook has an owner-settable `referral` used for all deposits, so referral is *not* part of the intent payload
> - Lagoon sync mode is enabled on the live vault, so an instant-shares variant is technically possible —
>   see the note on sodax-contracts#691 before proposing it

## Context

Two PRs claim this issue between them:

| PR | State | What it contains |
| --- | --- | --- |
| #347 | merged 2026-08-06 | `HookKind.FLINT_DEPOSIT`, `HOOK_DELIVERY_ABI` entry, `encodeDeliveryData` case, `HookRequest` union member, unit tests. Deliberately **no** Ethereum registry address — the hook was not deployed yet. |
| #364 | open | The registry address (`0xDf376dE34e9f1474A025Dfe411b7EB5541793C5d`), one flipped test, a changeset, and an example script `apps/node/src/flint-deposit.ts`. |

**#345 auto-closed 2 seconds after #347 merged** (`mergedAt 2026-08-06T12:08:09Z` vs `closedAt 12:08:11Z`),
i.e. four days before the hook was deployed on 2026-08-10, with every requirement checkbox unticked and no
descope comment. The sibling issue #346 was closed NOT_PLANNED the same day, so the closure taxonomy was
being used deliberately elsewhere — this one looks like a `Closes #345` side effect.

### The reviewer message this review must answer

Received during review of #364:

> "can you see if this is fully compatible and test this against API, and perhaps also include in any API
> docs we have how to use hooks with the API"

Three separate asks. "the API" resolves to the SODAX backend **Swaps API v2** — the wire contract that
`packages/swaps-api` clients and that `sodax.api.swaps` wraps.

## Acceptance Criteria

For **this review task** (not for #345 itself):

- [x] Establish exactly what #364 changes and what it inherits from #347
- [x] Map every #345 requirement to delivered / partial / not delivered, with file:line evidence
- [x] Answer each of the reviewer's three asks with a verdict and evidence
- [x] Separate defects in #364 from pre-existing gaps it merely makes reachable
- [ ] Post the review comment on the PR thread

## Related

- Knowledge: [delivery-hooks-are-sdk-only](../../../../knowledge/architecture/delivery-hooks-are-sdk-only.md)
- Decisions:
