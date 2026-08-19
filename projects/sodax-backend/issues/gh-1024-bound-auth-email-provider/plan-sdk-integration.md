---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-18
parent: plan.md
related: [plan-engineering-standards.md, plan-auth-api-security.md, plan-auth-api-scaffold.md]
related_issues: [gh-1069-email-provider-wallet-connectivity]
tags: [sdk, sodax-sdks, wallet-sdk-react, wallet-sdk-core, apps-demo, keystore-crypto]
---

# SDK integration — how `sodax-sdks` and `apps/demo` offer SODAX Auth

Detail behind `plan.md`'s Phase 3 pointer. Covers `sodax-sdks` (3 new
packages + 2 small changes to existing `wallet-sdk-react`), `sodax-backend`'s
reuse of the shared crypto package, and demo wiring. Cross-cutting engineering
rules referenced below (S1–S9) live in [[plan-engineering-standards]];
`auth-api`'s security/rate-limiting hardening lives in
[[plan-auth-api-security]] — this file is the SDK/architecture half only.

## Phase 3 — SDK integration (this session, 2026-08-18)

Phase 2 above covers the backend build. This phase covers how `sodax-sdks`
(specifically `wallet-sdk-react`) and `apps/demo` understand and offer SODAX
Auth as a login option, and how `sodax-backend` reuses the client-crypto logic
instead of re-implementing it. Full design done directly against live source
of both repos (on disk under `sodax/`), plus fresh operational input from the
Bound team (Slack) — see below. Full execution-ready plan, phased with file
layouts, definitions of done, and a verification section, written to
`/Users/sangnguyen/.claude/plans/https-github-com-icon-project-sodax-back-sharded-eclipse.md`
and reproduced in full here so it survives independent of the local plan-file
path.

### Two SDK-architecture facts found this session that change the naive design

1. `SodaxWalletConfig.<CHAIN>.connectors` **replaces** the registry's default
   connectors for that chain slot — does not merge
   (`wallet-sdk-react/docs/CONNECTORS.md:216`, verified verbatim: *"The
   `connectors` field on a chain-type slot **replaces** the registry defaults
   for that chain. Include the SDK's defaults in the array if you want them
   alongside your custom one."*). A helper that auto-injects a SODAX Auth
   connector into an existing config must not silently delete the user's
   other wallet options — needs a new `wallet-sdk-react` export exposing the
   computed defaults per chain (none exists today; `chainRegistry.ts` is not
   in the package's public barrel).
2. EVM/Solana/Sui (`providerManaged: true` in `chainRegistry.ts:168-185`,
   `defaultConnectors: () => []`) do **not** go through `IXConnector`/
   `chainRegistry.createWalletProvider` at all — driven entirely by native
   hooks: wagmi (`EvmHydrator.tsx`), `@solana/wallet-adapter-react`
   (`SolanaHydrator.tsx:2`), `@mysten/dapp-kit` (`SuiHydrator.tsx:2`; pinned
   `0.14.18` in the `pnpm-workspace.yaml` catalog — note there is no
   `-react`-suffixed Sui package). A connector-based SODAX Auth design only
   works out of the box for the other 6 chain families (Bitcoin, ICON,
   Injective, Stellar, NEAR, Stacks). Even those 6 need per-chain
   `createWalletProvider` work in `chainRegistry.ts` — but the change is
   **not uniform**, and the Bitcoin pattern does not generalise:
   - **2 of 6 resolve the provider from the connector** and can be taught to
     also accept `SodaxAuthXConnector` by adding a branch to an existing
     brand-specific check: Bitcoin (`chainRegistry.ts:226-233` —
     `if (!(connector instanceof BitcoinXConnector)) return undefined;` then
     `return connector.recreateWalletProvider(...)`) and Stacks (`:380-391` —
     `connector instanceof StacksXConnector ? connector.getProvider() : undefined`).
   - **4 of 6 never inspect the connector in `createWalletProvider` at all** —
     they build the provider from the chain's native *service* singleton, or
     from a store address: Injective `:262-268` (`service.msgBroadcaster`),
     Stellar `:308-319` (`service.walletsKit`), NEAR `:367-373`
     (`service.walletSelector`), ICON `:329-343` (discards the service
     entirely — `(_service, getStore)` — and reads
     `store.xConnections.ICON?.xAccount.address`). These four do resolve a
     connector elsewhere, in `createDefaultActions` (`:146-153`), but for
     connect/disconnect only.

   So for those four, step 3b below is not "add an alternative `instanceof`
   branch" but "introduce a connector-sourced provider path that does not
   exist today" — there is nothing to extend: `rg 'getProvider|recreateWalletProvider'`
   over `src/xchains/` hits only `bitcoin/` and `stacks/`, and the base
   `core/XConnector` class declares only `connect()`/`disconnect()`, no
   provider accessor. Budget step 3b as a materially larger change on 4 of the
   6 chains. Leaving them untouched is **not** fail-safe: they would silently
   return a provider wired to the native wallet service, which cannot sign for
   a SODAX-auth-managed key.

**Scope decision**: v1 ships on the 6 non-provider-managed chains.
EVM/Solana/Sui support is an explicit fast-follow needing real
`wallet-sdk-react` core changes (wagmi `createConnector()` / Wallet-Standard
`registerWallet()` bridges) — do not advertise "all 9 chains" until built.

### Bound-team operational input (Slack, this session) — implement, not just note

**A. AAGUID whitelist for passkey authenticators.** Not every password
manager reliably retrieves a passkey it created — real Windows failures
reported by Bound. Bound's live whitelist (verbatim from their `settings`
collection): only Apple iCloud Keychain
(`fbfc3007-154e-4ecc-8c0b-6e020557d7bd`) and Google Password Manager
(`ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4`) are approved, gated by a
`disabledPasskeyWhitelist` kill switch, `maxPasskeysPerAccount` also in that
same config doc. This is public/non-secret logic (parse an AAGUID from an
attestation object, match a list) — put it in the shared crypto package so
backend (authoritative) and SDK (client pre-check) use one function, zero
drift.

**B. Post-registration local PRF re-verification.** Vincent Vo (Bound),
translated: *"There are still unpredictable Windows cases. I made it verify
once right after registration — if it fails, it errors out right there,
before any funds go in."* Confirms a risk already in
[[bound-client-crypto]]: create-time and assertion-time PRF output can
differ, silently producing a permanently-unlockable account. Bound built a
two-prompt verification once and **reverted it** because the server challenge
(TTL 2 min, `radfi-be auth.service.ts:404`) expired mid-flow.

Being local-only is necessary but is **not** the differentiator: Bound's
reverted verify already used a client-generated local challenge with no server
round trip (`radfi-web src/auth/passkey-prf-roundtrip-changes.md:17`). What
actually broke them was the elapsed wall-clock time of a second user-paced
biometric prompt sitting **inside the outer registration window** —
`AuthModal.tsx:714` fetches the challenge, `:719` prompts via
`registerPasskey()`, and `:742` must still submit the attestation to
`register()` before that 2-minute expiry.

So the property that actually prevents recurrence is a **challenge boundary**:
keep the extra prompt out of the interval between our registration-challenge
issuance and our attestation-verifying `register()` call. Options:

- (a) Issue the registration challenge only *after* the local PRF
  re-verification. Impossible in the naive form — re-verification needs a
  credential that `create()` can only mint under an already-issued challenge;
  it only works as (c).
- (b) Control our own `auth-api` challenge TTL so two user-paced prompts fit
  comfortably (Bound's is 2 min; budget ~180s). Depends on
  `@better-auth/passkey`'s challenge model, which this plan already flags as
  **unverified** (see [[plan-auth-api-security]]'s callout).
- (c) **Preferred** — allow post-register blob replacement so
  verify-after-register is recoverable. Phase 6 already splits `keystore`
  (blob upload/get) from `passkey-registration`, so unlike Bound we can
  register the passkey under a fresh single-prompt challenge, run the local
  PRF re-verification (a `navigator.credentials.get()` with a client-generated,
  never-sent challenge, comparing PRF output byte-for-byte) entirely outside
  any challenge window, and only then upload the blob encrypted under the
  assertion-time PRF. Bound was blocked from this route:
  `DELETE /keystore/passkey/:id` refuses the last passkey (`17010
  cannotRemoveLastPasskey`, `keystore.service.ts:542`) and a fresh account has
  exactly one.

Gate the blob upload on this re-verification passing.

### Package/dependency map (target state)

```
sodax-sdks/packages/
  wallet-sdk-core    (existing)
  wallet-sdk-react   (existing — 2 small additive changes needed, see below)
  keystore-crypto    (NEW — isomorphic Node+browser, zero internal deps.
                      The ONLY one sodax-backend also installs.)
  wallet-auth-core   (NEW — deps: keystore-crypto, wallet-sdk-core, types.
                      Better Auth HTTP client + mnemonic->WalletProvider
                      factory. NOT installed by backend.)
  wallet-auth-react  (NEW — deps: wallet-auth-core, wallet-sdk-react, types.
                      SodaxAuthXConnector, login modal, session hooks.)

sodax-backend/apps/
  auth-api           (NEW. Depends on @sodax/keystore-crypto as a real
                      dependency for AAGUID enforcement, and again as a
                      devDependency in its e2e harness to simulate a real
                      client — never wallet-auth-core/react.)
```

> **⚠ Superseded in shape, not in purpose — see
> [[0002-key-custody-boundary-for-third-party-dapps]] (2026-08-19).** The split below is cut by
> **dependency weight** (keeping nine chain SDKs out of the backend's install). That goal survives,
> but the layout above assumes the client crypto executes **inside the integrating dapp's own
> bundle** — an assumption never written down and, once examined, not defensible for a library
> shipped to third parties: the dapp then holds the user's mnemonic, identically across every
> integrator, unrotatable, across all nine chain families. ADR 0002 proposes re-cutting the same
> three packages by **trust boundary** instead:
>
> | Package | Contents | Runs where |
> | --- | --- | --- |
> | `keystore-crypto` | mnemonic, envelope, KDF, the 9 derivations | **deployed only to the SODAX signer origin** — backend still installs it for envelope validation and test fixtures |
> | `wallet-auth-client` (replaces `wallet-auth-core`) | postMessage/popup transport + EIP-1193-shaped adapter. **Zero crypto, zero key material** | the dapp's bundle |
> | `wallet-auth-react` | hooks over that transport | the dapp's bundle |
>
> Everything below about chain dispatch, the 9-chain provider contract, and demo wiring stays
> valid — it just moves behind the transport. Read the rest of this file with that boundary in
> mind, and do not create the packages until 0002 is decided.

**Why this 3-way split, not fewer packages**: the explicit requirement this
session was that `sodax-backend` (a separate repo) must be able to
`pnpm add` the exact same crypto logic used by the browser client — confirmed
low-friction since `sodax-backend` already consumes `@sodax/sdk`/`@sodax/types`
as plain npm deps across 7 apps today. If crypto were bundled inside
`wallet-auth-core` (which needs `wallet-sdk-core`'s 9 chain SDKs), backend
would have to install browser-wallet dependencies for no server reason —
hence `keystore-crypto` must be its own zero-`wallet-sdk-core`-dependency
package. Concretely, what backend reuses (never decrypts anything — blind
custodian is non-negotiable): envelope schema/structural validation on write,
address-from-pubkey math for the (out-of-v1, pre-declared) wallet-auth
method, the AAGUID whitelist matcher, and — highest value — the same package
as a devDependency to simulate a real client in its own e2e/regression suite
instead of re-implementing the crypto a second time in test fixtures (exactly
the kind of docs-vs-code drift that caused several of Bound's real bugs).
Isomorphic requirement rules out native Node `argon2` bindings — must use a
WASM-based argon2id (e.g. `hash-wasm`) so backend's Node test harness and the
real browser client behave byte-identically.

### Phased build order

0. **Persist this plan (done — you're reading it).**
1. **`keystore-crypto`** — mnemonic (BIP-39), versioned AEAD envelope (AES-256-GCM
   with the canonical header as AAD — unlike Bound, which has no AAD and never
   reads its own recorded `argon2Params`), KDF (`derivePasswordKeys` — one
   argon2id call, HKDF-Expand split into `authHash`/`kek` under distinct info
   labels — Bound's real bug was an expensive KEK path next to a cheap
   SHA-256 SRP-verifier path from the same password, so a server compromise
   bypassed the expensive side entirely; do not repeat), two-layer DEK
   wrapping (DEK encrypts mnemonic once, wrapped per unlock method — Bound has
   no DEK layer, so change-password/add-passkey decrypt to a plaintext JS
   string and re-encrypt everything), per-chain derivation-path table (9
   chains, test vectors mandatory — this is the whole reproducibility
   contract), AAGUID whitelist matcher (Bound-fix A), and a **browser-only**
   `webauthn` subpath (separate tsup entry + `exports` key, with a runtime
   `typeof navigator === 'undefined'` guard) holding PRF ceremony code
   including Bound-fix B's local re-verification. Must land and stabilize
   (test vectors green) before backend's `auth-api` leans on it as a
   devDependency.
   - Open technical decision, recommended but not forced: for Sui and
     Injective, pass the decrypted mnemonic straight through to
     `wallet-sdk-core`'s existing `SuiWalletProvider`/`InjectiveWalletProvider`
     (both confirmed to call `deriveKeypair`/`fromMnemonic` with **no explicit
     path argument** — `SuiWalletProvider.ts:67`, `InjectiveWalletProvider.ts:107-108`
     — silently using library defaults `m/44'/784'/0'/0'/0'` and
     `m/44'/60'/0'/0/0` respectively; the vendored Injective `.d.ts` comment
     claiming default `494` is stale, trust the runtime constant `60`) rather
     than deriving+pinning a raw key ourselves — less code, same address a
     user gets importing the mnemonic anywhere else with these libraries.
2. **`wallet-sdk-core` provider-factory table lives in `wallet-auth-core`, not
   here** — `wallet-auth-core`: Better Auth HTTP client (email OTP, passkey via
   `@better-auth/passkey` client plugin — **API surface unverified this
   session**, see [[plan-auth-api-security]]'s callout — password via
   `emailAndPassword` using `authHash` as the literal password, session/JWT)
   + an exhaustive discriminated-union `createWalletProvider(mnemonic |
   privateKey, chainType)` dispatcher (compile-time `never` exhaustiveness
   check, not a runtime throw). The exact, verbatim config type for each of
   the 9 chains — not paraphrased — is now pinned down in
   "Exact wallet-provider type signatures" below; the dispatcher's job is to
   go from a decrypted mnemonic/derived key to exactly one of those 9 literal
   union members, with no `any`/unsafe cast anywhere in between (S1).
3. **Two small additive changes to existing `wallet-sdk-react`** (owned by
   that package, small reviewed PR): (a) a new public export, e.g.
   `getDefaultConnectors(chainType, walletConfig?)`, so a config helper can
   inject a SODAX Auth connector without wiping a chain's other connectors;
   (b) give the 6 in-scope chains' `createWalletProvider` callbacks in
   `chainRegistry.ts` a `SodaxAuthXConnector` path — an extra `instanceof`
   branch for Bitcoin and Stacks, but a **new** connector-sourced provider path
   for Injective, Stellar, NEAR and ICON, which never look at a connector there
   today (fact 2 above). Those four are the bulk of this step's cost; "small
   additive" describes 3a and the Bitcoin/Stacks half only.
4. **`wallet-auth-react`** — `SodaxAuthXConnector` (implements `IXConnector`,
   scoped to the 6 chains; `connect()` opens the shared login modal only if no
   session is active, otherwise derives immediately with no re-prompt;
   `disconnect()` clears only that chain's key, not the session),
   `withSodaxAuth(config)` (merge helper depending on step 3a),
   `SodaxAuthProvider` (root-mounted, owns the modal so it overlays regardless
   of which chain triggered connect), and the login modal state machine:
   `closed -> emailEntry -> methodSelect (passkey and password both offered,
   do not assume exactly one method is ever attached to an account — see open
   question below) -> {passkeyCeremony | passwordEntry} -> (converge) fetch
   encryptedBlob -> decrypt -> deriving(chain) -> connected`. Registration is
   separate, and its ordering is load-bearing (challenge boundary, see B
   above): email+OTP -> choose method(s) -> generate mnemonic -> (passkey path)
   `create()` + `register()` under a fresh single-prompt challenge -> local PRF
   re-verification, a second prompt **outside any challenge window** -> only
   then encrypt+upload the blob.
   Deliberate, tested behavior: on reload, session shows "logged in" (address
   known, persisted like any connector) but signing requires re-running the
   unlock ceremony — the mnemonic is never persisted, matching
   `useXWalletStore`'s existing persistence boundary.
5. **Publish mechanics** — touches `.changeset/config.json`'s fixed group,
   `.github/workflows/sdks-publish.yml`'s twice-hardcoded `PACKAGES=(...)`
   array, three new per-package publish workflows, `RELEASE_INSTRUCTIONS.md`,
   root `AGENTS.md` nav + dependency-direction tables — confirmed real,
   multi-file mechanical cost, not hand-waved.
6. **`sodax-backend/apps/auth-api`** — scaffold from `apps/bridge-api`
   (newest greenfield app template, but note it lives on the **unmerged**
   `origin/feat/bridge-api` branch, tip `c0d86fea` — not on `development`;
   `origin/development` has meanwhile grown an `apps/api-auth` that may
   supersede this template choice — check before scaffolding), Better Auth
   wiring copied from
   `apps/stateful-api/src/auth/*` (confirmed running today at `1.4.18`, needs
   bump to `1.6+` for `@better-auth/passkey`), own `wauth_*` Mongo prefix.
   `keystore` (blob upload/get, envelope validated structurally via
   `keystore-crypto`, never decrypted), `passkey-registration` (wraps
   `@better-auth/passkey`, adds the AAGUID check before success),
   `settings` (serves the runtime AAGUID whitelist, same shape as Bound's
   example doc).
7. **Demo wiring** — `apps/wallet-modal-example` first (exists specifically to
   prove the wallet layer standalone, no pre-existing business-logic to
   conflict with), `apps/demo` second. Confirmed both apps' existing
   wallet-connect UIs (`apps/demo/src/components/shared/wallet-modal/wallet-item.tsx:30-49`
   and `wallet-modal-example`'s `WalletList.tsx`) already iterate
   `useXConnectors({xChainType})` generically, so a registered
   `SodaxAuthXConnector` appears automatically in both with zero UI-component
   changes. Only: edit `apps/demo/src/providers.tsx` (documented as "the
   canonical stack to copy when integrating") to wrap `walletConfig` with
   `withSodaxAuth()` and mount `<SodaxAuthProvider>`; add
   `VITE_SODAX_AUTH_API_URL` following the existing optional/public-fallback
   env convention; a connector icon in `packages/assets`. `apps/demo/AGENTS.md:109`
   is explicit — *"**Don't add business logic here.** This app demos the SDK;
   real wallet/registration/ToS flows belong in partner apps, not in `demo/`"*
   — which covers an auth/registration flow squarely: only import what
   `wallet-auth-react` exports, same discipline
   already followed for the RadFi/Bound-Exchange Bitcoin session
   (`useRadfiAuth`/`useRadfiSession` live in `dapp-kit`, not in `demo/`).

### Exact wallet-provider type signatures (verified this session) — the `wallet-auth-core` dispatcher contract

Read verbatim from `packages/wallet-sdk-core/src/wallet-providers/*/types.ts`
and `packages/types/src/*/*.ts` (every `I<Chain>WalletProvider` extends
`ICoreWallet extends WalletAddressProvider` — `packages/types/src/wallet/wallet.ts:4-9`).
This is the exact literal-type contract `createWalletProvider(...)`
(Phase 1, `wallet-auth-core`) dispatches over — no paraphrase, so a
`never`-exhaustiveness check (S2) can be written directly against it.

| Chain | Discriminator | Secret field | Secret type | Construction call |
|---|---|---|---|---|
| EVM | `'privateKey' in config && privateKey.startsWith('0x')` | `privateKey` | `` `0x${string}` `` | `privateKeyToAccount(config.privateKey)` (viem) |
| Solana | `'privateKey' in config` | `privateKey` | `Uint8Array` (64-byte secretKey, **not** a 32-byte scalar) | `Keypair.fromSecretKey(walletConfig.privateKey)` |
| Sui | `'mnemonics' in config` | `mnemonics` | `string` (BIP-39 — **no `privateKey` field exists on this type at all**) | `Ed25519Keypair.deriveKeypair(walletConfig.mnemonics)` |
| ICON | `'privateKey' in config` (mirrors EVM) | `privateKey` | `` `0x${string}` `` | `Wallet.loadPrivateKey(wallet.privateKey.slice(2))` — `0x` stripped first |
| Injective | `'secret' in config && ('privateKey' in config.secret \|\| 'mnemonics' in config.secret)` (**nested one level**, plus requires top-level `chainId`+`network`) | `secret.privateKey` **or** `secret.mnemonics` | `string` / `string` | `PrivateKey.fromPrivateKey(...)` / `PrivateKey.fromMnemonic(...)` |
| Stellar | `config.type === 'PRIVATE_KEY'` (literal tag, not `in`-check) | `privateKey` | `Hex`, but must be a StrKey secret seed (`S...`), not raw hex | `Keypair.fromSecret(privateKey)` (after stripping an optional `0x` prefix) |
| Stacks | `'privateKey' in config` | `privateKey` | `string` (Stacks hex convention; no special encoding, unlike NEAR/Stellar — `stacks/types.ts:14`) | stored as-is; materialized lazily inside `sendTransactionWithPrivateKey` |
| Bitcoin | `config.type === 'PRIVATE_KEY'` (literal tag) | `privateKey` | `Hex` (32-byte hex) | `ECPair.fromPrivateKey(Buffer.from(keyHex,'hex'))`; `addressType` defaults to `'P2WPKH'` |
| NEAR | `'rpcUrl' in && 'accountId' in && 'privateKey' in config` | `privateKey` | `string`, but must be near-api-js's `` `ed25519:${base58}` `` `KeyPairString` format, **not raw hex** | `KeyPairSigner.fromSecretKey(config.privateKey as KeyPairString)` |

**Irregularities the dispatcher must account for, not smooth over with a cast (S1):**
- Sui has no `privateKey` field at all — only `mnemonics`, alongside a required
  plain `rpcUrl: string`. `PrivateKeySuiWalletConfig` is a flat object
  (`wallet-providers/sui/types.ts:27-31`); there is no endpoint union and no
  intersection type.
- Injective nests the secret one level down
  (`secret: {privateKey} | {mnemonics}` — `wallet-providers/injective/types.ts:47`)
  and also carries top-level `chainId` + `network` (`:48-49`). Those two are not
  unique to it — EVM likewise requires `chainId` (`evm/types.ts:37`), and
  Stellar (`stellar/types.ts:34`) and Bitcoin (`bitcoin/types.ts:26`) both
  require a top-level `network`. What *is* unique: it is the one config that
  can't be reached by a flat `'privateKey' in config` check at all.
- Stellar and Bitcoin use an explicit `type: 'PRIVATE_KEY' | 'BROWSER_EXTENSION'`
  literal tag rather than structural (`in`) discrimination — the other seven
  use structural checks.
- NEAR and Stellar both need **encoding**, not just raw bytes: NEAR's
  `KeyPairString` (`"ed25519:<base58>"`) and Stellar's StrKey seed — a
  decrypted raw private key from `keystore-crypto`'s derivation module needs
  a chain-specific encode step before either constructor will accept it.
  `wallet-auth-core`'s `chainEncoders.ts` (Phase 1 layout) is exactly this —
  not optional glue code, a real per-chain requirement for 2 of 9 chains.

Base interfaces confirmed identical across all 9 (`WalletAddressProvider`):
```ts
export interface WalletAddressProvider {
  getWalletAddress(): Promise<string>;
  getPublicKey?: () => Promise<string>;
}
export interface ICoreWallet extends WalletAddressProvider {}
```
Every `I<Chain>WalletProvider extends ICoreWallet` and adds chain-specific
signing/broadcast methods (e.g. `IEvmWalletProvider.sendTransaction`,
`IBitcoinWalletProvider.signBip322Message`) — `createWalletProvider(...)`'s
return type is the union of these nine, narrowed by the `chainType` argument
via `GetWalletProviderType<K>` (canonical definition
`packages/types/src/wallet/providers.ts:34-53`; documented at
`packages/sdk/docs/WALLET_PROVIDERS.md:45-46`, with the nine-interface table
at `:27-37`).

### Open questions added this session (in addition to the four already listed above)

5. Can one account hold both passkey **and** password as independent backup
   unlock methods simultaneously? Needs a Better Auth spike — does
   `@better-auth/passkey` + `emailAndPassword` cleanly coexist per user in
   Better Auth's account model? Spike before finalizing the SDK modal's
   `methodSelect` step. Regardless of the answer, the modal must never
   hardcode "exactly one method" — this is exactly what mitigates open
   question 1 above ("irrecoverable wallets").
6. Exact `@sodax/*` publish names for the 3 new packages (working names used
   throughout this plan: `keystore-crypto`, `wallet-auth-core`,
   `wallet-auth-react`) — confirm with the npm org owner before the first tag
   push, irreversible once published.
7. Wire-type sync between `wallet-auth-core`'s Better Auth HTTP client types
   and `auth-api`'s DTOs — hand-kept in sync, or generated? No existing
   precedent for a generated client between these two repos. The nearest
   analog, `pnpm check:sponsoring-contract`, was read in full this session
   (not just cited by name): its script (`scripts/check-sponsoring-contract.mjs`,
   167 lines, zero deps beyond `node:fs/promises`) hand-maintains an `EXPECTED`
   map (SDK type name → backend OpenAPI schema name → required/optional field
   lists, copied by hand from `packages/types/src/backend/sponsoringApi.ts`),
   an `EXPECTED_OPERATIONS` table (path/method/success-status/handled-error-statuses),
   and an `EXPECTED_ERROR_CODES` array, then diffs all three against a live
   OpenAPI spec fetched from `http://localhost:3011/docs-json` by default (or
   a `--spec <url|path>` override — CI has no sponsoring service, so
   `packages/sdk/AGENTS.md:186-189` documents booting the backend's own
   `test/integration/openapi.spec.ts` mocked-provider Swagger document and
   dumping it to a file instead). It is **not in CI**, deliberately — a manual
   gate run "whenever the contract moves on either side, and before a
   release" (`AGENTS.md:130-135`). This is genuinely a four-artifact manual
   sync (OpenAPI spec ↔ the script's `EXPECTED` object ↔ the `@sodax/types`
   interfaces ↔ a `valibot` runtime-schema mirror in
   `packages/sdk/src/backendApi/sponsoringApiSchemas.ts`), not a generator,
   and sponsoring is the **only** pair in the repo that has this — no
   `check:swaps-api-contract`/`check:bridge-api-contract` equivalents exist.
   Recommended default: write an equivalent standalone `.mjs` script for
   `auth-api` ↔ `wallet-auth-core` with its own `EXPECTED`/`EXPECTED_OPERATIONS`
   tables, decide how it obtains a spec (a local `/docs-json` boot, or a
   mocked-provider dump like sponsoring's), and accept it stays a manual/
   non-CI gate unless `auth-api` ends up CI-reachable — do not build
   generation tooling for this, it would be new, unproven infrastructure for
   a problem the repo already has a working (if manual) answer to.

### Verification additions (SDK/demo side, beyond Phase 2's bar above)

- KDF test vectors byte-identical across a plain Node run and a
  browser-simulated run — do not assume WASM determinism across runtimes
  without checking.
- 9-chain derivation vectors, AAD-tamper test (mutate envelope header
  post-encryption, assert decrypt fails).
- AAGUID matcher tested against real Apple/Google sample attestations plus a
  non-whitelisted one; whitelist-enforcement test on the backend side
  including the `disabledPasskeyWhitelist` kill switch.
- Reload-boundary regression test (`useSodaxAuthSession()` shows logged-in,
  `useWalletProvider()` returns `undefined` until re-unlock) — explicit test,
  since it's an easy thing for a future change to "fix" into an accidental
  persisted-secret bug.
- KDF-split defense test on the backend: assert `authHash`/`kek` come from
  one `argon2id` call + HKDF split under distinct labels, not two
  independently-cheap derivations — literal Bound bug, test for its absence
  directly.
- End-to-end bar: in `apps/demo`, drive a real intent (swap or bridge) through
  a wallet derived entirely from a decrypted SODAX Auth session, against
  staging/testnet.

### Critical files (SDK/demo side)

- `sodax-sdks/packages/wallet-sdk-react/src/chainRegistry.ts`,
  `src/index.ts`, `docs/CONNECTORS.md`
- `sodax-sdks/packages/wallet-sdk-core/tsup.config.ts` (build convention to
  mirror for the 3 new packages)
- `sodax-sdks/.changeset/config.json`, `.github/workflows/sdks-publish.yml`,
  `packages/RELEASE_INSTRUCTIONS.md`
- `sodax-backend/apps/stateful-api/src/auth/auth.config.ts`,
  `auth.constants.ts`; `sodax-backend/apps/bridge-api/` (scaffolding template —
  only on `origin/feat/bridge-api`, tip `c0d86fea`; compare against
  `origin/development`'s `apps/api-auth`)
- `sodax-sdks/apps/demo/src/providers.tsx`

