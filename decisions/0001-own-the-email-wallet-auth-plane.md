---
type: decision
scope: cross-repo
status: Accepted
tags: [auth, email-login, passkey, keystore, custody, build-vs-buy, bound-auth]
date: 2026-08-18
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider, gh-1069-email-provider-wallet-connectivity]
---

# 0001 — Build and own the email-wallet auth plane; Bound is the blueprint, not the provider

> Status and scope live in the frontmatter above (single source of truth).

## Context

`sodax-backend#1024` asked for "our own backend for email provider based wallet login (we are
provider) so that we are not depending on external 3rd parties", naming Bound Auth
(`docs.bound.exchange`, `lydialabs/radfi-be`, `boundex/radfi-web`) as the reference. It sat open
from 2026-07-27 with zero comments. A research dossier was produced 2026-08-12 but never posted,
and its one open acceptance criterion was *"a build-vs-adopt recommendation with an owner —
needs a product call."*

On 2026-08-18 Fez made that call directly, and it resolves the ambiguity the ticket carried:

> "Our goal is: I want to create the entire piece of infrastructure, **not integrate their email
> login**. I want to create the entire email login, passkey, setup, all of that running on our
> servers, setting up a backup, you know, encrypted keys, all that. So we own that entire piece
> of infrastructure and it's our solution. And they've kind of built that, and that's how I've
> got you access to their repos that has all of that for you to look at it, and we should be able
> to basically take most of the work they've done and **redo** and map out our architecture and
> how we want to do it."

Two things this clarifies that the issue body did not:

1. **"Not integrate their email login"** distinguishes this from the *existing* Bound
   relationship. `apps/bridge-api` and `apps/swaps-api` already sign outbound requests with
   `BOUND_API_SECRET_KEY` HMAC, and Bitcoin intents already carry a per-user `bound.accessToken`
   the user mints against Bound. That integration stays; auth does **not** go the same way.
2. **Repo access to `lydialabs/radfi-be` was arranged deliberately**, as reference material.
   `boundex/radfi-web` was not obtained and remains 404.

## Decision

**Build the full auth plane in-house, using `radfi-be` as a reference implementation to redo —
not to copy, and not to call.**

Model: the encrypted-keystore design documented in [[bound-auth-mechanism]]. The client generates
a BIP-39 mnemonic, derives its own chain keys and encrypts the mnemonic client-side; our server
stores only ciphertext and is a blind custodian. Email is the account identifier; a passkey
(WebAuthn PRF) or a password unlocks the blob.

Named in scope by Fez: **email login, passkey, account setup, backup, encrypted keys, on our
servers.**

## Consequences

**Easier**

- No third-party dependency, no per-MAU pricing, no vendor lock-in on the auth plane.
- No `clientId` scoping — addresses derive from a user-held mnemonic, so they are portable and
  reproducible without us.
- `radfi-be` is a complete, working reference with a written spec, which removes most of the
  design risk. Better Auth (already in `apps/stateful-api`) plus `@better-auth/passkey` covers
  email OTP, WebAuthn ceremonies, sessions, JWT and 2FA, so the genuinely new code is the
  keystore layer — far smaller than radfi-be's ~6,700-line auth surface.

**Harder**

- We take on a **public, attack-facing login surface**. Nothing in `sodax-backend` is currently
  exposed this way; today's auth is pre-hashed bearer tokens in env, IP allowlists and partner
  API keys. This is an operational commitment, not just code.
- **Irrecoverable wallets are inherent.** Lose every passkey and forget the password and the blob
  is a brick — we cannot help, by design. Mandatory seed-phrase backup at signup is load-bearing
  product work, and the support policy must exist before launch.
- It cannot live in `apps/api-auth`. PR #1048's design record rules #1024 out by name:
  *"Not here. api-auth stays internal-only, no public route, ever."* It needs its own app on its
  own box.
- Cross-repo: backend service + a client crypto package in `sodax-sdks` + wiring in
  `sodax-frontend`. Needs the parent/sub-issue structure set up before coding starts.

**To watch**

- **WebAuthn PRF availability** across iCloud Keychain / Google Password Manager / Windows Hello
  decides whether the passkey path works at all. Spike it before committing to the rest. Bound's
  own spec leaves the mechanism open *"based on platform support"*.
- radfi-be's docs disagree with its code in six places, and one is a **false security claim**
  (enumeration defence that is not implemented). Build from their source, not their docs — but
  keep the places where their stated intent is better than their implementation.

## What this decision does NOT settle

- **`sodax-frontend#1069` is not solved by this.** That ticket wants a Hana user to log in by
  email at Sodax and see their *Hana* balances. Hana's addresses derive from Hana's Web3Auth
  `clientId`; our keystore produces a fresh mnemonic and therefore a different address. Only Hana
  sharing their Web3Auth configuration satisfies #1069, and that is a partnership negotiation.
  Fez's framing does not mention Hana. **Do not let #1024 shipping be read as closing #1069.**
- **What "backup" means.** Still needs confirming with Fez, but there is now evidence to put in
  front of them. `radfi-web` access was granted the same day, and it settles what Bound actually
  ships ([[bound-client-crypto]] §5-6): **backup is a 12-word seed phrase and nothing else.** It
  is *not shown at registration*, revealed on demand only, the nudge is armed in sessionStorage
  and fires only on the next successful login, it is entirely skippable, and linking a second
  device silently cancels the prompt without ever showing the phrase. There is no reset, no
  recovery codes, no social recovery, no server-held share, and **no mnemonic-import UI anywhere
  in the client** — a user who forgets the password and loses every passkey has no path back.

  So the two readings are concrete now:
  - **A — backup against device loss.** The encrypted blob on our servers. This is what Bound has,
    and it is the reason the server exists at all.
  - **B — backup against credential loss.** Forget the password, lose every passkey, still recover.
    Bound does not have this, at any layer. It requires a server-held share and makes us a
    custodian.

  Ask Fez literally: *"if a user forgets their password and loses every device, must we be able to
  get them back in?"* Yes or no picks the architecture.
- **Scope boundaries.** Fez named email login, passkey, backup, encrypted keys. Not named:
  external-wallet auth, 2FA, multi-device linking, the BTC trading wallet. Bound has all of them.
- **Chains.** Bound covers BTC/EVM/SOL. The Sodax SDK spans 9 chain families / 21 chains.

## Alternatives considered

- **Integrate Bound's email login as a client** — explicitly rejected by Fez, and it is the
  third-party dependency #1024 exists to remove.
- **Adopt an MPC provider (Privy / Web3Auth / Turnkey / Magic)** — fastest to ship and the only
  way to get "email alone unlocks the wallet", but it is exactly the dependency being removed,
  and keys stay `clientId`-scoped. Privy is additionally disqualified: no ICON support, and ICON
  is the Sodax relay chain.
- **Share Hana's Web3Auth configuration** — the only route to #1069's address parity, but it
  solves a different problem, keeps the third-party dependency, and couples security across two
  apps.

## Related

- Issues: `gh-1024-bound-auth-email-provider`, `gh-1069-email-provider-wallet-connectivity`
- Knowledge: [[bound-auth-mechanism]], [[bound-client-crypto]], [[encrypted-keystore-vs-mpc-email-wallets]]
