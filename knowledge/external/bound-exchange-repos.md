---
type: knowledge
area: external
status: Active
tags: [bound-auth, radfi-be, radfi-web, bound-exchange, reference-repo]
updated: 2026-08-18
related_issues: [gh-1024-bound-auth-email-provider]
related_decisions: [0001-own-the-email-wallet-auth-plane]
---

# Bound Exchange reference repos — where they live locally

Two private repos, read access arranged deliberately by Fez as the blueprint for
[[0001-own-the-email-wallet-auth-plane]]. Cloned persistently so future sessions don't need to
re-clone into a scratchpad.

## Local paths

```
/Users/sangnguyen/Documents/GitHub/radfi-be     (lydialabs/radfi-be)   — backend, NestJS/Mongo
/Users/sangnguyen/Documents/GitHub/radfi-web    (boundex/radfi-web)    — frontend, Next.js
```

**Deliberately outside `sodax/`.** These are not `icon-project` repos and not part of the sodax
workspace — they're third-party reference material for one research thread. Sibling to `sodax/`
at the `GitHub/` root, same as other unrelated personal projects there.

## What they are

| Repo | Org | Role |
| --- | --- | --- |
| `radfi-be` | `lydialabs` | Server: auth, keystore, SRP, WebAuthn, sessions, wallet registration |
| `radfi-web` | `boundex` | Client: mnemonic generation, KDF, encryption, derivation, backup UI |

Together they're the encrypted-keystore self-custodial wallet Bound (formerly RadFi) runs — the
model [[bound-auth-mechanism]], [[bound-client-crypto]] and [[bound-email-password-flow]] are
derived from, read from source rather than their docs (which disagree with the code in nine
places across the two repos).

## Clone details

- Shallow clones, `--depth=1`, no full history. Sufficient for reading current architecture; not
  for `git blame`/history archaeology. Re-clone without `--depth` if that's ever needed.
- `radfi-be`: branch `dev`, at clone time `c1c1e06` (2026-08-18).
- `radfi-web`: default branch `main`, at clone time `15ac098` (2026-08-14). Same commit the
  client-crypto research was read from.
- No `node_modules` — plain source only. `bound-auth-mechanism.md`/`bound-client-crypto.md` cite
  `secure-remote-password@0.3.1` and `argon2-browser@1.18.0` version numbers already verified
  against `package.json`; re-check versions if re-deriving anything from a refreshed clone.
- Access can lapse — both are private repos the current GitHub token happens to have `pull`
  access to. If a future session gets 404 on either, that's an access change, not a repo deletion;
  don't assume the research here is stale just because the clone can't be refreshed.

## Refreshing

```bash
cd /Users/sangnguyen/Documents/GitHub/radfi-be  && git pull
cd /Users/sangnguyen/Documents/GitHub/radfi-web && git pull
```

If re-deriving any finding after a pull, re-verify by hand — see [[verify-in-code-not-docs]] in
the user's memory. A newer commit may have changed the exact lines cited in the three knowledge
docs above.

## Related

- Knowledge: [[bound-auth-mechanism]], [[bound-client-crypto]], [[bound-email-password-flow]]
- Decisions: [[0001-own-the-email-wallet-auth-plane]]
- Issue: `gh-1024-bound-auth-email-provider`
