---
type: decision
scope: cross-repo
status: Accepted
tags: [auth, email-login, privy, embedded-wallet, custody, build-vs-buy, wallet-sdk-react, tee]
date: 2026-09-18
updated: 2026-09-18
related_issues: [gh-456-privy-wallet-source-sdk, gh-1024-bound-auth-email-provider, gh-1069-email-provider-wallet-connectivity]
supersedes: [0001]
---

# 0003 — Adopt Privy as the email-wallet provider; do not build the auth plane

> Status and scope live in the frontmatter above (single source of truth).

## Context

[[0001-own-the-email-wallet-auth-plane]] (2026-08-18) recorded Fez's call to **build** the email
login and wallet custody in-house: an encrypted-keystore plane modelled on Bound Auth, with email
as the account identifier and a passkey or password unlocking a client-encrypted mnemonic. That
decision explicitly took on a public, attack-facing login surface, an irrecoverable-wallet support
policy, and a cross-repo build (backend service + client crypto package + frontend wiring).

Two product calls have since replaced it, both recorded in the body of
[icon-project/sodax-sdks#456](https://github.com/icon-project/sodax-sdks/issues/456) (filed
2026-09-15):

- **Robi/Fez, 3 Sep** — Privy is the wallet-connectivity path.
- **Anton/Fez, 14 Sep** — Privy is the **replacement for the in-house email login**.

#456 is the SDK slice of that: Privy becomes an opt-in wallet source in `@sodax/wallet-sdk-react`,
sitting in the same list as MetaMask, Hana and WalletConnect. The sodax.com frontend dropping its
in-house email login in favour of this option is a separate card.

This ADR records the reversal and the properties SODAX now inherits, because the trade-offs 0001
was written to avoid are exactly the ones we now accept.

## Decision

**Buy, do not build. Privy is the email-wallet provider.** The in-house encrypted-keystore auth
plane from 0001 is not built.

In the SDK this lands as an **opt-in EVM wallet source**: a partner sets `EVM.privy` on
`SodaxWalletConfig` and gets an "Email (Privy)" connector; a partner who omits it loads no Privy
code. V1 is EVM only. The architecture (a plain wagmi connector behind a
`@sodax/wallet-sdk-react/privy` sub-path, **not** `@privy-io/wagmi`) is decided in the issue's
`plan.md`, not here — that is an implementation choice and can change without reopening this ADR.

## Consequences

**Easier**

- No public credential surface to defend, no keystore service, no irrecoverable-wallet support
  policy of our own, no cross-repo build. The genuinely large part of 0001 disappears.
- Partner onboarding is a config slot, not an integration project.
- Wallets are self-custodial by Privy's design: 2-of-2 TEE sharding (enclave share + auth share),
  so Privy cannot sign alone, and key export is always available to the user.

**Harder — and these are the reversals of 0001's stated reasons**

- **Third-party dependency and per-MAU pricing.** Free to 499 MAU; $299/mo to 2,499; $499/mo to
  9,999; beyond that $2,000 PAYG + $0.05/MAU + $0.01/signature. Every embedded-wallet signature is
  metered and is a round trip to Privy — **no signing while Privy is down**, and no SLA below
  Enterprise.
- **App-scoped addresses.** The same email produces a different address in a different Privy app.
  0001 valued the keystore model precisely because a user-held mnemonic is reproducible without
  us; Privy's entropy is random and bound to an app-scoped user record. Whether partners use their
  own `appId` (per-partner addresses) or a SODAX-provided one (one address, one shared trust
  boundary, SODAX pays and allow-lists every partner origin) is an **open product question**.
- **There is no password.** 0001's model had a password or passkey unlocking the blob. On Privy's
  default TEE execution there is no password login and no password/cloud recovery factor —
  recovery *is* the login method (email OTP), and the equivalent safeguard is wallet MFA
  (passkey/TOTP/SMS). Password recovery exists only for Privy's *on-device* execution mode, which
  must be enabled by Privy support and cannot be migrated back. **#456's acceptance criterion "set
  recovery/password" therefore has no mechanism as written** and needs Fez's answer before the
  docs claim it.
- **The Privy session is the root of trust.** Account access is wallet access: an attacker holding
  the session tokens can sign and, absent wallet MFA or a key quorum, export the key through
  Privy's REST API. Mitigations are partner-side: HttpOnly cookies, a strict CSP, MFA, allowed
  origins.

**To watch**

- Privy ships roughly weekly and re-pins its exact `viem` dependency each release, while this
  workspace enforces a 14-day install cooldown — the SDK's pinned version will always trail.
- #1069 (a Hana user seeing their Hana addresses after an email login) is **still not solved** by
  this decision, for the same reason 0001 did not solve it: addresses are provider- and
  app-scoped. See [[encrypted-keystore-vs-mpc-email-wallets]]. Close #1069 as superseded only on
  the implementation question, not on that requirement.
- sodax-backend #1024 (Bound Auth research) loses its product driver. Nothing in this ADR deletes
  work already shipped there; it should be re-scoped or closed deliberately.

## Alternatives considered

- **Build the keystore plane (0001).** Rejected by the 14 Sep product call. The engineering
  analysis in 0001 still stands — it was a viable build — but it is no longer funded, and the
  operational commitment (a public login surface, a support policy for bricked wallets) was the
  part that made it expensive.
- **Another MPC/embedded-wallet vendor (Web3Auth, Turnkey, Magic).** The earlier feasibility work
  pointed at Web3Auth; the vendor choice settled on Privy before #456 was filed. Every one of them
  scopes key derivation to an app id, so the app-scoping consequence above is not Privy-specific.
- **Privy for auth only, keys held by SODAX.** Would recreate the custody surface 0001's successor
  is trying to avoid, and contradicts Privy's self-custodial model. Not considered seriously.

## Related

- Issues: [icon-project/sodax-sdks#456](https://github.com/icon-project/sodax-sdks/issues/456)
  (`projects/sodax-sdks/issues/gh-456-privy-wallet-source-sdk/`),
  sodax-backend#1024, sodax-frontend#1069
- Decisions: [[0001-own-the-email-wallet-auth-plane]] (superseded by this),
  [[0002-key-custody-boundary-for-third-party-dapps]] (its RP-ID/custody-boundary reasoning was
  written for the in-house passkey plane; re-read it before quoting it in a Privy context)
- Knowledge: [[encrypted-keystore-vs-mpc-email-wallets]]
