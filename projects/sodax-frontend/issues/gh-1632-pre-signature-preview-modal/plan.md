---
type: plan
repo: sodax-frontend
github: 1632
updated: 2026-08-12
---

# Plan

## Goal

Put the real choice in front of the owner, with the repo facts attached, so the priority call
that has been open since 2026-06-30 can actually be made.

## Why no code

Two independent reasons.

**The ticket is not implementable as written.** Every path it names has moved or never existed
here — `packages/` was deleted from this repo, `wallet-sdk-core` and `dapp-kit` live in
`sodax-sdks`, the directory is `wallet-providers/` not `chains/`, and there is no Storybook and
no test infrastructure to satisfy three of its acceptance criteria. Detail in `process.md`.

**The priority question is unanswered.** gosiast asked @FezBox on 2026-06-30 whether an XL
frontend modal is the right next investment given Fidel's review. Starting 3–4 weeks of work
across three repos on an unanswered question is the wrong move.

## The three options

**(i) Do it properly, cross-repo.** `sodax-sdks/packages/wallet-sdk-core` gains `signing/` and
per-provider `describeSigningPayload`; `dapp-kit` gains `useReviewedSignature`; `apps/web` gains
the modal. Three repos, a coordinated release, and `packages/skills` updates gated by
`pnpm check:ai`. Still XL, and now with cross-repo release sequencing on top.

**(ii) Scope down to an EVM-only, `apps/web`-local decoder.** Decode the payload the app already
has, immediately before it goes to the wallet, and render the modal locally. No SDK
restructure, no cross-repo release, days rather than weeks — and it delivers most of the
signing-clarity value the ticket is actually defensible on. Can be promoted into
`wallet-sdk-core` later if it proves out.

**(iii) Park it** behind wallet-level decoding per Fidel's review, and retitle the issue.

**Recommendation: (ii) as a spike, and get the retitle done either way.** The current title
("the biggest defence against drainers") is precisely what gosiast flagged as overstated, and
it is what makes this look higher-priority than the scope note says it is.

## Verification

n/a — nothing to verify until an option is chosen.

## Risks

Leaving it open at XL with a misleading title keeps it looking like the top security item, which
crowds out the Phase 0 work the epic says is the current focus.
