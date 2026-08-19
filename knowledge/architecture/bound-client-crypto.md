---
type: knowledge
area: architecture
status: Active
tags: [auth, bound-auth, radfi-web, keystore, argon2, prf, webauthn, derivation, bip44, backup, recovery, custody]
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider, gh-1069-email-provider-wallet-connectivity]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# Bound's client-side crypto, read from radfi-web source

The half [[bound-auth-mechanism]] could not reach. Because the server is a blind custodian, the
backend repo structurally cannot contain any of this — it stores an opaque string. Read from
`boundex/radfi-web` at commit `15ac098`, branch `main`, ~238k LOC, Next.js + TypeScript.

**Access:** `radfi-web` was 404 until 2026-08-18, when access was granted. Every "unobtainable"
item listed in [[bound-auth-mechanism]] §11 is now settled and is answered below.

Cloned persistently at `/Users/sangnguyen/Documents/GitHub/radfi-web` — see
[[bound-exchange-repos]] for local paths and refresh instructions.

## Stack

```
argon2-browser  ^1.18.0    KDF — last published 2021, unmaintained
@scure/bip39    ^2.0.1     mnemonic          @scure/bip32 ^2.0.1
ed25519-hd-key  ^1.3.0     SLIP-0010 for Solana
@noble/curves   ^2.0.1     @noble/hashes ^2.0.1
@scure/btc-signer ^2.0.1   bitcoinjs-lib ^7 · ecpair · tiny-secp256k1
secure-remote-password ^0.3.1   ← SAME version as the backend
viem ^2.47.6 + ethers ^5.8.0
```

No `@simplewebauthn/browser` — WebAuthn is hand-rolled on **both** ends.

## 1. The PRF question is settled: it IS PRF

```ts
// src/core/keystore.ts:67
const PRF_SALT = new TextEncoder().encode("bound-wallet-prf-v1")
```

Exposed via `getPrfSalt()` (`keystore.ts:72-74`); the lowercase `prfSalt` below is the call-site
local at `webauthn.ts:260`, not the module constant.

`docs/keystore-wallet-flow.md:191` in the backend ("an ECDH-derived key negotiated with the
authenticator device") is **wrong**. `docs/requirements/auth-module.md:27` (PRF) is right.

- The salt is **one hardcoded global constant, identical for every user and every credential** —
  19 bytes, passed as a copied ArrayBuffer, never a string.
- `create()` uses `extensions: { prf: { eval: { first: prfSalt } } }`; `get()` uses
  `evalByCredential` keyed by base64url credential id, or plain `eval.first` when discoverable.
- **Registration is a SINGLE ceremony** — the PRF output is read straight from `create()`'s
  `getClientExtensionResults().prf.results.first`. One biometric prompt.

**They built the two-prompt round-trip verification and reverted it**, because the server's
one-time challenge expired mid-flow and `/auth/register` returned `17004
KEYSTORE_INVALID_ASSERTION` (`src/auth/passkey-prf-roundtrip-changes.md:24`). An in-repo design
doc then records the open risk that create-time and assertion-time PRF may differ — i.e. **a
class of accounts can be born permanently un-unlockable**. No test covers it.

Capability detection exists but is advisory: `getClientCapabilities()["extension:prf"]` blocks
only on an explicit `false`.

## 2. Three encryption paths, one field

All three land in the same server column `encryptedBlob`, and they are mutually incompatible.

| Path | Key derivation |
| --- | --- |
| Password | `argon2-browser` Argon2id → 32 bytes imported **raw** as the AES-GCM key |
| Passkey | PRF output → HKDF-SHA256, `info="bound-keystore"`, **salt = the AES-GCM IV itself** |
| Wallet-auth | raw signature bytes → HKDF-SHA256, random 32-byte salt, versioned info string |

### But only two of them can create an account

`register()` (`src/api/auth.ts:49`) has exactly two call sites — `AuthModal.tsx:743-744`
(`authType: AUTH_TYPES.PASSKEY`) and `AuthModal.tsx:1274-1275` (`AUTH_TYPES.WALLET`).
`RegisterSrpDto` / `RegisterSrpRequest` (`src/types/auth-api.ts:49,86`) have **no client-side
producer** at `15ac098`, and `src/app/(auth)/register/` is dead behind a bare
`redirect(buildLegacyAuthCompatibilityPath(…))` (`register/page.tsx:11`).

The password path is a **legacy-account surface only**: `account/page.tsx:70` gates the password
panel to `authType === AUTH_TYPES.SRP`, and the password login card sits behind a `legacyOptions`
disclosure rendered only when `canLogin` (`AuthModalPresentation.tsx:334,352`; `canLogin = mode
!== REGISTER`, `AuthModal.tsx:199`). In this client an SRP-encrypted blob is produced only by two
post-login operations: change-password (`createPasswordKeystore`, `password.ts:23` ←
`ResetPasswordPanel.tsx:156`) and change-email (`recomputeSrpVerifier`, `srp.ts:55` ←
`account/change-email/page.tsx:150`). `reEncryptKeystore` (`password.ts:63`) is dead — zero callers.

### Argon2id parameters (password path)

```ts
// src/core/keystore.ts:43-52
const salt = existingSalt ?? randomBytes(16);
const result = await hash({
  pass: password, salt,
  type: 2,          // Argon2id — explicit; library default would be Argon2d
  mem: 65536,       // 64 MiB   — library default 1024
  time: 3,          //          — library default 1
  parallelism: 4,   //          — library default 1; WASM build is single-threaded anyway
  hashLen: 32,      //          — library default 24
});
```

Argon2 version byte `0x13` is a library constant, not settable. `secret` and `ad` unused.

**The same four numbers are written a second time as inline literals at `keystore.ts:141-146`,
with no shared named constant.** Drift between the two copies breaks wallets.

### Envelope

```
encryptedBlob = JSON.stringify({
  version: 1, type, argon2Salt?, argon2Params?, aesIv, ciphertext
})
```

JSON, no magic bytes, no binary framing. AES-256-GCM via WebCrypto, 12-byte random IV, tag length
left at WebCrypto's 128-bit default (the wallet-auth path sets `tagLength: 128` explicitly — the
two subsystems differ in intent-signalling).

### The three envelope defects — exactly the failure modes predicted in advance

1. **No AAD anywhere in the repo.** `grep additionalData src` finds only unrelated API fields.
   So `version`, `type` and `argon2Params` are **unauthenticated** — a malicious server can edit
   them and only the GCM tag over the mnemonic bytes protects the payload.
2. **`argon2Params` is written but never read.** `derivePasswordKey` takes no params argument and
   always uses the hardcoded constants. The recorded parameters are decorative; in practice the
   KDF profile is pinned to the code version and **cannot be migrated**.
3. **The HKDF salt on the passkey path is the AES-GCM IV.** Unusual, unnecessary, and it couples
   two values that should be independent.

### No DEK layer

Change-password and add-passkey both **decrypt the mnemonic to a plaintext JS string and
re-encrypt the whole thing**. Every unlock method holds a full independent ciphertext copy of the
mnemonic, and the seed re-enters the JS heap on every routine credential operation.

### Domain separation — clean in shape, undermined in substance

Two disjoint derivations from the same password, two independently random salts, no chaining, no
shared intermediate. Structurally correct.

**But the SRP side is plain SHA-256**: `x = H(s, H(I ":" p))`, `secure-remote-password@0.3.1`
with **zero explicit parameter configuration** — group, hash and salt length are all library
defaults (RFC 5054 2048-bit, g=2, SHA-256).

```
server compromised → steal srpVerifier → offline attack at ~1 SHA-256 per guess
                   → recover password  → run Argon2id once → open the blob
```

**The Argon2id cost is bypassed entirely.** The attacker's real cost is SHA-256, not 64 MiB ×
3 passes. This is the single most consequential flaw found on either side, and it defeats the
most expensive protection in the design. Its blast radius in *this* client is legacy SRP accounts
only (see above) — but for those accounts it is fully live.

### Key hygiene

All `CryptoKey`s are `extractable: false`. PRF outputs and wallet signatures are zero-filled — in
`finally` blocks at every orchestration/UI call site (`AuthModal`, `add-passkey`,
`web3AuthWallet`, `walletAuthKeystore`), but **inside the try body** in `webauthn.ts`
(`registerPasskey`:319, `recoverMnemonic`:664), where a throw between the ceremony and the fill
leaves the PRF output live in the heap. The **mnemonic, the password and the raw Argon2 output are
not zero-filled at all**.

## 3. Derivation paths — all three, hardcoded

```ts
// src/core/derivation.ts:10-14  (non-exported DERIVATION_PATHS)
bitcoin: "m/86'/0'/0'/0/0"     // BIP-86 taproot, key-path only, no script tree
evm:     "m/44'/60'/0'/0/0"    // MetaMask-compatible
solana:  "m/44'/501'/0'/0'"    // 4-level Phantom-style, SLIP-0010 ed25519
```

- **Exactly three chains.** The whole HD surface is one 155-line file plus a 33-line
  `mnemonic.ts`.
- Mnemonic: **12 words / 128 bits**, `@scure/bip39` `generateMnemonic(wordlist, 128)`, English
  wordlist only. A BIP-39 passphrase is plumbed through `mnemonicToRootSeed(mnemonic, passphrase?)`
  but **no production caller ever passes one**.
- Account index and address index are **hardcoded to 0**. No multi-account, no gap-limit scan, no
  path override anywhere.
- The 2-of-2 P2TR `tradingAddress` is **not** built client-side — the frontend ships
  `publicKey`/`address` and reads `tradingAddress` back from the server. **No real relayer public
  key exists in this repo.** A fabricated BE key appears only in test code — two files, three test
  cases: `src/core/__tests__/psbt.test.ts:36-41` (`bePrivateKey = new Uint8Array(32).fill(2)`) and
  `src/radfi/wallets/__tests__/bound-signer.test.ts:10-14`, whose `createTradingWallet` helper
  (`bePrivateKey = …fill(3)`) is used by the tests at `:18` and `:64`. All three build the leaf
  the same way — `btc.p2tr_ms(2, [userPublicKey, bePublicKey], true).script` — from a locally
  invented byte-fill key. Production code never constructs the 2-of-2: it only consumes the
  `tapLeafScript` the server puts in the PSBT (`src/hooks/useSignMultisig.ts:242`,
  `src/radfi/components/ordinals/be-context/sign-psbt.ts:13`).
- **Interop is good on mainnet** for all three (MetaMask / Phantom / Xverse-ordinals agree), but
  **breaks on signet**: the BTC coin type stays `0'` instead of SLIP-44's `1'`.

Test vectors pinned for the `abandon … about` mnemonic:
```
bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr
0x9858EfFD232B4033E47d90003D41EC34EcaEda94
HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk
```

## 4. Wallet-auth: the fixed derivation message

A globally fixed, human-readable, 5-line message, built by a function that **deliberately ignores
its credential argument**, so the text carries **no address, no nonce, no salt, no version**. LF
only, NFKC-normalized — `parseWalletAuthDerivationMessage:282-287` rejects non-NFKC input and any
`\r`:

```
"Bound Wallet Auth\n\nPurpose: Unlock the encrypted Bound keystore\n\nThis signature is not a transaction and does not spend funds."
```

Laid out (annotations are not part of the message):

```
line 0   Bound Wallet Auth
line 1   ««« BLANK »»»
line 2   Purpose: Unlock the encrypted Bound keystore
line 3   ««« BLANK »»»
line 4   This signature is not a transaction and does not spend funds.
```

**The two blank lines at index 1 and 3 are structural, not typography.**
`parseWalletAuthDerivationMessage:290-297` checks `lines.length === 5 && lines[1] === "" &&
lines[3] === ""`, and `buildWalletAuthKeystoreEnvelope:361-363` (called by
`encryptWalletAuthKeystore:564` before `deriveWalletAuthKey` at `:567`) parses *before* deriving,
propagating `parseWalletAuthDerivationMessage`'s `"Invalid derivation message format"` (`:322`) on
failure. A reimplementation that copies the three non-blank lines does not merely derive a
different key — it aborts encryption outright.

Two legacy formats remain parseable for old envelopes (one with `Version: 1`, one 10-line
"fielded" form).

**Raw signature bytes go straight in as HKDF IKM** — full 65-byte EVM `r‖s‖v`, full 64-byte
Solana ed25519, full 65-byte Bitcoin compact including the header byte. No argon2, no pre-hash,
no `r‖s` truncation. Then HKDF-SHA256, random 32-byte salt, and
`info = "bound-wallet-auth-keystore-v1\n" + canonicalKdfContext(envelope)` (`:533-535`).

`canonicalKdfContext` (`walletAuthKeystore.ts:233-244`) is **not** the whole envelope but a fixed
**8-field projection** of it, serialised in this exact key order:

```
{version, authType, derivationMessage, walletType, walletProvider, signingMethod, kdf, cipher}
```

`kdf` / `cipher` here are the bare algorithm ids `"hkdf-sha256"` / `"aes-256-gcm"`, not the params
objects. The envelope's other three fields — `kdfSalt`, `kdfParams` and `cipherParams` (which
carries the IV) — are **excluded**. Binding the full 11-field envelope (`:380-395`) into `info`
instead yields a different key and a mutually undecryptable keystore, so a reimplementation must
reproduce the 8-field subset *and its key order* exactly. The omission leaves nothing
unconstrained: `kdfSalt` is still bound as HKDF's separate `salt` input (`:541`, inside the
`deriveKey` call at `:537-548`), and `kdfParams` / `cipherParams` are pinned to constants by
`validateKdfParams` / `validateCipherParams` (`:216-231`).

**The two-signature model is confirmed from the client**: the challenge signature over the server
nonce is sent to `/auth/wallet/login` and `/auth/register`; the derivation signature over the
fixed message is used locally only and zero-filled in a `finally` block.

Determinism: **no runtime check**. Only an **unlinked but completely ungated** QA page
(`/test/web3-auth-wallet-determinism`) byte-compares two signatures. Nothing in the app links to
it, but it is a normal App Router route that builds and serves in production to anyone with the
URL: `page.tsx` is 13 lines with no `notFound()`, env or auth check, there is no `middleware.ts`
or `src/proxy.ts` (Next 16.2.6), and `next.config.ts` has no `/test` rule. **The page itself
displays a notice claiming it is "reachable only when
`ENABLE_WEB3_AUTH_WALLET_DETERMINISM_TEST=true` is set" — that variable appears nowhere in the
codebase except the two i18n message files, so the gate it advertises does not exist.** The repo's
own `MODULES.md:100` flags it: *"currently has no code-level environment gate"*. It matters
because the page connects the visitor's real wallet and requests live signatures over the
wallet-auth derivation message, including one taken from a user-pasted envelope.

**The client allowlist** enforces EVM `personal_sign` (metamask/rabby/okx/phantom), Solana
`ed25519_sign_message` (phantom only), Bitcoin `bitcoin_signed_message` (xverse/okx/unisat) —
checked at runtime in `validateAuthWalletProviderRequest()` (`src/wallets/authWallet.ts:107-163`,
against the sets in `src/types/auth-wallet-policy.ts:11-12`), not just in the type union
(`src/types/bound-wallet.ts:59-63`) — with **taproot rejected three
ways**: `bc1p`/`tb1p` address check, p2pkh/p2wpkh/p2sh-p2wpkh-only typing, and explicit `"ecdsa"`
protocol requests to all three BTC providers. Plus BIP-137 header validation (65 bytes, header
27..42).

**It does not match the backend, though the policy does.** Read in radfi-be at `c1c1e06`, the
backend agrees on *policy* — same three chains, exactly one deterministic method per chain,
BIP-322/Taproot/Schnorr excluded because Schnorr's auxiliary randomness would make the keystore
unrecoverable (`src/utils/auth-wallet-verifier.util.ts:20-27`, rationale at `:148-155`) — but:

- **The identifiers differ.** radfi-be's enum is `evm_personal_sign` / `solana_ed25519` /
  `bitcoin_signed_message` (`src/modules/keystore/keystore.type.ts:15-19`); only Bitcoin's literal
  is common. (Read at `c1c1e06`; the clone is shallow, so the enum's value history is unverifiable.)
- **There is no provider allowlist at all** on the backend: `provider` is a free-form string of up
  to 64 chars, unconstrained in both the DTO (`src/modules/auth/dto/register.dto.ts:23`) and the
  Mongoose schema (`src/database/entities/keystore.entity.ts:65` — contrast the enum-constrained
  `authWalletChain` at `:58`). Wallet-brand gating exists **only in the browser**.
- **The method identifier never crosses the wire** in either direction. The register DTO omits it
  (`src/auth/web3AuthWallet.ts:131-141`, asserted by its own test at
  `__tests__/web3AuthWallet.test.ts:171`) and the backend re-derives it from `chain`, using the
  result only as a "chain is supported" null-guard (`auth.service.ts:550`, `:1019`,
  `account.service.ts:599`). The client's string reaches the server only inside the opaque
  `encryptedBlob` envelope.

## 5. Backup — the answer is "a seed phrase, and nothing else"

**Not shown at registration.** `setupWallet()` generates the mnemonic, derives keys, signs the
ownership proofs, passes the plaintext into `registerPasskey()`, then calls
`clearGeneratedWallet()`. The phrase is never rendered during signup. The success screen says
only *"Use the Passkey you just created to confirm it can unlock your account before you deposit
funds."*

**Revealed on demand only**, via one component (`MnemonicDisplay`, used in exactly one place),
reachable from a nav pill or Account → Wallet Management.

**The nudge is fragile.** Registration writes a **sessionStorage** marker
`bound:post-registration-backup`; the prompt only arms on the *next successful login*. No second
login, no prompt, ever. It is written at exactly two sites — `AuthModal.tsx:766` (`PASSKEY`) and
`:1288` (`WALLET`) — i.e. only for the two live registration paths.

**Fully skippable**, with three escape paths:
- the pill is a nav chip, not a blocking modal; closing the modal at the "view" step sets no flag
- the post-registration auth modal is dismissible, so the re-login can be skipped entirely
- **linking a second device silently clears the prompt** (`clearSeedPhraseBackupPrompt()`,
  `add-passkey/page.tsx:369`) without ever showing the phrase

**Soft confirmation**: a two-step `View → Verify` that asks for one random word, with unlimited
retries and a "Review phrase" escape. Step 1 renders all 12 words in plaintext immediately — no
blur, no click-to-reveal, no copy button, no download.

**The only local record** is `seedPhraseBackupByAccount: Record<accountId, boolean>` inside the
persisted `bound-auth` localStorage blob. The server has no field for it at all.

**The warning copy is weak — and the strongest sentence never shipped.** There is no string
anywhere saying "if you lose this we cannot restore your funds". The sharpest language in the
codebase —

> *"I understand that I must back up my recovery phrase after registration, because losing this
> Auth Wallet can lock the Bound keystore."*

— exists **only as orphaned i18n copy**: `RegisterPage.walletReviewBackupConfirm`
(`messages/en.json:458`, translated into zh-CN at the same line). The whole `walletReview*` block
(`en.json:441-458`) has **zero code references**, and there is no step to host it —
`WalletAuthStep = "landing" | "verify" | "create" | "creating" | "success"`
(`AuthModalPresentation.tsx:30`) has no `review`. The Web3 wallet signup step
(`AuthModalPresentation.tsx:421-443`) renders only an icon, title, body, referral code and two
buttons.

**No signup path has a backup-acknowledgement checkbox** — not passkey, not Web3 Auth Wallet, and
there is no password signup at all (see §2). The app ships exactly three checkboxes, all
post-login or unrelated: `NftVerificationPanel.tsx:191`, `BetaDisclaimerModal.tsx:50`, and the
Auth-Wallet **rotation** confirmation on the account page (`AuthWalletRotationModal.tsx:383`),
whose label is `AccountPage.authWallet.rotation.confirm` — *"I understand the new wallet becomes
the Auth Wallet for this account."*

The only shipped sentence urging a phrase backup is body copy above that same rotation checkbox
(`rotation.warning`, rendered at `AuthWalletRotationModal.tsx:368`): *"Rotating changes the
external wallet that unlocks this Bound keystore… Keep your recovery phrase backed up before
continuing."* It sits behind login, on a flow most users never open. So the warning story is
**weaker than previously documented**: the strongest sentence was written, translated into
Chinese, and never wired to a UI.

### Export

Same auth gate as unlock. Formats: BTC compressed WIF (`0x80`/`0xEF` + key + `0x01`, base58check),
EVM `0x`+hex, Solana base58 of `seed‖pubkey` (64 bytes).

### Device-link relay, client side

P-256 ECDH → 256 raw bits → HKDF-SHA256 with a **static all-zero 32-byte salt** and
`info = "bound-ecdh-passkey-sync-v1"` → AES-256-GCM over the raw mnemonic string, transported as
`base64(12-byte IV ‖ ciphertext)`. Device B then re-encrypts the same mnemonic under a fresh
PRF-derived key and ships a brand-new `encryptedBlob` in `confirm-link`.

## 6. Recovery: definitively none

Exhaustive negative evidence from the client:

- **No mnemonic-import UI exists anywhere.** `setupWallet(existingMnemonic?)` has 10 call sites —
  all of them in `AuthModal.tsx` (`:509, 615, 677, 949, 1181, 1343`), `add-passkey/page.tsx:185`
  and `useWalletUnlock.ts` (`:72, 117, 181`) — and every one passes either `undefined` or a
  mnemonic that just came out of a decrypt. No component ever calls `isValidMnemonic` on user
  input.
- Case-insensitive grep for `recovery code | social recovery | guardian | shamir | secret shar |
  split key | escrow | backup code | shard` across `src/`, `messages/`, `docs/` and root `*.md`
  returns only the unrelated BTC-lending "escrow" feature.
- **`passkeyRecovery.ts` is not recovery.** 64 lines; a guard that narrows `allowCredentials` to
  the single credential captured at login. The docstring on the `recoverMnemonic` it wraps
  (`src/auth/webauthn.ts:635`): *"Re-authenticate via passkey assertion to recover the mnemonic
  **after a page refresh**."* `passkeyRecovery.ts` carries no docstring of its own — its only
  prose is `PASSKEY_FRESH_LOGIN_REQUIRED_ERROR` at `:6-7`. Session re-unlock, not account
  recovery. Both call sites are post-login.
- Multi-device redundancy must be pre-arranged: `approveLink` and `getPendingLink` require a JWT,
  and the approving device must additionally **have an email on the account** —
  `ApproveLinkModal.tsx:63-67` hard-stops with *"Add an email first"*.
- Auth-Wallet rotation is not a back door: it unlocks with the **old** wallet first, then
  re-encrypts.

`POST /keystore/srp/password-hint` (a "Forgot password?" link) emails a **user-authored hint
string**, not a reset.

## 7. Session handling

Tokens live in **plain localStorage** under `bound-session` / `wallet-session`, used as Bearer
tokens, with JWT-`exp`-driven silent refresh (2-minute proactive buffer, 60-second on-demand
buffer, 2 retries). The mnemonic is **never persisted** and is re-derived on every unlock — on the
wallet path, by re-signing the fixed message.

## 8. Docs vs code, client side

Their frontend docs are as unreliable as their backend docs:

- `AUTH_FLOW_OVERVIEW.md` is badly stale — it documents only **two** auth modes and omits the
  entire third (Web3 Auth Wallet), points at a login page that is now a bare redirect, and
  describes an external-BTC-login flow whose only implementation is dead code.
- `CODEBASE.md` and `ARCHITECTURE.md` never mention derivation paths at all and still describe the
  pre-Bound external-wallet-only architecture.

Combined with the six backend divergences in [[bound-auth-mechanism]] §9: **read their code, not
their docs — on both sides.**

## 9. What to take, and what not to

**Take**

- PRF with a versioned salt (`bound-wallet-prf-v1`) and the two-signature model (both confirmed
  working), plus versioned HKDF info strings on the ECDH-relay and wallet-auth paths — note the
  passkey path's own HKDF info is the **unversioned** `"bound-keystore"` (`keystore.ts:93`), which
  is a gap, not a thing to take.
- The taproot/BIP-322 exclusion, enforced three independent ways.
- Zero-filling PRF outputs and signatures in `finally` blocks — but do it in *every* path, not
  inside the try body as `webauthn.ts` does (see §2).
- `extractable: false` on every CryptoKey.
- The ECDH relay shape for device linking.
- The human-readable, non-blind-signing derivation message.

**Do not take**

1. **SRP on plain SHA-256 next to Argon2id** — it makes the Argon2id cost irrelevant on server
   compromise. The most important single lesson from this repo — live only for legacy SRP accounts
   in this client (see §2), but fully live for those.
2. **No AAD.** Authenticate the envelope header from v1; retrofitting cannot protect old blobs.
3. **KDF parameters recorded but never read** — migration is impossible even though the field
   exists.
4. **No DEK layer** — the seed re-enters the heap on every credential change.
5. **Duplicated hardcoded KDF constants** in two places with no shared symbol.
6. **HKDF salt = the AES-GCM IV.**
7. **Static all-zero HKDF salt** in the ECDH relay.
8. **A PRF salt shared globally across all users and credentials.**
9. **Single-ceremony PRF with a known, untested un-unlockable-account risk** — they documented it
   and shipped anyway.
10. **Backup that is invisible at signup, armed only on the next login, and silently cancelled by
    device linking.** For a product where losing the phrase means losing funds, this is the
    highest-impact gap in the whole design — and it is a product decision, not a crypto one.
11. `argon2-browser`, unmaintained since 2021 — prefer `hash-wasm`.
12. Tokens in plain localStorage.
13. Mainnet-only derivation correctness — the signet coin type is wrong.
