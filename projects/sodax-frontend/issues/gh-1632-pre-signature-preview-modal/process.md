---
type: process
repo: sodax-frontend
github: 1632
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Checked the ticket's file paths, types and acceptance criteria against
  `origin/main` in both repos. No code written.

## Findings

### Every path the ticket names is gone from this repo

`packages/` was deleted from `sodax-frontend` in `168bb93e` (#1308) — 462 files. There are
exactly two `package.json` files left: root and `apps/web`.

| ticket expects | reality |
| --- | --- |
| `packages/wallet-sdk-core/src/signing/` | no `packages/` in this repo at all |
| `packages/wallet-sdk-core/src/chains/{evm,solana,…}` | in `sodax-sdks` the dir is `wallet-providers/`, not `chains/` |
| `packages/dapp-kit/src/hooks/signing/useReviewedSignature.ts` | `dapp-kit` is in `sodax-sdks`, consumed here as `@sodax/dapp-kit` |
| Storybook stories | no Storybook in either repo |
| "no regression in existing integration tests" | `apps/web` has **zero** test files and no runner |

`SigningRequest`, `describeSigningPayload`, `SignatureReviewModal`, `useReviewedSignature`:
**zero hits org-wide.** Nothing has been started.

### The premise about the swap flow is stale

The ticket says swap "calls `useSwapApprove().approve()` directly; the user goes to wallet hex
prompt with zero preview". That path has moved to a **server-built unsigned transaction**
(Swaps API v2): `swap-confirm-dialog.tsx` now uses `useSwapsApiApproveAndBroadcast` (:143) and
`signAndBroadcastSwapsApiTx` (imported :28, called ~:258) after
`useSwapsApiCreateIntent` builds the tx server-side.

That change **helps** option (ii): the payload the user is about to sign already exists as a
concrete object in `apps/web`, so a local decoder has something to decode without reaching into
the SDK. It also means the decoder's input shape is not what the ticket assumed.

`deposit-dialog-footer.tsx` line refs have drifted too: approve is at :120-137, supply at
:80-100 (ticket says 73-104 / 128-134).

### The chain list is short by three

The proposed `SigningRequest.chainKind` names 6 — evm, solana, sui, stellar, injective, icon.
`sodax-sdks/packages/wallet-sdk-core/src/wallet-providers/` has **9**: those plus **bitcoin,
near, stacks**. A union that silently omits three chains would fail closed in an awkward place.

`BaseWalletProvider` declares only `abstract getWalletAddress()`; signing lives on each
concrete provider, so there is no existing hook point for a describe method — it would be new
abstract surface on all nine.

### The priority question was never answered

Epic **#1631** (Frontend Security Hardening) has exactly two sub-issues: this one and #1621.
Its body says **"Phase 0 is the current focus"** — the DNS root-of-trust plus the decisions that
unblock later phases — and that Phase 1 is mostly done. The similarly-named `[Security audit ·
Phase N]` series (#1556–#1561) belongs to a different, unlinked epic and is all closed.

gosiast's 2026-06-30 comment asking @FezBox for the priority call has no reply, and the issue
has not moved since.

## Changes During Work

None.
