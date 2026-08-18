---
type: knowledge
area: architecture
status: Active
tags: [wallet, email-login, mpc, web3auth, keystore, bound-auth, custody]
updated: 2026-08-18
related_issues: [gh-1069-email-provider-wallet-connectivity, gh-1024-bound-auth-email-provider]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# Email wallets: encrypted keystore vs MPC, and why the difference decides GH-1069

Two different architectures both ship as "log in with email, get a wallet". They fail in
opposite places, and SODAX has one open issue blocked by each side of that difference.

## MPC (Web3Auth, Privy, Turnkey, Magic)

The key is split into shares and reconstructed at login. **Every one of these providers scopes
key derivation to the app's `clientId`.** The same email at two different apps gives two
different addresses.

That is a **security property, not a limitation** — it is what stops any app that can
authenticate you from deriving the key you use somewhere else. There is no MPC provider that
offers "email-only, cross-domain" wallets, and there will not be one, because it would mean
exactly that.

Consequence for SODAX: to show a Hana user their Hana balances after an email login at SODAX,
we would have to run on **Hana's** Web3Auth configuration — their `clientId`, their allowed
origins, a shared custom verifier on their dashboard. That is a partnership request, and its
price is **coupled security**: an incident or misconfiguration on either app affects both, and
the arrangement is hard to untangle afterwards.

## Encrypted keystore (Bound Auth / radfi-be)

The client generates a mnemonic, derives its own addresses, and encrypts the mnemonic
client-side. The server stores only that ciphertext and is a **blind custodian** — it cannot
decrypt it. Identity is an email account; the blob is unlocked by a passkey (key derived from
the WebAuthn PRF output), a password (SRP, so the server never sees it), or a deterministic
signature from an external wallet.

**The address comes from the mnemonic, not from the provider.** There is no `clientId` in the
derivation path, so the "different provider → different address" problem does not arise. A user
who can reconstruct their decryption key can recover the same wallet anywhere, including
without the server.

The cost is that it is a real auth plane to build and operate — email transport, OTP, JWT
issuance and rotation, WebAuthn, SRP, a nonce store, lockout — plus custody of an encrypted
blob and a public login surface to defend.

## Why this matters here

- **sodax-frontend #1069** wants email login where a Hana user sees their balances. It is
  blocked on the MPC property above, and its own research comment (2026-04-15) says so.
- **sodax-backend #1024** is researching Bound Auth — i.e. the encrypted-keystore model.

**Correction (2026-08-18).** An earlier version of this note called the keystore model "the
structural answer to #1069". That was too strong, and the difference changes what gets funded.

The keystore model removes **future** provider lock-in — there is no `clientId` in the derivation
path, so a user can reconstruct the same wallet anywhere, including without us. It does **not**
give a Hana user their *existing* Hana addresses, which derive from Hana's Web3Auth `clientId`;
our keystore mints a fresh mnemonic and therefore a different address.

So #1024 and #1069 are **not** two halves of one question. They are different problems:

| Goal | Only answer |
| --- | --- |
| Own the auth plane, no third-party dependency (#1024) | build the keystore model |
| A Hana user sees their Hana balances (#1069) | Hana shares their Web3Auth config — a partnership deal, not engineering |

Fez's 2026-08-18 build call ([[0001-own-the-email-wallet-auth-plane]]) is about the first and does
not mention Hana. Shipping #1024 must not be read as closing #1069.

## Design details from radfi-be worth keeping

> Superseded in depth by [[bound-auth-mechanism]], which is derived from source rather than docs.
> Kept here as the short list.

Non-obvious things a from-scratch implementation gets wrong:

- **Two signatures, not one.** Wallet login needs a *server-identity proof* (signs a fresh,
  address-bound, one-time nonce; sent to the server) and a *keystore-derivation signature*
  (signs a fixed message; byte-identical every login; **never sent**). Their requirements are
  opposite, so one signature cannot serve both.
- **Determinism whitelist**: EIP-191 `personal_sign`, Ed25519, and Bitcoin BIP-137 only.
  **Taproot/Schnorr and BIP-322 are excluded** — auxiliary randomness makes them
  non-deterministic, which would make the keystore permanently unrecoverable.
- **Consume the nonce before verifying the signature**, so a wrong signature cannot replay it.
- **Wallet-signature failures must not count toward account lockout** — forging one is
  infeasible, so counting it only creates a denial-of-service vector against the real user.
- **Hash the OTP with an HMAC keyed on a server secret**, not plain SHA-256, so a database dump
  alone does not reverse it.
- Multi-device sync as an **ECDH relay** where the server passes ciphertext it cannot read.

## Sources

- `docs.bound.exchange` — Bound Auth: *What is Bound Auth*, *How It Works*, *Security Model*.
- `lydialabs/radfi-be` (private, read access arranged by Fez) — this note cites its `docs/`;
  **its docs disagree with its code in six places**, so prefer [[bound-auth-mechanism]], which was
  read from `src/` at commit `68d8dab`.
- `boundex/radfi-web` — **not accessible**; no frontend reference was obtained.
