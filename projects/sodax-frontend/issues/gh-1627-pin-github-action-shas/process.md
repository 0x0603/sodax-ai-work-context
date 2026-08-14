---
type: process
repo: sodax-frontend
github: 1627
updated: 2026-08-14
---

# Process

## Log

- **2026-08-12** — Implemented on `chore/1627-pin-action-shas` (local commit `791acc31`,
  not pushed). 11 refs pinned, 5 files, 11 insertions / 11 deletions.
- **2026-08-14** — Audited the branch before pushing. Found one defect: the
  `anthropics/claude-code-action` pin was already stale when it was written (below).
  Re-pinned to `e63208cb` (v1.0.192), amended the commit message to stop claiming the
  change was behaviour-neutral "today", pushed, opened PR #1684.

## Findings

### The ticket's arithmetic was stale; its conclusion was not

The ticket counted, at `main @ 5ec89aa8`: 16 `uses:` total, `security.yml` holding 5,
leaving 11. On `origin/main @ 9db18283` today the real numbers are:

- **20 `uses:` sites across 6 workflow files.**
- **`security.yml` holds 9** of them, not 5 — PR #1608 landed (`07fb7148`) and grew it
  with a `pnpm audit` job.
- **Zero of the 20 were SHA-pinned.** A `@[0-9a-f]{40}` regex over `.github/workflows/**`
  matched nothing, which also means **PR #1565 has not merged** — its `security.yml`
  rewrite is still open.

20 − 9 = **11 outside `security.yml`**. The ticket's headline number is still exactly
right, by coincidence rather than by its arithmetic.

### `.github/dependabot.yml` now exists on main

The ticket's last checkbox (`Enable Dependabot's github-actions ecosystem`) is marked done
with the note "⚠️ PR #1608 is still open … this ticket's pins go stale until #1608 merges."
That is no longer true: #1608 merged, and the config carries a `github-actions` block
(directory `/`, weekly Monday, limit 5, `cooldown.default-days: 14`) whose own comment
acknowledges the unpinned state it was added to cover.

Consequence: the ticket's reservation about freezing `anthropics/claude-code-action` is
resolved — Dependabot will bump it. So it gets pinned like everything else (D2).

### `actions/checkout@34e11487` is v4.3.1, not the v4 tip

Worth writing down because the SHA looks alarming at first read — `gh api
repos/actions/checkout/commits/34e114876b…` returns a commit whose subject is
*"Cleanup actions/checkout@v6 auth style (#2305)"*, which reads like a v6-branch commit.

It is not. Checking the tag list:

| tag | sha |
| --- | --- |
| `v4.4.0` / `v4` | `11d5960a326750d5838078e36cf38b85af677262` |
| `v4.3.1` | `34e114876b0b11c390a56381ad16ebd13914f8d5` |

and `compare/34e11487...11d5960a` → `status: ahead, ahead_by: 2, behind_by: 0`. So the
ticket's SHA is a legitimate v4 pin, just **two commits behind** what `@v4` resolves to.
That is what drove D1 — see `plan.md`.

### The pins

Each verified to be what its mutable tag points at today, so the change is behaviour-neutral.

| ref | SHA | comment |
| --- | --- | --- |
| `actions/checkout@v4` | `11d5960a326750d5838078e36cf38b85af677262` | `# v4.4.0` |
| `pnpm/action-setup@v4` | `b906affcce14559ad1aafd4ab0e942779e9f58b1` | `# v4.3.0` |
| `actions/setup-node@v4` | `49933ea5288caeca8642d1e84afbd3f7d6820020` | `# v4.4.0` |
| `actions/setup-python@v5` | `a26af69be951a213d495a4c3e4e4022e16d87065` | `# v5.6.0` |
| `actions/github-script@v7` | `f28e40c7f34bde8b3046d885e986cb6290c5673b` | `# v7.1.0` |
| `amannn/action-semantic-pull-request@v5.1.0` | `b6bca70dcd3e56e896605356ce09b76f7e1e0d39` | `# v5.1.0` |
| `anthropics/claude-code-action@v1` | `e63208cb983318a44e3f945e959ef894b707dcfa` | `# v1.0.192` |

Sites: `ci.yml:23,27,32` · `claude.yml:33,37,42,52` · `lint-pr.yaml:14` ·
`news-gist.yml:29,32` · `request-code-review.yml:16`.

The trailing comment carries the **precise release** (`# v4.4.0`) rather than the major
(`# v4`), so a reader can tell at a glance whether a pin is behind its tag.

### Note on `docs/security-practices.md`

§"Action Setup Version Consistency" requires all workflows to pin the *same version* of a
shared action and to update them together. `security.yml` keeps `@v4` tags while the five
target files carry v4-lineage SHAs — the **version** is still consistent (v4 everywhere),
so the rule holds. Worth restating in the PR body so a reviewer does not read it as a
violation.

### The `claude-code-action` pin was stale before it was committed

The one real defect in the 2026-08-12 work, caught on re-audit. `5ef2e550` is v1.0.190, tagged
2026-08-10T23:16Z. v1.0.191 was tagged 2026-08-11T20:03Z — roughly **seven hours before** commit
`791acc31` was authored (2026-08-12T03:17Z). So the commit message's "each SHA is what its tag
resolves to today, so the pin is behaviour-neutral" was never true for that line, and by
2026-08-14 `@v1` had reached v1.0.192, `ahead_by: 7`.

Root cause is cadence, not carelessness: the action ships ~1 release every 1.2 days, so the tag
moves faster than a resolve-then-commit cycle. **Lesson for any future pinning work — re-resolve
fast-moving actions immediately before committing, not at the start of the session**, and scope
the behaviour-neutrality claim to "at authoring time".

### Dependabot does bump SHA pins — verified empirically, not from docs

The whole justification for pinning a fast-moving action is that Dependabot un-freezes it. That
was worth proving rather than assuming. Real PRs, found via
`gh search prs "claude-code-action" --author app/dependabot`:

- `mfozmen/mopsos#109` — bumps `claude-code-action` from `c96dd0a8…` to `be7b93b1…` (SHA → SHA).
- `DriverDigital/workflows#36` — `1.0.183` → `1.0.189`.
- ~10 repos — `1` → `1.0.183`, i.e. it upgrades the floating major tag to a concrete release.

That last group also kills a plausible-sounding worry: `releases/latest` for this action returns
the moving tag `v1`, not `v1.0.192`, so it looked like Dependabot might see "already on v1" and
open nothing. It does not — it resolves to the concrete semver.

### The real staleness risk is the PR queue, not the mechanism

`.github/dependabot.yml`'s `github-actions` block has `open-pull-requests-limit: 5` and — unlike
the `npm` block right above it — **no `groups:`**, so every action competes for its own slot. On
2026-08-14 all 5 slots were held by #1637–#1641, open since 2026-08-06 and unreviewed. Evidence
this is genuinely starving updates: `actions/setup-node` sits on `@v4` with v7 released and has
no PR, and no `dependabot/github_actions` PR has ever been closed in this repo (so the
"Dependabot won't recreate a human-closed PR" explanation is ruled out).

Fix is three lines, but it edits `dependabot.yml` and so is out of scope here — raised in the
PR #1684 thread instead:

```yaml
    groups:
      github-actions:
        patterns: ["*"]
```

### `uses:` cannot be de-duplicated into a variable

Asked whether the repeated SHA (checkout appears at 6 sites) should live in one constant. It
cannot: GitHub docs state **"You cannot use contexts or expressions in this keyword."** `uses:`
is resolved before any expression context exists. A composite action could absorb
`pnpm/action-setup` + `setup-node`, but not `actions/checkout` (the repo must already be checked
out for a local composite action to be readable). Not worth doing anyway — Dependabot rewrites
every occurrence of an action in a single PR, so the duplication costs nothing to maintain, and
a SHA visible at each call site is what reviewers and OpenSSF Scorecard actually read.

## Changes During Work

Nothing beyond the ticket's scope. `security.yml` verified byte-identical to `origin/main`
after the edit.
