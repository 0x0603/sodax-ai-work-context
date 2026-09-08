---
type: brief
repo: sodax-sdks
github: 425
status: Active
next: Review plan.md (Codex), then open PR 1 on sodax-sdks — nothing is blocked on Bound any more
updated: 2026-09-08
---

# GH-425 Bound Domain Split Svc Auth · brief

**The entry point. An agent resuming this task reads this file and nothing else,
then opens exactly one row from the map below.**

## State in five lines

Bound is splitting `api.bound.exchange` into `svc.bound.exchange` and
`auth.bound.exchange`. A recon + adversarial-audit pass on 2026-09-08 **unblocked the
whole task**: Q1–Q4 are answered from evidence, and the design is correct under every
remaining unknown. A full implementation plan is written and ready for review. **No code
written yet.**

| Ticket | Scope |
| --- | --- |
| sodax-sdks#425 | parent / coordination |
| sodax-sdks#426 | SDK: `authUrl` field + per-prefix routing (PR 1) |
| sodax-backend#1215 | swaps-api + bridge-api `RADFI_AUTH_URL` (PR 2) |

## The one thing to know

**`auth.bound.exchange` is a different backend, not a different name for the same one.**
Pinning an ALB IP and varying only the Host header, `api` and `svc` both return
`radfi-be`'s NestJS 404 for `/.well-known/jwks.json`; `auth` returns a live ES256 key set
that `radfi-be` cannot serve. So:

- moving `apiUrl` to `svc` is a **rename** — safe, no behaviour change;
- pointing `/auth/*` at the auth host is a **migration** onto an unverified service, and
  the plan deliberately does **not** do it yet.

Hence: ship the `authUrl` mechanism, flip only `apiUrl` in the packaged default, leave
`authUrl` unset, and make the real cutover an env-var flip on canary (`RADFI_AUTH_URL`)
that rolls back instantly.

## No longer blocked

Q1–Q4 are answered — see `plan.md` §"What recon settled" and `plan-evidence.md` §1–3.
Still worth asking Bound, but not blocking:

1. Does `auth.bound.exchange` serve BIP322 `/api/auth/*` and `/api/wallets/*` **today**,
   or only after a later cutover? (Decides when Phase 2 can run.)
2. Are partner credentials/allowlists identical across `svc` and `auth`?
3. The deprecation date — Bound is waiting on our timeline first.

## Next action

Get `plan.md` reviewed (Codex), then open PR 1 on sodax-sdks off `main`. PR 2 waits for
the SDK release, by which time #1097 will have merged.

## Settled — do not re-litigate

- **Two PRs total**, one per repo. Do not stack PR 2 on #1097's branch.
- **SDK ships first.** Both backend apps consume `@sodax/sdk` via the npm catalog, so
  `authUrl` must be published before the backend can reference it.
- **`authUrl` is optional and absent from the packaged default.** This is not an
  oversight — it is what removes the deepMerge straddle hazard by construction.
- **Keep signing every host**, because it is today's behaviour, not for a rate-limit
  bypass (that rationale was wrong; see `plan.md` §Q4).
- **intents-whitelabel is out of scope** — it is two SDK minors behind, so it is real
  work, not the one-line env change #425 claims.
- Parent lives in sodax-sdks; each PR closes its own sub-issue, never the parent.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| The design, the steps, the risks — the reviewable artifact | `plan.md` | 8k |
| Why any claim in the plan is true; commands to re-run | `plan-evidence.md` | 4.7k |
| Bound's original mapping + the five questions as filed | GitHub #425 (body) | — |
| What the SDK change touches, as originally scoped | GitHub #426 (body) | — |
| What the backend change touches, as originally scoped | sodax-backend#1215 (body) | — |
| Prior Bound endpoint inventory | `../gh-330-bound-exchange-endpoint-inventory/outcome.md` | 0.8k |
| Session log for the 2026-09-08 recon | `process.md` | 2k |

**The ticket bodies are now partly wrong** — `plan.md` §Corrections lists seven
statements in them that verification contradicted. Prefer `plan.md`.

## Landmines

- **Verify against the default branch, never the working tree.** `sodax-backend` is
  checked out on PR #1097's branch, where bridge-api has Radfi config it does **not**
  have on `development`. `git diff main...HEAD` also hides commits added to `main` after
  the branch point — that is how an earlier pass wrongly concluded `.changeset/` was
  gone.
- **`radfiEndpointOverride`'s `field` param is typed `'apiUrl' | 'umsUrl'`** — widen the
  union or the backend will not compile.
- **`IsRadfiConfig` uses `forbidNonWhitelisted: true`** — emitting `authUrl` without a
  matching DTO field aborts the boot.
- **`apps/node/bitcoin-radfi.ts` and `btc.ts` bypass `RadfiProvider`** with raw `fetch`
  and hardcoded signet/staging hosts. Flipping the packaged default does not move them,
  and no split hosts exist for those environments. Leave them alone.
- **`common.ts` `radfiApiUrl`/`radfiUmsUrl` is read by nobody.** #426 item 4 says
  otherwise. Skip it.
- **Never hand-edit `CONFIG_VERSION`** and do not write a changeset — the release script
  owns versions, and the one `.changeset/` file on `main` is an orphan.
- **A misrouted host returns the ALB's HTML 403**, which surfaces as `RadfiApiError:
  … non-JSON response (HTTP 403)` and matches *neither* branch of the backend's
  `radfiFailureKind`. Observability gap; decide before Phase 2.
