---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-19
---

# Plan

Two phases. Phase 1 (research) is complete; Phase 2 (build) is the current one.

## Phase 1 — Research · DONE (2026-08-12, deepened 2026-08-18)

Read the three named sources directly rather than inferring. Two of three were reachable on
2026-08-12; `boundex/radfi-web` was 404 until later the same week, when access was granted and the
client half was read from source too — so all three are now covered. See `process.md` for the
chronology. Mapped the result against what `sodax-backend` has today so "replicate it, pick out
what we need" has a concrete gap list. Output: [[bound-auth-mechanism]] (server),
[[bound-client-crypto]] (client), [[bound-email-password-flow]] (walkthrough) and
[[encrypted-keystore-vs-mpc-email-wallets]].

## Phase 2 — Build

Direction set by [[0001-own-the-email-wallet-auth-plane]]: build the whole plane in-house,
`radfi-be` as reference to redo.

### Shape

| Layer | Where | What |
| --- | --- | --- |
| Auth service | **new** `sodax-backend/apps/auth-api` | Better Auth (email OTP, passkey, session, JWT, 2FA) + our keystore module + ECDH device-link relay + Resend |
| Client crypto | **new** package in `sodax-sdks` | mnemonic, argon2id, AES-256-GCM, PRF, chain derivation, provider factory |
| Wiring | `sodax-frontend` | connector into the existing wallet layer |

**Not `apps/api-auth`** — PR #1048's design record rules #1024 out by name: *"api-auth stays
internal-only, no public route, ever."*

Template for a new app: `apps/bridge-api` — the closest **structural** match (Nest 11 +
`@nestjs/mongoose` 11.0.3 + `@keyv/redis` 4.6.0, the same stack `auth-api` needs). Caveat: it is
**not on `development`**. Scaffolded 2026-07-15 (`482d1609`, #268), it still lives only on
`origin/feat/bridge-api` / `origin/feat/bridge-api-bound-auth-usdt-approve` — copy from the branch
ref, and expect `apps/bridge-api/**` to be missing for anyone working off `development`. It is also
*not* the newest greenfield app: `apps/sponsoring-api` landed 2026-08-03 (`04fd142d`, #981) and
`apps/api-auth` 2026-08-17 (`00865c07`, #1048). Skim `api-auth` for the freshest scaffold
conventions (`src/config/config.class.ts`, biome, CI, `src/shared/configure-app.ts`) but **not** its
DB layer — that one is Postgres + `drizzle-orm` 0.45.2, not Mongo.

Better Auth wiring to copy: `apps/stateful-api/src/main.ts` (`bodyParser: false`, helmet first,
`toNodeHandler` mounted before `express.json()`) and `src/auth/*`.

### Why Better Auth rather than from scratch

`apps/stateful-api` already runs Better Auth `1.4.18`. Many plugins ship in that installed version
and are unused — `email-otp`, `jwt`, `bearer`, `two-factor` and `siwe` among them. The separate
`@better-auth/passkey` package
(1.6+) passes WebAuthn extensions through and returns client extension results:

```ts
authClient.signIn.passkey({ extensions: { prf: {...} }, returnWebAuthnResponse: true })
// → result.webauthn.clientExtensionResults   ← PRF output, client-side only
passkey({ registration: { requireSession: false, resolveUser } })   // passkey-first onboarding
```

One ceremony, PRF client-side, and **no hand-rolled WebAuthn** — which is where Bound shipped real
bugs (see [[bound-auth-mechanism]] §10). That leaves the keystore layer as the only genuinely new
code, against radfi-be's ~6,700-line auth surface.

Own collection prefix (`wauth_*`), since `stateful-api` owns the `auth_*` collections and the
repo enforces one-writer-per-collection.

### Password path: KDF split, not SRP

Bound uses SRP-6a (`secure-remote-password@0.3.1`, RFC 5054 **2048-bit** group, SHA-256 — a sound
choice, not a weak one). We skip it for integration cost, not for strength: it is a second
two-round ceremony to build, test and operate, and Better Auth has no SRP plane to hang it on.

Instead derive two independent values client-side:

```
authHash = argon2id(password, salt, ctx="auth")   → sent as the Better Auth password
kek      = argon2id(password, salt, ctx="kek")    → never leaves the client
```

Server sees `authHash`, from which `kek` is not derivable. The blind-custodian property holds, and
it reuses Better Auth's `emailAndPassword` plane.

Note this must not repeat Bound's mistake in reverse: **both** outputs have to sit behind the same
expensive KDF. Deriving `authHash` cheaply while deriving `kek` expensively reproduces exactly the
bypass documented in [[bound-client-crypto]] §2.

**The trade-off, stated honestly:** `authHash` is a password-equivalent in transit. Anyone who can
observe it — a TLS-terminating proxy, XSS on the login page, a malicious server build — can
authenticate as the user, though they still cannot derive `kek` or open the blob. SRP resists
exactly that, and also gives mutual authentication via `M2` (the client verifies the server really
held the verifier). At rest the two are comparable: a DB dump yields something that only supports
an offline dictionary attack either way. If the threat model includes a hostile or compromised
server endpoint, revisit this and implement SRP or OPAQUE.

### Client crypto — the irreversible decisions, to fix before the first real user

`radfi-web` is now readable, so these are informed by what Bound actually ships
([[bound-client-crypto]]) rather than by guesswork. Each item is irreversible once one real user
exists.

1. **Versioned envelope with the FULL parameter set**, and the canonical header passed as AES-GCM
   **`additionalData`**. Bound has neither: no AAD anywhere, and `argon2Params` is written but
   never read (`derivePasswordKey` takes no params argument), so their KDF profile is pinned to
   the code version and can never be migrated. Without AAD a malicious server can also downgrade
   the recorded parameters.
2. **Two-layer DEK.** Random DEK encrypts the mnemonic once; the DEK is wrapped per unlock method.
   Bound has no DEK layer, so change-password and add-passkey both decrypt the mnemonic to a
   plaintext JS string and re-encrypt everything.
3. **Both password derivations must be expensive.** The most important lesson from Bound: they run
   Argon2id (64 MiB, t=3) for the KEK *and* plain SHA-256 for the SRP verifier, from the same
   plaintext password. A server compromise then costs ~1 SHA-256 per guess and the Argon2id work
   is bypassed entirely. Whatever the server stores must be as expensive to attack as the blob —
   run one Argon2id and split with HKDF-Expand under distinct `info` labels.
4. **Per-user, per-credential PRF salt**, stored in the envelope. Bound uses one global constant
   (`"bound-wallet-prf-v1"`) for every user and credential.
5. **The nine derivation paths**, explicit, with test vectors. Also fix the two silent library
   defaults already in `sodax-sdks` (`SuiWalletProvider` and `InjectiveWalletProvider` call
   `deriveKeypair` / `fromMnemonic` with no path argument) — independent of this project.
6. **RP ID** for passkeys — changing it invalidates every credential.
7. **Single named constant per KDF parameter.** Bound duplicates the four numbers as inline
   literals in two places, with *different field names* in each.

Secondary but worth deciding early: whether to fold a high-entropy client-side secret
(1Password-style Secret Key) into the KDF input, since it cannot be retrofitted.

### Client integration is nearly free

The SDK has 9 chain families / 21 chains, and **8 of 9 wallet providers already accept a raw
`privateKey`** (Sui takes mnemonics directly). Decrypt → derive per-chain key → construct the
existing provider. Cheapest connector wiring: EIP-6963 announcement for EVM and Wallet Standard
`registerWallet` for Solana/Sui (zero SDK changes); `SodaxWalletConfig.<CHAIN>.connectors` for the
rest.

### Order

0. Post research + decision on #1024; cross-link #1069; set up the cross-repo issue structure.
1. **Spike (½ day, gates everything):** prove one passkey ceremony yields a usable PRF output via
   `@better-auth/passkey` on Chrome + Safari + iCloud Keychain.
2. App scaffold + Better Auth + email OTP + Resend. No wallets yet.
3. Keystore module + client crypto + passkey path end to end (register → login → decrypt → derive EVM).
4. Password path (KDF split). Remaining 8 chain families.
5. Multi-device ECDH linking; key export; session management.
6. Connector + frontend wiring.

Deliberately out of v1: the BTC 2-of-2 timelocked trading wallet — a Bitcoin-AMM latency
optimisation Sodax's chains do not need.

### Backup — now answerable with evidence

Bound's backup is a 12-word seed phrase, **not shown at registration**, revealed on demand only,
skippable, nudged once via a sessionStorage marker that fires only on the next login, and silently
cancelled by linking a second device. No recovery of any kind exists at any layer.

Whatever we build should decide deliberately, not inherit this by default: show-at-signup vs
nudge-later, blocking vs skippable, and whether a verification step is enforced. This is product
work with direct financial consequence, and it is where Bound is weakest.

### Carry over from Bound

The two-signature model, the determinism whitelist (Taproot/BIP-322 excluded), nonce consumed
before verification, wallet-signature failures excluded from lockout, HMAC-hashed OTP,
`select: false` on the blob, positive JWT type assertion. Details and the nine anti-patterns:
[[bound-auth-mechanism]] §4, §9, §10.

### Scope decision — email+password is in, first-class (2026-08-18)

Reading Bound's shipped client settled what *Bound* does, and it is narrower than these notes
assumed. It no longer registers with an email at all: both `authService.register(` call sites are
`authType: PASSKEY` (`AuthModal.tsx:743`) and `authType: WALLET` (`AuthModal.tsx:1274`); the SRP
branch is constructed nowhere in product code. Password sits behind a *"Legacy login options"*
disclosure (`messages/en.json:233`), and there is **no client path that can create an SRP account** —
`ResetPasswordPanel` is a rotation that demands the current password, and `account/page.tsx:70`
hides the password panel unless `authType === SRP`. In radfi-web an SRP account can only be
pre-existing.

**That does not bind SODAX.** The call: SODAX ships **both** email+password login **and** passkey
login. Bound is a blueprint to redo, not a product to track — SODAX needs its own logic, not a copy
of Bound's and not a follow of wherever Bound went next.

Consequences, stated plainly:

- Partially answers Open question 2 below: email+password is **in**, first-class, not a legacy
  path kept alive for old accounts.
- Makes the KDF-salt gap (Open question 13) load-bearing rather than hypothetical. The password
  path is shipping, so the pre-login salt fetch is required work, not an option.
- Leaves emailless passkey login as a **separate** UX decision (Open question 14). The passkey
  path can be emailless — as Bound's primary login is — while the password path stays email-keyed.
  These are independent choices; do not couple them.

## Open questions — need Fez

1. **What does "backup" mean?** Client-encrypted blob on our servers (Bound's model, settled), or
   "recover with email alone" (needs a server-held share → we become a custodian)? These are
   different products.
2. **Scope.** Fez named email login, passkey, setup, backup, encrypted keys. Partly answered above
   — email+password and passkey are both in. Still open: external-wallet auth, 2FA, multi-device
   linking?
3. **Chains for v1.** All 9 families, or start with EVM + Solana + Sui?
4. **#1069 / Hana.** Confirm it is out of scope, so shipping this is not mistaken for closing it.

Continuing the shared numbering — items 5-7 live in [[plan-sdk-integration]] and items 10-12 in
[[plan-auth-api-security]] (8-9 are unused; that file's own heading says "items 10 and 11" but
lists three) — two questions found on 2026-08-18 and previously only in `process.md`:

13. **Where does the client get the KDF salt?** The KDF split above specifies
    `authHash = argon2id(password, salt, ctx="auth")` and `kek = argon2id(password, salt, ctx="kek")`
    but no plan file says how the client obtains `salt` **before** login. It cannot compute
    `authHash` without it, so a pre-login round trip must exist — e.g.
    `POST /auth/kdf-params { email } → { salt, argon2Params }` — and that endpoint is an
    account-enumeration surface. Bound gets the equivalent step right: `srpInit` returns a
    **deterministic fake salt** (`HMAC(jwtRefreshSecret, "srp-fake-salt:" + email)`,
    `auth.service.ts:1085-1090`) for unknown emails, so probing is indistinguishable from a real
    account; and gets it wrong on their OTP endpoint (`400 account.emailTaken`,
    [[bound-auth-mechanism]] §9). Copy the former, not the latter. With email+password confirmed
    in scope, this is required work.
14. **Should passkey login be emailless?** [[plan-sdk-integration]] phase 4 specifies the modal as
    `closed -> emailEntry -> methodSelect -> {passkeyCeremony | passwordEntry}` — email first,
    unconditionally, for both paths. That was written believing it matched Bound; it does not.
    Bound's primary passkey login uses a discoverable credential with no `allowCredentials` and no
    email (`webauthn.ts:443-459`, `residentKey: "required"` at registration, `webauthn.ts:276`).
    Prerequisite: does `@better-auth/passkey` support `residentKey: 'required'` plus an
    identifier-less sign-in? **Still unverified — the package is not installed in either repo.**
    Fold into the existing spike. Two costs to weigh: discoverable credentials consume slots on
    hardware authenticators (free on iCloud Keychain and Google Password Manager, which are the
    only two AAGUIDs Bound whitelists anyway — `setting.constant.ts:197-206`), and an account with
    no email has no channel for security notifications — Bound hits this too, hard-stopping device
    linking with *"Add an email first"* (`ApproveLinkModal.tsx:63-67`).

15. **Where does the key material execute?** Raised 2026-08-19, and it blocks the SDK packages
    entirely. The user confirmed SODAX Auth **does** ship to third-party dapps, because the SDK is a
    library dapps consume — which makes the current in-bundle model untenable (risk 5). Proposed
    answer in [[0002-key-custody-boundary-for-third-party-dapps]]: a cross-origin hosted signer on a
    SODAX origin, sequenced via first-party-only for v1. Needs Fez, because it adds a standing
    operational commitment (a static origin at wallet-grade uptime) that is the real price of
    third-party distribution. **Decide `rp.id` in the same conversation** — it is the same decision,
    it is free to make correctly today, and it is unchangeable per credential afterwards.

## Verification

- Spike gate: print `clientExtensionResults.prf.results.first` on Chrome + Safari + iOS.
- **Blind-custody regression test:** register a user, dump the DB, grep for the mnemonic,
  password, PRF output and any derived private key. Zero hits is the pass condition.
- Round-trip: register → log out → log in → decrypt → derived addresses byte-identical.
- Recovery: wipe local state, restore from the BIP-39 phrase alone, same addresses — proves the
  server is not required.
- Device link: two browser profiles through the ECDH relay; assert the stored relay payload is
  undecryptable with anything the server holds.
- SDK integration: drive a real intent through a decrypted email wallet in `apps/demo`, one EVM
  chain plus one non-EVM.
- Gates: `pnpm lint` / `build` / `test` in CI; pre-commit runs `checkTs` → `test` → lint-staged.
  Note `checkTs` is **not** in CI — type errors only surface via `nest build`.
- **Durability gates** — a separate bar from the above, because these fail differently: a restore
  drill that asserts `wauth_keystore` survives a real archive round-trip, a runbook-coverage test, a
  KDF-parameter migration test, an AAD tamper test, an append-only test, and a PRF round-trip gate.
  Specified in [[plan-auth-api-durability]] §9.

## Risks

1. **PRF availability** — gates the passkey path entirely. Step 1 exists to kill this early.
2. **Better Auth version** — repo pins `1.4.18`; extension passthrough needs `@better-auth/passkey`
   on 1.6+. Check the pnpm catalog does not drag `stateful-api` along.
3. **Irrecoverable wallets** — seed-phrase backup UX and a support policy are prerequisites, not
   follow-ups.
4. **New class of attack surface for this org** — nothing in `sodax-backend` is public-login-facing
   today. Separate box; treat the threat model in `docs/auth-api.md` as a real deliverable.
5. **The dapp holds the key, and the same key, in every integrating dapp.** The plan assumed —
   never stating it — that the client crypto ships as npm packages third-party dapps bundle. Verified
   2026-08-19: there is no trust boundary in that model. SDK and dapp compile into one bundle, one
   origin, one JS realm; `useWalletProvider` hands the provider object to dapp code by design; and
   the only access control is TypeScript `private`, erased at runtime (ICON and Sui are each one
   property access from the raw secret). So one XSS or one compromised npm dependency in **any**
   integrator's frontend yields the mnemonic — identical across every integrator, reaching all nine
   chain families including ones the user never connected there, permanently, since a seed cannot be
   rotated. Bound does not face this because it is a single first-party app. **This is a blocking
   architectural decision, not a hardening task**, and it is welded to the RP ID (risk 6 below and
   `plan.md`'s irreversible list). Analysis and proposed decision:
   **[[0002-key-custody-boundary-for-third-party-dapps]]**.
6. **We become the sole custodian of the only copy of the ciphertext**, and the repo's current
   backup posture does not cover it. This is a *durability* risk, not a security one, and it is
   infrastructure that must exist **before the first real user**, not a follow-up. Headline: the one
   backup pipeline covers only the shared stateful DB, so where `wauth_*` lands silently decides
   whether user funds are recoverable at all; the backup watcher checks S3 object metadata and never
   opens the archive; `rs0` is a single-member set, not replication; and `mongorestore --drop` runs
   in every restore mode. Full analysis and the resulting requirements:
   **[[plan-auth-api-durability]]**.


## Phase 3 — SDK integration (this session, 2026-08-18)

Split into dedicated files once it grew past a skim-able size — this section
is now just the index:

- **[[plan-sdk-integration]]** — how `sodax-sdks` (`wallet-sdk-react`
  specifically) and `apps/demo`/`apps/wallet-modal-example` offer SODAX Auth
  as a login option: the 3 new packages (`keystore-crypto`, `wallet-auth-core`,
  `wallet-auth-react`), the 2 required small changes to existing
  `wallet-sdk-react`, the phased build order, and how `sodax-backend` reuses
  `keystore-crypto` directly (confirmed low-friction: `sodax-backend` already
  consumes `@sodax/sdk`/`@sodax/types` as plain npm deps across 7 apps today).
  Two corrections found by direct source-reading this session, load-bearing
  for the whole design: `SodaxWalletConfig.<CHAIN>.connectors` **replaces**,
  not merges with, chain defaults; and EVM/Solana/Sui bypass the
  connector/`IXConnector` mechanism — they still have `chainRegistry` entries
  (`chainRegistry.ts:168-185`), but each is `providerManaged: true` with
  `defaultConnectors: () => []`, and connector wiring is gated behind
  `if (!factory.providerManaged)` (`chainRegistry.ts:412`), their state being
  written by Hydrators instead. So v1 scope is the other 6 chains.
  Also carries the Bound-team Slack input (AAGUID whitelist, post-registration
  local PRF re-verification) and how each is implemented.
- **[[plan-engineering-standards]]** — S1–S9, the "senior-architect / clean
  code" rules for this build, each grounded in a convention already enforced
  somewhere in these repos (not invented). Cited by number from the other
  plan files instead of restated.
- **[[plan-auth-api-security]]** — rate limiting, CORS/CSRF/cookie hardening,
  account enumeration, WebAuthn replay hygiene, and the blind-custodian
  model's actual data-leak surface, for the new `sodax-backend/apps/auth-api`.
  Answers "not hackable, no data leaks" concretely — what to reuse from
  sibling apps (`apps/swaps-api/src/shared/guards/haproxy-throttler.guard.ts`
  — on `development`, and byte-identical to `bridge-api`'s copy, which is not on
  `development`. Note `apps/sponsoring-api`'s copy is *not* identical but a
  refactored variant: it delegates to the shared
  `resolveClientIp(req)` and falls back to `'127.0.0.1'`, so unattributable traffic
  shares one bucket, where `bridge-api`/`swaps-api` read `req.headers['x-real-ip']`
  directly with a `req.ip` fallback. Plus `stateful-api`'s CORS
  pattern) vs. what's genuinely new work (account-keyed lockout, security-event
  logging — no existing precedent for either). Rate-limit/IP-header facts in
  this file are verified against `better-auth@1.4.18`'s actual installed
  source, not the plugin docs — see the file for exact quoted code.
- **[[plan-auth-api-durability]]** — the other half of `plan-auth-api-security`:
  not *"can it be stolen?"* but *"can it be lost?"*. Added 2026-08-19 from a
  source-verified threat-model pass. Every other collection in this repo is
  derivable on loss; a keystore row is the only copy of an unrecoverable secret,
  so the failure mode is permanent user fund loss with no support path. Covers
  the backup gap that decides where `wauth_*` may live, the watcher that cannot
  see inside an archive, `rs0` being a single-member set rather than
  replication, `--drop` running in every restore mode, why the blob store must
  be append-only, the two envelope bit-fragility classes (no AAD + IV-as-HKDF-
  salt; `argon2Params` written but never read), the product decisions that are
  really durability decisions, and the PRF create-vs-assertion mismatch that can
  birth an unopenable account.
- **[[plan-auth-api-scaffold]]** — exact, copy-pasteable templates for
  `apps/auth-api`: the full `stateful-api/src/auth/{auth.config.ts,
  auth.constants.ts}` Better Auth wiring (verbatim, to mirror with a `wauth_*`
  prefix), the `main.ts` bootstrap order, the `class-validator`-based config
  and DTO conventions, and the `HaproxyThrottlerGuard`/Redis reuse — every
  snippet copied verbatim from a currently-running sibling app this session,
  not paraphrased.

Open questions from this phase (6 items — 5-7 and 10-12 in the shared numbering;
npm package names, whether one account can hold both passkey and password,
wire-type sync, bot-check, CSRF, and 12 already settled) live inside
[[plan-sdk-integration]] and [[plan-auth-api-security]] next to
the finding each one came from, rather than duplicated into a single list
here.
