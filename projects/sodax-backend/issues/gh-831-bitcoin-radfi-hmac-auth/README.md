# GH-831 — Bitcoin swap blocked: RadFi backend auth (overview)

> **At-a-glance summary.** Full detail in the sibling files:
> [`issue.md`](./issue.md) (source/problem) · [`plan.md`](./plan.md) (the plan) ·
> [`process.md`](./process.md) (research + design-decision trail) ·
> [`outcome.md`](./outcome.md) (result, once done).

> **Status 2026-07-31 (later) — round-2 tiers 1–2 applied.** F13a + F18 (both PR bodies rewritten
> against the code) and F12a (`rc.19` → `2.1.0`) are live on GitHub. **F11** (placeholder
> credential in `test/vitest.setup.ts` — e2e back to 9/9 files, 256 tests) and **F14** (UMS
> call-site comments) are **uncommitted working-tree changes** in `sodax-backend` /
> `sodax-sdks`. Left: F13b, F17, F15, then F12b (blocked on the release) and F16.
>
> **Status 2026-07-31 — F1–F6 landed; 2 new blockers found, nothing merged.**
> SDK #322 is ready (not draft, CI green, awaiting review); BE #1028 is still draft.
> New: **F11** — F4's boot-time credential check runs at *module scope*, so 5 of 9 swaps-api
> e2e specs fail to import without `BOUND_API_SECRET_*` ⇒ CI `pnpm test` red (reproduced);
> **F12** — the whole `rc.19` release story is stale (npm `latest` = 2.0.0, `rc` = rc.21; the
> changeset is `minor` ⇒ **2.1.0**, and the BE pin fell back to rc.21). Round-2 list F11–F18 →
> "Follow-up — round 2" in `plan.md`; evidence → `process.md` (2026-07-31).
>
> **Status 2026-07-30 — both PRs reviewed; fixes pending, nothing merged.**
> Design holds, no redesign. **1 regression** (the Bitcoin `bound.accessToken` rule sits on
> `CreateIntentParamsDto`, so it also fires on `/swaps/allowance/check` + `/swaps/approve`,
> which never call Bound), **2 release blockers** (no changeset; dead `body` field on the
> public `RadfiSignContext`), plus doc-vs-code drift. Ordered fix list F1–F10 →
> "Follow-up — review fixes" in `plan.md`; trail + audit of the review → `process.md`.
>
> **Status 2026-07-28 — read `outcome.md` before touching this.**
> PRs: [sdks#322](https://github.com/icon-project/sodax-sdks/pull/322) (ready),
> [backend#1028](https://github.com/icon-project/sodax-backend/pull/1028) (draft).
> Bound has been reached for real — a Bitcoin `createIntent` returns
> `sodax.apiSignatureMismatch` with placeholder secrets, i.e. the `x-api-signature` header is
> received and verified and the IP barrier is gone. One thing blocks the merge: the SDK must
> publish before the BE can typecheck. A duplicate BE branch/PR (#1027) existed briefly and has
> been folded into #1028 — see "Reconciliation" in `outcome.md` for what was kept from each.

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
   from `BOUND_API_SECRET_KEY` + `BOUND_API_SECRET_WORD` (Bound issues the pair under the
   `SODAX_` name — renamed in-repo on 2026-07-30, see `plan.md`).

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
| HMAC `x-api-signature` signer hook | ❌ | ❌ (exists nowhere) | **net-new SDK change + a new release (2.1.0)** |

So: **one SDK change** (add the stateless signer hook) → **publish 2.1.0** (which also
carries the rc.15+ token plumbing) → **swaps-api bumps once** and wires everything.
The SDK release is a one-directional blocking gate for the backend work.

## Status

- [x] Analyzed, researched, plan written (this folder).
- [x] Open decisions researched — most resolved internally; see "Decisions" in `plan.md`.
- [x] **SDK signer hook implemented + tested** — `sodax-sdks` branch `feat/radfi-backend-signer`
  (2 commits, all SDK tests green). Release `2.1.0` still to be cut/published.
- [x] **swaps-api wiring implemented + tested** — `sodax-backend` branch
  `feat/swaps-api-radfi-hmac` (5 commits; checkTs 14/14, unit 247/247 green).
- [ ] Review (matterhorn) → see `outcome.md` (⚠️ includes `--no-verify` disclosure + local-link caveats).
- [x] **Self-review of both PRs (2026-07-30)** — F1–F10 in `plan.md`; audit in `process.md`.
- [ ] Apply F1–F4 (regression + release blockers), then F5–F10.
- [ ] Publish SDK 2.1.0, then bump/install/push swaps-api + open PR. External confirms below.

> **Implementation complete on local branches (unpushed, no PR).** Full status, commit list,
> verification, and honest caveats in [`outcome.md`](./outcome.md).

## Resolved internally (code-backed)

- **Signer hook (D2):** `signRequest(ctx) → headers`, on the runtime
  `SodaxOptionalConfig.radfi` channel (seam verified, 6 edit sites).
- **HMAC (D1):** ms timestamp + lowercase hex. Test vector verified (`node:crypto` +
  `openssl`): `sk_abc123`/`sw_xyz789`/`1719396000000` →
  `f1cc08944bf1f22ad840eb10253cbc0b3e0f7a871034e5e1c29ae15565f1553e_1719396000000`.
- **Scope (D3):** sign only the `apiUrl` `request()` calls; `umsUrl` is dapp-kit-only.
- **Transport (D5):** request body, nested `bound: { accessToken }`.
- **Secret (D7):** raw env var on swaps-api only (Coolify), redacted, fail-fast; rotate via
  env + redeploy.
- **Release (D4):** `@sdks@2.1.0` from the live `release` branch. (Planned as `rc.19` on
  2026-07-01; `2.0.0` stable shipped meanwhile and the changeset is `minor` — see F12.)

## Two findings that widened scope

- `forbidNonWhitelisted: true` on the global pipe ⇒ the `bound` DTO field is **mandatory**
  (without it the client's token is 400'd before the service).
- `GET /swaps/quote?includeTxData=true` for a Bitcoin source is **broken today** — needs the
  same token threading (B4b), or an explicit descope.

## RadFi already answered (in their issue response comment)

HMAC format (hex + ms + message structure + 60 s), headers = `x-api-signature` +
`Authorization: Bearer` only (**no `x-api-key` key-id** — earlier concern retracted),
credential scoped to the Sodax endpoints (so `umsUrl` not covered), user token unchanged.
So the RadFi side is essentially settled.

## Still genuinely open

- 🔶 **RadFi (ops/non-blocking):** issue the **real `SECRET_KEY`/`SECRET_WORD`** pair; a
  one-line byte-match of the test vector (their example used a placeholder); dual-key
  rotation support.
- 🔶 **SDK owner:** release branch (`release`) + that `2.1.0` is the next number + who cuts it.
- 🔶 **#831 / product:** thread vs descope `getQuote?includeTxData` for Bitcoin.
