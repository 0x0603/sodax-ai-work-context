---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-19
updated: 2026-08-19
---

# 2026-08-19 (later) — "does the dapp hold the key?" — the question that moved the architecture

This one came from the user, not from an audit, and it is the most consequential
finding of the whole thread:

> *"nếu theo design này thì dapp sẽ nắm privateKey? … nhiều dapp sử dụng
> sodax-authen thì sẽ dùng chung 1 key? như vậy thì nguy hiểm vì nếu 1 dapp bị
> hack thì sẽ hack hết assets của dapp khác"*

Then, decisively:

> *"sodax auth có ship cho bên thứ 3 vì sodax sdk là thư viện mà các dapp sử dụng"*

Written up as [[0002-key-custody-boundary-for-third-party-dapps]] (status
**Proposed** — needs Fez). Only what is not in the ADR is logged here.

## The plan had an unstated assumption, and it does not survive examination

Every plan file since [[0001-own-the-email-wallet-auth-plane]] assumed the client
crypto ships as npm packages third-party dapps bundle. **That assumption was never
written down, so it was never reviewed.** Verified from source: there is no trust
boundary in that model — SDK and dapp compile into one bundle, one origin, one JS
realm; the public `useWalletProvider` hook hands the provider object to dapp code
deliberately; and the only access control is TypeScript `private`, erased at
runtime. ICON and Sui are each a single property access from the raw secret, via
their underlying libraries' own public `getPrivateKey()` / `getSecretKey()`. A
repo-wide search for any isolation primitive (iframe, Worker, postMessage,
ShadowRealm, sandbox) across the three packages returns one unrelated Stellar enum.

The severity multiplier nobody had priced: **one mnemonic read reaches all nine
chain families**, including ones the user never connected on the compromised dapp,
and a seed cannot be rotated.

## Our own knowledge note contained the refutation and the endorsement, twenty lines apart

[[encrypted-keystore-vs-mpc-email-wallets]] argues that MPC's `clientId` scoping
*"is what stops any app that can authenticate you from deriving the key you use
somewhere else"* and calls it **"a security property, not a limitation"** — then
records the absence of that same scoping in our design purely as a win, pricing
the cost as operational only. The security property was asserted and then never
subtracted. Corrected in place; the portability claim survives untouched, because
it is a property of the mnemonic, not of where the crypto executes.

Also absent everywhere: any distinction between **first-party** and **third-party**
distribution. "Third-party" appears in these files only to mean a vendor dependency
SODAX is removing, never an integrator SODAX would be trusting.
`plan-auth-api-security.md` models exactly one hostile party — a hostile server.
The integrator is not a threat actor anywhere in the plan.

## The adversarial pass corrected my own first instinct

I initially suggested per-origin key derivation. Two independent agents killed it,
and both reasons are worth keeping:

1. It destroys the single property ADR 0001 chose this architecture to obtain
   (one portable address, importable into any wallet).
2. **It does not even work.** If the master mnemonic is decrypted in the dapp's
   realm, the attacker takes the master and derives every other origin's subtree.
   Scoping must be enforced at the keystore/credential layer, not the path layer.

There is also no BIP for per-relying-party *asset* accounts — the nearest
convention, SLIP-0013/0016, derives per-URI keys for **login**, deliberately not
for holding funds, because per-site funded accounts fragment balances.

## The finding that makes this undeferrable

**RP ID is the custody boundary.** The KEK is HKDF over the WebAuthn PRF output,
and passkeys are RP-ID scoped with browser enforcement. `rp.id = sodax.com` means
the unlock ceremony can only execute in a `*.sodax.com` context — the hosted-signer
architecture, arrived at by the platform rather than by preference. An
integrator-domain RP ID means per-dapp wallets. **There is no third setting**, and
`plan.md` already lists the RP ID as irreversible.

Setting it to `sodax.com` now costs nothing and forecloses nothing. Getting it
wrong cannot be undone without re-enrolling every user.

## Industry check — the position we occupy is empty, not novel

Two shapes exist and every vendor picks one: the integrator **cannot reach** the
key (Privy injects its provider into its own iframe isolated from the dApp, with
TEE + share-splitting; Turnkey keeps keys in hardware enclaves; Magic, Coinbase
Smart Wallet, Sequence, Para), **or** the key **differs per integrator** (Web3Auth,
Privy dedicated, Magic dedicated, Turnkey sub-orgs). Nobody ships unscoped keys
inside third-party bundles. The current design takes neither.

MetaMask is the proof that derivation is not the protection: one address across
every dapp and it is fine, because the key lives in a process the page cannot
address *and* every signature needs approval in UI the page cannot paint over.

## Steelman — what the concern does NOT justify

Run deliberately, and it changed the recommendation:

- *"Same mnemonic across dapps"* is **not** itself the defect. That is how every
  self-custodial wallet works, and the plan already ships key export and seed
  backup. Shared identity is not shared authority. Do not fund per-dapp derivation.
- *"Open public distribution"* overstates it: `auth-api`'s cross-origin branch
  already mandates an exact-string origin allowlist, so an un-allowlisted installer
  cannot complete a login. That is a real operator-controlled integrator gate,
  arriving for free.
- The residual risk, named precisely: **not a malicious partner** — SODAX
  allowlists partners it trusts — but **one XSS or one compromised npm dependency
  in any allowlisted integrator's frontend, while a user is unlocked**. This org
  already treats that class as live (`projects/sodax-frontend/issues/task-web2-supply-chain-audit/`).

Conclusion carried into the ADR: **fix the signing boundary, not the derivation
path.**

## Changes During Work

Scope did not change, but a load-bearing assumption did, and it blocks the SDK
packages. `plan-sdk-integration.md`'s three-package split is now marked
**superseded in shape, not in purpose** — the dependency-weight goal survives, the
layout is re-cut by trust boundary. `plan.md` gained risk 5 and open question 15;
`plan-auth-api-security.md`'s modal-topology bullet, which filed this as *"a
product/deployment decision, not a source question"*, is corrected in place.

**Do not create the three SDK packages until ADR 0002 is decided.**
