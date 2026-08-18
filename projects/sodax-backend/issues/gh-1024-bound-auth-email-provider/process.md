---
type: process
repo: sodax-backend
github: 1024
updated: 2026-08-18
---

# Process

## Log

- **2026-08-12** — Research pass. Sources read directly; nothing inferred where a source was
  unreachable. No code written.
- **2026-08-18** — Second pass, this time **reading radfi-be source rather than its docs**. Cloned
  `dev` at `68d8dab`. Fez made the build call. See "2026-08-18 findings" below.
- **2026-08-18 (later)** — `boundex/radfi-web` access granted. The client half is now readable, so
  every previously-unobtainable item is settled. Written up as [[bound-client-crypto]]; the
  decisive findings are logged under "radfi-web" below.

## Source access — stated plainly

| source | result |
| --- | --- |
| `lydialabs/radfi-be` | **Accessible.** Private, `pull` permission only, default branch `dev`, pushed 2026-08-11. Read `docs/` and the auth-relevant source. |
| `boundex/radfi-web` | **404 with this token.** Cannot distinguish "does not exist" from "private and not shared". **No frontend reference was obtained; nothing about it is guessed at.** |
| `docs.bound.exchange` Bound Auth | Read: *What is Bound Auth*, *How It Works*, *Security Model*. (*Account Settings*, *Fund Recovery* not fetched.) |

The public docs and the private repo agree on every load-bearing point, which is a useful
cross-check.

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

---

# radfi-web — the client half (2026-08-18, later the same day)

Access to `boundex/radfi-web` was granted. Cloned at `15ac098`, `main`, ~238k LOC. Five parallel
readers over the crypto surface; **every load-bearing claim below was then re-verified by hand**
against the source, because the first pass had already shown that agent-reported and doc-reported
facts both need checking.

Full write-up: [[bound-client-crypto]]. Only what changes a conclusion is logged here.

## The PRF question is settled — it IS PRF

```ts
// src/core/keystore.ts
const PRF_SALT = new TextEncoder().encode("bound-wallet-prf-v1");
```

`docs/keystore-wallet-flow.md:191` ("an ECDH-derived key negotiated with the authenticator") is
wrong; `docs/requirements/auth-module.md:27` is right. Verified by hand.

**One shared salt for every user and every credential.** Registration is a **single ceremony** —
PRF is read from `create()`'s `getClientExtensionResults()`. They built the two-prompt round-trip
verification and **reverted it** because the server challenge expired mid-flow
(`17004 KEYSTORE_INVALID_ASSERTION`), and an in-repo doc records the resulting open risk that
create-time and assertion-time PRF may differ — i.e. **a class of accounts can be born
permanently un-unlockable.** No test covers it. They shipped anyway.

## The finding that matters most: Argon2id is bypassable

`src/auth/password.ts:23-30` — the same plaintext password feeds two derivations:

```ts
const srpData = generateSrpVerifier(email, password);     // → SHA-256  → sent to server
const { key } = await derivePasswordKey(password, ...);   // → Argon2id 64 MiB, t=3 → KEK
```

`src/auth/srp.ts` contains no argon2 and no pre-hash; the raw password goes straight into
`srpClient.derivePrivateKey(salt, email, password)`, i.e. `x = H(salt, H(email:password))` on
SHA-256.

```
server compromised → steal srpVerifier → offline attack at ~1 SHA-256 per guess
                   → recover password  → one Argon2id run → open the blob
```

**The 64 MiB × 3 Argon2id cost protects nothing against a server compromise.** The structural
separation is correct — two disjoint derivations, two independent random salts, no chaining — but
the cheap side sets the attacker's real cost. Traced end-to-end by hand from the caller down.

This is the single most important thing to not repeat, and neither repo shows it alone.

## Verified by hand, not just reported

| Claim | Verified |
| --- | --- |
| PRF salt is the global constant `"bound-wallet-prf-v1"` | `src/core/keystore.ts` |
| Argon2id `type:2, mem:65536, time:3, parallelism:4, hashLen:32`, 16-byte salt | `keystore.ts:43-52` |
| The same four numbers duplicated as inline literals, **with different field names** (`mem`/`time`/`hashLen` vs `memory`/`iterations`/`hashLength`) | `keystore.ts:141-146` |
| Derivation paths, all three hardcoded | `derivation.ts:10-14` |
| **No AAD anywhere** — every `additionalData` hit is an API error field | grep over `src/` |
| **`argon2Params` written but never read** — `derivePasswordKey(password, existingSalt?)` takes no params argument | `types/keystore.ts:20` + `keystore.ts:141` are the only non-test hits |
| SRP gets the raw password, no argon2 | `auth/srp.ts`, `auth/password.ts:23-30` |

## Derivation paths — the four-item gap is closed

```
bitcoin  m/86'/0'/0'/0/0     BIP-86 taproot, key-path only
evm      m/44'/60'/0'/0/0
solana   m/44'/501'/0'/0'    4-level Phantom-style, SLIP-0010 via ed25519-hd-key
```

Three chains only. Account and address index hardcoded to 0 — no multi-account, no gap-limit
scan, no override. Mnemonic is 12 words / 128 bits, `@scure/bip39`, English only; a BIP-39
passphrase is plumbed but never passed. Mainnet interop is correct against MetaMask / Phantom /
Xverse-ordinals; **signet is wrong** (coin type stays `0'` instead of SLIP-44's `1'`).

The `tradingAddress` is **not** built client-side — it comes back from the server.

## The fixed derivation message

Five lines, human-readable, and it **deliberately ignores its credential argument**, so it carries
no address, no nonce, no salt and no version:

```
Bound Wallet Auth
Purpose: Unlock the encrypted Bound keystore
This signature is not a transaction and does not spend funds.
```

Raw signature bytes go in as HKDF IKM with no pre-hash. The **two-signature model is confirmed
from the client**: the nonce signature is sent, the derivation signature is used locally and
zero-filled in a `finally` block. Taproot is rejected three independent ways. There is no runtime
determinism check — only a developer-only QA page.

## Backup — the answer to the question that was open for Fez

**A 12-word seed phrase, and nothing else.** Not shown at registration; the mnemonic is generated,
used, and cleared without ever being rendered. Revealed on demand only, through one component.

The nudge is a **sessionStorage** marker consumed on the *next successful login* — no second
login, no prompt ever. It is fully skippable, and **linking a second device silently clears the
prompt without ever showing the phrase**. The confirmation is one random word with unlimited
retries. All 12 words render in plaintext with no blur or click-to-reveal.

No warning string anywhere says "if you lose this we cannot restore your funds". The one real
acknowledgement checkbox exists **only on the Web3 Auth Wallet path**; passkey and password
signups get no equivalent.

**Recovery: definitively none.** No mnemonic-import UI exists anywhere in the client — all 9
`setupWallet()` call sites pass either `undefined` or a mnemonic that just came out of a decrypt.
No recovery codes, no social recovery, no guardians, no Shamir, no server share.
`passkeyRecovery.ts` is a 64-line guard for re-unlocking after a page refresh, not recovery.

## Their frontend docs are as stale as their backend docs

`AUTH_FLOW_OVERVIEW.md` documents only two auth modes and omits the entire third (Web3 Auth
Wallet), points at a login page that is now a bare redirect, and describes a flow whose only
implementation is dead code. `CODEBASE.md` and `ARCHITECTURE.md` never mention derivation paths
and still describe the pre-Bound architecture.

Combined with the six backend divergences: **read their code, not their docs, on both sides.**
