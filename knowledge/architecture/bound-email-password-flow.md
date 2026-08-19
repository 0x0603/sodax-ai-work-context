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

> **Read §Register as server capability, not as Bound's live client flow.** `radfi-be` implements
> SRP registration; the shipped `radfi-web` never sends it. §Login and §Sign *are* what the client
> does today.

## Register — server capability, not exercised by the shipped client

`POST /auth/register` is a discriminated union keyed on a **required** `authType: 'passkey' | 'srp'
| 'wallet'` (`register.dto.ts:108`, `auth.type.ts`). All three branches carry the same `wallets`
payload; only the credential half differs. The SRP branch is real and fully implemented server-side.

The client never takes it. Both of `radfi-web`'s two register call sites are `authType: PASSKEY`
(`AuthModal.tsx:743`) and `authType: WALLET` (`AuthModal.tsx:1274`); `authType: "srp"` is
constructed nowhere in product code; and step 1's `POST /auth/email-verification/request` has zero
callers at all. In the auth modal the password card renders only under `canLogin` — i.e. never in
REGISTER mode (`AuthModal.tsx:199`) — behind a "Legacy login options" disclosure reading *"Sign in
with your email and password."*

Nor can the client add a password to an existing passkey/wallet account. `ResetPasswordPanel` is a
**rotation**: it demands the current password and decrypts the existing blob
(`ResetPasswordPanel.tsx:153-156`), and `account/page.tsx:70` hides the password panel unless
`authType === SRP`. In `radfi-web`, SRP accounts can only be pre-existing; no shipped path creates
one. It is a server contract with no client behind it.

The walkthrough below is therefore **the model SODAX is building against**, not a trace of Bound's
live client:

```ts
// 1. Request an OTP
POST /auth/email-verification/request { email }
→ server probes the accounts collection first — 400 `account.emailTaken` if the address is
  registered, an account-enumeration leak (see [[bound-auth-mechanism]] §9)
→ cancels any prior pending row, then persists an `email_outbox` document keyed on the address:
  HMAC-SHA256'd OTP in `token`, PLAINTEXT OTP in `payload.otp` for the mail body, `status: PENDING`,
  `accountId: null` (auth.service.ts:413-437). Cleared on consume/cancel by `$set 'payload.otp': null`
→ the mail is queued, not sent here — nothing in radfi-be moves a row PENDING → SENT
→ no account and no keystore exist yet

// 2. Client computes everything — no server call yet
const mnemonic = createMnemonic()                    // 12 words = the wallet itself

const KEK      = argon2id(password)                  // the key that opens the wallet — NEVER sent
const verifier = srp.derive(email, password)          // proof of knowing the password — WILL be sent

const blob     = AES_encrypt(mnemonic, KEK)           // encrypted blob

const message  = String(Date.now())                   // one challenge, signed by all three chain keys
const wallets  = {                                    // proof of ownership, NOT bare addresses
  btc: { publicKey, address, message, signature },    // BTC is the only chain that sends an address
  evm: { publicKey, message, signature },
  sol: { publicKey, message, signature },
}

// 3. Send once
POST /auth/register {
  authType: 'srp', email, otp,
  srpData: { srpSalt, srpVerifier, encryptedBlob, passwordHint? },  // verifier and blob nest HERE
  wallets, referralCode?
}
→ server verifies all three ownership signatures before storing anything — BIP-322 for BTC, ECDSA
  recover-and-compare for EVM, ed25519 for SOL — rejecting with `wallet.signatureInvalid`, plus a
  ±10-minute freshness window on the timestamp (auth.service.ts:596-640)
→ server DERIVES the addresses it stores: EVM via `ethers.utils.computeAddress(publicKey)`, SOL uses
  the base58 public key as the address, BTC additionally gets a 2-of-2 multisig `tradingAddress`
  built from the user pubkey + a relayer pubkey (wallet.service.ts:158-177)
→ server stores: account + keystore { srpVerifier, srpSalt, encryptedBlob } + 3 wallet records
  holding public material only — no private key ever reaches the server
→ returns account info, NO token
```

(Three wallets is right for this flow; a 4th, auth-connected wallet exists only on `authType: wallet`.)

## Login

```ts
// 1. Ask for a challenge
POST /auth/srp/init { email }
→ { sessionId, salt, serverPublic }          // serverPublic = SRP's B

// 2. Client proves it knows the password
const proof = srp.prove(password, salt, serverPublic)   // yields clientPublic (A) + clientProof (M1)

POST /auth/srp/verify { sessionId, clientPublic, clientProof }
→ server compares the proof against the stored verifier
→ on match: { serverProof, accessToken, refreshToken, encryptedBlob, account, wallets }
  or, when 2FA is on: { serverProof, twoFactorRequired, pendingToken }

// 3. Client verifies the SERVER back — mutual auth, a step the KDF-split model gives up
srp.verifyServer(proof, serverProof)         // M2; AuthModal.tsx:485-488, srp.ts:141-155
→ a server that does not hold the verifier cannot produce M2

// 4. Client unlocks locally — server takes no part in this
const KEK      = argon2id(password)          // recomputed identically to registration
const mnemonic = AES_decrypt(encryptedBlob, KEK)
→ wrong password → decryption fails immediately, never yields garbage
→ correct → mnemonic is back → derive BTC/EVM/SOL keys
```

## Sign a transaction

There is no single shape — **who broadcasts depends on the derivation path**. For EVM and Solana
the signed transaction never reaches radfi-be at all.

### EVM (`m/44'/60'/0'/0/0`) and Solana (`m/44'/501'/0'/0'`) — the client signs *and* broadcasts

```ts
const privKey = derive(mnemonic, "m/44'/60'/0'/0/0")   // chain-specific key, from the mnemonic

// Bound is exposed to dapps as an in-page EIP-1193 wallet, announced over EIP-6963
// (bound-eip6963.ts:30) and wired into wagmi by bound-discovery-lifecycle.tsx
provider.request({ method: 'eth_sendTransaction', params: [rawTx] })
→ viem walletClient ECDSA-signs locally  // SIGNING — not hashing, not encryption
                                          // the private key never leaves the client
→ POSTs the signed tx to the chain's own RPC, http(rpcUrl)   // bound-eip1193-provider.ts:103-105
→ { txHash }
```

The which-first deposit takes the same shape via a raw sign — `account.signTransaction(...)` then
`rpcClient.sendRawTransaction(...)` straight at the plan's HyperEVM RPC (`useWfDeposit.ts:325,343`).
The BE relay that used to sit here, `POST /deposit/broadcast`, was removed in v4; radfi-be even
retired its error code 26024 with the note *"the FE broadcasts the deposit txs itself now"*
(`response.constant.ts:1036`). Solana is the same model —
`connection.sendRawTransaction(tx.serialize())` (`bound-solana-wallet.ts:163-165`).

### Bitcoin (`m/86'/0'/0'/0/0`) — the server co-signs and broadcasts

```ts
POST /api/transactions { ... }                       → { transactionId, psbt, userInputIndexes }
signPsbtInputs(psbt, btcPrivKey, userInputIndexes)   // client signs ONLY its own inputs
POST /api/transactions/sign { transactionId, signedPsbt, userAddress }
→ server validates the user's signatures, CO-SIGNS its own inputs, broadcasts via UMS
→ { txid, status: 'broadcast', explorerUrl }
```

The server here is a **co-signer, not just a verifier** — the BTC wallet is a 2-of-2 multisig with a
relayer key, so the server holds inputs of its own in the PSBT (`transaction.service.ts:2704-2716`:
`signTx(...)` before `umsService.broadcastTx(...)`). Same shape for referral claims, bound-lending,
refunds and rune-etch.

One exception, so the rule is not overstated: the EVM key does sign one payload that crosses the
wire — signed Hyperliquid action bundles POSTed to `/which-first/{betId}/execute`, which the BE
deep-verifies against the bundle it built and relays to HL (`whichFirst.ts:334-340`). That returns
order ids, not a txHash, and is an exchange action rather than a chain broadcast.

## What crosses the wire vs what never does

```
NEVER LEAVES THE CLIENT   │  CROSSES THE WIRE                        │  STORED BY THE SERVER
mnemonic                  │  srpSalt, srpVerifier, encryptedBlob     │  srpVerifier, srpSalt,
KEK (argon2id output)     │  otp                                     │  encryptedBlob
chain private keys        │  sessionId, clientPublic (A),            │  derived addresses +
password                  │    clientProof (M1), serverProof (M2)    │    public keys
                          │  per-chain publicKey + message +         │  sessions, tokens
                          │    ownership signature                   │
                          │  access / refresh tokens                 │
                          │  WebAuthn attestation / assertion        │
                          │  signed PSBTs (BTC), signed HL action    │
                          │    bundles — but NOT signed EVM/SOL      │
                          │    txs, which go straight to the RPC     │
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
