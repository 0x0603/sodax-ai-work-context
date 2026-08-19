---
type: brief
repo: sodax-backend
github: 1024
status: Blocked — waiting on Fez
next: post the research + decision comment on #1024
updated: 2026-08-19
---

# GH-1024 — Bound Auth email provider · brief

**Read this file only.** Then open exactly one row from the map below. The full
dossier is ~295 KB / ~78k tokens; almost no question needs more than two files.

## State in five lines

SODAX builds its own email-wallet auth plane — email+password **and** passkey,
encrypted keystore, our servers — using `lydialabs/radfi-be` as a blueprint to
*redo*, explicitly not to integrate. Fez made that call 2026-08-18
([[0001-own-the-email-wallet-auth-plane]]). Research is complete and comes from
**source, not docs** — the two disagree in six places. **No code exists yet:**
zero commits in `sodax-backend`, zero comments on the issue since 2026-07-27.

## Blocked on

1. **ADR 0002 undecided** — where key material executes. The npm-package model has
   no trust boundary once third-party dapps consume the SDK. → **Do not create the
   three SDK packages until this is decided.** Decide `rp.id` in the same
   conversation; it is unchangeable per credential afterwards.
2. **Q14 — emailless passkey login vs per-credential PRF salt.** The two are in
   direct tension; three real resolutions written up in `plan.md`. Security-vs-UX,
   needs Fez, gates the same spike as ADR 0002.
3. **Four scope questions for Fez** (`plan.md` §Open questions): what "backup"
   means (highest stakes — it decides whether we become a custodian),
   external-wallet auth / 2FA / multi-device in scope?, chains for v1, and
   confirming #1069 is out of scope.
4. **PRF spike not run.** `@better-auth/passkey` is installed in neither repo. It
   gates the entire passkey path; ½ day.

## Next action

`plan.md` §Order step 0: post the research + decision comment on #1024 —
`docs/TEAM_CONVENTIONS.md` requires the plan on the issue before implementing.
**A ready draft sits in `outcome.md` §Draft comment.** Then the cross-repo
issue structure (backend + sdks + frontend), then the spike.

## Settled — do not re-litigate

- Build in-house, not integrate Bound (ADR 0001).
- Email+password **and** passkey, both first-class (`plan.md` §Scope decision).
- New app `apps/auth-api`, **not** `apps/api-auth` — PR #1048 rules it out by name.
- Better Auth over from-scratch; KDF split instead of SRP.
- This does **not** close frontend #1069 — different addresses, different problem.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Why we build rather than adopt | [[0001-own-the-email-wallet-auth-plane]] | 2.3k |
| Where key material may execute; `rp.id` | [[0002-key-custody-boundary-for-third-party-dapps]] | 4.2k |
| Decisions, open questions, risks, order | `plan.md` | 6.7k |
| How Bound's **server** works | [[bound-auth-mechanism]] | 8.4k |
| Client crypto: PRF, KDF, envelope, paths | [[bound-client-crypto]] | 6.8k |
| Plain register→login→sign walkthrough | [[bound-email-password-flow]] | 3.1k |
| Keystore vs MPC; why ≠ #1069 | [[encrypted-keystore-vs-mpc-email-wallets]] | 2.0k |
| SDK packaging, UI flow, `apps/demo` | [[plan-sdk-integration]] | 7.8k |
| Rate limit, CORS, enumeration, replay | [[plan-auth-api-security]] | 5.8k |
| Backup, restore, "can it be lost?" | [[plan-auth-api-durability]] | 5.1k |
| Copy-pasteable scaffold for the new app | [[plan-auth-api-scaffold]] | 5.6k |
| Code standards S1–S9 for this build | [[plan-engineering-standards]] | 1.0k |
| The raw ticket + acceptance criteria | `issue.md` | 0.9k |
| What shipped; draft issue comment | `outcome.md` | 2.1k |
| Session history | `process.md` (index) → `process/NN-*.md` | 1.2k + ~2k each |

## Landmines

- **Notes are not evidence.** This thread produced wrong claims twice from its own
  notes; both times reading source fixed it (sessions 06, 07). Verify against the
  side the claim is about.
- `apps/bridge-api` is the scaffold template but is **not on `development`** — it
  lives only on `origin/feat/bridge-api`.
- Session 01 predates two correction passes. Read 02/03 before trusting it.
