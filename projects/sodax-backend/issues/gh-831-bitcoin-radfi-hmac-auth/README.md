# GH-831 — Bitcoin swap blocked: RadFi backend auth (overview)

> **At-a-glance summary.** Full detail in the sibling files:
> [`issue.md`](./issue.md) (source/problem) · [`plan.md`](./plan.md) (the plan) ·
> [`process.md`](./process.md) (research + design-decision trail) ·
> [`outcome.md`](./outcome.md) (result, once done).

## The one-paragraph version

`swaps-api` builds Bitcoin swap intents via `@sodax/sdk` `createIntent({ raw: true })`.
For Bitcoin that raw build calls the **Bound Exchange (RadFi)** API server-to-server.
RadFi used to block us by IP allowlist (our backend has no fixed egress IP). **That is
now resolved**: RadFi agreed to authenticate our backend with **HMAC-SHA256 signed
requests** (`x-api-signature` header) using a dedicated credential pair, while the
**user's** Bound access token keeps flowing through unchanged for per-user scoping.
This issue is the **engineering to implement that** — it is *not* about RadFi
coordination (already settled in the issue comments).

## What we actually have to build

Two things, threaded end-to-end through the SDK and swaps-api:

1. **Per-user token pass-through** — accept the user's Bound access token on the
   swaps-api request and forward it into `createIntent` as `extras.bound.accessToken`.
2. **Backend HMAC auth** — sign every RadFi request with `x-api-signature` derived
   from `SODAX_API_SECRET_KEY` + `SODAX_API_SECRET_WORD`.

## The key design decision

The HMAC credential and signing logic live in the **backend provider**
(`sodax.provider.ts`), **not** baked into the SDK as stateful config. The SDK gains a
small **stateless signer hook** (`RadfiSigner`) that it merely calls per request; the
backend supplies the closure that holds the secret and computes the signature. This
keeps the shared SDK singleton free of any per-deployment secret or per-user token
state. (Rationale + rejected alternatives — secret-in-config, signing-proxy,
monkey-patching global `fetch` — are recorded in `process.md`.)

## Cross-repo + version reality (verified against published artifacts)

| Capability | rc.14 (current pin) | rc.15–rc.18 (published) | Action |
|---|---|---|---|
| `chains.bitcoin.radfi` config on `Sodax` | ✅ | ✅ | provider just passes it |
| `extras.bound.accessToken` (user token) | ❌ | ✅ (since rc.15, #237) | comes free with the pin bump |
| HMAC `x-api-signature` signer hook | ❌ | ❌ (exists nowhere) | **net-new SDK change + a new release (~rc.19)** |

So: **one SDK change** (add the stateless signer hook) → **publish ~rc.19** (which also
carries the rc.15+ token plumbing) → **swaps-api bumps once** and wires everything.
The SDK release is a one-directional blocking gate for the backend work.

## Status

- [x] Analyzed, researched, plan written (this folder).
- [ ] Awaiting review (matterhorn) + a few decisions to confirm — see
  "Open decisions" in `plan.md`.
- [ ] SDK signer hook + release (~rc.19).
- [ ] swaps-api wiring (bump, config/env, provider, DTO threading, docs, tests).

## Confirm-before-coding shortlist

1. HMAC wire format with RadFi: timestamp **ms** + **hex** digest (RadFi's own example
   implies this) — pin it in a test before publishing the SDK.
2. Signer hook shape: return **headers** (recommended) vs inject a whole **`fetch`**.
3. Scope of `x-api-signature`: only the Sodax `apiUrl` endpoints, or the `umsUrl`
   calls too.
4. SDK release ownership + branch (cut from main/release, **not** `feat/bridge-api-v2`).
