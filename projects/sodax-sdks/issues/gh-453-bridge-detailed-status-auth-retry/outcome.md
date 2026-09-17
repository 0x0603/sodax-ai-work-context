---
type: outcome
repo: sodax-sdks
github: 453
status: Not started
updated: 2026-09-17
---

# Outcome

- PR: none yet
- Commits: none — no code written as of 2026-09-17
- Tests: n/a

## Summary

Scoping only. The issue's three leftovers were confirmed real, sized, and traced to a single
repo: **`sodax-sdks`** (packages `sdk`, `dapp-kit`, `skills`, plus `packages/sdk/docs`). No
`sodax-backend` change and no `sodax-frontend` change is required — see `process.md`
§ Scoping evidence for the per-endpoint proof.

## What Changed

Nothing in any `icon-project` repo. Only this dossier.

## Follow-ups

- `packages/dapp-kit/src/hooks/backend/` has ~12 hooks with the same bare `retry: 3` on the same
  `x-api-key` surface (`useBackendOrderbook.ts:38`, `useBackendIntentByTxHash.ts:38`,
  `useBackendUserIntents.ts:40`, …). Out of scope for #453 — raise in the PR thread, do not open
  a new issue.
- The e2e bridge pin stays blocked on a real `{ tx, relayData }` fixture. If #451 (bridge manual
  test) produces a funded bridge run, harvest the fixture there and close that bullet.
- `BridgeService` reads `this.config.relay.relayerApiEndpoint` inline (`BridgeService.ts:581`)
  while every other service holds a `relayerApiEndpoint` field. `sodax-backend`'s
  `relay-poll.ts:47` works around the gap by borrowing `sodax.swaps.relayerApiEndpoint`. Worth a
  one-line tidy inside this PR.
- A bridge relay-proxy route (`POST /bridge/intents/packet`, mirroring swaps'
  `swaps.controller.ts:421`) would be the only version of this task needing backend work. Not
  asked for, not planned — noted so it is not rediscovered as a gap.
</content>
