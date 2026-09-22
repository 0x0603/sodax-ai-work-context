---
type: brief
repo: sodax-frontend
github: 1869
status: Active
next: PR 1870 review
updated: 2026-09-18
---

# Swap Min Amount Message · brief

## State in five lines

PR icon-project/sodax-frontend#1870 open, single commit `61e1d31f` (amended +
force-pushed), closes #1869 (sub-issue of sodax-sdks#471). Final shape: error-only
detection, message on the line below the button; store and button identical to
main. Verified in browser. PR body and both issues match the code.

## Next action

Wait for review on PR 1870. After the next SDK bump, swap the local matcher for
the SDK export (`outcome.md` § Follow-ups).

## Settled — do not re-litigate

- Floor is $1, measured on the live solver (sdks task `process.md`).
- Match the message, not code `-1` alone (shared with every solver refusal).
- No price × amount check on the client (user): a floor change must not need code.
- Message goes on the line below the button, not on it (designer), styled like
  the timing line (clay-light, small top gap), second sentence bold (user).
- Message wording is the user's: "Swap value must be at least $1. Increase to continue".

## Which file answers what

| Question | File | ~tok |
| -------- | ---- | ---: |
| Why two layers, what each does | `plan.md` | 0.5k |
| Error shape on this SDK version | `issue.md` | 0.4k |
| Pre-existing checkTs / Biome noise | `process.md` | 0.3k |
| Files changed, follow-up | `outcome.md` | 0.3k |

## Landmines

- `apps/web` `checkTs` is red on main already; judge by whether your files appear.
