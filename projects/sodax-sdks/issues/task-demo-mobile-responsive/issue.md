---
type: issue
repo: sodax-sdks
github: 
status: Active
tags: [demo, responsive, mobile, tailwind, ui]
updated: 2026-09-30
related_decisions: []
---

# Demo Mobile Responsive

- Source: user request (no GitHub issue) — "apps/demo chưa làm responsive cho
  mobile; kiểm tra chi tiết, lên plan; UI only, đừng break logic".
- Started: 2026-09-30
- Related PR:

## Problem

`sodax-sdks/apps/demo` was built desktop-first. On a phone the header overflows,
tall dialogs cannot scroll, long hashes/addresses/errors push the page sideways,
and input+button rows, button groups and tables overflow.

## Context

- App: Vite + React 19 + Tailwind 4.3 + shadcn/Radix primitives; `cn()` is
  tailwind-merge 2.6.
- Audit of every UI file on `origin/main` at 360–390px: see `plan.md` (Context and
  Appendix).

## Acceptance Criteria

- Every route usable at 360–430px: no page-level horizontal scroll, every dialog
  scrollable, header fits.
- Desktop (≥1280px) renders as before (pixel diff against a pre-edit baseline).
- UI only: no change to hooks, state, handlers, effects, conditionals or SDK props.
- User choices (2026-09-30): compact header labels on phones; money-market tables
  scroll sideways (no card layout); ⓘ tooltips open on tap.

## Related

- Knowledge:
- Decisions:
