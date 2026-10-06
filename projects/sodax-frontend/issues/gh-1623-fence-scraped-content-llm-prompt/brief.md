---
type: brief
repo: sodax-frontend
github: 1623
status: Closed — PR 1935 merged 2026-10-05
next: Manual only: sentinel re-test (1 non-protocol URL + 2 protocols) before promotion
updated: 2026-10-06
---

# Fence scraped content in the analyze prompt · brief

## State in five lines

PR icon-project/sodax-frontend#1935 **merged 2026-10-05** by 0x0603 after gosiast's approval
(merge commit `dfab081c`); #1623 auto-closed.
Net diff is one file, `apps/web/app/api/partners/analyze/route.ts`, +26/−4. The 2026-08-12
commit `322b53b6` was merged with `origin/main` (`77dc1683`) and then reworked in
`0d3d1d62`. lint, checkTs, test (51/51) and build are green. The live sentinel re-test has
NOT been run.

## Next action

Code is done. One manual check is still owed before promotion, and the PR body names it:
someone with credentials runs one known non-protocol URL and two known protocol URLs, and
confirms the non-protocol reply still starts with `NOT_A_PROTOCOL:`. A preamble there would send
non-protocol URLs to Notion as leads.

## Settled — do not re-litigate

- The clause is appended to the **system** prompt in code, after `withNetworkCount`. It is
  not in the user prompt and not in the static prompt files. That covers both the Notion
  and the fallback paths, so the Notion page needs no manual edit.
- Marker strip is the loose regex `/SODAX\W*content\W*(?:begins|ends)/gi`, not an
  exact-string `replaceAll`, so near-miss markers (missing space, zero-width character)
  cannot close the fence.
- Same marker strings as `app/agent/md` and `app/llms-full.txt`
  (`docs/agent-readiness.md` §6). No new `<sodax-untrusted-data>` tag.

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Original ticket and the sentinel trap | `issue.md` | 0.7k |
| Why `signalsBlock` is attacker-controlled; the Notion prompt source | `process.md` | 1.1k |
| What shipped | `outcome.md` | 1k |

## Landmines

- On a merge from `main`, the pre-commit hook lint-stages every merged file and fails on
  existing Biome errors in `main` (`suppressions/unused`, `useExhaustiveDependencies`).
  The merge commit was made with `--no-verify` only after confirming the index differed
  from `origin/main` in the branch's own files alone.
