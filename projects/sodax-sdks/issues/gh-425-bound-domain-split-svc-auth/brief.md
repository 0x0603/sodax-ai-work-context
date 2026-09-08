---
type: brief
repo: sodax-sdks
github: 425
status: Active
next: Run artifacts/probe-bound-hosts.sh from canary (Step 0), then browser-test CORS on api.radfi.co
updated: 2026-09-08
---

# GH-425 Bound Domain Split · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

Bound completed the endpoint mapping on 2026-09-08. Every endpoint we call now has a named
host — and the answer is **four hosts, not two**. The plan is written for a single pass;
`plan.md` is current and ready for review. **No code written yet.**

| Ticket | Scope |
| --- | --- |
| sodax-sdks#425 | parent / coordination |
| sodax-sdks#426 | SDK: two new base-URL fields + host-declared routing (PR 1) |
| sodax-backend#1215 | swaps-api + bridge-api `RADFI_AUTH_URL` (PR 2) |

## The mapping, complete

```
svc.bound.exchange       /api/sodax/*                              backend 1 + browser 1
auth.bound.exchange      /api/auth/*, /api/wallets/*               backend 1 + browser 3
api.radfi.co             /api/transactions/*                       browser 3
api.ums.bound.exchange   /api/wallets/balance, /api/utxos          browser 2   (unchanged)
api.bound.exchange       — DEPRECATED, date TBD
```

`/api/transactions/*` → `api.radfi.co` is the surprise: Bound is retiring the newer brand
host and routing that family back to the older RadFi domain. Verified same backend as svc
(same `radfi-be` 404 shape on `/.well-known/jwks.json`), own `*.radfi.co` certificate.

**Config goes from 2 base URLs to 4.** `RadfiConfig` gains **two** optional fields
(`authUrl`, `transactionsUrl`) — but the packaged `chains.ts` default deliberately carries
**`apiUrl` only**. The companions live in an exported `BOUND_HOSTS` lookup table
keyed by api host, resolved in `RadfiProvider` with a plain `??` chain — no `if`, no
`switch`, no ternary for host selection. That is not a style choice: putting them in the default
would let `deepMerge` leave a partial override holding mainnet companion hosts, silently
straddling environments — and it would falsify every "falls back unchanged" claim in the
plan. See `plan.md` §Why the default carries `apiUrl` only.

## Next action

1. **Step 0** — run `artifacts/probe-bound-hosts.sh` from a whitelisted environment (canary
   swaps-api's host). From a laptop every `/api/*` path returns the gate's 403.
2. **CORS test from a real browser** — the script cannot cover it, and it is the
   highest-severity risk in the plan. See below.

## Highest risk: CORS on api.radfi.co

All three `/api/transactions/*` calls run **from the browser** with a user JWT, and
`api.radfi.co` is a *different registrable domain*. Our own code records that radfi.co URLs
once stopped answering and broke Bound sign-in
(`intents-whitelabel/src/lib/rpc.ts:38-39`). Preflight cannot be tested from outside — all
hosts gate `OPTIONS` with 403. Ask Bound to confirm the origin allowlist, and verify a real
BTC withdraw from a browser on canary before trusting the migration.

## Open with Bound

1. Is `api.radfi.co` itself on a deprecation path? Routing to a legacy brand domain reads
   as transitional — we do not want to migrate this family twice.
2. CORS / origin allowlist on `api.radfi.co` (above).
3. Does the `api.bound.exchange` deprecation cover `signet.api.` and `staging.api.`? No
   `svc.`/`auth.` equivalents exist for those in DNS.
4. Deprecation date — we asked for their **minimum notice** rather than committing a date,
   since consumer SDK adoption, not our release, is the long pole.

## Settled — do not re-litigate

- **One pass**, two PRs, one per repo. Do not stack PR 2 on #1097's branch.
- **SDK ships first**, but PR 2 is coded in parallel against a locally-linked SDK via
  `pnpm.overrides`. **Revert the override before committing.**
- **Both new fields are optional, and the packaged default sets neither.** Overriding
  `radfi.apiUrl` alone moves every family to that host — today's semantics, and the reason
  a partial override cannot straddle. Old-host, signet/staging and the backend all rely on
  this.
- **The host is declared at each call site, not derived from the path.** `request()` takes a
  required `RadfiHost` first parameter, so an unrouted call fails to compile rather than
  falling through to `apiUrl`. No prefix or segment matching anywhere.
- **Backend scope shrank**: it calls exactly 2 endpoints (`/wallets/details` on auth,
  `/sodax/transaction` on svc), never `/transactions/*` or UMS. So PR 2 needs
  `RADFI_AUTH_URL` only — no transactions override for a call it does not make.
- **Keep signing every host** because it is today's behaviour, not for a rate-limit bypass
  — that rationale was wrong; see `plan.md` §Q4.
- **intents-whitelabel is out of scope**, but it is the only live consumer of
  `useRadfiWithdraw` — **BTC withdrawal breaks first** when the old host dies. Schedule its
  SDK bump against the deprecation date.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The design, the steps, the risks, the Bound reply, the evidence | `plan.md` | 9k |
| Full endpoint inventory: backend vs browser, per host | `plan.md` §Endpoint inventory | — |
| Why any claim is true; commands to re-run | `plan.md` §Appendix | — |
| Step 0 itself | `artifacts/probe-bound-hosts.sh` | 1.6k |
| Session log | `process.md` | 3k |
| Bound's original mapping + the five questions as filed | GitHub #425 (body) | — |

**The ticket bodies are now partly wrong** — `plan.md` §Corrections lists seven statements
verification contradicted. Prefer `plan.md`.

## Landmines

- **Verify against the default branch, never the working tree.** `sodax-backend` is checked
  out on PR #1097's branch, where bridge-api has Radfi config it does **not** have on
  `development`. `git diff main...HEAD` also hides commits `main` gained after the branch
  point — that is how an earlier pass wrongly concluded `.changeset/` was gone.
- **The local `pnpm.overrides` must never reach a PR.** Check
  `git diff origin/development -- package.json` before every push.
- **`radfiEndpointOverride`'s `field` param is typed `'apiUrl' | 'umsUrl'`** — widen it.
- **`IsRadfiConfig` uses `forbidNonWhitelisted: true`** — emitting `authUrl` without a
  matching DTO field aborts the boot.
- **Two different `transactions`.** `/api/sodax/transactions` is on svc and we never call
  it; `/api/transactions` is on `api.radfi.co` and we call it 5×.
- **`/wallets/balance` and `/utxos` bypass `request()`** and build from `umsUrl`. There is
  deliberately no `'ums'` member of `RadfiHost`, so a refactor routing either through
  `request()` has to name a host that does not fit — the mistake surfaces instead of
  silently landing on the auth host.
- **`bitcoin-raw-intent-check.ts:102`** gates its logger on `url.includes('bound.exchange')`
  — that now misses `api.radfi.co`.
- **`apps/node` bypasses `RadfiProvider`** with raw `fetch` and hardcoded signet/staging
  hosts. No split hosts exist there.
- **`common.ts` `radfiApiUrl`/`radfiUmsUrl` is read by nobody.** #426 item 4 says otherwise.
- **Never hand-edit `CONFIG_VERSION`**, and do not write a changeset.
- **A misrouted host returns the ALB's HTML 403**, surfacing as `RadfiApiError: … non-JSON
  response (HTTP 403)`, matching *neither* branch of the backend's `radfiFailureKind`.
