---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
---

# 2026-08-18 (fourth pass) — Passkey login is emailless; an earlier claim was wrong

Triggered by a direct challenge from the user ("tại sao bạn biết — đọc code họ
đi") after I asserted, from my own earlier notes rather than from source, that
Bound requires an email on **both** login paths. Re-cloned both reference repos
to **this** machine and read the login modal directly. **The assertion was
wrong and the user's intuition was right.**

## What the source actually shows

`AuthModal.tsx:568-570` picks the ceremony:

```ts
pendingRegistration?.credentialId
  ? getPasskeyAssertion(challenge, pendingRegistration.credentialId)   // post-registration verify ONLY
  : getDiscoverablePasskeyAssertion(challenge)                          // NORMAL LOGIN
```

- `getDiscoverablePasskeyAssertion` (`webauthn.ts:443-459`) calls
  `navigator.credentials.get()` with **no `allowCredentials`**. Its docstring:
  *"Used by **no-email login** so the passkey provider shows domain credentials."*
- `getWebAuthnChallenge()` (`api/auth.ts:30-35`) takes **no parameters**.
- `loginPasskey({credentialId, challengeId, webauthnAssertion})` — no email field.
- UI proof: `AuthPasskeyModal` gets no `email`/`onEmailChange` prop; only
  `AuthPasswordModal` does (`AuthModal.tsx:1620-1684`).
- The password path does need it: `srpInit({ email: normalizedEmail })`
  (`AuthModal.tsx:467`).

## Where the wrong claim came from

[[bound-auth-mechanism]] §7 listed `GET /keystore/passkey/{email}/credentialIds`
as step 1 of passkey login, annotated *"the only place email is used"*. The
endpoint is real, but **every caller is a post-login page** —
`ApproveLinkModal.tsx:77`, `PasskeyManagementPanel.tsx:133,188`,
`add-passkey/page.tsx:148,363`. Nothing on the login path calls it.

Root cause: the 2026-08-18 backend pass read radfi-be's endpoint list and
**inferred** the client flow. `radfi-web` access arrived later the same day, and
the client-crypto pass focused on the crypto surface rather than re-checking the
flow claims the backend pass had already asserted. So a backend-derived
inference survived into a knowledge file as if it were verified.

This is a second instance of the discipline these notes already state twice
("read the code, not the docs") — generalised: **read the code of the side you
are making the claim about.** A backend endpoint existing says nothing about
whether the client calls it, and on which path.

Corrected in place in [[bound-auth-mechanism]] §7, with the ceremony-selection
code, the docstring, and the UI-prop asymmetry quoted.

## Consequence for our design — a real open decision, not just a correction

`plan-sdk-integration.md` phase 4 specifies the modal state machine as
`closed -> emailEntry -> methodSelect -> {passkeyCeremony | passwordEntry}` —
email first, unconditionally, for both paths. That was written believing it
matched Bound. **It does not.** So it is currently an unexamined choice that is
strictly worse UX than the reference implementation on the passkey path.

Emailless passkey login would mean:

```
closed -> methodSelect ─┬─> passkeyCeremony   (allowCredentials omitted, zero typing)
                        └─> emailEntry -> passwordEntry
```

Three things to settle before adopting it:

1. Does `@better-auth/passkey` support `residentKey: 'required'` at registration
   and an identifier-less `signIn.passkey()`? **Still unverified — the package is
   not installed in either repo** (the gap already flagged in
   [[plan-auth-api-security]]). Fold this question into that same spike.
2. The email step is also where the password path would fetch its KDF salt (see
   the gap logged below), so removing it from the passkey path only is fine, but
   removing it globally is not.
3. Accounts with no email have no channel for security notifications. Bound hits
   this too — `ApproveLinkModal.tsx:63-67` hard-stops device linking with
   *"Add an email first"*.

## Second gap found in the same conversation: where does the KDF salt come from?

`plan.md:65-66` specifies `authHash = argon2id(password, salt, ctx="auth")` and
`kek = argon2id(password, salt, ctx="kek")` but **no plan file says how the
client obtains `salt` before login**. `rg -i salt` across all seven plan files
returns no endpoint, no design. It is load-bearing: the client cannot compute
`authHash` without it, so a pre-login round trip must exist:

```
POST /auth/kdf-params { email } → { salt, argon2Params }
```

and that endpoint is an **account-enumeration surface**. Bound gets this right
on the equivalent step — `srpInit` returns a deterministic fake salt
(`HMAC(jwtRefreshSecret, "srp-fake-salt:" + email)`) for unknown emails, so
probing is indistinguishable — while getting it wrong on their OTP endpoint
(`400 account.emailTaken`, [[bound-auth-mechanism]] §9). Our design must copy the
former and not the latter.

Not yet written into `plan.md` — pending the user's call on whether to fold both
of these in as open questions.

## Reference repos now on this machine

[[bound-exchange-repos]] recorded clones under `/Users/sangnguyen/...` (the other
machine). Cloned to this machine at the same commits — see that note, updated
with both paths.
