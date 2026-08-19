---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-19
updated: 2026-08-19
---

# 2026-08-19 (later still) — Direct re-verification: passkey login is genuinely emailless, and why per-credential PRF salt blocks copying it

User pushed back on a client-flow explanation ("Bound đâu có nhập email cho case này?") after I
described SODAX's own current plan default (email-first for both login paths) as if it were
Bound's behavior. The pushback was correct — that conflation is exactly the failure mode this
thread already burned itself on once (fourth pass, above). User then asked to check directly
against Bound's actual client/server source rather than trust either the plan file or an earlier
knowledge note.

## Method

Both reference clones still resolve at the commits the existing knowledge files cite —
`radfi-be @ c1c1e06`, `radfi-web @ 15ac098` (`git log -1` on both, unchanged since 2026-08-18) — so
this was a direct re-read, not a re-clone. Read live, not paraphrased from
[[bound-auth-mechanism]]/[[bound-client-crypto]]:

- `radfi-web/src/auth/webauthn.ts:251-345` (`registerPasskey`) and `:443-500`
  (`getDiscoverablePasskeyAssertion`)
- `radfi-web/src/components/bound/AuthModal.tsx:443-537` (`handlePasswordLogin`) and `:543-614`
  (`handlePasskeyLogin`)
- `radfi-be/src/modules/auth/auth.service.ts:939-998` (`loginWithPasskey`), `:1077` (`srpInit`),
  `:1116` (`srpVerify`)
- `radfi-be/src/modules/account/account.controller.ts` — full route list

## Result: every existing claim in the two knowledge files held, no corrections needed

`loginWithPasskey(dto: LoginDto)` confirmed to take only `credentialId, challengeId,
webauthnAssertion` — no email field in the DTO at all; the account is located by
`findOne({credentialId})`. `getDiscoverablePasskeyAssertion` confirmed to omit `allowCredentials`
and pass the global `PRF_SALT` constant. Nothing here contradicts
[[bound-auth-mechanism]]/[[bound-client-crypto]] — this was a confirmation pass, not a correction
pass.

## New finding: the root cause of why Q14 (plan.md) is genuinely unresolved, not just an unverified library detail

Bound's emailless login isn't just "discoverable credential, no `allowCredentials`" — it works
*because* the PRF salt is one global hardcoded constant (`keystore.ts:67`), so the client can pass
it into `get()`'s `eval.first` **before** knowing which credential the browser will resolve. Our
own plan explicitly rejects a global PRF salt as an anti-pattern to fix (per-credential salt
instead — item 4 in `plan.md`'s irreversible-decisions list, and
[[bound-client-crypto]] §9 "Do not take" #8). A per-credential salt cannot be looked up before the
credential is known, which is exactly the thing "emailless" gives up. So two decisions already in
`plan.md` are in tension, not independent — written up in full under open question 14 there,
including the three real resolutions (keep per-credential salt + email-first; copy Bound's global
salt; or a two-step ceremony that risks the same challenge-TTL failure Bound hit and reverted from,
[[plan-sdk-integration]] item B).

## Secondary finding: how a Bound account actually gets a password (fills a real gap in [[bound-client-crypto]] §2)

[[bound-client-crypto]] already established there is no SRP signup screen — `createPasswordKeystore`
is reachable only from the post-login `ResetPasswordPanel.tsx:156` — but didn't cite the backend
route. Confirmed now: `POST /account/srp/change-password/init` and
`POST /account/srp/change-password/verify` (`account.controller.ts:66-83`), both JWT-gated. So
attaching a password to an account is structurally a post-login account-management action, not a
login method you can bootstrap from nothing — consistent with, and now backed by, the existing
"password is a legacy-account surface only" finding.

## Changes During Work

`plan.md` open question 14 gained the root-cause paragraph and the three-option resolution list.
No knowledge file needed correction. Still needs Fez — this is now explicitly filed as a
security-vs-UX tradeoff to decide alongside ADR 0002, not an implementation detail to resolve
unilaterally.
