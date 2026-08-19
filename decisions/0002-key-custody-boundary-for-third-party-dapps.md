---
type: decision
scope: cross-repo
status: Proposed
tags: [auth, custody, key-management, sdk, third-party, iframe, passkey, rp-id, blast-radius]
date: 2026-08-19
updated: 2026-08-19
related_issues: [gh-1024-bound-auth-email-provider]
related_decisions: [0001-own-the-email-wallet-auth-plane]
related_knowledge: [encrypted-keystore-vs-mpc-email-wallets, bound-client-crypto]
---

# 0002 — Where the key lives when the SDK ships to third-party dapps

> **Status: Proposed.** Needs Fez. [[0001-own-the-email-wallet-auth-plane]] settled *build vs adopt*;
> this settles *where the key material executes*, which 0001 never addressed. Nothing has been built
> yet, so this is still free to decide — that stops being true the moment the first passkey exists.

## The question 0001 did not ask

0001 decided SODAX builds the encrypted-keystore auth plane in-house, with `radfi-be`/`radfi-web`
as the blueprint. Every plan file since assumed, without stating it, that the client crypto ships
as **npm packages that third-party dapps bundle into their own frontend**.

On 2026-08-19 the user asked the question that assumption never survived:

> *"nếu theo design này thì dapp sẽ nắm privateKey? … nhiều dapp sử dụng sodax-authen thì sẽ dùng
> chung 1 key? như vậy thì nguy hiểm vì nếu 1 dapp bị hack thì sẽ hack hết assets của dapp khác"*

And then confirmed the scope that makes it decisive:

> *"sodax auth có ship cho bên thứ 3 vì sodax sdk là thư viện mà các dapp sử dụng"*

## Context — what is actually true, verified from source

**There is no trust boundary between "the SDK" and "the dapp".** `@sodax/wallet-sdk-react` is a
plain npm package the dapp bundles at build time (`package.json:23-33`, `"main": "./dist/index.mjs"`,
`files: ["dist"]`; `apps/demo` consumes it via `workspace:*` through Vite). SDK code and dapp code
compile into one bundle, one origin, one JS realm. A repo-wide search for `iframe|Worker(|postMessage|
ShadowRealm|sandbox` across `wallet-sdk-react`, `wallet-sdk-core` and `sdk` returns exactly one hit,
an unrelated Stellar network-name enum. No isolation mechanism exists or is anticipated.

**Provider objects are handed to the dapp deliberately.** `useXWalletStore.ts:26-27` holds
`walletProviders`, and the public `useWalletProvider` hook returns those objects to arbitrary dapp
code. The store not being in the public barrel buys nothing — the value it guards is published
through the hook integrators are told to call.

**The only access control is `private`, which is erased at runtime.** Two concrete one-line
extractions:

```ts
// ICON — IconWalletProvider.ts:47 `private readonly wallet` wraps an icon-sdk-js Wallet,
// whose own .d.ts declares `getPrivateKey(): string`
(useWalletProvider({ xChainType: 'ICON' }) as any).wallet.wallet.getPrivateKey()

// Sui — SuiWalletProvider.ts:59 wraps an Ed25519Keypair, `getSecretKey(): string`
```

EVM is the best case and still not a boundary: viem holds the key in a closure, but
`provider.walletClient.account.signTransaction(...)` is reachable and unlimited signing is
equivalent authority to holding the key.

**The multi-chain fan-out is the part that makes it severe.** One mnemonic read reaches all nine
chain families — Bitcoin, EVM, Solana, Sui, Stellar, ICON, Injective, NEAR, Stacks — including
families the user never connected on the compromised dapp. And unlike a session, cookie, passkey or
password, **a leaked seed cannot be rotated.**

**Bound does not have this problem, and that is the whole point.** `radfi-web` is a single private
Next.js app (`"private": true`, no `exports`/`files`/`publishConfig`, no publish path). Its EIP-6963
provider is announced with `window.dispatchEvent` on Bound's *own* document; its only consumer is the
wagmi instance Bound itself bundles. No cross-origin surface exists anywhere. So Bound's raw key
never leaves Bound's own origin and own bundle, and its lack of per-origin scoping or per-signature
approval is defensible precisely because "any caller" means "code Bound already shipped".

**SODAX Auth would be the first thing to put a raw signing key inside a third-party dapp's bundle.**
Today every browser consumer in `sodax-sdks` runs extension mode — `wallet-sdk-react` contains zero
occurrences of `privateKey`; the raw-key path is used only by `apps/node` smoke scripts and unit
tests. This is the opposite of both Bound's model and the SDK's own production model.

## The delta versus MetaMask, stated precisely

The concern is *not* "a malicious dapp can drain you" — that is true of MetaMask too. The delta is
three separable things, and all three cut the same way:

| | Extension wallet | Bundled SDK |
| --- | --- | --- |
| Key location | separate process the page cannot address | the dapp's own heap |
| What a compromise yields | signature requests the user can refuse | **the mnemonic itself** |
| After the user leaves | capability ends | **permanent, offline** |
| Reach | what the user signed | **9 chain families, every dapp, unrotatable** |

**Exfiltration versus use**, and **permanent versus session-scoped**. That is the whole finding.

## What the industry does — there are exactly two answers

Verified against vendor documentation, plus this repo's own knowledge note:

1. **The key is unreachable by the integrator.** Cross-origin iframe, popup, TEE or enclave; the
   dapp gets an RPC channel plus a user-approval step. Privy injects the wallet provider into *its
   own* iframe, isolated from the dApp, communicating over iframe messaging, with the key split
   across a TEE enclave share and an encrypted auth share and never persisted whole. Turnkey keeps
   keys inside hardware enclaves that they never leave. Magic uses `auth.magic.link`; Coinbase Smart
   Wallet uses a `keys.coinbase.com` popup (a popup rather than an iframe, specifically to defeat
   clickjacking). Also Sequence, Para.
2. **The key is different per integrator.** `clientId` scoping: Web3Auth, Privy dedicated, Magic
   dedicated, Turnkey sub-orgs.

**Nobody ships unscoped keys inside third-party bundles.** The two properties are the same trade
made twice: either the integrator cannot reach the key, or the key differs per integrator. The
current SODAX design takes **neither** — which is why the risk feels novel. It is not novel; the
position is simply unoccupied.

MetaMask proves derivation is not what protects you: one address across every dapp, and it is fine,
because the key lives in a process the page cannot address *and* every signature needs approval in
UI the page cannot paint over.

## Our own note already contained the answer, and contradicted itself

[[encrypted-keystore-vs-mpc-email-wallets]]`:22-25` states that `clientId` scoping *"is what stops
any app that can authenticate you from deriving the key you use somewhere else"* and calls it
**"a security property, not a limitation"**. Then `:41-44`, `:59-60` and `0001:64-66` record the
**absence** of that same scoping purely as a win — portability, no lock-in — with the recorded cost
being only operational ("build an auth plane"). The security property asserted twenty lines earlier
is never subtracted.

Nothing in any plan file distinguishes first-party from third-party distribution. "Third-party"
appears only to mean a vendor dependency SODAX is removing, never an integrator SODAX would be
trusting. `plan-auth-api-security.md` is server-side only; its one hostile party is a hostile
server. The integrator is not modelled as a threat actor anywhere.

## Decision (proposed)

**Adopt option B — a cross-origin hosted signer on a SODAX-controlled origin — and sequence to it
via option E (first-party surfaces only) so v1 is not blocked.**

### Why B rather than the alternatives

| Option | Verdict |
| --- | --- |
| **A. Per-origin key derivation** | **Reject.** Destroys the single property 0001 chose this architecture to get (one portable address, importable into MetaMask). And it does not even work: if the master mnemonic is decrypted in the dapp's realm, the attacker takes the master and derives every other origin's subtree. Scoping has to be enforced at the keystore/credential layer, not the path layer. There is no BIP for per-relying-party *asset* accounts — the nearest convention, SLIP-0013/0016, derives per-URI keys for **login**, deliberately not for holding funds. |
| **C. In-page scoped signer** | **Reject as a security control**, adopt as hygiene. The dapp bundles the module and can patch it before it initialises. No embedded-wallet vendor claims in-page closure isolation as a boundary; the closest analogue, MetaMask Snaps, runs each snap in a separate SES/iframe realm precisely because shared-realm closures were judged insufficient. Still worth doing so a crash reporter or a logged provider object cannot serialise a secret. |
| **D. Transaction-level approval** | **Not an alternative — a component of B.** If the dapp renders the dialog, it can show "Swap 10 USDC" while submitting a max approval to an attacker. Only meaningful when the approval surface is outside the dapp's control, which requires B. |
| **F. Server co-signer / MPC policy engine** | **Reject.** Gives up blind custody outright, which is 0001's foundational claim. |
| **G. Session keys with smart accounts** | **Not the primary mechanism.** Strongest bound of any option — enforced by the chain, so it holds even if dapp, SDK, session and browser are all compromised — but account abstraction is EVM-only in practice and SODAX spans nine chain families. Revisit as an added layer for EVM later. |
| **E. First-party only** | **Correct for v1, not as the permanent answer**, because the user has confirmed third-party distribution is the point of the SDK. |

### What B preserves

B is a **code-delivery** boundary, not a custody change. All three properties 0001 bought survive:

- **one address everywhere** — the mnemonic is unchanged;
- **blind custody** — the server still stores only ciphertext; the KEK is still derived client-side
  from the passkey PRF or the password;
- **export and import** — the seed phrase still works in any other wallet.

### The argument that decides it

**B reduces the trusted surface rather than enlarging it.**

```
today's design:  trust N frontends of N dapps SODAX does not control
                 — each with its own supply chain, its own XSS exposure
with B:          trust exactly 1 origin SODAX does control
                 — strict CSP, SRI, versioning, build provenance all become available
```

The residual risk under the current design is not "a malicious partner" — SODAX would allowlist
partners it trusts. It is **one XSS, or one compromised npm dependency, in any allowlisted
integrator's frontend, at any moment while a user is unlocked**, producing irrevocable cross-chain,
cross-dapp loss. This org already treats that class as live: see
`projects/sodax-frontend/issues/task-web2-supply-chain-audit/`.

### What B does not solve — state this plainly

A compromised dapp can still request signatures while the user is connected, and the user may
approve. That is the same as MetaMask. What B removes is **exfiltration**: no mnemonic leaves the
signer origin, no capability outlives the session, and nothing reaches chains the user never used.

## The irreversible part: RP ID *is* the custody boundary

The sharpest finding, and the reason this cannot be deferred.

The keystore KEK is HKDF over the WebAuthn PRF output ([[bound-client-crypto]] §1-2), and passkeys
are **RP-ID scoped, enforced by the browser**. So:

```
rp.id = sodax.com          → the unlock ceremony can ONLY execute in a *.sodax.com context
                             → option B, arrived at by the platform rather than by preference

rp.id = <integrator>       → per-dapp wallets, i.e. option A at the credential layer
```

**There is no third setting.** And it is welded to an item `plan.md` already lists as irreversible:
*"RP ID for passkeys — changing it invalidates every credential."*

Setting `rp.id = sodax.com` now **costs nothing and forecloses nothing** — it is required by B and
compatible with shipping first-party first. Setting it to integrator domains closes B permanently.

## Consequences

**Repackage by trust boundary, not by dependency weight.** `plan-sdk-integration.md`'s three-way
split was cut so `sodax-backend` would not have to install nine chain SDKs. That goal survives; the
boundary changes:

| Package | Contents | Runs where |
| --- | --- | --- |
| `keystore-crypto` | mnemonic, envelope, KDF, the 9 derivations | **deployed only to the SODAX signer origin** (backend still installs it for envelope validation and test fixtures) |
| `wallet-auth-client` | postMessage/popup transport + an EIP-1193-shaped adapter. **Zero crypto, zero key material** | the dapp's bundle |
| `wallet-auth-react` | hooks over that transport | the dapp's bundle |

**New operational commitment.** SODAX must run a versioned static origin with strict CSP at
wallet-grade uptime. If it is down, every integrator is down. This is a standing obligation, not a
deploy.

**The approval UI is harder than it looks.** Truthful decoding across nine chain families —
ERC-20/permit/4626 calldata, Solana instruction sets, Sui PTBs, Bitcoin PSBTs — is the real cost, not
the dialog. An honest v1 may show raw details for some non-EVM chains and say so.

**Per-signature confirmation must live on the SODAX side.** Bound has a version
(`bound-signing-confirmation.ts`) but it is an opt-in wrapper an integrator can decline — safe in a
first-party app, unsafe in a library.

**Keep the origin allowlist fail-closed.** `plan-auth-api-security.md` notes that
`sponsoring-api`'s allowlist treats empty patterns as UNRESTRICTED; `auth-api` must not inherit that
default.

**One plan line must change.** `plan-auth-api-security.md:339-342` currently files the modal
topology as *"a product/deployment decision, not a source question."* It is neither: it is the
custody boundary, and it must be decided together with the RP ID.

## Sequencing

1. **Now, before any code:** decide `rp.id = sodax.com`. Free, reversible-proof, and it keeps B
   available.
2. **v1:** ship first-party only — `apps/demo`, `apps/wallet-modal-example`, SODAX's own surfaces.
   Cheapest option available, and nothing is built yet, so it costs nothing to adopt.
3. **Before any third-party integration:** build the hosted signer origin and the transport
   packages. Do not open the connector to external dapps until it exists.
4. **Later, EVM only:** consider option G session keys as an added on-chain bound.

## Open questions for Fez

1. **Is the hosted-signer origin acceptable as a standing operational commitment?** It is the cost
   of third-party distribution; declining it means declining third-party distribution.
2. **Iframe or popup?** Coinbase chose a popup specifically against clickjacking; Privy and Magic
   use iframes. Popup has a visible URL bar, which is a real anti-phishing property, at a UX cost.
3. **Which domain?** `rp.id` must be chosen with the eventual signer origin in mind, and it is
   permanent per credential.
4. **Does v1 first-party-only conflict with a commitment already made to a partner?** If a partner
   integration is already promised on the current timeline, that constraint outranks this sequencing
   and should be surfaced now rather than discovered later.

## Related

- Decisions: [[0001-own-the-email-wallet-auth-plane]] — build vs adopt; this ADR does not reverse it
- Knowledge: [[encrypted-keystore-vs-mpc-email-wallets]] (contains the contradiction corrected here),
  [[bound-client-crypto]], [[bound-auth-mechanism]]
- Issue: `gh-1024-bound-auth-email-provider`
