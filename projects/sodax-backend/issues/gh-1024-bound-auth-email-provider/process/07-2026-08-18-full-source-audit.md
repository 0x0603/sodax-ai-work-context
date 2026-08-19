---
type: process
repo: sodax-backend
github: 1024
session: 2026-08-18
updated: 2026-08-18
---

# 2026-08-18 (fifth pass) — Full source audit of every doc in this thread

The fourth pass found one wrong claim by accident. That raised the obvious
question — how many others are there? — so the user asked for a systematic
sweep: *"đọc lại hết docs, xem có cái nào sai thực tế không, không tin vào note
phải so với code."*

## Method

A 10-agent fan-out, one group per doc-and-source-tree pair, each agent given the
doc as the **thing under test** rather than as evidence, plus the source tree the
claim is actually about. Every finding of WRONG then went to an independent
adversarial agent whose default was to defend the doc — so a correction only
landed if it survived someone actively trying to refute it.

Verdicts were four-way on purpose: CONFIRMED / **WRONG** / **DRIFTED** (substance
holds, cited file:line moved — the `radfi-be` clone is at `c1c1e06` while the
notes were written at `68d8dab`) / UNVERIFIABLE. Collapsing drift into "wrong"
would have produced dozens of fake errors.

Agents were pointed specifically at the claim shapes that hide errors, all of
which had already burned us at least once: *"the only place X is used"*, *"X
exists nowhere"*, *"written but never read"*, exact constants and version pins,
and any claim about one repo made while reading another.

**Result: 573 claims checked, 461 CONFIRMED, 28 WRONG, 35 DRIFTED, 39
UNVERIFIABLE, and 5 reported errors rejected on adversarial review.**

The core architecture survived intact — blind custody, mnemonic-vs-KEK, the
two-signature model, the determinism whitelist, and the Argon2id-bypass finding
are all confirmed from source. Everything wrong was at the detail layer, but four
of those details change what gets built.

## The four that change the plan

1. **`stateful-api`'s CORS is not what two plan files claimed.** It does not
   source its allowlist from `trustedOrigins` — `main.ts:62-79` hardcodes three
   inline regexes and sets **no `credentials` key at all**, deliberately
   (`main.ts:55-56`: *"deliberately NON-credentialed: no session cookie ever
   crosses this boundary"*), because the portal is served same-origin through a
   Next proxy. `trustedOrigins` is a separate mechanism feeding Better Auth's
   Origin/CSRF check, consumed only at `auth.config.ts:40`; `configuration.ts:57`
   says so verbatim. So the prescription *"auth-api must copy stateful-api's CORS
   because it is cookie-based"* rested on a false premise. **No sodax-backend
   service uses credentialed CORS** — there is no sibling to copy. The decision
   is now branched on deployment topology, and the config-driven-allowlist
   precedent is `sponsoring-api/src/shared/origin-allowlist.ts`. This also closes
   open question 12.

2. **`apps/bridge-api`, the chosen scaffold template, is not on `development`** —
   it lives only on `origin/feat/bridge-api*`. It is also not the newest
   greenfield app (`sponsoring-api` 2026-08-03, `api-auth` 2026-08-17). The
   `HaproxyThrottlerGuard` cited from it exists identically in `sponsoring-api`
   and `swaps-api` on `development`; citations re-pointed there.

3. **The six non-provider-managed chains do not share one shape.** Only 2 of 6
   (Bitcoin `chainRegistry.ts:226`, Stacks `:380`) resolve the provider from the
   connector. The other 4 (Injective `:262`, Stellar `:308`, NEAR `:367`, ICON
   `:329`) never inspect the connector in `createWalletProvider` — they build
   from the native service singleton, and ICON discards the service entirely.
   Step 3b is therefore "introduce a connector-sourced provider path that does
   not exist" on 4 chains, not "add an `instanceof` branch". And skipping them is
   **not fail-safe**: they would silently return a provider wired to the native
   wallet, which cannot sign for a SODAX-managed key.

4. **The PRF re-verification fix was justified by the wrong property.** The plan
   said local-only is what prevents Bound's failure recurring. But Bound's
   reverted attempt *already* used a local challenge — what killed them was the
   wall-clock time of a second user-paced biometric prompt sitting **inside** the
   registration challenge window (`AuthModal.tsx:714` issue → `:719` prompt →
   `:742` submit, against the 2-minute TTL at `radfi-be auth.service.ts:404`).
   The property that actually matters is the **challenge boundary**. SODAX can do
   what Bound could not — register the passkey under a fresh single-prompt
   challenge, re-verify outside any window, then upload the blob — because
   Phase 6 already splits `keystore` from `passkey-registration`, whereas Bound is
   blocked by `17010 KEYSTORE_CANNOT_REMOVE_LAST` (`keystore.service.ts:542`) on
   an account with exactly one passkey.

## Two that would have produced broken wallets

- **The fixed derivation message is 5 lines, and the doc's code block silently
  dropped the two blank ones.** Real message: `"Bound Wallet Auth\n\nPurpose:
  Unlock the encrypted Bound keystore\n\nThis signature is not a transaction and
  does not spend funds."` — LF only, NFKC-normalized. Signing the 3-line version
  yields a different signature → different KEK → unopenable keystore.
- **The HKDF `info` is not the canonical envelope JSON.** It is
  `canonicalKdfContext()`, a fixed 8-field projection in a specific key order,
  excluding `kdfSalt`, `kdfParams` and `cipherParams`.

## What the audit revealed about Bound the product

**Bound's shipped client no longer registers with an email at all.** Both
`/auth/register` call sites are `authType: PASSKEY` (`AuthModal.tsx:743`, keyed by
a user-chosen passkey *name*) and `authType: WALLET` (`:1274`);
`requestEmailVerification` has zero callers; no client path constructs
`authType: "srp"` at all, so SRP accounts can only be pre-existing. Password sits
under a *"Legacy login options"* disclosure. The old email+OTP signup screens are
still in the tree but dead.

**This is an observation about Bound, not a constraint on SODAX** — see the scope
decision recorded in `plan.md`.

Also: Bound's strongest backup warning — the one sentence naming the consequence —
**never shipped**. It exists only as orphaned i18n copy (`messages/en.json:458`,
translated into zh-CN) with zero code references and no step to render it. So
their backup story is weaker than the fourth pass documented, which was already
the weakest part of their design.

## Corrections to our own corrections

Two, both worth recording because they are the same failure mode this pass exists
to catch:

- The fourth pass's fix said *"nothing on the login path calls
  `GET /keystore/passkey/{email}/credentialIds`."* Overstated. A fifth caller,
  `add-passkey/page.tsx:148` inside `autoLogin()`, **is** on a login path, on an
  ungated page. The narrower true claim — the primary `AuthModal` login is
  emailless and discoverable — stands.
- `bound-auth-mechanism` §3 stated the PRF *output* formula as if it were the KEK.
  The KEK is an HKDF of it whose salt is the blob's own `aesIv`, making the KEK
  **per-blob, not per-credential**.

## Rejected on review — where the doc was right

5 reported errors did not survive. Two are instructive: one auditor called the
Sui `mnemonics`-only config type nonexistent, having read only the checked-out
ref while the type lives on an unmerged branch; another reported a claim the doc
never actually makes, filed against an "implied by" reading. Both are the
inverse error — over-correction — and are exactly why the adversarial stage
exists.

## Changes During Work

The 28 corrections were applied by a second fan-out, one agent per file group
with strict single-owner-per-file assignment (S9), each edit then re-read by an
independent checker looking for corrections that did not land, fabricated
replacement text, over-correction, and internal contradiction with sibling docs.

Two new open questions were promoted from this log into `plan.md`, since both
are now required work rather than curiosities: **where the client obtains the KDF
salt** (unaddressed anywhere, and an account-enumeration surface — Bound solves
the equivalent with a deterministic fake salt in `srpInit` while getting it wrong
on their OTP endpoint), and **whether passkey login should be emailless**.
