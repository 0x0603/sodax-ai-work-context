---
type: outcome
repo: sodax-frontend
github: 1374
status: Closed (completed) 2026-10-06 — done upstream by gosiast's PRs; closed with a comment
updated: 2026-10-06
---

# Outcome

> **2026-10-06 — closed as completed** ([comment](https://github.com/icon-project/sodax-frontend/issues/1374#issuecomment-6009223074)). Re-verified first against live
> GitHub and `origin/main` `6623d817`. gosiast landed the substance in PRs 1904 (axios pin off
> 1.13.2, now 1.20.0), 1906 and 1923. The root `pnpm.overrides` has 23 entries, including h3,
> lodash 4.18.1, protobufjs 7.6.6, ws@7/@8 and yaml@2, and the lockfile resolves undici 6.28.1.
> The ticket's drift guard is covered more strongly by PR 1893: blocking OSV-Scanner and
> `pnpm audit` gates, with baselines in `osv-scanner.toml` and
> `.github/dependency-allowlist.json` (reviewBy 2026-12-22). Dependabot went from 116 open to 7
> open, all baselined. The comment was cut to two lines at the user's request, to read less like
> AI text. It flags only the toml leftover for gosiast: the lockfile now has only `toml@4.3.0`, but
> the two toml GHSAs are still in both baselines. Not flagged: the allowlist `_comment` still says
> "tracked by #1373", which is closed. Epic #1365 now has no open children; it is gosiast's to
> close.

- PR: none
- Commits: none
- Tests: n/a

## Summary

Triaged, not implemented. The sequencing gate is satisfied (the Next.js bump merged
2026-06-09), so this is unblocked — but the package list in the ticket has decayed badly, and
the single highest-value change is not a new override at all: it is **raising the existing
`axios: "1.13.2"` pin**, which is currently holding axios below every advisory floor and
accounts for 29 of the 116 open alerts.

Deliberately not committed unattended: it regenerates the lockfile under the wallet stack, the
ticket itself requires wallet-flow testing before merge, and the repo has no test suite to
catch a regression.

## What Changed

Nothing in the repo. The re-derived override set and the guard design are in `process.md` and
`plan.md`.

## Follow-ups

- Raise the axios pin — the one-line change with the largest effect.
- Drop kysely, qs and minimatch from the list (zero open alerts).
- Add protobufjs, which carries the critical (GHSA-xq3m-2v4x-88gg) and is missing from the ticket.
- Treat the 8 `next` alerts as a version bump, not an override — Dependabot PR #1642 is open.
- Write `scripts/check-dependency-floors.mjs` and wire it into CI **in the same PR as the bumps**.

## Draft comment for the issue — never posted (2026-08-12; superseded by the closing comment above)

> Two things worth recording before anyone starts this.
>
> **The sequencing hold is over** — #1372 (Next.js → ^15.5.18) merged 2026-06-09 via #1388,
> two months ago.
>
> **The biggest item here is the override we already have, not one we're missing.** Root
> `package.json` pins `axios: "1.13.2"` from #1042. Every open axios advisory needs ≥1.18.0,
> so that pin is what's currently holding axios vulnerable — 29 of 116 open alerts. Raising it
> is the single highest-value line in this ticket.
>
> The rest of the list has moved too: kysely, qs and minimatch now have **zero** open alerts
> (kysely cleared by the better-auth bump in #1647), picomatch/yaml/js-yaml are
> development-scope only, and **protobufjs isn't on the list at all** despite holding 11 alerts
> including the critical. Current shape is 116 open — 2 critical, 51 high, 59 medium, 4 low —
> dominated by axios 29 / undici 12 / protobufjs 11 / next 8. The `next` ones are cleared by a
> bump (#1642 is open), not by an override.
>
> Also: `lodash@4.18.0` is real and published (latest is 4.18.1), so that override is
> satisfiable — it's just the only minor-version bump in the set, so it wants a real smoke test.
