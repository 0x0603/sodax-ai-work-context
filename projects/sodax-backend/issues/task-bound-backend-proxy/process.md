---
type: process
repo: sodax-backend
github:
updated: 2026-07-31
---

# Process

## Log

### 2026-07-30 — Discord thread with R0bi7 (raw)

Verbatim, secrets redacted. Timestamps as shown in Discord ("Yesterday" = 2026-07-30).

> **0xmatterhorn — 17:13**
> hi @R0bi7
> is the purpose of swap-api to route all user-facing APIs through our backend, or only a
> subset of them? Right now, for Bitcoin, APIs like getAuthToken and signMessage still go
> directly through the RadFi team's API
>
> **R0bi7 — 17:45**
> yeah optimally all, but bitcoin is an issue right now because RadFi can't whitelist our
> backend
>
> **0xmatterhorn — 17:49**
> they've already provided the API key, and I'm working on that part now
> one thing I'm not sure about: for Bitcoin swaps, we need to call this authentication API
> to get the trading address: https://api.bound.exchange/api/auth/authenticate. But I don't
> see this flow in the swap-api yet
> *(screenshot)*
> I don't think this belongs in the swap-api. It's a generic authentication flow, not
> swap-specific. The bridge-api also needs it, and I expect other repositories will too
>
> **R0bi7 — 17:52**
> are you sure, because last time I checked whitelisting backend was not an option?
> and if that is not yet enabled through API then we need to add it (we act as kind of proxy)
>
> **0xmatterhorn — 17:55**
> yeah, they've already provided me with the `BOUND_API_SECRET_KEY` and
> `BOUND_API_SECRET_WORD`, I'm already working on the access token part
> what I mean is, should we move all Bound-related functionality into our backend? For
> example, https://api.bound.exchange/api/auth/authenticate requires browser whitelisting
> before users can obtain their trading wallet. Handling this through our backend would
> avoid that dependency for SDK users. This isn't related to what we discussed previously
> about the access token.
>
> **R0bi7 — 18:01**
> yep we should
> given that this is reusable piece I would even add this (in backend repo) as a radfi
> package (move logic in there) to be easily re-used in all features
> since we will need this in each feature enabling bitcoin flow through radfi
> and we probably do not want to make another new backend API just for that purpose
> Initially just enable it in swaps api
>
> **0xmatterhorn — 18:07**
> so this is the follow-up right?
> I'm currently implementing HMAC signing in the backend to generate the raw data
>
> **R0bi7 — 18:26**
> yep
>
> **0xmatterhorn — 18:31**
> earlier in the meeting, Fez mentioned there were some challenges with implementing
> Bitcoin. I'm not sure what he meant. Was that related to what we were just discussing?
>
> **R0bi7 — 18:32**
> yeah, he said that RadFi does not seem to yet support whitelisting our backend even if we
> have API key
>
> **0xmatterhorn — 18:36**
> I just tested a swap, and it looks like the API key is now working on our backend
> (swap-api)
> https://mempool.space/tx/e8784d6c662ecdc734b4e9842b91db005faca64d0e6e49bc5a5c87b198b81a8f
> for the parts not related to swap-api
> browser => RadFi (still need domain whitelisting)
> https://api.bound.exchange/api/auth/authenticate
> https://api.bound.exchange/api/auth/refresh-token
> https://api.bound.exchange/api/sodax/transaction/sign
>
> **R0bi7 — 18:46**
> hmm that is interesting
> can you run that by RadFI to make sure our backend will be able to do that using API key
> they provided?
> Just double making sure
>
> **0xmatterhorn — 18:52**
> https://github.com/icon-project/sodax-backend/issues/831
> yeah, it works on my end. I tested it as well
>
> **R0bi7 — 18:54**
> awesome
> then please capture work remaining and create a task inside icon-project sdks or backend
>
> **0xmatterhorn — 18:55**
> `"secretKey": "[REDACTED — test credential, pasted in plaintext in Discord; rotate]"`
> `"secret word": "[REDACTED — same]"`
>
> **0xmatterhorn — 18:56**
> do you mean this part?
>
> **R0bi7 — 19:04**
> yeah
> and the fact that backend secret key + word can work for backend acting as proxy
>
> **0xmatterhorn — 19:11**
> yeah, these parts need RadFi team support for using the secret key. Currently, they only
> support the APIs that generate raw data
> I'll create an issue to keep track of this

**Secret handling note.** The credential pair was pasted in plaintext into a Discord
channel. They are test credentials, so this is not an incident — but Discord is a permanent
log, so rotate before production and never paste them into a GitHub issue. They belong in
env / the secret manager only (`BOUND_API_SECRET_KEY`, `BOUND_API_SECRET_WORD` —
`.env-example:263-274`).

### 2026-07-31 — code inventory before designing

Mapped the full Bound surface across the workspace before proposing anything. See
"Findings" below.

## Findings

### F1 — The backend has no Bound client; it uses the SDK

`apps/swaps-api/src/shared/providers/sodax.provider.ts` constructs
`new Sodax({ radfi: { signRequest } })` where `signRequest` is a closure computing
`HMAC_SHA256(secretKey, secretWord + "_" + timestamp)` → `x-api-signature`. The SDK's
`RadfiProvider` then makes every Bound call. The secret never enters the SDK as data.

Consequence: the "reusable radfi package" R0bi7 asked for is mostly **already written** —
it is `@sodax/sdk`'s `RadfiProvider`. What is not reusable is ~30 lines of Nest wiring plus
`RadfiConfigClass` / `buildRadfiConfig()`, which currently live inside `apps/swaps-api`.
That is what should move into a package. Writing a *second* Bound HTTP client would
duplicate 655 lines and immediately drift. → decision D1 in `plan.md`.

### F2 — The whole Bound surface is one SDK file, 15 endpoints

`packages/sdk/src/shared/entities/btc/RadfiProvider.ts`. Everything routes through the
private `request()` (`:639-646`), which builds `${config.apiUrl}${endpoint}` and merges the
optional signer's headers — except the two UMS calls, which `fetch()` directly and are
deliberately unsigned (UMS accepts no Sodax credential).

Full table in `artifacts/sdk-issue-draft.md`.

### F3 — Two independent credentials

`Authorization: Bearer <user token>` (per-user, from the BIP-322 sign-in) and
`x-api-signature` (per-backend HMAC) are separate. `docs/CONFIGURE_SDK.md:177` states the
signer's headers are merged **last** and must not return `Authorization`, or it would
clobber the user bearer. A proxy must forward the user's `Authorization` untouched and add
the HMAC itself.

### F4 — `ConfigService.initialize()` is a no-op

`packages/sdk/src/shared/config/ConfigService.ts:133-160` — the dynamic config fetch and
re-layer are commented out under `TODO(config-v2)`. So `chains.bitcoin.radfi.apiUrl` comes
only from the packaged static defaults (`@sodax/types` `chains.ts:837-844`) or an explicit
`new Sodax({ chains: ... })` override.

This corrects an earlier assumption in this session that the Bound URL could be flipped
server-side without an SDK release. It cannot, today. It also makes step 4 of the plan
cheaper than expected: a consumer can opt into the proxy with **zero SDK code change**,
which is why the rollout is per-consumer env first, SDK default second.

### F5 — `RadfiProvider` is stateful; the backend singleton is not obviously safe

`accessToken` / `refreshToken` are public mutable instance fields and `resolveAuth()` falls
back to `this.accessToken || this.config.apiKey`. `gh-831`'s `outcome.md` follow-up #5
already documents that one `Sodax` singleton serving all swaps-api requests is safe today
only by five independent coincidences, four of them in SDK code the backend does not own.
A proxy adds call sites, so this has to become an enforced invariant. → decision D3.

### F6 — Consumers already have the switch wired

`intents-whitelabel/src/lib/rpc.ts:35-38` reads `NEXT_PUBLIC_BOUND_API_URL` /
`NEXT_PUBLIC_BOUND_UMS_URL` with the Bound production URLs as defaults. Pointing that app
at the proxy is an env change.

## Changes During Work

Nothing implemented yet — design + inventory only.
