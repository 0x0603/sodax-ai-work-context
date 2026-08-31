---
type: issue
repo: sodax-sdks
github: 401
status: Active
tags: [demo, swaps, solver, config, settings]
updated: 2026-08-25
related_decisions: []
---

# GH-401 Demo Sodax Settings Modal

- Source: https://github.com/icon-project/sodax-sdks/issues/401
- Started: 2026-08-25
- Related PR: https://github.com/icon-project/sodax-sdks/pull/402

## Problem

Original bug (issue as filed): on the demo's Staging tab, quotes come from the staging solver
but the SDK's backend 2-step submit flow (`swaps.useBackendSubmitTx`, default on) hands the
intent tx to the production swaps-api, so the staging solver never sees the intent and the
order card's staging `/status` polls answer NOT_FOUND until the poll cap. Fixed on PR #402 by
opting out on Staging (`swaps: { useBackendSubmitTx: false }` in `providers.tsx`).

## Expanded scope (Robi, 2026-08-25, via chat — appended to the issue body)

Add configuration UI (checkboxes / options / dropdowns) for the main Sodax config options in
the demo. When the config changes, re-create the Sodax instance in the provider. Start with
the swaps submit-tx toggle (`SwapsOptions.useBackendSubmitTx`); a "Sodax Settings" modal
(top-right button) shows current main settings with the option to change them. Capture what
backend/solver devs need: submit-tx toggle, API and solver settings. Focus v1 on core swaps +
solver + API settings. Per user: no new issue — expand gh-401 and continue on PR #402.
