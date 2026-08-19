---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-12
updated: 2026-08-12
---

# 2026-08-12 — Research pass (docs + `radfi-be/docs/`)

## Findings

### What Bound Auth is — and what it is not

**It is not an MPC wallet.** The server is a **blind custodian of a client-encrypted keystore
blob**. Per radfi-be's own `docs/keystore-wallet-flow.md`:

> The server **never receives or stores the mnemonic (seed phrase) in plaintext**. The client
> owns the mnemonic entirely. What the server stores is an `encryptedBlob`: the mnemonic
> already encrypted client-side with a key only the user can reconstruct. **The server is a
> blind custodian of that ciphertext.**

Self-custody invariants from `docs/requirements/auth-module.md` §1: the server can never access
user funds; the user can always access funds without the server; the server **stores** the
opaque blob, public addresses, public keys and auth metadata; the server **never stores or
logs** the mnemonic, private keys, plaintext passwords, passkey PRF output, or any wallet
derivation signature.

**Identity is email. One keystore per account, method fixed at creation:**

| method | secures the keystore | proves identity to the server |
| --- | --- | --- |
| **Passkey** (WebAuthn) | key derived from the passkey **PRF** output | WebAuthn assertion vs stored public key |
| **Password** | key derived from the password (argon2id) | **SRP** zero-knowledge proof — server never sees the password |
| **Wallet** (external web3 wallet) | key derived from a **deterministic** wallet signature | signature over a **fresh server nonce** |

**Bitcoin `tradingAddress`** is a 2-of-2 P2TR co-signed by a relayer, and Bound's co-signature
authority **expires after 3 months** so the user can always recover unilaterally.

### The single most reusable idea: the two-signature model

`docs/requirements/auth-module.md` §5.2 — wallet login needs two signatures with **opposing**
requirements, so they cannot be the same signature:

- the **server-identity proof** must change every login → signs a fresh nonce, sent to the server;
- the **keystore-derivation** signature must be byte-identical every login → signs a fixed
  message, **never sent to the server**.

That is also why the determinism whitelist excludes Taproot/Schnorr and **BIP-322**: auxiliary
randomness makes them non-deterministic, which would make the keystore unrecoverable. Allowed:
EVM ECDSA `personal_sign` (EIP-191), Solana Ed25519, Bitcoin BIP-137 (p2pkh / p2wpkh /
p2sh-p2wpkh only).

Nonce rules (§5.3–5.4): fresh, **address-bound**, one-time, short TTL, and **consumed before
signature verification** so a wrong signature cannot replay it. Order of checks: whitelist →
BTC address type → address-derives-from-pubkey → consume nonce → verify. A mismatch returns
`authWalletAddressKeyMismatch`, which stops someone proving control of their own key while
claiming another address.

Also worth copying: **wallet-signature failures do not count toward lockout** — forging a
signature is infeasible, so counting it would only create a denial-of-service vector.

### Token, session and OTP model

- JWT access ~10 min, refresh 7 days, **single-use and rotated** (`jti`). `jwt.strategy.ts`
  does a **positive type assertion** — it accepts only tokens explicitly typed `access`,
  rejecting refresh tokens and tokens with no `type`.
- Claims: `sub`, `type`, `accountId?`, `sessionId?`, `role?`, `keystoreId?`, `userAddress?`.
- Sessions store UA-derived device/browser, **masked IP** (IPv4 last octet zeroed, IPv6 /64
  prefix), country from a CF header, `lastActiveAt` throttled to 30 s.
- OTP: 6 digits, 10-minute TTL, single-use via CAS, locked after 5 attempts, and the stored
  hash is **`HMAC-SHA256(otp, jwtRefreshSecret)`** rather than plain SHA-256 *"so a DB dump
  alone is insufficient to reverse the OTP"*.
- Multi-device is an **ECDH relay** where the server stays blind: device B posts a public key,
  device A stores an ECDH-encrypted blob for it, B fetches and decrypts.

One inconsistency inside radfi-be's own docs, unresolved: `docs/api/auth.md` says the
OTP-request response is always `{success:true}` *"never reveals whether the email is
registered"*, while `docs/email-verification.md` says it returns 400 `account.emailTaken`.
Their service source was not read to settle it.

### What sodax-backend has today — the gap list

**Nothing of the above exists.** Verified by grep across every `package.json`:
no `jsonwebtoken` / `@nestjs/jwt` / `passport-jwt` / `jose`, no `otplib`, no
`secure-remote-password`, no `webauthn`/`passkey`, and **no email transport at all** (no
nodemailer / resend / sendgrid / postmark / mailgun / SES).

What does exist:

- **`apps/stateful-api` is the only auth authority** — Better Auth, `auth.config.ts:11-12`
  says so verbatim. Deliberately **Google-only**: `emailAndPassword: { enabled: false }` with
  the comment *"Google-only for V1"*. Cookie sessions, 7-day expiry. Org API keys are a
  self-contained sha256 store (`sodax_` prefix, returned once, never retrievable).
- **`POST /users/register` is not an auth endpoint.** `users.service.ts:29-126` verifies a
  wallet signature per chain (EVM viem, Stellar, Sui, Solana, Injective) — but over a
  **client-chosen message with no nonce, no expiry and no replay protection** — and issues
  **no token and no session**. It records ToS acceptance. A captured
  `(address, message, signature)` triple is the whole credential.
- Guards elsewhere are bearer/IP/API-key: `AdminTokenGuard` (sha256 + `timingSafeEqual` against
  **pre-hashed** digests in env), `IPGuard`, `SponsorApiKeyGuard` (fail-closed on IP/origin
  mismatch, pre-hashed key registry).

So building this is a from-scratch auth plane: email transport, JWT issuance, WebAuthn, SRP,
nonce store, OTP outbox, lockout — none of it is in the repo.

### The constraint that decides the shape: PR #1048

Open PR **#1048** ("API-key control plane") adds a tenth app, `apps/api-auth` (NestJS +
Postgres + Drizzle). Its design record `docs/api-authentication.md` **rules this issue out of
its scope, explicitly**:

| # | Decision | Choice |
| --- | --- | --- |
| 8 | **#1024 (email/wallet login)** | **Not here. api-auth stays internal-only, no public route, ever** |

with the rationale: *"A public end-user login surface is attack-facing. Placing it on the same
box as the key-integrity store would defeat the isolation that decision 6 exists to buy."*

So #1024 cannot land inside api-auth and needs its own home. #1048 is simultaneously the
**freshest template for how to add an app here** (config class + validation, health module,
vitest setup, compose block, `.env-example`, CLAUDE.md/AGENTS.md updates) and the precedent for
a design record living as `docs/<name>.md`.

### Conventions any proposal has to satisfy

- `docs/PATTERNS.md` survey is mandatory before designing recovery/retry/lock/journal work; an
  unjustified re-implementation of an existing pattern is a **P1** review finding.
- Collection write-ownership is one-writer-per-collection, documented in the `AGENTS.md` table;
  violating it is a **P0**.
- `docs/TEAM_CONVENTIONS.md`: post the approved plan as an issue comment **before** implementing,
  and settle up front whether the deliverable is a code fix or an issue-ready document.
- Gates: `pnpm lint` / `build` / `test` in CI (**`checkTs` is not in CI** — type errors only
  surface via `nest build`). Pre-commit runs `checkTs` → `test` → lint-staged.

### The cross-repo link

Frontend **#1069** is stuck because every MPC provider scopes keys to the app `clientId`, so
"same address across providers" is impossible without sharing Hana's Web3Auth config. The
encrypted-keystore model here has **no such scoping** — the address comes from a user-held
mnemonic. That makes #1024 the structural answer to #1069.

Written up once for both: `knowledge/architecture/encrypted-keystore-vs-mpc-email-wallets.md`.

## Changes During Work

None.
