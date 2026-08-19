---
type: plan
repo: sodax-backend
github: 1024
updated: 2026-08-19
parent: plan.md
related: [plan-auth-api-security.md, plan-auth-api-scaffold.md, plan-sdk-integration.md]
tags: [auth, durability, backup, disaster-recovery, key-loss, recovery, auth-api]
---

# Durability — keeping the ciphertext alive

[[plan-auth-api-security]] answers *"can it be stolen?"*. This file answers the other half:
**can it be lost?** For a blind custodian the two are opposite failure modes with opposite fixes,
and the second is the one nobody has budgeted for.

The distinction that drives everything here: for every other collection in `sodax-backend`, data
loss is an availability problem because the data is **derivable** — swaps rows replay, oracle
candles refill, block timestamps re-resolve from RPC. A keystore row is the opposite. It is the
**only copy of an unrecoverable secret**, and for any user who never wrote down their mnemonic,
losing it is permanent, total loss of their funds. There is no re-derivation, no support override,
no vendor to call. That is what "blind custodian" costs on the durability side, and it is the price
of the property [[0001-own-the-email-wallet-auth-plane]] deliberately bought.

Derived from a source-verified threat-model pass on 2026-08-19 (see `process.md`). Every claim
below cites code actually read; the SODAX-side findings are against the tree as it runs today.

## 1. The finding that changes the build: our only backup does not cover where we would put this

`sodax-backend` runs **two separate MongoDB deployments**:

| DB | Who writes | Backed up? |
| --- | --- | --- |
| `sodax-mongo` (main, `MONGO_DB`, bind-mounted `./db/mongo-data`) | all nine apps | **no — nothing** |
| `sodax-stateful-mongo` (own Coolify resource, dedicated box) | `stateful-api`, swaps queue, oracle | hourly `mongodump` → S3 |

Exactly one backup pipeline exists and it dumps **only the stateful DB** — an hourly archive to
`s3://sodax-stateful-db-backups/mongodb-backups/`, produced by an out-of-repo tool
(`icon-project/bash-mongo-manager`), restored by hand via
`docs/manual-restore-runbook-shared-stateful-mongo.md`. There is **no backup script anywhere in the
repo** for the main DB, and `docker-compose.yml:58-68` defines `sodax-mongo` with no backup sidecar.

**So the placement of `wauth_*` silently decides whether user funds are recoverable.** If
`auth-api` follows the habit of the other nine apps and writes to the main DB, the ciphertext that
is the only copy of every user's seed has **no backup at all**: one disk loss is permanent, total
wallet loss for every user who never recorded their phrase.

Placing it in the stateful DB is necessary but **not sufficient**. The restore runbook enumerates a
**closed set** of five `stateful_*` collections as *"what it restores"*, and its Step 3 subset
command hardcodes a four-collection list. An operator following that runbook during a real incident
would silently skip an unlisted `wauth_keystore`.

**Decide and write down**, before any code:

1. `wauth_*` goes in the shared stateful DB, **or** `auth-api` gets its own backup pipeline. Not
   "whichever the scaffold does by default".
2. Amend the runbook's *"What it restores"* list and its Step 3 subset command to name
   `wauth_keystore` and every other load-bearing `wauth_*` collection.
3. Make the runbook a **checked artifact**: a CI grep that fails when a `wauth_*` / `stateful_*`
   schema exists in `shared-schemas` but is absent from the runbook. A hand-maintained list that
   drifts is worse than no list, because it reads as authoritative under pressure.

## 2. The backup we do have cannot detect the failure that matters

`BackupWatcher` (`apps/task-executor/src/tasks/backup-watcher/backup-watcher.service.ts:107-139`)
is the only automated backup assurance in the repo, and its entire correctness surface is
`evaluate(newest, now, staleThresholdMs, minObjectBytes)`. It lists an S3 prefix, takes the newest
object, and classifies it stale on **`LastModified` age** and optionally **byte size**. It never
downloads the archive, never enumerates the collections inside it, never checks document counts.

And the size guard is **off by default** — `configuration.ts:111-113`:
`minObjectBytes: process.env.BACKUP_WATCHER_MIN_OBJECT_BYTES ? Number(...) : 0, // 0 = size check disabled`.
The task itself is also `RUN_BACKUP_WATCHER_TASK` default **false**, on exactly one deployment.

So the failure mode that matters most for a keystore — the hourly dump runs and uploads a fresh,
normal-looking archive that **does not contain `wauth_keystore`** (wrong `MONGO_DB_NAME` after a
redeploy, an auth grant that lost read on the new collection, a partial dump) — produces a green
watcher, a green dashboard and a green `/healthz` for weeks, until someone needs the restore.

- Set `BACKUP_WATCHER_MIN_OBJECT_BYTES` to a real floor now. Costs nothing, catches truncation.
- Add the content-level assurance a metadata watcher structurally cannot provide: a **scheduled
  restore-verification job** that downloads the newest archive, remap-restores into a throwaway
  namespace, and asserts `wauth_keystore` exists with a document count inside a tolerance band of
  live. The runbook already documents this drill (`verify <liveDb> <coll> <throwawayDb> <coll>`) —
  it is simply manual today.

**An untested backup is not a backup**, and for a blind custodian that is the difference between an
outage and permanent loss of user funds.

## 3. `rs0` is not replication

Both compose files pass `--replSet rs0`, which reads as redundancy and is not. Each defines exactly
**one** mongod container on a host bind mount, so `rs0` is a single-member set that exists to enable
transactions and change streams. No secondary, no automatic failover, no second copy on a second
machine.

For the stateful DB that means the whole durability story for a keystore would be the hourly S3
dump — **one box, one disk**. A filesystem corruption, a volume wiped during a Coolify redeploy, or
a lost host takes the live collection instantly and drops recovery to the last hourly archive plus a
manual restore under pressure.

## 4. The restore tool is itself destructive

From the runbook, verbatim: *"`mongo_backup_manager.sh restore` **always** passes `--drop` to
`mongorestore` (in every mode — whole DB, subset, and remap). Each collection being restored is
dropped first, so a restore-over-live is destructive to those collections until it completes."*

Combined with a 1-hour RPO and manual-only restore (*"Automatic/auto-restore is explicitly out of
scope"*), that gives two distinct fund-loss windows:

- A user who registered **50 minutes before an incident** is simply gone.
- An operator who restores a 1-hour-old archive over a live `wauth_keystore` to repair a subset of
  rows **silently destroys every registration made since the dump**.

Retention is 30 days via an S3 lifecycle rule, with no Object Lock or bucket versioning mentioned —
so a corruption unnoticed for 30 days has no recoverable copy, and nothing protects the archives
themselves from deletion.

**Requirements this generates, none of which exist today:**

1. Recovery point measured in **seconds, not an hour** — a replica-set oplog/PITR path, or stream
   every keystore write to an append-only durable log (S3 with Object Lock / WORM) at write time.
2. **S3 Object Lock or versioning plus a deny-delete policy** on the backup prefix, so neither
   ransomware nor a bad operator can remove the archives.
3. **Longer retention for keystore data specifically** than the generic 30 days.
4. A **keystore-specific restore runbook that never uses `--drop` over live keystore data**. The
   safe shape is remap-restore into a throwaway namespace, then a merge that only inserts rows
   absent from live.

## 5. Make the keystore append-only

Bound overwrites the ciphertext in place. Two flows `$set` a client-supplied `encryptedBlob` onto
the single keystore row — password change (`account.service.ts:490-505`) and auth-wallet rotation
(`applyAuthWalletRotation`, `:638-647`). The old ciphertext is gone the instant the write lands.

The password-change path **archives the previous `srpSalt`/`srpVerifier` into a `histories` array**
— so the authors clearly thought about rollback for the *auth* material — but does not preserve the
previous blob, which is the part that cannot be regenerated. (And `histories` is `$set` to a
one-element array rather than pushed, so even that history is depth-1.) Auth-wallet rotation keeps
no history at all.

Nothing server-side can validate a new blob — correctly, since the server is blind. So a client bug,
a wrong-KEK derivation, a truncated upload, or a rotation interrupted between the client
re-encrypting and the server persisting leaves an undecryptable blob and a permanently lost wallet,
with no prior version to fall back to.

**For `auth-api`: never `$set` over a live ciphertext.** Write each blob as a new immutable version
row (`wauth_keystore_blob`, keyed by account + monotonic version, credential rows referencing a
version), and retire the old one by marking it superseded rather than deleting. Require the client to
prove the new blob round-trips locally, and send a client-computed integrity tag the server stores
alongside, before the old version is marked superseded. Keep superseded versions for a long window.

This also defuses a related race: Bound's last-passkey guard is a non-atomic check-then-act, so two
concurrent deletes can remove every credential row. With an append-only blob store, destroying
credential rows would no longer destroy the ciphertext.

## 6. Client-side loss classes — bit fragility

Two of these are inherited directly if we copy Bound's envelope.

**No AAD, and the AES-GCM IV doubles as the HKDF salt.** `crypto.subtle.encrypt`/`decrypt` are
called with no `additionalData` (`keystore.ts:123-127`), so GCM authenticates **only the
ciphertext**; `version`, `type`, `aesIv`, `argon2Salt`, `argon2Params` are all unauthenticated
plaintext JSON. Worse, `derivePrfKey` feeds `aesIv` in as the HKDF salt (`keystore.ts:88-93`, whose
own docstring says *"also used as HKDF salt"*), so the IV is load-bearing for **key derivation**,
not just as a nonce. One altered byte in `aesIv` produces a different AES key *and* a wrong nonce:
the ciphertext is fully intact and undecryptable forever. `validateBlob` will not catch it — it
only checks field names and types (`keystore.ts:203`), so a corrupted-but-well-formed blob passes
validation and fails with the generic *"Decryption failed — wrong key or corrupted blob"*
(`keystore.ts:183`), leaving the user unable to distinguish corruption from a wrong password.

→ Bind the canonical header as `additionalData` so tampering fails loudly at the AEAD layer.
Generate an **independent** random HKDF salt rather than reusing the IV. Have the server reject
writes whose envelope header does not parse to the expected schema. Distinguish "wrong password"
from "blob corrupted" in the error surface.

**`argon2Params` is written but never read.** `encryptKeystore` records
`{memory: 65536, iterations: 3, parallelism: 4, hashLength: 32}` into the envelope
(`keystore.ts:141-146`) and `rg argon2Params` returns exactly that one write.
`decryptPasswordKeystore` extracts only `blob.argon2Salt` and calls `derivePasswordKey(password,
salt)`, which **re-hardcodes** the same four numbers (`keystore.ts:44-52`). The recorded parameters
are decorative.

The moment anyone raises the Argon2 cost — a routine, well-intentioned hardening change — every
pre-existing password blob becomes undecryptable **with the correct password**, and since
`validateBlob` never even requires the field to be present, there is no migration signal to trip on.
A latent time-bomb that detonates on a future commit, not on user action.

→ The password path must **read** the parameters out of the envelope and pass them into argon2id,
treating the hardcoded values as defaults for *new* blobs only. Make `argon2Params` required and
validated. Add a regression test that encrypts with one parameter set, changes the library defaults,
and asserts the round-trip still succeeds. This is sharper for us than for Bound: our single
argon2id call is HKDF-split into `authHash` **and** `kek`, so parameter drift breaks server
authentication and client decryption simultaneously.

## 7. Product decisions that are really durability decisions

These are the paths that need no bug and no attacker — just a user.

**Bound ships zero recovery.** Verified by exhaustive negative search over `radfi-web/src`:
`recovery.?(code|kit|key|share)`, `shamir|sss|secret.?shar`, `social.?recovery|guardian`,
`server.?share`, `seedPhraseInput`, `12.?word.?input` — all zero. `mnemonic.ts` is generate-only in
practice: `isValidMnemonic` (`:17`) is never wired to any input field. `passkeyRecovery.ts` is not
recovery — it re-derives from a passkey the user *already holds*. "Forgot password?" emails a
user-authored **hint**, not a reset. A forgotten password is terminal.

**One auth method per account.** A passkey account cannot add a password fallback — the password
panel renders `<ComingSoon>` for non-SRP accounts (`account/page.tsx:172`, gate at `:70`). The only
redundancy is a second passkey, and that flow ECDH-transfers the plaintext mnemonic from device A to
B (`add-passkey/page.tsx:305-320`) — it **structurally requires a device that can already unlock**.
So redundancy is obtainable only while you still have access, which is exactly when users do not
bother.

That compounds badly with authenticator type: registration sets `residentKey: "required"` with **no
`authenticatorAttachment` constraint** (`webauthn.ts:274`), so both synced credentials (iCloud
Keychain, Google Password Manager — survive device loss) and device-bound ones (Windows Hello/TPM,
YubiKey — do not sync) are accepted, and **nothing in the UI distinguishes them at enrollment**. A
user who enrolls a device-bound authenticator and then wipes that device has permanently lost the
wallet.

**Backup is a dismissible badge, not a gate.** The mnemonic's only render site is
`WalletSecretsExportModal` — itself behind a successful unlock. So the seed is shown only to a user
who can already unlock, i.e. precisely the user who does not urgently need it. The "not yet backed
up" state lives in **`sessionStorage`** (`postRegistrationBackup.ts:3,120`), so it does not survive
a browser restart, and `clearSeedPhraseBackupPrompt()` wipes it. Accounts are fundable before the
user has ever seen the phrase.

**Decisions for `auth-api`, each of which must be made before the first real user:**

1. **Recovery, or an explicit signed-off refusal.** Retrofitting recovery into blind custody is
   impossible without re-encrypting every blob. The minimum that preserves the property exactly:
   store a **second independently-wrapped copy** of the same mnemonic under a client-generated
   high-entropy recovery code shown once at signup — the server holds only the second ciphertext and
   the code never leaves the client. If product declines, that is a written decision record, and the
   UI must say *"lose your passkey, lose your funds"* at signup, not in a footer.
2. **Let one account carry both a passkey-wrapped and a password-wrapped copy** of the same mnemonic
   from day one — two envelopes, one plaintext, both client-side. Cheapest real redundancy, and it
   costs the server nothing but a second blob. Never gate second-factor enrollment behind an
   already-unlocked session as the *only* path.
3. **Warn on device-bound authenticators at enrollment**, reading
   `getClientExtensionResults().credProps.rk` and the authenticator transports.
4. **Show the phrase during registration**, while the plaintext is still in memory, and require the
   word-confirmation before the account is marked usable for deposits. Persist "has confirmed
   backup" **server-side on the account record**, not in sessionStorage, so it survives device and
   browser changes and can gate the deposit UI. Treat it as an account lifecycle state, not a nag.

## 8. The PRF mismatch — an account born unopenable

Filed here rather than in the security plan because the outcome is loss, not theft.

Registration encrypts with the PRF from `navigator.credentials.create()`
(`radfi-web/src/auth/webauthn.ts:317`); every later login decrypts with the PRF from
`navigator.credentials.get()` (`:626`). **WebAuthn does not guarantee these are equal across
authenticators.** Bound's own in-repo memo says so plainly
(`passkey-prf-verify-backend.md:32`): *"If they differ on a given provider, the account is silently
un-unlockable."* And `passkey-prf-roundtrip-changes.md:46`: *"## Known gap (still open) — A provider
that returns PRF at `create()` but cannot reproduce it at login is not caught."*

They built the round-trip verification that catches it, then **reverted it** — the second biometric
prompt sat between `GET /auth/webauthn/challenge` and `POST /auth/register` and expired the one-time
challenge (`17004 KEYSTORE_INVALID_ASSERTION`), breaking signup. Cleanup after the fact is blocked
too: `DELETE /keystore/passkey/:id` refuses to remove the last passkey (`17010
KEYSTORE_CANNOT_REMOVE_LAST`) and a fresh account has exactly one. What shipped is only the weaker
create-time PRF-*presence* check.

**Do not copy the create-PRF-encrypts design.** Adopt what Bound's own memo calls Option B
(`passkey-prf-verify-backend.md:58`): register first under a fresh challenge, run a separate
assertion **outside any challenge window**, and encrypt the blob with the **assertion-time** PRF,
PATCHing it in. Decryptability then holds *by construction*, because the identical mechanism that
will open the blob is the one that produced the key.

This is why [[plan-sdk-integration]]'s ordering matters and why the earlier "local-only is what
saves us" reasoning was wrong: locality was never the differentiator — Bound's reverted attempt was
also local. The property that prevents recurrence is keeping the second prompt **outside the
challenge window**, which `auth-api` can do because Phase 6 splits `keystore` (blob upload) from
`passkey-registration`.

Also: never let the delete-passkey rule strand a bad enrollment. Allow removing a sole passkey when
the account has **never had a successful assertion-time unlock**.

## 9. What to add to the verification bar

Additions to `plan.md`'s Verification section, all specific to durability:

- **Restore drill, in CI or scheduled**: take the newest archive, remap-restore to a throwaway
  namespace, assert `wauth_keystore` present with a plausible document count. Failing this must page.
- **Runbook-coverage test**: fail when a `wauth_*` schema exists in `shared-schemas` but is not named
  in the restore runbook.
- **KDF-parameter migration test**: encrypt with one parameter set, change the library defaults,
  assert the round-trip still succeeds (proves the envelope params are actually read).
- **AAD tamper test**: mutate each envelope header field post-encryption and assert decrypt fails
  *loudly and distinguishably* — not with the generic wrong-password error.
- **Append-only test**: a password change must leave the previous blob version retrievable.
- **PRF round-trip gate**: assert the blob is encrypted under the *assertion-time* PRF, and that an
  account whose assertion-time PRF differs from create-time is rejected at registration rather than
  created.
