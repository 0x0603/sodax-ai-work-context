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

---

# 2026-08-18 (later) — SDK integration design session

Separate session, scope: how `sodax-sdks` (`wallet-sdk-react` specifically)
and `apps/demo` should offer SODAX Auth as a login option, and how
`sodax-backend` reuses the client-crypto logic. Worked directly against live
source of `sodax-sdks` and `sodax-backend` (both on disk under `sodax/`), not
docs. Full design written to `plan.md`'s new "Phase 3 — SDK integration"
section — this entry is the process log, not a duplicate of that content.

## What changed the design mid-session

- User required the client-crypto package be installable by `sodax-backend`
  directly (`pnpm add`, no special setup) — confirmed low-friction since
  `sodax-backend` already consumes `@sodax/sdk`/`@sodax/types` as plain npm
  deps across 7 apps today (`apps/api`, `apps/swaps-api`, `apps/task-executor`,
  `apps/sponsoring-api`, `apps/stateful-api`, `apps/bridge-api`,
  `apps/sodax-backend-dashboard`). This is what forced the 3-way package split
  (`keystore-crypto` zero-deps / `wallet-auth-core` / `wallet-auth-react`)
  rather than one bundled package — backend must never be forced to install
  `wallet-sdk-core`'s 9 chain SDKs just to reuse a few crypto functions.
- Two corrections found by direct source-reading, not assumption, that
  reversed earlier framing in this same session:
  1. `SodaxWalletConfig.<CHAIN>.connectors` replaces defaults, doesn't merge
     (`wallet-sdk-react/docs/CONNECTORS.md:216`) — a naive "just register a
     connector" helper would have silently deleted users' existing wallet
     options for any chain it touched.
  2. EVM/Solana/Sui bypass the `IXConnector`/`chainRegistry` mechanism
     entirely (`providerManaged: true`, driven by wagmi/wallet-adapter/
     dapp-kit hooks instead) — the "one connector type, works on all 9
     chains" pitch only holds for the other 6 chain families without further
     `wallet-sdk-react` core work. Scoped v1 to those 6, flagged EVM/Solana/Sui
     as fast-follow.
- Mid-session, the user relayed real operational feedback from the Bound team
  directly (Slack, verbatim quotes and a live `settings` collection JSON
  sample) — not something the earlier `radfi-be`/`radfi-web` source reading
  could have surfaced, since it's about production incidents, not code:
  AAGUID whitelisting for passkey authenticators (some Windows password
  managers can't reliably retrieve a passkey later) and a post-registration
  local PRF re-verification step (Bound tried a server-round-trip version of
  this and reverted it due to challenge-TTL expiry — informed the fix of
  making the re-verification purely local/client-side instead).

## Method

Used 3 parallel Explore agents for initial `sodax-sdks` reconnaissance
(`wallet-sdk-core`, `wallet-sdk-react`, repo-wide conventions/branches/deps),
then direct file reads for `apps/demo`'s wiring and a `Plan` agent to turn the
accumulated findings into an execution-ready phased plan — whose two most
consequential claims (the two corrections above) were independently
re-verified by hand against `chainRegistry.ts` and `docs/CONNECTORS.md`
before being trusted, per this workspace's own "read the code, not the docs"
discipline (which the original 2026-08-12/2026-08-18 backend research passes
already established are necessary here, not optional).

## Changes During Work

None to scope — this session extended Phase 2 (build) with the SDK-side
detail Phase 2 always implied ("Client integration is nearly free", "Connector
+ frontend wiring") but hadn't actually verified against `wallet-sdk-react`
source until now.

---

# 2026-08-18 (later still) — Deepening pass: verify-then-rewrite against real source

User asked to make the plan "more detailed" and explicitly required: follow
existing logic/architecture/patterns, no `any`/`unknown` casts, reuse over
reinvent. Rather than writing more prose from memory, ran a 5-agent parallel
verification pass reading actual installed/shipped source (not docs, not an
earlier agent's paraphrase) before touching any plan file:

1. `bridge-api`/`swaps-api`/`sponsoring-api` — `HaproxyThrottlerGuard` (all 3
   variants), CORS (3 different real patterns, not 1), `class-validator`
   config/DTO conventions, Redis/`@keyv/redis` exact versions and wiring.
2. `stateful-api/src/auth/*` — full `auth.config.ts`/`auth.constants.ts`/
   `auth.module.ts`, and `main.ts`'s exact bootstrap order.
3. `check-sponsoring-contract.mjs` — read the actual 167-line script, not
   just cited its existence.
4. `wallet-sdk-core` — verbatim config types + interfaces + construction
   lines for all 9 chains, not the earlier session's summarized table.
5. `better-auth@1.4.18`'s own installed `dist/*` — confirmed `rateLimit` and
   `advanced.ipAddress` defaults from real source, not the plugin's docs
   site (no web tool was available to that particular subagent).

## What this corrected or added, not just confirmed

- **New finding, not in the original draft**: Better Auth's core rate
  limiter has a built-in stricter override (`window:10, max:3`) for
  `/sign-in`, `/sign-up`, `/change-password`, `/change-email` paths — easy to
  duplicate badly with a conflicting NestJS-level throttle if not known.
- **Confirmed, with the actual spoofing mechanism now documented**: Better
  Auth's IP extraction trusts the first comma-separated value of
  `x-forwarded-for` (or whatever `ipAddressHeaders` names) with zero
  proxy-chain validation, and this feeds session tracking too, not just rate
  limiting — the earlier draft had the right conclusion but not the exact
  code proving it.
- **Correction of scope, not fact**: `HaproxyThrottlerGuard` is per-route
  `@UseGuards`, never `APP_GUARD`, in all three sibling apps — the earlier
  draft implied a simpler "just reuse the guard" framing that undersold this;
  `auth-api` needs it applied explicitly per sensitive endpoint.
- **New, real alternative found**: `sponsoring-api`'s guard variant sources
  the IP via a shared `resolveClientIp()` helper instead of an inline header
  read — a cleaner option than blindly copying `bridge-api`'s exact file.
- **Important unresolved gap surfaced, not fabricated over**: `@better-auth/passkey`
  is not installed anywhere in either repo. Every claim about its PRF
  extension API in this plan traces back to the *original* (prior-session)
  research, not this session's verification. Flagged explicitly in
  `plan-auth-api-security.md` rather than silently treated as confirmed.
- **9-chain type table replaced with verbatim source** — the earlier
  "8-of-9 accept privateKey" summary is now backed by the actual config type
  definitions, exact discriminator logic, and exact construction call for
  every provider, so `wallet-auth-core`'s dispatcher can be written directly
  against real types instead of a paraphrase.

## New file

`plan-auth-api-scaffold.md` — exact copy-paste templates (Better Auth wiring,
`main.ts` bootstrap order, config/DTO conventions, throttler/Redis reuse),
split out because it's a different concern from the security *analysis* in
`plan-auth-api-security.md` (one says what to build and why it's safe, the
other is the literal code to start from).

## Changes During Work

None to overall scope or direction — this pass corrected precision and added
verified detail to already-decided sections; it did not reverse any earlier
decision.

---

# 2026-08-18 (fourth pass) — Passkey login is emailless; an earlier claim was wrong

Triggered by a direct challenge from the user ("tại sao bạn biết — đọc code họ
đi") after I asserted, from my own earlier notes rather than from source, that
Bound requires an email on **both** login paths. Re-cloned both reference repos
to **this** machine and read the login modal directly. **The assertion was
wrong and the user's intuition was right.**

## What the source actually shows

`AuthModal.tsx:568-570` picks the ceremony:

```ts
pendingRegistration?.credentialId
  ? getPasskeyAssertion(challenge, pendingRegistration.credentialId)   // post-registration verify ONLY
  : getDiscoverablePasskeyAssertion(challenge)                          // NORMAL LOGIN
```

- `getDiscoverablePasskeyAssertion` (`webauthn.ts:443-459`) calls
  `navigator.credentials.get()` with **no `allowCredentials`**. Its docstring:
  *"Used by **no-email login** so the passkey provider shows domain credentials."*
- `getWebAuthnChallenge()` (`api/auth.ts:30-35`) takes **no parameters**.
- `loginPasskey({credentialId, challengeId, webauthnAssertion})` — no email field.
- UI proof: `AuthPasskeyModal` gets no `email`/`onEmailChange` prop; only
  `AuthPasswordModal` does (`AuthModal.tsx:1620-1684`).
- The password path does need it: `srpInit({ email: normalizedEmail })`
  (`AuthModal.tsx:467`).

## Where the wrong claim came from

[[bound-auth-mechanism]] §7 listed `GET /keystore/passkey/{email}/credentialIds`
as step 1 of passkey login, annotated *"the only place email is used"*. The
endpoint is real, but **every caller is a post-login page** —
`ApproveLinkModal.tsx:77`, `PasskeyManagementPanel.tsx:133,188`,
`add-passkey/page.tsx:148,363`. Nothing on the login path calls it.

Root cause: the 2026-08-18 backend pass read radfi-be's endpoint list and
**inferred** the client flow. `radfi-web` access arrived later the same day, and
the client-crypto pass focused on the crypto surface rather than re-checking the
flow claims the backend pass had already asserted. So a backend-derived
inference survived into a knowledge file as if it were verified.

This is a second instance of the discipline these notes already state twice
("read the code, not the docs") — generalised: **read the code of the side you
are making the claim about.** A backend endpoint existing says nothing about
whether the client calls it, and on which path.

Corrected in place in [[bound-auth-mechanism]] §7, with the ceremony-selection
code, the docstring, and the UI-prop asymmetry quoted.

## Consequence for our design — a real open decision, not just a correction

`plan-sdk-integration.md` phase 4 specifies the modal state machine as
`closed -> emailEntry -> methodSelect -> {passkeyCeremony | passwordEntry}` —
email first, unconditionally, for both paths. That was written believing it
matched Bound. **It does not.** So it is currently an unexamined choice that is
strictly worse UX than the reference implementation on the passkey path.

Emailless passkey login would mean:

```
closed -> methodSelect ─┬─> passkeyCeremony   (allowCredentials omitted, zero typing)
                        └─> emailEntry -> passwordEntry
```

Three things to settle before adopting it:

1. Does `@better-auth/passkey` support `residentKey: 'required'` at registration
   and an identifier-less `signIn.passkey()`? **Still unverified — the package is
   not installed in either repo** (the gap already flagged in
   [[plan-auth-api-security]]). Fold this question into that same spike.
2. The email step is also where the password path would fetch its KDF salt (see
   the gap logged below), so removing it from the passkey path only is fine, but
   removing it globally is not.
3. Accounts with no email have no channel for security notifications. Bound hits
   this too — `ApproveLinkModal.tsx:63-67` hard-stops device linking with
   *"Add an email first"*.

## Second gap found in the same conversation: where does the KDF salt come from?

`plan.md:65-66` specifies `authHash = argon2id(password, salt, ctx="auth")` and
`kek = argon2id(password, salt, ctx="kek")` but **no plan file says how the
client obtains `salt` before login**. `rg -i salt` across all seven plan files
returns no endpoint, no design. It is load-bearing: the client cannot compute
`authHash` without it, so a pre-login round trip must exist:

```
POST /auth/kdf-params { email } → { salt, argon2Params }
```

and that endpoint is an **account-enumeration surface**. Bound gets this right
on the equivalent step — `srpInit` returns a deterministic fake salt
(`HMAC(jwtRefreshSecret, "srp-fake-salt:" + email)`) for unknown emails, so
probing is indistinguishable — while getting it wrong on their OTP endpoint
(`400 account.emailTaken`, [[bound-auth-mechanism]] §9). Our design must copy the
former and not the latter.

Not yet written into `plan.md` — pending the user's call on whether to fold both
of these in as open questions.

## Reference repos now on this machine

[[bound-exchange-repos]] recorded clones under `/Users/sangnguyen/...` (the other
machine). Cloned to this machine at the same commits — see that note, updated
with both paths.

---

# 2026-08-18 (fifth pass) — Full source audit of every doc in this thread

The fourth pass found one wrong claim by accident. That raised the obvious
question — how many others are there? — so the user asked for a systematic
sweep: *"đọc lại hết docs, xem có cái nào sai thực tế không, không tin vào note
phải so với code."*

## Method

A 10-agent fan-out, one group per doc-and-source-tree pair, each agent given the
doc as the **thing under test** rather than as evidence, plus the source tree the
claim is actually about. Every finding of WRONG then went to an independent
adversarial agent whose default was to defend the doc — so a correction only
landed if it survived someone actively trying to refute it.

Verdicts were four-way on purpose: CONFIRMED / **WRONG** / **DRIFTED** (substance
holds, cited file:line moved — the `radfi-be` clone is at `c1c1e06` while the
notes were written at `68d8dab`) / UNVERIFIABLE. Collapsing drift into "wrong"
would have produced dozens of fake errors.

Agents were pointed specifically at the claim shapes that hide errors, all of
which had already burned us at least once: *"the only place X is used"*, *"X
exists nowhere"*, *"written but never read"*, exact constants and version pins,
and any claim about one repo made while reading another.

**Result: 573 claims checked, 461 CONFIRMED, 28 WRONG, 35 DRIFTED, 39
UNVERIFIABLE, and 5 reported errors rejected on adversarial review.**

The core architecture survived intact — blind custody, mnemonic-vs-KEK, the
two-signature model, the determinism whitelist, and the Argon2id-bypass finding
are all confirmed from source. Everything wrong was at the detail layer, but four
of those details change what gets built.

## The four that change the plan

1. **`stateful-api`'s CORS is not what two plan files claimed.** It does not
   source its allowlist from `trustedOrigins` — `main.ts:62-79` hardcodes three
   inline regexes and sets **no `credentials` key at all**, deliberately
   (`main.ts:55-56`: *"deliberately NON-credentialed: no session cookie ever
   crosses this boundary"*), because the portal is served same-origin through a
   Next proxy. `trustedOrigins` is a separate mechanism feeding Better Auth's
   Origin/CSRF check, consumed only at `auth.config.ts:40`; `configuration.ts:57`
   says so verbatim. So the prescription *"auth-api must copy stateful-api's CORS
   because it is cookie-based"* rested on a false premise. **No sodax-backend
   service uses credentialed CORS** — there is no sibling to copy. The decision
   is now branched on deployment topology, and the config-driven-allowlist
   precedent is `sponsoring-api/src/shared/origin-allowlist.ts`. This also closes
   open question 12.

2. **`apps/bridge-api`, the chosen scaffold template, is not on `development`** —
   it lives only on `origin/feat/bridge-api*`. It is also not the newest
   greenfield app (`sponsoring-api` 2026-08-03, `api-auth` 2026-08-17). The
   `HaproxyThrottlerGuard` cited from it exists identically in `sponsoring-api`
   and `swaps-api` on `development`; citations re-pointed there.

3. **The six non-provider-managed chains do not share one shape.** Only 2 of 6
   (Bitcoin `chainRegistry.ts:226`, Stacks `:380`) resolve the provider from the
   connector. The other 4 (Injective `:262`, Stellar `:308`, NEAR `:367`, ICON
   `:329`) never inspect the connector in `createWalletProvider` — they build
   from the native service singleton, and ICON discards the service entirely.
   Step 3b is therefore "introduce a connector-sourced provider path that does
   not exist" on 4 chains, not "add an `instanceof` branch". And skipping them is
   **not fail-safe**: they would silently return a provider wired to the native
   wallet, which cannot sign for a SODAX-managed key.

4. **The PRF re-verification fix was justified by the wrong property.** The plan
   said local-only is what prevents Bound's failure recurring. But Bound's
   reverted attempt *already* used a local challenge — what killed them was the
   wall-clock time of a second user-paced biometric prompt sitting **inside** the
   registration challenge window (`AuthModal.tsx:714` issue → `:719` prompt →
   `:742` submit, against the 2-minute TTL at `radfi-be auth.service.ts:404`).
   The property that actually matters is the **challenge boundary**. SODAX can do
   what Bound could not — register the passkey under a fresh single-prompt
   challenge, re-verify outside any window, then upload the blob — because
   Phase 6 already splits `keystore` from `passkey-registration`, whereas Bound is
   blocked by `17010 KEYSTORE_CANNOT_REMOVE_LAST` (`keystore.service.ts:542`) on
   an account with exactly one passkey.

## Two that would have produced broken wallets

- **The fixed derivation message is 5 lines, and the doc's code block silently
  dropped the two blank ones.** Real message: `"Bound Wallet Auth\n\nPurpose:
  Unlock the encrypted Bound keystore\n\nThis signature is not a transaction and
  does not spend funds."` — LF only, NFKC-normalized. Signing the 3-line version
  yields a different signature → different KEK → unopenable keystore.
- **The HKDF `info` is not the canonical envelope JSON.** It is
  `canonicalKdfContext()`, a fixed 8-field projection in a specific key order,
  excluding `kdfSalt`, `kdfParams` and `cipherParams`.

## What the audit revealed about Bound the product

**Bound's shipped client no longer registers with an email at all.** Both
`/auth/register` call sites are `authType: PASSKEY` (`AuthModal.tsx:743`, keyed by
a user-chosen passkey *name*) and `authType: WALLET` (`:1274`);
`requestEmailVerification` has zero callers; no client path constructs
`authType: "srp"` at all, so SRP accounts can only be pre-existing. Password sits
under a *"Legacy login options"* disclosure. The old email+OTP signup screens are
still in the tree but dead.

**This is an observation about Bound, not a constraint on SODAX** — see the scope
decision recorded in `plan.md`.

Also: Bound's strongest backup warning — the one sentence naming the consequence —
**never shipped**. It exists only as orphaned i18n copy (`messages/en.json:458`,
translated into zh-CN) with zero code references and no step to render it. So
their backup story is weaker than the fourth pass documented, which was already
the weakest part of their design.

## Corrections to our own corrections

Two, both worth recording because they are the same failure mode this pass exists
to catch:

- The fourth pass's fix said *"nothing on the login path calls
  `GET /keystore/passkey/{email}/credentialIds`."* Overstated. A fifth caller,
  `add-passkey/page.tsx:148` inside `autoLogin()`, **is** on a login path, on an
  ungated page. The narrower true claim — the primary `AuthModal` login is
  emailless and discoverable — stands.
- `bound-auth-mechanism` §3 stated the PRF *output* formula as if it were the KEK.
  The KEK is an HKDF of it whose salt is the blob's own `aesIv`, making the KEK
  **per-blob, not per-credential**.

## Rejected on review — where the doc was right

5 reported errors did not survive. Two are instructive: one auditor called the
Sui `mnemonics`-only config type nonexistent, having read only the checked-out
ref while the type lives on an unmerged branch; another reported a claim the doc
never actually makes, filed against an "implied by" reading. Both are the
inverse error — over-correction — and are exactly why the adversarial stage
exists.

## Changes During Work

The 28 corrections were applied by a second fan-out, one agent per file group
with strict single-owner-per-file assignment (S9), each edit then re-read by an
independent checker looking for corrections that did not land, fabricated
replacement text, over-correction, and internal contradiction with sibling docs.

Two new open questions were promoted from this log into `plan.md`, since both
are now required work rather than curiosities: **where the client obtains the KDF
salt** (unaddressed anywhere, and an account-enumeration surface — Bound solves
the equivalent with a deterministic fake salt in `srpInit` while getting it wrong
on their OTP endpoint), and **whether passkey login should be emailless**.

---

# 2026-08-19 — Threat model: "is the backend safe, can it be hacked, leaked, or lose keys?"

User's question, answered by a six-lens source-verified pass, each finding then
sent to an independent reviewer instructed to **refute it by default**. 15
critical/high findings went through that gate; 14 stood, 1 was knocked down, and
most that stood were re-scoped or downgraded. The gate earned its keep — see
"What the adversarial pass changed" below.

## New plan file

**[[plan-auth-api-durability]]** — the durability half, which had no home
anywhere in the plan. `plan-auth-api-security` answers *can it be stolen?*; this
answers *can it be lost?*. The two are opposite failure modes with opposite
fixes, and for a blind custodian the second is unrecoverable by construction.

The finding that justified a whole file: **`sodax-backend` has exactly one backup
pipeline and it covers only the shared stateful DB.** The main `sodax-mongo` —
where all nine apps write — has no backup at all. So the placement of `wauth_*`
silently decides whether user funds are recoverable. And placing it in the
stateful DB is not sufficient either: the restore runbook enumerates a *closed
set* of five `stateful_*` collections, so an operator working that runbook during
an incident would skip an unlisted `wauth_keystore`.

Three more in the same direction: the backup watcher classifies on S3 object
**metadata** and never opens the archive (its size guard defaults to off), so a
dump that silently omits the keystore reports healthy indefinitely; `--replSet
rs0` reads as redundancy but is a single-member set on a bind mount; and
`mongorestore --drop` runs in *every* restore mode, so restoring an hour-old
archive over live keystore data destroys every registration since the dump.

## What the adversarial pass changed — the gate was not ceremonial

- **"Better Auth's raw-Express mount means no Nest guard can throttle auth
  routes" — knocked down.** The architectural observation is true, but Better
  Auth throttles *inside its own handler*, so the mount is neither the cause of
  nor an obstacle to rate limiting. The refuter then found the real cause, which
  is live today: Better Auth defaults `rateLimit.enabled` to `NODE_ENV ===
  "production"`, and this repo's convention is `dev|test|prod`, so the limiter is
  silently off in production. `auth.config.ts:24-26` already documents that exact
  mismatch for the cookie `Secure` flag and fixes that half — the rate-limit half
  was never noticed. Second instance of one root cause.
- **`X-Real-IP` trust — downgraded critical → medium, on an unverified
  precondition.** Everything depends on whether the origin ports actually answer
  from the internet, which cannot be settled from the repo. The refuter also
  pointed out that *if* they do, the critical item is not the header at all but
  `docker-compose.yml:62-63, :96-97` publishing MongoDB and Redis on `0.0.0.0`.
  Ten-minute external port scan decides this.
- **Google OAuth tokens in cleartext — downgraded high → low.** The provider
  requests no `access_type=offline`, so no refresh token is ever issued; the
  exposure is a ~1h identity-only token whose claims duplicate `auth_user` in the
  same dump.
- **Session tokens — the reviewer found something worse than reported.** With
  `cookieCache` enabled, `BETTER_AUTH_SECRET` **alone** suffices: `session.mjs:76-81`
  authenticates the `session_data` cookie purely by HMAC and returns the embedded
  user with no DB read, and the `session_token` value is never checked. The
  secret, not the session table, is the crown jewel — and its config DTO has no
  length or entropy floor.

## Findings that are NOT about #1024 — they belong to whoever owns sodax-backend

Six findings are about code running in production **today** and have nothing to
do with the auth-api build. Recording them here because that is where they were
found, but they should not be buried in a #1024 folder:

1. **`POST /get-access-token` is publicly mounted.** The catch-all
   `expressApp.all('.../*splat')` exposes Better Auth's whole default route
   table; that route takes only a session cookie and returns a live Google OAuth
   access token — no fresh-session requirement, no re-auth. `/list-accounts` and
   `/account-info` leak linked-provider metadata; `/ok` and `/error` are
   unauthenticated and fingerprint the stack.
2. **Any Google account can self-provision a partner organization.**
   `allowUserToCreateOrganization` is unset (defaults to permitted) and the Google
   provider has no `hd` restriction or post-sign-in allowlist. Sign in → become
   org owner → issue invitations and org API keys.
3. **Better Auth's rate limiter is off in production** (the `NODE_ENV` mismatch
   above).
4. **`cookieCache` honours a revoked session for up to 5 minutes** — `SessionGuard`
   calls `getSession` without `disableCookieCache`, so the whole portal API
   accepts the stale cookie, including a stale `activeOrganizationId` and role.
5. **The main Mongo has no backup** (§1 of the durability plan) — this is a
   standing risk for every app, not only a future auth-api.
6. **`apps/api`'s `IPGuard` is an unconditional `return true`** with a `// TODO:
   this bypass for now` comment, on the `/admin/*` controller. The route reads as
   two factors (network position AND token); only the token is real.

**Suggest raising 1, 2 and 6 as their own issues.** None is a #1024 deliverable,
and leaving them in a research folder is how they get lost.

## Method note — a workflow failure worth not repeating

The first attempt at the three heaviest lenses burned ~4 hours across 17 agents
that were all interrupted mid-run and retried from scratch, never converging.
Cause: prompts that asked for exhaustive module reads at `xhigh` effort, so each
agent ran long enough to be cut. Compounding it, the script put the doc-fix phase
*behind* the lens phase with `await`, so 18 queued documentation fixes were
blocked behind work that never finished, despite having no dependency on it.

Re-run with the lenses split into five narrow, explicitly budgeted assignments
("locate with rg first, Read only what you need, aim for a handful of
well-evidenced findings, not completeness") at `high` effort, and with doc-fixes
and lenses as two concurrent tracks: **9/9 agents, zero errors, five minutes.**

Lesson for future passes in this repo: scope per agent, and never put an
independent track behind a barrier.
