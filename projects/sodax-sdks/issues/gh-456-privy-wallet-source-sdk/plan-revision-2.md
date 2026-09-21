---
type: plan-revision
repo: sodax-sdks
github: 456
updated: 2026-09-18
supersedes: plan.md rev 1
---

# plan.md rev 1 → rev 2 — the revision list

Lead-architect close of round 2. Inputs: five research answers (chain coverage, recovery/MFA/TEE,
session+mount, Next/Turbopack/SSR, precedent deep-read), an adversarially-reviewed finding set
(11 CONFIRMED, 1 CONTESTED, 2 REFUTED), and my own first-hand re-reads in the read-only checkout at
`origin/main 898b7e6a`. Versions read this round: `@privy-io/react-auth@3.43.0` (published
2026-09-15), `@privy-io/chains@0.6.0`, `@privy-io/js-sdk-core@0.76.0`, `@wagmi/core@2.20.3`,
`wagmi@2.16.9`, `viem@2.29.2`. Privy ships weekly — re-stamp every Privy citation on the spike day.

The settled decision (plain wagmi connector + React host, sub-path `@sodax/wallet-sdk-react/privy`,
optional peer, **no `@privy-io/wagmi`**) is untouched and is now corroborated by a production
precedent: sushiswap ships exactly this shape on `master`
(`apps/web/src/lib/wallet/privy/privy-evm-connector.ts` @ commit `7fbb578` — cite the commit, its
PR 2267 reports `merged_at: null`).

---

## 1. What changed and why

### 1.1 LOUD — five things rev 1 calls settled or verified that the research invalidates

**(a) The issue's AC2 "set recovery/password" would throw at runtime, not merely be unnecessary.**
Rev 1 Risk 1 says the password factor "exists only for on-device execution". It is worse than that:
on Privy's default TEE environment `setWalletRecovery()` **throws before any UI** with
`PrivyErrorCode.UNSUPPORTED_WALLET_TYPE` — *"User owned wallet recovery is only supported for
on-device execution and this app uses TEE execution."* (read in the shipped minified ESM of
`@privy-io/react-auth@3.43.0` `dist/esm/index-BcpLdFr2.mjs`, byte-identical in 3.40.0, the version
rev 1 pins; the `.d.ts` doc-comment at `dist/dts/index.d.ts:3399` is stale and still promises a
password modal). Consequence: the issue's game-plan step 4 and AC2 must be **struck**, not softened,
and "the SDK never calls `setWalletRecovery`" becomes a stated invariant. Q1 correspondingly stops
blocking the docs — the TEE answer is now known and defensible, so `WALLET_PRIVY.md` can be written
today.

**(b) Settled choice 6 is necessary but not sufficient, and chain id 999 collides inside Privy's own
registry.** Mirroring the 14-chain tuple into `supportedChains` does stop 4901 — but it leaves every
chain on a Privy or public RPC, so the SDK's own `EVM.chains[key].rpcUrl` contract is silently
violated on the Privy path. Worse, `@privy-io/chains@0.6.0`'s `DEFAULT_SUPPORTED_CHAINS` maps
**id 999 to Zora Goerli Testnet**, not HyperEVM, and `dedupeSupportedChains` grafts Privy's own proxy
onto any supplied chain whose id matches a default entry. Fix: decorate a **separate** array with
`rpcUrls.privyWalletOverride` (rev 2 § 2, edit 12). This also closes CONFIRMED finding
`privy-rpc-override-missing` and absorbs `process.md` § F8, which never reached rev 1.

**(c) AC5's "MetaMask/WC reconnects are never delayed" is false.** `@wagmi/core@2.20.3`
`dist/esm/actions/reconnect.js:46-82` is a sequential loop with **no `break`**: it `await`s every
authorized connector's `connect()`, and `:84-96` publishes `status: 'connected'` only *after* the
loop ends. So a Privy connector holding a 30 s readiness wait delays the other wallets' published
connection regardless of sort order — and `recentConnectorId` scores Privy first (`:36-37`) whenever
it was the last used. Fix: split the budget, short readiness gate on the reconnect path (edit 20).

**(d) `connectTimeoutMs: 300_000` is the wrong shape.** A single deadline spanning the OTP is both
too short for a real user and far too loose on runtime readiness. The precedent never times out the
login modal at all — it is *cancellable* via a per-attempt `AbortController`, and every
non-interactive phase gets its own fresh deadline. Replace (edit 8).

**(e) `loginMethods: ['email']` does NOT stop Privy standing up a second WalletConnect stack.**
`appearance.walletList` defaults to a nine-entry list containing `wallet_connect`,
`coinbase_wallet` and `base_account`, and `externalWallets.walletConnect.enabled` defaults to `true`
— verified in `@privy-io/react-auth@3.43.0` `dist/esm/privy-context-BRYUJfjv.mjs`, and observed live
on an anonymous `demo.privy.io` load (2026-09-18) firing
`explorer-api.walletconnect.com/v3/wallets` and writing `base-acc-sdk.store` with no session. Rev 1's
AC5 argument rests on connector registration alone and never sets these keys. Fix: set
`appearance.walletList: []` and `externalWallets: { disableAllExternalWallets: true,
walletConnect: { enabled: false } }` (edit 13).

### 1.2 The rest of the shape change

Three defects make the connector contract incomplete rather than merely imprecise, and all three are
verified in the repo, not inferred: the reconnect authorization flag would be written to a **session
cookie** and die on browser quit (`cookieStorage.setItem` writes no `expires`/`max-age`,
`@wagmi/core@2.20.3 dist/esm/utils/cookie.js:9-14`, and `EvmXService.ts:139-142` opts into it) while
the zustand entry that contradicts it lives in localStorage (`useXWalletStore.ts:155-172`);
`getChainId()`/`getAccounts()` are never specified although `getConnectorClient.js:32-39` throws
`ConnectorChainMismatchError` on every `useWalletClient()` resolve when they disagree; and the
predicate is written as `storage.getItem(...) === true` when `createStorage.getItem` is
unconditionally `async` (`createStorage.js:13-19`), which type-checks clean and is permanently
`false`.

The chain-switch sequence is a **guaranteed** race, not a possible one: in 3.43.0
`embedded.switchChain()` is a React `setState` only, and `getEthereumProvider()` mints a *new*
provider pinned to the chain captured in the render that produced that wallet object. Rev 1's
"await switch → re-request provider → attach → emit change" therefore attaches an old-chain provider
and moves wagmi's state to the new chain (edit 17).

Two things get *smaller*. The session probe leaves `isAuthorized()` entirely — it is not needed
there, it cannot be trusted there (`cookieWriteBehavior: 'never'` + server cookies leaves no
JS-readable signal, which would silently break reconnect), and its negative formulation was flatly
wrong (`privy:caid` and `privy:connections` are written by **any** anonymous `PrivyProvider` mount).
And spike item 5 closes on research rather than a live app.

One thing gets added that rev 1 has no concept of: a **Turbopack prerender go/no-go**.
`@privy-io/react-auth` *statically* imports `@walletconnect/ethereum-provider`, putting that module's
init on the SSR path, whereas wagmi's own `walletConnect()` connector loads it via `await import()`
(`@wagmi/connectors@5.9.9 dist/esm/walletConnect.js:158`) — which is precisely why the Next 16
example builds green today. That must be spike item 0.

### 1.3 Net effect on scope

Public API is unchanged by the recovery research (it adds no surface: no recovery hook, no MFA hook,
no `useExportWallet` re-export — only two *negative* invariants and a documentation duty). The
connector contract grows by two methods and a cancellation path. The spike shrinks from 8 items to 5,
two of which no longer need a Privy app at all. Docs grow by two named sections. Estimate moves from
"8–9 days + spike" to **9–10 days + a 1-day spike**, with the Turbopack build as a go/no-go on day 1.

---

## 2. Edits to plan.md in file order

Each edit is self-contained. Line numbers are rev 1's.

### Header / provenance

**Edit 1 — line 12-15 (revision banner).** Replace "Revision 1 (2026-09-18)" with "Revision 2
(2026-09-18)" and append: *"Rev 2 folds in `process.md` § F7–F9, a five-topic research round
(chain coverage, recovery/MFA/TEE, session+mount, Next/Turbopack/SSR, precedent deep-read) and an
adversarial review. Five things rev 1 called settled are corrected — see § Settled choices notes and
§ Risks. Privy versions cited are `@privy-io/react-auth@3.43.0` / `@privy-io/chains@0.6.0` /
`@privy-io/js-sdk-core@0.76.0`, read 2026-09-18; Privy ships weekly, so re-stamp on the spike day."*
*Severity: minor. Reason: a reader must not apply rev 1's `connectTimeoutMs`, `supportedChains` or
AC5 sentences.*

### § Approach → Settled choices (lines 73-88)

**Edit 2 — settled choice 4.** Replace *"No recovery/password API in V1 — Privy's default TEE
execution has no password factor"* with: *"**No recovery/password API in V1, and the SDK never calls
`setWalletRecovery()`.** On Privy's default TEE execution that call throws
`PrivyErrorCode.UNSUPPORTED_WALLET_TYPE` before any UI ('User owned wallet recovery is only supported
for on-device execution and this app uses TEE execution'), verified in `@privy-io/react-auth@3.43.0`
`dist/esm/index-BcpLdFr2.mjs` and byte-identical in 3.40.0. Even on an on-device app the SDK could
not configure recovery from code: `requireUserOwnedRecoveryOnCreate` and `userOwnedRecoveryOptions`
are dashboard-only on the internal `AppConfig` and are **not** fields of `PrivyClientConfig`
(`dist/dts/types-ChU9ocPQ.d.ts:2148-2149` vs the `embeddedWallets` block at :1779-1860). The
`createWallet`/`useCreateWallet` doc-comments still reference `config.embeddedWallets.requireUserOwnedRecoveryOnCreate`
as if it were a client option — it is not; do not re-add it from a doc example."* *Severity:
blocking. Reason: rev 1's wording invites an implementer to call an API that errors.*

**Edit 3 — settled choice 6.** Append to the Sonic/`supportedChains` line: *"Mirroring is necessary
but **not sufficient** — see Architecture: the tuple must be decorated with
`rpcUrls.privyWalletOverride`, and chain id 999 collides with Zora Goerli Testnet inside Privy's own
default registry."* *Severity: blocking. Reason: settled choice 6 as written is the exact wording an
implementer would transcribe into `supportedChains: ctx.chains`.*

**Edit 4 — new settled choice 8.** Add: *"**The derived `PrivyProvider` config disables Privy's own
external-wallet surface**: `appearance.walletList: []` and `externalWallets: {
disableAllExternalWallets: true, walletConnect: { enabled: false } }`. `loginMethods: ['email']` does
**not** shrink `walletList` (default list includes `wallet_connect`, `coinbase_wallet`,
`base_account`; `externalWallets.walletConnect.enabled` defaults to `true` —
`dist/esm/privy-context-BRYUJfjv.mjs`), so without these keys mounting Privy initialises a second
WalletConnect v2 provider, a Coinbase Wallet SDK and a Base Account SDK next to the SDK's own
`walletConnect()` connector. `disableAllExternalWallets` short-circuits Privy's whole connector
manager before any provider detection, and is marked `@experimental` in the public types
(`dist/dts/types-ChU9ocPQ.d.ts:1490`) — so pin the Privy version and add a QA row."* *Severity:
blocking. Reason: AC5 currently rests on an argument the source contradicts.*

**Edit 5 — new settled choice 9.** Add: *"**The SDK never sets `mfa.noPromptOnMfaRequired`.** It
defaults to `false`, which means Privy raises its own MFA modal from inside the SDK-mounted provider
and wallet MFA works end-to-end with zero SDK code. Setting it `true` would silently break signing
for MFA-enrolled users, because the SDK provides no MFA listener. Assert in a unit test that the
built config object contains no `mfa` key and no recovery key."* *Severity: major. Reason: turns a
research finding into an invariant with test coverage, at no API cost.*

### § Public API (lines 89-143)

**Edit 6 — `EvmWalletSourceContext` field name.** Rename `chains` → `wagmiChains`.
`EvmTypeConfig['chains']` already means something different in the same file (the partner's
per-chain `rpcUrl`/`defaults` record), and rev 2 introduces a second, *decorated* chain array, so
three different "chains" in one context is a transcription trap. Update the three references:
`supportedChains` derivation, `defaultChainId` resolution, and the `EvmProvider.test.tsx` assertion.
*Severity: minor. Reason: naming collision that rev 2 makes worse.*

**Edit 7 — shrink `EvmWalletSource`.** Drop `kind` and `id` from the type and drop the exported
`PrivyEvmSource` alias; nothing in core reads them (`EvmProvider` only calls `createConnector` and
mounts `Host`). Keep one `@internal` type with `createConnector` + optional `Host`, branded with a
non-exported nominal marker so only `privy()` can produce one; the runtime guard shrinks to
`typeof value?.createConnector === 'function'` for untyped JS callers. Keep `appId` off the public
type entirely. *Severity: minor. Reason: repo rule — no public API surface for callers that do not
exist; V1 has exactly one source.*

**Edit 8 — replace the timeout options.** Delete `connectTimeoutMs` (300 000) and
`reconnectTimeoutMs` (30 000) as the two-knob model. Replace with:

```ts
  readyTimeoutMs?: number;      // default 3_000  — wait for host ready on the RECONNECT path
  connectReadyTimeoutMs?: number; // default 15_000 — wait for host ready on an interactive connect
  walletTimeoutMs?: number;     // default 30_000 — embedded wallet materialisation after login
  providerTimeoutMs?: number;   // default 10_000 — any single provider/runtime request
  // The login modal itself is NEVER timed out — only cancelled (AbortController).
```

and state the rule in prose: *"Interactive phases (the OTP modal) are cancellable, never timed out —
users take minutes to enter a code. Every non-interactive phase gets its own fresh deadline."* Add
`PrivyConnectorCancelledError` and `PrivyRuntimeWaitTimeoutError` to the exported error list (the
second distinguishes 'the runtime never became usable' from 'a provider request was slow', which is
the only failure that could ever justify remounting Privy). *Severity: major. Reason: a single 300 s
deadline spanning the OTP is simultaneously too short for a user and too loose on readiness; the
precedent's per-phase model is shipped and tested.*

### § Architecture — mount tree (lines 145-172)

**Edit 9 — correct the `{children}` comment in the mount tree.** `EvmProvider`'s `children` is not
the partner's app: `SodaxWalletProvider.tsx:48-60` builds inside-out (`children` → `SolanaProvider`
→ `SuiProvider` → `EvmProvider`), so the slot is `SuiProvider(SolanaProvider(partner children))`.
Replace the comment with `{children}  // = SuiProvider → SolanaProvider → partner children
(SodaxWalletProvider.tsx:48-60)`. *Severity: major. Reason: every claim in rev 1 about the boundary
being "contained to EVM/Privy" is derived from this diagram.*

**Edit 10 — mount the boundary conditionally.** Replace the parenthetical *"without it, only a falsy
check and a pass-through boundary"* with: *"without `EVM.privy`, `EvmProvider` renders `{children}`
byte-identically to today — **no boundary is constructed**. The boundary exists only when
`source?.Host` is present: `source?.Host ? <EvmSourceHost …>{children}</EvmSourceHost> : children`,
mirroring the existing conditional-wrap style at `SodaxWalletProvider.tsx:50-60`."* *Severity:
blocking. Reason: as written, every non-Privy partner's whole app sits inside an SDK-owned error
boundary — a behaviour change for the exact group § "What stays untouched" promises to leave alone.*

**Edit 11 — document the `usePrivy()`-in-children contract precisely.** Replace *"partners may call
usePrivy() here"* with: *"partners may call `usePrivy()` and `useWallets()` here — outside a provider
they fall back to Privy's context defaults (`ready: false`, `authenticated: false`, `user: null`);
`useWallets()` warns. They must **not** call the callback forms — `useLogin({…})`, `useLogout({…})`,
`useCreateWallet({…})`, `useLinkAccount({…})` — inside `SodaxWalletProvider`: those dereference an
events context that is `undefined` without a provider and throw during render, and an error thrown
while a boundary renders its own fallback is not caught by that boundary. Verified against 3.43.0
only; re-assert against the pinned version in the spike."* *Severity: major. Reason: rev 1's
one-liner is the contract the fallback path has to honour, and half of it is unsafe.*

**Edit 12 — derived config: `supportedChains` must carry the partner's RPC.** Replace
`supportedChains: ctx.chains (cast once at the boundary — two viem copies)` with:

> `supportedChains`: a **separately built** array — never a mutation of the shared tuple — derived as
> `chain → { ...chain, rpcUrls: { ...chain.rpcUrls, privyWalletOverride: { http: [url] } } }` where
> `url = getRpcUrl(ctx.evmConfig.chains?.[getEvmChainKeyByChainId(chain.id)]) ?? chain.rpcUrls.default.http[0]`,
> memoised on `ctx`. Inject for **all 14 chains unconditionally**, not only where the partner set an
> `rpcUrl`. Reasons: (i) Privy's embedded wallet resolves RPC as
> `rpcUrls.privyWalletOverride → dashboard rpcConfig.rpcUrls[chainId] → rpcUrls.privy + '?privyAppId=' → public ?? default`
> and that client does **both** `prepareTransactionRequest` (nonce/gas/fees) and the broadcast, so
> wagmi's transports are bypassed entirely on the Privy path; (ii) `rpcConfig` is **not** a
> `PrivyClientConfig` field in v3 — it is dashboard-supplied — so the chain object is the only
> in-code lever; (iii) an override makes `dedupeSupportedChains` a no-op, which stops Privy grafting
> its shared `*.rpc.privy.systems` proxy onto ids 1/10/56/137/8453/42161 and immunises the id-999
> Zora Goerli collision. `viem@2.29.2` `Chain.rpcUrls` carries `[key: string]: ChainRpcUrls`
> (`_types/types/chain.d.ts:38-41`), so this needs no new cast and **no `@privy-io/chains`
> dependency**; wagmi ignores the extra key because it uses the explicit `transports` map.
> `getRpcUrl` already exists at `packages/wallet-sdk-react/src/utils/walletRpcConfig.ts:24` and is
> what `createWagmiConfig` uses, so reads and sends share one source of truth.

*Severity: blocking. Reason: absorbs `process.md` § F8, which rev 1 never picked up; without it the
demo's nine configured endpoints are all ignored by Privy and six chains silently use Privy's shared
rate-limited proxy.*

**Edit 13 — derived config: add the external-wallet keys.** Append
`appearance.walletList: []` and `externalWallets: { disableAllExternalWallets: true, walletConnect:
{ enabled: false } }` to the derived config list, with the one-line reason from edit 4. Note the
partner's `appearance` passthrough must not be allowed to re-enable `walletList`. *Severity:
blocking. Reason: see § 1.1(e).*

**Edit 14 — sub-path module list.** Change `index.tsx` → **`index.ts`** (the factory and runtime hold
no JSX; JSX stays in `PrivyHost.tsx`; 8 of the 9 existing `src/xchains/*` entries are `.ts`). Delete
`sessionProbe.ts` from the required list and re-scope it as optional: *"`sessionProbe.ts` (optional,
mount-gate only — never consulted by `isAuthorized()`)"*. Add `errors.ts`. *Severity: minor (entry
extension) / major (probe re-scope). Reason: convention, and the probe must not be able to answer a
reconnect question.*

### § Architecture → Lifecycle → First login (lines 176-204)

**Edit 15 — step 1, fail fast on a missing host.** Replace the single
`waitFor(s => s.hostMounted && s.ready, 15 s)` with two: read `hostMounted` **synchronously** from
the snapshot and throw `PrivyHostNotMountedError` at once if absent, *then* await `ready` bounded by
`connectReadyTimeoutMs`. Also give `runtime.waitFor` an **error channel**: `usePrivy().error` is
published into the snapshot and every waiter rejects with the real error instead of waiting out its
deadline. *Severity: major. Reason: a partner who forgot `<SodaxWalletProvider>` currently hangs 15 s;
a wrong `appId` (`MISSING_OR_INVALID_PRIVY_APP_ID`) currently reports `TimeoutError` instead of the
cause — and partners will get the appId wrong.*

**Edit 16 — step 2, gate `createWallet()` on `linkedAccounts`, and soften the `login()` claim.**
Replace *"`authenticated && walletsReady && !embedded` → `ops.createWallet()` (tolerate 'already
exists')"* with: *"gate on a `hasEmbeddedAccount` flag the bridge derives from
`user.linkedAccounts.some(a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum')`,
not on `!embedded` from `useWallets()` — that is Privy's own embedded-wallet lookup, `useWallets()`
lags it, and `createWallet()` **throws** for a user who already has one (typedoc, `dist/dts/index.d.ts:2986-2999`).
Only call `createWallet()` on positive evidence that none exists; never on a `waitFor` timeout."*
Separately, reword the parenthetical in step 2: rev 1 asserts as verified that an
already-authenticated `login()` "fires *no* callback", but the published 3.43.0 typedoc says
`onComplete` runs immediately with `wasAlreadyAuthenticated: true`. Replace with: *"the doc and the
observed behaviour disagree; branching on `authenticated` first makes it moot."* *Severity: major.
Reason: rev 1 calls a real error path "tolerate", and the absolute claim will not survive review
against the published typedoc.*

**Edit 17 — steps 5-6, and the whole Chain switch section, are one correction (see edit 23).** In
step 5, add that the address is checksummed via `getAddress` and recorded as the connector's **pinned
account**, and that `connect()` returns the **post-switch** `chainId` (rev 1 assigns `chainId` from
`eth_chainId` and *then* switches, leaving it ambiguous which value is returned;
`connect.js` writes `data.chainId` straight into `connections[uid]`). *Severity: blocking.*

**Edit 18 — step 6, move the flag off wagmi storage and `await` it.** Replace
`storage.setItem('privy.connected', true)` with a localStorage-backed flag owned by the sub-path:

```ts
const FLAG = `${config.storage?.key ?? 'sodax'}.privy.connected`;
// NEVER config.storage: the SDK's wagmi storage is cookieStorage, whose setItem writes no
// expires/max-age (@wagmi/core 2.20.3 dist/esm/utils/cookie.js:9-14) — a SESSION cookie. It dies on
// browser quit while the zustand xConnections.EVM entry in localStorage (useXWalletStore.ts:155-172)
// survives, so AC3 would fail on the most common form of "return", silently.
```

with `readFlag/writeFlag/clearFlag` helpers, each in its own try/catch (probe-on-write, mirroring
`useXWalletStore.ts:158-167`, because modern Safari throws on writes but not reads), and injectable
into the connector (`flagStorage?: {...}`) so the unit tests stay deterministic. Every clear path —
`disconnect()`, connect failure, and the Privy-logout handler — must use `clearFlag()`. *Severity:
blocking. Reason: verified session-cookie semantics; with the planned in-memory test harness the bug
is invisible to the entire test suite as well as to the QA matrix.*

### § Architecture → Lifecycle → Returning user reload (lines 206-228)

**Edit 19 — `isAuthorized()`: await it, and delete the probe from it.** Replace the bullet with
executable pseudocode and two sentences of rationale:

```ts
async isAuthorized() {
  try { return readFlag() === '1'; } catch { return false; }   // total; no Privy read; no await on Privy
}
```

*"`@wagmi/core@2.20.3` wraps every backing store in `async getItem` (`dist/esm/createStorage.js:13-19`),
so the rev 1 predicate `storage.getItem(...) === true` compares a Promise to `true` and is
permanently `false` — and it **type-checks clean** under the package's strict tsconfig, because
`Storage['getItem']` is declared as a `value | Promise<value>` union and `value` widens to `unknown`
for a key outside `StorageItemMap`. Do not consult Privy storage here: in
`sessions.cookieWriteBehavior: 'never'` + server-cookie mode no JS-readable Privy signal exists at
all, so a probe-gated `isAuthorized()` would silently never reconnect. Delete the
`noPrivyTraceOnDevice()` formulation outright — it is unsound regardless: `privy:caid` and
`privy:connections` are written by **any** `PrivyProvider` mount, including an anonymous one, and
survive logout."* *Severity: blocking (permanently-false predicate) + major (probe).*

**Edit 20 — split the reconnect budget and correct the AC5 sentence.** In the
`connect({ isReconnecting: true })` bullet, replace `≤ reconnectTimeoutMs` with `≤ readyTimeoutMs
(default 3 000)` for the readiness gate, `walletTimeoutMs` for materialisation after `ready` is true.
Distinguish the two failure kinds when clearing the flag: `ready && !authenticated` → clear it (the
session really is gone); **`readyTimeoutMs` expiry → do NOT clear it** (readiness is unknown; clearing
makes the state terminal). Then replace the § Coexistence sentence *"`isAuthorized()` answers from
storage, so MetaMask/WC reconnects are never delayed"* with:

> With no flag the loop never pauses on Privy at all. With the flag set, wagmi's loop `await`s Privy's
> `connect()` and has **no `break`** (`reconnect.js:46-82`), publishing `status: 'connected'` only
> after the loop (`:84-96`) — so other wallets' published connection is delayed by at most
> `readyTimeoutMs`, regardless of sort order (`recentConnectorId` scores Privy first at `:36-37`).
> Nothing in the SDK surface is gated on that window: `useWalletClient` stays enabled while
> `reconnecting`, the `walletProvider` memo has no status gate, and a manual connect is never blocked.

*Severity: major. Reason: the false sentence is exactly the line a reviewer will diff the
implementation against.*

**Edit 21 — name the post-loop terminal state.** Add: *"If the host reaches `ready && authenticated`
**after** the reconnect loop has settled, nothing re-enters — `EvmHydrator`'s retry effect is gated on
`status !== 'disconnected'` and, once it clears `xConnections.EVM`, its own `if (!state.xConnections.EVM) return;`
guard closes for good. V1 resolution: the Host calls `reconnect()` **once** when it becomes
ready-and-authenticated, guarded on (flag still set ∧ `!config.state.current` ∧ `!userDisconnected.EVM`),
at most once per page. Do **not** use `emit('connect', …)`: `createConfig.js`'s connect handler
returns early while status is connecting/reconnecting, and when it does run it sets `current`
unconditionally — which would hijack an already-reconnected MetaMask and skip the `recentConnectorId`
write. If the re-entry is judged not worth the code, say so and document the fallback: one click on
'Email (Privy)' reconnects with no second OTP via branch 2."* *Severity: major. Reason: an unhandled
terminal state that AC3 currently depends on a race to avoid.*

### § Architecture → Lifecycle → Disconnect (lines 230-236)

**Edit 22 — retitle to "Disconnect and account change", and specify four things.**
(a) `disconnect()` must first **cancel any in-flight connect attempt** (abort the `AbortController`),
so a user who opens the OTP dialog then picks another wallet does not leave a promise that never
settles. (b) On the bridge's `authenticated` true→false event the connector must also **clear the
flag**, not just detach — otherwise the next reload burns the reconnect window on a dead session.
(c) **Account change, fail-closed**: the connector pins the address it returned from `connect()`; the
bridge publishes the embedded-wallet set on every `useWallets()`/user change; while attached and
connected and not mid-connect/switch, if the pinned address is still present the connector re-takes
`getEthereumProvider()` only when the wallet object identity changed and emits nothing; if the pinned
address is **gone** (gated on `authenticated && walletsReady`, ignoring transient ticks where `user`
is momentarily null) it detaches and calls `onDisconnect()`. Do **not** silently follow a new address:
for an intent-signing SDK a re-pointed session is worse than a clean disconnect, and the existing
logout path already handles the drop. (d) On bridge **unmount**, reject every pending deferred
("Privy runtime unloaded") and publish an unavailable snapshot, so a partner unmounting mid-login does
not strand `useWalletModal` on `connecting`.

Also correct the justification text: drop "another tab" from the logout rationale. Cross-tab user
sync is an opt-in `@experimental` plugin (`createCrossTabUserSyncPlugin({ channelId })`,
`dist/dts/types-ChU9ocPQ.d.ts:586-611`) that the SDK does not pass; the real triggers are partner
`logout()`, token expiry, and storage-shared tokens adopting a different user at the next refresh.
The same correction applies to the QA row "logout from Privy in another tab", which will not
reproduce as written. *Severity: blocking (c, d) / major (a, b). Reason: the embedded provider emits
only `chainChanged` — `accountsChanged` has no producer anywhere, so the shell's "re-emits
`accountsChanged`" line in `plan-architecture.md` § 2.1 describes a pipe that can never carry water.*

### § Architecture → Lifecycle → Chain switch (lines 238-243)

**Edit 23 — replace the sequence entirely.** New text:

1. Validate `chainId` against wagmi `config.chains` first → `SwitchChainError`. This is now the
   **only** guard: `Embedded1193Provider.handleSwitchEthereumChain` in 3.43.0 does no validation at
   all (`this.chainId = Number(t)` unconditionally, rebuilds its `publicClient`, emits
   `chainChanged`).
2. Switch the **attached provider in-band**:
   `await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(id) }] })`.
   This mutates the same instance, so no re-attach is needed.
3. **Best-effort** `embedded.switchChain(chainId)` to update Privy's per-address chain map. A failure
   here must **not** fail the action — record a `pendingRuntimeChainId` and drag the next provider
   replacement to wagmi's chain. (`gap-app-v2` documents the concrete bug this defends against:
   `wallet.switchChain()` throwing `Unable to determine current chainId.` Do not string-match the
   message; ordering makes it irrelevant.) Skipping this step is not optional: without it the next
   `getEthereumProvider()` — on reconnect, re-attach or an address change — mints a provider back on
   `defaultChain`.
4. Verify `Number(await provider.request({ method: 'eth_chainId' })) === chainId`; only then set the
   connector's `lastVerifiedChainId` and `emit('change', { chainId })`. Mismatch → keep the old
   attachment and throw. This mirrors `@wagmi/core`'s own `injected.js`, which emits `change` only
   after `await this.getChainId() === chainId`.

Add the reason in one sentence: *"rev 1's `await embedded.switchChain()` → re-request
`getEthereumProvider()` → attach is a guaranteed race, not a possible one: in 3.43.0
`embedded.switchChain` is a React `setState` only and `getEthereumProvider()` mints a **new** provider
pinned to the chain captured in the render that produced that wallet object, so the re-requested
provider is still on the old chain."* Also note that `useWallets()[i].chainId` is CAIP-2
(`eip155:8453`), a **string**, so any comparison must parse it. *Severity: blocking.*

**Edit 24 — specify the two missing connector methods.** Add a new paragraph after Chain switch:

> **`getChainId()` / `getAccounts()` — both mandatory, both total.** `getConnectorClient` calls them
> together (`@wagmi/core@2.20.3 dist/esm/actions/getConnectorClient.js:14-21`) and then compares
> `await connector.getChainId()` against `config.state.chainId`, throwing `ConnectorChainMismatchError`
> on any disagreement (`:32-39`); `useWalletClient` holds that query at `staleTime: Infinity` and
> invalidates it only on `address` change, so a mismatch is permanent for the session — and because
> `EvmHydrator` deliberately does not gate on `walletClient`, the UI keeps showing a connected Privy
> account while `useWalletProvider('EVM')` stays `undefined`, with no error surfaced.
> - `getChainId()` → a **live** read of `eth_chainId` against the currently attached provider (a local
>   instance-field read on `Embedded1193Provider`, no network), falling back to `lastVerifiedChainId`
>   when the shell is detached. Never throw; never return the constructor default `1`. Do **not** cache
>   a connector-held chainId as the sole authority — that would make wagmi self-consistent while the
>   attached provider is physically on another chain, converting a loud, recoverable error into a
>   silent wrong-chain send.
> - `getAccounts()` → the pinned, checksummed embedded address from the runtime snapshot; never an
>   `eth_accounts` round trip through a shell that may be detached.

*Severity: blocking. Reason: rev 1 never specifies either, and TypeScript forces both to exist — so
the defect is semantic and no gate catches it.*

**Edit 25 — intercept `wallet_switchEthereumChain` at the shell.** Add to the deferred-provider
description: the shell intercepts `wallet_switchEthereumChain` and routes it back into the connector's
own validated `switchChain`, so a caller going through `useWalletClient()` cannot reach Privy's
unvalidated handler directly. Keep the verified 4900-while-detached behaviour, and state the security
reason the precedent gives for never queueing: *"replaying a stale request after a later login could
send it through a different user's wallet."* *Severity: major.*

**Edit 26 — guard against a delayed reconnect overwriting a user-selected wallet.** Add to
§ Coexistence: *"wagmi's `reconnect()` replaces the connection map on its first success
(`reconnect.js:67-74`), so a slow Privy restore that resolves after the user manually picked MetaMask
would clobber it — and `connect.js` sets `current` unconditionally after `await connector.connect()`.
The connector must snapshot the active connection identity at attempt start and re-check it in a
no-yield window immediately before returning; if a different connector is now current, detach, do not
write the flag, and throw `PrivyConnectorSupersededError extends UserRejectedRequestError` so wagmi's
catch restores the existing connection. Do **not** `logout()` on supersede — the Privy session is
legitimately established and branch 2 depends on keeping it. `CreateConnectorFn` does not receive
`config.state`, so inject a `getWagmiState?(): Config['state']` from `EvmProvider` where
`createWagmiConfig` builds the config (the precedent does exactly this); fallback if that wiring is
awkward: compare `recentConnectorId` snapshots."* *Severity: major. Reason: a live AC5 bug — reload
with a stale flag plus a user click on MetaMask and Privy wins, silently.*

### § Steps → Step 0 (lines 252-278)

**Edit 27 — rewrite Step 0.** Three changes.

(a) **New item 0, the go/no-go, runs first:** `pnpm --filter example-next-js-16 verify` with
`PrivyProvider` mounted, under both `next build` (Turbopack, `turbopackScopeHoisting` on by default in
Next 16) and `next build --webpack`. Reason: `@privy-io/react-auth` **statically** imports
`@walletconnect/ethereum-provider` (via its `toViemAccount-*` chunk), putting that module's init on
the SSR/prerender path, whereas wagmi's `walletConnect()` loads it with `await import()`
(`@wagmi/connectors@5.9.9 dist/esm/walletConnect.js:158`) — which is why the Next 16 example builds
green today. The only public report of Privy breaking a Turbopack prerender
(`TypeError: s is not iterable at MP.supportedChains`, vercel/next.js#81724) lands inside that exact
module; it is 14 months old, Privy v2 era, and was auto-closed by a bot for a missing repro, so it is
a reason to run the build, not to assume breakage. This repo already lost a cycle to the same bug
class in #1070. A dummy `appId` is sufficient — this item needs **no** Privy app. Record
`next build --webpack` as the documented partner fallback.

(b) **Fix the baseline and the commands.** The branch premise is stale (the Sui fix is now
`origin/main`) — restate as `origin/main 898b7e6a`. `pnpm build:packages` **runs zero tasks**:
`turbo.json` declares a `build:packages` task but no package implements the script (verified).
Use `pnpm build` or `pnpm turbo run build --filter=@sodax/wallet-sdk-react...` with
`TURBO_CONCURRENCY=2`. If a linked worktree is used, never run the root `pnpm test` there —
`scripts/release.test.mjs` leaks `GIT_DIR` and writes `core.bare=true` / `commit.gpgsign=false` into
the shared `.git/config`.

(c) **Cut items 3, 4, 5, 7, 8 and reduce item 6** — see § 5 for the surviving list and why each one
moved. Add a note that the dev Privy app is **self-service and free** (Developer tier, created at
dashboard.privy.io in ~10 minutes: Email login, Ethereum embedded wallets, allowed origin
`http://localhost:3002`, User management → Authentication → Advanced → "Enable test accounts"), and
that **Q7 is about who owns the shared QA app — a pre-merge item, not a pre-spike one**. Fix the
matching "Blocked on" line in `brief.md`, which is the one place that reads as a hard blocker.

*Severity: blocking (item 0) / major (commands, spike shrink). Reason: the Turbopack prerender is the
one thing that cannot be settled by reading and could invalidate the delivery shape.*

### § Steps → Step 1 (lines 280-300)

**Edit 28 — make `peerDependenciesMeta.optional` a named acceptance check.** Add the reason and an
install-level assertion: `.npmrc` sets `auto-install-peers = true` (verified) and pnpm auto-installs
missing **non-optional** peers — so without `peerDependenciesMeta['@privy-io/react-auth'].optional`,
every workspace consumer and every pnpm partner silently installs Privy. Assert at install level, not
only by a `dist` grep. *Severity: major. Reason: rev 1 lists it as a packaging detail; it is
load-bearing.*

**Edit 29 — harden the two new build scripts.** (a) Put them in
`packages/wallet-sdk-react/scripts/` and call them as `node scripts/…` (the `@sodax/libs` pattern) —
the `build` task in `turbo.json` declares **no `inputs`**, so root `scripts/*.mjs` are outside its
hash while `checkTs` explicitly adds `$TURBO_ROOT$/scripts/check-tests-typechecked.mjs` (verified;
note `verify-dist-exports.mjs` already has this problem today). If they must stay shared, add
`"inputs": ["$TURBO_DEFAULT$", "$TURBO_ROOT$/scripts/…"]` to `build`. (b) `restore-use-client.mjs`
must stamp **only** `dist/privy/index.mjs` and carry an explicit assertion that it never touches
`dist/index.mjs`, `dist/xchains/*/index.mjs` or any chunk — a directive on the shared chunk that
`dist/xchains/evm/index.mjs` and the barrel both import would break `layout.tsx`'s server-side cookie
SSR for every existing Next partner. Record that `banner` is not an alternative: tsup 8.5.0 +
`treeshake: true` routes through Rollup, which prints *"Module level directives cause errors when
bundled, "use client" … was ignored"* and strips both the source directive and the banner, and esbuild
sprays the banner onto shared chunks (reproduced with the repo's own tsup). Cite the Next 16 docs
("Advice for Library Authors": add the directive to entry points; "some bundlers might strip out
'use client' directives") so nobody re-opens it. (c) `check-entry-isolation.mjs` must be a
**transitive chunk-graph walk** from `dist/index.mjs` and every `dist/xchains/*/index.mjs` — not a
grep of the entry file — because with `splitting: true` a single *value* import of
`@privy-io/react-auth` from any module the barrel also reaches hoists the bare specifier into a shared
chunk (reproduced both ways in a fixture). Extend it to `.d.ts` chunks with the same rule, and state
the property as "no reachable specifier in the non-privy entrypoints, JS or types, is `@privy-io/*`".
Add the leak shape as its negative fixture, and require Privy types to be `import type` only (erased,
verified safe). *Severity: major.*

### § Steps → Step 2 (lines 302-315)

**Edit 30 — `EvmProvider` wiring.** Reflect edits 6, 10 and 12: rename `ctx.chains` →
`ctx.wagmiChains`; wrap in `EvmSourceHost` only when `source?.Host` exists; and note that
`EvmSourceHost`'s `console.error` must **not** assert the Host is at fault — the boundary also
catches throws from `SuiProvider`, `SolanaProvider` and the partner subtree (`SuiProvider` throws by
design on bad `grpcUrl`/`rpcUrl` config), so the message should print the caught error and say the
source may be the subtree below `SodaxWalletProvider`. *Severity: major.*

### § Steps → Step 3 (lines 317-328)

**Edit 31 — connector facts and host scoping.** (a) Replace *"`setup()` subscribes to the runtime
`logout` event"* with *"**no `setup()`**; `connect()` subscribes to `logout` before
`deferred.attach()` and keeps the unsubscribe; `disconnect()` and the logout handler unsubscribe."*
wagmi only needs `setup()` for self-announcing wallets, and zustand's `createStore` initialiser runs
`connector.setup?.()` **synchronously inside `createConfig`**, i.e. inside `EvmProvider`'s `useMemo`,
which React StrictMode double-invokes — so a `setup()`-registered listener leaks from a discarded
config with no teardown hook, and can win the ordering race against the live connector's handler and
eat its `onDisconnect()`. (b) State the ownership scope explicitly: *"one runtime and one deferred
shell per `privy()` call; a `privy()` source belongs to exactly one `SodaxWalletProvider` mount — a
second mount needs a second `privy()` call."* Make the mount guard **re-claimable** (a module-level
`Map<appId, owner>` that notifies suppressed hosts on release) so host #1 unmounting hands ownership
to host #2 instead of wedging `hostMounted: false` forever. (c) Add: `privy()` must be called once, at
module scope or inside `useMemo`/`useRef` — the returned source must keep a stable identity, or every
render rebuilds the wagmi config and remounts `PrivyProvider`; back it with a `console.warn` once past
a small per-`appId` instance count. (d) The bridge must keep every Privy hook handle behind a ref
refreshed each render so the published operations object is referentially stable — Privy's hook
handles are not stable across renders, and every snapshot publish otherwise re-fires every `waitFor`
predicate. *Severity: major.*

### § Steps → Step 4 (lines 330-353)

**Edit 32 — extend the test list.** Fold the two thin files in (`deferredProvider` cases into the
connector file; the two `index` assertions into `PrivyHost.test.tsx`), and add these cases, eight of
which come straight from the precedent's suite:
1. `reconnect()` resolves `[]` and the runtime is **never requested** with no flag — the AC5
   regression proof as a cheap unit test.
2. A never-resolving Privy readiness promise still lets a `mock()` connector reach
   `status: 'connected'` within `readyTimeoutMs`.
3. `isAuthorized` truth table driven through the **real** `createStorage`/flag adapter, including the
   positive row and the **restart case** (wagmi cookie storage empty + localStorage flag present →
   `true`); with a sync stub the missing `await` passes.
4. `storage.getItem` rejects → `reconnect()` called **twice** proves the module-level `isReconnecting`
   flag was not poisoned.
5. Seeded `wagmi.store` + `hydrate(config, { reconnectOnMount: true }).onMount()` — the path a real
   reload takes — not only `reconnect()`.
6. Expired session over two consecutive loads: the second must not even request the runtime.
7. `connector.uid` and `getProvider()` identity stable across logout → login as another user.
8. Delayed reconnect does not overwrite a user-selected wallet (needs `mock()` from
   `@wagmi/connectors`).
9. `getChainId()` after a switch equals the target; no `change` emitted if the fake never updates
   (→ `SwitchChainError`); a real `getConnectorClient()` after a switch returns a client instead of
   `ConnectorChainMismatchError`; `getAccounts()`/`getChainId()` do not reject while briefly detached.
10. Pinned embedded wallet disappears → detach + `onDisconnect`; a *different* embedded wallet appears
    while the pinned one is still present → no `change`; `walletsReady === false` → no event.
11. Derived-config assertions: `appearance.walletList` is `[]`, `externalWallets.disableAllExternalWallets`
    is `true`, **no `mfa` key**, **no recovery key**, and `supportedChains` has the same ids and order as
    `ctx.wagmiChains` with `rpcUrls.privyWalletOverride.http[0]` equal to the URL `createWagmiConfig`
    would use for that chain (plus one case for a chain with no partner entry).
12. Both `PrivyProvider` mount-time throws are asserted (empty `supportedChains`; `defaultChain` absent
    from the list) — the second is exactly what `defaultChainId` resolution prevents.
13. `EvmProvider.test.tsx`: with **no** `EVM.privy`, assert no `EvmSourceHost` is in the tree at all —
    a throwing child reaches the test's own boundary and the SDK `console.error` never fires. With a
    throwing Host, one case with a child calling `usePrivy()` (stays mounted, `ready === false`) and one
    with a child calling `useLogin({ onComplete })` asserting the error **escapes** the boundary, which
    pins the documented limit in code.
*Severity: major.*

### § Steps → Step 5 (lines 355-363)

**Edit 33 — add an injectable fake runtime.** Because the runtime store is framework-free, let the
demo accept a deterministic fake runtime behind a `VITE_` flag (the precedent ships exactly this,
selected by env, publishing a hardcoded address and a storage-driven chainId/delay). It gives AC3
(reload restore) and the chain-switch path a repeatable proof for reviewers with no Privy account, and
it is what makes the demo reviewable at all. *Severity: minor.*

### § Steps → Step 6 (lines 365-395)

**Edit 34 — add two named sections to `WALLET_PRIVY.md`, and fix the recovery bullet.**

(a) **"Recovery"** — replace the sketched bullet with this paste-ready paragraph:
> A Privy embedded wallet has no password and no seed phrase. On Privy's default TEE execution
> environment the wallet is reachable only through the user's Privy login method — for this
> integration, their email one-time code — and there is no recovery factor to set: calling
> `setWalletRecovery()` on a TEE app throws `unsupported_wallet_type`, so this SDK never calls it. If a
> user permanently loses access to that email address, the wallet and everything in it are
> unrecoverable: Privy states there is no backdoor and cannot restore the account. Tell your users they
> can export their private key at any time, and that linking a second login method (only the user can
> do it) is the one durable fallback. Enable wallet MFA — passkey, TOTP or SMS — in your Privy dashboard
> so that a stolen browser session cannot sign or export on the user's behalf; Privy renders the MFA
> prompt itself inside the provider this SDK mounts.

Do **not** link a Privy "recovery" page — there is none: the live docs index (`llms.txt`, 1074 lines,
fetched 2026-09-18) has exactly one occurrence of the word and zero recovery-setup pages; the
cloud-recovery page is unlisted and on-device-only. Link the TEE/on-device architecture page and the
support-limits page instead.

(b) **"Availability"** (NEW section) — every signature is a round trip to Privy's API + TEE, so while
Privy is unreachable a Privy-connected user cannot sign. Link status.privy.io and cite its per-component
90-day uptime (99.66%–100% as of 2026-09-18) rather than an SLA — there is none on the self-serve tiers.
State what the SDK does (connect and sign reject and surface Privy's error unchanged; other connectors
remain usable from the modal — but with a stored Privy session the other connectors' *auto*-reconnect is
delayed up to `readyTimeoutMs`, because wagmi reconnects sequentially). Tell partners to keep at least
one non-Privy connector enabled and not to strand users mid-intent: a SODAX flow is approve-then-intent,
two separate signatures, so an outage between them leaves an approval granted and the follow-up
unsignable while a MetaMask user on the same page is unaffected. Scope the section to TEE (the default
this plan assumes).

(c) **"Leaving Privy / user exit"** (NEW section, promoting two existing bullets) — addresses are bound
to that `appId`; there is **no automatic app-to-app transfer**; the exit is user-driven key export
(`exportWallet`, or the user's own access token against the Privy API — an app cannot prevent export
client-side), optionally re-imported into another Privy app via `useImportWallet`. Export requires the
user to still be able to authenticate against the app that holds the wallet, so deleting the Privy app
or dropping `EVM.privy` without a migration window leaves those addresses reachable only by whoever
exported in time.

(d) **Chain honesty** — state plainly that **7 of the 14 chains are outside Privy's registry**
(Sonic 146, Kaia 8217, LightLink 1890, Redbelly 151, Hedera 295, Robinhood 4663 are absent from
`DEFAULT_SUPPORTED_CHAINS`; id 999 in that list is Zora Goerli Testnet, not HyperEVM) and therefore get
no Privy RPC proxy and no Privy-side chain metadata — do not describe them as "Privy-supported". Say
that this SDK sets `privyWalletOverride` so Privy broadcasts through the partner's configured `rpcUrl`,
and name the subset that was actually send-tested. One sentence each: if a partner enables Privy's
transaction scanning it simply will not resolve on those 7 chains, and if Privy's own wallet UIs are
ever enabled the HyperEVM fiat price line is known-wrong (Privy resolves id 999 to Zora Goerli).

(e) **`'use client'`** — state the partner's own `'use client'` providers wrapper as **mandatory**, not
a nicety: the published `@sodax/wallet-sdk-react@2.0.0-rc.17` `dist` carries **zero** directives across
`dist/index.mjs` and all 15 chunks, and `@privy-io/react-auth@3.43.0` ships none either, so the wrapper
is the only thing making this work in App Router today. `apps/example-next-js-16/app/providers.tsx:1` is
the in-repo example. Add: keep `layout.tsx` server-side and Privy-free (cookie SSR reads only
`config.storage.key`, so it needs no Privy connector), set `turbopack.root` in a monorepo, gate UI on
Privy `ready`, and expect a strictly slower first *usable* paint for a returning Privy user — the SSR
HTML carries the stale cookie address at wagmi status `reconnecting` and SODAX shows nothing until
Privy's async session refresh completes.

(f) **Cost** — turn "pricing/SLA pointer" into a short "What this costs you": the tier table as of the
tested date, that metering is **per signing request**, the measured number of embedded-wallet
signatures a SODAX swap/intent costs (count it in the demo), the auto-upgrade-on-overage behaviour, and
that the `appId` owner is the billed party (cross-reference Q2). Date the numbers and attribute them to
Privy.

*Severity: blocking. Reason: the two facts that decide whether a partner can ship this safely were
already verified in `research.md` § 5.3 and simply never reached Step 6.*

**Edit 35 — fix the AC6 proof and the skills registration list.** (a) Either add
`"@sodax/wallet-sdk-react/*": ["../../../../wallet-sdk-react/src/*/index.js"]` to the snippets fixture
tsconfig **and** give `packages/skills` a way to resolve `@privy-io/react-auth` (devDependency at the
same exact version, or an ambient shim), writing the recipe's blocks as ```` ```ts ```` so they are
actually extracted — or state that the Privy blocks carry `// @ai-snippets-skip` and **drop
"check:ai green" from the AC6 proof column**, because as written the gate either skips the example or
fails it. Decide in the plan, not at authoring time. (b) The skills registration list is six files but
must be **eight**: add `packages/skills/AGENTS.md` and `packages/skills/README.md`, which also
enumerate granular wallet-sdk-react skills. Note `.claude-plugin/plugin.json` needs no change.
(c) Drop the `check-ai-imports` fixture edit — `check-ai-imports.sh:118-121` already maps
`@sodax/wallet-sdk-react/*` → `src/*/index.js` (precedent: `src/xchains/stellar/index.tsx`); keep it as
a thing to confirm when running the gate. (d) `WALLET_PRIVY.md` is **not** mirrored to docs.sodax.com —
either add it to `scripts/docs-pages-map.json` with a `docs/docs.json` nav entry, or lift the four
sentences that must not be missed (custody model, no signing during an outage, app-scoped addresses,
who pays) into the README's Privy bullet, which does publish. Decide it here. *Severity: major.*

### § Steps → Step 7 (lines 397-418)

**Edit 36 — re-cut the commits so each is green.** Current order installs Privy before the
trust-policy excludes exist, and Step 1 leaves the build red until Step 3 (`verify-dist-exports.mjs`
fails on a declared `./privy` with no `dist/privy`). New order: (1) `chore(workspace)` — the two
`trustPolicyExclude` entries + the exact devDependency + lockfile; (2) core seam — types +
`EvmProvider` + `EvmProvider.test.tsx`, no Privy anywhere, the commit a reviewer should read hardest;
(3) `src/privy/` **together with** the packaging edits (exports, typesVersions, tsup entry, knip,
isolation gate) + its tests, because the exports map and the entry must land together; (4) demo;
(5) docs; (6) skills. *Severity: major.*

**Edit 37 — fix the canary, or cut it.** As specified it cannot run: there is no per-invocation
`minimumReleaseAge` override in pnpm 10, `trustPolicy: no-downgrade` plus the exact pins will fail the
*install* rather than the API check, and `continue-on-error: true` hides both. Either install the
canary copy **outside the workspace** (a throwaway directory in the runner with its own minimal
`package.json`/`pnpm-workspace.yaml`, no cooldown, no trustPolicy, `--ignore-scripts`), give the job
`permissions: contents: read` and no secrets, and fail only on typecheck/test — or cut the workflow
and get the same signal from a normal devDependency-bump PR when a version clears the cooldown, which
already runs `checkTs` + `pnpm test` under review. State in the PR body that the workflow can only be
proved after merge via `workflow_dispatch` (a gate you just added must be run). *Severity: major.*

**Edit 38 — build the demo in CI, and fix the dependency delta.** (a) Add
`--filter='./apps/wallet-modal-example'` to CI's *Build Apps* step with `VITE_PRIVY_APP_ID` unset —
that is simultaneously the AC1 negative proof — and make the isolation assertion over its
`dist/assets` a script rather than a manual grep. (b) In the PR-body delta line, name the dependencies
a reviewer will actually ask about: a fourth `@walletconnect/core` line (Privy pins
`@walletconnect/{ethereum,universal}-provider` at exactly **2.22.4** against wagmi's **2.21.1**;
the tree already carries 2.11.2 via stellar-wallets-kit and 2.21.0 via reown), a third
`@coinbase/wallet-sdk` (4.3.2 beside 4.3.6/3.9.3), a second **viem** (2.56.0 against the catalog's
2.29.2), plus styled-components, x402, `@stripe/*`, hcaptcha, and the two exact excludes. `mipd`
dedupes on 0.0.7. Add one sentence: these are **static** top-level imports of
`dist/esm/index.mjs`, not behind a dynamic import, so they ship whenever the sub-path is imported.
*Severity: major.*

**Edit 39 — re-baseline the estimate.** Replace "Effort: 8–9 working days + the spike" with
*"≈9–10 working days of implementation (spike 1 incl. the Turbopack go/no-go, workspace+seam 1,
sub-path 3, tests 2, demo 1, docs+skills 2, gates/PR 0.5). Q7 is not a blocker (self-service Privy app);
Q1 no longer blocks the docs."* Sanity check: the precedent's connector is 865 lines with an 865-line
test — expect a 1:1 test-to-source ratio, and size the spike against *reading* their connector rather
than writing one. *Severity: minor.*

### § Verification (lines 420-436)

**Edit 40 — AC2 row.** Replace the "no mechanism on TEE" note with the AC2 rewrite to post as a
**comment** on icon-project/sodax-sdks#456 (do not edit the issue body):
> **AC 2:** Choosing that connector opens Privy's email one-time-code login and a new user ends with an
> automatically provisioned embedded EVM wallet surfaced as a connected EVM XAccount — with no password
> or recovery factor set, because on Privy's default TEE execution environment an embedded wallet has
> none (`setWalletRecovery()` throws `unsupported_wallet_type`) and the wallet is reachable only via the
> user's Privy login method.

*Severity: blocking. Reason: AC2 becomes testable without a dashboard change, and the current wording
describes a call that errors.*

**Edit 41 — AC3 row.** The proof tests session restore and never the literal AC. Add the
fresh-browser/same-email row (test account, clear all storage, log in again, compare addresses) and
pin the selection rule: bind the embedded wallet deterministically (lowest HD index / `walletIndex 0`)
rather than whatever `getEmbeddedConnectedWallet` returns first — it is an unpinned first-match over
`user.linkedAccounts` order with no sort — with a unit case for two embedded wallets, and one docs
sentence for partners whose users already have Privy wallets. *Severity: major.*

**Edit 42 — AC4 row.** Name the artifact rather than leaving it to an open question: the exact call
(sign the intent's typed data through `useWalletProvider('EVM')` plus one funded transaction on the
default chain), the app it runs in, and a tx hash + screenshot in the PR body. Add a funding line
(who tops up the test wallet, on which chains, what budget) and cut the send matrix to the chains that
will actually be funded. *Severity: major.*

**Edit 43 — AC5 row.** Replace *"`isAuthorized()` never waits without flag/session"* with the bounded
statement from edit 20, and add the two config keys from edit 4 as part of the mechanism. Add a
console assertion to the QA step: after Privy mounts, a WalletConnect connect still completes **and**
no *"WalletConnect Core is already initialized"* warning appears. *Severity: major.*

**Edit 44 — QA matrix (in `plan-architecture.md` § 7.4, referenced from here).** Add rows:
(16) connect with Privy → **fully quit the browser** → reopen → reconnects to the same address without
OTP and `xwagmi-store` is not cleared; (17) connect → disconnect → quit → reopen → still disconnected,
no ghost reconnect (catches a missed `clearFlag()`); (18) Privy API unreachable while connected (block
`auth.privy.io` + `*.rpc.privy.systems` after login) → sign rejects with a clear error, no hang past
`readyTimeoutMs`, MetaMask/WC still usable, and a reload with a stored session does not stall other
connectors — record what actually happens to the wagmi connection, that observation is what the
Availability docs section then states; (19) an **MFA-enrolled** user signs twice (the 15-minute
verification cache is dashboard-configurable, so the second signature may not prompt); (20) host throws
**after** mount → SUI/SOLANA connections intact; (21) partner calls `useCreateWallet({ createAdditional })`
from `{children}` → no spurious disconnect; (22) `disableAllExternalWallets: true` + `walletList: []`
leaves the email login modal fully functional. Rewrite row 5 as three rows (persisted **Privy** + iframe
blocked + MetaMask authorized → MetaMask reached within `readyTimeoutMs`; persisted MetaMask + **stale**
Privy flag; Privy becomes ready after the budget). Rewrite the "logout in another tab" row as "partner
code calls `logout()` in this tab" — the cross-tab version cannot reproduce without the opt-in plugin.
*Severity: major.*

### § Risks (lines 438-470)

**Edit 45 — Risk 1.** Rewrite around edit 2: the SDK never calls `setWalletRecovery`; Q1 no longer
blocks the docs. Append the three-state note (TEE default; on-device + Privy-managed *automatic*
recovery, where a new device is transparent; on-device + user-managed recovery) and that **even in the
third state the SDK ships nothing** — enrolment is a dashboard toggle or a partner-side
`useSetWalletRecovery()` call, and react-auth 3.43.0's `PrivyClientConfig.embeddedWallets` carries no
recovery option. So settled choice 4 is safe on all three branches, and on-device is a
Privy-support-gated, one-way per-app switch that SODAX cannot pick on a partner's behalf.
*Severity: major.*

**Edit 46 — Risk 7.** The premise is gone. Rewrite to the one thing still unverified: *"Privy's
**server-side** acceptance of a chain id absent from its own registry during signing (295, 151, 1890,
8217, 146, 4663). Client-side RPC is settled — the SDK now injects `privyWalletOverride`, so
estimation and the non-TEE broadcast go through the partner's endpoint; on the TEE stack the final
broadcast is server-side via CAIP-2, so Privy's backend must know the chain. Robinhood 4663 is the one
with a first-party Privy reference (a published recipe uses `chain_id` 4663 / `eip155:4663` with
`eth_sendTransaction`), which downgrades it relative to the others."* Delete
"`addRpcUrlOverrideToChain` as a follow-up", and delete "Privy-side RPC overrides" from § Out of scope
— it is now in scope. Remove Hedera **decimals** from the risk list entirely: `viem`'s `hedera`
declares 18 decimals, matching the relay's weibar view, and `EvmSpokeService.ts:42-54` already scales
`msg.value` by 10^10 before the wallet sees it, so the value Privy signs is already weibar. The
remaining Hedera risks are account existence/funding and hashio rate limits. Add LightLink 1890 as the
one chain whose default RPC is materially weaker: its public replicator answers neither
`eth_feeHistory` nor `eth_maxPriorityFeePerGas` and its blocks carry no `baseFeePerGas`, so viem falls
back to a legacy transaction (live probes, 2026-09-18). *Severity: blocking.*

**Edit 47 — Risk 5.** *"`back()` already drops the in-flight attempt"* is false. `useWalletModal.ts`'s
`isStillCurrent()` only drops the pending `success`/`error` transition — the file says so itself — and
`@wagmi/core`'s `connect` action has no abort input. Replace with: *"`back()` only drops the modal's
pending transition; the wagmi attempt keeps running. The connector stands itself down instead — see
§ Lifecycle, supersession guard (edit 26) — and `disconnect()` aborts a pending attempt (edit 22a)."*
Note the exposure window honestly: it is not 300 s with the dialog open (Privy's login UI is a Headless
UI `Dialog` that marks the rest of the page `inert`), it is the stretches where the connector is pending
with **no** Privy UI on screen — the readiness wait before `login()`, and the wallet-materialisation wait
after `onComplete`, i.e. the ordinary first-login path. *Severity: major.*

**Edit 48 — Risk 9 and a new Risk 10.** (a) Risk 9's "unverified" is now **verified**: the hidden auth
iframe `https://auth.privy.io/apps/<appId>/embedded-wallets` is rendered **eagerly for every visitor**,
gated only on `isServerConfigLoaded` and never on `authenticated` (observed live on an anonymous
`demo.privy.io` load). Promote lazy mount from "documented follow-up" to *a shape V1 must be built to
allow*: a permanently-mounted near-zero gate publishes `hostMounted` and can be asked to mount the real
provider; `connect()` throws if the gate is absent, otherwise requests the mount and waits. Nothing about
the connector contract then has to change when the lazy import lands. (b) NEW Risk 10 — *"`ready === true`
does not mean the wallet channel works."* The iframe handshake retries every 150 ms up to 270 times
(~40 s) and then only `console.warn`s; the provider wires `onLoadFailed` to `() => null`; and every
embedded-wallet postMessage RPC enqueues a promise with **no timeout of its own**. So under CSP, adblock
or Safari ITP the app sees `ready === true` with a permanently dead channel. Every connector call into
Privy — `getEthereumProvider`, `createWallet`, `switchChain`, and the `provider.request` signing path —
must be independently self-timed, not just `connect()`. *Severity: major.*

**Edit 49 — Risk 2 and the react-query worry.** Drop the QueryClient collision concern: Privy has **no**
`@tanstack/react-query` dependency, so `EvmProvider`'s private `new QueryClient()` cannot collide, and
Privy's React peer is `^18 || ^19`. Replace with two live cautions: (a) the second viem copy (2.56.0 vs
2.29.2) in every Privy-enabled partner's bundle — unavoidable, not a resolution mistake, and a nominal-typing
hazard if a viem *value* ever crosses the boundary (only `provider.request` does today); (b) **do not add
zustand to the pnpm overrides** — Privy needs zustand 5 while the SDK pins 4.5.2, and the repo's overrides
deliberately do not force it. *Severity: major.*

**Edit 50 — new Risk 11 (precedents reviewed and rejected).** One line so a reviewer does not re-open
them: `pinto-org/interface`'s connector is an anti-pattern catalogue (`isAuthorized()` reads a React
closure that is `undefined` at reconnect time so it never reconnects; `disconnect()` calls Privy
`logout()`; `getProvider()` builds a new object every call, defeating wagmi's identity dedupe);
`gap-app-v2` hardcodes `isAuthorized() { return true }` and is worth citing only for the `switchChain`
bug. And note where **not** to follow sushiswap: they reject the login deferred on *any* `PrivyErrorCode`,
which includes recoverable in-modal codes (`invalid_credentials`, `invalid_captcha`, `captcha_timeout`,
`too_many_requests`, `disallowed_plus_email`) — our `exited_auth_flow`-only rule is better, keep it. Also
do not copy their rdns-shaped connector id or their storage-writing `isAuthorized`. *Severity: minor.*

**Edit 51 — new Risk 12 (PR #163 collision).** `feat/wallet-hw` (PR #163) adds
`EVM.wagmiConnectors?: CreateConnectorFn[]` to the same `EvmAdapterFields` block and pushes into the same
`EvmProvider` `useMemo`. State that it is known, stale and conflicting, that this PR does not wait on it,
and what happens on each ordering: if #163 lands first, `privy()` returns something passable through
`EVM.wagmiConnectors` and core keeps only the Host mount; if this lands first, #163 rebases and
`EVM.privy` stays the one named source. Keep the note that #163 as it stands would fail `pnpm release`
preflight (`@sodax/wallet-hw` is non-private at `0.0.1-test` and the three package lists are not updated)
as a comment in **their PR thread**, not a new issue. *Severity: minor.*

### § Open questions (lines 472-490)

**Edit 52 — replace the list with § 6 below.** *Severity: major.*

### § Out of scope (lines 492-500)

**Edit 53.** Remove "Privy-side RPC overrides" (now in scope, edit 12). Add: *"**Gas sponsorship is
structurally unreachable through a wagmi connector**, so it is an architectural consequence of the
settled design rather than a V1 omission: `sponsor` exists only as a per-call option on Privy's own
`useSendTransaction`, requires TEE-stack wallets and dashboard-configured chains, and routes server-side
via CAIP-2 — the EIP-1193 path a wagmi connector drives never sets it."* Also add: *"no SDK surface for
recovery, MFA or key export — `useExportWallet` is not re-exported; a partner who wants an export button
imports it from `@privy-io/react-auth` inside the SDK-mounted provider."* *Severity: major.*

---

## 3. Findings dropped, and why

| Finding | Verdict | Disposition |
| --- | --- | --- |
| `q1-blast-radius-understated` | REFUTED (2/2, high) | Dropped. Its premise — that on-device execution requires pre-enrolled cloud/password recovery for a new device — is contradicted by Privy's own docs: on-device's default is **automatic** recovery, where Privy's KMS secures the recovery share and a new device is provisioned through normal authentication. AC3 holds on both branches. **Kept from the refuters:** the three-state framing, and the fact that even the user-managed sub-branch pulls zero code into the SDK (react-auth 3.43.0's `PrivyClientConfig.embeddedWallets` has no recovery option at all) → folded into edit 45. Superseded anyway: the recovery research shows the whole question is moot for V1 because the SDK never calls a mode-dependent API. |
| `spike-blocked-by-q7` | REFUTED (2/2, high) | Dropped as a blocker. A Privy app is self-service, free (Developer tier: 50K signatures/month, no card, no sales step) and takes ~10 minutes; test accounts and `http://localhost:port` origins are both toggles on an app you own. Promoting Q7 to a gate would manufacture an ops dependency on something the implementer can provision himself. **Kept:** the one clause naming where the spike app comes from, the Q7 retitle to "pre-merge, not pre-spike", and the fix to `brief.md`'s "Blocked on" line → folded into edit 27(c). |
| `duplicate-walletconnect-stack` | CONTESTED (1 survives, 1 refutes) | **Decided: act, but not for the stated reason.** The refuting vote is right that "two WalletConnect Core *majors*" is wrong (2.21.1 vs 2.22.4 are minors), that `wc@2:*` storage keys are the wrong mechanism (the real one is a **version-blind** `globalThis["_walletConnectCore_…"]` singleton whose second initializer adopts the first's crypto/relayer/pairing), and that the tree already carries three WC Core lines. It is **wrong**, though, that email-only login never constructs a Core: `loginMethods: ['email']` does not shrink `appearance.walletList`, and an anonymous `demo.privy.io` load fired the WalletConnect explorer API and wrote a Base Account store with no session. So the hazard is live **unless** the config disables it → edit 4 (config keys) + edit 38(b) (disclosure). Do not copy the finding's wording into the plan. |
| `stale-step0-branch`, `build-packages-is-a-noop`, `ctx-chains-name-collision`, `privy-entry-must-be-index-ts`, `new-build-scripts-outside-turbo-hash`, `isolation-gate-ignores-dts`, `canary-cooldown-override-does-not-exist`, `privy-demo-never-built-in-ci`, `skills-index-files-missing`, `ai-imports-fixture-already-covers-privy`, `snippets-fixture-has-no-subpath-mapping`, `ac3-proof-misses-the-actual-scenario`, `ac4-artifact-and-funding`, `pricing-pointer-hides-per-signature-metering`, `partner-guide-is-unmirrored`, `mfa-recommended-but-never-exercised`, `steps-not-individually-green`, `fold-thin-test-files`, `pr-163-collision-unaddressed`, `estimate-omits-blocked-time`, `shrink-source-type`, `spike-14-chains`, `privy-source-identity-churn`, `cut-session-probe` | not verified (minor / over cap) | **Adopted** — folded into edits 6, 7, 14, 19, 27, 29, 32, 35, 36, 37, 38, 39, 41, 42, 44, 51 and § 5. I re-verified the four that would have been embarrassing to take on trust: `pnpm build:packages` runs zero tasks (the task exists in `turbo.json`; no package implements the script), the `build` task declares **no `inputs`** so root `scripts/` are outside its hash while `checkTs` explicitly adds `$TURBO_ROOT$`, `.npmrc` sets `auto-install-peers = true`, and 8 of 9 `src/xchains/*` entries are `.ts`. The `index.tsx`-crashes-the-tsx-gate rationale I did **not** reproduce — `src/xchains/stellar/index.tsx` already exists and the gate passes today — so take `index.ts` on convention grounds (and because the file holds no JSX), not on the crash claim. |
| `cut-restore-use-client` | not verified (minor) | **Rejected.** The Next research settles it the other way: Next's own docs say a directive on a bundled entry is sufficient *and* warn that bundlers strip it, `banner` is verified not to survive, and stamping the entry makes a direct server-component import of the sub-path work. Keep the script, narrow it to `dist/privy/index.mjs` with an explicit never-touch assertion (edit 29b), and make the partner-wrapper sentence the load-bearing docs claim (edit 34e). |
| `cut-canary-workflow` | not verified (major) | **Partially adopted** as edit 37: fix it (out-of-workspace install) or cut it, decided in the plan rather than left implicit. Either is defensible; what is not defensible is shipping the version that cannot run and hides its own failure. |

---

## 4. Research answers the plan now relies on as fact

Every line below is read in a primary source. Privy versions: `@privy-io/react-auth@3.43.0` (published
2026-09-15), `@privy-io/chains@0.6.0`, `@privy-io/js-sdk-core@0.76.0`, all read 2026-09-18.

**Recovery / MFA / custody**
1. `setWalletRecovery()` on a TEE app throws `PrivyErrorCode.UNSUPPORTED_WALLET_TYPE` before any UI —
   `dist/esm/index-BcpLdFr2.mjs`, byte-identical in 3.40.0; the TEE predicate is
   `w => !!w.id && w.recoveryMethod === 'privy-v2'` (`dist/esm/user-DHmupS1J.mjs`).
2. New apps default to TEE; on-device is "an advanced configuration. Please reach out to enable this
   setting", per-app and one-way — docs.privy.io/security/wallet-infrastructure/advanced/user-device,
   docs.privy.io/recipes/tee-wallet-migration-guide.
3. `requireUserOwnedRecoveryOnCreate` / `userOwnedRecoveryOptions` are dashboard-only on the internal
   `AppConfig`, not on `PrivyClientConfig` — `dist/dts/types-ChU9ocPQ.d.ts:2148-2149` vs :1779-1860.
4. `mfa.noPromptOnMfaRequired` defaults to `false`, so Privy renders its own MFA modal from inside the
   SDK-mounted provider; the verification cache is 15 min by **default and dashboard-configurable** —
   docs.privy.io/authentication/user-authentication/mfa/*.
5. Key export cannot be prevented client-side: users can export via the REST API with their access
   token "even if an application does not implement Privy's `exportWallet` method" —
   docs.privy.io/wallets/wallets/export.
6. Losing the only login method is terminal — "No recovery is possible; the account cannot be accessed
   again … there is no backdoor" — docs.privy.io/user-management/users/managing-users/supporting-your-users.
7. There is no wallet-recovery documentation left to link: `docs.privy.io/llms.txt` (1074 lines) has one
   occurrence of "recovery" and zero setup pages.

**Chains / RPC**
8. Embedded-wallet RPC resolution is
   `chain.rpcUrls.privyWalletOverride → rpcConfig.rpcUrls[chainId] → chain.rpcUrls.privy + '?privyAppId=' → public ?? default`,
   and that one client does **both** `prepareTransactionRequest` and `sendRawTransaction` —
   `dist/esm/getPublicClient-Dt1701V_.mjs`, `dist/esm/index-BcpLdFr2.mjs`, `dist/esm/toViemAccount-B_eTbPuQ.mjs`.
9. `rpcConfig` is dashboard-supplied, not a `PrivyClientConfig` field (`dist/dts/types-ChU9ocPQ.d.ts:2098`
   vs :1492) — the chain object is the only in-code lever.
10. `addRpcUrlOverrideToChain(chain, url)` is just `{...chain, rpcUrls: {...chain.rpcUrls,
    privyWalletOverride: {http:[url]}}}`, and `viem@2.29.2`'s `Chain.rpcUrls` carries
    `[key: string]: ChainRpcUrls` (`_types/types/chain.d.ts:38-41`) — **no `@privy-io/chains` dependency
    needed**, and wagmi ignores the key (verified by me in the checkout).
11. `dedupeSupportedChains` does not dedupe: it grafts Privy's own proxy onto any supplied chain whose id
    matches a default entry carrying a `privy` key, **unless** the chain already has a
    `privyWalletOverride`. Six SODAX ids (1, 10, 56, 137, 8453, 42161) are affected.
12. `DEFAULT_SUPPORTED_CHAINS` is 32 chains; **id 999 is Zora Goerli Testnet**, and
    `addToDefaultChains()` drops any supplied chain whose id is already a default — which is exactly how
    `useGetTokenPrice` resolves the chain, so Privy's fiat price for HyperEVM would be fetched against a
    Zora testnet.
13. `PrivyProvider` never validates `supportedChains` against a registry; it throws only for an empty
    array and for `defaultChain` absent from the list. Rejection is per-operation: `Unsupported chainId
    <id>` (EIP 4901) on switch, and a different message on the send path.
14. Gas sponsorship cannot apply: `sponsor` is a per-call option on Privy's own `useSendTransaction`,
    TEE-only, dashboard-gated, server-side via CAIP-2.
15. Hedera units are already handled: `viem`'s `hedera` declares 18 decimals and
    `EvmSpokeService.ts:42-54` scales `msg.value` by 10^10 before the wallet sees it.
16. LightLink 1890's public replicator answers neither `eth_feeHistory` nor `eth_maxPriorityFeePerGas`
    and exposes no `baseFeePerGas` (live probes 2026-09-18); Hedera, Redbelly, Kaia, HyperEVM, Robinhood
    and Sonic all answer both.

**Session / mount**
17. Session keys, JSON-encoded in localStorage: `privy:token`, `privy:pat`, `privy:refresh_token`,
    `privy:id-token`, `privy:active-user`, `privy:saved-users`, plus user-scoped twins. **No
    sessionStorage, no IndexedDB** anywhere in either bundle.
18. Client cookies are **not** HttpOnly (`privy-token`, `privy-refresh-token`, `privy-id-token`,
    `privy-session='t'`), and in server-cookie mode `privy-session` must stay JS-readable **by
    construction** — it is the SDK's own trigger for attempting a restore. The one hole:
    `sessions.cookieWriteBehavior: 'never'` + server cookies leaves no readable signal.
19. `privy:caid` and `privy:connections` are written by **any** `PrivyProvider` mount, including an
    anonymous one, and survive logout — so "no `privy:*` key on device" is not evidence of no session.
20. The hidden auth iframe is rendered eagerly for every visitor, gated only on `isServerConfigLoaded`.
    `ready` **does not wait for it**: the handshake retries every 150 ms × 270 (~40 s) then only
    `console.warn`s, and embedded-wallet RPCs carry no timeout of their own.
21. `appearance.walletList` defaults to nine entries including `wallet_connect`/`coinbase_wallet`/
    `base_account`, and `externalWallets.walletConnect.enabled` defaults to `true`;
    `disableAllExternalWallets: true` short-circuits the whole connector manager and is `@experimental`.
22. There is **no** supported mount-free session API: the standalone `getAccessToken()` throws
    "No global PrivyClient instance found" until `PrivyProvider` has mounted, and `PrivyClient.session`
    is `private`. Any probe is an undocumented-key read.

**Next / packaging**
23. The published `@sodax/wallet-sdk-react@2.0.0-rc.17` `dist` has **zero** `'use client'` directives
    across `dist/index.mjs` and all 15 chunks; `@privy-io/react-auth@3.43.0` has none either. Cause
    reproduced with the repo's own tsup: `treeshake: true` routes through Rollup, which strips both the
    source directive and a `banner`.
24. Next 16 docs: a directive on a bundled entry is sufficient ("all of its imports and the components it
    directly renders are included in the client bundle"), plus an explicit "Advice for Library Authors"
    warning that bundlers strip directives.
25. `@privy-io/react-auth` **statically** imports `@walletconnect/ethereum-provider`; wagmi's
    `walletConnect()` uses `await import()` (`@wagmi/connectors@5.9.9 dist/esm/walletConnect.js:158`).
26. With `splitting: true`, one *value* import of `@privy-io/react-auth` from any module the barrel also
    reaches hoists the bare specifier into a shared chunk that `dist/index.mjs` imports (reproduced both
    ways in a fixture). `import type` is erased and safe. Turbopack offers no portable escape hatch —
    `turbopackOptional` is Turbopack-only, `webpackOptional` is supported by neither, and both work only
    on dynamic imports.
27. Cookie SSR is unaffected: `cookieToInitialState` reads only `config.storage.key` (verified by me at
    `@wagmi/core dist/esm/utils/cookie.js:22-30`), wagmi persists a partial connector stub, and
    `hydrate()` sets `status: 'reconnecting'` identically on server and client — so `layout.tsx` stays
    Privy-free and there is no mismatch.
28. Privy has **no** `@tanstack/react-query` dependency; React peer `^18 || ^19`; viem pinned at exactly
    2.56.0; zustand `^5.0.4` against the SDK's 4.5.2.

**wagmi (re-verified by me in the checkout, `@wagmi/core@2.20.3` / `wagmi@2.16.9`)**
29. `cookieStorage.setItem` writes `${key}=${value};path=/;samesite=Lax` — no `expires`, no `max-age`
    (`dist/esm/utils/cookie.js:9-14`); `EvmXService.ts:139-142` opts into it; the zustand store persists
    `xConnections` to **localStorage** (`useXWalletStore.ts:155-172`). Hence the asymmetry.
30. `createStorage`'s `getItem`/`setItem`/`removeItem` are all `async`, even over a synchronous backing
    store (`dist/esm/createStorage.js:13-27`).
31. `reconnect.js`: `:36-37` `recentConnectorId` scores 0 (first); `:46-82` sequential with **no
    `break`**; `:47` `getProvider` caught, `:59-61` `connect` caught, **`:56` `isAuthorized` is not**;
    `:97` `isReconnecting = false` sits outside any `finally`; `:67-74` the first success replaces the
    connection map; `:84-96` status is published only after the loop.
32. `getConnectorClient.js:14-21` calls `getAccounts()` and `getChainId()` together and `:32-39` throws
    `ConnectorChainMismatchError` on disagreement.
33. `SodaxWalletProvider.tsx:48-60` nests `EvmProvider` outermost, so its `{children}` is
    `SuiProvider(SolanaProvider(partner children))`.
34. `EvmHydrator`'s retry effect is gated on `status !== 'disconnected'` but has `status` and `connectors`
    in its deps, so a late mipd announce is **delayed, not dropped**; `wasConnectedRef` +
    `unsetXConnection('EVM')` is the path that silently clears a persisted connection.

**Precedent**
35. sushiswap ships a plain Privy wagmi connector on `master` (`7fbb578`), with a framework-free runtime
    store, a lazy `PrivyRuntimeGate`, a `createDeferredPrivyEvmProvider` shell, per-attempt
    `AbortController`s, an untimed login modal, a `getWagmiState` injection to avoid clobbering a
    user-selected wallet, and a 21-case unit suite using real `@wagmi/core` with **zero** Privy imports.
36. `createWallet()` throws for a user who already has an embedded wallet, and the authoritative check is
    `user.linkedAccounts`, not `useWallets()` (`dist/dts/index.d.ts:2986-2999`).
37. `useLogin().login` is **synchronous and returns `void`** (`dist/dts/index.d.ts:2137-2142`), which is
    why the deferred bridge is structurally required; `useCreateWallet().createWallet()` does return a
    Promise. `login` also has a `MouseEvent` overload — always call it as `login({...})`, never pass it
    as an `onClick` handler.
38. Privy's login UI is a Headless UI `Dialog`, which marks the rest of the page `inert` while open.

---

## 5. The spike list after this round

Eight items → **five**, and the first needs no Privy app.

| # | Item | Why it survives |
| --- | --- | --- |
| 0 | **Turbopack prerender go/no-go.** `pnpm --filter example-next-js-16 verify` with `PrivyProvider` mounted (dummy `appId` is fine), under `next build` (Turbopack, scope hoisting on) **and** `next build --webpack`. Also check for a hydration warning on the first client render. | The one thing no amount of reading settles. Privy's static `@walletconnect/ethereum-provider` import puts that module's init on the prerender path; the same bug class cost this repo a cycle in #1070. Budget for a `@sodax/libs`-style stub if it reproduces. |
| 1 | **Install + build + gates.** Two `trustPolicyExclude` entries, exact devDependency, then `pnpm i && TURBO_CONCURRENCY=2 pnpm build && pnpm checkTs && pnpm check-exports && pnpm check:knip`. Confirm `import('@privy-io/react-auth')` resolves the nested viem 2.56.0 under pnpm's isolated layout, and that `attw --pack --profile esm-only` tolerates a subpath whose only external import is an absent optional peer. | Cheap, and the `attw` half is genuinely unknown. |
| 2 | **Signing acceptance for the six unregistered chain ids** (295, 151, 1890, 8217, 146, 4663). Create an embedded wallet on a free dev app and call the provider with a 0-value self-transfer on each chain: the **sign** call fails before broadcast if the id is rejected, so **no funds are needed** to learn that. | No published allowlist exists; the client only forwards `chain_id`. This is the last real unknown in Risk 7. |
| 3 | **End-to-end send on the three riskiest chains** — Hedera 295, LightLink 1890, Redbelly 151 — with `privyWalletOverride` pointing at the SDK's configured `rpcUrl` so the test matches shipped behaviour, and devtools network capture proving which endpoint served `eth_estimateGas` / `eth_sendRawTransaction`. Do Redbelly first (it gates account activity on identity verification). | Needs dust funding and an owner (see Q6). LightLink is the one chain whose default RPC lacks `eth_feeHistory` and `baseFeePerGas`. |
| 4 | **Config + MFA behaviour on a live app**: (a) `disableAllExternalWallets: true` + `walletList: []` leaves the email modal fully functional (the flag is `@experimental` and undocumented on the setup page); (b) an MFA-enrolled user signs through the wagmi `provider.request` path — does the prompt interact badly with the connector's connecting state, and does the 15-minute cache suppress the second prompt; (c) whether `useLogin`'s `onError` fires for recoverable in-modal errors (wrong OTP, failed send-code), which decides whether our `exited_auth_flow`-only rule is a correctness fix or merely equivalent; (d) returning-user `ready` latency and demo bundle delta. | All four need a live app and a real user; none blocks the branch. |

**Moved out of the spike, with where the answer now lives:**

- *old item 3 (`createOnLogin` timing)* → no longer load-bearing: step 2 branches on `authenticated`
  and gates `createWallet()` on `linkedAccounts` (edit 16), which is correct under either ordering.
  Confirm during QA.
- *old item 4 (chain switch / provider chain)* → **answered from source**: `embedded.switchChain` is a
  React setState only and `getEthereumProvider()` mints a new provider pinned to the captured chain.
  Converted into the acceptance criterion in edit 23 and unit case 9 in edit 32.
- *old item 5 (session keys / HttpOnly)* → **answered**: keys verified, `privy-session` readable by
  construction in cookie mode, `cookieWriteBehavior: 'never'` is the one hole — and it no longer gates
  `isAuthorized()` at all (edit 19), so a wrong answer costs a deferred mount and nothing else.
- *old item 6 (switch + send on all 14)* → reduced to item 3 above; full coverage moves to the QA matrix
  as "switch works on all 14; send verified on the subset the docs name".
- *old item 7 (`'use client'` line 1)* → **answered** by the tsup fixture reproduction; becomes a
  build-gate assertion (edit 29b).
- *old item 8 (anonymous iframe)* → **answered**: the iframe is eager, gated only on
  `isServerConfigLoaded`, observed live. Only the bundle-delta measurement survives, folded into item 4d.

---

## 6. Open questions for product (replaces the plan's eight)

1. **Do we ship on Privy's default TEE environment?** — accepting that a user who loses their email
   loses the wallet with **no support path and no backdoor**, in Privy's own words. The alternative is
   asking Privy to enable on-device execution, which buys user-managed recovery but is a one-way,
   per-app, support-gated switch with a more limited feature set. *This is a product decision, not an
   engineering one, and it no longer blocks anything: the SDK calls no mode-dependent API and the docs
   can be written today.* Sub-decisions: (a) do we require wallet MFA to be enabled in the dashboard for
   a SODAX-blessed Privy app, and do we prompt enrolment in the demo? (b) do we tell users to export
   their key as the documented fallback?
2. **Whose `appId`?** — partner-owned (the design default: partner controls origins, MFA, cookies, legal
   URLs and **billing**; addresses differ per partner) or SODAX-provided (one wallet across integrations;
   SODAX allow-lists every partner origin, pays the fees, holds the secret, and all partner sites share
   one trust boundary). Note the cost shape that makes this sharper than it looks: Privy meters **per
   signing request**, and one SODAX swap/intent costs several signatures — the `appId` owner is the
   billed party.
3. **Disconnect semantics.** V1 = a SODAX disconnect signs the user out of Privy (shared-device safety).
   OK, or do partners who also use Privy for app auth need a keep-session mode?
4. **Which chains must be send-verified for V1, and who funds them?** 7 of the 14 are outside Privy's
   registry; the docs will name the tested subset honestly either way. This decides spike item 3's scope
   and needs a named owner plus a gas budget.
5. **Are we willing to publish the partner guide as written?** — specifically the two sentences that say
   plainly (a) no signing is possible while Privy is unreachable, mid-intent included, and (b) a lost
   email is a lost wallet. Both are Privy's own documented positions, but they belong to product, not to
   engineering.
6. **Demo scope.** Privy only in `apps/wallet-modal-example`, or also a swap-intent demo in `apps/demo`
   (which adds the peer there)?
7. **Dashboard ownership for QA and the demo — pre-merge, not pre-spike.** The spike runs on a
   throwaway personal app; this decides who owns the app used for PR QA, the demo `.env`, and any
   long-lived origin/MFA settings — and it means the PR must not ship pointing at a personal `appId`.
8. **Two defaults to confirm in review rather than debate**: `showWalletUIs` left to the dashboard (note
   that if Privy's own wallet UIs are ever enabled, the HyperEVM fiat price line is known-wrong and the
   modals are untested on the 7 unregistered chains), and **Sonic (146)** as the embedded wallet's
   default chain. Plus: OK to raise the catalog viem to ≥ 2.44 (ideally 2.56.0) in a follow-up so
   npm/yarn partners cannot hit the hoisting crash?
