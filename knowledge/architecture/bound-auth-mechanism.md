---
type: knowledge
area: architecture
status: Active
tags: [auth, bound-auth, radfi-be, radfi-web, keystore, passkey, webauthn, srp, prf, email-login, custody]
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider, gh-1069-email-provider-wallet-connectivity]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# Bound Auth: the mechanism, read from radfi-be source

Everything here is derived from `lydialabs/radfi-be` **source**, not from its docs — its docs
disagree with the code in six places (table at the end). Originally read at commit `68d8dab`,
branch `dev`, 2026-08-11 (56,625 LOC TS, 57 modules); **backend claims re-verified at `c1c1e06`
(`dev`) and client claims at `boundex/radfi-web` `15ac098` (`main`), 2026-08-18** — line numbers
below track those two commits. `68d8dab` is no longer resolvable in the local clone, and the
backend moved between the two (e.g. the registration OTP call is now wrapped in
`verifyRegistrationEmail`).

Cloned persistently outside the workspace as `radfi-be`; the absolute path is **machine-specific**
(on this machine `/Users/leon/Documents/GitHub/radfi-be`). See [[bound-exchange-repos]] for local
paths, refresh instructions, and the caveat that a `git pull` moves past the commit cited here.

Companion note: [[encrypted-keystore-vs-mpc-email-wallets]] compares this model against MPC.

## Access provenance

`lydialabs/radfi-be` is readable with the 0x0603 token — **deliberately arranged by Fez** so we
could use it as the blueprint (see [[0001-own-the-email-wallet-auth-plane]]).
`boundex/radfi-web` was 404 until **2026-08-18**, when access was granted. The client half is
now written up separately in [[bound-client-crypto]], and every item this note originally listed
as unobtainable is settled there.

## 1. It is not "log in with email" in the OTP sense

```ts
// src/modules/auth/auth.type.ts:11
export enum EAuthType { PASSKEY = 'passkey', SRP = 'srp', WALLET = 'wallet' }
```

There is no `EMAIL` auth type and no email-login endpoint among the 12 in `auth.controller.ts`.
`/auth/email-verification/request` is registration-only.

Email is the username **on the SRP/password path only**. In the shipped client (`radfi-web` @
`15ac098`) no signup flow sends an email at all: the only two `/auth/register` call sites are
passkey (`AuthModal.tsx:743`, keyed by a user-chosen passkey *name*, `:649`) and wallet
(`AuthModal.tsx:1274`), and `requestEmailVerification` (`src/api/auth.ts:41`) has **no callers**.
There is no SRP registration in the client at all — `createPasswordKeystore` is reachable only from
the post-login `ResetPasswordPanel.tsx:156`. Pre-login, email appears in exactly two SRP-scoped
calls: `srpInit({email})` (`AuthModal.tsx:467`) and the password-hint request
`POST /keystore/srp/password-hint` (`src/api/keystore.ts:104`); everything else is post-login
account management. The backend agrees — `register.dto.ts:92-98` marks email *"Required for SRP
only (email-keyed login); optional for passkey/wallet"*, with the OTP required only when an email is
supplied.

Face ID is **not a "second factor" to email** — on the passkey path there is no first factor for it
to be second to. The assertion is discoverable and emailless (`getDiscoverablePasskeyAssertion`,
`webauthn.ts:440`, no `allowCredentials`), and the same ceremony's PRF output is what derives the
KEK (§3). Shipped landing copy is *"Connect a wallet, or use a passkey for the easiest
experience"*; password sits under *"Legacy login options"*. The old email+OTP signup screens
(`(auth)/register/RegisterForm.tsx`, `VerifyOtp.tsx`) still exist in the tree but are **dead** —
`register/page.tsx` and `login/page.tsx` both `redirect(buildLegacyAuthCompatibilityPath(…))` into
`AuthModal`, and nothing imports them. The in-repo memo
`src/auth/passkey-prf-roundtrip-changes.md:24` (*"signup stuck on the OTP screen"*) is a stale
reference to that removed flow, not evidence of a live email-OTP signup.

And **the OTP alone never unlocks anything**, whichever path supplies it. There is no social/OAuth
login at all (`grep -rin "oauth|google|social|openid|id_token|jwks" src/` returns only token/rune
metadata, the passkey AAGUID whitelist labels, and one test constant).

`AccountEntity.email` is `unique, sparse` — **optional**. Passkey and wallet accounts can exist
with no email.

## 2. The trust boundary — the axis the whole system turns on

```
CLIENT                          │ WIRE                  │ SERVER
mnemonic                        │ ciphertext            │ encryptedBlob (opaque)
per-chain private keys          │ public keys           │ webauthnPublicKey
KDF (password / PRF / signature)│ signatures            │ srpSalt, srpVerifier
encrypt / decrypt               │ addresses             │ addresses, sessions
```

`grep -rin "argon2|scrypt|pbkdf2|prf" src/` → **zero hits**. The server performs no keystore
crypto whatsoever. The only AES-GCM in `src/` protects the *server's own* secrets (SRP session
fields in Redis, TOTP secret) — unrelated to the keystore.

## 3. Mnemonic vs KEK — the part most explanations get wrong

The key is **not regenerated** on each login. It is generated once, stored as ciphertext on the
server, and downloaded + decrypted every time.

```
REGISTER (once)          client: mnemonic = generate()
                                 KEK      = ceremony()
                                 blob     = encrypt(mnemonic, KEK)   ──► server stores blob

LOGIN (every time)       client: KEK      = ceremony()      ← must reproduce the SAME value
                                                            ◄── server returns blob
                                 mnemonic = decrypt(blob, KEK)
                                 derive   → same addresses
```

So the server is the backup. It holds the safe; it has no key.

**The thing that must be reproducible is the KEK, not the mnemonic.** All three mechanisms are
deterministic functions of a fixed secret and a retrievable salt:

| Method | KEK | Why it repeats |
| --- | --- | --- |
| Passkey | `KEK = HKDF-SHA256(prfOutput, salt = blob.aesIv, info = "bound-keystore")` → AES-256-GCM, where `prfOutput = HMAC-SHA256(CredRandom, SHA-256("WebAuthn PRF" ‖ 0x00 ‖ "bound-wallet-prf-v1"))` | `CredRandom` is generated at credential creation, stored inside the authenticator, never exported; HMAC and HKDF are both deterministic. **Confirmed PRF** from the client — the PRF salt is the global constant `"bound-wallet-prf-v1"` (`keystore.ts:67`), but the HKDF salt is the blob's own random 12-byte `aesIv`, so the KEK is **per-blob**, not per-credential ([[bound-client-crypto]] §1-2). |
| Password | `argon2id(password, salt, m, t, p)` | Deterministic by definition. Salt + params live in the blob envelope. |
| External wallet | `KDF(signature over a FIXED message)` | Only if the signature scheme is deterministic — see §4. |

"Retrievable salt" holds for the passkey path only because `aesIv` ships inside the blob. Unlike
the password path — where the argon2id salt and the AES IV are two independent envelope fields —
the passkey path **reuses the AES-GCM IV as the HKDF salt** (`keystore.ts:92`, `info` fixed at
`"bound-keystore"`; encrypt side `webauthn.ts:317` with a fresh random IV, decrypt side
`webauthn.ts:626` with the IV recovered from the blob). The KEK therefore cannot be precomputed
before the blob is fetched.

Corollary proven by the code: changing the password re-encrypts the blob.
`AccountService.srpChangePasswordVerify` (`account.service.ts:452-525`) swaps `srpSalt` +
`srpVerifier` + `encryptedBlob` in a single atomic `$set` on the keystore document — atomic
per-document, but **not** a Mongo transaction; the account reset and `revokeAllSessions` are
separate operations. That same `$set` **replaces** `histories` with the single previous
`{email, srpSalt, srpVerifier}` pair (`$set`, not `$push`), so only the most recent superseded pair
survives a password change — unlike the change-email path, which appends (`:340-350`, `$push`).
Mnemonic and addresses unchanged. Only the lock changes.

### Why the passkey *signature* cannot be the KEK

```
signedBytes = authenticatorData ‖ SHA-256(clientDataJSON)
                     │                        └─ contains the challenge (changes every time)
                     └─ contains signCount, which increments on every use
```

Even with a fixed challenge the signed bytes change. PRF exists precisely to give a stable
secret without exporting the private key. One ceremony yields **two outputs with opposite
properties**: the assertion (changes, for identity) and the PRF output (constant, for the KEK).

### Password: two derivations, never one

```
x        = H(salt_srp ‖ H(email:password)) ;  verifier = g^x mod N   → sent to server
KEK      = argon2id(password, salt_kek)                              → never leaves the client
```

Two salts in two places (`srpSalt` on the entity, `salt_kek` in the blob envelope). If the same
value served both, the server — which holds the verifier — could derive the KEK. Bound's
structure is correct here but **its docs never state the hazard**, so a reimplementation can get
the shape right and the substance wrong.

## 4. The determinism whitelist, and why Taproot/BIP-322 are excluded

| Scheme | Deterministic? | Why |
| --- | --- | --- |
| Ed25519 (Solana) | Yes, by spec | RFC 8032 mandates nonce = `SHA-512(prefix ‖ message)` |
| ECDSA secp256k1 (EVM EIP-191, BTC BIP-137) | **By convention only** | ECDSA's `k` is nominally random; every mainstream wallet implements RFC 6979 |
| Schnorr / BIP-340 (Taproot) | No | spec encourages fresh `aux_rand` in the nonce |
| BIP-322 | No | built on Schnorr, plus a synthesised virtual transaction |

BTC auth wallets are restricted to p2pkh / p2wpkh / p2sh-p2wpkh. A `bc1p…` taproot address is
rejected with `authWalletAddressTypeNotSupported` **before the nonce is consumed**.

Residual risk worth recording: RFC 6979 is a convention, not a protocol rule. A wallet using a
random `k` would lose the user's keystore on their second login, silently and undetectably in
advance. This is a real fragility of the wallet-auth path — not of the passkey or password paths.

### The two-signature model

Wallet login needs two signatures with opposing requirements, so one cannot serve both:

| Signature | Requirement | Sent? |
| --- | --- | --- |
| Server-identity proof | must **change** every login (anti-replay) → signs a fresh nonce | yes |
| Keystore derivation | must be **byte-identical** every login → signs a fixed message | **never** |

`docs/api/auth.md` states this correctly, and the DTO proves it structurally:
`RegisterWalletAuthDto` carries exactly one `signature`, paired with a `challengeId`.

Check order in `verifyAuthWalletControl` (`auth.service.ts:549-586`) is deliberate:

```
1 method on whitelist?          → authWalletMethodNotAllowed
2 BTC address type eligible?    → authWalletAddressTypeNotSupported
3 address derives from pubkey?  → authWalletAddressKeyMismatch
4 CONSUME NONCE
5 verify signature              → authWalletSignatureInvalid
```

Nonce is consumed at 4, **before** verification at 5, so a wrong signature cannot replay it —
while failures at 1–3 leave it intact, so they cannot be used to burn a legitimate user's nonce.
Step 3 exists so a caller cannot sign with their own key while claiming someone else's address.

Also: **wallet-signature failures do not count toward account lockout.** Forging one is
infeasible, so counting them would only create a DoS vector against the real user.

## 5. One account, N keystores — the structural fact the docs get wrong

```ts
// src/database/entities/keystore.entity.ts:69
KeystoreSchema.index({ accountId: 1, type: 1 });   // NOT unique
```

`assertBelowPasskeyLimit` counts `{accountId, type: PASSKEY}` against `maxPasskeysPerAccount: 5`
— you only count what can be plural. Each device gets its **own row with its own `encryptedBlob`**,
encrypted under that device's own KEK, all wrapping the **same mnemonic**.

```
account
 ├─ keystore#1   blob₁ = encrypt(mnemonic, KEK_deviceA)
 └─ keystore#2   blob₂ = encrypt(mnemonic, KEK_deviceB)   ← created by confirm-link
```

This is how multi-device works with no shared key anywhere, and it is exactly why the ECDH relay
exists. Bound's own docs say "one keystore per account" — the code says otherwise.

Note: for **synced** passkeys (iCloud Keychain, Google Password Manager) `CredRandom` syncs with
the credential, so a second device reproduces the same PRF output and in principle needs no
relay. It does not reproduce the same *KEK* for free — the HKDF salt is each blob's own random
`aesIv` (§3), so the same credential encrypting the mnemonic twice yields two different KEKs, and
the second device must decrypt against that specific blob's `aesIv`. The relay covers device-bound
passkeys and per-device enrolment.

## 6. Entities (MongoDB / Mongoose)

```
accounts             email (unique, sparse, OPTIONAL), isLocked, failedLoginAttempts, lockUntil,
                     role (select:false), totpSecret (AES-GCM), isTotpEnabled
keystores            accountId, type, encryptedBlob (select:false)
                       passkey → credentialId (unique sparse), webauthnPublicKey, aaguid, deviceName
                       srp     → srpSalt, srpVerifier, histories (select:false)
                                 passwordHint (returned by default)
                       wallet  → authWalletAddress (unique sparse), authWalletChain/PublicKey/Provider
wallets              userAddress (unique), userPublicKey (unique), tradingAddress, chain, isDefault
user_sessions        accountId, deviceType, browser, ipAddress, expiresAt, isRevoked, keystoreId
webauthn_challenges  challengeId, challenge, expireAt (Mongo TTL index)
email_outbox         type, status, to, token (hash), expiresAt, payload
```

`encryptedBlob` is `select: false` and leaves the DB in exactly five places — `loginWithPasskey`,
`srpVerify`, `verifyTotpLogin`, `findByAuthWalletAddress`, `rotateAuthWallet`. Getting the blob
requires a successful login, by construction.

`passwordHint` is **not** `select: false` (`keystore.entity.ts:36`, plain `@Prop({ default: null })`),
unlike the other three SRP fields (`:39`, `:42`, `:48-53`). It therefore rides along on every
un-projected keystore read — `findSrpKeystoreWithHint` relies on exactly that
(`keystore.service.ts:483-484`, no `+passwordHint` projection, in contrast to
`auth.service.ts:1127`'s explicit `'+encryptedBlob +srpSalt'`) — and `GET /keystore` (paginate, no
projection) returns it: to the owner for their own rows, and to ADMIN / SUPER_ADMIN across **all**
accounts, since `RoleUtil.isAdmin` skips the accountId filter (`keystore.controller.ts:44-48`). A
password-adjacent secret readable by any admin listing.

## 7. Flows

### Registration — one endpoint, one transaction, no tokens

`POST /auth/register` handles all three auth types and **always requires all three wallets**
(BTC/EVM/SOL) with signatures over a timestamp within ±10 minutes.

```
1 verifyRegistrationEmail  CONDITIONAL — `if (!dto.email) return`
                           consumeRegistrationOtp:
                             findActiveVerificationRequest (status SENT, unexpired)
                             HMAC(otp) != token → attempts++ (max 5)
                             atomicConsumeVerificationRequest (CAS) → CONSUMED
                           then validateAccountUniqueness(email)
2 verifyPasskeyOrSrpData   passkey: consumeChallenge → clientData(CREATE) → attestation
                           wallet:  verifyAuthWalletControl + assertAuthWalletAvailable
3 verifyRegistrationWalletSignatures
                           BTC bip322.Verifier.verifySignature(address, ts, sig)
                           EVM verifyEvmSignature(pubkey,…) then computeAddress(pubkey).toLowerCase()
                           SOL ed25519.verify(…) ; address IS the base58 pubkey
4 connection.transaction   account → keystore → 3 wallets
                           BTC tradingAddress built SERVER-side from user pubkey + relayer pubkey
5 post-commit              registerWalletInUms · audit KEYSTORE_ADDED · achievement
→ { account, wallets }     NO TOKENS — the client must call a login endpoint next
```

Step 1 is **conditional**: `verifyRegistrationEmail` returns immediately when `dto.email` is absent
(`auth.service.ts:494-497`, invoked from `register` at `:780`), and `RegisterDto` agrees —
`@ValidateIf((o) => o.email != null)` on `otp` (`register.dto.ts:99-105`). Passkey and wallet
registrations with no email skip OTP consumption and uniqueness entirely — which is every
registration the shipped client makes (§1). The ordering of steps 2–5 is unaffected.

### OTP

6 digits, `crypto.randomInt`, TTL 10 min, max 5 attempts — all runtime-tunable from the
`settings` collection, not env. Stored as **`HMAC-SHA256(otp, jwtRefreshSecret)`**, with Bound's
own comment: *"so that the OTP hash cannot be reversed even if an attacker obtains a DB dump."*

`email_outbox` is a **table only**. There is no SES / SendGrid / Resend / nodemailer anywhere in
the repo; an external `radfi-cronjob` polls PENDING rows, renders `payload.otp`, sends, flips to
SENT. Consequence: `findActiveVerificationRequest` filters `status: SENT`, so **an OTP is unusable
until the worker has sent it**.

### Passkey login — discoverable credential, **no email on the primary path**

**Corrected 2026-08-18 (third pass) by reading `radfi-web`'s login modal; narrowed the same day
(fourth pass).** An earlier version of this section placed
`GET /keystore/passkey/{email}/credentialIds` on the login path and called it "the only place email
is used". That is wrong for the *primary* login — but the absence claim that replaced it
("nothing on the login path calls it") was itself overstated.

Of the five callers, four are post-login and gated on `isAuthenticated`: `ApproveLinkModal.tsx:77`,
`PasskeyManagementPanel.tsx:133,188`, and `add-passkey/page.tsx:363` (inside the `if (sameAccount)`
branch at `:361`). The fifth, `add-passkey/page.tsx:148`, **is** on a login path: it sits in
`autoLogin()` (declared `:139`, *"Auto-login after successful link"*), invoked at `:380` only after
both authenticated branches have returned (*"Not logged in → auto-login"*), and again at `:395`
from `handleSwitchAccount` for a cross-account switch. It fetches credentialIds by email, calls
`getPasskeyAssertion` **with** `allowCredentials` (`webauthn.ts:387`), POSTs the same
`/auth/passkey/login`, and calls `login(account, AUTH_TYPES.PASSKEY, …)` at `:192`. The page is
ungated — `(auth)/layout.tsx` has no auth guard, there is no `middleware.ts` in the repo, and the
backend chain is open (`keystore.controller.ts`: request-link `:68-70`, relay `:95-96`,
confirm-link `:103-105` are all `@Public()`; the credentialIds route at `:58` carries no
`JwtAuthGuard`).

The correct, narrower claim: **the primary AuthModal login is emailless and discoverable** —
`handlePasskeyLogin` (`AuthModal.tsx:543`) picks `getDiscoverablePasskeyAssertion(challenge)` and
never calls `getPasskeyCredentialIds`. The *device-linking* flow (multi-device, below) reaches the
same `/auth/passkey/login` by a different route: an email-keyed, `allowCredentials` assertion on
Device B, where the user has already typed the email to request the link. So email is not required
to log in, but one non-primary login path does use it.

```
GET  /auth/webauthn/challenge                    ← takes NO parameters (api/auth.ts:30-35);
                                                   TTL 2 min (auth.service.ts:404), single-use —
                                                   consumeChallenge does findOneAndDelete plus an
                                                   explicit expireAt re-check
                                                   (keystore.service.ts:145-154)
navigator.credentials.get({ challenge, rpId, userVerification:'required',
                            extensions: { prf: { eval: { first } } } })
                                                 ← NO allowCredentials (webauthn.ts:450-458)
POST /auth/passkey/login { credentialId, challengeId, webauthnAssertion }   ← no email
     findOne({credentialId}, '+encryptedBlob') → checkAndHandleLock → consumeChallenge
     → verifyWebAuthnClientData(GET) → verifyWebAuthnAssertion (p256 over SHA256(authData ‖ SHA256(clientData)))
→ { accessToken, refreshToken, encryptedBlob, account, wallets }
```

The client picks the ceremony at `AuthModal.tsx:568-570`:

```ts
pendingRegistration?.credentialId
  ? getPasskeyAssertion(challenge, pendingRegistration.credentialId)   // post-registration verify only
  : getDiscoverablePasskeyAssertion(challenge)                          // NORMAL LOGIN
```

`getDiscoverablePasskeyAssertion`'s own docstring (`webauthn.ts:439-441`): *"Used by **no-email
login** so the passkey provider shows domain credentials."* With `allowCredentials` omitted the
browser shows its own account picker for the RP ID, so the user taps once and types nothing.

The UI confirms it structurally: `AuthPasskeyModal` receives no `email` / `onEmailChange` prop at
all, while `AuthPasswordModal` receives `email`, `onEmailChange` and `emailValidationError`
(`AuthModal.tsx:1620-1684`).

**So the two paths differ in identity handling, not just in KEK derivation:**

| | Passkey | Password (SRP) |
| --- | --- | --- |
| Email required | **no** on the primary path — discoverable, browser picks the account (the device-link auto-login is the one exception, above) | **yes** — `srpInit({email})` returns the salt |
| Account located by | `credentialId` from the assertion | `email` |
| User input | one biometric tap | email + password |

Prerequisite for the emailless path: the credential must be **discoverable** (resident key), which
is why Bound's AAGUID whitelist admits only iCloud Keychain and Google Password Manager — both
store resident keys for free, unlike hardware authenticators with limited slots.

WebAuthn is **hand-rolled** with `cbor-x` + `@noble/curves/nist` — no `@simplewebauthn`.
Attestation accepts only `fmt: 'none'`; the COSE key is rebuilt as `0x04‖x‖y` behind a fixed
26-byte P-256 SPKI header and compared byte-for-byte.

### SRP login

```
POST /auth/srp/init   { email } → { sessionId, salt, serverPublic }
      unknown email → DETERMINISTIC fake salt = HMAC(jwtRefreshSecret, "srp-fake-salt:"+email)
                      + random ephemeral, and NO Redis session → verify fails identically
POST /auth/srp/verify { sessionId, clientPublic, clientProof }
      getSrpSession → delSrpSession   ← DELETED BEFORE VERIFY (true one-time)
      checkAndHandleLock              ← lock checked before credential verification
      srpServer.deriveSession(b, A, salt, email, v, M1)  → throws on mismatch → handleFailedLogin
→ { serverProof: M2, …login }  or  { serverProof, twoFactorRequired, pendingToken }
```

`secure-remote-password@0.3.1` — SRP-6a on the library's built-in **RFC 5054 2048-bit group**
(g=2, SHA-256; verified against `lib/params.js`). No params are configured anywhere in `src/`, so
this is the library default, and it is a sound one. Redis `srp_session:<uuid>`, TTL 120 s, with `b` and `v` **AES-256-GCM
encrypted at rest** under `sha256('srp-session-encryption:' + JWT_SECRET)`.

The `M2` server proof gives mutual authentication — the client verifies the server actually held
the verifier. A naive "POST the password hash" login has no equivalent.

### Multi-device — ECDH relay, server stays blind

```
B  POST /keystore/passkey/request-link {email, pubKeyB}   PUBLIC
       → Redis add_passkey_session:<accountId>:<otp>, TTL 300 s ; ← {otp}
A  GET  /keystore/passkey/pending-link?otp                JWT   → {pubKeyB}
A  POST /keystore/passkey/approve-link {otp, encryptedForB, pubKeyA}  JWT
       → Redis add_passkey_relay:<accountId>:<otp>
B  GET  /keystore/passkey/relay?email&otp                 PUBLIC → {encryptedForB, pubKeyA}
B  POST /keystore/passkey/confirm-link {…, encryptedBlob} PUBLIC
       consumeLinkSession (GETDEL) → delRelay → assertBelowPasskeyLimit
       → consumeChallenge → clientData(CREATE) → attestation → NEW keystore row
```

The `encryptedBlob` B submits is the mnemonic **re-encrypted under B's own KEK** — not the
ciphertext A produced. The server never holds anything that opens either.

### Tokens and sessions

```
access   JWT_SECRET,         10 m   { sub, type:'access', accountId, sessionId?, role?, keystoreId? }
refresh  JWT_REFRESH_SECRET,  7 d   { …, type:'refresh', jti }
```

`jwt.strategy.ts` makes a **positive type assertion** — only `type === 'access'` is accepted, so a
refresh token cannot be used as an access token. Rotation: Redis `session_validate:<sessionId>`
holds `{isRevoked, expiresAt, refreshTokenJti}`; a refresh overwrites the jti with `SET … KEEPTTL`,
killing the old one by replacement. `JwtAuthGuard` validates the session on every request (Redis
first, Mongo fallback + re-cache).

`JwtAuthGuard` is **not** global. The only global guards are `SodaxApiKeyGuard` and
`SodaxRateLimitGuard` (partner auth for Sodax, and `SodaxApiKeyGuard` fails **open** when no
`x-api-signature` header is present). Routes are public by default and opt in with `@UseGuards`.

### Storage split

| MongoDB (durable) | Redis (ephemeral) |
| --- | --- |
| accounts, keystores, wallets | `srp_session:<uuid>` 120 s |
| user_sessions, audit_logs | `session_validate:<id>` 7 d |
| email_outbox | `totp_pending:<uuid>` 300 s |
| webauthn_challenges (TTL index) | `add_passkey_session` / `add_passkey_relay` 300 s |
| settings (OTP TTL, attempt caps, passkey limit — runtime-tunable) | rate-limiter counters |

## 8. Three things that look like auth but are not

- **Trading wallet** — P2TR with a 2-leaf script tree: 2-of-2 (user + Bound relayer) and
  user-only after a CSV timelock. It is a latency optimisation for the Bitcoin AMM, not an auth
  mechanism. The recovery leaf is what preserves self-custody. The co-signer key
  `BTC_BE_WIF_PRIVATE_KEY` is **plaintext in env, no KMS**.
- **`policy-signature`** — 50 lines, records ToS acceptance. Nothing to do with transaction signing.
- **`email-outbox`** — a table, not a mailer (see above).

## 9. Docs vs code — six divergences

Bound's docs describe intent, not implementation. Read the code.

| Docs claim | Code |
| --- | --- |
| `docs/api/auth.md`: OTP request *"never reveals whether the email is registered (enumeration defence)"* | `auth.service.ts:413-417` throws `400 account.emailTaken`. **It leaks.** The controller's own Swagger says `400 Email already registered`. |
| `docs/api/auth.md`: rate-limited by `ip+email` | key is `account:${req.user?.accountId ?? req.ip}` on a `@Public()` route → **IP only**; the env var names in the doc are wrong too |
| `docs/api/auth.md` register mermaid: *"→ JWT access + refresh"* | `buildRegisterResponse` returns `{account, wallets}`. The sequence diagram lower in the **same file** says "no session, no tokens" — the doc contradicts itself. |
| `docs/requirements/auth.md` §3b: *"Hash password with bcrypt"* | SRP (`srpSalt` + `srpVerifier`); no bcrypt anywhere |
| `docs/keystore-wallet-flow.md:191`: passkey blob encrypted with *"ECDH-derived key negotiated with the authenticator"* | **Settled 2026-08-18: it is PRF.** `src/core/keystore.ts:67` in radfi-web defines the hardcoded PRF salt `PRF_SALT = "bound-wallet-prf-v1"`, read via `getPrfSalt()` at `webauthn.ts:260` / `:379` / `:456` and passed to the `prf` extension at `:283` (`credentials.create`), `:390` (`evalByCredential` assertion, built at `:377-381`) and `:456` (discoverable assertion). `keystore-wallet-flow.md` is simply wrong; `requirements/auth-module.md:27` is right. |
| `docs/requirements/auth.md` §3a: client sends `btc_trading_address` | the DTO has no such field; the server builds it |

`docs/requirements/auth.md:78` also leaves the core mechanism open:
> *"The exact mechanism — be it WebAuthn PRF, secure enclave storage, etc. — should be determined
> during engineering design based on platform support."*

## 10. Nine things not to copy

1. `GET /keystore/passkey/relay` is `@Public()` with **no rate-limit guard at all**; a ~30-bit OTP
   is the only thing protecting a ciphertext fetch.
2. Empty `WEBAUTHN_ALLOWED_ORIGINS` / `WEBAUTHN_RP_IDS` **silently disable** origin and rpId
   enforcement (warning-logged only). Must fail closed.
3. The assertion path never re-checks `rpIdHash` or the UP/UV flags — only attestation does.
4. No WebAuthn sign counter is stored → no cloned-authenticator detection.
5. OTP hashes compared with `===`, not `crypto.timingSafeEqual`. Cleartext OTP survives in
   `payload.otp` on the CONSUMED row.
6. No refresh-token reuse-detection cascade — a replayed jti 400s but does not kill the session family.
7. Secret reuse: `JWT_SECRET` also derives the SRP-session and TOTP AES keys; `JWT_REFRESH_SECRET`
   is also the OTP HMAC key and the fake-salt key. Rotating either breaks far more than tokens.
8. 2FA gates **only** the SRP path — passkey and wallet logins bypass `isTotpEnabled` entirely.
9. `DeviceUtil.maskIp` has its body commented out; docs claim masked IPs, the DB stores raw ones.

Hand-rolled WebAuthn verification belongs on this list too — use a maintained library.

## 11. The client half — now obtained

This note originally ended by listing what a blind-custodian backend structurally cannot contain:
the derivation paths, the argon2 parameters, the envelope format, the fixed wallet-derivation
message, and whether PRF was actually what shipped.

**All five are now answered** from `boundex/radfi-web`, granted 2026-08-18. See
[[bound-client-crypto]]. Headlines:

- **It is PRF**, over the global constant salt `"bound-wallet-prf-v1"` — one shared salt for every
  user and every credential. The KEK is then `HKDF-SHA256` of that PRF output, salted with the
  blob's own `aesIv` (§3), so the KEK itself is per-blob.
- **Paths**: BTC `m/86'/0'/0'/0/0` (BIP-86 taproot), EVM `m/44'/60'/0'/0/0`, Solana
  `m/44'/501'/0'/0'`. Three chains only, indices hardcoded to 0.
- **Argon2id** `mem=65536, time=3, parallelism=4, hashLen=32`, 16-byte random salt — hardcoded,
  and duplicated as inline literals in two places.
- **Envelope** is `JSON.stringify({version, type, argon2Salt?, argon2Params?, aesIv, ciphertext})`
  with **no AAD**, and `argon2Params` is written but never read.
- **The fixed derivation message** is a 5-line human-readable string carrying no address, nonce,
  salt or version.

And the finding that matters most, which neither repo shows on its own: **the SRP verifier is
plain SHA-256 while the blob is Argon2id**, so a server compromise yields an offline attack at
~1 SHA-256 per guess and the Argon2id cost is bypassed entirely.
