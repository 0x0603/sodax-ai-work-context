---
type: process
repo: sodax-frontend
github: 1627
updated: 2026-08-12
---

# Process

## Log

- **2026-08-12** — Implemented on `chore/1627-pin-action-shas` (local commit `791acc31`,
  not pushed). 11 refs pinned, 5 files, 11 insertions / 11 deletions.

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
| `anthropics/claude-code-action@v1` | `5ef2e550a465a721f4f45e4a7d3c340c873e1dcc` | `# v1.0.190` |

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

## Changes During Work

Nothing beyond the ticket's scope. `security.yml` verified byte-identical to `origin/main`
after the edit.
