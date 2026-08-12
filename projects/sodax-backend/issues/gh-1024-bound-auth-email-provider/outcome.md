---
type: outcome
repo: sodax-backend
github: 1024
status: Research delivered — build-vs-adopt call not made
updated: 2026-08-12
---

# Outcome

- PR: none — a `research(...)` ticket; the deliverable is the document.
- Commits: none in `sodax-backend`.
- Tests: n/a

## Summary

The research is done and came from primary sources: `lydialabs/radfi-be` is readable with the
current token, so Bound Auth's architecture is documented here from its own `docs/` rather than
inferred. `boundex/radfi-web` is 404 and nothing about it is guessed at.

Three things came out of it that change what this ticket is.

**1. Bound Auth is an encrypted-keystore model, not MPC.** The server is a blind custodian of a
client-encrypted blob; the address derives from a mnemonic the user holds. That is the whole
reason it is interesting to SODAX — and it is the structural answer to frontend #1069, which is
blocked precisely on MPC's `clientId` scoping. Neither issue says so today.

**2. The backend has none of the primitives.** No JWT issuance, no email transport, no OTP, no
WebAuthn, no SRP — verified by grep across every `package.json`. The only session plane is
Better Auth in `apps/stateful-api`, deliberately Google-only. And `POST /users/register` is not
an auth endpoint: it verifies a signature over a client-chosen message with no nonce and no
replay protection, and issues no token. This is a from-scratch auth plane.

**3. Open PR #1048 already ruled this out of `apps/api-auth`**, by name and on purpose: *"Not
here. api-auth stays internal-only, no public route, ever."* So it needs its own home — and
#1048 is the freshest template for adding one.

## What Changed

Nothing in the repo. Added
`knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md`, which is the part that
outlives this ticket.

## The design points worth stealing, if it gets built

- **The two-signature model** — the server-identity proof signs a fresh nonce and is sent; the
  keystore-derivation signature signs a fixed message and is never sent. They cannot be the
  same signature because their requirements are opposite.
- **The determinism whitelist** — EIP-191 / Ed25519 / BIP-137 only; Taproot/Schnorr and BIP-322
  excluded because auxiliary randomness would make the keystore unrecoverable. This is a
  non-obvious constraint that a naive implementation gets wrong.
- **Nonce consumed before verification**, address-bound, one-time.
- **Wallet-signature failures do not count toward lockout** — otherwise the lockout is a DoS vector.
- **OTP hashed with HMAC keyed on a server secret**, not plain SHA-256, so a DB dump alone does
  not reverse it.
- **ECDH device-linking relay** where the server stays blind.

## Follow-ups

- **Build-vs-adopt call, with an owner.** The question is not "how" any more, it is "should we,
  and at what size". It should be made **together with frontend #1069**, since (A) accept
  different addresses, (B) ask Hana for shared Web3Auth config, and (C) build this are three
  answers to one question.
- If it proceeds: new app, not `apps/api-auth` (#1048 Decision 8), using #1048's file set as the
  template, with the `docs/PATTERNS.md` survey and the collection-ownership table updated up front.
- Per `docs/TEAM_CONVENTIONS.md`, post the plan as an issue comment before implementing.
- Unresolved: radfi-be's own docs contradict each other on whether the OTP-request response
  leaks account existence. Worth settling before copying that endpoint's semantics.
- `boundex/radfi-web` is inaccessible — if the frontend reference matters, someone has to ask
  Bound for access.

## Draft comment for the issue — NOT POSTED

> Research done, from the primary sources. `lydialabs/radfi-be` is readable with my token so
> this is from their `docs/`, not inference; `boundex/radfi-web` is 404 for me, so I have no
> frontend reference and haven't guessed at one.
>
> **The key thing: Bound Auth is not an MPC wallet.** The server is a blind custodian of a
> client-encrypted keystore blob — it never sees the mnemonic — and identity is email, with the
> blob unlocked by passkey (WebAuthn PRF), password (SRP), or an external wallet signature.
> That matters beyond this ticket: frontend #1069 is blocked because every MPC provider scopes
> keys to the app `clientId`, and this model has no such scoping. **#1024 is the structural
> answer to #1069** and the two should be decided together.
>
> **We have none of the primitives.** No JWT issuance, no email transport, no OTP, no WebAuthn,
> no SRP anywhere in the repo. The only session plane is Better Auth in `stateful-api`,
> deliberately Google-only. And `POST /users/register` isn't an auth endpoint — it verifies a
> signature over a client-chosen message with no nonce or replay protection and issues no token.
> This would be a from-scratch auth plane.
>
> **It can't live in `apps/api-auth`** — PR #1048's design record rules this issue out by name:
> *"Not here. api-auth stays internal-only, no public route, ever."* It'd need its own app;
> #1048 is a good template for how to add one.
>
> The design detail most worth stealing is their two-signature model: the identity proof signs a
> fresh server nonce and is sent; the keystore-derivation signature signs a fixed message and is
> never sent. Which is also why they exclude Taproot/Schnorr and BIP-322 — non-deterministic
> signatures would make the keystore unrecoverable.
>
> Full notes in my context repo. What's needed next is a build-vs-adopt call with an owner.
