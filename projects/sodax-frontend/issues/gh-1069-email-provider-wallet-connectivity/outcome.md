---
type: outcome
repo: sodax-frontend
github: 1069
status: Blocked — research complete, needs a product call
updated: 2026-08-18
---

# Outcome

- PR: none
- Commits: none
- Tests: n/a

## Summary

The research this ticket asks for is **finished** and has been since 2026-04-15: no provider
offers email-only, cross-domain wallets, because every MPC provider scopes keys to the app
`clientId` — a security property, not a gap. Matching Hana's addresses therefore requires Hana
to share their Web3Auth configuration, at the cost of coupled security.

What remains is a product and partnership decision, not engineering. Nothing has been started
in either repo.

## What Changed

Nothing in code. Added `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md`,
which is the reusable half of this.

## Update 2026-08-18 — backend #1024 is going ahead, and it does NOT unblock this

Fez called it: SODAX builds its own encrypted-keystore auth plane
([[0001-own-the-email-wallet-auth-plane]]). Option (C) below is happening.

**It does not satisfy this ticket, and an earlier note of mine implied it might.** The keystore
model removes future provider lock-in — no `clientId` in the derivation path — but it mints a
fresh mnemonic, so a Hana user gets a *different* address, not their Hana one. Hana's addresses
come from Hana's Web3Auth `clientId`; only Hana sharing that configuration produces parity.

So this ticket is still blocked on the same partnership question it was blocked on in April, and
#1024 shipping must not be read as closing it. Corrected in
[[encrypted-keystore-vs-mpc-email-wallets]].

What *does* change: once the keystore plane exists, SODAX has first-party email login for its own
users. If the requirement can be relaxed from "Hana's addresses" to "email login without a vendor",
this ticket is satisfiable — but that is a different ticket, and a product call.

## Follow-ups

- **Product call needed** between: (A) accept different addresses, (B) ask Hana for a shared
  Web3Auth config and accept coupled security, (C) pursue the encrypted-keystore model that
  backend #1024 is researching, which sidesteps `clientId` scoping entirely.
- **Correct the execution instruction on the ticket**: "branch out of `sdk-v2-main`" is stale —
  that branch is 3 months cold and 460 commits behind `main`, and still carries the `packages/`
  tree `main` deleted. Work starts in `sodax-sdks`.
- Link #1069 and backend #1024 to each other. They are the client and server halves of one
  question and neither says so today.

## Draft comment for the issue — NOT POSTED

> Two updates, no code.
>
> **The research question is closed** — my 2026-04-15 comment is the answer. Every MPC provider
> (Web3Auth / Privy / Turnkey / Magic) scopes keys to the app `clientId`, so "same address
> regardless of provider" isn't purchasable. Matching Hana means Hana shares their `clientId`,
> allowed origins and a custom verifier, and we accept coupled security in exchange. That's a
> partnership call, not an engineering one.
>
> **Worth putting a third option on the table before that call.** Backend #1024 is researching
> Bound Auth, which is an *encrypted-keystore* model rather than MPC: the server holds a blob it
> can't decrypt and the address derives from a mnemonic the user holds. `clientId` scoping —
> the thing that makes this ticket's requirement impossible — doesn't exist in that model. It's
> a much bigger build, but it's the only route that satisfies the requirement without a
> dependency on Hana. #1024 and this issue are the two halves of the same question.
>
> Housekeeping: "branch out of `sdk-v2-main`" no longer works — that branch is 3 months stale
> and 460 commits behind `main`, and still has the `packages/` tree `main` deleted in #1308.
> Whenever this starts, it starts in `sodax-sdks`, as one more `XConnector` subclass.
