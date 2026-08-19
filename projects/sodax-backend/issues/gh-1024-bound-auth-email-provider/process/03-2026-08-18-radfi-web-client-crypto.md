---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
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
