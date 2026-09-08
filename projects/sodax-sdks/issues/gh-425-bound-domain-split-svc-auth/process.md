---
type: process
repo: sodax-sdks
github: 425
updated: 2026-09-08
---

# Process

<!-- Flat until this file passes ~20 KB. Then split: one file per session under
     `process/NN-YYYY-MM-DD-slug.md` (same frontmatter plus `session:`), and this
     file becomes a table of one row per session — nothing else. -->

## Log

### 2026-09-08 — recon, plan, adversarial audit (no code)

Task: read #425 and plan the work across the affected repos. Outcome: the task is
**unblocked** and `plan.md` + `plan-evidence.md` are written and ready for review.

Order of work:

1. Read #425/#426/#1215 and the existing dossier. Verified every cited file:line against
   the default branches rather than the working trees.
2. Probed Bound's hosts directly (DNS, then HTTP).
3. Read Bound's own backend (`lydialabs/radfi-be`) at `dev` HEAD via the GitHub API — the
   local clone is stale at 2026-08-18, before the split landed upstream.
4. Wrote a first plan.
5. Ran a 21-agent adversarial audit of that plan (5 verification lenses → 8 findings ×
   2 independent refuters). Two corrections landed; one refuted finding turned out to be
   right and was reinstated after hand-verification.

## Findings

### The split is a service split, not a rename (this reversed the design)

The first draft argued "all three hostnames resolve to one ALB, therefore one monolith,
therefore cutting over is near-zero risk." The audit attacked it and was correct: pinning
one ALB IP and varying only the `Host` header, `auth.bound.exchange` serves
`/.well-known/jwks.json` with a live ES256 key set while `api` and `svc` return
`radfi-be`'s NestJS 404 for the same path. `radfi-be` sets
`app.setGlobalPrefix('api')`, so it cannot serve that path — the ALB has host-based
listener rules to **different target groups**.

Consequence: `svc` is provably the same backend as `api` (byte-identical 404), but the
auth host is a different service (`bound-authentication`). Defaulting `authUrl` would
point Bitcoin sign-in at a service nobody has verified serves BIP322 — and it cannot be
verified from outside, because every `/api/*` path is gated 403.

**Design changed:** ship `authUrl` optional, flip only `apiUrl` in the packaged default,
leave `authUrl` unset, make the real cutover a `RADFI_AUTH_URL` env flip on canary. This
also removes the deepMerge straddle hazard the first draft had accepted and documented.

### Q1–Q4 answered without Bound

- **Q1** `/transactions/*` — `radfi-be` owns `@Controller('transactions')` and `svc`
  reaches `radfi-be`. Routing them to `apiUrl` is correct; a later answer is a one-line
  edit to an internal prefix array.
- **Q2** UMS — `svc.ums`/`auth.ums`/`ums.bound.exchange` are NXDOMAIN; `api.ums` is
  separate infra (nginx/Express, own IP), unauthenticated, `200`. It does not split.
- **Q3** testnet/staging — `signet.svc`/`signet.auth`/`staging.svc`/`staging.auth` are
  NXDOMAIN. The `authUrl ?? apiUrl` fallback handles those environments for free.
- **Q4** HMAC — inverted from what the ticket assumed. See below.

### Q4's rationale was backwards (audit-confirmed, high severity)

The first draft said dropping the signature on the auth host would lose a rate-limit
bypass. Wrong: `TransactionRateLimitGuard` is not global — hand-applied on six
controllers, none of them `auth` or `wallets`. And `SodaxRateLimitGuard` is opt-**in** on
the partner flag, drawing from one shared `sodax-backend` bucket. So signing buys a
bypass on svc, buys nothing on auth, and on auth opts into the shared bucket.

The *action* (keep signing everywhere) survives, because it is byte-identical to today's
behaviour. Only the reason changed.

### Seven wrong statements in the tickets

Listed in `plan.md` §Corrections. The two that would have cost the most implementation
time: `#426` item 4 points at `common.ts` `radfiApiUrl`/`radfiUmsUrl`, which nothing
reads; and `#426` asks for a changeset plus a `CONFIG_VERSION` bump, both of which the
repo forbids.

### bridge-api's config machinery is not on `development`

`#1215` assumes swaps-api and bridge-api are mirrors. On `development`, bridge-api has
only the per-request token surface; `buildRadfiConfig`, `RadfiConfigClass`, the HMAC
signer, `RADFI_*` env and `radfi-config.spec.ts` arrive with open PR #1097. The line
numbers in `#1215` were read off that branch.

This does not delay anything: the backend is gated on the SDK release regardless (both
apps consume `@sodax/sdk` through the npm catalog), and #1097 will have merged by then.

## Changes During Work

- **Design reversed** on the packaged default: from "flip `apiUrl` **and** `authUrl`" to
  "flip `apiUrl` only". Driven by the JWKS probe.
- **Scope narrowed** to sodax-sdks + sodax-backend. intents-whitelabel is out — it pins
  `@sodax/* 2.0.0-rc.12`, two minors behind the release that will carry `authUrl`, so it
  is a real upgrade rather than the one-line env change #425 describes.
- **Plan split** into `plan.md` (design + steps) and `plan-evidence.md` (proof +
  reproduction), per the folder-size rule in `projects/README.md`.

## Method notes worth reusing

- **Verify against the default branch ref**, not the working tree, and not with
  `git diff main...HEAD` — the three-dot form diffs from the merge base and hides
  everything `main` gained after the branch point. That is how an earlier pass wrongly
  concluded `.changeset/` had been deleted.
- **Agent verdicts are input, not authority.** Both adversarial refuters dismissed the
  ALB-routing finding on the grounds that `/.well-known/jwks.json` is not a path the SDK
  calls. True, and beside the point — it was a discriminator for *which backend answers*.
  Re-running the command by hand confirmed the original finding and overturned both
  refutations. It became the most important fact in the plan.
- **Read the partner's source.** `knowledge/external/bound-exchange-repos.md` records
  read access to `lydialabs/radfi-be`. Reading it at `dev` HEAD answered three of the
  four questions that had been filed as "waiting on Bound in Discord" — but note it
  answers *code ownership*, not *host fronting*, and conflating the two is exactly the
  mistake the first draft made.
