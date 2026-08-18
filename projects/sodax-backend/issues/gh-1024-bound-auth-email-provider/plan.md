---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-18
---

# Plan

Two phases. Phase 1 (research) is complete; Phase 2 (build) is the current one.

## Phase 1 — Research · DONE (2026-08-12, deepened 2026-08-18)

Read the three named sources directly rather than inferring. Two of three were reachable — see
`process.md`. Mapped the result against what `sodax-backend` has today so "replicate it, pick out
what we need" has a concrete gap list. Output: [[bound-auth-mechanism]] and
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
internal-only, no public route, ever."* Template for a new app: `apps/bridge-api` (newest
greenfield). Better Auth wiring to copy: `apps/stateful-api/src/main.ts` (`bodyParser: false`,
helmet first, `toNodeHandler` mounted before `express.json()`) and `src/auth/*`.

### Why Better Auth rather than from scratch

`apps/stateful-api` already runs Better Auth `1.4.18`, with `email-otp`, `jwt`, `bearer`,
`two-factor`, `siwe` plugins on disk and unused. The separate `@better-auth/passkey` package
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

## Open questions — need Fez

1. **What does "backup" mean?** Client-encrypted blob on our servers (Bound's model, settled), or
   "recover with email alone" (needs a server-held share → we become a custodian)? These are
   different products.
2. **Scope.** Fez named email login, passkey, setup, backup, encrypted keys. In or out:
   external-wallet auth, 2FA, multi-device linking?
3. **Chains for v1.** All 9 families, or start with EVM + Solana + Sui?
4. **#1069 / Hana.** Confirm it is out of scope, so shipping this is not mistaken for closing it.

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

## Risks

1. **PRF availability** — gates the passkey path entirely. Step 1 exists to kill this early.
2. **Better Auth version** — repo pins `1.4.18`; extension passthrough needs `@better-auth/passkey`
   on 1.6+. Check the pnpm catalog does not drag `stateful-api` along.
3. **Irrecoverable wallets** — seed-phrase backup UX and a support policy are prerequisites, not
   follow-ups.
4. **New class of attack surface for this org** — nothing in `sodax-backend` is public-login-facing
   today. Separate box; treat the threat model in `docs/auth-api.md` as a real deliverable.


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
  not merges with, chain defaults; and EVM/Solana/Sui bypass
  `chainRegistry`/`IXConnector` entirely, so v1 scope is the other 6 chains.
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
  sibling apps (`bridge-api`'s `HaproxyThrottlerGuard`, `stateful-api`'s CORS
  pattern) vs. what's genuinely new work (account-keyed lockout, security-event
  logging — no existing precedent for either). Rate-limit/IP-header facts in
  this file are verified against `better-auth@1.4.18`'s actual installed
  source, not the plugin docs — see the file for exact quoted code.
- **[[plan-auth-api-scaffold]]** — exact, copy-pasteable templates for
  `apps/auth-api`: the full `stateful-api/src/auth/{auth.config.ts,
  auth.constants.ts}` Better Auth wiring (verbatim, to mirror with a `wauth_*`
  prefix), the `main.ts` bootstrap order, the `class-validator`-based config
  and DTO conventions, and the `HaproxyThrottlerGuard`/Redis reuse — every
  snippet copied verbatim from a currently-running sibling app this session,
  not paraphrased.

Open questions from this phase (11 items — npm package names, whether one
account can hold both passkey and password, exact publish topo order, etc.)
live inside [[plan-sdk-integration]] and [[plan-auth-api-security]] next to
the finding each one came from, rather than duplicated into a single list
here.
