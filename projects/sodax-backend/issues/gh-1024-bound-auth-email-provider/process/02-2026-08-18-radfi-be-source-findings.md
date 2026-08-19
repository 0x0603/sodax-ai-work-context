---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
---

# 2026-08-18 findings

The 2026-08-12 pass read `radfi-be/docs/`. This pass read `src/`. **The two disagree in six
places**, so the earlier notes needed correcting as much as extending. Everything is now
consolidated in [[bound-auth-mechanism]]; only what *changed* is logged here.

## The build call

Fez, verbatim:

> "Our goal is: I want to create the entire piece of infrastructure, not integrate their email
> login. I want to create the entire email login, passkey, setup, all of that running on our
> servers, setting up a backup, you know, encrypted keys, all that. So we own that entire piece
> of infrastructure and it's our solution. And they've kind of built that, and that's how I've
> got you access to their repos that has all of that for you to look at it, and we should be
> able to basically take most of the work they've done and redo and map out our architecture and
> how we want to do it."

Recorded as [[0001-own-the-email-wallet-auth-plane]]. It closes the last open acceptance
criterion and explains the repo access: it was arranged deliberately, for this.

## Corrections to the 2026-08-12 notes

**"Passkey → key derived from the WebAuthn PRF output" was stated as fact. It is not verifiable.**
`grep -rin "\bprf\b" src/` → **zero hits**; `prf` appears only in `docs/`. And the docs
contradict each other: `requirements/auth-module.md:27` says PRF, `keystore-wallet-flow.md:191`
says "an ECDH-derived key negotiated with the authenticator device". Every ECDH reference in
`src/` belongs to the A↔B device relay, not to authenticator key agreement.
`requirements/auth.md:78` leaves it open outright: *"The exact mechanism — be it WebAuthn PRF,
secure enclave storage, etc. — should be determined during engineering design based on platform
support."* Since the server is a blind custodian, the backend **cannot** resolve this, and
`radfi-web` is still 404.

**"One keystore per account" (from the docs) is wrong.** `KeystoreSchema.index({accountId, type})`
is **not unique**, and `assertBelowPasskeyLimit` counts `{accountId, type: PASSKEY}` against
`maxPasskeysPerAccount: 5`. Each device gets its own row with its own `encryptedBlob` under its
own KEK, all wrapping the same mnemonic. That is *why* the ECDH relay exists.

**The OTP-endpoint enumeration question is settled — and it settled badly.** The 2026-08-12 notes
flagged this as unresolved. `docs/api/auth.md` promises *"never reveals whether the email is
registered (enumeration defence)"*; `auth.service.ts:413-417` throws `400 account.emailTaken`.
The controller's own Swagger annotation agrees with the code (`@ApiResponse({ status: 400,
description: 'Email already registered' })`). **It leaks.** Notably they got this right elsewhere
— `srpInit` returns a deterministic fake salt for unknown emails — so it is an inconsistency, not
a philosophy.

## Newly established

- **Mnemonic vs KEK.** The key is generated once and stored as ciphertext; the thing that must be
  reproducible on every login is the **KEK**, not the mnemonic. Proven by the change-password path:
  it swaps `srpSalt` + `srpVerifier` + `encryptedBlob` together and addresses never change.
- **Why the passkey *signature* cannot be the KEK.** `signedBytes = authenticatorData ‖
  SHA-256(clientDataJSON)` — the challenge changes and `signCount` increments, so the signature
  changes even for a fixed message. PRF exists to supply a stable secret without exporting the key.
- **RFC 6979 is a convention, not a protocol rule.** The determinism whitelist works because
  mainstream wallets implement it. A wallet using a random `k` would destroy that user's keystore
  on their second login, undetectably in advance. Real fragility of the wallet-auth path.
- **No social/OAuth login anywhere.** `grep -rin "oauth|google|social|openid|id_token|jwks" src/`
  returns only rune/token metadata. Structural, not an omission: OAuth yields identity, not a
  reproducible secret. Gmail can replace the OTP step; it cannot replace the passkey.
- **`email_outbox` is a table, not a mailer.** No SES/SendGrid/Resend/nodemailer in the repo; an
  external `radfi-cronjob` sends. Because `findActiveVerificationRequest` filters `status: SENT`,
  an OTP is unusable until that worker has run.
- **Global guards are partner auth, not user auth.** Only `SodaxApiKeyGuard` and
  `SodaxRateLimitGuard` are `APP_GUARD`; `SodaxApiKeyGuard` fails **open** with no
  `x-api-signature`. `JwtAuthGuard` is per-controller — routes are public by default.
- **Nine anti-patterns** worth not copying, listed in [[bound-auth-mechanism]] §10. The sharpest:
  `GET /keystore/passkey/relay` is `@Public()` with **no rate limiter at all**.

## What changed the effort estimate

`@better-auth/passkey` (1.6+) accepts `extensions` on `signIn.passkey` / `addPasskey` and returns
`clientExtensionResults` with `returnWebAuthnResponse: true` — documented explicitly for PRF. So
one ceremony yields both the assertion and the PRF output, with no hand-rolled WebAuthn. Combined
with Better Auth already being in `apps/stateful-api` (`1.4.18`, `email-otp`/`jwt`/`bearer`/
`two-factor`/`siwe` on disk, unused), most of radfi-be's ~6,700-line auth surface collapses.

On the client side, the SDK's 8-of-9 wallet providers already take a raw `privateKey`, so
decrypt → derive → construct-existing-provider needs no SDK change; EIP-6963 and Wallet Standard
cover connector registration for EVM/Solana/Sui without touching `wallet-sdk-react`.

## Still unobtainable

BIP-44 paths (`grep "m/44|derivePath|coin_type"` over `src/` **and** `docs/` → 0 hits), argon2id
parameters, blob envelope format, and the fixed wallet-derivation message. All client-side; all
only needed for *compatibility with Bound*, which is not a goal. Fastest resolution if it ever
becomes one: register on Bound's app with devtools open and read the `POST /auth/register` payload.

## Changes During Work

The ticket's nature changed: filed as `research(...)`, it is now a build. `plan.md` gained a
Phase 2. Four scope questions for Fez are parked there — the most important being what "backup"
means, since "recover with email alone" would require a server-held key share and make us a
custodian.
