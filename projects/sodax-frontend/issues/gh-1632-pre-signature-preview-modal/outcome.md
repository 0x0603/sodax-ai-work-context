---
type: outcome
repo: sodax-frontend
github: 1632
status: Blocked — needs a priority call from @FezBox; ticket also needs re-specifying
updated: 2026-08-12
---

# Outcome

- PR: none
- Commits: none
- Tests: n/a

## Summary

Not started, and it should not be started as written. Every file path, type and acceptance
criterion in the ticket refers to a layout this repo no longer has — `packages/` was deleted in
#1308, `wallet-sdk-core` and `dapp-kit` live in `sodax-sdks`, and there is no Storybook and no
test infrastructure. Three acceptance criteria have nothing to run against.

On top of that, the priority question gosiast put to @FezBox on 2026-06-30 — whether an XL
frontend modal is the right next investment when the real fix is wallet-side decoding — has
never been answered.

## What Changed

Nothing.

## Follow-ups

- **Get the priority call.** It is the actual blocker.
- **Retitle regardless of the outcome.** "The biggest defence against drainers" is what the
  ticket's own scope note contradicts, and it is what keeps this looking like the top security
  item ahead of the Phase 0 work #1631 says is the current focus.
- **If it proceeds, prefer option (ii)** — an EVM-only decoder local to `apps/web`, reading the
  server-built Swaps API v2 payload that already exists at the call site. Days rather than
  weeks, no cross-repo release, and it delivers the signing-clarity value the ticket is
  defensible on. Promote into `wallet-sdk-core` later if it proves out.
- **If option (i) is chosen, re-spec the ticket first**: correct paths (`wallet-providers/`, not
  `chains/`), nine chain kinds rather than six, drop the Storybook and integration-test
  criteria or fund the infrastructure they assume, and account for `packages/skills` updates
  gated by `pnpm check:ai`.

## Draft comment for the issue — NOT POSTED

> Before anyone books 3–4 weeks against this: the ticket can't be implemented as written, and
> the priority question is still open.
>
> **The paths are gone.** `packages/` was deleted from `sodax-frontend` in #1308 —
> `wallet-sdk-core` and `dapp-kit` live in `sodax-sdks` and arrive here as published packages.
> In that repo the directory is `wallet-providers/`, not `chains/`, and there's no
> `src/signing/`. `SigningRequest`, `describeSigningPayload`, `SignatureReviewModal` and
> `useReviewedSignature` have zero hits org-wide. There's also no Storybook in either repo and
> no test files in `apps/web`, so three of the acceptance criteria have nothing to run against.
>
> **The swap premise has moved.** Swap no longer calls `useSwapApprove().approve()` directly —
> it goes through `useSwapsApiApproveAndBroadcast` + `signAndBroadcastSwapsApiTx` over a
> server-built unsigned tx. That actually helps: the payload is already a concrete object in
> `apps/web`, so an EVM-only decoder there needs no SDK restructure at all.
>
> **Also:** `chainKind` lists 6 chains; there are 9 wallet providers (bitcoin, near and stacks
> are missing).
>
> @FezBox — the 2026-06-30 priority question is still unanswered, and #1631 says Phase 0 is the
> current focus. My suggestion is to scope this down to an `apps/web`-local EVM decoder (days,
> not weeks) and retitle either way; the current title is the thing the scope note contradicts.
