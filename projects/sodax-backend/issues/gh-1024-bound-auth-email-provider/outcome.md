---
type: outcome
repo: sodax-backend
github: 1024
status: Research delivered — build call made, implementation not started
updated: 2026-08-18
---

# Outcome

- PR: none — filed as `research(...)`; the deliverable was a document, and now also a direction.
- Commits: none in `sodax-backend`.
- Tests: n/a

## Summary

**The build-vs-adopt call is made.** Fez decided on 2026-08-18: build the entire auth plane
in-house — email login, passkey, setup, backup, encrypted keys, on our servers — using
`lydialabs/radfi-be` as a reference to *redo*, explicitly **not** integrating Bound's email login.
Fez also confirmed the repo access was arranged deliberately for this. Recorded as
[[0001-own-the-email-wallet-auth-plane]].

The research is complete and now comes from **source**, not from Bound's docs. That distinction
turned out to matter: their docs disagree with their code in six places, one of which is a
security claim that is simply false (an enumeration defence on the OTP endpoint that is not
implemented). The full mechanism is written up in [[bound-auth-mechanism]].

Three things carried over from the 2026-08-12 pass that needed correcting:

1. **"Passkey → PRF" was asserted as fact; it is unverifiable.** `grep prf src/` → zero hits;
   Bound's own docs contradict each other and their spec leaves the mechanism open. The server is
   a blind custodian, so the backend structurally cannot answer it, and `radfi-web` is still 404.
2. **"One keystore per account" is wrong.** The index is not unique; each device holds its own
   blob under its own KEK, all wrapping the same mnemonic. This is why the ECDH relay exists.
3. **The OTP enumeration question, previously parked as unresolved, is settled: it leaks.**

## What Changed

Nothing in any `icon-project` repo. In this context repo:

- **new** `decisions/0001-own-the-email-wallet-auth-plane.md` — Fez's call, verbatim, with
  consequences and the four things it does *not* settle.
- **new** `knowledge/architecture/bound-auth-mechanism.md` — the code-derived architecture: trust
  boundary, mnemonic-vs-KEK, determinism whitelist, entities, all four flows, the six docs-vs-code
  divergences, nine anti-patterns, and what the backend structurally cannot reveal.
- **updated** `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md` — corrected an
  overstatement (see below).
- **updated** `issue.md`, `plan.md` (Phase 2 = build), `process.md`.

## Correction that changes a decision

The 2026-08-12 knowledge note said the keystore model is *"the structural answer to #1069"*. Too
strong. It removes **future** provider lock-in, because there is no `clientId` in the derivation
path. It does **not** give a Hana user their existing Hana addresses — those derive from Hana's
Web3Auth `clientId`, and our keystore mints a fresh mnemonic.

So #1024 and #1069 are **not** two halves of one question, as previously written. They are
different problems with different answers, and only a Web3Auth config share from Hana satisfies
#1069. Fez's framing does not mention Hana at all. Corrected in place.

## Follow-ups

- **Post the research and the decision on #1024.** Still zero comments since 2026-07-27.
  `docs/TEAM_CONVENTIONS.md` requires the plan on the issue before implementing.
- **Get the four scope questions answered by Fez** — parked in `plan.md`. Highest-stakes:
  what "backup" means. "Recover with email alone" needs a server-held key share and makes us a
  custodian; the encrypted-blob-on-our-servers reading is the Bound model and needs no such thing.
- **Spike WebAuthn PRF before anything else** — `@better-auth/passkey` on Chrome + Safari +
  iCloud Keychain. The whole passkey path rests on it, and Bound's own spec punts on it
  *"based on platform support"*.
- **Cross-repo issue structure** (backend + sdks + frontend) before coding starts.
- New app, not `apps/api-auth` (PR #1048 Decision 8). Use `apps/bridge-api` as the scaffolding
  template and `apps/stateful-api/src/auth/*` for the Better Auth wiring.
- Say explicitly, when posting, that **this does not close #1069**.

## Draft comment for the issue — NOT POSTED

> Research is done, from source rather than docs — and that distinction matters here, because
> radfi-be's docs disagree with its code in six places, one of them a security claim that isn't
> implemented (the OTP endpoint documents an enumeration defence; the code throws
> `400 emailTaken`).
>
> **How it actually works.** The server is a blind custodian. The client generates a BIP-39
> mnemonic, derives its own chain keys, and encrypts the mnemonic client-side; the server stores
> only ciphertext. Email is the username; a passkey (WebAuthn PRF) or a password produces the key
> that decrypts the blob. There is no email-only login and no social login — `EAuthType` is
> exactly `{passkey, srp, wallet}`. The mnemonic is generated once and downloaded back on every
> login; the thing that has to be reproducible is the *encryption key*, not the mnemonic. That
> single fact explains most of the design, including why they exclude Taproot and BIP-322 from
> wallet auth (non-deterministic signatures would make the keystore unrecoverable).
>
> **Direction is settled**: we build this ourselves rather than integrating Bound's — that's the
> whole point of the ticket, and Fez confirmed it. Bound's repo is the blueprint to redo, not to
> call.
>
> **It's smaller than it looks.** Better Auth is already in `apps/stateful-api` with `email-otp`,
> `jwt`, `bearer` and `two-factor` on disk unused, and `@better-auth/passkey` passes the PRF
> extension through and returns the client extension results — so one ceremony gives both the
> assertion and the encryption key, with no hand-rolled WebAuthn (which is exactly where Bound
> shipped bugs). On the client side 8 of our 9 wallet providers already accept a raw private key,
> so decrypt → derive → construct-existing-provider needs no SDK change. What's genuinely new is
> the keystore layer.
>
> **It can't live in `apps/api-auth`** — #1048's design record rules this issue out by name.
> It needs its own app on its own box; a public login surface is a new class of attack surface
> for this repo.
>
> Two things to decide before code: what "backup" means (client-encrypted blob on our servers =
> self-custodial and settled; "recover with email alone" = we hold a key share and become a
> custodian), and whether WebAuthn PRF is actually available across the platforms we care about —
> Bound's own spec punts on that one. Half-day spike either way.
>
> Worth stating plainly: **this does not close frontend #1069.** That ticket wants Hana users to
> see their Hana balances, and those addresses come from Hana's Web3Auth `clientId`. Ours will be
> different addresses. That one stays a partnership question.
