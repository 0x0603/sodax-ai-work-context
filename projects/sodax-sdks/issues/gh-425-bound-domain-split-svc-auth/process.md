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

### 2026-09-08 (later) — Bound's second message, plan restructured to one pass

Bound reposted the mapping in Discord, unchanged, plus two new things: **"both
svc.bound.exchange and auth.bound.exchange are live and ready for testing"**, and the
HMAC/JWT split stated in writing. The deprecation date is still TBD and still waiting on
our timeline.

The invitation to test is what changed the plan. The earlier two-phase structure existed
only because the auth host was unverifiable; with testing explicitly sanctioned, the
verification becomes a **measurement step before coding** rather than a shipped phase.
Restructured to one pass on the user's instruction ("1 lần làm fix hết").

**Step 0** is now a blocking gate: `artifacts/probe-bound-hosts.sh`, run from a
whitelisted environment. It sends deliberately invalid bodies and discriminates on the
reply shape — `404 "Cannot POST …"` means the route is not served on that host, `400/401`
means it is — so it needs no valid credential and creates nothing. That also answers Q1
empirically, since it probes `/transactions/*` against all three hosts.

Both Step-0 outcomes ship the same code; only the packaged `authUrl` value differs. That
property is what lets one script run gate the work without risking a second round of PRs.

Still missing from Bound's mapping, in both messages: `/api/transactions/*` (5 call sites)
and `api.ums.bound.exchange`. Worth noting the mapping is not merely incomplete but
locally contradictory — `/api/wallets/*` → auth reads as covering `/wallets/balance`,
which is served by the UMS host. Draft reply in `plan.md` asks both.

Sequencing improved on the user's suggestion: PR 2 no longer waits idle for the SDK
release. It is coded against a locally-linked SDK via `pnpm.overrides` (the block already
exists at the backend's `package.json:9-16`), with the override reverted and replaced by
the catalog bump before commit. Recorded as a landmine, since an override reaching a PR
would be a silent local-path dependency.

Scope reconfirmed with the user rather than inferred from "fix hết": whitelabel stays out.

### 2026-09-08 (final) — Bound completed the mapping: four hosts

Bound answered the two gaps. The result changed the design again.

```
/api/sodax/*        -> svc.bound.exchange
/api/auth/*         -> auth.bound.exchange
/api/wallets/*      -> auth.bound.exchange
/api/transactions/* -> api.radfi.co            <- not svc
/api/wallets/balance, /api/utxos -> api.ums.bound.exchange (unchanged)
api.bound.exchange  -> deprecated, date TBD
```

**`/api/transactions/*` goes to `api.radfi.co`** — the legacy RadFi domain, not a
bound.exchange subdomain. Bound is retiring the newer brand host and routing that family
back to the older one. Verified: `api.radfi.co` reaches the same backend as `svc`
(identical `radfi-be` NestJS 404 on `/.well-known/jwks.json`), same ALB, own `*.radfi.co`
certificate.

Own correction: when Bound said "BTC thì trỏ qua endpoint của radfi", this session read it
as "the radfi-be service, therefore svc" and concluded both readings landed in the same
place. True of the *backend*, false of the *configuration* — they meant the literal
`api.radfi.co` domain. The lesson is narrow but real: "same backend" and "same base URL to
configure" are different questions, and only the second one matters to a config change.

**Design impact.** Config goes from 2 base URLs to 4, so `RadfiConfig` needs **two** new
optional fields (`authUrl`, `transactionsUrl`), and the prefix table becomes three-way with
each branch falling back to `apiUrl`.

**Backend scope shrank.** Verified the backend calls exactly two endpoints —
`/api/wallets/details/{address}` (auth) and `/api/sodax/transaction` (svc). It never
reaches `/api/transactions/*` or UMS: both apps pin `raw: true`, and
`BitcoinSpokeService.deposit` returns at `:470-472` before `requestRadfiSignature`, so the
backend builds the PSBT and the client signs it. `radfi`, `signAndSubmitRawTransaction`,
`getTradingWalletAddress` and `encodeWithdrawalData` appear 0 times in `apps/*/src`. So PR
2 needs `RADFI_AUTH_URL` only — no transactions override for a call the backend never makes.

**New top risk: CORS on `api.radfi.co`.** All three `/transactions/*` calls run from the
browser with a user JWT, against a different registrable domain. `intents-whitelabel`'s
`rpc.ts:38-39` already records that radfi.co URLs stopped answering at some point and broke
Bound sign-in — almost certainly an allowlist change rather than the host dying, since it
is demonstrably alive. Preflight is untestable from outside: every host answers `OPTIONS`
with a gate 403. This has to be verified from a real browser on canary, and asked of Bound.

Also unanswered and now asked: whether `api.radfi.co` is itself on a sunset path (routing to
a legacy brand domain reads as transitional), and whether the `api.bound.exchange`
deprecation covers `signet.api.` and `staging.api.`, for which no `svc.`/`auth.`
equivalents exist in DNS.

Artifacts updated in this pass: `plan.md` rewritten for four hosts,
`artifacts/probe-bound-hosts.sh` extended to probe `api.radfi.co` first for the
`/transactions/*` family and to state that CORS is out of its reach, `brief.md` re-routed.

**Folder consolidated.** `plan-evidence.md` was deleted, not archived: written for the
two-host design, it stated at `:156` that Q1 was answered as "`/transactions/*` is
radfi-be's, and svc reaches radfi-be" and never mentioned `api.radfi.co`. Two documents
disagreeing about the same fact is worse than one document — and the brief's own rule is
that a stale router is worse than none. Its load-bearing content (the Host-header JWKS
probe, the DNS table, the radfi-be guard citations, the method note about default branches)
moved into `plan.md` §Appendix. `plan.md` is now the single artifact to review.

### 2026-09-08 (review) — Codex review, and a design error it caught

Five findings, all valid. Two were P1 and both were mine.

**The straddle was not an acceptable risk — it falsified the plan's own claims.** When the
design flipped to setting `authUrl` and `transactionsUrl` in the packaged `chains.ts`
default, the fallback reasoning was never re-examined. It only ever held while the default
left them unset. With them set, `deepMerge` hands a partial override the packaged mainnet
companions, so "old-host / signet / staging / backend fall back unchanged" was false in
every case, and the backend's "cannot straddle" mitigation was false too — that refusal is
all-or-nothing over *malformedness*, not over *presence*, which the earlier adversarial
audit had already flagged and this plan had not acted on.

Fixed structurally rather than with a guard: the packaged default carries `apiUrl` only,
the companions move to an exported `BOUND_COMPANION_HOSTS` lookup table, and
`RadfiProvider` resolves them **only while `apiUrl` is still the packaged mainnet host**.
Nothing is left in the merged config to leak, so no comparison heuristic, no "override all
or none" doc contract, and no runtime guard are needed. The former Open-decision #1 is
therefore deleted rather than answered.

Also fixed: the probe script tested `GET /wallets` where the SDK calls **POST**
(`RadfiProvider.ts:271`), and classified any 404 as ROUTE ABSENT — but `getTradingWallet`
has an explicit "Trading wallet not found" branch (`:287-299`), so a live route can answer
a JSON 404. It now reports `AMBIGUOUS json-404` and only treats Nest's `Cannot POST /path`
as absence.

P3 asked for segment-aware prefix matching. Went one step further on the user's prompt for
a more general fix: routing now keys on the **first path segment** via a small map rather
than scanning prefixes at all. `wallets-export` is a different key, so the collision class
disappears instead of being guarded against — and the map reads 1:1 against Bound's own
mapping table, which is what a reviewer diffs it against. Unmatched segments still fall
through to `apiUrl` (that is what `/sodax/*` relies on), so an exhaustiveness test that
walks all 11 endpoints was added to stop a newly added call routing silently.

Method note: three of the five findings were things this session had the evidence for and
had not connected — the audit had already surfaced the malformedness-vs-presence
distinction. Recording a finding is not the same as propagating it through the claims that
depend on it.

**Routing reshaped again, on the user's question "why not separate the API per concern
instead of checking HOST_BY_SEGMENT?"** The answer is that they were right. A path→host map
is a derivation — a second source of truth to keep in sync — while declaring the host at the
call site is a statement of fact. `request()` now takes a required `RadfiHost` first
parameter.

What that buys over the segment map: an unrouted call **fails to compile** rather than
falling through to `apiUrl` silently (the map's one irreducible hole, since `/sodax/*` relies
on that fall-through and it therefore cannot be made fail-closed); the `/wallets-export`
collision class and the query-string parsing edge both stop existing; and the standing
`/wallets/balance` landmine dissolves, because a refactor routing it through `request()` must
name a host and there is no `'ums'` member.

Cost is eleven call sites gaining one argument. `request()` is private with no caller outside
the class, so no public API moves. Compile-time enforcement also removes the exhaustiveness
test the map version needed — less code and a stronger guarantee, which is the tell that this
was the right shape.

**Branching removed on the user's push for something explicit and maintainable.** The
resolve-once version still carried `api === BOUND_API_HOST ? companions : {auth: api, …}`,
which reads as cleverness: you have to reason about *why* a URL is compared to a constant.

Replaced with a lookup table keyed by api host plus a three-step `??` chain — explicit
config, else the registered companion, else the api host itself. Host selection has no `if`,
no `switch`, no ternary. Every property the design needs now falls out of that ordering
instead of a rule someone has to remember, and maintenance became a data edit: Bound moving
`/transactions/*` again is one string, and a future signet host set is one new row that
needs no change to `RadfiProvider`.

Follow-up review tightened that shape into the artifacts: stale "prefix routing" wording
was removed, the broken Design code fence was fixed, and Step 0's fallback rule now requires
the `[SVC]` probe rows to prove the same family is present before deleting a companion key.
The host-routing implementation remains table lookup plus `??`; Step 0 changes data, not
code.

One type detail had to follow from that release-gate rule: `BOUND_COMPANION_HOSTS` cannot be
typed as requiring both companion keys if Step 0 may withhold exactly one. The plan now uses
optional `auth` / `transactions` keys under a `BoundCompanionHosts` type.
