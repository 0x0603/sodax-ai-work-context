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

**The trade-off, stated honestly:** `authHash` is a password-equivalent in transit. Anyone who can
observe it — a TLS-terminating proxy, XSS on the login page, a malicious server build — can
authenticate as the user, though they still cannot derive `kek` or open the blob. SRP resists
exactly that, and also gives mutual authentication via `M2` (the client verifies the server really
held the verifier). At rest the two are comparable: a DB dump yields something that only supports
an offline dictionary attack either way. If the threat model includes a hostile or compromised
server endpoint, revisit this and implement SRP or OPAQUE.

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
