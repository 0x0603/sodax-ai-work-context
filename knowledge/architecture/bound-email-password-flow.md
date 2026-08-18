---
type: knowledge
area: architecture
status: Active
tags: [auth, bound-auth, radfi-be, radfi-web, keystore, srp, argon2, hash, encryption, signing, email-login]
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# Bound's email + password flow, simplified

A quick-reference walkthrough of register → login → sign, in simplified pseudocode, with the
crypto operation type labeled at each step. For the full detail with real code and file:line
citations, see [[bound-auth-mechanism]] (server) and [[bound-client-crypto]] (client).

## Register

```ts
// 1. Request an OTP
POST /auth/email-verification/request { email }
→ server generates an OTP, emails it, stores nothing about the user yet

// 2. Client computes everything — no server call yet
const mnemonic = createMnemonic()                    // 12 words = the wallet itself

const KEK      = argon2id(password)                  // the key that opens the wallet — NEVER sent
const verifier = srp.derive(email, password)          // proof of knowing the password — WILL be sent

const blob     = AES_encrypt(mnemonic, KEK)           // encrypted blob

// 3. Send once
POST /auth/register { email, otp, verifier, blob, walletAddresses }
→ server stores: account + keystore { verifier, blob } + 3 wallets (public addresses only)
→ returns account info, NO token
```

## Login

```ts
// 1. Ask for a challenge
POST /auth/srp/init { email }
→ { salt, serverChallenge }

// 2. Client proves it knows the password
const proof = srp.prove(password, salt, serverChallenge)

POST /auth/srp/verify { proof }
→ server compares proof against the stored verifier
→ on match: { accessToken, blob }

// 3. Client unlocks locally — server takes no part in this
const KEK      = argon2id(password)          // recomputed identically to registration
const mnemonic = AES_decrypt(blob, KEK)
→ wrong password → decryption fails immediately, never yields garbage
→ correct → mnemonic is back → derive BTC/EVM/SOL keys
```

## Sign a transaction

```ts
const privKey = derive(mnemonic, "m/44'/60'/0'/0/0")   // chain-specific key, from the mnemonic

const rawTx    = { to, amount, data, nonce, ... }        // built by the server or the dapp

const signedTx = ECDSA_sign(rawTx, privKey)              // SIGNING — not hashing, not encryption
                 // the private key never leaves the client

POST somewhere { signedTx }
→ server verifies the signature, broadcasts to the chain
→ { txHash }
```

## What crosses the wire vs what never does

```
CLIENT                                          │  WIRE                    │  SERVER
mnemonic, KEK, private keys, password           │  verifier, blob,         │  verifier, blob,
                                                 │  proof, signedTx,        │  addresses, sessions
                                                 │  addresses               │
```

Everything that crosses is harmless on its own. The three secrets — password, KEK, mnemonic —
never leave the browser.

## The operation types — do not conflate them

| Operation | Where it appears | Reversible? | Purpose |
|---|---|---|---|
| **HASH** (one-way) | `verifier` (SRP) | No — not even with the correct password; it only supports comparison | prove/disprove a match |
| **ENCRYPT** (two-way) | `blob` (AES-GCM) | Yes — with the correct KEK | store and later recover the mnemonic |
| **DERIVE** (one-way, deterministic) | `KEK`, chain private keys | No | turn one secret into another, reproducibly |
| **SIGN** (asymmetric) | `signedTx` | Anyone can verify with the public key; nobody can forge it without the private key | prove ownership, authorize an on-chain action |

The easiest confusion: `argon2id(password, salt)` looks like a hash, but its **purpose** differs
from `verifier`. It is not used for comparison — it is used to *produce a key* (the KEK) that
feeds a two-way cipher (AES). The derivation step itself is one-way (you cannot recover the
password from the KEK), but what it produces is then used to open something reversible.

## Why two different mechanisms for one password

The two needs are opposite:

- `verifier` only ever needs a yes/no answer, never the original password back → a one-way hash
  is sufficient, and safer: a server breach yields nothing usable.
- `blob` needs the *original* mnemonic back, every login → this requires reversible encryption,
  because the mnemonic is live data that must be reused, not just checked.

Using a one-way hash for the mnemonic would make it permanently unrecoverable. Using reversible
encryption for the password would require the server to hold something that could, in principle,
be turned back into the password — weaker than a hash.

## The flaw worth remembering

`verifier` is derived straight from the plaintext password with **no Argon2id in between**
(`secure-remote-password`'s SRP-6a runs on plain SHA-256). `KEK` runs the same plaintext password
through 64 MiB / t=3 Argon2id. A server compromise attacks the cheap side — SRP at roughly one
SHA-256 per guess — and the expensive Argon2id protecting the blob is bypassed entirely once the
password is recovered that way. Full detail: [[bound-client-crypto]] §2.
