---
type: draft
repo: sodax-sdks
github: 
updated: 2026-10-13
---

# Draft questions for gcranju (NOT posted)

Post only if the user says so. Source: `/code-review` triage in `process.md`.

---

A few things I ran into while testing the Tron flows, outside the review comment:

1. Swap intents (`SonicSpokeService` / `EvmSolverService`) and `setAutoSwapPreferences` still encode a Tron destination with `encodeAddress`, the 20-byte identity, but `encodeRecipient` says the release reads a 32-byte padded word. Does the hub or solver pad `intent.dstAddress` for MPC chains, or would a staging swap to Tron mis-deliver?

2. `settle` picks the MPC path from the source chain only, so a Sonic→Tron withdraw or borrow goes to the intent relay and, as far as I can tell, times out even though the MPC relay releases it. The reverse too: does a Tron-sourced borrow delivered to Sonic or another spoke ever reach `released`?

3. Cancel, detailed status and the default backend submit-tx path still assume the intent relay for a Tron source. Is that deliberately out of scope for this PR?
